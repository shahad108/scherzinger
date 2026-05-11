// Phase 12 mutation hooks for /api/v1/actions/{kind} + /audit/recent.
//
// Every state-changing call from the UI funnels through `runAction(kind, body)`.
// An idempotency key derived from (kind, target_id) goes in the
// `x-pryzm-idempotency-key` header so retries from React Query never produce
// duplicate audit rows. Per-screen invalidation lives in the per-kind wrappers
// at the bottom of this file.

import {
  useMutation,
  useQuery,
  useQueryClient,
  type QueryKey,
} from '@tanstack/react-query';

import { apiFetch, postJson } from '@/lib/api/client';
import { qk } from '@/lib/api/queryKeys';

export type ActionKind =
  | 'accept_recommendation'
  | 'decline_recommendation'
  | 'partial_accept'
  | 'snooze_recommendation'
  | 'queue_renewal'
  | 'start_ab_test'
  | 'stop_ab_test'
  | 'hold_ab_test'
  | 'promote_ab_test'
  | 'quote_approve'
  | 'quote_counter'
  | 'quote_decline'
  | 'quote_hold'
  | 'quote_bulk'
  | 'studio_accept'
  | 'briefing_forward'
  | 'briefing_pdf'
  | 'briefing_email'
  | 'guardrail_edit_request'
  | 'guardrail_apply'
  | 'forecast_override'
  | 'notification_read'
  | 'section_save'
  | 'section_remove'
  | 'share_decision';

export interface ActionBody {
  target_type?: string;
  target_id?: string;
  aid?: string;
  delta_pp?: number;
  before?: Record<string, unknown>;
  after?: Record<string, unknown>;
  // Per-kind extras (slice_pct, control_price, …) live here.
  [key: string]: unknown;
}

export interface AuditRow {
  id: string;
  actor: string;
  actor_persona: string;
  kind: ActionKind | string;
  target_type: string | null;
  target_id: string | null;
  before: Record<string, unknown> | null;
  after: Record<string, unknown> | null;
  delta_pp: number | null;
  audit_hash: string;
  created_at: string | null;
}

export interface AbSimulationSummary {
  stage: 'pre_launch' | 'mid_run' | string;
  recommendation: 'launch' | 'hold' | 'block' | string;
  detected_lift_pp?: number | null;
  detected_lift_pct?: number | null;
  p_value?: number | null;
  observed_arms?: { control_n?: number | null; treatment_n?: number | null };
  blockers?: string[];
  warnings?: string[];
  [key: string]: unknown;
}

export interface ActionResponse {
  replay: boolean;
  audit: AuditRow;
  // start_ab_test / stop_ab_test / notification_read attach extras.
  ab_test_id?: string;
  aid?: string;
  status?: string;
  decision_state?: string;
  simulation_status?: string;
  simulation_summary?: AbSimulationSummary;
  launch_readiness?: 'ready' | 'blocked' | string;
  blockers?: string[];
  notification_id?: string;
  unread?: boolean;
  // share_decision extras (Phase 11).
  recipient?: 'till' | 'heiko' | string;
  recipient_user_id?: string | null;
  recipient_resolved?: boolean;
  note_id?: string;
  share_link?: string;
  audit_hash?: string;
}

/** Default idempotency key generator: stable per (kind, target). */
function defaultIdempotencyKey(kind: ActionKind, body: ActionBody): string {
  const target = body.target_id ?? body.aid ?? 'na';
  return `${kind}:${target}`;
}

/**
 * Mock-mode parity for the live FastAPI dispatcher: when accept_recommendation
 * or partial_accept lands, the backend ALSO writes a draft pricing proposal
 * + flips the recommendation status. We mirror that into the synthetic store
 * so demos see the same Studio panel + Action Center filtering they would
 * with a real server.
 */
function syncSynthProposalForMock(kind: ActionKind, body: ActionBody): void {
  if (typeof window === 'undefined') return;
  if (kind !== 'accept_recommendation' && kind !== 'partial_accept') return;
  const recId = (body.recommendation_id as string | undefined) ?? (body.target_id as string | undefined);
  if (!recId) return;
  const articleId =
    (body.article_id as string | undefined) ?? (body.aid as string | undefined) ?? recId.split(':').pop() ?? recId;
  const after = (body.after as Record<string, unknown> | undefined) ?? {};
  const synthKey = 'pryzm_v2_synth_proposals';
  let rows: Record<string, unknown>[] = [];
  try {
    rows = JSON.parse(window.sessionStorage.getItem(synthKey) ?? '[]');
  } catch {
    rows = [];
  }
  // Idempotent: if a proposal already exists for this rec_id, skip.
  if (rows.some((r) => r.recommendation_id === recId)) return;
  const row = {
    id: `mock-${kind}-${Date.now()}`,
    recommendation_id: recId,
    article_id: articleId,
    current_price: (body.current_price as number | undefined) ?? null,
    proposed_price: (body.proposed_price as number | undefined) ?? null,
    delta_pp: (body.delta_pp as number | undefined) ?? null,
    status: 'draft' as const,
    approval_required: kind === 'partial_accept',
    payload: { variant: kind === 'partial_accept' ? 'par' : 'acc', ...after },
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  };
  window.sessionStorage.setItem(synthKey, JSON.stringify([row, ...rows]));
}

