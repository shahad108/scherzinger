// Phase 3 — Per-commodity-group quarterly margin multi-line.
//
// Filter scope: does NOT honor the active cluster/tier/family filter — the
// composer always returns all four commodity groups (BKAES/BKAGG/BKAIZ/MBDIV).
// Renders an unfiltered FilterScopeBadge when any page-level filter is active.
// (v2.2 Phase C audit, 2026-05-14)

import {
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
  Legend,
} from 'recharts';
import type { CommodityTrajectories, FilterScope } from '@/types/forecast';
import { AccuracyBadge } from './AccuracyBadge';
import { FilterScopeBadge } from './FilterScopeBadge';

const COLORS = ['#3e5d80', '#9a3232', '#6c5b9a', '#7d8693'];

interface Props {
  data: CommodityTrajectories;
  filterScope?: FilterScope;
}

export function CommodityTrajectoriesCard({ data, filterScope }: Props) {
  const merged = data.quarters.map((q, i) => {
    const row: Record<string, number | string | null> = { quarter: q };
    data.groups.forEach((g) => {
      row[g.id] = g.series[i] ?? null;
    });
    return row;
  });

  return (
    <section className="mt-6">
      <div className="section-row">
        <div>
          <h2 className="flex items-center gap-2">
            Commodity-group margin trajectories
            <FilterScopeBadge unfiltered scope={filterScope} />
          </h2>
          <div className="sub">
            One line per cluster. Trend arrows below the chart show the YoY slope.
          </div>
        </div>
        {/* Phase 4.5 audit fix #4: was hardcoded value=0.0688 placeholder. */}
        <AccuracyBadge
          data={{ metric: 'mape', value: null, n: data.quarters.length, horizonMonths: 12 }}
          entityType="commodity_group"
          drawerTitle="Commodity trajectories — lineage"
        />
      </div>

      <div className="lq-card">
        <div style={{ height: 240 }}>
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={merged} margin={{ top: 8, right: 16, left: 0, bottom: 8 }}>
              <CartesianGrid stroke="#eaedf1" vertical={false} />
              <XAxis dataKey="quarter" stroke="#7d8693" tick={{ fontSize: 11, fill: '#7d8693' }} tickLine={false} axisLine={{ stroke: '#dde1e7' }} />
              <YAxis stroke="#7d8693" tick={{ fontSize: 11, fill: '#7d8693' }} tickLine={false} axisLine={false} domain={[35, 75]} tickFormatter={(v) => `${v.toFixed(0)}%`} width={42} />
              <Tooltip
                contentStyle={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 11, fontSize: 12, boxShadow: 'var(--shadow-pop)' }}
                formatter={(v: number | null) => (v == null ? '—' : `${v.toFixed(1)}%`)}
              />
              <Legend wrapperStyle={{ fontSize: 11 }} />
              {data.groups.map((g, idx) => (
                <Line
                  key={g.id}
                  type="monotone"
                  dataKey={g.id}
                  stroke={COLORS[idx % COLORS.length]}
                  strokeWidth={2}
                  dot={false}
                  connectNulls
                  isAnimationActive={false}
                />
              ))}
            </LineChart>
          </ResponsiveContainer>
        </div>

        <ul className="mt-3 grid grid-cols-2 gap-2 md:grid-cols-4 text-[12px]" data-testid="commodity-slopes">
          {data.groups.map((g, idx) => {
            const arrow = g.slopePerYear < -1 ? '↓' : g.slopePerYear > 1 ? '↑' : '→';
            const tone = g.slopePerYear < -2 ? 'status red' : g.slopePerYear < -1 ? 'status amber' : 'status';
            return (
              <li key={g.id} className="flex items-center justify-between rounded-md border border-[var(--hairline)] bg-[var(--surface-soft)] px-2 py-1">
                <span className="flex items-center gap-1.5">
                  <span aria-hidden className="inline-block h-2 w-2 rounded-full" style={{ backgroundColor: COLORS[idx % COLORS.length] }} />
                  <b>{g.id}</b>
                </span>
                <span className={`tag-chip ${tone}`}>
                  {arrow} {g.slopePerYear.toFixed(1)}pp/yr
                </span>
              </li>
            );
          })}
        </ul>
      </div>
    </section>
  );
}
