// Pricing Studio v3 / Phase 1 — pricing lineage hook (front-end mock).
//
// TODO(p10): replace with real GET /api/v1/lineage/{ref_id} endpoint.
// The Phase 0 `lineage_refs` table exists on the backend (services/pricing/
// lineage.py); Phase 10 will surface a dedicated endpoint. For now we
// synthesize a small source list from the LineageRefBlock already returned
// with each numeric block on the workbench payload — that gives us a
// believable drawer right now without round-tripping.

import { useMemo } from 'react';
import type { LineageRefBlock } from '@/types/studio';

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
}

export interface PricingLineageResult {
  ref: LineageRefBlock | null;
  /** Linear list of upstream sources that fed this value. */
  sources: LineageSourceRow[];
}

const KIND_LABELS: Record<string, string> = {
  invoice_ledger: 'Invoice ledger',
  competitor_feed: 'Competitor feed',
  won_deal_sample: 'Won-deal sample',
  elasticity_model: 'Elasticity model',
  cost_ingest: 'Cost ingest',
  manual_override: 'Manual override',
  scheduled_publish: 'Scheduled publish',
  ab_test_assignment: 'A/B test assignment',
};

function kindLabel(kind: string): string {
  return KIND_LABELS[kind] ?? kind.replace(/_/g, ' ');
}

/**
 * Synthesise a believable source list from a LineageRefBlock. Returns a row
 * for the primary ref plus one or two derived upstream sources keyed by the
 * source_kind so the drawer always has something useful to render.
 */
function synthesizeSources(ref: LineageRefBlock): LineageSourceRow[] {
  const primary: LineageSourceRow = {
    id: ref.id,
    source_kind: ref.source_kind,
    source_id: ref.source_id,
    model: ref.model ?? null,
    computed_at: ref.computed_at,
    computed_by: ref.computed_by,
    sql: ref.sql ?? null,
    kindLabel: kindLabel(ref.source_kind),
  };

  // Heuristic upstreams. Phase 10 replaces this with the real DAG.
  const upstreams: LineageSourceRow[] = [];
  switch (ref.source_kind) {
    case 'elasticity_model':
      upstreams.push(
        synthRow('won_deal_sample', `${ref.source_id}.deals`, ref.computed_at, ref.computed_by),
      );
      break;
    case 'won_deal_sample':
      upstreams.push(
        synthRow('invoice_ledger', `${ref.source_id}.invoices`, ref.computed_at, ref.computed_by),
      );
      break;
    case 'competitor_feed':
      upstreams.push(
        synthRow('competitor_feed', `${ref.source_id}.rejections`, ref.computed_at, ref.computed_by),
      );
      break;
    case 'cost_ingest':
      upstreams.push(
        synthRow('cost_ingest', `${ref.source_id}.bom`, ref.computed_at, ref.computed_by),
      );
      break;
    default:
      break;
  }

  return [primary, ...upstreams];
}

function synthRow(
  kind: string,
  source_id: string,
  computed_at: string,
  computed_by: string,
): LineageSourceRow {
  // A stable synthetic id so React keys don't fight us.
  const id = `${kind}:${source_id}`;
  return {
    id,
    source_kind: kind,
    source_id,
    model: null,
    computed_at,
    computed_by,
    sql: null,
    kindLabel: kindLabel(kind),
  };
}

/**
 * Pure synchronous "hook". No network round-trip yet (see TODO above);
 * memoised so re-opens of the same ref are stable for React keys.
 */
export function usePricingLineage(ref: LineageRefBlock | null): PricingLineageResult {
  return useMemo(() => {
    if (!ref) return { ref: null, sources: [] };
    return { ref, sources: synthesizeSources(ref) };
  }, [ref]);
}
