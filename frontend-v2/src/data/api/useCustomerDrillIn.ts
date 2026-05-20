// Pricing Studio v3 / Phase 2 — Customer Drill-in side-panel hook.
//
// Powers `<CustomerDrillInDrawer>` (per-customer × per-SKU reality view).
// Backed by GET /api/v1/pricing/customer/{customer_id}/sku/{aid}/drill-in.
//
// `proposed_price` is forwarded as a string-encoded Decimal so the URL
// never loses precision through JS float conversion. When the BFF
// can't find the (customer, aid) pair it returns 404 — TanStack
// surfaces that as `isError` and the drawer renders a graceful empty
// state without crashing the surrounding page.

import { useQuery } from '@tanstack/react-query';
import { apiFetch } from '@/lib/api/client';
import type { CustomerDrillInPayload } from '@/types/studio';

export const customerDrillInKey = (
  customer_id: string,
  aid: string,
  proposed_price: string | null,
) =>
  [
    'customer-drill-in',
    customer_id,
    aid,
    proposed_price ?? null,
  ] as const;

export function useCustomerDrillIn(
  customer_id: string | null,
  aid: string,
  proposed_price: string | null = null,
  options: { enabled?: boolean } = {},
) {
  const enabled = options.enabled !== false && Boolean(customer_id) && Boolean(aid);
  return useQuery({
    queryKey: customerDrillInKey(customer_id ?? '', aid, proposed_price),
    enabled,
    queryFn: () =>
      apiFetch<CustomerDrillInPayload>(
        `/pricing/customer/${encodeURIComponent(customer_id ?? '')}/sku/${encodeURIComponent(aid)}/drill-in`,
        {
          params: proposed_price ? { proposed_price } : undefined,
        },
      ),
    staleTime: 30_000,
  });
}
