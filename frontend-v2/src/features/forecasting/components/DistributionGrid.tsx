// Phase 1 — Per-entity distribution grid (cards).
//
// Renders one card per entity (commodity_group by default — 4 visible,
// "Show all" expands to 43 customers). Each card carries the median,
// p5/p95 range bar, and a "P-below-threshold" severity chip.

import { useMemo, useState, type KeyboardEvent } from 'react';
import type { ClusterCard, DistributionRow, ForecastDistributions } from '@/types/forecast';
import { AccuracyBadge } from './AccuracyBadge';
import { DistributionDrawer } from './DistributionDrawer';
import {
  capP95,
  defaultThreshold,
  formatMetricValue,
  metricUnit,
} from './metricFormat';

interface Props {
  distributions: ForecastDistributions;
  initialLimit?: number;
  // Phase 4.5: per-cluster MAPE comes from `clusters` (DB-backed backtest).
  clusters?: ClusterCard[];
}

export function DistributionGrid({ distributions, initialLimit = 4, clusters }: Props) {
  // Phase 4.5 audit fix #4: map per-entity MAPE from the cluster payload
  // instead of hardcoding 0.0688 on every card.
  const mapeByCluster = useMemo(() => {
    const map = new Map<string, number | null>();
    (clusters ?? []).forEach((c) => map.set(c.id, c.mape ?? null));
    return map;
  }, [clusters]);
  const [showAll, setShowAll] = useState(false);
  const [activeRow, setActiveRow] = useState<DistributionRow | null>(null);
  const rows = distributions.rows;
  const metric = distributions.metric;
  const visible = showAll ? rows : rows.slice(0, initialLimit);

  // Compute the global range AFTER P95 capping so a bootstrap blow-up on
  // one cluster doesn't flatten every other card's range bar.
  const range = useMemo(() => {
    if (!rows.length) return { lo: 0, hi: 1 };
    let lo = Infinity;
    let hi = -Infinity;
    for (const r of rows) {
      const cappedHi = capP95(r.p95, r.median).value ?? r.p95;
      if (r.p5 != null) lo = Math.min(lo, r.p5);
      if (cappedHi != null) hi = Math.max(hi, cappedHi);
    }
    if (!Number.isFinite(lo) || !Number.isFinite(hi)) return { lo: 0, hi: 1 };
    return { lo, hi };
  }, [rows]);

  return (
    <section className="mt-6">
      <div className="section-row">
        <div>
          <h2>Per-entity distributions</h2>
          <div className="sub">
            Monte Carlo distribution per {distributions.entityType.replace('_', ' ')} for the active
            metric × horizon. Click a card for the full histogram + lineage.
          </div>
        </div>
        {rows.length > initialLimit && (
          <button
            type="button"
            data-testid="show-all-distributions"
            onClick={() => setShowAll((v) => !v)}
            className="tag-chip"
          >
            {showAll ? `Show top ${initialLimit}` : `Show all ${rows.length}`}
          </button>
        )}
      </div>

      <div
        className="round-grid"
        style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))' }}
        data-testid="distribution-grid"
      >
        {visible.map((row) => {
          const tone = severityTone(row.pBelowThreshold);
          const thresholdValue =
            row.thresholdValue != null && row.thresholdValue !== 0
              ? row.thresholdValue
              : defaultThreshold(metric);
          const { value: cappedP95, clamped } = capP95(row.p95, row.median);
          const lastActualDisplay =
            row.lastActual != null && row.lastActual !== 0
              ? formatMetricValue(metric, row.lastActual)
              : formatMetricValue(metric, row.median);
          const handleKey = (e: KeyboardEvent<HTMLDivElement>) => {
            if (e.key === 'Enter' || e.key === ' ') {
              e.preventDefault();
              setActiveRow(row);
            }
          };
          return (
            // Use div+role="button" instead of a real <button> so the
            // embedded AccuracyBadge (which IS a button) doesn't trigger
            // the React "<button> cannot descend from <button>" warning.
            <div
              key={row.entityId}
              role="button"
              tabIndex={0}
              onClick={() => setActiveRow(row)}
              onKeyDown={handleKey}
              data-testid={`distribution-card-${row.entityId}`}
              className="round-card text-left cursor-pointer focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--rose-deep)]"
            >
              <div className="rc-title">
                <h3>{row.entityName}</h3>
                <div className="sub">
                  Last actual:{' '}
                  <b className="tabular-nums">{lastActualDisplay}</b>
                </div>
              </div>

              <div className="mt-1.5 text-[26px] font-display font-bold tracking-tight tabular-nums text-[var(--ink)]">
                {formatMetricValue(metric, row.median)}
                <span className="ml-1 text-[12px] font-semibold text-[var(--muted)]">
                  median
                </span>
              </div>

              <RangeBar
                lo={row.p5 ?? 0}
                median={row.median ?? 0}
                hi={cappedP95 ?? 0}
                globalLo={range.lo}
                globalHi={range.hi}
              />

              <div className="round-tags">
                <span className={`tag-chip ${tone === 'red' ? 'status red' : tone === 'amber' ? 'status amber' : 'status'}`}>
                  P(&lt; {formatMetricValue(metric, thresholdValue)}):{' '}
                  {row.pBelowThreshold != null ? `${row.pBelowThreshold.toFixed(1)}%` : '—'}
                </span>
                <span className="tag-chip">
                  P5 {formatMetricValue(metric, row.p5)} · P95{' '}
                  {formatMetricValue(metric, cappedP95)}
                  {clamped && (
                    <span className="ml-1" title="Wide band — P95 capped at 6× median.">
                      ⚠
                    </span>
                  )}
                </span>
                {/* Render the AccuracyBadge OUTSIDE the card click target so the
                    nested button isn't a hydration violation. */}
                <span onClick={(e) => e.stopPropagation()} role="presentation">
                  <AccuracyBadge
                    data={{
                      metric: 'mape',
                      value: mapeByCluster.has(row.entityId)
                        ? mapeByCluster.get(row.entityId) ?? null
                        : null,
                      n: row.nSimulations,
                      horizonMonths: distributions.horizonMonths,
                      clusterId: row.entityId,
                      modelId: 'margin_walk_forward_v3',
                    }}
                    entityType={distributions.entityType}
                    entityId={row.entityId}
                    drawerTitle={`${row.entityName} — lineage`}
                  />
                </span>
              </div>

              {/* Tiny metric label so the unit isn't ambiguous on a screenshot. */}
              <div className="mt-1 text-[10.5px] font-semibold uppercase tracking-wide text-[var(--muted)]">
                {distributions.metric} · {metricUnit(metric)}
              </div>
            </div>
          );
        })}
      </div>

      <DistributionDrawer
        row={activeRow}
        distributions={distributions}
        open={!!activeRow}
        onClose={() => setActiveRow(null)}
      />
    </section>
  );
}

function severityTone(pct: number | null): 'green' | 'amber' | 'red' {
  if (pct == null) return 'green';
  if (pct >= 30) return 'red';
  if (pct >= 15) return 'amber';
  return 'green';
}

interface RangeBarProps {
  lo: number;
  median: number;
  hi: number;
  globalLo: number;
  globalHi: number;
}

function RangeBar({ lo, median, hi, globalLo, globalHi }: RangeBarProps) {
  const span = Math.max(globalHi - globalLo, 1e-6);
  const leftPct = ((lo - globalLo) / span) * 100;
  const widthPct = ((hi - lo) / span) * 100;
  const medianPct = ((median - globalLo) / span) * 100;

  return (
    <div className="mt-2 mb-1 h-3 w-full rounded-full bg-[var(--surface-sunken)] relative">
      <div
        className="absolute top-0 bottom-0 rounded-full bg-[var(--rose-bg)]"
        style={{ left: `${leftPct}%`, width: `${widthPct}%` }}
      />
      <div
        className="absolute top-[-2px] bottom-[-2px] w-[2px] bg-[var(--rose-deep)]"
        style={{ left: `${medianPct}%` }}
      />
    </div>
  );
}
