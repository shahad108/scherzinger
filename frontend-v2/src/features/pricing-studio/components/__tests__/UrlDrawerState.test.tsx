// Pricing Studio v3 / Phase 11 — URL state for drawer-open contract.
//
// We exercise the integration the studio page wires up: a refresh with
// `?audit_open=1` must restore the AuditDrawer as open on mount. This is
// the minimal smoke for the URL ⇄ drawer contract — the same pattern
// also drives ?cost_outlook_open, ?compare_open, ?simulation_open, and
// ?lineage_ref.

import { render, screen } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import { MemoryRouter, useSearchParams } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

vi.mock('@/data/api/useAuditFeed', async () => {
  const actual = await vi.importActual<typeof import('@/data/api/useAuditFeed')>(
    '@/data/api/useAuditFeed',
  );
  return {
    ...actual,
    useAuditFeed: vi.fn(() => ({
      data: { pages: [{ rows: [], total: 0, lineage_ref: null, offset: 0 }] },
      isLoading: false,
      hasNextPage: false,
      isFetchingNextPage: false,
      fetchNextPage: vi.fn(),
    })),
  };
});

vi.mock('@/hooks/usePricingStream', () => ({
  usePricingStream: () => ({ lastEvent: null, isConnected: true, retry: () => {} }),
}));

class ROStub {
  observe() {}
  unobserve() {}
  disconnect() {}
}
// eslint-disable-next-line @typescript-eslint/no-explicit-any
(globalThis as any).ResizeObserver = (globalThis as any).ResizeObserver ?? ROStub;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
(globalThis as any).IntersectionObserver = (globalThis as any).IntersectionObserver ?? ROStub;

import { AuditDrawer } from '../AuditDrawer';
import { LineageDrawerProvider } from '@/features/pricing-studio/lineage/LineageDrawerContext';

// Tiny consumer that mirrors how the studio page derives drawer-open
// from `?audit_open=1`. We re-implement the one-liner here so the test
// remains isolated from the full PricingStudioPage tree.
function MockedStudio() {
  const [params, setParams] = useSearchParams();
  const auditOpen = params.get('audit_open') === '1';
  const setAuditOpen = (open: boolean) =>
    setParams(
      (prev) => {
        const next = new URLSearchParams(prev);
        if (open) next.set('audit_open', '1');
        else next.delete('audit_open');
        return next;
      },
      { replace: true },
    );
  return (
    <AuditDrawer
      open={auditOpen}
      onOpenChange={setAuditOpen}
      aid="200832-E"
      onScrollToProposalPanel={() => {}}
    />
  );
}

function wrap(initial: string) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <MemoryRouter initialEntries={[initial]}>
      <QueryClientProvider client={qc}>
        <LineageDrawerProvider>
          <MockedStudio />
        </LineageDrawerProvider>
      </QueryClientProvider>
    </MemoryRouter>,
  );
}

describe('URL drawer-open contract', () => {
  it('opens the AuditDrawer on mount when ?audit_open=1', () => {
    wrap('/studio?audit_open=1&aid=200832-E');
    expect(screen.getByTestId('audit-drawer')).toBeInTheDocument();
  });

  it('leaves the AuditDrawer closed when the URL omits ?audit_open', () => {
    wrap('/studio?aid=200832-E');
    expect(screen.queryByTestId('audit-drawer')).not.toBeInTheDocument();
  });
});
