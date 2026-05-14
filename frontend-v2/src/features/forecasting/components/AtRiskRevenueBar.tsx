// AtRiskRevenueBar — v2.2 Phase F.
//
// Aggregate "board-deck chart": next-12mo forecast revenue stacked per
// tier (A/B/C/D), with the at-risk portion shaded. Forecast € is sourced
// from the already-composed pareto block; at-risk probability is
// max(pChurn4Q, pMajorDecline) from the customers block.
//
// Filter contract (Phase C): pareto + customers are global aggregates
// (not refiltered to the active tier/family/cluster), so we always
// render the "unfiltered" badge variant when ANY page filter is active.

import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Legend,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import type { AtRiskRevenue, AtRiskTierRow, FilterScope } from '@/types/forecast';
import { formatEur } from './metricFormat';
import { FilterScopeBadge } from './FilterScopeBadge';

interface Props {
  data?: AtRiskRevenue;
  filterScope?: FilterScope;
}

const PATTERN_ID = 'at-risk-revenue-pattern';
const SAFE_FILL = '#1f3a5f';      // deep ink-blue (matches HeroForecast median)
const AT_RISK_FILL = `url(#${PATTERN_ID})`;
const AT_RISK_STROKE = '#be123c'; // rose-700

function totalShareText(total: AtRiskRevenue): string {
  if (total.totalForecastEur <= 0) return '0% at risk';
  const pct = (total.totalAtRiskEur / total.totalForecastEur) * 100;
  return `${pct.toFixed(1)}% at risk`;
}

function tierShareText(row: AtRiskTierRow): string {
  if (row.forecastEur <= 0) return '—';
  return `${(row.atRiskShare * 100).toFixed(1)}%`;
}

interface ChartDatum {
  tier: string;
  safe: number;
  atRisk: number;
  forecast: number;
  share: number;
  customerCount: number;
}

function toChartData(rows: AtRiskTierRow[]): ChartDatum[] {
  return rows.map((r) => ({
    tier: r.tier,
    safe: r.safeEur,
    atRisk: r.atRiskEur,
    forecast: r.forecastEur,
    share: r.atRiskShare,
    customerCount: r.customerCount,
  }));
}

export function AtRiskRevenueBar({ data, filterScope }: Props) {
  if (!data || !data.tiers || data.tiers.length === 0) return null;

  // The aggregation is global; any page-level filter means the user is
  // looking at a slice but this card is still showing all clusters.
  const filterIsActive =
    !!filterScope &&
    (!!filterScope.tier || !!filterScope.family || !!filterScope.cluster || !!filterScope.scenarioId);

  const chartData = toChartData(data.tiers);
  const subtitle = `Forecast ${formatEur(data.totalForecastEur)} · At risk ${formatEur(
    data.totalAtRiskEur,
  )} · ${totalShareText(data)}`;

  return (
    <section
      data-testid="at-risk-revenue-card"
      className="mb-4 rounded-[12px] border border-[var(--hairline)] bg-white p-4"
    >
      <header className="mb-3 flex items-baseline justify-between gap-3">
        <div>
          <div className="text-[10.5px] font-semibold uppercase tracking-wide text-[var(--muted)]">
            At-risk revenue next 12 months
          </div>
          <div className="font-display text-[16px] font-bold tracking-tight">
            Forecast by tier — safe vs at risk
          </div>
          <div
            data-testid="at-risk-revenue-subtitle"
            className="mt-0.5 text-[11.5px] text-[var(--muted)]"
          >
            {subtitle}
          </div>
        </div>
        {filterIsActive ? <FilterScopeBadge unfiltered scope={filterScope} /> : null}
      </header>
      <div className="h-56 w-full" data-testid="at-risk-revenue-chart">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={chartData} margin={{ top: 8, right: 12, left: 8, bottom: 8 }}>
            <defs>
              <pattern
                id={PATTERN_ID}
                patternUnits="userSpaceOnUse"
                width="6"
                height="6"
                patternTransform="rotate(45)"
              >
                <rect width="6" height="6" fill="#fee2e2" />
                <line x1="0" y1="0" x2="0" y2="6" stroke={AT_RISK_STROKE} strokeWidth="2" />
              </pattern>
            </defs>
            <CartesianGrid strokeDasharray="3 3" stroke="var(--hairline)" vertical={false} />
            <XAxis
              dataKey="tier"
              tick={{ fontSize: 11, fill: 'var(--ink-1)' }}
              tickLine={false}
              axisLine={{ stroke: 'var(--hairline)' }}
            />
            <YAxis
              tick={{ fontSize: 10, fill: 'var(--muted)' }}
              tickLine={false}
              axisLine={false}
              width={56}
              tickFormatter={(v: number) => formatEur(v)}
            />
            <Tooltip
              cursor={{ fill: 'rgba(15, 23, 42, 0.04)' }}
              contentStyle={{
                fontSize: 11,
                padding: '6px 8px',
                border: '1px solid var(--hairline)',
                borderRadius: 6,
              }}
              formatter={(value: number, name: string) => [
                formatEur(Number(value)),
                name === 'safe' ? 'Safe' : 'At risk',
              ]}
              labelFormatter={(label: string) => `Tier ${label}`}
            />
            <Legend
              verticalAlign="top"
              height={24}
              iconSize={10}
              wrapperStyle={{ fontSize: 11 }}
              formatter={(value: string) => (value === 'safe' ? 'Safe' : 'At risk')}
            />
            <Bar dataKey="safe" stackId="rev" fill={SAFE_FILL} isAnimationActive={false}>
              {chartData.map((d) => (
                <Cell key={`safe-${d.tier}`} />
              ))}
            </Bar>
            <Bar
              dataKey="atRisk"
              stackId="rev"
              fill={AT_RISK_FILL}
              stroke={AT_RISK_STROKE}
              strokeWidth={0.75}
              isAnimationActive={false}
            >
              {chartData.map((d) => (
                <Cell key={`risk-${d.tier}`} />
              ))}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>
      <ul
        data-testid="at-risk-revenue-legend"
        className="mt-3 grid grid-cols-2 gap-x-4 gap-y-1 text-[11px] sm:grid-cols-4"
      >
        {data.tiers.map((row) => (
          <li
            key={row.tier}
            data-testid="at-risk-tier-row"
            data-tier={row.tier}
            className="flex items-baseline justify-between gap-2 border-b border-[var(--hairline)] py-1"
          >
            <span className="font-semibold text-[var(--ink-1)]">Tier {row.tier}</span>
            <span className="text-[var(--muted)]">
              {row.customerCount} cust · {tierShareText(row)} at risk
            </span>
          </li>
        ))}
      </ul>
      <p className="mt-3 text-[11px] text-[var(--muted)]">
        At-risk € = next-12mo forecast × max(p<sub>churn</sub>, p<sub>decline</sub>) per customer.
        Source: Pareto forecast + customer risk scores.
      </p>
    </section>
  );
}
