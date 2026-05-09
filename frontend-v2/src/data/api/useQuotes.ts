import { useQuery } from '@tanstack/react-query';
import { apiFetch } from '@/lib/api/client';
import type { QuotesShell } from '@/types/quotes';

export function useQuotes() {
  return useQuery({
    queryKey: ['quotes'] as const,
    queryFn: () => apiFetch<QuotesShell>('/quotes'),
    staleTime: 60_000,
  });
}
