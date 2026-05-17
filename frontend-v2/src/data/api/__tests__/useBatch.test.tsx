// Pricing Studio v3 / Phase 6 — useBatch hook contract.
//
// Asserts:
//   - useBatch is keyed on the batch_id (per-batch caches don't collide)
//   - useCreateBatch primes the per-batch cache via setQueryData
//   - useCommitBatch invalidates the affected batch's key (so the open
//     workbench refetches the now-committed batch)

import { renderHook, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactNode } from 'react';
import {
  useBatch,
  useCreateBatch,
  useCommitBatch,
  batchKey,
  type BatchEnvelope,
} from '../useBatch';

vi.mock('@/lib/api/client', async () => {
  const actual = await vi.importActual<typeof import('@/lib/api/client')>(
    '@/lib/api/client',
  );
  return {
    ...actual,
    apiFetch: vi.fn(async (path: string) => {
      // Return a per-id payload so test can verify keying.
      const m = path.match(/batches\/([^/?]+)/);
      const id = m ? decodeURIComponent(m[1]) : 'unknown';
      const payload: BatchEnvelope = {
        batch_id: id,
        status: 'preview',
        rule: {},
        scope_filter: {},
        items: [],
        approval_routing_summary: { auto_approve: 0, block: 0 },
        kpi_summary: {
          count: 0,
          total_revenue_impact: '0',
          total_margin_impact: '0',
          avg_win_prob_at_new: null,
        },
        created_at: null,
        committed_at: null,
        cancelled_at: null,
      };
      return payload;
    }),
    postJson: vi.fn(async (path: string) => {
      if (path === '/pricing/batches') {
        const env: BatchEnvelope = {
          batch_id: 'new-batch',
          status: 'preview',
          rule: { kind: 'floor_plus', margin_pp: '10' },
          scope_filter: {},
          items: [],
          approval_routing_summary: { auto_approve: 0, block: 0 },
          kpi_summary: {
            count: 0,
            total_revenue_impact: '0',
            total_margin_impact: '0',
            avg_win_prob_at_new: null,
          },
          created_at: null,
          committed_at: null,
          cancelled_at: null,
        };
        return env;
      }
      if (path.endsWith('/commit')) {
        return {
          batch_id: 'b-1',
          status: 'committed',
          dry_run: false,
          created_proposals: ['p-1'],
          routed_by_role: { manuel: 1 },
          total_revenue_impact: '10.00',
          locked_aids: [],
        };
      }
      return {};
    }),
  };
});

function wrap(qc: QueryClient) {
  return ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={qc}>{children}</QueryClientProvider>
  );
}

describe('useBatch — query keying', () => {
  let qc: QueryClient;
  beforeEach(() => {
    qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  });

  it('is keyed on the batch_id so per-batch caches do not collide', async () => {
    const { result: rA } = renderHook(() => useBatch('batch-A'), { wrapper: wrap(qc) });
    const { result: rB } = renderHook(() => useBatch('batch-B'), { wrapper: wrap(qc) });

    await waitFor(() => {
      expect(rA.current.data?.batch_id).toBe('batch-A');
      expect(rB.current.data?.batch_id).toBe('batch-B');
    });

    // Distinct cache entries keyed on the id.
    expect(qc.getQueryData(batchKey('batch-A'))).toMatchObject({ batch_id: 'batch-A' });
    expect(qc.getQueryData(batchKey('batch-B'))).toMatchObject({ batch_id: 'batch-B' });
  });

  it('useCreateBatch primes the per-batch cache after success', async () => {
    const { result } = renderHook(() => useCreateBatch(), { wrapper: wrap(qc) });
    result.current.mutate({
      aids: ['AID-1', 'AID-2'],
      rule: { kind: 'floor_plus', margin_pp: '10' },
    });
    await waitFor(() => {
      expect(qc.getQueryData(batchKey('new-batch'))).toMatchObject({
        batch_id: 'new-batch',
      });
    });
  });

  it('useCommitBatch invalidates the affected batch key', async () => {
    qc.setQueryData(batchKey('b-1'), { batch_id: 'b-1' });
    const invalidate = vi.spyOn(qc, 'invalidateQueries');
    const { result } = renderHook(() => useCommitBatch('b-1'), { wrapper: wrap(qc) });
    result.current.mutate({ dry_run: false });
    await waitFor(() => {
      expect(invalidate).toHaveBeenCalledWith({ queryKey: batchKey('b-1') });
    });
  });
});
