// Phase 6 — Compact pipeline bridge card.

import { useState } from 'react';
import type { QuoteToRevenue } from '@/types/forecast';
import { AccuracyBadge } from './AccuracyBadge';

interface Props {
  data: QuoteToRevenue;
}

const HORIZONS = [30, 60, 90] as const;

export function QuoteToRevenueBridge({ data }: Props) {
  const [horizon, setHorizon] = useState<(typeof HORIZONS)[number]>(30);
  const row =
    data.horizons.find((h) => h.horizonDays === horizon) ?? data.horizons[0];

  return (
    <section className="mt-6">
      <div className="section-row">
        <div>
          <h2>Pipeline · Quote-to-Revenue bridge</h2>
          <div className="sub">
            Open Quotes × Win Rate × Avg Margin = Expected Gross Profit, over the chosen horizon.
            Backs into the deal-empowerment story for Heiko.
          </div>
        </div>
        <div className="flex items-center gap-2">
          {/* Phase 4.5 audit fix #4: was hardcoded WAPE 0.21. */}
          <AccuracyBadge
            data={{ metric: 'wape', value: null, n: 90, horizonMonths: 3 }}
            entityType="commodity_group"
            drawerTitle="Quote-to-Revenue — lineage"
          />
          <div role="tablist" aria-label="Closing horizon" className="inline-flex items-center gap-1 rounded-full bg-white p-1 shadow-[inset_0_0_0_1px_var(--hairline)]">
            {HORIZONS.map((h) => {
              const isActive = h === horizon;
              return (
                <button
                  key={h}
                  type="button"
                  data-testid={`q2r-horizon-${h}`}
                  aria-selected={isActive}
                  onClick={() => setHorizon(h)}
                  className={
                    isActive
                      ? 'rounded-full bg-[var(--rose-bg)] px-3 py-1 text-[11.5px] font-semibold text-[var(--rose-deep)]'
                      : 'rounded-full px-3 py-1 text-[11.5px] font-semibold text-[var(--muted)] hover:bg-[var(--surface-soft)]'
                  }
                >
                  {h}d
                </button>
              );
            })}
          </div>
        </div>
      </div>

      <div className="lq-card grid grid-cols-1 gap-3 md:grid-cols-3" data-testid="q2r-bridge">
        <Stat label="Open quotes" value={`${row.openQuotes}`} sub={`€${fmt(row.openPipelineEur)} pipeline`} />
        <Stat label="Win rate" value={`${(row.winRate * 100).toFixed(1)}%`} sub={`Avg margin ${(row.avgMargin * 100).toFixed(1)}%`} />
        <Stat
          label="Expected Gross Profit"
          value={`€${fmt(row.expectedGrossProfit)}`}
          sub={`Expected revenue €${fmt(row.expectedRevenue)}`}
          highlight
        />
      </div>
    </section>
  );
}

interface StatProps {
  label: string;
  value: string;
  sub?: string;
  highlight?: boolean;
}

function Stat({ label, value, sub, highlight }: StatProps) {
  return (
    <div
      className={
        highlight
          ? 'rounded-md border border-[var(--rose-deep)] bg-[var(--rose-bg)] p-3'
          : 'rounded-md border border-[var(--hairline)] bg-[var(--surface-soft)] p-3'
      }
    >
      <div className="text-[10.5px] font-semibold uppercase tracking-wide text-[var(--muted)]">
        {label}
      </div>
      <div className="mt-1 font-display text-[22px] font-bold tabular-nums text-[var(--ink)]">
        {value}
      </div>
      {sub && <div className="text-[11.5px] text-[var(--muted)]">{sub}</div>}
    </div>
  );
}

function fmt(value: number): string {
  if (value >= 1_000_000) return `${(value / 1_000_000).toFixed(2)}M`;
  if (value >= 1_000) return `${(value / 1_000).toFixed(0)}K`;
  return value.toFixed(0);
}
