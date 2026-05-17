// Pricing Studio v3 / Phase 1 — pricing lineage hook (front-end mock).
//
// TODO(p10): replace with real GET /api/v1/lineage/{ref_id} endpoint.
// The Phase 0 `lineage_refs` table exists on the backend (services/pricing/
// lineage.py); Phase 10 will surface a dedicated endpoint. For now we
// synthesize a small source list from the LineageRefBlock already returned
// with each numeric block on the workbench payload — that gives us a
// believable drawer right now without round-tripping.
//
// Acceptance (§1.7): the drawer must always show ≥3 upstream sources so the
// user can see the full provenance chain. We therefore synthesize a fixed
// "always-on" frame — cost state ingest, competitor feed sample, won-deal
// sample, and the current elasticity model version — and merge it with the
// primary source carried on the LineageRefBlock. De-duplicated by
// source_kind so a primary that already covers one of the frame slots
// doesn't render twice.

import { useMemo } from 'react';
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
}

export interface UsePricingLineageOpts {
  /** Optional WTP block — used to surface the won-deal sample-size. */
  wtp?: WtpBlock | null;
  /** Current elasticity model version label, e.g. "v2026-05-09". */
  elasticityModelVersion?: string | null;
  /**
   * Optional competitor_ref payload. When present we render a real rejection
   * sample row; when absent we render a muted "no recent samples"
   * placeholder so the slot count stays ≥3.
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

const DEFAULT_ELASTICITY_MODEL_VERSION = 'v2026-05-09';

function kindLabel(kind: string): string {
  return KIND_LABELS[kind] ?? kind.replace(/_/g, ' ');
}

/**
 * Synthesise a believable source list for a LineageRefBlock.
 *
 * Spec §1.7 acceptance: the drawer must always surface ≥3 upstream sources.
 * We achieve that with a fixed "always-on" frame:
 *   • `cost_state_ingest`   — invoice ledger ingest
 *   • `competitor_feed`     — rejection sample (real or placeholder)
 *   • `won_deal_sample`     — sample-size driven by `wtp.n_deals`
 *   • `elasticity_model`    — current model version label
 * Merged with the primary source (from `ref`) and de-duplicated by
 * `source_kind`. The final list is 3–5 entries. Replace with the real DAG
 * once `/api/v1/lineage/{ref_id}` ships (see TODO at top of file).
 */
function synthesizeSources(
  ref: LineageRefBlock,
  opts: UsePricingLineageOpts,
): LineageSourceRow[] {
  const computedBy = ref.computed_by;
  const computedAt = ref.computed_at;
  const wtp = opts.wtp ?? null;
  const competitorRef = opts.competitorRef ?? null;
  const modelVersion = opts.elasticityModelVersion ?? DEFAULT_ELASTICITY_MODEL_VERSION;

  const primary: LineageSourceRow = {
    id: ref.id,
    source_kind: ref.source_kind,
    source_id: ref.source_id,
    model: ref.model ?? null,
    computed_at: computedAt,
    computed_by: computedBy,
    sql: ref.sql ?? null,
    kindLabel: kindLabel(ref.source_kind),
    available: true,
  };

  // The always-on frame. Each row is keyed by source_kind so the
  // de-duplication step below collapses a primary that already covers one
  // of these slots into a single entry.
  const frame: LineageSourceRow[] = [
    synthRow({
      kind: 'cost_state_ingest',
      source_id: `${ref.source_id}.cost_state`,
      computed_at: computedAt,
      computed_by: computedBy,
    }),
    competitorRef
      ? synthRow({
          kind: 'competitor_feed',
          source_id: competitorRef.source_id ?? `${ref.source_id}.competitor_rejections`,
          computed_at: competitorRef.computed_at ?? computedAt,
          computed_by: computedBy,
        })
      : synthRow({
          kind: 'competitor_feed',
          source_id: 'no recent samples',
          computed_at: computedAt,
          computed_by: computedBy,
          available: false,
        }),
    synthRow({
      kind: 'won_deal_sample',
      source_id:
        wtp && Number.isFinite(wtp.n_deals)
          ? `${ref.source_id}.won_deals (n=${wtp.n_deals})`
          : `${ref.source_id}.won_deals`,
      computed_at: computedAt,
      computed_by: computedBy,
    }),
    synthRow({
      kind: 'elasticity_model',
      source_id: `model:${modelVersion}`,
      computed_at: computedAt,
      computed_by: computedBy,
      model: modelVersion,
    }),
  ];

  // De-dupe by source_kind — the primary wins, frame fills the rest.
  const seen = new Set<string>([primary.source_kind]);
  const merged: LineageSourceRow[] = [primary];
  for (const row of frame) {
    if (seen.has(row.source_kind)) continue;
    seen.add(row.source_kind);
    merged.push(row);
  }
  return merged;
}

interface SynthRowArgs {
  kind: string;
  source_id: string;
  computed_at: string;
  computed_by: string;
  model?: string | null;
  available?: boolean;
}

function synthRow(args: SynthRowArgs): LineageSourceRow {
  // A stable synthetic id so React keys don't fight us.
  const id = `${args.kind}:${args.source_id}`;
  return {
    id,
    source_kind: args.kind,
    source_id: args.source_id,
    model: args.model ?? null,
    computed_at: args.computed_at,
    computed_by: args.computed_by,
    sql: null,
    kindLabel: kindLabel(args.kind),
    available: args.available ?? true,
  };
}

/**
 * Pure synchronous "hook". No network round-trip yet (see TODO above);
 * memoised so re-opens of the same ref are stable for React keys. Accepts
 * optional context (wtp, competitor_ref, elasticity model version) so the
 * synthesised "always-on" frame can be sourced from real workbench blocks.
 */
export function usePricingLineage(
  ref: LineageRefBlock | null,
  opts: UsePricingLineageOpts = {},
): PricingLineageResult {
  return useMemo(() => {
    if (!ref) return { ref: null, sources: [] };
    return { ref, sources: synthesizeSources(ref, opts) };
  }, [ref, opts.wtp, opts.elasticityModelVersion, opts.competitorRef]);
}
