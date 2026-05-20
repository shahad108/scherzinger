import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { renderHook, waitFor } from '@testing-library/react';
import type { ReactNode } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import {
  useCreateOverride,
  useForecastOverrides,
} from '../data/api/useForecastOverrides';

const fetchMock = vi.fn();

beforeEach(() => {
  global.fetch = fetchMock as unknown as typeof fetch;
  fetchMock.mockReset();
});

function wrapper({ children }: { children: ReactNode }) {
  const qc = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return <QueryClientProvider client={qc}>{children}</QueryClientProvider>;
}

describe('useForecastOverrides', () => {
  it('lists overrides', async () => {
    fetchMock.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ items: [{ id: 'a', month: '2026-08' }] }),
    });
    const { result } = renderHook(() => useForecastOverrides(), { wrapper });
    await waitFor(() => expect(result.current.data).toBeDefined());
    expect(result.current.data?.items[0].id).toBe('a');
  });

  it('creates override', async () => {
    fetchMock.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ id: 'new', month: '2026-08' }),
    });
    const { result } = renderHook(() => useCreateOverride(), { wrapper });
    const out = await result.current.mutateAsync({
      month: '2026-08',
      cluster: null,
      mode: 'revenue',
      actual: 650000,
      modelP50: 612000,
      source: 'manual',
      confidence: 'medium',
      reason: 'Q3 renegotiation closed early',
    });
    expect(out.id).toBe('new');
    expect(fetchMock).toHaveBeenCalledWith(
      expect.stringContaining('/api/v1/forecast/overrides'),
      expect.objectContaining({ method: 'POST' }),
    );
  });
});
