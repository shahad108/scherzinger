// Pricing Studio v3 / Phase 2 — re-score the customer fanout at a price.
//
// When the user changes the active price option (or picks a custom
// price), POST /api/v1/screens/studio/fanout with { aid, proposed_price }
// and surface the re-scored rows. Cached by (aid, proposed_price) so
// repeated taps on the same option are a cache hit.
//
// We use `useQuery` keyed on the price (not a mutation) because:
//   1. SSE invalidation (pricing.customer_state_updated) needs to
//      target a queryKey prefix.
//   2. Switching back to a previously-selected price should be instant.

import { useQuery } from '@tanstack/react-query';
import { postJson } from '@/lib/api/client';
import type { CustomerFanoutBlock } from '@/types/studio';

export const fanoutRescoreKey = (aid: string, proposed_price: string) =>
  ['studio-fanout', aid, proposed_price] as const;

export function useFanoutRescore(
  aid: string,
  proposed_price: string | null,
  options: { enabled?: boolean } = {},
) {
  const enabled = options.enabled !== false && Boolean(aid) && Boolean(proposed_price);
  return useQuery({
    queryKey: fanoutRescoreKey(aid, proposed_price ?? ''),
    enabled,
    queryFn: () =>
      postJson<CustomerFanoutBlock>('/screens/studio/fanout', {
        aid,
        proposed_price,
      }),
    staleTime: 30_000,
  });
}
