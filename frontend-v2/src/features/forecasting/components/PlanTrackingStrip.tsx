// PlanTrackingStrip — cumulative plan-vs-actual line + variance attribution
// chips + plan-reset history.
//
// Answers Frank's question #1 of his weekly loop: "Did last week/month hit
// plan, and where did we miss?" PVM is *period-over-period* attribution;
// this card is anchored to the *plan*, which is what finance cares about.

import { useState } from 'react';
import { ComposedChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid } from 'recharts';
import type { PlanTracking } from '@/types/forecast';

interface Props {
  data: PlanTracking | undefined;
}

function formatEur(value: number): string {
  const sign = value < 0 ? '−' : '';
  const abs = Math.abs(value);
  if (abs >= 1_000_000) return `${sign}${(abs / 1_000_000).toFixed(2)}M €`;
  if (abs >= 1_000) return `${sign}${Math.round(abs / 1_000)}k €`;
  return `${sign}${Math.round(abs)} €`;
}

function gapTone(gapEur: number): { bg: string; fg: string; label: string } {
  if (gapEur >= 0) return { bg: 'bg-emerald-50', fg: 'text-emerald-700', label: 'On / above plan' };
  return { bg: 'bg-rose-50', fg: 'text-rose-700', label: 'Below plan' };
}

