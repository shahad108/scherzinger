// Phase 5 — pricing proposal CRUD hooks. Wraps the FastAPI endpoints
// at /api/v1/pricing/proposals so Pricing Studio can list / create /
// patch / submit / approve proposals while keeping React Query cache
// in sync (Action Center invalidation included so the lifecycle status
// chip refreshes immediately).

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

const SYNTHETIC_PROPOSALS_KEY = 'pryzm_v2_synth_proposals';

function readSynth(): ProposalRow[] {
  if (typeof window === 'undefined') return [];
  try {
    return JSON.parse(window.sessionStorage.getItem(SYNTHETIC_PROPOSALS_KEY) ?? '[]');
  } catch {
    return [];
  }
}
function writeSynth(rows: ProposalRow[]) {
  if (typeof window === 'undefined') return;
  window.sessionStorage.setItem(SYNTHETIC_PROPOSALS_KEY, JSON.stringify(rows));
}

export function useProposals(params: ProposalListParams) {
  const enabled = Boolean(params.article_id || params.recommendation_id);
  return useQuery({
    queryKey: ['pricing-proposals', params] as const,
    enabled,
    queryFn: () =>
      apiFetch<ListResponse>('/pricing/proposals', {
        params,
        // Pure-mock fallback: filter the in-memory synthetic store
        // populated by the create/patch hooks below so deleting a
        // network round-trip doesn't lose state.
        mockResolve: () => {
          const rows = readSynth().filter((r) => {
            if (params.article_id && r.article_id !== params.article_id) return false;
            if (params.recommendation_id && r.recommendation_id !== params.recommendation_id)
              return false;
            if (params.status_filter && r.status !== params.status_filter) return false;
            return true;
          });
          return { items: rows, total: rows.length };
        },
      }),
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
      postJson<ProposalRow>('/pricing/proposals', body, {
        mockResolve: () => synthCreate(body),
      }),
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
      postJson<ProposalRow>(`/pricing/proposals/${proposalId}`, body, {
        mockResolve: () => synthPatch(proposalId!, body),
      }),
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
      postJson<ProposalRow>(`/pricing/proposals/${proposalId}/submit`, undefined, {
        mockResolve: () => synthPatch(proposalId, { status: 'pending_approval' }),
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['pricing-proposals'] });
      qc.invalidateQueries({ queryKey: qk.actionCenter() });
    },
  });
}

function toNumberOrNull(v: number | string | null | undefined): number | null {
  if (v === null || v === undefined) return null;
  if (typeof v === 'number') return v;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

function synthCreate(body: CreateProposalBody): ProposalRow {
  // The pure-mock fallback approximates the BFF, which serialises
  // proposed_price as a number in the response shape. String-typed
  // inputs are coerced through Number() at the mock boundary — real
  // BFF preserves cent precision via Decimal end-to-end.
  const row: ProposalRow = {
    id: `mock-${Date.now()}`,
    recommendation_id: body.recommendation_id ?? null,
    article_id: body.article_id,
    current_price: toNumberOrNull(body.current_price),
    proposed_price: toNumberOrNull(body.proposed_price),
    delta_pp: toNumberOrNull(body.delta_pp),
    status: 'draft',
    approval_required: body.approval_required ?? false,
    payload: body.payload ?? {},
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  };
  writeSynth([row, ...readSynth()]);
  return row;
}

function synthPatch(proposalId: string, body: PatchProposalBody): ProposalRow {
  const rows = readSynth();
  const idx = rows.findIndex((r) => r.id === proposalId);
  if (idx === -1) {
    return synthCreate({ article_id: body.payload?.article_id as string ?? proposalId });
  }
  const updated = {
    ...rows[idx],
    ...(body.current_price !== undefined ? { current_price: body.current_price } : {}),
    ...(body.proposed_price !== undefined ? { proposed_price: body.proposed_price } : {}),
    ...(body.delta_pp !== undefined ? { delta_pp: body.delta_pp } : {}),
    ...(body.status !== undefined ? { status: body.status } : {}),
    ...(body.approval_required !== undefined ? { approval_required: body.approval_required } : {}),
    payload: { ...rows[idx].payload, ...(body.payload ?? {}) },
    updated_at: new Date().toISOString(),
  };
  rows[idx] = updated;
  writeSynth(rows);
  return updated;
}
