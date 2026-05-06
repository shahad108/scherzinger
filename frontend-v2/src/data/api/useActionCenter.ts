import { useQuery } from '@tanstack/react-query';
import { apiFetch } from '@/lib/api/client';
import type { ActionCenterData } from '@/types';

export function useActionCenter() {
  return useQuery({
    queryKey: ['action-center'] as const,
    queryFn: () => apiFetch<ActionCenterData>('/action-center'),
    staleTime: 60_000,
  });
}
