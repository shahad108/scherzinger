import { useQuery } from '@tanstack/react-query';
import { apiFetch } from '@/lib/api/client';
import type { AiShell } from '@/types/ai';

export function useAi() {
  return useQuery({
    queryKey: ['ai-briefing'] as const,
    queryFn: () => apiFetch<AiShell>('/ai'),
    staleTime: 60_000,
  });
}
