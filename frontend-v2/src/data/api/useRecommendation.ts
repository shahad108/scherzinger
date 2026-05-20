// Phase 2 — fetch a single recommendation by stable source_ref (or UUID)
// so deep-linked surfaces can render contextual banners with live
// lifecycle status. Backed by GET /api/v1/recommendations/{ref}.

import { useQuery } from '@tanstack/react-query';
import { apiFetch } from '@/lib/api/client';
import { qk } from '@/lib/api/queryKeys';

export interface RecommendationRow {
  id: string;
  source_kind: string;
  source_ref: string;
  article_id: string | null;
  customer_id: string | null;
  cluster: string | null;
  title: string;
  status:
    | 'open'
    | 'accepted_as_proposal'
    | 'partial_proposed'
    | 'rejected'
    | 'snoozed'
    | 'queued_for_renewal'
    | 'in_ab_test'
    | 'implemented'
    | 'cancelled';
  authority: string | null;
  impact_estimate: number | null;
  payload: Record<string, unknown>;
  created_at: string | null;
  updated_at: string | null;
}

export interface ProposalRow {
  id: string;
  recommendation_id: string | null;
  article_id: string;
  current_price: number | null;
  proposed_price: number | null;
  delta_pp: number | null;
  status: 'draft' | 'pending_approval' | 'approved' | 'implemented' | 'rejected';
  approval_required: boolean;
  payload: Record<string, unknown>;
  created_at: string | null;
  updated_at: string | null;
}

export interface RecommendationLookupResponse {
  recommendation: RecommendationRow;
  latest_proposal: ProposalRow | null;
}

export function useRecommendation(ref: string | null | undefined) {
  return useQuery({
    queryKey: ref ? qk.recommendation(ref) : ['recommendation', '__disabled__'],
    enabled: Boolean(ref),
    queryFn: () =>
      apiFetch<RecommendationLookupResponse>(`/recommendations/${encodeURIComponent(ref!)}`, {
        // Pure-mock-mode fallback: synthesize a contextual recommendation
        // from the ref string so Studio's banner still renders.
        mockResolve: () => synthesizeMock(ref!),
      }),
    staleTime: 60_000,
  });
}

function synthesizeMock(ref: string): RecommendationLookupResponse {
  const [kind = 'decision', ...rest] = ref.split(':');
  const articleId = rest.join(':') || null;
  return {
    recommendation: {
      id: ref,
      source_kind: kind,
      source_ref: ref,
      article_id: articleId,
      customer_id: null,
      cluster: null,
      title: articleSummary(kind, articleId),
      status: 'open',
      authority: 'Frank',
      impact_estimate: null,
      payload: {},
      created_at: null,
      updated_at: null,
    },
    latest_proposal: null,
  };
}

function articleSummary(kind: string, articleId: string | null): string {
  if (kind === 'churn') return `Churn risk · Customer ${articleId ?? '—'}`;
  if (kind === 'cost_riser') return `Cost riser · Article ${articleId ?? '—'}`;
  if (kind === 'margin_erosion') return `Margin erosion · Article ${articleId ?? '—'}`;
  return articleId ? `Recommendation · ${articleId}` : 'Recommendation context';
}
