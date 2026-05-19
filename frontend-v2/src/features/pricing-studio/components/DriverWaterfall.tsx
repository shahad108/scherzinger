// Pricing Studio v3 / Phase 1 — Driver attribution waterfall.
//
// Sorts drivers by |contribution_pct| descending and renders horizontal
// bars whose length is proportional to that contribution. Floor protection
// gets an emphasised treatment when `?source=margin` (set by the
// RecommendationHero via the `emphasiseFloor` prop).
//
// We deliberately render a plain bar list rather than Recharts here —
// the waterfall is 5 items, and the recharts overhead for that small a
// chart hurts more than it helps (no axis, no tooltip needed).
//
// Phase D3 — label legibility at 1280px container width:
//   * truncate labels at 24 chars with ellipsis (`<title>` shows full text)
//   * collapse to top-5 by default; "Show N more" expander reveals the rest

import { useState } from 'react';
import type { RecommendationDriver } from '@/types/studio';
import { LineageButton } from '@/components/LineageButton';
import { DataMissingBadge } from '@/components/DataMissingBadge';
import { parseDecimal } from '../lib/decimal';

const LABEL_CAP = 24;
const TOP_N = 5;

function truncate(s: string): string {
  if (s.length <= LABEL_CAP) return s;
  return `${s.slice(0, LABEL_CAP - 1)}…`;
}

interface Props {
  drivers?: RecommendationDriver[];
  /** Apply a thin rose-deep ring to floor_protection driver chip (deep-link source=margin). */
  emphasiseFloor?: boolean;
  className?: string;
}

const KIND_LABELS: Record<string, string> = {
  cost_trajectory: 'Cost trajectory',
  competitor_signal: 'Competitor signal',
  customer_mix: 'Customer mix',
  win_prob_optimum: 'Win-prob optimum',
  floor_protection: 'Floor protection',
};

const KIND_COLOR: Record<string, string> = {
  cost_trajectory: 'var(--amber)',
  competitor_signal: 'var(--violet)',
  customer_mix: 'var(--ink-3)',
  win_prob_optimum: 'var(--rose)',
  floor_protection: 'var(--rose-deep)',
};

export function DriverWaterfall({ drivers, emphasiseFloor = false, className }: Props) {
  const [expanded, setExpanded] = useState(false);

  if (!drivers || drivers.length === 0) {
    return (
      <div
        className={`rounded-[var(--r-md)] border border-[var(--hairline)] bg-white p-3 ${className ?? ''}`}
        data-testid="driver-waterfall"
      >
        <div className="mb-2 flex items-center justify-between">
          <h5 className="font-display text-[11px] font-bold uppercase tracking-[0.06em] text-[var(--muted)]">
            Drivers
          </h5>
        </div>
        <DataMissingBadge reason="No drivers" />
      </div>
    );
  }

  const sorted = [...drivers].sort(
    (a, b) => Math.abs(parseDecimal(b.contribution_pct)) - Math.abs(parseDecimal(a.contribution_pct)),
  );
  const max = Math.max(...sorted.map((d) => Math.abs(parseDecimal(d.contribution_pct))), 0.0001);
  const hasOverflow = sorted.length > TOP_N;
  const visible = hasOverflow && !expanded ? sorted.slice(0, TOP_N) : sorted;
  const hiddenCount = hasOverflow ? sorted.length - TOP_N : 0;

  return (
    <div
      className={`rounded-[var(--r-md)] border border-[var(--hairline)] bg-white p-3 ${className ?? ''}`}
      data-testid="driver-waterfall"
    >
      <div className="mb-2 flex items-center justify-between gap-2">
        <h5 className="font-display text-[11px] font-bold uppercase tracking-[0.06em] text-[var(--muted)]">
          Drivers
        </h5>
        <span className="text-[10.5px] text-[var(--muted)]">contribution %</span>
      </div>
      <ul className="space-y-1.5">
        {visible.map((d, i) => {
          const value = parseDecimal(d.contribution_pct);
          const pctNum = Number.isFinite(value) ? value * 100 : 0;
          const width = (Math.abs(value) / max) * 100;
          const color = KIND_COLOR[d.kind] ?? 'var(--ink-3)';
          const isFloor = d.kind === 'floor_protection';
          const emphasised = isFloor && emphasiseFloor;
          const fullLabel = d.label || KIND_LABELS[d.kind] || d.kind;
          const displayLabel = truncate(fullLabel);
          return (
            <li
              key={`${d.kind}-${i}`}
              className={`grid grid-cols-[1fr_auto] items-center gap-2 rounded-md px-2 py-1 ${
                emphasised ? 'ring-1 ring-[var(--rose-deep)]' : ''
              }`}
              data-driver-kind={d.kind}
            >
              <div className="min-w-0">
                <div className="flex items-baseline justify-between gap-2">
                  <span
                    className="block min-w-0 overflow-hidden text-[12px] font-semibold text-[var(--ink-2)]"
                    style={{
                      whiteSpace: 'nowrap',
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                    }}
                    title={fullLabel}
                  >
                    {displayLabel}
                  </span>
                  <span className="tabular-nums text-[11px] text-[var(--muted)]">
                    {pctNum >= 0 ? '+' : '−'}
                    {Math.abs(pctNum).toFixed(1)}%
                  </span>
                </div>
                <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-[var(--surface-sunken)]">
                  <div
                    className="h-full rounded-full"
                    style={{ width: `${width}%`, background: color }}
                    aria-hidden="true"
                  />
                </div>
              </div>
              <LineageButton
                lineageRef={d.lineage_ref ?? null}
                label="src"
                subjectTitle={`Driver — ${fullLabel}`}
              />
            </li>
          );
        })}
      </ul>
      {hasOverflow && (
        <button
          type="button"
          onClick={() => setExpanded((v) => !v)}
          data-testid="driver-waterfall-expander"
          className="mt-2 inline-flex items-center gap-1 rounded-full border border-[var(--hairline)] bg-white px-2.5 py-1 text-[10.5px] font-semibold uppercase tracking-[0.05em] text-[var(--muted)] hover:border-[var(--rose-border)] hover:bg-[var(--rose-bg)] hover:text-[var(--rose-deep)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--rose)] focus-visible:ring-offset-1"
        >
          {expanded ? 'Show fewer' : `Show ${hiddenCount} more (+${hiddenCount})`}
        </button>
      )}
    </div>
  );
}
