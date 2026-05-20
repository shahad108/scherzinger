// Phase 3 — Seasonal indices + current-month actual overlay.
//
// Filter scope: does NOT honor tier/family/cluster — composer reads the
// `seasonal_patterns` table with `entity_type='overall'`. Renders an
// unfiltered FilterScopeBadge when any page-level filter is active.
// (v2.2 Phase C audit, 2026-05-14)

import {
  Bar,
  BarChart,
  CartesianGrid,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import type { FilterScope, SeasonalOverlay } from '@/types/forecast';
import { AccuracyBadge } from './AccuracyBadge';
import { FilterScopeBadge } from './FilterScopeBadge';

interface Props {
  data: SeasonalOverlay;
  filterScope?: FilterScope;
}

export function SeasonalOverlayCard({ data, filterScope }: Props) {
  const merged = data.months.map((m, i) => ({
    month: m,
    index: data.indices[i],
    actual: m === data.currentMonthLabel ? data.currentMonthActual : null,
  }));

  const toneClass =
    data.deviationTone === 'red'
      ? 'status red'
      : data.deviationTone === 'amber'
        ? 'status amber'
        : 'status';

  return (
    <section className="mt-6">
      <div className="section-row">
        <div>
          <h2 className="flex items-center gap-2">
            Seasonal pattern · current month deviation
            <FilterScopeBadge unfiltered scope={filterScope} />
          </h2>
          <div className="sub">{data.note}</div>
        </div>
        <div className="flex items-center gap-2">
          {/* Phase 4.5 audit fix #4: was hardcoded value=0.05. */}
          <AccuracyBadge
            data={{ metric: 'mape', value: null, n: data.months.length, horizonMonths: 1 }}
            entityType="commodity_group"
            drawerTitle="Seasonal pattern — lineage"
          />
          <span className={`tag-chip ${toneClass}`}>
            {data.currentMonthLabel} actual {data.currentMonthActual.toFixed(1)} ·{' '}
            {data.deviationPct >= 0 ? '+' : ''}
            {data.deviationPct.toFixed(1)}% vs expected
          </span>
          {/* DATA-AUDIT-2026-05-17 defect #15 — partial-month disclosure */}
          {data.dataComplete === false && data.partialMonthDays && data.totalMonthDays ? (
            <span
              data-testid="seasonal-partial-month-chip"
              className="tag-chip"
              title="Current-month actual pro-rated to month-end for fair comparison against the historical baseline."
            >
              {data.currentMonthLabel} partial — {data.partialMonthDays}/{data.totalMonthDays} days
            </span>
          ) : null}
        </div>
      </div>

      <div className="lq-card">
        <div style={{ height: 220 }}>
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={merged} margin={{ top: 8, right: 16, left: 0, bottom: 8 }}>
              <CartesianGrid stroke="#eaedf1" vertical={false} />
              <XAxis dataKey="month" stroke="#7d8693" tick={{ fontSize: 11, fill: '#7d8693' }} tickLine={false} />
              <YAxis stroke="#7d8693" tick={{ fontSize: 11, fill: '#7d8693' }} tickLine={false} axisLine={false} domain={[60, 130]} tickFormatter={(v) => v.toFixed(0)} width={36} />
              <Tooltip
                contentStyle={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 11, fontSize: 12, boxShadow: 'var(--shadow-pop)' }}
                formatter={(v: number) => v.toFixed(1)}
              />
              <ReferenceLine y={100} stroke="#9a3232" strokeDasharray="4 4" label={{ value: 'Index 100', position: 'right', fill: '#9a3232', fontSize: 10 }} />
              <Bar dataKey="index" fill="rgba(62,93,128,0.6)" name="Seasonal index" />
              <Bar dataKey="actual" fill="#9a3232" name="Current actual" />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>
    </section>
  );
}
