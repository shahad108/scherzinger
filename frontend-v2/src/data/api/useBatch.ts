// Pricing Studio v3 / Phase 6 — batch repricing hooks.
//
// Wraps the BFF batch endpoints:
//   POST /pricing/batches             → create batch + run preview
//   GET  /pricing/batches/{id}        → fetch persisted preview + KPI
//   POST /pricing/batches/{id}/commit → submit (creates proposals)
//   POST /pricing/batches/{id}/cancel → mark cancelled
//
// Decimal-as-string is preserved end-to-end: the BFF emits prices as JSON
// strings via Pydantic Decimal serialisation; we mirror that here. The
// only `number` we hold locally is the `risk_score` numeric tone derivation
// (UI-only), and the SSE-driven "stale" flag.

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { apiFetch, postJson } from '@/lib/api/client';

// ---------------------------------------------------------------------------
// Wire types — these mirror BatchPreviewItem / BatchPreview on the BFF.
// ---------------------------------------------------------------------------

export type BatchRuleKind =
  | 'floor_plus'
  | 'pct_move'
  | 'match_competitor'
  | 'target_db2'
  | 'custom_jsonlogic';

export interface FloorPlusRule {
  kind: 'floor_plus';
  margin_pp: string;
}
export interface PctMoveRule {
  kind: 'pct_move';
  pct: string;
  floor_cap?: boolean;
}
export interface MatchCompetitorRule {
  kind: 'match_competitor';
  undershoot_pct: string;
}
export interface TargetDb2Rule {
  kind: 'target_db2';
  target_pp: string;
}
export interface CustomJsonLogicRule {
  kind: 'custom_jsonlogic';
  expression: Record<string, unknown>;
}

export type BatchRule =
  | FloorPlusRule
  | PctMoveRule
  | MatchCompetitorRule
  | TargetDb2Rule
  | CustomJsonLogicRule;

export interface ScopeFilter {
  tier?: string[];
  family?: string[];
  cluster?: string[];
  min_ltm_units?: number;
}

export interface BatchPreviewItemWire {
  aid: string;
  before_price: string | null;
  after_price: string | null;
  delta?: string | null;
  delta_pct?: string | null;
  projected_db2: string | null;
  win_prob_at_new: string | null;
  risk_score: string | null;
  lineage_ref?: string | null;
  approval_route: string[];
  auto_approve: boolean;
  block: boolean;
  note?: string | null;
}

export interface BatchItem {
  id: string;
  aid: string;
  before_price: string | null;
  after_price: string | null;
  status: string;
  proposal_id: string | null;
  per_sku_lineage_ref: string | null;
  preview: BatchPreviewItemWire;
}

export interface BatchKpiSummary {
  count: number;
  total_revenue_impact: string;
  total_margin_impact: string;
  avg_win_prob_at_new: string | null;
}

export type ApprovalRoutingSummary = Record<string, number> & {
  auto_approve: number;
  block: number;
};

export interface BatchEnvelope {
  batch_id: string;
  status: 'preview' | 'committed' | 'cancelled' | string;
  created_by?: string;
  rule: BatchRule | Record<string, unknown>;
  scope_filter: ScopeFilter | Record<string, unknown>;
  items: BatchItem[];
  approval_routing_summary: ApprovalRoutingSummary;
  kpi_summary: BatchKpiSummary;
  created_at: string | null;
  committed_at: string | null;
  cancelled_at: string | null;
}

export interface BatchCommitSummary {
  batch_id: string;
  status: string;
  dry_run: boolean;
  created_proposals: string[];
  routed_by_role: Record<string, number>;
  total_revenue_impact: string;
  locked_aids: string[];
}

// ---------------------------------------------------------------------------
// Query keys.
// ---------------------------------------------------------------------------

export const batchKey = (batchId: string | null | undefined) =>
  ['batch', batchId ?? null] as const;

// ---------------------------------------------------------------------------
// GET
// ---------------------------------------------------------------------------

export function useBatch(batchId: string | null | undefined) {
  return useQuery<BatchEnvelope | null>({
    queryKey: batchKey(batchId),
    enabled: Boolean(batchId),
    queryFn: async () => {
      if (!batchId) return null;
      return apiFetch<BatchEnvelope>(
        `/pricing/batches/${encodeURIComponent(batchId)}`,
        {
          // Tests inject through vi.mock; this fallback yields an empty
          // preview so a component test that hits the hook unmocked does
          // not throw.
          mockResolve: () => ({
            batch_id: batchId,
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
          }),
        },
      );
    },
    staleTime: 30_000,
  });
}

// ---------------------------------------------------------------------------
// POST /pricing/batches — create + preview
// ---------------------------------------------------------------------------

export interface CreateBatchBody {
  aids: string[];
  rule: BatchRule;
  scope_filter?: ScopeFilter;
}

export function useCreateBatch() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: CreateBatchBody) =>
      postJson<BatchEnvelope>('/pricing/batches', body, {
        mockResolve: () => ({
          batch_id: 'mock-batch',
          status: 'preview',
          rule: body.rule,
          scope_filter: body.scope_filter ?? {},
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
        }),
      }),
    onSuccess: (data) => {
      qc.setQueryData(batchKey(data.batch_id), data);
    },
  });
}

// ---------------------------------------------------------------------------
// POST /pricing/batches/{id}/commit
// ---------------------------------------------------------------------------

export interface CommitBatchBody {
  dry_run?: boolean;
  locked_aids?: string[];
}

export function useCommitBatch(batchId: string | null | undefined) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: CommitBatchBody) =>
      postJson<BatchCommitSummary>(
        `/pricing/batches/${encodeURIComponent(batchId ?? '')}/commit`,
        body,
        {
          mockResolve: () => ({
            batch_id: batchId ?? '',
            status: 'committed',
            dry_run: Boolean(body.dry_run),
            created_proposals: [],
            routed_by_role: {},
            total_revenue_impact: '0',
            locked_aids: body.locked_aids ?? [],
          }),
        },
      ),
    onSuccess: () => {
      if (batchId) qc.invalidateQueries({ queryKey: batchKey(batchId) });
      qc.invalidateQueries({ queryKey: ['pricing-proposals'] });
      qc.invalidateQueries({ queryKey: ['approval-inbox'] });
    },
  });
}

// ---------------------------------------------------------------------------
// POST /pricing/batches/{id}/cancel
// ---------------------------------------------------------------------------

export function useCancelBatch(batchId: string | null | undefined) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () =>
      postJson<BatchEnvelope>(
        `/pricing/batches/${encodeURIComponent(batchId ?? '')}/cancel`,
        undefined,
        {
          mockResolve: () => ({
            batch_id: batchId ?? '',
            status: 'cancelled',
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
          }),
        },
      ),
    onSuccess: (data) => {
      if (batchId) qc.setQueryData(batchKey(batchId), data);
    },
  });
}
