// Pricing Studio v3 / Phase 10 — pricing lineage hook.
//
// Real-network hook backed by `GET /api/v1/lineage/{ref_id}` (see
// `backend/api/v1/lineage.py`). Replaces the Phase 1 client-side
// synthesiser. The drawer surface still expects a list of upstream
// sources with the LineageSourceRow shape; the BFF currently returns the
// row's metadata as a single primary source plus a scrubbed `preview`
// list, which we expand into the existing source-row shape so the
// existing drawer renderer doesn't have to change.
//
// Acceptance (§10.4):
//   • TanStack Query call, 30s staleTime
//   • 404 → graceful "lineage not found" placeholder (sources empty,
//     ref synthesised from the request so the drawer header still
//     renders something useful)
//   • Returns the LineageSourceRow shape unchanged
//   • No `// TODO(p10)` markers left in this file

import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { apiFetch } from '@/lib/api/client';
import type { LineageRefBlock, WtpBlock } from '@/types/studio';

export interface LineageSourceRow {
  id: string;
  source_kind: string;
  source_id: string;
  model?: string | null;
  /** ISO timestamp. */
  computed_at: string;
  computed_by: string;
  /** Optional SQL/feature snippet rendered on expand. */
  sql?: string | null;
  /** Short, human-readable label derived from source_kind. */
  kindLabel: string;
  /**
   * False marks a "no recent samples" placeholder row that we still surface
   * so the user can see the slot exists. The drawer renders it visually muted.
   */
  available?: boolean;
}

export interface PricingLineageResult {
  ref: LineageRefBlock | null;
  /** Linear list of upstream sources that fed this value. */
  sources: LineageSourceRow[];
  /** True when the BFF returned 404 — the drawer surfaces a placeholder. */
  notFound: boolean;
  /** True while the underlying query is in-flight. */
  isLoading: boolean;
}

export interface UsePricingLineageOpts {
  /** Optional WTP block — currently unused (kept for source compat). */
  wtp?: WtpBlock | null;
  /** Current elasticity model version label, e.g. "v2026-05-09". */
  elasticityModelVersion?: string | null;
  /**
   * Optional competitor_ref payload — currently unused (real BFF lineage
   * carries this through the source preview); kept for source compat with
   * callers that still pass it.
   */
  competitorRef?: { source_id?: string; computed_at?: string } | null;
}

const KIND_LABELS: Record<string, string> = {
  invoice_ledger: 'Invoice ledger',
  competitor_feed: 'Competitor feed',
  won_deal_sample: 'Won-deal sample',
  elasticity_model: 'Elasticity model',
  cost_ingest: 'Cost ingest',
  cost_state_ingest: 'Cost-state ingest',
  manual_override: 'Manual override',
  scheduled_publish: 'Scheduled publish',
  ab_test_assignment: 'A/B test assignment',
};

function kindLabel(kind: string): string {
  return KIND_LABELS[kind] ?? kind.replace(/_/g, ' ');
}

// ---- BFF wire shape ---------------------------------------------------------

interface LineagePreviewRow {
  field: string;
  value: string | number | boolean | null;
}

interface LineageWireResponse {
  id: string;
  source_kind: string;
  source_id: string;
  sql: string | null;
  model: string | null;
  computed_at: string;
  computed_by: string;
  preview: LineagePreviewRow[];
}

// ---- Mappers ----------------------------------------------------------------

function wireToRef(wire: LineageWireResponse): LineageRefBlock {
  return {
    id: wire.id,
    source_kind: wire.source_kind,
    source_id: wire.source_id,
    sql: wire.sql,
    model: wire.model,
    computed_at: wire.computed_at,
    computed_by: wire.computed_by,
  };
}

