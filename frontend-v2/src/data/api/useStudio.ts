import { useQuery } from '@tanstack/react-query';
import { apiFetch } from '@/lib/api/client';
import type { StudioShell } from '@/types/studio';

export function useStudio() {
  return useQuery({
    queryKey: ['studio'] as const,
    queryFn: () => apiFetch<StudioShell>('/studio'),
    staleTime: 60_000,
  });
}
