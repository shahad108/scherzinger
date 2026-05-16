import { useQuery } from '@tanstack/react-query';
import { apiFetch } from '@/lib/api/client';
import { qk, type StudioParams } from '@/lib/api/queryKeys';
import type { SkuListEntry, StudioShell } from '@/types/studio';
import { buildWorkbench } from './studio-workbench';

function enrichSkus(data: StudioShell): StudioShell {
  return {
    ...data,
    skus: data.skus.map((sku): SkuListEntry => {
      if (sku.aid === data.defaultAid) {
        return { ...sku, workbench: data.workbench };
      }
      if (!sku.workbenchPatch) return sku;
      return { ...sku, workbench: buildWorkbench(sku, sku.workbenchPatch, data.workbench) };
    }),
  };
}

/**
 * Strip undefined/null/empty values from the params object so the BFF
 * receives only the filters the user actually picked. Stable shape is
 * important for query-key equality (so cache hits work).
 */
function tidyParams(params?: StudioParams): StudioParams | undefined {
  if (!params) return undefined;
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(params)) {
    if (v === undefined || v === null || v === '') continue;
    out[k] = v;
  }
  return Object.keys(out).length ? (out as StudioParams) : undefined;
}

export function useStudio(params?: StudioParams) {
  const effective = tidyParams(params);
  return useQuery({
    queryKey: qk.studio(effective),
    queryFn: async () => {
      const raw = await apiFetch<StudioShell>('/screens/studio', { params: effective });
      return enrichSkus(raw);
    },
    staleTime: 60_000,
  });
}
