import { useQuery } from '@tanstack/react-query';
import { apiFetch } from '@/lib/api/client';
import type { ForecastShell } from '@/types/forecast';

export function useForecast() {
  return useQuery({
    queryKey: ['forecast'] as const,
    queryFn: () => apiFetch<ForecastShell>('/forecast'),
    staleTime: 60_000,
  });
}
