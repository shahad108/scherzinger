import { useQuery } from '@tanstack/react-query';
import { apiFetch } from '@/lib/api/client';
import { qk, type MarginCockpitParams } from '@/lib/api/queryKeys';
import type { MarginCockpitData } from '@/types';

export function useMarginCockpit(params?: MarginCockpitParams) {
  return useQuery({
    queryKey: qk.marginCockpit(params),
    queryFn: () => apiFetch<MarginCockpitData>('/margin-cockpit', { params }),
    staleTime: 60_000,
  });
}
