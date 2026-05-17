// Pricing Studio v3 / Phase 4 — "What changed since you last looked" diff.
//
// Backs `<WhatChangedStrip>` via
// GET /api/v1/pricing/sku/{aid}/diff?since=...
//
// `since` is optional — the BFF reads `user_view_state.last_seen_at` for the
// caller×aid pair when omitted, and stamps it to now() on the way out so the
// next call returns only post-now changes. Empty `changes` → strip stays hidden.

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { apiFetch } from '@/lib/api/client';

/** Mirrors backend `ChangeKind` enum. */
export type SkuDiffChangeKind =
  | 'cost'
  | 'competitor_signal'
  | 'customer_risk'
  | 'price'
  | 'proposal';

export interface SkuDiffChange {
  kind: SkuDiffChangeKind;
  /** Decimal-as-string at the wire. Null for create-only events. */
  before: string | null;
  after: string | null;
  /** Decimal-as-string percent delta. */
  pct: string | null;
  label: string | null;
  customer_id: string | null;
  lineage_ref: string | null;
  link_target: string | null;
}

export interface SkuDiffSummary {
  aid?: string;
  since: string;
  now: string;
  changes: SkuDiffChange[];
  summary_lineage_ref: string;
}

export const skuDiffKey = (aid: string) => ['sku-diff', aid] as const;

export function useSkuDiff(aid: string, options: { enabled?: boolean } = {}) {
  const enabled = options.enabled !== false && Boolean(aid);
  return useQuery({
    queryKey: skuDiffKey(aid),
    enabled,
    queryFn: () =>
      apiFetch<SkuDiffSummary>(`/pricing/sku/${encodeURIComponent(aid)}/diff`, {
        // Test fallback — empty diff so the strip stays hidden by default.
        mockResolve: () => ({
          since: new Date(Date.now() - 5 * 86_400_000).toISOString(),
          now: new Date().toISOString(),
          changes: [],
          summary_lineage_ref: 'mock-lineage',
        }),
      }),
    staleTime: 60_000,
    refetchOnWindowFocus: false,
  });
}

/**
 * Hit the diff endpoint *for its side-effect* (advance `last_seen_at`) without
 * touching the query cache shown to the user. The Dismiss button uses this so
 * the strip collapses and the next page-load shows no stale "since" entries.
 */
export function useDismissSkuDiff(aid: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () =>
      apiFetch<SkuDiffSummary>(`/pricing/sku/${encodeURIComponent(aid)}/diff`, {
        mockResolve: () => ({
          since: new Date().toISOString(),
          now: new Date().toISOString(),
          changes: [],
          summary_lineage_ref: 'mock-lineage',
        }),
      }),
    onSuccess: () => {
      // Drop the cached payload so subsequent reads only surface NEW changes.
      qc.setQueryData<SkuDiffSummary | undefined>(skuDiffKey(aid), (prev) =>
        prev ? { ...prev, changes: [] } : prev,
      );
    },
  });
}
