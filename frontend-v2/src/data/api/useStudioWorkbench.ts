/**
 * Phase 8 P8.T3 — per-SKU workbench, lazy-fetched.
 *
 * The Studio shell endpoint stops shipping every SKU's workbench. The
 * picker fetches a workbench by aid only when the user lands on a
 * different SKU. React Query caches per aid for 60s.
 *
 * In mock mode the legacy ``buildWorkbench`` derivation in
 * ``data/api/studio-workbench.ts`` still produces a usable workbench
 * client-side, so this hook is a no-op in that environment.
 */
import { useQuery } from '@tanstack/react-query';
import { apiFetch } from '@/lib/api/client';
import { qk } from '@/lib/api/queryKeys';
import type { WorkbenchData } from '@/types/studio';

export function useStudioWorkbench(aid: string | null | undefined) {
  return useQuery({
    queryKey: qk.studioWorkbench(aid ?? ''),
    queryFn: () => apiFetch<WorkbenchData>(`/screens/studio/workbench/${aid}`),
    enabled: !!aid,
    staleTime: 60_000,
  });
}

export function useStudioComparable(aid: string | null | undefined) {
  return useQuery({
    queryKey: qk.studioComparable(aid ?? ''),
    queryFn: () => apiFetch(`/screens/studio/comparable/${aid}`),
    enabled: !!aid,
    staleTime: 60_000,
  });
}

// Alias for new code; ``useStudio`` (existing) continues to work as the
// shell hook under its original name.
export { useStudio as useStudioShell } from './useStudio';
