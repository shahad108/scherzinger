// Phase 2 — Audit lineage hook.
//
// Lazy-loaded by LineageDrawer when an AccuracyBadge is clicked.

import { useQuery } from '@tanstack/react-query';
import { apiFetch } from '@/lib/api/client';
import type { LineagePayload } from '@/types/forecast';
import forecastMock from '@/data/mocks/forecast.json';

interface LineageParams {
  entity_type?: string;
  entity_id?: string;
  metric?: string;
  model_id?: string;
}

export function useLineage(params: LineageParams, enabled = true) {
  return useQuery({
    queryKey: ['forecast-lineage', params],
    queryFn: () =>
      apiFetch<LineagePayload>('/forecast/lineage', {
        params,
        mockResolve: () => synthesizeLineage(params),
      }),
    enabled,
    staleTime: 60_000,
  });
}

function synthesizeLineage(params: LineageParams): LineagePayload {
  const m = (forecastMock as { methodology: { models: ModelLike[]; sources: SourceLike[] } })
    .methodology;
  return {
    entityType: params.entity_type ?? 'commodity_group',
    entityId: params.entity_id ?? null,
    metric: params.metric ?? null,
    models: m.models
      .filter(
        (mm) =>
          !params.entity_type ||
          mm.entityType === params.entity_type ||
          mm.entityType === 'overall',
      )
      .map((mm) => ({
        ...mm,
        entityId: params.entity_id ?? null,
        featureList: [
          'last_actual_db2_margin',
          'rolling_residuals',
          'steel_index',
          'eur_usd',
          'ifo',
          'seasonal_indices',
        ],
      })),
    auditChain: [],
    sources: m.sources,
  };
}

type ModelLike = {
  modelName: string;
  version: string;
  trainedAt: string | null;
  holdoutMonths: number | null;
  entityType: string;
  metric: string;
  metricValue: number | null;
  nObservations: number | null;
  notes?: string | null;
};
type SourceLike = {
  name: string;
  kind: 'internal' | 'external';
  description: string;
  lastFetchedAt: string;
};
