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

export function useStudio(params?: StudioParams) {
  return useQuery({
    queryKey: qk.studio(params),
    queryFn: async () => {
      const raw = await apiFetch<StudioShell>('/studio', { params });
      return enrichSkus(raw);
    },
    staleTime: 60_000,
  });
}
