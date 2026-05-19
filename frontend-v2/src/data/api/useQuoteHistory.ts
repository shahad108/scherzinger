// Pricing Studio v3 / Phase E3 — SKU quote history data hook.
//
// Backs `<QuoteHistoryPane>` via
//   GET /api/v1/pricing/sku/{aid}/quote-history
//
// The endpoint always returns a typed `QuoteHistoryBlock` with an explicit
// `status` (`"live" | "empty" | "degraded"`) so the consumer never needs
// to guess from an empty array. 60s staleTime mirrors the other workbench
// hooks (cost-outlook, etc.) — fresh enough for tab-switch, infrequent
// enough to avoid thundering the BFF when the user toggles around.

import { useQuery } from '@tanstack/react-query';
import { apiFetch } from '@/lib/api/client';
import type { QuoteHistoryBlock } from '@/types/studio';

export const quoteHistoryKey = (aid: string | null | undefined) =>
  ['pricing', 'quote-history', aid ?? ''] as const;

/**
 * Typed wrapper around `GET /pricing/sku/{aid}/quote-history`. Lazy: stays
 * disabled while `aid` is null/empty so the workbench can mount before a
 * SKU is selected. Consumers should treat `data.status` as the
 * source-of-truth for rendering the empty / degraded states; `data.rows`
 * may still be empty even when `status === "live"` is impossible (the BFF
 * returns `status="empty"` in that case).
 */
export function useQuoteHistory(
  aid: string | null | undefined,
  options: { enabled?: boolean } = {},
) {
  const enabled = options.enabled !== false && Boolean(aid);
  return useQuery({
    queryKey: quoteHistoryKey(aid),
    enabled,
    queryFn: () =>
      apiFetch<QuoteHistoryBlock>(
        `/pricing/sku/${encodeURIComponent(aid as string)}/quote-history`,
      ),
    staleTime: 60_000,
  });
}
