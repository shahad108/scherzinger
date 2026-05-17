// Pricing Studio v3 / Phase 4 — per-SKU audit feed (infinite scroll).
//
// Backs `<AuditDrawer>` via
// GET /api/v1/pricing/sku/{aid}/audit?limit=&offset=&action_in=&actor=&since=
//
// 50-row pages. `getNextPageParam` returns `undefined` when the running total
// has reached `total` reported by the server. Filters compose into the BFF
// `action_in` CSV. Decimal-as-string discipline is preserved: `before` /
// `after` payloads stay opaque (Record<string, unknown>) until a formatter
// pulls them at render time.

import { useInfiniteQuery } from '@tanstack/react-query';
import { apiFetch } from '@/lib/api/client';

/** Server-side filter pill → CSV action_in mapping. */
export type AuditFilterPill =
  | 'price'
  | 'proposal'
  | 'approval'
  | 'cost'
  | 'override';

const PILL_ACTIONS: Record<AuditFilterPill, string[]> = {
  price: ['price_set'],
  proposal: ['proposal_created', 'proposal_approved', 'proposal_rejected'],
  approval: ['proposal_approved', 'proposal_rejected'],
  cost: ['cost_ingested', 'override_added'],
  override: ['override_added'],
};

export function actionsForPills(pills: readonly AuditFilterPill[]): string[] {
  if (pills.length === 0) return [];
  // Multi-pill = union; we de-dupe via Set so the BFF receives a clean CSV.
  const seen = new Set<string>();
  for (const p of pills) {
    for (const a of PILL_ACTIONS[p] ?? []) seen.add(a);
  }
  return Array.from(seen);
}

/** One audit row as shipped by the BFF (`_serialize_row`). */
export interface AuditFeedRow {
  id: string;
  at: string | null;
  actor: string;
  action: string;
  target_kind: string;
  target_id: string | null;
  before: Record<string, unknown> | null;
  after: Record<string, unknown> | null;
  reason: string | null;
  lineage_ref: { id: string } | null;
  linked_rec: { ref: string; label: string } | null;
  /** Frontend deep-link target. Optional — most rows omit it. */
  link_target?: string | null;
}

export interface AuditFeedPage {
  rows: AuditFeedRow[];
  total: number;
  lineage_ref: string | null;
  /** Server-reflected offset for this page (echoes the request param). */
  offset: number;
}

export interface AuditFeedFilters {
  pills?: readonly AuditFilterPill[];
  actor?: string | null;
  since?: string | null;
}

export const auditFeedKey = (aid: string, filters: AuditFeedFilters) =>
  [
    'audit',
    aid,
    {
      pills: filters.pills ? [...filters.pills].sort() : [],
      actor: filters.actor ?? null,
      since: filters.since ?? null,
    },
  ] as const;

const PAGE_SIZE = 50;

export function useAuditFeed(
  aid: string,
  filters: AuditFeedFilters = {},
  options: { enabled?: boolean } = {},
) {
  const enabled = options.enabled !== false && Boolean(aid);
  const actions = actionsForPills(filters.pills ?? []);
  return useInfiniteQuery({
    queryKey: auditFeedKey(aid, filters),
    enabled,
    initialPageParam: 0,
    queryFn: async ({ pageParam }) => {
      const offset = (pageParam as number) ?? 0;
      const params: Record<string, string | number> = {
        limit: PAGE_SIZE,
        offset,
      };
      if (actions.length) params.action_in = actions.join(',');
      if (filters.actor) params.actor = filters.actor;
      if (filters.since) params.since = filters.since;
      const raw = await apiFetch<{
        rows: AuditFeedRow[];
        total: number;
        lineage_ref: string | null;
      }>(`/pricing/sku/${encodeURIComponent(aid)}/audit`, {
        params,
        // Test fallback: return an empty page so the component doesn't
        // throw when no mock fixture is registered.
        mockResolve: () => ({ rows: [], total: 0, lineage_ref: null }),
      });
      const page: AuditFeedPage = { ...raw, offset };
      return page;
    },
    getNextPageParam: (last, all) => {
      const fetched = all.reduce((sum, p) => sum + p.rows.length, 0);
      if (fetched >= last.total) return undefined;
      return last.offset + PAGE_SIZE;
    },
    staleTime: 30_000,
  });
}