export async function runAction(
  kind: ActionKind,
  body: ActionBody = {},
  options?: { idempotencyKey?: string },
): Promise<ActionResponse> {
  const key = options?.idempotencyKey ?? defaultIdempotencyKey(kind, body);
  return postJson<ActionResponse>(`/actions/${kind}`, body, {
    headers: { 'x-pryzm-idempotency-key': key },
    mockResolve: () => {
      syncSynthProposalForMock(kind, body);
      const base: ActionResponse = {
        replay: false,
        audit: {
          id: 'mock-' + key,
          actor: 'mock-user',
          actor_persona: 'frank',
          kind,
          target_type: body.target_type ?? null,
          target_id: body.target_id ?? body.aid ?? null,
          before: null,
          after: null,
          delta_pp: body.delta_pp ?? null,
          audit_hash: 'mock' + Math.random().toString(16).slice(2, 14),
          created_at: new Date().toISOString(),
        },
      };
      if (kind === 'share_decision') {
        const recipient = (body.recipient as string | undefined) ?? 'till';
        const target = (body.target_id as string | undefined) ?? (body.aid as string | undefined) ?? '—';
        base.recipient = recipient;
        base.recipient_user_id = `mock-user-${recipient}`;
        base.recipient_resolved = true;
        base.notification_id = `mock-notif-${key}`;
        base.note_id = `mock-note-${key}`;
        base.share_link = (body.link as string | undefined) ?? `/action-center?focus=rec-${target}`;
        base.audit_hash = base.audit.audit_hash;
      }
      if (kind === 'start_ab_test') {
        // Mock-mode parity for Phase 7 — surface the same simulation
        // shape the live FastAPI dispatcher returns so the AbSetupForm
        // confirmation panel works without a backend.
        const slicePct = (body.slice_pct as number | undefined) ?? 0.1;
        const ctrl = (body.control_price as number | undefined) ?? 0;
        const treat = (body.treatment_price as number | undefined) ?? 0;
        const liftPp = ctrl > 0 ? ((treat - ctrl) / ctrl) * 100 : 0;
        const blockers: string[] = [];
        if (slicePct > 0.4) blockers.push('Slice exceeds 40% — capacity risk');
        if (ctrl > 0 && treat > 0 && Math.abs(liftPp) > 20) {
          blockers.push(`Price move ${liftPp.toFixed(1)}pp outside ±20pp guardrail`);
        }
        const ready = blockers.length === 0;
        base.ab_test_id = 'mock-abt-' + key;
        base.aid = (body.aid as string | undefined) ?? null ?? undefined;
        base.status = 'running';
        base.decision_state = 'running';
        base.simulation_status = 'pre_launch_ok';
        base.launch_readiness = ready ? 'ready' : 'blocked';
        base.blockers = blockers;
        base.simulation_summary = {
          stage: 'pre_launch',
          recommendation: ready ? 'launch' : 'block',
          detected_lift_pp: liftPp,
          detected_lift_pct: liftPp,
          p_value: null,
          observed_arms: { control_n: null, treatment_n: null },
          blockers,
          warnings: [],
        };
      }
      return base;
    },
  });
}

/** Generic mutation hook — pass the screen's query key as `invalidate`. */
function useActionMutation(
  kind: ActionKind,
  invalidate: QueryKey | QueryKey[] | undefined,
) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: ActionBody) => runAction(kind, body),
    onSuccess: () => {
      if (invalidate) {
        const keys = Array.isArray(invalidate[0]) ? (invalidate as QueryKey[]) : [invalidate as QueryKey];
        for (const k of keys) qc.invalidateQueries({ queryKey: k });
      }
      qc.invalidateQueries({ queryKey: qk.auditTrail('30d') });
      qc.invalidateQueries({ queryKey: qk.shell() });
    },
  });
}

// ---------- per-kind wrappers ----------

export const useAcceptDecision = () =>
  useActionMutation('accept_recommendation', qk.actionCenter());
export const useDeclineDecision = () =>
  useActionMutation('decline_recommendation', qk.actionCenter());
export const usePartialAccept = () =>
  useActionMutation('partial_accept', qk.actionCenter());

export const useStartAbTest = () =>
  useActionMutation('start_ab_test', [qk.actionCenter(), qk.studio()]);
export const useStopAbTest = () =>
  useActionMutation('stop_ab_test', [qk.actionCenter(), qk.studio()]);

export const useApproveQuote = () => useActionMutation('quote_approve', qk.quotes());
export const useCounterQuote = () => useActionMutation('quote_counter', qk.quotes());
export const useDeclineQuote = () => useActionMutation('quote_decline', qk.quotes());
export const useHoldQuote = () => useActionMutation('quote_hold', qk.quotes());
export const useBulkQuoteAction = () => useActionMutation('quote_bulk', qk.quotes());

export const useStudioAccept = () => useActionMutation('studio_accept', qk.studio());

export const useForwardBriefing = () => useActionMutation('briefing_forward', qk.ai());
export const useExportBriefingPdf = () => useActionMutation('briefing_pdf', qk.ai());
export const useEmailBriefing = () => useActionMutation('briefing_email', qk.ai());

export const useEditGuardrailRequest = () =>
  useActionMutation('guardrail_edit_request', qk.quotes());
export const useApplyGuardrail = () => useActionMutation('guardrail_apply', qk.quotes());

export const useForecastOverride = () => useActionMutation('forecast_override', qk.forecast());

// ---------- audit-trail read ----------

export interface AuditTrailResponse {
  items: AuditRow[];
}

export function useAuditTrail(since = '30d', enabled = true) {
  return useQuery({
    queryKey: qk.auditTrail(since),
    queryFn: () =>
      apiFetch<AuditTrailResponse>('/audit/recent', {
        params: { since, limit: 50 },
      }),
    enabled,
    staleTime: 60_000,
  });
}
