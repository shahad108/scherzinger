import { useQuery } from '@tanstack/react-query';
import { apiFetch } from '@/lib/api/client';
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

export function useStudio() {
  return useQuery({
    queryKey: ['studio'] as const,
    queryFn: async () => {
      const raw = await apiFetch<StudioShell>('/studio');
      return enrichSkus(raw);
    },
    staleTime: 60_000,
  });
}
