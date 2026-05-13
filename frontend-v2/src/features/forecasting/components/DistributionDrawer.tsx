// Phase 1 — Right-side drawer.
//
// Two callsites:
//   - TornadoCard passes `bar` + `tornado` → renders the per-cluster breakdown.
//   - DistributionGrid passes `row` + `distributions` → renders the full
//     histogram (synthesised from p5/p25/median/p75/p95 for the seed; the
//     real backend will return a histogram array later) + shock-mode badge.

import { X } from 'lucide-react';
import { useEffect } from 'react';
import type {
  DistributionRow,
  ForecastDistributions,
  ForecastTornado,
  TornadoBar,
} from '@/types/forecast';

interface Props {
  open: boolean;
  onClose: () => void;
  bar?: TornadoBar | null;
  row?: DistributionRow | null;
  tornado?: ForecastTornado;
  distributions?: ForecastDistributions;
}

export function DistributionDrawer({ open, onClose, bar, row, tornado, distributions }: Props) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  if (!open) return null;

  const title = bar ? bar.inputName : row ? row.entityName : 'Detail';

  return (
    <div
      className="fixed inset-0 z-50 flex justify-end"
      role="dialog"
      aria-modal="true"
      aria-label={`${title} detail`}
      data-testid="distribution-drawer"
    >
      <button
        type="button"
        aria-label="Dismiss"
        onClick={onClose}
        className="absolute inset-0 bg-black/30"
      />
      <aside className="relative ml-auto h-full w-full max-w-[480px] overflow-y-auto bg-white shadow-2xl">
        <header className="sticky top-0 flex items-start justify-between border-b border-[var(--border)] bg-white px-5 py-4">
          <div>
            <div className="text-[10.5px] font-semibold uppercase tracking-wide text-[var(--muted)]">
              {bar ? 'Tornado input' : 'Entity distribution'}
            </div>
            <h2 className="font-display text-[18px] font-bold tracking-tight text-[var(--ink)]">
              {title}
            </h2>
          </div>
          <button
            type="button"
            aria-label="Close drawer"
            onClick={onClose}
            className="grid h-8 w-8 place-items-center rounded-md text-[var(--muted)] hover:bg-[var(--surface-sunken)] hover:text-[var(--ink-2)]"
          >
            <X size={16} />
          </button>
        </header>

        <div className="p-5 space-y-5">
          {bar && tornado && <BarDetail bar={bar} tornado={tornado} />}
          {row && distributions && <RowDetail row={row} distributions={distributions} />}
        </div>
      </aside>
    </div>
  );
}

function BarDetail({ bar, tornado }: { bar: TornadoBar; tornado: ForecastTornado }) {
  return (
    <>
      <section>
        <h3 className="text-[12px] font-semibold uppercase tracking-wide text-[var(--muted)]">
          Median Δ {bar.deltaUnit}
        </h3>
        <div className="mt-1 flex items-baseline gap-3 tabular-nums">
          <span className="text-[22px] font-bold text-[var(--red,#9a3232)]">
            {bar.deltaNegative.toFixed(2)}
          </span>
          <span className="text-[11px] text-[var(--muted)]">downshock</span>
          <span className="text-[22px] font-bold text-[var(--green,#2e7c5a)]">
            +{bar.deltaPositive.toFixed(2)}
          </span>
          <span className="text-[11px] text-[var(--muted)]">upshock</span>
        </div>
      </section>

      <section>
        <h3 className="text-[12px] font-semibold uppercase tracking-wide text-[var(--muted)]">
          Per-cluster breakdown
        </h3>
        <ul className="mt-2 space-y-1.5 text-[13px]">
          {(bar.clusterBreakdown ?? []).map((c) => (
            <li
              key={c.cluster}
              className="flex items-center justify-between rounded-md border border-[var(--hairline)] bg-[var(--surface-soft)] px-3 py-1.5"
            >
              <b>{c.cluster}</b>
              <span className="tabular-nums">{c.delta.toFixed(2)}</span>
            </li>
          ))}
          {!bar.clusterBreakdown?.length && (
            <li className="text-[12px] text-[var(--muted)]">No per-cluster split available.</li>
          )}
        </ul>
      </section>

      <section className="text-[11.5px] text-[var(--muted)]">
        n={tornado.n_simulations.toLocaleString()} simulations · shock mode {tornado.shockMode} ·
        horizon {tornado.horizonMonths}mo · metric {tornado.metric}
      </section>
    </>
  );
}

