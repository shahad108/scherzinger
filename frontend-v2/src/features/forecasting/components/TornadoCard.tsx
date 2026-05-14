// Phase 1 — Horizontal tornado bar chart.
//
// Inputs sorted by |delta| desc. Positive perturbation → green; negative → red.
// Click a bar to open the `DistributionDrawer` with the per-cluster breakdown.

import { useMemo, useState } from 'react';
import type { TornadoBar, ForecastTornado } from '@/types/forecast';
import { AccuracyBadge } from './AccuracyBadge';
import { DistributionDrawer } from './DistributionDrawer';
import { ThresholdAlertButton } from './ThresholdAlertButton';

interface Props {
  tornado: ForecastTornado;
}

export function TornadoCard({ tornado }: Props) {
  const [activeBar, setActiveBar] = useState<TornadoBar | null>(null);

  const sortedBars = useMemo(() => {
    return [...tornado.bars].sort(
      (a, b) =>
        Math.abs(Math.max(Math.abs(b.deltaPositive), Math.abs(b.deltaNegative))) -
        Math.abs(Math.max(Math.abs(a.deltaPositive), Math.abs(a.deltaNegative))),
    );
  }, [tornado.bars]);

  const maxAbs = useMemo(() => {
    return Math.max(
      0.1,
      ...sortedBars.flatMap((b) => [Math.abs(b.deltaPositive), Math.abs(b.deltaNegative)]),
    );
  }, [sortedBars]);

  return (
    <section className="mt-4">
      <div className="section-row">
        <div>
          <h2>Input sensitivity · Tornado</h2>
          <div className="sub">
            Each input perturbed by ±1σ historical. Bars show median Δ to the active metric over
            the chosen horizon · n={tornado.n_simulations.toLocaleString()} simulations · shock
            mode {tornado.shockMode}.
          </div>
        </div>
        <div className="flex items-center gap-2">
          {/* Phase 4.5 audit fix #4: was hardcoded value=0.81. */}
          <AccuracyBadge
            data={{
              metric: 'calibration_p80_hit',
              value: null,
              n: tornado.n_simulations,
              horizonMonths: tornado.horizonMonths,
              modelId: 'monte_carlo_simulator_v2',
            }}
            entityType={tornado.entityType}
            drawerTitle={`Tornado · ${tornado.metric} lineage`}
          />
          <ThresholdAlertButton
            metric={tornado.metric}
            entityType={tornado.entityType}
            label={`Tornado · ${tornado.metric}`}
            thresholdKind="revenue_decline_prob_above"
            defaultThreshold={0.3}
          />
          <span className="tag-chip">
            {tornado.metric} · {tornado.horizonMonths}mo · {tornado.entityType.replace('_', ' ')}
          </span>
        </div>
      </div>

      <div className="lq-card" data-testid="tornado-card">
        <ul className="divide-y divide-[var(--hairline)]">
          {sortedBars.map((bar) => {
            const posPct = (Math.abs(bar.deltaPositive) / maxAbs) * 50;
            const negPct = (Math.abs(bar.deltaNegative) / maxAbs) * 50;
            return (
              <li key={bar.inputName}>
                <button
                  type="button"
                  data-testid={`tornado-bar-${bar.inputName}`}
                  onClick={() => setActiveBar(bar)}
                  className="grid w-full grid-cols-[180px_1fr_140px] items-center gap-3 px-2 py-3 text-left hover:bg-[var(--surface-soft)] focus:outline-none focus:ring-2 focus:ring-[var(--rose-deep)]"
                >
                  <div>
                    <div className="text-[13px] font-semibold text-[var(--ink)]">
                      {bar.inputName}
                    </div>
                    <div className="text-[11px] text-[var(--muted)]">
                      ±{bar.perturbationSize ?? 1}σ · {bar.unit || '—'}
                    </div>
                  </div>
                  <div className="relative h-6">
                    <div className="absolute inset-y-0 left-1/2 w-px bg-[var(--hairline)]" />
                    <div
                      className="absolute inset-y-1 rounded-l-sm bg-[var(--red-soft,#f3d3d3)]"
                      style={{
                        right: '50%',
                        width: `${negPct}%`,
                        backgroundColor: 'rgba(154,50,50,0.18)',
                        borderLeft: '2px solid rgba(154,50,50,0.6)',
                      }}
                      aria-label={`Negative perturbation delta ${bar.deltaNegative}`}
                    />
                    <div
                      className="absolute inset-y-1 rounded-r-sm"
                      style={{
                        left: '50%',
                        width: `${posPct}%`,
                        backgroundColor: 'rgba(46,124,90,0.22)',
                        borderRight: '2px solid rgba(46,124,90,0.65)',
                      }}
                      aria-label={`Positive perturbation delta ${bar.deltaPositive}`}
                    />
                  </div>
                  <div className="text-right">
                    <div className="text-[12.5px] font-semibold text-[var(--ink)] tabular-nums">
                      {formatDelta(bar.deltaNegative)} / {formatDelta(bar.deltaPositive)}
                    </div>
                    <div className="text-[11px] text-[var(--muted)]">{bar.deltaUnit}</div>
                  </div>
                </button>
              </li>
            );
          })}
        </ul>
      </div>

      <DistributionDrawer
        bar={activeBar}
        tornado={tornado}
        open={!!activeBar}
        onClose={() => setActiveBar(null)}
      />
    </section>
  );
}

function formatDelta(value: number): string {
  const sign = value > 0 ? '+' : '';
  return `${sign}${value.toFixed(1)}`;
}
