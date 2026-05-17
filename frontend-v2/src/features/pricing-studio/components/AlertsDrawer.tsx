// Pricing Studio v3 / Phase 9 (§9.3) — Alerts drawer.
//
// 480px right-rail drawer with two views:
//   - Inbox  → recent triggered events grouped by time bucket
//   - Manage → the user's alerts with disable buttons
//
// Click an inbox event → navigate to /pricing?aid=…&source=alert&alert_id=…
// "Manage alerts" footer flips into the manage view.

import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Drawer } from '@/components/ui/Drawer';
import {
  useAlertInbox,
  usePricingAlerts,
  useDisableAlert,
  type PricingAlert,
  type PricingAlertEvent,
} from '@/data/api/usePricingAlerts';

type View = 'inbox' | 'manage';

export interface AlertsDrawerProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

const KIND_LABEL: Record<string, string> = {
  cost_threshold: 'cost spike',
  competitor_undercut: 'competitor',
  churn_spike: 'churn spike',
  floor_cross: 'floor cross',
  proposal_stuck: 'proposal stuck',
  pa_pr_surge: 'PA/PR surge',
  cluster_db2_drop: 'cluster DB2 drop',
};

function bucketFor(triggeredAt: string | null): 'today' | 'week' | 'older' {
  if (!triggeredAt) return 'older';
  const dt = new Date(triggeredAt).getTime();
  if (!Number.isFinite(dt)) return 'older';
  const now = Date.now();
  const day = 24 * 60 * 60 * 1000;
  const diff = now - dt;
  if (diff < day && new Date(triggeredAt).toDateString() === new Date().toDateString()) {
    return 'today';
  }
  if (diff < 7 * day) return 'week';
  return 'older';
}

function eventTime(triggeredAt: string | null): string {
  if (!triggeredAt) return '—';
  try {
    const d = new Date(triggeredAt);
    return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  } catch {
    return '—';
  }
}

function eventSummary(ev: PricingAlertEvent): string {
  const payload = ev.payload ?? {};
  const aid = (payload.aid as string | undefined) ?? ev.scope?.aid ?? null;
  const cluster = (payload.cluster as string | undefined) ?? ev.scope?.cluster ?? null;
  return aid ?? cluster ?? 'cluster';
}

export function AlertsDrawer({ open, onOpenChange }: AlertsDrawerProps) {
  const [view, setView] = useState<View>('inbox');
  const inbox = useAlertInbox();
  const alerts = usePricingAlerts();
  const disable = useDisableAlert();
  const navigate = useNavigate();

  const events = inbox.data?.events ?? [];
  const grouped = useMemo(() => {
    const today: PricingAlertEvent[] = [];
    const week: PricingAlertEvent[] = [];
    const older: PricingAlertEvent[] = [];
    for (const ev of events) {
      const bucket = bucketFor(ev.triggered_at);
      if (bucket === 'today') today.push(ev);
      else if (bucket === 'week') week.push(ev);
      else older.push(ev);
    }
    return { today, week, older };
  }, [events]);

  const handleEventClick = (ev: PricingAlertEvent) => {
    const aid = (ev.payload?.aid as string | undefined) ?? ev.scope?.aid;
    if (!aid) return;
    onOpenChange(false);
    const qs = new URLSearchParams({
      aid,
      source: 'alert',
      alert_id: ev.alert_id,
    });
    navigate(`/pricing?${qs.toString()}`);
  };

  return (
    <Drawer open={open} onOpenChange={onOpenChange} width={480} title="Alerts">
      <div
        className="flex h-full flex-col overflow-hidden p-4"
        data-testid="alerts-drawer"
      >
        <header className="mb-3 border-b border-[var(--hairline)] pb-2">
          <h2 className="font-display text-[15px] font-bold tracking-tight text-[var(--ink)]">
            Alerts
          </h2>
          <div
            className="mt-2 inline-flex items-center gap-1 rounded-full bg-[var(--surface-soft)] p-0.5 text-[11px] font-semibold"
            role="tablist"
          >
            <button
              type="button"
              role="tab"
              aria-selected={view === 'inbox'}
              data-testid="alerts-tab-inbox"
              onClick={() => setView('inbox')}
              className={`rounded-full px-2.5 py-1 ${
                view === 'inbox'
                  ? 'bg-white text-[var(--ink)] shadow-sm'
                  : 'text-[var(--muted)]'
              }`}
            >
              Inbox ({events.length})
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={view === 'manage'}
              data-testid="alerts-tab-manage"
              onClick={() => setView('manage')}
              className={`rounded-full px-2.5 py-1 ${
                view === 'manage'
                  ? 'bg-white text-[var(--ink)] shadow-sm'
                  : 'text-[var(--muted)]'
              }`}
            >
              Manage
            </button>
          </div>
        </header>

        {view === 'inbox' ? (
          <div
            className="flex flex-col gap-4 overflow-y-auto"
            data-testid="alerts-inbox-view"
          >
            {events.length === 0 && (
              <p className="text-[12px] text-[var(--muted)]">No alerts triggered yet.</p>
            )}
            <EventGroup
              label="Today"
              events={grouped.today}
              onClick={handleEventClick}
            />
            <EventGroup
              label="This week"
              events={grouped.week}
              onClick={handleEventClick}
            />
            <EventGroup
              label="Older"
              events={grouped.older}
              onClick={handleEventClick}
            />
          </div>
        ) : (
          <ManageView
            alerts={alerts.data?.alerts ?? []}
            onDisable={(id) => disable.mutate(id)}
            disabling={disable.isPending}
          />
        )}

        {view === 'inbox' && (
          <footer className="mt-3 flex items-center justify-end border-t border-[var(--hairline)] pt-2">
            <button
              type="button"
              onClick={() => setView('manage')}
              className="rounded-md border border-[var(--hairline)] bg-white px-3 py-1.5 text-[11.5px] font-semibold text-[var(--ink-2)] hover:bg-[var(--surface-soft)]"
              data-testid="alerts-manage-button"
            >
              Manage alerts
            </button>
          </footer>
        )}
      </div>
    </Drawer>
  );
}