function RowDetail({
  row,
  distributions,
}: {
  row: DistributionRow;
  distributions: ForecastDistributions;
}) {
  const buckets = synthesiseHistogram(row);
  const maxBucket = Math.max(1, ...buckets.map((b) => b.frequency));

  return (
    <>
      <section className="grid grid-cols-3 gap-2 text-[12.5px]">
        {[
          { label: 'Median', value: row.median },
          { label: 'Mean', value: row.mean },
          { label: 'P5 / P95', value: `${row.p5?.toFixed(1)} – ${row.p95?.toFixed(1)}` },
          { label: 'P25 / P75', value: `${row.p25?.toFixed(1)} – ${row.p75?.toFixed(1)}` },
          { label: 'Last actual', value: row.lastActual },
          {
            label: `P(<${row.thresholdValue})`,
            value: row.pBelowThreshold != null ? `${row.pBelowThreshold.toFixed(1)}%` : '—',
          },
        ].map((stat) => (
          <div
            key={stat.label}
            className="rounded-md border border-[var(--hairline)] bg-[var(--surface-soft)] px-2.5 py-2"
          >
            <div className="text-[10.5px] font-semibold uppercase tracking-wide text-[var(--muted)]">
              {stat.label}
            </div>
            <div className="mt-0.5 font-display text-[15px] font-bold tabular-nums text-[var(--ink)]">
              {typeof stat.value === 'number' ? stat.value.toFixed(1) : stat.value ?? '—'}
            </div>
          </div>
        ))}
      </section>

      <section>
        <h3 className="text-[12px] font-semibold uppercase tracking-wide text-[var(--muted)]">
          Synthesised histogram
        </h3>
        <div className="mt-2 flex h-[120px] items-end gap-1">
          {buckets.map((b) => (
            <div
              key={b.label}
              title={`${b.label}: ${b.frequency}`}
              className="flex-1 rounded-sm bg-[var(--rose-bg)]"
              style={{
                height: `${(b.frequency / maxBucket) * 100}%`,
                minHeight: 2,
              }}
            />
          ))}
        </div>
        <div className="mt-1 text-[10.5px] text-[var(--muted)]">
          Buckets interpolated from P5/P25/P50/P75/P95 of the persisted distribution.
        </div>
      </section>

      <section className="flex items-center gap-2 text-[11.5px] text-[var(--muted)]">
        <span className="tag-chip">shock mode · {row.shockMode}</span>
        <span className="tag-chip">n={row.nSimulations.toLocaleString()}</span>
        <span className="tag-chip">{distributions.metric} · {distributions.horizonMonths}mo</span>
      </section>
    </>
  );
}

function synthesiseHistogram(row: DistributionRow): { label: string; frequency: number }[] {
  const stops = [
    row.p5,
    row.p25,
    row.median,
    row.p75,
    row.p95,
  ].filter((v): v is number => v != null);
  if (stops.length < 2) return [];
  const lo = stops[0];
  const hi = stops[stops.length - 1];
  if (hi <= lo) return [];
  const bucketCount = 12;
  const buckets: { label: string; frequency: number }[] = Array.from(
    { length: bucketCount },
    (_, i) => ({
      label: `${(lo + ((hi - lo) * i) / bucketCount).toFixed(1)}`,
      frequency: 0,
    }),
  );
  for (let s = 0; s < stops.length - 1; s += 1) {
    const a = stops[s];
    const b = stops[s + 1];
    const startIdx = Math.min(bucketCount - 1, Math.max(0, Math.floor(((a - lo) / (hi - lo)) * bucketCount)));
    const endIdx = Math.min(bucketCount - 1, Math.max(0, Math.floor(((b - lo) / (hi - lo)) * bucketCount)));
    const segmentBuckets = Math.max(1, endIdx - startIdx + 1);
    // Quantile bands all hold 20% of the mass (5→25, 25→50, 50→75, 75→95).
    const massPerBucket = 200 / segmentBuckets;
    for (let i = startIdx; i <= endIdx; i += 1) {
      buckets[i].frequency += massPerBucket;
    }
  }
  return buckets;
}
