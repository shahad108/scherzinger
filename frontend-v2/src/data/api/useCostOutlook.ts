// Pricing Studio v3 / Phase 3 — Cost Trajectory Drawer data hook.
//
// Backs `<CostTrajectoryDrawer>` via
// GET /api/v1/pricing/sku/{aid}/cost-outlook?horizon_months=N
//
// The BFF returns 404 when no CostState exists for the SKU; TanStack
// surfaces that as `isError` and the drawer renders a DataMissingBadge
// rather than crashing. 30-second staleTime mirrors the other Phase 3
// drawers — fresh enough for slider-drag, infrequent enough to avoid
// thundering the BFF.

import { useQuery } from '@tanstack/react-query';
import { apiFetch } from '@/lib/api/client';
import type { CostOutlookPayload } from '@/types/studio';

export const costOutlookKey = (aid: string, horizonMonths: number) =>
  ['cost-outlook', aid, horizonMonths] as const;

export function useCostOutlook(
  aid: string,
  horizonMonths = 6,
  options: { enabled?: boolean } = {},
) {
  const enabled = options.enabled !== false && Boolean(aid);
  return useQuery({
    queryKey: costOutlookKey(aid, horizonMonths),
    enabled,
    queryFn: () =>
      apiFetch<CostOutlookPayload>(
        `/pricing/sku/${encodeURIComponent(aid)}/cost-outlook`,
        { params: { horizon_months: horizonMonths } },
      ),
    staleTime: 30_000,
  });
}
