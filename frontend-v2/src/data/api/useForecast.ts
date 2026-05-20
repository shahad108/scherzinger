import { useQuery } from '@tanstack/react-query';
import { apiFetch } from '@/lib/api/client';
import { qk, type ForecastParams } from '@/lib/api/queryKeys';
import type { ForecastShell } from '@/types/forecast';

export function useForecast(params?: ForecastParams) {
  return useQuery({
    queryKey: qk.forecast(params),
    // Phase 1 — the BFF reads `mode` + `horizon` from the query string and
    // re-runs the composer so the screen-wide payload (header, hero, tornado,
    // distributions) all line up.
    queryFn: () => apiFetch<ForecastShell>('/screens/forecast', { params }),
    staleTime: 60_000,
  });
}
