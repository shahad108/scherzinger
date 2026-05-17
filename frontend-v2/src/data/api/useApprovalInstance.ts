// Phase 5 — fetch the approval instance + step history for a proposal so
// the Approval Stepper component can render the routing chain. Backed by
// GET /api/v1/pricing/proposals/{id}/approval.
//
// The endpoint 404s when the proposal has never been submitted (no
// instance row exists yet). The hook treats 404 as "no instance" and
// resolves to `null` so the stepper can render an empty state.

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { apiFetch, postJson } from '@/lib/api/client';
import { qk } from '@/lib/api/queryKeys';
import type { ProposalRow } from './useRecommendation';

export type ApprovalStepDecision =
  | 'pending'
  | 'approved'
  | 'rejected'
  | 'changes_requested';

export interface ApprovalStep {
  role: string;
  decision: ApprovalStepDecision;
  actor: string | null;
  at: string | null;
  comment: string | null;
  /** Optional rule note (which threshold routed this step). */
  rule?: string | null;
}

export interface ApprovalInstance {
  id: string;
  proposal_id: string;
  current_step: number;
  steps: ApprovalStep[];
  created_at: string | null;
  updated_at: string | null;
}

export interface ApprovalAction {
  id: string;
  actor: string | null;
  decision: string;
  comment: string | null;
  at: string | null;
}

export interface ApprovalInstanceResponse {
  approval_instance: ApprovalInstance;
  actions: ApprovalAction[];
  proposal: ProposalRow;
}

export const approvalInstanceKey = (proposalId: string | null | undefined) =>
  ['approval-instance', proposalId ?? null] as const;

export function useApprovalInstance(proposalId: string | null | undefined) {
  return useQuery<ApprovalInstanceResponse | null>({
    queryKey: approvalInstanceKey(proposalId),
    enabled: Boolean(proposalId),
    queryFn: async () => {
      try {
        return await apiFetch<ApprovalInstanceResponse>(
          `/pricing/proposals/${encodeURIComponent(proposalId!)}/approval`,
          {
            // In test mode the central client routes to mockResolve; the
            // tests inject their own mock via vi.mock so this fallback
            // simply yields null (a not-yet-submitted proposal).
            mockResolve: () => null as unknown as ApprovalInstanceResponse,
          },
        );
      } catch (err) {
        // A 404 means the proposal exists but has no instance yet (draft).
        if (err instanceof Error && err.message.includes('404')) return null;
        throw err;
      }
    },
    staleTime: 15_000,
  });
}

export interface RecallResponse {
  proposal: ProposalRow;
}

export function useRecallProposal() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (proposalId: string) =>
      postJson<RecallResponse | ProposalRow>(
        `/pricing/proposals/${encodeURIComponent(proposalId)}/recall`,
        undefined,
        { mockResolve: () => ({}) as RecallResponse },
      ),
    onSuccess: (_data, proposalId) => {
      qc.invalidateQueries({ queryKey: approvalInstanceKey(proposalId) });
      qc.invalidateQueries({ queryKey: ['pricing-proposals'] });
      qc.invalidateQueries({ queryKey: qk.actionCenter() });
    },
  });
}
