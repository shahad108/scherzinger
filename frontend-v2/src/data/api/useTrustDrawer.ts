import { useQuery } from '@tanstack/react-query';
import { apiFetch } from '@/lib/api/client';
import type { TrustDrawerPayload } from '@/types/trustDrawer';

const EMPTY: TrustDrawerPayload = { tiles: [], models: [] };

/**
 * Phase 18 — Trust strip drawer payload backed by model_registry.
 *
 * On 404 / network failure in hybrid mode the call falls back to an
 * empty payload so the drawer renders an honest "no model data" empty
 * state instead of a noisy error.
 */
export function useTrustDrawer(enabled: boolean) {
  return useQuery({
    queryKey: ['models', 'trust-drawer'] as const,
    enabled,
    staleTime: 60_000,
    queryFn: () =>
      apiFetch<TrustDrawerPayload>('/models/trust-drawer', {
        mockResolve: () => EMPTY,
      }),
  });
}
