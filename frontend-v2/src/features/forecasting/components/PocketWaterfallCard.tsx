// PocketWaterfallCard — List → Quoted → Booked → Invoiced → DB2-after-cost.
//
// McKinsey-style pocket-margin lens. PVM answers "why did margin shift Q-over-Q";
// pocket waterfall answers "of the €X list price, how much did we actually
// pocket on this deal/cluster/period." Different question, both essential.
//
// Renders the 5 step bars with a leakage % per step and (when supplied) a
// row of per-cluster pocket-price band sparklines below.

import type { PocketWaterfall, PocketStep } from '@/types/forecast';

interface Props {
  data: PocketWaterfall | undefined;
}

const STEP_LABEL: Record<PocketStep['name'], string> = {
  list: 'List',
  quoted: 'Quoted',
  booked: 'Booked',
  invoiced: 'Invoiced',
  db2: 'DB2',
};

function formatStepValue(v: number, unit: PocketWaterfall['unit']): string {
  if (unit === 'pct_of_list') return `${v.toFixed(1)}`;
  if (unit === 'eur_per_unit') return `${v.toFixed(2)} €/u`;
  if (Math.abs(v) >= 1_000_000) return `${(v / 1_000_000).toFixed(2)}M €`;
  if (Math.abs(v) >= 1_000) return `${Math.round(v / 1_000)}k €`;
  return `${Math.round(v)} €`;
}

export function PocketWaterfallCard({ data }: Props) {
  if (!data || !data.steps || data.steps.length === 0) return null;

  const peak = data.steps.reduce((acc, s) => Math.max(acc, s.value), 0) || 1;

  return (
    <section data-testid="pocket-waterfall-card" className="mb-4 rounded-[12px] border border-[var(--hairline)] bg-white p-4 shadow-[0_1px_2px_rgba(20,20,28,0.04)]">
      <header className="mb-3 flex flex-wrap items-baseline justify-between gap-2">
        <div>
          <div className="text-[10.5px] font-semibold uppercase tracking-wide text-[var(--muted)]">Pocket margin — leakage by step</div>
          <div className="font-display text-[16px] font-bold tracking-tight">List → Quoted → Booked → Invoiced → DB2</div>
        </div>
        <span className="text-[11px] text-[var(--muted)]">Unit: {data.unit.replace(/_/g, ' ')}</span>
      </header>

      <div className="space-y-2">
        {data.steps.map((step) => {
          const widthPct = (step.value / peak) * 100;
          return (
            <div key={step.name} data-testid={`pocket-step-${step.name}`} className="flex items-center gap-3">
              <div className="w-[80px] shrink-0 text-[12.5px] font-semibold text-[var(--ink-2)]">{STEP_LABEL[step.name]}</div>
              <div className="relative h-6 flex-1 overflow-hidden rounded-md bg-[var(--surface-soft)]">
                <div className="absolute inset-y-0 left-0 rounded-md bg-[var(--rose-deep)]" style={{ width: `${widthPct}%` }} />
              </div>
              <div className="w-[90px] shrink-0 text-right text-[12.5px] font-semibold text-[var(--ink)]">{formatStepValue(step.value, data.unit)}</div>
              <div className="w-[64px] shrink-0 text-right text-[11px] text-[var(--muted)]">
                {step.leakagePct == null ? '—' : `-${step.leakagePct.toFixed(1)}%`}
              </div>
            </div>
          );
        })}
      </div>

      {data.perCluster && data.perCluster.length > 0 && (
        <div data-testid="pocket-cluster-bands" className="mt-4 grid grid-cols-2 gap-3 md:grid-cols-4">
          {data.perCluster.map((band) => (
            <div key={band.cluster} data-testid={`pocket-cluster-${band.cluster}`} className="rounded-md border border-[var(--hairline)] bg-[var(--surface-soft)] p-2">
              <div className="text-[10.5px] font-semibold uppercase tracking-wide text-[var(--muted)]">{band.cluster}</div>
              <div className="mt-1 flex h-6 items-end gap-px">
                {band.histogram.map((h, idx) => {
                  const max = Math.max(...band.histogram.map((b) => b.count)) || 1;
                  const heightPct = (h.count / max) * 100;
                  return <div key={idx} className="flex-1 rounded-sm bg-[var(--rose-soft)]" style={{ height: `${heightPct}%` }} />;
                })}
              </div>
              <div className="mt-1 flex justify-between text-[10.5px] text-[var(--muted)]">
                <span>p10 {band.p10.toFixed(0)}</span>
                <span className="font-semibold text-[var(--ink-2)]">med {band.median.toFixed(0)}</span>
                <span>p90 {band.p90.toFixed(0)}</span>
              </div>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}
