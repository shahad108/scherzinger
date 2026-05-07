import { useQuery } from '@tanstack/react-query';
import { apiFetch } from '@/lib/api/client';
import type { MarginCockpitData } from '@/types';

export function useMarginCockpit() {
  return useQuery({
    queryKey: ['margin-cockpit'] as const,
    queryFn: () => apiFetch<MarginCockpitData>('/margin-cockpit'),
    staleTime: 60_000,
  });
}
