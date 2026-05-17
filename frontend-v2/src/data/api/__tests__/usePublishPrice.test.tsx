// Pricing Studio v3 / Phase 7 — usePublishPrice hooks contract.
//
// Asserts:
//   - usePublishPrice posts the right body and invalidates studio + price-book
//   - useRollback posts receipt_id + reason
//   - usePriceBook is keyed on aid
//   - defaultEffectiveAt + isWithinRollbackWindow + proposalPdfUrl helpers

import { renderHook, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactNode } from 'react';
import {
  defaultEffectiveAt,
  isWithinRollbackWindow,
  priceBookKey,
  proposalPdfUrl,
  usePriceBook,
  usePublishPrice,
  useRollback,
} from '../usePublishPrice';

vi.mock('@/lib/api/client', async () => {
  const actual = await vi.importActual<typeof import('@/lib/api/client')>(
    '@/lib/api/client',
  );
  return {
    ...actual,
    apiFetch: vi.fn(async (path: string) => {
      if (path.includes('/price-book')) {
        return { aid: 'AID-1', rows: [] };
      }
      return {};
    }),
    postJson: vi.fn(async (path: string, body: unknown) => {
      if (path.endsWith('/publish')) {
        return {
          scheduled: false,
          receipt: {
            id: 'r-1',
            aid: 'AID-1',
            source_proposal_id: null,
            old_price_book_row_id: null,
            new_price_book_row_id: 'new-row',
            published_at: new Date().toISOString(),
            rolled_back_at: null,
            notifications_dispatched: [],
            published_by: 'test',
            rollback_reason: null,
          },
        };
      }
      if (path.endsWith('/rollback')) {
        const b = body as { receipt_id: string; reason: string };
        return {
          receipt: {
            id: b.receipt_id,
            aid: 'AID-1',
            source_proposal_id: null,
            old_price_book_row_id: null,
            new_price_book_row_id: 'new-row',
            published_at: new Date().toISOString(),
            rolled_back_at: new Date().toISOString(),
            notifications_dispatched: [],
            published_by: 'test',
            rollback_reason: b.reason,
          },
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

describe('usePublishPrice', () => {
  let qc: QueryClient;
  beforeEach(() => {
    qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  });

  it('publishes a price and invalidates the studio + price-book + action-center caches', async () => {
    const invalidate = vi.spyOn(qc, 'invalidateQueries');
    const { result } = renderHook(() => usePublishPrice('AID-1'), {
      wrapper: wrap(qc),
    });
    result.current.mutate({ price: '127.00', source_proposal_id: 'p-1' });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    const invalidatedKeys = invalidate.mock.calls.map(
      (c) => (c[0] as { queryKey?: unknown }).queryKey,
    );
    // Verify the price-book + studio + action-center invalidations fired.
    expect(invalidatedKeys).toEqual(
      expect.arrayContaining([
        priceBookKey('AID-1'),
        ['studio'],
      ]),
    );
  });
});

describe('useRollback', () => {
  it('posts the receipt id + reason and exposes the rolled-back receipt', async () => {
    const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const { result } = renderHook(() => useRollback('AID-1'), {
      wrapper: wrap(qc),
    });
    result.current.mutate({ receipt_id: 'r-1', reason: 'duplicate publish' });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data?.receipt.rollback_reason).toBe(
      'duplicate publish',
    );
  });
});

describe('usePriceBook — keying', () => {
  it('is keyed on the aid', async () => {
    const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const { result } = renderHook(() => usePriceBook('AID-1'), {
      wrapper: wrap(qc),
    });
    await waitFor(() => expect(result.current.data).toBeDefined());
    expect(qc.getQueryData(priceBookKey('AID-1'))).toBeDefined();
  });

  it('is disabled when aid is null', async () => {
    const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const { result } = renderHook(() => usePriceBook(null), {
      wrapper: wrap(qc),
    });
    expect(result.current.fetchStatus).toBe('idle');
  });
});

describe('helpers', () => {
  it('isWithinRollbackWindow is true inside 72h and false outside', () => {
    const now = new Date('2026-05-17T12:00:00Z');
    const insideIso = new Date(now.getTime() - 60 * 60 * 1000).toISOString();
    const outsideIso = new Date(
      now.getTime() - 80 * 60 * 60 * 1000,
    ).toISOString();
    expect(isWithinRollbackWindow(insideIso, now)).toBe(true);
    expect(isWithinRollbackWindow(outsideIso, now)).toBe(false);
    expect(isWithinRollbackWindow(null)).toBe(false);
  });

  it('defaultEffectiveAt returns next-day 00:00 UTC', () => {
    const now = new Date('2026-05-17T18:00:00Z');
    expect(defaultEffectiveAt(now)).toBe('2026-05-18T00:00');
  });

  it('proposalPdfUrl honours the proposal id', () => {
    expect(proposalPdfUrl('p-1')).toContain('/pricing/proposals/p-1/pdf');
  });
});
