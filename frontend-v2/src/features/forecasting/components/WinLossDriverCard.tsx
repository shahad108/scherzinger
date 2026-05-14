// WinLossDriverCard — v2.2 Phase D.
//
// Per-cluster PA/PR rejection-code lens. PA = competitor cheaper, PR =
// price too high. The card surfaces the share of closed quotes in each
// cluster that were lost to PA / PR over a 90-day window, plus a 12-month
// sparkline so Frank can see whether competitive pressure is rising.
//
// Tone: when PA% in the latest sparkline point is meaningfully above the
// trailing 3-month average we tone the PA chip red — that's the "rising
// competitor pressure" signal the reviewer flagged as the biggest unmet
// need in B2B pricing forecasting.
//
// Filter contract: this card honors cluster (backend supports it) but does
// NOT honor tier/family. Following the Phase C contract we render the
// scoped variant of FilterScopeBadge when those non-honored dimensions are
// active, and the muted scoped variant when only cluster is active.

import { Line, LineChart, ResponsiveContainer, Tooltip } from 'recharts';
import { FilterScopeBadge } from './FilterScopeBadge';
import type { FilterScope, WinLossPanel, WinLossRow } from '@/types/forecast';

interface Props {
  data?: WinLossPanel;
  filterScope?: FilterScope;
}

function isRising(row: WinLossRow): boolean {
  const spark = row.monthlySparkline;
  if (spark.length < 4) return false;
  const last = spark[spark.length - 1].paPct;
  const trailing = spark.slice(-4, -1);
  if (!trailing.length) return false;
  const avg = trailing.reduce((s, p) => s + p.paPct, 0) / trailing.length;
  // Rising if last is ≥ 5pp above the trailing 3-month average AND non-trivial.
  return last >= 5 && last - avg >= 5;
}

function fmtPct(v: number): string {
  return `${v.toFixed(1)}%`;
}

interface ChipProps {
  label: string;
  pct: number;
  tone: 'rose' | 'amber' | 'muted';
  testid?: string;
}

function Chip({ label, pct, tone, testid }: ChipProps) {
  const cls =
    tone === 'rose'
      ? 'bg-rose-50 text-rose-700'
      : tone === 'amber'
        ? 'bg-amber-50 text-amber-800'
        : 'bg-[var(--surface-soft)] text-[var(--ink-2)]';
  return (
    <span
      data-testid={testid}
      className={`inline-flex items-baseline gap-1 rounded-full px-2 py-0.5 text-[11px] font-semibold ${cls}`}
    >
      <span className="text-[9.5px] uppercase tracking-wide opacity-80">{label}</span>
      <span>{fmtPct(pct)}</span>
    </span>
  );
}

function Sparkline({ row }: { row: WinLossRow }) {
  return (
    <div className="h-9 w-32" data-testid="win-loss-sparkline">
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={row.monthlySparkline} margin={{ top: 2, right: 4, left: 0, bottom: 2 }}>
          <Tooltip
            cursor={false}
            contentStyle={{
              fontSize: 11,
              padding: '4px 6px',
              border: '1px solid var(--hairline)',
              borderRadius: 6,
            }}
            formatter={(value: number, name: string) => [`${value.toFixed(1)}%`, name === 'paPct' ? 'PA' : 'PR']}
            labelFormatter={(label: string) => label}
          />
          <Line
            type="monotone"
            dataKey="paPct"
            stroke="#be123c"
            strokeWidth={1.5}
            dot={false}
            isAnimationActive={false}
          />
          <Line
            type="monotone"
            dataKey="prPct"
            stroke="#7d8693"
            strokeWidth={1.25}
            strokeDasharray="3 3"
            dot={false}
            isAnimationActive={false}
          />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}

export function WinLossDriverCard({ data, filterScope }: Props) {
  if (!data || !data.rows || data.rows.length === 0) return null;

  // The card honors cluster but not tier/family. Show the unfiltered badge
  // only when tier or family is active.
  const tierOrFamilyActive = !!filterScope && (!!filterScope.tier || !!filterScope.family);

  return (
    <section
      data-testid="win-loss-card"
      className="mb-4 rounded-[12px] border border-[var(--hairline)] bg-white p-4"
    >
      <header className="mb-3 flex items-baseline justify-between gap-3">
        <div>
          <div className="text-[10.5px] font-semibold uppercase tracking-wide text-[var(--muted)]">
            Win/Loss drivers — last {data.window.days}d
          </div>
          <div className="font-display text-[16px] font-bold tracking-tight">
            Why are we losing quotes?
          </div>
        </div>
        {tierOrFamilyActive ? (
          <FilterScopeBadge unfiltered scope={filterScope} />
        ) : (
          <FilterScopeBadge scope={filterScope} />
        )}
      </header>
      <table className="w-full text-left text-[12.5px]">
        <thead className="text-[10.5px] uppercase tracking-wide text-[var(--muted)]">
          <tr className="border-b border-[var(--hairline)]">
            <th className="py-2">Cluster</th>
            <th>Lost to PA</th>
            <th>Lost to PR</th>
            <th>Sample</th>
            <th className="pl-4">Trailing 12mo</th>
          </tr>
        </thead>
        <tbody>
          {data.rows.map((row) => {
            const rising = isRising(row);
            return (
              <tr
                key={row.cluster}
                data-testid="win-loss-row"
                data-cluster={row.cluster}
                className="border-b border-[var(--hairline)] last:border-0"
              >
                <td className="py-2 font-semibold">{row.cluster}</td>
                <td>
                  <Chip
                    testid="win-loss-pa"
                    label="PA"
                    pct={row.paPct}
                    tone={rising ? 'rose' : row.paPct >= 20 ? 'amber' : 'muted'}
                  />
                </td>
                <td>
                  <Chip
                    testid="win-loss-pr"
                    label="PR"
                    pct={row.prPct}
                    tone={row.prPct >= 20 ? 'amber' : 'muted'}
                  />
                </td>
                <td className="text-[var(--ink-2)]">{row.sample}</td>
                <td className="pl-4">
                  <Sparkline row={row} />
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
      <p className="mt-2 text-[11px] text-[var(--muted)]">
        PA = competitor cheaper · PR = price too high. PA chip turns red when the latest month is
        ≥ 5pp above the trailing 3-month average.
      </p>
    </section>
  );
}
