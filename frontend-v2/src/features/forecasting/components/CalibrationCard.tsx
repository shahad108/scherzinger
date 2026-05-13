// Per-cluster backtest accuracy panel (was: CI calibration).
//
// The DB doesn't currently store pred/actual pairs, so we cannot compute a
// real prediction-interval hit rate. This panel now shows the real
// per-cluster MAPE and directional accuracy from `backtest_results`.

import type { CalibrationPayload } from '@/types/forecast';
import { AccuracyBadge } from './AccuracyBadge';
import { ThresholdAlertButton } from './ThresholdAlertButton';

interface Props {
  data: CalibrationPayload;
}

export function CalibrationCard({ data }: Props) {
  const isLive = data.source === 'live';
  return (
    <section className="mt-6">
      <div className="section-row">
        <div>
          <h2>{data.title ?? 'Forecast accuracy by cluster'}</h2>
          <div className="sub">
            {data.subtitle ??
              'How close the forecast was to what actually happened, for each cluster. Lower MAPE = tighter forecast.'}
            {!isLive && (
              <span className="ml-2 text-[var(--red,#9a3232)]">⚠ source: {data.source}</span>
            )}
          </div>
        </div>
        <div className="flex items-center gap-2">
          <AccuracyBadge
            data={{
              metric: 'mape',
              value:
                ((data.rows[0]?.mapePct ?? 5) as number) / 100,
              n: data.rows.reduce((s, r) => s + (r.nBacktests ?? 0), 0),
              horizonMonths: 3,
              modelId: data.winnerModel ?? 'walk_forward',
            }}
            entityType="commodity_group"
            drawerTitle="Per-cluster accuracy — lineage"
          />
          <ThresholdAlertButton
            metric="mape"
            entityType="commodity_group"
            label="Accuracy drift"
            thresholdKind="mape_above"
            defaultThreshold={0.06}
          />
        </div>
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
            const mape = row.mapePct;
            const directional = row.directionalPct;
            return (
              <li
                key={row.clusterId}
                data-testid={`calibration-row-${row.clusterId}`}
                className={`rounded-md border-l-4 ${toneClass} border border-[var(--hairline)] bg-[var(--surface-soft)] p-3`}
              >
                <div className="flex items-center justify-between">
                  <b className="text-[13.5px]">{row.clusterId}</b>
                  <span className="text-[10.5px] text-[var(--muted)]">
                    n={row.nBacktests ?? '—'}
                  </span>
                </div>
                <div className="mt-1 font-display text-[22px] font-bold tabular-nums text-[var(--ink)]">
                  {mape != null ? `${mape.toFixed(2)}%` : '—'}
                  <span className="ml-1 text-[10px] font-normal text-[var(--muted)]">MAPE</span>
                </div>
                <div className="text-[11px] text-[var(--muted)]">
                  Directional {directional != null ? `${directional.toFixed(0)}%` : '—'}
                  {mape != null && (
                    <>
                      {' · '}
                      <span
                        className={
                          mape <= 3
                            ? 'text-[var(--green,#2e7c5a)]'
                            : mape <= 6
                              ? 'text-[var(--amber,#b59300)]'
                              : 'text-[var(--red,#9a3232)]'
                        }
                      >
                        {mape <= 3 ? 'tight' : mape <= 6 ? 'ok' : 'noisy'}
                      </span>
                    </>
                  )}
                </div>
              </li>
            );
          })}
        </ul>
      </div>
    </section>
  );
}
