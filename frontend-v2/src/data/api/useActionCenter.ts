import { useQuery } from '@tanstack/react-query';
import { apiFetch } from '@/lib/api/client';
import { qk, type ActionCenterParams } from '@/lib/api/queryKeys';
import type { ActionCenterData } from '@/types';

export function useActionCenter(params?: ActionCenterParams) {
  return useQuery({
    queryKey: qk.actionCenter(params),
    queryFn: () => apiFetch<ActionCenterData>('/action-center', { params }),
    staleTime: 60_000,
  });
}
