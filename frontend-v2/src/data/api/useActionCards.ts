import { useQuery } from '@tanstack/react-query';
import { apiFetch } from '@/lib/api/client';
import { qk, type ActionCardsParams } from '@/lib/api/queryKeys';
import type { ActionCard } from '@/types';

export function useActionCards(params?: ActionCardsParams) {
  return useQuery({
    queryKey: qk.actionCards(params),
    queryFn: () => apiFetch<ActionCard[]>('/action-cards', { params }),
    staleTime: 60_000,
  });
}
