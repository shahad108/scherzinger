// Phase 3 — Quarterly DB2 margin with 4-quarter WMA projection + floor band.

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
import type { MarginTrajectory } from '@/types/forecast';
import { AccuracyBadge } from './AccuracyBadge';

interface Props {
  data: MarginTrajectory;
}

export function MarginTrajectoryCard({ data }: Props) {
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
          <h2>Margin trajectory · 12 quarters + 4 quarter projection</h2>
          <div className="sub">{data.methodologyNote}</div>
        </div>
        <div className="flex items-center gap-2">
          <AccuracyBadge
            data={{ metric: 'mape', value: 0.0688, n: 12, horizonMonths: 12 }}
            entityType="commodity_group"
            drawerTitle="Margin trajectory — lineage"
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
