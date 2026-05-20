// Pricing Studio v3 / Phase 10 — usePricingLineage hook tests.
//
// Verifies that the hook hits the real GET /lineage/{ref_id} endpoint,
// maps the wire response into LineageSourceRow shape, gracefully
// degrades on 404, and caches with the expected query key.

import { renderHook, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactNode } from 'react';
import { usePricingLineage, lineageRefQueryKey } from '../usePricingLineage';
import type { LineageRefBlock } from '@/types/studio';

const apiFetchMock = vi.fn();

vi.mock('@/lib/api/client', async () => {
  const actual = await vi.importActual<typeof import('@/lib/api/client')>(
    '@/lib/api/client',
  );
  return {
    ...actual,
    apiFetch: (...args: unknown[]) => apiFetchMock(...args),
  };
});

const REF: LineageRefBlock = {
  id: 'a1d4e3f0-0000-4000-8000-000000000001',
  source_kind: 'elasticity_model',
  source_id: 'model:logit:a1d4e3f0',
  sql: null,
  model: 'logit-v1.2',
  computed_at: '2026-05-15T10:00:00Z',
  computed_by: 'recommendation-composer',
};

function wireResp(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    id: REF.id,
    source_kind: REF.source_kind,
    source_id: REF.source_id,
    sql: null,
    model: REF.model,
    computed_at: REF.computed_at,
    computed_by: REF.computed_by,
    preview: [
      { field: 'source_kind', value: 'elasticity_model' },
      { field: 'invoice_ledger', value: 'INV-2026-Q2-sample' },
      { field: 'competitor_feed', value: 'cf-sample-7' },
    ],
    ...overrides,
  };
}

function wrap(qc: QueryClient) {
  return ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={qc}>{children}</QueryClientProvider>
  );
}

describe('usePricingLineage', () => {
  let qc: QueryClient;
  beforeEach(() => {
    apiFetchMock.mockReset();
    qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  });

  it('fetches /lineage/{id} and maps the wire response into LineageSourceRow', async () => {
    apiFetchMock.mockResolvedValueOnce(wireResp());
    const { result } = renderHook(() => usePricingLineage(REF), {
      wrapper: wrap(qc),
    });
    await waitFor(() => expect(apiFetchMock).toHaveBeenCalled());
    expect(apiFetchMock).toHaveBeenCalledWith(`/lineage/${REF.id}`);
    await waitFor(() =>
      expect(result.current.sources.length).toBeGreaterThan(1),
    );
    // Primary row + preview-derived rows.
    const kinds = result.current.sources.map((s) => s.source_kind);
    expect(kinds[0]).toBe('elasticity_model');
    expect(kinds).toContain('invoice_ledger');
    expect(kinds).toContain('competitor_feed');
    expect(result.current.notFound).toBe(false);
  });

  it('returns notFound=true and an empty source list when the BFF returns 404', async () => {
    apiFetchMock.mockRejectedValueOnce(new Error(`API /lineage/${REF.id} → 404`));
    const { result } = renderHook(() => usePricingLineage(REF), {
      wrapper: wrap(qc),
    });
    await waitFor(() => expect(apiFetchMock).toHaveBeenCalled());
    await waitFor(() => expect(result.current.notFound).toBe(true));
    expect(result.current.sources).toEqual([]);
    expect(result.current.ref).not.toBeNull();
  });

  it('does not fire a query when ref is null', () => {
    const { result } = renderHook(() => usePricingLineage(null), {
      wrapper: wrap(qc),
    });
    expect(apiFetchMock).not.toHaveBeenCalled();
    expect(result.current.ref).toBeNull();
    expect(result.current.sources).toEqual([]);
  });

  it('keys the query on the ref id', () => {
    expect(lineageRefQueryKey(REF.id)).toEqual(['lineage-ref', REF.id]);
    expect(lineageRefQueryKey(null)).toEqual(['lineage-ref', null]);
  });
});
