// Wishlist #5 — "Notify me" button + threshold-alert modal.
//
// Drops a tiny bell button on each forecast block header. Click → modal
// where Frank sets the metric / threshold / notification channel. POSTs to
// /forecast/alerts (the backend endpoints already exist).

import { Bell, X } from 'lucide-react';
import { useState } from 'react';
import { postJson } from '@/lib/api/client';

type ThresholdKind = 'mape_above' | 'margin_below_pct' | 'revenue_decline_prob_above';

interface Props {
  metric: string;
  entityType: string;
  entityId?: string;
  label?: string;
  thresholdKind?: ThresholdKind;
  defaultThreshold?: number;
}

interface AlertReceipt {
  id: string;
  metric: string;
  thresholdKind: ThresholdKind;
  thresholdValue: number;
}

export function ThresholdAlertButton({
  metric,
  entityType,
  entityId,
  label,
  thresholdKind: thresholdKindDefault = 'margin_below_pct',
  defaultThreshold,
}: Props) {
  const [open, setOpen] = useState(false);
  const [thresholdKind, setThresholdKind] = useState<ThresholdKind>(thresholdKindDefault);
  const [thresholdValue, setThresholdValue] = useState(
    defaultThreshold ?? thresholdDefault(thresholdKindDefault),
  );
  const [channel, setChannel] = useState<'in_app' | 'email'>('in_app');
  const [busy, setBusy] = useState(false);
  const [receipt, setReceipt] = useState<AlertReceipt | null>(null);

  const submit = async () => {
    setBusy(true);
    try {
      const result = await postJson<AlertReceipt>(
        '/forecast/alerts',
        {
          metric,
          entity_type: entityType,
          entity_id: entityId ?? null,
          threshold_kind: thresholdKind,
          threshold_value: thresholdValue,
          notify_via: channel,
        },
        {
          mockResolve: () => ({
            id: crypto.randomUUID(),
            metric,
            thresholdKind,
            thresholdValue,
          }),
        },
      );
      setReceipt(result);
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation();
          setOpen(true);
          setReceipt(null);
        }}
        data-testid="threshold-alert-button"
        title={label ?? 'Notify me'}
        className="inline-flex items-center gap-1 rounded-full border border-[var(--hairline)] bg-white px-2 py-0.5 text-[10.5px] font-semibold text-[var(--muted)] hover:border-[var(--rose-deep)] hover:text-[var(--rose-deep)]"
      >
        <Bell size={11} /> Notify me
      </button>
      {open && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center"
          role="dialog"
          aria-modal="true"
          data-testid="threshold-alert-modal"
        >
          <button
            type="button"
            aria-label="Dismiss"
            onClick={() => setOpen(false)}
            className="absolute inset-0 bg-black/30"
          />
          <div className="relative w-full max-w-md rounded-[14px] bg-white shadow-2xl">
            <header className="flex items-center justify-between border-b border-[var(--border)] px-5 py-4">
              <div>
                <div className="text-[10.5px] font-semibold uppercase tracking-wide text-[var(--muted)]">
                  Threshold alert
                </div>
                <h2 className="font-display text-[16px] font-bold tracking-tight">
                  {label ?? `${metric} · ${entityType}${entityId ? ` · ${entityId}` : ''}`}
                </h2>
              </div>
              <button
                type="button"
                onClick={() => setOpen(false)}
                aria-label="Close"
                className="grid h-7 w-7 place-items-center rounded-md text-[var(--muted)] hover:bg-[var(--surface-sunken)]"
              >
                <X size={14} />
              </button>
            </header>
            <div className="p-5 space-y-3 text-[12.5px]">
              <label className="flex items-center justify-between gap-3">
                <span className="text-[11px] font-semibold uppercase tracking-wide text-[var(--muted)]">
                  Trigger when
                </span>
                <select
                  data-testid="alert-kind"
                  value={thresholdKind}
                  onChange={(e) => setThresholdKind(e.target.value as ThresholdKind)}
                  className="rounded-md border border-[var(--hairline)] bg-white px-2 py-1"
                >
                  <option value="mape_above">MAPE rises above</option>
                  <option value="margin_below_pct">Margin drops below</option>
                  <option value="revenue_decline_prob_above">P(revenue decline) above</option>
                </select>
              </label>
              <label className="flex items-center justify-between gap-3">
                <span className="text-[11px] font-semibold uppercase tracking-wide text-[var(--muted)]">
                  Threshold value
                </span>
                <input
                  type="number"
                  step="0.01"
                  data-testid="alert-value"
                  value={thresholdValue}
                  onChange={(e) => setThresholdValue(Number(e.target.value))}
                  className="w-24 rounded-md border border-[var(--hairline)] bg-white px-2 py-1 text-right tabular-nums"
                />
              </label>
              <label className="flex items-center justify-between gap-3">
                <span className="text-[11px] font-semibold uppercase tracking-wide text-[var(--muted)]">
                  Notify via
                </span>
                <select
                  data-testid="alert-channel"
                  value={channel}
                  onChange={(e) => setChannel(e.target.value as 'in_app' | 'email')}
                  className="rounded-md border border-[var(--hairline)] bg-white px-2 py-1"
                >
                  <option value="in_app">In-app</option>
                  <option value="email">Email</option>
                </select>
              </label>
              {receipt && (
                <div
                  data-testid="alert-receipt"
                  className="rounded-md border border-[var(--hairline)] bg-[var(--surface-soft)] p-2 text-[11.5px]"
                >
                  <b>Alert saved:</b> {receipt.thresholdKind} {receipt.thresholdValue} ·{' '}
                  {receipt.id.slice(0, 8)}…
                </div>
              )}
            </div>
            <footer className="flex items-center justify-end gap-2 border-t border-[var(--border)] px-5 py-3">
              <button
                type="button"
                onClick={() => setOpen(false)}
                className="rounded-md border border-[var(--hairline)] bg-white px-3 py-1.5 text-[12.5px] font-semibold"
              >
                Close
              </button>
              <button
                type="button"
                onClick={submit}
                disabled={busy}
                data-testid="alert-submit"
                className="rounded-md bg-[var(--rose-deep)] px-3 py-1.5 text-[12.5px] font-semibold text-white disabled:opacity-50"
              >
                {busy ? 'Saving…' : 'Save alert'}
              </button>
            </footer>
          </div>
        </div>
      )}
    </>
  );
}

function thresholdDefault(kind: ThresholdKind): number {
  switch (kind) {
    case 'mape_above':
      return 0.08;
    case 'revenue_decline_prob_above':
      return 0.3;
    case 'margin_below_pct':
    default:
      return 50;
  }
}
