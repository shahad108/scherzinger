// Phase 3 — Quarterly DB2 margin with 4-quarter WMA projection + floor band.
//
// Filter scope: does NOT honor tier/family/cluster — composer returns a global
// invoice aggregate. Renders an unfiltered FilterScopeBadge when any
// page-level filter is active.
// (v2.2 Phase C audit, 2026-05-14)

import {
  Area,
  ComposedChart,
  Line,
  CartesianGrid,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import type { FilterScope, MarginTrajectory } from '@/types/forecast';
import { AccuracyBadge } from './AccuracyBadge';
import { FilterScopeBadge } from './FilterScopeBadge';
import { ThresholdAlertButton } from './ThresholdAlertButton';

interface Props {
  data: MarginTrajectory;
  filterScope?: FilterScope;
}

export function MarginTrajectoryCard({ data, filterScope }: Props) {
  const merged = [
    ...data.historical.map((p) => ({ quarter: p.quarter, actual: p.margin })),
    ...data.projected.map((p) => ({
      quarter: p.quarter,
      projected: p.margin,
      low: p.low,
      high: p.high,
      bandSpan: p.high - p.low,
    })),
  ];

  return (
    <section className="mt-6">
      <div className="section-row">
        <div>
          <h2 className="flex items-center gap-2">
            Margin trajectory · 12 quarters + 4 quarter projection
            <FilterScopeBadge unfiltered scope={filterScope} />
          </h2>
          <div className="sub">{data.methodologyNote}</div>
        </div>
        <div className="flex items-center gap-2">
          {/* Phase 4.5 audit fix #4: MAPE was hardcoded to 0.0688 here.
              MarginTrajectory payload doesn't carry a model-specific MAPE,
              so render "—" via value=null until the backend provides one. */}
          <AccuracyBadge
            data={{ metric: 'mape', value: null, n: data.historical.length, horizonMonths: 12 }}
            entityType="commodity_group"
            drawerTitle="Margin trajectory — lineage"
          />
          <ThresholdAlertButton
            metric="margin"
            entityType="commodity_group"
            label="Margin trajectory"
            thresholdKind="margin_below_pct"
            defaultThreshold={data.floor}
          />
          {data.crossesFloorAt && (
            <span className="tag-chip status red">
              Crosses {data.floor}% in {data.crossesFloorAt}
            </span>
          )}
        </div>
      </div>

      <div className="lq-card">
        <div style={{ height: 240 }}>
          <ResponsiveContainer width="100%" height="100%">
            <ComposedChart data={merged} margin={{ top: 8, right: 16, left: 0, bottom: 8 }}>
              <CartesianGrid stroke="#eaedf1" vertical={false} />
              <XAxis dataKey="quarter" stroke="#7d8693" tick={{ fontSize: 11, fill: '#7d8693' }} tickLine={false} axisLine={{ stroke: '#dde1e7' }} />
              <YAxis stroke="#7d8693" tick={{ fontSize: 11, fill: '#7d8693' }} tickLine={false} axisLine={false} domain={['dataMin - 5', 'dataMax + 5']} tickFormatter={(v) => `${v.toFixed(0)}%`} width={42} />
              <Tooltip
                contentStyle={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 11, fontSize: 12, boxShadow: 'var(--shadow-pop)' }}
                formatter={(v: number, name: string) => [`${v.toFixed(1)}%`, name]}
              />
              <ReferenceLine y={data.floor} stroke="#9a3232" strokeDasharray="4 4" label={{ value: `Floor ${data.floor}%`, position: 'right', fill: '#9a3232', fontSize: 11 }} />
              <Area dataKey="bandSpan" stroke="none" fill="rgba(154,50,50,0.10)" />
              <Line type="monotone" dataKey="actual" stroke="#3e5d80" strokeWidth={2} dot={{ r: 3, fill: '#3e5d80' }} isAnimationActive={false} name="Actual" />
              <Line type="monotone" dataKey="projected" stroke="#9a3232" strokeWidth={2} strokeDasharray="6 4" dot={{ r: 3, fill: '#9a3232' }} isAnimationActive={false} name="Projection" />
            </ComposedChart>
          </ResponsiveContainer>
        </div>
        {data.crossesFloorAt && (
          <div className="mt-2 text-[11.5px] text-[var(--muted)]">
            At the current smoothed trend, margin crosses the {data.floor}% floor by {data.crossesFloorAt}.
          </div>
        )}
      </div>
    </section>
  );
}
