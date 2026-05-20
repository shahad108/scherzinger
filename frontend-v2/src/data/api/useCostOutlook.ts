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
import type { CostOutlookBlock } from '@/types/studio';

export const costOutlookKey = (
  aid: string | null | undefined,
  horizonMonths: number,
) => ['cost-outlook', aid ?? '', horizonMonths] as const;

/**
 * Phase C3 — typed wrapper around
 *   GET /api/v1/pricing/sku/{aid}/cost-outlook?horizon_months=N
 *
 * Lazy: stays disabled while `aid` is null/empty so the workbench can mount
 * before a SKU is selected. 60-second `staleTime` keeps slider-drag from
 * thundering the BFF. The BFF returns 404 when no CostState exists for the
 * SKU; TanStack surfaces that as `isError` and consumers render a
 * DataMissingBadge rather than crashing.
 */
export function useCostOutlook(
  aid: string | null | undefined,
  horizonMonths = 6,
  options: { enabled?: boolean } = {},
) {
  const enabled = options.enabled !== false && Boolean(aid);
  return useQuery({
    queryKey: costOutlookKey(aid, horizonMonths),
    enabled,
    queryFn: () =>
      apiFetch<CostOutlookBlock>(
        `/pricing/sku/${encodeURIComponent(aid as string)}/cost-outlook`,
        { params: { horizon_months: horizonMonths } },
      ),
    staleTime: 60_000,
  });
}
