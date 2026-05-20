// Phase 1 — Tornado data hook.
//
// Hits the dedicated `/forecast/tornado` endpoint so the mode toggle can
// invalidate only the tornado slice (not the entire screen) when Frank
// flips Revenue ↔ Margin ↔ Volume.
//
// In mock mode (no VITE_SCHERZINGER_API), pulls from the bundled forecast.json
// so we keep a single source of truth for the seed data.

import { useQuery } from '@tanstack/react-query';
import { apiFetch } from '@/lib/api/client';
import { qk, type SimulatorParams } from '@/lib/api/queryKeys';
import type { ForecastTornado } from '@/types/forecast';
import forecastMock from '@/data/mocks/forecast.json';

const SEED_TORNADO = (forecastMock as { tornado: ForecastTornado }).tornado;

export function useTornado(params?: SimulatorParams) {
  return useQuery({
    queryKey: qk.forecastTornado(params),
    queryFn: () =>
      apiFetch<ForecastTornado>('/forecast/tornado', {
        params,
        mockResolve: () => withParams(SEED_TORNADO, params),
      }),
    staleTime: 30_000,
  });
}

function withParams(seed: ForecastTornado, params?: SimulatorParams): ForecastTornado {
  if (!params) return seed;
  const metric = (params.metric === 'volume' ? 'quantity' : params.metric) ?? seed.metric;
  const horizonMonths = params.horizon_months ?? seed.horizonMonths;
  return { ...seed, metric, horizonMonths };
}
