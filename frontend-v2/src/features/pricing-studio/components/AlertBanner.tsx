// Pricing Studio v3 / Phase 9 (§9.4) — Live alert banner.
//
// Subscribes to the pricing SSE stream and surfaces a dismissible amber
// banner when an alert fires on the currently-open SKU. Also bumps the
// inbox query so the bell badge increments immediately without waiting
// for a poll.
//
// SSE topic is the pricing topic the rest of the studio already shares.
// We filter the incoming `lastEvent` by topic prefix `pricing.alerts.*`
// and by aid match — anything else is ignored.

import { useEffect, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { AlertTriangle, X } from 'lucide-react';
import { usePricingStream } from '@/hooks/usePricingStream';
import { qk } from '@/lib/api/queryKeys';

export interface AlertBannerProps {
  aid: string;
}

interface BannerState {
  alertId: string;
  kind: string;
  summary: string;
}

function summarize(kind: string, payload: Record<string, unknown>): string {
  switch (kind) {
    case 'cost_threshold':
      return `Cost moved ${formatDelta(payload.pct_actual)} over the trailing window.`;
    case 'competitor_undercut':
      return `Competitor undercut by ${formatDelta(payload.pct_actual)}.`;
    case 'churn_spike':
      return `Customer churn rose by ${formatPp(payload.pp_actual)}.`;
    case 'floor_cross':
      return 'Recommended price crossed the floor.';
    case 'proposal_stuck':
      return `Proposal idle for ${payload.days_actual ?? '?'} days.`;
    case 'pa_pr_surge':
      return `PA/PR surge — ${payload.count_actual ?? '?'} rejections in window.`;
    case 'cluster_db2_drop':
      return `Cluster DB2 fell ${formatPp(payload.pp_actual)}.`;
    default:
      return 'New alert fired on this SKU.';
  }
}

function formatDelta(v: unknown): string {
  if (typeof v === 'number') return `${v >= 0 ? '+' : ''}${v.toFixed(1)}%`;
  if (typeof v === 'string') return `${v}%`;
  return '?%';
}

function formatPp(v: unknown): string {
  if (typeof v === 'number') return `${v.toFixed(1)}pp`;
  if (typeof v === 'string') return `${v}pp`;
  return '?pp';
}

export function AlertBanner({ aid }: AlertBannerProps) {
  const qc = useQueryClient();
  const { lastEvent } = usePricingStream({ aid, enabled: Boolean(aid) });
  const [banner, setBanner] = useState<BannerState | null>(null);
  const [dismissedFor, setDismissedFor] = useState<string | null>(null);

  useEffect(() => {
    if (!lastEvent) return;
    if (!lastEvent.topic?.startsWith('pricing.alerts.')) return;

    if (lastEvent.topic === 'pricing.alerts.triggered') {
      const payload = lastEvent.payload ?? {};
      const eventAid =
        (payload.aid as string | undefined) ?? lastEvent.aid ?? null;
      // Bump the bell badge for every triggered event the user can see,
      // regardless of whether this banner ends up showing for the
      // current SKU.
      qc.invalidateQueries({ queryKey: qk.pricingAlertsInbox() });

      if (!eventAid || eventAid !== aid) return;
      const alertId = (payload.alert_id as string | undefined) ?? '';
      if (alertId && alertId === dismissedFor) return;
      const kind = (payload.kind as string | undefined) ?? 'cost_threshold';
      setBanner({
        alertId,
        kind,
        summary: summarize(kind, payload),
      });
    } else if (lastEvent.topic === 'pricing.alerts.created') {
      qc.invalidateQueries({ queryKey: qk.pricingAlerts() });
    } else if (lastEvent.topic === 'pricing.alerts.disabled') {
      qc.invalidateQueries({ queryKey: qk.pricingAlerts() });
    }
    // lastEvent is a value, not stable; we intentionally re-run on every
    // new tick so each alert event gets one chance to update state.
  }, [lastEvent, aid, qc, dismissedFor]);

  if (!banner) return null;

  return (
    <div
      role="alert"
      data-testid="alert-banner"
      className="mb-3 flex items-start gap-2 rounded-lg border border-[var(--amber-border)] bg-[var(--amber-bg)] px-3 py-2 text-[12.5px] text-[var(--amber)]"
    >
      <AlertTriangle size={14} className="mt-0.5 shrink-0" aria-hidden="true" />
      <div className="min-w-0 flex-1">
        <div className="font-semibold">Alert fired</div>
        <div className="text-[11.5px] text-[var(--ink-2)]">{banner.summary}</div>
      </div>
      <button
        type="button"
        aria-label="Dismiss alert"
        data-testid="alert-banner-dismiss"
        onClick={() => {
          setDismissedFor(banner.alertId);
          setBanner(null);
        }}
        className="grid h-6 w-6 place-items-center rounded-md text-[var(--ink-2)] hover:bg-white"
      >
        <X size={12} />
      </button>
    </div>
  );
}
