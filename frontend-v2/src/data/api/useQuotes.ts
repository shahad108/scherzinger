import { useQuery } from '@tanstack/react-query';
import { apiFetch } from '@/lib/api/client';
import { qk, type QuotesParams } from '@/lib/api/queryKeys';
import type { QuotesShell } from '@/types/quotes';

export function useQuotes(params?: QuotesParams) {
  return useQuery({
    queryKey: qk.quotes(params),
    queryFn: () => apiFetch<QuotesShell>('/quotes', { params }),
    staleTime: 60_000,
  });
}
