// Phase 5 — Approval inbox for the current user. Backed by
// GET /api/v1/approvals/inbox. Each row carries enough proposal context
// to render an inbox entry without a follow-up fetch.

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { apiFetch, postJson } from '@/lib/api/client';
import { approvalInstanceKey } from './useApprovalInstance';
import { qk } from '@/lib/api/queryKeys';

export interface ApprovalInboxRow {
  approval_instance_id: string;
  proposal_id: string;
  aid: string | null;
  current_price: number | null;
  proposed_price: number | null;
  delta_pp: number | null;
  status: string;
  current_step: number;
  step_role: string;
  created_at: string | null;
}

export interface ApprovalInboxResponse {
  items: ApprovalInboxRow[];
  total: number;
  cached?: boolean;
}

export const approvalInboxKey = () => ['approval-inbox'] as const;

export function useApprovalInbox() {
  return useQuery<ApprovalInboxResponse>({
    queryKey: approvalInboxKey(),
    queryFn: () =>
      apiFetch<ApprovalInboxResponse>('/approvals/inbox', {
        mockResolve: () => ({ items: [], total: 0 }),
      }),
    staleTime: 30_000,
    refetchOnWindowFocus: true,
  });
}

export interface ApprovalDecisionBody {
  decision: 'approve' | 'reject' | 'request_changes';
  comment?: string;
}

export function useApprovalDecision(instanceId: string | null | undefined) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: ApprovalDecisionBody) =>
      postJson<{ approval_instance: unknown; proposal_status: string }>(
        `/approvals/${encodeURIComponent(instanceId ?? '')}/decision`,
        body,
        {
          mockResolve: () => ({
            approval_instance: null,
            proposal_status: 'pending_approval',
          }),
        },
      ),
    onSuccess: () => {
      // We don't have the proposal_id directly; invalidate broadly so any
      // open stepper / inbox / pricing-proposals query refetches.
      qc.invalidateQueries({ queryKey: approvalInboxKey() });
      qc.invalidateQueries({ queryKey: ['approval-instance'] });
      qc.invalidateQueries({ queryKey: ['pricing-proposals'] });
      qc.invalidateQueries({ queryKey: qk.actionCenter() });
    },
  });
}

// Re-exported so callers can build their own invalidation matchers.
export { approvalInstanceKey };