function previewRowToSource(
  ref: LineageRefBlock,
  row: LineagePreviewRow,
  index: number,
): LineageSourceRow | null {
  const value = row.value;
  // The BFF emits descriptors keyed on `field` (e.g. source_kind, source_id,
  // computed_by). We materialise the meaningful ones as extra source rows;
  // bare metadata rows that just re-state the primary are dropped to avoid
  // duplicate noise in the drawer.
  if (row.field === 'source_kind' || row.field === 'computed_by') {
    return null;
  }
  if (value === null || value === undefined || value === '?') {
    return {
      id: `${ref.id}:preview:${index}:unavailable`,
      source_kind: row.field,
      source_id: 'no recent samples',
      model: null,
      computed_at: ref.computed_at,
      computed_by: ref.computed_by,
      sql: null,
      kindLabel: kindLabel(row.field),
      available: false,
    };
  }
  return {
    id: `${ref.id}:preview:${index}`,
    source_kind: row.field,
    source_id: String(value),
    model: null,
    computed_at: ref.computed_at,
    computed_by: ref.computed_by,
    sql: null,
    kindLabel: kindLabel(row.field),
    available: true,
  };
}

function primaryFromRef(ref: LineageRefBlock): LineageSourceRow {
  return {
    id: ref.id,
    source_kind: ref.source_kind,
    source_id: ref.source_id,
    model: ref.model ?? null,
    computed_at: ref.computed_at,
    computed_by: ref.computed_by,
    sql: ref.sql ?? null,
    kindLabel: kindLabel(ref.source_kind),
    available: true,
  };
}

function buildSources(
  ref: LineageRefBlock,
  wire: LineageWireResponse | undefined,
): LineageSourceRow[] {
  const sources: LineageSourceRow[] = [primaryFromRef(ref)];
  const seen = new Set<string>([ref.source_kind]);
  if (wire?.preview) {
    wire.preview.forEach((row, i) => {
      const built = previewRowToSource(ref, row, i);
      if (!built) return;
      if (seen.has(built.source_kind)) return;
      seen.add(built.source_kind);
      sources.push(built);
    });
  }
  return sources;
}

// ---- Hook -------------------------------------------------------------------

const STALE_MS = 30_000;

export function lineageRefQueryKey(refId: string | null | undefined) {
  return ['lineage-ref', refId ?? null] as const;
}

/**
 * Fetch `/api/v1/lineage/{ref_id}` for the open ref. The drawer renders
 * the primary lineage row + the BFF-attached preview rows as the source
 * list. On 404 we return `{ ref, sources: [], notFound: true }` so the
 * drawer's empty-state copy fires.
 */
export function usePricingLineage(
  ref: LineageRefBlock | null,
  _opts: UsePricingLineageOpts = {},
): PricingLineageResult {
  const refId = ref?.id ?? null;
  const enabled = Boolean(refId);
  const query = useQuery<LineageWireResponse | { notFound: true }>({
    queryKey: lineageRefQueryKey(refId),
    enabled,
    staleTime: STALE_MS,
    retry: false,
    queryFn: async () => {
      try {
        return await apiFetch<LineageWireResponse>(`/lineage/${refId}`);
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        if (msg.includes('→ 404')) {
          return { notFound: true } as const;
        }
        throw err;
      }
    },
  });

  return useMemo<PricingLineageResult>(() => {
    if (!ref) {
      return { ref: null, sources: [], notFound: false, isLoading: false };
    }
    if (query.isLoading) {
      return { ref, sources: [primaryFromRef(ref)], notFound: false, isLoading: true };
    }
    const data = query.data;
    if (data && 'notFound' in data && data.notFound) {
      return { ref, sources: [], notFound: true, isLoading: false };
    }
    if (!data) {
      // Network error path — fall back to the primary row so the drawer
      // still renders something traceable to the audit log.
      return { ref, sources: [primaryFromRef(ref)], notFound: false, isLoading: false };
    }
    const wire = data as LineageWireResponse;
    // Prefer the wire ref payload (it may have richer metadata than what the
    // calling block carried).
    const mergedRef: LineageRefBlock = wireToRef(wire);
    return {
      ref: mergedRef,
      sources: buildSources(mergedRef, wire),
      notFound: false,
      isLoading: false,
    };
  }, [ref, query.isLoading, query.data]);
}