function EventGroup({
  label,
  events,
  onClick,
}: {
  label: string;
  events: PricingAlertEvent[];
  onClick: (ev: PricingAlertEvent) => void;
}) {
  if (events.length === 0) return null;
  return (
    <section data-testid={`alerts-group-${label.toLowerCase().replace(/\s+/g, '-')}`}>
      <h3 className="mb-1 text-[10.5px] font-semibold uppercase tracking-wide text-[var(--muted)]">
        {label} ({events.length})
      </h3>
      <ul className="flex flex-col gap-1.5">
        {events.map((ev) => (
          <li key={ev.id}>
            <button
              type="button"
              onClick={() => onClick(ev)}
              data-testid={`alerts-event-${ev.id}`}
              className="flex w-full items-start gap-2 rounded-lg border border-[var(--hairline)] bg-[var(--surface-soft)] p-2.5 text-left hover:border-[var(--amber-border)] hover:bg-white"
            >
              <span
                aria-hidden="true"
                className="mt-1 inline-block h-1.5 w-1.5 shrink-0 rounded-full bg-[var(--amber)]"
              />
              <div className="flex min-w-0 flex-1 flex-col gap-0.5">
                <div className="flex items-center justify-between gap-2 text-[12px]">
                  <span className="font-semibold text-[var(--ink)]">
                    {KIND_LABEL[ev.kind ?? ''] ?? ev.kind ?? 'alert'}
                  </span>
                  <span className="text-[10.5px] tabular-nums text-[var(--muted)]">
                    {eventTime(ev.triggered_at)}
                  </span>
                </div>
                <div className="truncate text-[11.5px] text-[var(--ink-2)]">
                  {eventSummary(ev)}
                </div>
              </div>
            </button>
          </li>
        ))}
      </ul>
    </section>
  );
}

function ManageView({
  alerts,
  onDisable,
  disabling,
}: {
  alerts: PricingAlert[];
  onDisable: (id: string) => void;
  disabling: boolean;
}) {
  if (alerts.length === 0) {
    return (
      <p
        className="text-[12px] text-[var(--muted)]"
        data-testid="alerts-manage-empty"
      >
        You haven't created any alerts yet.
      </p>
    );
  }
  return (
    <ul className="flex flex-col gap-2 overflow-y-auto" data-testid="alerts-manage-view">
      {alerts.map((a) => (
        <li key={a.id}>
          <div className="flex items-center justify-between gap-2 rounded-lg border border-[var(--hairline)] bg-white p-3">
            <div className="min-w-0 flex-1">
              <div className="text-[12px] font-semibold text-[var(--ink)]">
                {KIND_LABEL[a.kind] ?? a.kind}
              </div>
              <div className="truncate text-[11px] text-[var(--muted)]">
                scope:{' '}
                {a.scope.aid ?? a.scope.cluster ?? a.scope.family ?? 'global'}
                {' · '}
                channels: {a.channels.join(', ')}
              </div>
            </div>
            <button
              type="button"
              disabled={disabling || !a.enabled}
              data-testid={`alerts-manage-disable-${a.id}`}
              onClick={() => onDisable(a.id)}
              className="rounded-md border border-[var(--hairline)] bg-white px-2 py-1 text-[11px] font-semibold text-[var(--ink-2)] hover:bg-[var(--rose-bg)] hover:text-[var(--rose-deep)] disabled:opacity-50"
            >
              {a.enabled ? 'Disable' : 'Disabled'}
            </button>
          </div>
        </li>
      ))}
    </ul>
  );
}
