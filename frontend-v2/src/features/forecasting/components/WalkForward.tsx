import { Bar, BarChart, CartesianGrid, Cell, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import type { BacktestPanel } from '@/types/forecast';
import { AccuracyBadge } from './AccuracyBadge';

interface Props {
  panel: BacktestPanel;
}

export function WalkForward({ panel }: Props) {
  const { series, target, kpis, methodComparison, source } = panel;
  const isLive = source === 'live';

  return (
    <section className="mt-6">
      <div className="section-row">
        <div>
          <h2>Walk-forward backtest · per cluster MAPE (h=3mo)</h2>
          <div className="sub">
            Each model trained on 2022-01 → 2025-09 and tested on the holdout that follows.
            {methodComparison?.testWindow && ` Test window: ${methodComparison.testWindow}.`}
            {!isLive && (
              <span className="ml-2 text-[var(--red,#9a3232)]">
                ⚠ source: {source ?? 'unknown'}
              </span>
            )}
          </div>
        </div>
        <div className="flex items-center gap-2">
          <AccuracyBadge
            data={{
              metric: 'mape',
              value: (series[0]?.mape ?? 5) / 100,
              n: series[0]?.n ?? series.length,
              horizonMonths: methodComparison?.horizonMonths ?? 3,
              modelId: methodComparison?.winner ?? 'walk_forward',
            }}
            entityType="commodity_group"
            drawerTitle="Walk-forward MAPE — lineage"
          />
          <span className="tag-chip status">Target &lt;{target.toFixed(1)}%</span>
        </div>
      </div>

      <div className="lq-card">
        <div style={{ height: 200, position: 'relative' }}>
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={series} margin={{ top: 8, right: 16, left: 0, bottom: 8 }}>
              <CartesianGrid stroke="#eaedf1" vertical={false} />
              <XAxis
                dataKey="month"
                stroke="#7d8693"
                tick={{ fontSize: 11, fill: '#7d8693' }}
                tickLine={false}
                axisLine={{ stroke: '#dde1e7' }}
              />
              <YAxis
                stroke="#7d8693"
                tick={{ fontSize: 11, fill: '#7d8693' }}
                tickLine={false}
                axisLine={false}
                width={42}
                domain={[0, 'dataMax + 1']}
                tickFormatter={(v: number) => `${v.toFixed(1)}%`}
              />
              <Tooltip
                cursor={{ fill: 'rgba(154,50,50,0.05)' }}
                contentStyle={{
                  background: 'var(--surface)',
                  border: '1px solid var(--border)',
                  borderRadius: 11,
                  fontSize: 12,
                  boxShadow: 'var(--shadow-pop)',
                }}
                formatter={(value, name, props) => {
                  const p = props.payload as { model?: string; n?: number };
                  const extras = [
                    p.model ? `model: ${p.model}` : null,
                    p.n ? `n=${p.n}` : null,
                  ].filter(Boolean).join(' · ');
                  return [
                    typeof value === 'number' ? `${value.toFixed(2)}% ${extras ? ` (${extras})` : ''}` : String(value ?? ''),
                    'MAPE',
                  ];
                }}
              />
              <ReferenceLine
                y={target}
                stroke="#9a3232"
                strokeDasharray="4 4"
                label={{
                  value: `Target ${target.toFixed(1)}%`,
                  position: 'right',
                  fill: '#9a3232',
                  fontSize: 11,
                }}
              />
              <Bar dataKey="mape" radius={[4, 4, 0, 0]} isAnimationActive={false}>
                {series.map((row) => (
                  <Cell
                    key={row.month}
                    fill={
                      row.month === 'Overall'
                        ? '#3e5d80'
                        : row.mape <= target
                          ? '#2e7c5a'
                          : '#9a3232'
                    }
                  />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>

      <div className="trust-grid" style={{ marginTop: 14 }}>
        {kpis.map((k) => (
          <div className="trust-tile" key={k.label}>
            <div className="lab">{k.label}</div>
            <div
              className="big"
              style={{
                color:
                  k.caption === 'most variance'
                    ? 'var(--red, #9a3232)'
                    : 'var(--green, #2e7c5a)',
              }}
            >
              {k.value}
            </div>
            <div className="cap">{k.caption}</div>
          </div>
        ))}
      </div>

      {methodComparison && methodComparison.models.length > 0 && (
        <MethodComparison data={methodComparison} />
      )}
    </section>
  );
}

interface MCProps {
  data: NonNullable<BacktestPanel['methodComparison']>;
}

function MethodComparison({ data }: MCProps) {
  const fmtPct = (v: number | null, digits = 2) =>
    v == null ? '—' : `${(v * 100).toFixed(digits)}%`;
  const fmtDir = (v: number | null) =>
    v == null ? '—' : `${(v * 100).toFixed(0)}%`;

  const cellClass = (winner: boolean) =>
    winner
      ? 'text-right py-1.5 px-2 tabular-nums font-bold text-[var(--green,#2e7c5a)] bg-[var(--green-soft,#e7f1ec)]'
      : 'text-right py-1.5 px-2 tabular-nums text-[var(--ink-2)]';

  return (
    <div className="mt-4 lq-card">
      <div className="mb-2 flex items-center justify-between">
        <div>
          <div className="text-[10.5px] font-semibold uppercase tracking-wide text-[var(--muted)]">
            Methodology comparison
          </div>
          <div className="font-display text-[14px] font-bold tracking-tight">
            Which model is best?
          </div>
        </div>
        {data.winner && (
          <span className="tag-chip status green">
            Recommended · {data.models.find((m) => m.model === data.winner)?.modelLabel ?? data.winner}
          </span>
        )}
      </div>
      {data.winnerNote && (
        <div className="mb-2 text-[11.5px] text-[var(--muted)]">{data.winnerNote}</div>
      )}
      <div className="overflow-x-auto">
        <table className="w-full text-[12px]">
          <thead>
            <tr className="border-b border-[var(--hairline)]">
              <th className="text-left py-1.5 px-2 font-semibold text-[var(--muted)]">Model</th>
              <th className="text-right py-1.5 px-2 font-semibold text-[var(--muted)]">MAPE ↓</th>
              <th className="text-right py-1.5 px-2 font-semibold text-[var(--muted)]">MAE ↓</th>
              <th className="text-right py-1.5 px-2 font-semibold text-[var(--muted)]">RMSE ↓</th>
              <th className="text-right py-1.5 px-2 font-semibold text-[var(--muted)]">Directional ↑</th>
              <th className="text-right py-1.5 px-2 font-semibold text-[var(--muted)]">n</th>
            </tr>
          </thead>
          <tbody>
            {data.models.map((m) => (
              <tr
                key={m.model}
                className={
                  m.model === data.winner
                    ? 'border-b border-[var(--hairline)] bg-[var(--green-soft,#e7f1ec)]/40'
                    : 'border-b border-[var(--hairline)]'
                }
                data-testid={`method-row-${m.model}`}
              >
                <td className="py-1.5 px-2 font-semibold text-[var(--ink)]">
                  {m.modelLabel}
                  {m.model === data.winner && (
                    <span className="ml-1.5 text-[10px] font-semibold text-[var(--green,#2e7c5a)]">★ best</span>
                  )}
                </td>
                <td className={cellClass(m.isWinnerMape)}>{fmtPct(m.mape)}</td>
                <td className={cellClass(m.isWinnerMae)}>{fmtPct(m.mae)}</td>
                <td className={cellClass(m.isWinnerRmse)}>{fmtPct(m.rmse)}</td>
                <td className={cellClass(m.isWinnerDirectional)}>{fmtDir(m.directional)}</td>
                <td className="text-right py-1.5 px-2 tabular-nums text-[var(--muted)]">
                  {m.nTestPeriods ?? '—'}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="mt-2 text-[11px] text-[var(--muted)]">
        ↓ lower is better · ↑ higher is better · arrows in headers show direction.
        Source: <code className="font-mono text-[10.5px]">backtest_results</code> (live DB),
        horizon {data.horizonMonths ?? 3}mo
        {data.trainWindow ? ` · trained ${data.trainWindow}` : ''}.
      </div>
    </div>
  );
}
