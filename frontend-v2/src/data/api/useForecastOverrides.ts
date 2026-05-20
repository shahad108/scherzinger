import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type {
  ForecastMode,
  ForecastOverride,
  OverrideConfidence,
  OverrideSource,
} from '@/types/forecast';

const BASE = '/api/v1/forecast/overrides';

export interface OverrideListParams {
  month?: string;
  cluster?: string | null;
}

export interface CreateOverrideBody {
  month: string;
  cluster: string | null;
  mode: ForecastMode;
  actual: number;
  modelP50: number;
  source: OverrideSource;
  confidence: OverrideConfidence;
  reason: string;
  author?: string;
}

export function useForecastOverrides(params: OverrideListParams = {}) {
  const qs = new URLSearchParams();
  if (params.month) qs.set('month', params.month);
  if (params.cluster) qs.set('cluster', params.cluster);
  const url = qs.toString() ? `${BASE}?${qs}` : BASE;
  return useQuery({
    queryKey: ['forecast-overrides', params],
    queryFn: async (): Promise<{ items: ForecastOverride[] }> => {
      const r = await fetch(url);
      if (!r.ok) throw new Error(`overrides list failed: ${r.status}`);
      return r.json();
    },
  });
}

export function useCreateOverride() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (body: CreateOverrideBody): Promise<ForecastOverride> => {
      const r = await fetch(BASE, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(body),
      });
      if (!r.ok) throw new Error(`override create failed: ${r.status}`);
      return r.json();
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['forecast-overrides'] }),
  });
}

export function useUpdateOverride() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({
      id,
      patch,
    }: {
      id: string;
      patch: Partial<CreateOverrideBody>;
    }): Promise<ForecastOverride> => {
      const r = await fetch(`${BASE}/${id}`, {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(patch),
      });
      if (!r.ok) throw new Error(`override update failed: ${r.status}`);
      return (await r.json()) as ForecastOverride;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['forecast-overrides'] }),
  });
}

export function useDeleteOverride() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const r = await fetch(`${BASE}/${id}`, { method: 'DELETE' });
      if (!r.ok) throw new Error(`override delete failed: ${r.status}`);
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['forecast-overrides'] }),
  });
}
