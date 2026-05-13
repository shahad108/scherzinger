// Phase 6 — Per-cluster CI calibration panel.

import type { CalibrationPayload } from '@/types/forecast';
import { AccuracyBadge } from './AccuracyBadge';

interface Props {
  data: CalibrationPayload;
}

export function CalibrationCard({ data }: Props) {
  return (
    <section className="mt-6">
      <div className="section-row">
        <div>
          <h2>CI calibration · per-cluster</h2>
          <div className="sub">
            Of the past backtest steps, what share of actuals fell inside the {data.nominalBand}%
            band? Should be ≈{data.nominalBand}% if the model is calibrated.
          </div>
        </div>
        <AccuracyBadge
          data={{ metric: 'calibration_p80_hit', value: 0.77, n: 66, horizonMonths: 12 }}
          entityType="commodity_group"
          drawerTitle="Calibration — lineage"
        />
      </div>

      <div className="lq-card" data-testid="calibration-card">
        <ul className="grid grid-cols-1 gap-2 md:grid-cols-4">
          {data.rows.map((row) => {
            const toneClass =
              row.tone === 'red'
                ? 'border-[var(--red,#9a3232)]'
                : row.tone === 'amber'
                  ? 'border-[var(--amber,#b59300)]'
                  : 'border-[var(--green,#2e7c5a)]';
            return (
              <li
                key={row.clusterId}
                data-testid={`calibration-row-${row.clusterId}`}
                className={`rounded-md border-l-4 ${toneClass} border border-[var(--hairline)] bg-[var(--surface-soft)] p-3`}
              >
                <div className="flex items-center justify-between">
                  <b className="text-[13.5px]">{row.clusterId}</b>
                  <span className="text-[10.5px] text-[var(--muted)]">
                    n={row.nBacktests}
                  </span>
                </div>
                <div className="mt-1 font-display text-[22px] font-bold tabular-nums text-[var(--ink)]">
                  {row.actualHitRatePct}%
                </div>
                <div className="text-[11px] text-[var(--muted)]">
                  Nominal {data.nominalBand}% · Δ {(row.actualHitRatePct - data.nominalBand).toFixed(0)}pp
                </div>
              </li>
            );
          })}
        </ul>
      </div>
    </section>
  );
}
