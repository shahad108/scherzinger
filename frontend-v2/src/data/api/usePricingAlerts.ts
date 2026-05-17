// Pricing Studio v3 / Phase 9 — Alerts engine client surface.
//
// Wraps the four /api/v1/pricing/alerts endpoints:
//   - POST   /alerts            → useCreateAlert
//   - GET    /alerts            → usePricingAlerts
//   - DELETE /alerts/{id}       → useDisableAlert
//   - GET    /alerts/inbox      → useAlertInbox
//
// The discriminated `AlertSpec` mirrors the backend pydantic union
// exactly (kind-tagged). Decimals (pct/pp) stay strings on the wire so
// we never lose cent precision crossing JSON — every form input is
// numeric in the UI but serialized as a string before POST.

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { apiFetch, postJson } from '@/lib/api/client';
import { qk } from '@/lib/api/queryKeys';

export type AlertKind =
  | 'cost_threshold'
  | 'competitor_undercut'
  | 'churn_spike'
  | 'floor_cross'
  | 'proposal_stuck'
  | 'pa_pr_surge'
  | 'cluster_db2_drop';

export type AlertChannel = 'in_app' | 'email' | 'slack';

export interface AlertScopeInput {
  aid?: string | null;
  cluster?: string | null;
  family?: string | null;
}

/** Shared scope/channel/created_by envelope on every spec subclass. */
interface AlertSpecCommon extends AlertScopeInput {
  channels?: AlertChannel[];
  created_by?: string;
}

export interface CostThresholdSpec extends AlertSpecCommon {
  kind: 'cost_threshold';
  pct: string;
  days: number;
}

export interface CompetitorUndercutSpec extends AlertSpecCommon {
  kind: 'competitor_undercut';
  pct: string;
}

export interface ChurnSpikeSpec extends AlertSpecCommon {
  kind: 'churn_spike';
  pp: string;
}

export interface FloorCrossSpec extends AlertSpecCommon {
  kind: 'floor_cross';
}

export interface ProposalStuckSpec extends AlertSpecCommon {
  kind: 'proposal_stuck';
  days: number;
}

export interface PaPrSurgeSpec extends AlertSpecCommon {
  kind: 'pa_pr_surge';
  count: number;
  days: number;
}

export interface ClusterDb2DropSpec extends AlertSpecCommon {
  kind: 'cluster_db2_drop';
  pp: string;
}

export type AlertSpec =
  | CostThresholdSpec
  | CompetitorUndercutSpec
  | ChurnSpikeSpec
  | FloorCrossSpec
  | ProposalStuckSpec
  | PaPrSurgeSpec
  | ClusterDb2DropSpec;

export interface PricingAlert {
  id: string;
  kind: AlertKind;
  spec_json: Record<string, unknown>;
  scope: { aid: string | null; cluster: string | null; family: string | null };
  channels: AlertChannel[];
  created_by: string;
  enabled: boolean;
  created_at: string | null;
}

export interface PricingAlertEvent {
  id: string;
  alert_id: string;
  triggered_at: string | null;
  payload: Record<string, unknown> & {
    aid?: string | null;
    cluster?: string | null;
  };
  channels_dispatched: AlertChannel[];
  kind?: AlertKind;
  scope?: { aid: string | null; cluster: string | null; family: string | null };
}

interface AlertsListResponse {
  alerts: PricingAlert[];
}

interface AlertInboxResponse {
  events: PricingAlertEvent[];
}

interface CreateAlertResponse {
  alert: PricingAlert;
}

interface DisableAlertResponse {
  alert: PricingAlert;
}

export function usePricingAlerts(opts?: { includeDisabled?: boolean }) {
  const includeDisabled = opts?.includeDisabled ?? false;
  return useQuery<AlertsListResponse>({
    queryKey: [...qk.pricingAlerts(), { includeDisabled }] as const,
    queryFn: () =>
      apiFetch<AlertsListResponse>('/pricing/alerts', {
        params: { include_disabled: includeDisabled },
        mockResolve: () => ({ alerts: [] }),
      }),
    staleTime: 60_000,
  });
}

export function useAlertInbox() {
  return useQuery<AlertInboxResponse>({
    queryKey: qk.pricingAlertsInbox(),
    queryFn: () =>
      apiFetch<AlertInboxResponse>('/pricing/alerts/inbox', {
        mockResolve: () => ({ events: [] }),
      }),
    staleTime: 30_000,
    refetchOnWindowFocus: true,
  });
}

export function useCreateAlert() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (spec: AlertSpec) =>
      postJson<CreateAlertResponse>('/pricing/alerts', spec, {
        mockResolve: () => ({
          alert: {
            id:
              typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
                ? crypto.randomUUID()
                : `mock-${Date.now()}`,
            kind: spec.kind,
            spec_json: {},
            scope: {
              aid: spec.aid ?? null,
              cluster: spec.cluster ?? null,
              family: spec.family ?? null,
            },
            channels: spec.channels ?? ['in_app'],
            created_by: 'mock-user',
            enabled: true,
            created_at: new Date().toISOString(),
          },
        }),
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: qk.pricingAlerts() });
      qc.invalidateQueries({ queryKey: qk.pricingAlertsInbox() });
    },
  });
}

export function useDisableAlert() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (alertId: string) => {
      // No deleteJson primitive in the client; inline the request so we
      // still honour CSRF + credentials like every other mutation.
      if (import.meta.env.MODE === 'test') {
        return { alert: { id: alertId, enabled: false } } as DisableAlertResponse;
      }
      const base =
        (import.meta.env.VITE_SCHERZINGER_API as string | undefined) || '/api/v1';
      const csrf = readCookie('pryzm_csrf');
      const headers: Record<string, string> = {};
      if (csrf) headers['x-csrf'] = csrf;
      const res = await fetch(
        `${base}/pricing/alerts/${encodeURIComponent(alertId)}`,
        { method: 'DELETE', credentials: 'include', headers },
      );
      if (!res.ok) {
        throw new Error(`DELETE /pricing/alerts/${alertId} → ${res.status}`);
      }
      return (await res.json()) as DisableAlertResponse;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: qk.pricingAlerts() });
    },
  });
}

function readCookie(name: string): string | null {
  if (typeof document === 'undefined') return null;
  const prefix = `${name}=`;
  for (const part of document.cookie.split(';')) {
    const trimmed = part.trim();
    if (trimmed.startsWith(prefix)) {
      return decodeURIComponent(trimmed.slice(prefix.length));
    }
  }
  return null;
}
