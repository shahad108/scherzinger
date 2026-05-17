// Phase 5 — useApprovalDecision invalidation contract.
//
// Asserts SF2: the decision mutation should ONLY invalidate the affected
// proposal's approval-instance query, not the global `['approval-instance']`
// prefix which would refetch every open stepper across the app.

import { act, renderHook, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactNode } from 'react';
import { useApprovalDecision, approvalInboxKey } from '../useApprovalInbox';
import { approvalInstanceKey } from '../useApprovalInstance';

// postJson is used by the hook. Stub it to return a predictable payload
// that carries the affected proposal_id inside approval_instance.
vi.mock('@/lib/api/client', async () => {
  const actual = await vi.importActual<typeof import('@/lib/api/client')>(
    '@/lib/api/client',
  );
  return {
    ...actual,
    postJson: vi.fn(async (_path: string) => ({
      approval_instance: {
        id: 'instance-A',
        proposal_id: 'proposal-A',
        current_step: 1,
        steps: [],
        created_at: null,
        updated_at: null,
      },
      proposal_status: 'approved',
    })),
  };
});

function wrap(qc: QueryClient) {
  return ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={qc}>{children}</QueryClientProvider>
  );
}

describe('useApprovalDecision invalidation (SF2)', () => {
  let qc: QueryClient;
  beforeEach(() => {
    qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  });

  it('only invalidates the affected proposal\'s instance query, not unrelated ones', async () => {
    // Seed two open approval-instance queries; only the one for
    // "proposal-A" should be invalidated by the decision.
    qc.setQueryData(approvalInstanceKey('proposal-A'), { sentinel: 'A' });
    qc.setQueryData(approvalInstanceKey('proposal-B'), { sentinel: 'B' });
    qc.setQueryData(approvalInboxKey(), { items: [], total: 0 });

    const invalidate = vi.spyOn(qc, 'invalidateQueries');

    const { result } = renderHook(() => useApprovalDecision('instance-A'), {
      wrapper: wrap(qc),
    });

    await act(async () => {
      await result.current.mutateAsync({ decision: 'approve' });
    });

    await waitFor(() => expect(invalidate).toHaveBeenCalled());

    // Collect every (queryKey) passed to invalidateQueries.
    const calls = invalidate.mock.calls.map(([arg]) =>
      JSON.stringify((arg as { queryKey?: unknown[] }).queryKey ?? null),
    );

    // Inbox invalidation is still expected (shape depends on all decisions).
    expect(calls).toEqual(
      expect.arrayContaining([JSON.stringify(approvalInboxKey())]),
    );
    // The affected proposal's instance MUST be invalidated.
    expect(calls).toEqual(
      expect.arrayContaining([JSON.stringify(approvalInstanceKey('proposal-A'))]),
    );
    // The UNAFFECTED proposal's instance must NOT be invalidated.
    expect(calls).not.toEqual(
      expect.arrayContaining([JSON.stringify(approvalInstanceKey('proposal-B'))]),
    );
    // The global prefix-only key must NOT be used (it would match both).
    expect(calls).not.toEqual(
      expect.arrayContaining([JSON.stringify(['approval-instance'])]),
    );
  });
});
