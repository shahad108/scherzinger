import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type {
  AnnotationTarget,
  AnnotationTargetKind,
  ForecastAnnotation,
} from '@/types/forecast';

const BASE = '/api/v1/forecast/annotations';

export interface AnnotationListParams {
  target?: AnnotationTarget;
  targetKind?: AnnotationTargetKind;
  targetValue?: string;
}

export interface CreateAnnotationBody {
  target: AnnotationTarget;
  body: string;
}

function buildQuery(params: AnnotationListParams): string {
  const qs = new URLSearchParams();
  const kind = params.target?.kind ?? params.targetKind;
  const value = params.target?.value ?? params.targetValue;
  if (kind) qs.set('target_kind', kind);
  if (value) qs.set('target_value', value);
  return qs.toString();
}

export function useForecastAnnotations(params: AnnotationListParams = {}) {
  const qs = buildQuery(params);
  const url = qs ? `${BASE}?${qs}` : BASE;
  return useQuery({
    queryKey: ['forecast-annotations', params],
    queryFn: async (): Promise<{ items: ForecastAnnotation[] }> => {
      const r = await fetch(url);
      if (!r.ok) throw new Error(`annotations list failed: ${r.status}`);
      return r.json();
    },
  });
}

export function useCreateAnnotation() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (body: CreateAnnotationBody): Promise<ForecastAnnotation> => {
      const r = await fetch(BASE, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(body),
      });
      if (!r.ok) throw new Error(`annotation create failed: ${r.status}`);
      return r.json();
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['forecast-annotations'] }),
  });
}

export function useDeleteAnnotation() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const r = await fetch(`${BASE}/${id}`, { method: 'DELETE' });
      if (!r.ok) throw new Error(`annotation delete failed: ${r.status}`);
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['forecast-annotations'] }),
  });
}
