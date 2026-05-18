/**
 * Phase 8 P8.T3 — per-SKU workbench, lazy-fetched.
 *
 * The Studio shell endpoint stops shipping every SKU's workbench. The
 * picker fetches a workbench by aid only when the user lands on a
 * different SKU. React Query caches per aid for 60s.
 *
 * Pricing Studio v3 / Phase C1 — the client no longer derives a synthetic
 * workbench from a hard-coded seed-customer table; the BFF
 * (``/screens/studio/workbench/{aid}``) is the single source of truth.
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
