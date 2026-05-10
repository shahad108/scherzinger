import { useQuery } from '@tanstack/react-query';
import { apiFetch } from '@/lib/api/client';
import { qk, type ActionCenterParams } from '@/lib/api/queryKeys';
import type { ActionCenterData } from '@/types';

const SYNTH_PROPOSALS_KEY = 'pryzm_v2_synth_proposals';

interface SynthProposal {
  recommendation_id: string | null;
  status: string;
}

/**
 * Pure-mock-mode parity with the Phase 1 live composer: filter out
 * decisions whose recommendationId already has a proposal in the
 * sessionStorage synthetic store. The live backend filters via
 * `workflow_service.get_recommendation_status_map` — this mirrors that
 * behavior so demos see "accept → refresh → card gone" without a server.
 */
function filterByLocalProposals(data: ActionCenterData): ActionCenterData {
  if (typeof window === 'undefined') return data;
  let synth: SynthProposal[] = [];
  try {
    synth = JSON.parse(window.sessionStorage.getItem(SYNTH_PROPOSALS_KEY) ?? '[]');
  } catch {
    return data;
  }
  if (!synth.length) return data;
  const consumedIds = new Set(
    synth
      .filter((p) =>
        ['draft', 'pending_approval', 'approved', 'implemented', 'rejected', 'sent'].includes(p.status),
      )
      .map((p) => p.recommendation_id)
      .filter((id): id is string => Boolean(id)),
  );
  if (consumedIds.size === 0) return data;
  return {
    ...data,
    decisions: data.decisions.filter((d) => !d.recommendationId || !consumedIds.has(d.recommendationId)),
  };
}

export function useActionCenter(params?: ActionCenterParams) {
  return useQuery({
    queryKey: qk.actionCenter(params),
    queryFn: async () => {
      const raw = await apiFetch<ActionCenterData>('/screens/action-center', { params });
      return filterByLocalProposals(raw);
    },
    staleTime: 60_000,
    // Phase 14 follow-up — auto-refresh once a minute so newly-arrived
    // decisions / lost quotes / audit events surface without a manual
    // refresh. The composer's 60s server cache means the worst-case
    // freshness is ~120s; close enough to "live" for analyst workflows.
    refetchInterval: 60_000,
    refetchIntervalInBackground: false,
  });
}
