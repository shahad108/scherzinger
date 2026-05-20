// Phase 1.1 — Unit-aware formatting for the simulator surface.
//
// The persisted Monte Carlo numbers are raw floats whose meaning depends on
// the active metric: revenue is in € (often 6-digit), margin is a fraction
// (e.g. 0.644 → 64.4%), quantity is unitless counts. This module returns the
// right display string for each metric so distribution cards / drawers /
// briefings all speak the same language.

import type { SimulatorMetric } from '@/types/forecast';

export type SimulatorMetricLike =
  | SimulatorMetric
  | 'volume'
  | 'mape'
  | 'auc_roc'
  | 'calibration_p80_hit'
  | 'wape'
  | string;

/** Compact € formatter — €1.2M / €380K / €420. */
export function formatEur(value: number | null | undefined): string {
  if (value == null || !Number.isFinite(value)) return '—';
  const abs = Math.abs(value);
  if (abs >= 1_000_000) return `€${(value / 1_000_000).toFixed(2)}M`;
  if (abs >= 1_000) return `€${Math.round(value / 1_000)}K`;
  return `€${Math.round(value)}`;
}

/** Margin fraction (0.644) → percentage string (64.4%). */
export function formatMarginPct(value: number | null | undefined): string {
  if (value == null || !Number.isFinite(value)) return '—';
  // Persisted as a fraction; multiply by 100 for display. If a value
  // accidentally arrives already × 100 (e.g. 64.4 not 0.644), keep the
  // sign-and-magnitude reading sensible by detecting > 5 as "already pct".
  const pct = Math.abs(value) > 5 ? value : value * 100;
  return `${pct.toFixed(1)}%`;
}

/** Quantity / volume — compact thousands. */
export function formatQuantity(value: number | null | undefined): string {
  if (value == null || !Number.isFinite(value)) return '—';
  const abs = Math.abs(value);
  if (abs >= 1_000_000) return `${(value / 1_000_000).toFixed(2)}M`;
  if (abs >= 1_000) return `${(value / 1_000).toFixed(1)}K`;
  return value < 10 ? value.toFixed(1) : Math.round(value).toString();
}

/** Top-level dispatcher: pick the right formatter for the metric. */
export function formatMetricValue(
  metric: SimulatorMetricLike,
  value: number | null | undefined,
): string {
  switch (metric) {
    case 'revenue':
      return formatEur(value);
    case 'margin':
      return formatMarginPct(value);
    case 'quantity':
    case 'volume':
      return formatQuantity(value);
    default:
      if (value == null || !Number.isFinite(value)) return '—';
      return value.toFixed(2);
  }
}

/** Render-friendly suffix for the metric (used in chip labels). */
export function metricUnit(metric: SimulatorMetricLike): string {
  switch (metric) {
    case 'revenue':
      return 'EUR';
    case 'margin':
      return 'pp margin';
    case 'quantity':
    case 'volume':
      return 'units';
    default:
      return '';
  }
}

/** A sensible default threshold per metric for the "P(below threshold)" chip. */
export function defaultThreshold(metric: SimulatorMetricLike): number {
  switch (metric) {
    case 'revenue':
      return 100_000; // €100K floor
    case 'margin':
      return 0.5; // 50% margin floor
    case 'quantity':
    case 'volume':
      return 100;
    default:
      return 0;
  }
}

/**
 * Cap an absurd quantile when the bootstrap blew up.
 *
 * For Scherzinger's per-cluster revenue runs, P95 should typically be ≤ ~6×
 * the median. Anything beyond that is almost certainly a bootstrap blow-up
 * on a sparse series — we clamp the display value and flag it via the
 * returned `clamped` boolean so the FE can show a "wide-band" annotation.
 */
export function capP95(
  p95: number | null | undefined,
  median: number | null | undefined,
): { value: number | null; clamped: boolean } {
  if (p95 == null || median == null || !Number.isFinite(p95) || !Number.isFinite(median)) {
    return { value: p95 ?? null, clamped: false };
  }
  const ratio = Math.abs(median) > 0 ? Math.abs(p95 / median) : Infinity;
  if (ratio > 6) {
    return { value: median * 6, clamped: true };
  }
  return { value: p95, clamped: false };
}
