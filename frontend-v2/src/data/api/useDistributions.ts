// Phase 1 — Per-entity distributions hook.

import { useQuery } from '@tanstack/react-query';
import { apiFetch } from '@/lib/api/client';
import { qk, type SimulatorParams } from '@/lib/api/queryKeys';
import type { ForecastDistributions } from '@/types/forecast';
import forecastMock from '@/data/mocks/forecast.json';

const SEED_DISTRIBUTIONS = (forecastMock as { distributions: ForecastDistributions })
  .distributions;

export function useDistributions(params?: SimulatorParams) {
  return useQuery({
    queryKey: qk.forecastDistributions(params),
    queryFn: () =>
      apiFetch<ForecastDistributions>('/forecast/distributions', {
        params,
        mockResolve: () => withParams(SEED_DISTRIBUTIONS, params),
      }),
    staleTime: 30_000,
  });
}

function withParams(
  seed: ForecastDistributions,
  params?: SimulatorParams,
): ForecastDistributions {
  if (!params) return seed;
  const metric = (params.metric === 'volume' ? 'quantity' : params.metric) ?? seed.metric;
  const horizonMonths = params.horizon_months ?? seed.horizonMonths;
  return { ...seed, metric, horizonMonths };
}
