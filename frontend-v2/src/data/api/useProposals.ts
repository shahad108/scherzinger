// Phase 5 — pricing proposal CRUD hooks. Wraps the FastAPI endpoints
// at /api/v1/pricing/proposals so Pricing Studio can list / create /
// patch / submit / approve proposals while keeping React Query cache
// in sync (Action Center invalidation included so the lifecycle status
// chip refreshes immediately).
//
// Pricing Studio v3 / Phase C2 — the sessionStorage synthetic-proposal
// store has been removed. Every call goes straight to the BFF; on
// error the React Query state surfaces the failure instead of
// pretending it succeeded with an empty list.

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { apiFetch, postJson } from '@/lib/api/client';
import { qk } from '@/lib/api/queryKeys';
import type { ProposalRow } from './useRecommendation';

interface ListResponse {
  items: ProposalRow[];
  total: number;
}

export interface ProposalListParams {
  article_id?: string;
  recommendation_id?: string;
  status_filter?: string;
}

export function useProposals(params: ProposalListParams) {
  const enabled = Boolean(params.article_id || params.recommendation_id);
  return useQuery({
    queryKey: ['pricing-proposals', params] as const,
    enabled,
    queryFn: () => apiFetch<ListResponse>('/pricing/proposals', { params }),
    staleTime: 30_000,
  });
}

// Price fields accept either a JS number (legacy clients) or a canonical
// decimal STRING (preferred — see SF1, Pricing Studio v3 / Phase 2.2.5).
// Cent-precise clients (CustomerDrillInDrawer) MUST send strings so the
// value never round-trips through a JS float.
export interface CreateProposalBody {
  article_id: string;
  recommendation_id?: string | null;
  current_price?: number | string | null;
  proposed_price?: number | string | null;
  delta_pp?: number | string | null;
  approval_required?: boolean;
  payload?: Record<string, unknown>;
}

export function useCreateProposal() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: CreateProposalBody) =>
      postJson<ProposalRow>('/pricing/proposals', body),
    onSuccess: (_data, body) => {
      qc.invalidateQueries({ queryKey: ['pricing-proposals'] });
      qc.invalidateQueries({ queryKey: qk.actionCenter() });
      if (body.recommendation_id) {
        qc.invalidateQueries({ queryKey: qk.recommendation(body.recommendation_id) });
      }
    },
  });
}

export interface PatchProposalBody {
  current_price?: number;
  proposed_price?: number;
  delta_pp?: number;
  status?: ProposalRow['status'];
  approval_required?: boolean;
  payload?: Record<string, unknown>;
}

export function usePatchProposal(proposalId: string | null | undefined) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: PatchProposalBody) =>
      postJson<ProposalRow>(`/pricing/proposals/${proposalId}`, body),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['pricing-proposals'] });
      qc.invalidateQueries({ queryKey: qk.actionCenter() });
    },
  });
}

export function useSubmitProposal() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (proposalId: string) =>
      postJson<ProposalRow>(`/pricing/proposals/${proposalId}/submit`, undefined),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['pricing-proposals'] });
      qc.invalidateQueries({ queryKey: qk.actionCenter() });
    },
  });
}
