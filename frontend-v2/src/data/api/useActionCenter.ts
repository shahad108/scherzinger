import { useQuery } from '@tanstack/react-query';
import { apiFetch } from '@/lib/api/client';
import { qk, type ActionCenterParams } from '@/lib/api/queryKeys';
import type { ActionCenterData } from '@/types';

export function useActionCenter(params?: ActionCenterParams) {
  return useQuery({
    queryKey: qk.actionCenter(params),
    queryFn: () => apiFetch<ActionCenterData>('/screens/action-center', { params }),
    staleTime: 60_000,
    // Phase 14 follow-up — auto-refresh once a minute so newly-arrived
    // decisions / lost quotes / audit events surface without a manual
    // refresh. The composer's 60s server cache means the worst-case
    // freshness is ~120s; close enough to "live" for analyst workflows.
    refetchInterval: 60_000,
    refetchIntervalInBackground: false,
  });
}
