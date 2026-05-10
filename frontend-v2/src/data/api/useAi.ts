import { useQuery } from '@tanstack/react-query';
import { apiFetch } from '@/lib/api/client';
import { qk, type AiParams } from '@/lib/api/queryKeys';
import type { AiShell } from '@/types/ai';

export function useAi(params?: AiParams) {
  return useQuery({
    queryKey: qk.ai(params),
    queryFn: () => apiFetch<AiShell>('/screens/ai', { params }),
    staleTime: 60_000,
  });
}
