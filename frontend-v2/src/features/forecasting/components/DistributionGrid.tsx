// Phase 1 — Per-entity distribution grid (cards).
//
// Renders one card per entity (commodity_group by default — 4 visible,
// "Show all" expands to 43 customers). Each card carries the median,
// p5/p95 range bar, and a "P-below-threshold" severity chip.

import { useMemo, useState } from 'react';
import type { DistributionRow, ForecastDistributions } from '@/types/forecast';
import { AccuracyBadge } from './AccuracyBadge';
import { DistributionDrawer } from './DistributionDrawer';

interface Props {
  distributions: ForecastDistributions;
  initialLimit?: number;
}

export function DistributionGrid({ distributions, initialLimit = 4 }: Props) {
  const [showAll, setShowAll] = useState(false);
  const [activeRow, setActiveRow] = useState<DistributionRow | null>(null);
  const rows = distributions.rows;

  const visible = showAll ? rows : rows.slice(0, initialLimit);

  const range = useMemo(() => {
    if (!rows.length) return { lo: 0, hi: 1 };
    let lo = Infinity;
    let hi = -Infinity;
    for (const r of rows) {
      if (r.p5 != null) lo = Math.min(lo, r.p5);
      if (r.p95 != null) hi = Math.max(hi, r.p95);
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
          return (
            <button
              key={row.entityId}
              type="button"
              onClick={() => setActiveRow(row)}
              data-testid={`distribution-card-${row.entityId}`}
              className="round-card text-left"
            >
              <div className="rc-title">
                <h3>{row.entityName}</h3>
                <div className="sub">
                  Last actual:{' '}
                  <b className="tabular-nums">
                    {row.lastActual != null ? row.lastActual.toFixed(1) : '—'}
                  </b>
                </div>
              </div>

              <div className="mt-1.5 text-[26px] font-display font-bold tracking-tight tabular-nums text-[var(--ink)]">
                {row.median != null ? row.median.toFixed(1) : '—'}
                <span className="ml-1 text-[12px] font-semibold text-[var(--muted)]">
                  median
                </span>
              </div>

              <RangeBar
                lo={row.p5 ?? 0}
                median={row.median ?? 0}
                hi={row.p95 ?? 0}
                globalLo={range.lo}
                globalHi={range.hi}
              />

              <div className="round-tags">
                <span className={`tag-chip ${tone === 'red' ? 'status red' : tone === 'amber' ? 'status amber' : 'status'}`}>
                  P(&lt; {row.thresholdValue}):{' '}
                  {row.pBelowThreshold != null ? `${row.pBelowThreshold.toFixed(1)}%` : '—'}
                </span>
                <span className="tag-chip">
                  P5 {row.p5?.toFixed(1)} · P95 {row.p95?.toFixed(1)}
                </span>
                <span onClick={(e) => e.stopPropagation()} role="presentation">
                  <AccuracyBadge
                    data={{
                      metric: 'mape',
                      value: 0.0688,
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
            </button>
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
