import { useQuery } from '@tanstack/react-query';
import { apiFetch } from '@/lib/api/client';
import { qk } from '@/lib/api/queryKeys';
import type { ActionCard } from '@/types';

export function useActionCards() {
  return useQuery({
    queryKey: qk.actionCards,
    queryFn: () => apiFetch<ActionCard[]>('/action-cards'),
    staleTime: 60_000,
  });
}
