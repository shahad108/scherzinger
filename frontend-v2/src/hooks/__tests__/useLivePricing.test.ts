// Phase 21 — useLivePricing invalidates the Studio cache on incoming SSE
// events. Uses a hand-rolled EventSource mock so the test is hermetic.

import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, renderHook, waitFor } from '@testing-library/react';
import { createElement, type ReactNode } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { useLivePricing } from '../useLivePricing';

// --- EventSource mock --------------------------------------------------------

interface MockEventSource {
  url: string;
  readyState: number;
  withCredentials: boolean;
  onopen: ((ev: Event) => void) | null;
  onmessage: ((ev: MessageEvent) => void) | null;
  onerror: ((ev: Event) => void) | null;
  close: () => void;
  __dispatch: (data: unknown) => void;
  __open: () => void;
}

let lastSource: MockEventSource | null = null;
const sources: MockEventSource[] = [];

class FakeEventSource implements MockEventSource {
  url: string;
  readyState = 0;
  withCredentials = false;
  onopen: ((ev: Event) => void) | null = null;
  onmessage: ((ev: MessageEvent) => void) | null = null;
  onerror: ((ev: Event) => void) | null = null;

  constructor(url: string, init?: EventSourceInit) {
    this.url = url;
    this.withCredentials = init?.withCredentials ?? false;
    lastSource = this;
    sources.push(this);
  }
  close = () => {
    this.readyState = 2;
  };
  __open = () => {
    this.readyState = 1;
    this.onopen?.(new Event('open'));
  };
  __dispatch = (data: unknown) => {
    this.onmessage?.(new MessageEvent('message', { data: JSON.stringify(data) }));
  };
}

beforeEach(() => {
  lastSource = null;
  sources.length = 0;
  (globalThis as unknown as { EventSource: typeof EventSource }).EventSource =
    FakeEventSource as unknown as typeof EventSource;
  // useStudio() fires an apiFetch — stub fetch so the query resolves.
  global.fetch = vi.fn().mockResolvedValue({
    ok: true,
    json: async () => ({
      header: { title: 'Studio' },
      filters: [],
      toggles: [],
      defaultAid: 'AID-1',
      skus: [{ aid: 'AID-1', shortHero: { title: 'A' } }],
      workbench: {
        hero: {
          eyebrow: '',
          title: '',
          sub: '',
          chips: [],
          meta: [],
          currentPrice: '',
          currentMargin: '',
          currentMarginTone: 'neutral',
          targetText: '',
        },
        options: [],
        optionsSub: '',
        fanout: { fanPrice: 0 },
        cost: {},
        history: {},
        decision: {},
        memo: {},
      },
      comparable: {},
      crossLinks: [],
      footerNote: '',
      appliedFilters: {
        tier: null,
        family: null,
        cluster: null,
        scenarioId: null,
      },
    }),
    headers: new Headers(),
  }) as unknown as typeof fetch;
});

afterEach(() => {
  vi.restoreAllMocks();
});

function wrapper({ children }: { children: ReactNode }) {
  const qc = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return createElement(QueryClientProvider, { client: qc }, children);
}

describe('useLivePricing', () => {
  it('opens a stream against the right URL and reports live state', async () => {
    const { result } = renderHook(() => useLivePricing({ aid: 'AID-1' }), {
      wrapper,
    });

    await waitFor(() => expect(lastSource).not.toBeNull());
    expect(lastSource!.url).toContain('/events/stream');
    expect(lastSource!.url).toContain('topic=pricing');
    expect(lastSource!.url).toContain('aid=AID-1');

    act(() => lastSource!.__open());
    await waitFor(() => expect(result.current.isLive).toBe(true));
  });

  it('invalidates the studio query and updates lastTickAt on incoming events', async () => {
    const { result } = renderHook(() => useLivePricing({ aid: 'AID-1' }), {
      wrapper,
    });
    await waitFor(() => expect(lastSource).not.toBeNull());
    act(() => lastSource!.__open());

    expect(result.current.lastTickAt).toBeNull();

    act(() =>
      lastSource!.__dispatch({
        topic: 'pricing.price_set',
        aid: 'AID-1',
        cluster: null,
        ts: 12345,
        payload: { new_price: '9.99' },
      }),
    );

    await waitFor(() => expect(result.current.lastTickAt).toBe(12345));
  });

  it('raises a soft toast on pricing.cost_moved for the open SKU', async () => {
    const { result } = renderHook(() => useLivePricing({ aid: 'AID-1' }), {
      wrapper,
    });
    await waitFor(() => expect(lastSource).not.toBeNull());
    act(() => lastSource!.__open());

    act(() =>
      lastSource!.__dispatch({
        topic: 'pricing.cost_moved',
        aid: 'AID-1',
        cluster: null,
        ts: 999,
        payload: { delta_pct: 3.2 },
      }),
    );

    await waitFor(() => expect(result.current.lastToast).not.toBeNull());
    expect(result.current.lastToast?.topic).toBe('pricing.cost_moved');
    expect(result.current.lastToast?.aid).toBe('AID-1');

    act(() => result.current.dismissToast());
    expect(result.current.lastToast).toBeNull();
  });

  it('exposes a retry() that reopens the stream', async () => {
    const { result } = renderHook(() => useLivePricing({ aid: 'AID-1' }), {
      wrapper,
    });
    await waitFor(() => expect(lastSource).not.toBeNull());
    const first = lastSource;

    act(() => result.current.retry());
    await waitFor(() => expect(sources.length).toBeGreaterThan(1));
    expect(lastSource).not.toBe(first);
  });

  it('invalidates every studio variant in the cache, not just the active aid', async () => {
    // Shared QueryClient so both hook instances see the same cache.
    const qc = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    });
    function sharedWrapper({ children }: { children: ReactNode }) {
      return createElement(QueryClientProvider, { client: qc }, children);
    }

    // Mount two hook instances against different studio variants.
    const hookA = renderHook(() => useLivePricing({ aid: 'AID-1' }), {
      wrapper: sharedWrapper,
    });
    const hookB = renderHook(() => useLivePricing({ aid: 'AID-2' }), {
      wrapper: sharedWrapper,
    });

    await waitFor(() => expect(hookA.result.current.data).toBeDefined());
    await waitFor(() => expect(hookB.result.current.data).toBeDefined());

    // Spy on invalidateQueries on the shared client.
    const spy = vi.spyOn(qc, 'invalidateQueries');

    await waitFor(() => expect(sources.length).toBeGreaterThanOrEqual(2));
    act(() => sources[0]!.__open());
    act(() =>
      sources[0]!.__dispatch({
        topic: 'pricing.price_set',
        aid: 'AID-1',
        cluster: null,
        ts: 555,
        payload: {},
      }),
    );

    await waitFor(() =>
      expect(spy).toHaveBeenCalledWith(
        expect.objectContaining({ queryKey: ['studio'] }),
      ),
    );

    spy.mockRestore();
    hookA.unmount();
    hookB.unmount();
  });
});