export function PlanTrackingStrip({ data }: Props) {
  const [showReset, setShowReset] = useState(false);
  if (!data || !data.points || data.points.length === 0) return null;

  // DATA-AUDIT-2026-05-17 defect #4 — when the BFF marks this block
  // degraded (no authoritative plan_targets table), render an honest
  // "plan unavailable" affordance instead of a fabricated headline.
  const degraded = data.meta?.status === 'degraded' || data.cumulativeGapEur == null;
  if (degraded) {
    return (
      <section
        data-testid="plan-tracking-strip"
        data-degraded="true"
        className="mb-4 rounded-[12px] border border-dashed border-[var(--hairline)] bg-[var(--surface-soft)] p-4 text-[12.5px] text-[var(--ink-2)]"
      >
        <div className="mb-1 text-[10.5px] font-semibold uppercase tracking-wide text-[var(--muted)]">
          Plan vs Actual — current FY
        </div>
        <div className="flex items-center gap-2">
          <span className="font-display text-[14px] font-bold tracking-tight">
            Plan target unavailable
          </span>
          <span className="rounded-full bg-amber-50 px-2 py-0.5 text-[10.5px] font-semibold uppercase tracking-wide text-amber-700">
            Data missing
          </span>
        </div>
        <p className="mt-1 text-[12px] text-[var(--muted)]">
          {data.meta?.reason ?? 'Plan targets not configured for this dataset'}.
          Cumulative gap and per-month plan lines are hidden until an
          authoritative plan_targets feed is wired in.
        </p>
      </section>
    );
  }

  // Build cumulative series so the line shows YTD trajectory.
  let cumPlan = 0;
  let cumActual = 0;
  const series = data.points.map((p) => {
    if (p.plan != null) cumPlan += p.plan;
    if (p.actual != null) cumActual += p.actual;
    return {
      month: p.month,
      cumPlan: p.plan != null ? cumPlan : null,
      cumActual: p.actual != null ? cumActual : null,
    };
  });
  const tone = gapTone(data.cumulativeGapEur ?? 0);
  const attr = data.recentMonthAttribution;

  return (
    <section data-testid="plan-tracking-strip" className="mb-4 rounded-[12px] border border-[var(--hairline)] bg-white p-4 shadow-[0_1px_2px_rgba(20,20,28,0.04)]">
      <header className="mb-3 flex flex-wrap items-baseline justify-between gap-3">
        <div>
          <div className="text-[10.5px] font-semibold uppercase tracking-wide text-[var(--muted)]">Plan vs Actual — current FY</div>
          <div className="font-display text-[16px] font-bold tracking-tight">YTD performance against the plan</div>
        </div>
        <div className="flex items-center gap-2">
          <span className={`inline-flex items-center rounded-full px-2.5 py-1 text-[12px] font-semibold ${tone.bg} ${tone.fg}`}>
            {tone.label}: {formatEur(data.cumulativeGapEur ?? 0)} ({(data.cumulativeGapPct ?? 0) >= 0 ? '+' : ''}{(data.cumulativeGapPct ?? 0).toFixed(1)}%)
          </span>
          <button
            type="button"
            onClick={() => setShowReset((v) => !v)}
            disabled={data.resetLog.length === 0}
            data-testid="plan-reset-history-button"
            className="rounded-md border border-[var(--hairline)] px-2.5 py-1 text-[11.5px] font-semibold text-[var(--ink-2)] hover:bg-[var(--surface-soft)] disabled:opacity-40"
          >
            Plan reset history ({data.resetLog.length})
          </button>
        </div>
      </header>

      <div className="h-[180px]">
        <ResponsiveContainer>
          <ComposedChart data={series} margin={{ top: 8, right: 12, left: 8, bottom: 0 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="var(--hairline)" vertical={false} />
            <XAxis dataKey="month" tick={{ fontSize: 11, fill: 'var(--muted)' }} axisLine={false} tickLine={false} />
            <YAxis tick={{ fontSize: 11, fill: 'var(--muted)' }} axisLine={false} tickLine={false} tickFormatter={(v) => formatEur(v)} />
            <Tooltip
              cursor={{ stroke: 'var(--hairline)', strokeDasharray: '3 3' }}
              formatter={(v: number, name: string) => [formatEur(v), name === 'cumPlan' ? 'Plan (cum)' : 'Actual (cum)']}
            />
            <Line type="monotone" dataKey="cumPlan" stroke="var(--ink-3)" strokeWidth={2} dot={false} isAnimationActive={false} name="Plan (cum)" />
            <Line type="monotone" dataKey="cumActual" stroke="var(--rose-deep)" strokeWidth={2.5} dot={false} isAnimationActive={false} name="Actual (cum)" connectNulls={false} />
          </ComposedChart>
        </ResponsiveContainer>
      </div>

      {attr && (
        <div data-testid="plan-variance-attribution" className="mt-3 flex flex-wrap items-center gap-2 text-[12px]">
          <span className="text-[10.5px] font-semibold uppercase tracking-wide text-[var(--muted)]">Latest month miss attribution</span>
          <AttrChip label="Price" value={attr.price} />
          <AttrChip label="Volume" value={attr.volume} />
          <AttrChip label="Mix" value={attr.mix} />
          <AttrChip label="Cost" value={attr.cost} />
          {typeof attr.other === 'number' && <AttrChip label="Other" value={attr.other} />}
        </div>
      )}

      {showReset && data.resetLog.length > 0 && (
        <div data-testid="plan-reset-history" className="mt-3 rounded-md border border-[var(--hairline)] bg-[var(--surface-soft)] p-3">
          <div className="mb-2 text-[10.5px] font-semibold uppercase tracking-wide text-[var(--muted)]">Plan reset audit</div>
          <ul className="space-y-1 text-[12px]">
            {data.resetLog.map((entry, i) => (
              <li key={`${entry.at}-${i}`} className="flex flex-wrap gap-x-2">
                <span className="font-mono text-[11px] text-[var(--muted)]">{entry.at.slice(0, 10)}</span>
                <span className="font-semibold">{entry.by}</span>
                <span className="text-[var(--ink-2)]">— {entry.reason}</span>
                <span className="ml-auto text-[var(--muted)]">prior {formatEur(entry.priorValue)}</span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </section>
  );
}

function AttrChip({ label, value }: { label: string; value: number }) {
  const sign = value < 0 ? '−' : '+';
  const tone = value < 0 ? 'bg-rose-50 text-rose-700' : 'bg-emerald-50 text-emerald-700';
  return (
    <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-semibold ${tone}`}>
      {label} {sign}{formatEur(Math.abs(value)).replace('−', '')}
    </span>
  );
}
