// Shared RecommendationMetaChips — Phase D1 of the Pricing Studio plan.
//
// Single source of truth for the recommendation-meta chip strip used on BOTH
// Action Center decision cards and the Pricing Studio recommendation hero.
// Renders the same chips for the same SKU on both screens.
//
// Chips (in order, separated by a thin dot):
//   1. Cluster: "Cluster {label}"
//   2. Cluster confidence: "{n}% conf"
//   3. Sample size: "n={n}"
//   4. Model version: "{id} v{version}" or just the version
//   5. Trained at: "trained {YYYY-MM-DD}"
//   6. Stale (amber) — only when `stale` is true
//
// Any missing prop skips its chip silently so callers can pass partials.
//
// Tokens only — no hex literals. Sizing follows the spec in the plan:
// 12px text, 6px vertical / 10px horizontal padding, rounded-full,
// warm-gray surface.

import type { CSSProperties } from 'react';

interface Props {
  cluster?: string;
  /** 0..100 — already converted to a percent integer. */
  clusterConfidence?: number;
  sampleSize?: number | null;
  modelVersion?: string | null;
  /** ISO-8601 timestamp; rendered as YYYY-MM-DD. */
  trainedAt?: string | null;
  /** Optional model id (rendered before the version). */
  modelId?: string | null;
  /** When true, an amber "Stale" chip is appended. */
  stale?: boolean;
  className?: string;
}

const chipStyle: CSSProperties = {
  background: 'var(--surface-sunken)',
  color: 'var(--ink-2)',
  padding: '6px 10px',
  fontSize: 12,
  lineHeight: 1.2,
};

const staleStyle: CSSProperties = {
  background: 'var(--amber-bg)',
  color: 'var(--amber)',
  border: '1px solid var(--amber-border)',
  padding: '6px 10px',
  fontSize: 12,
  lineHeight: 1.2,
};

function formatTrainedAt(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toISOString().slice(0, 10);
}

function isNonEmpty(s: string | null | undefined): s is string {
  return typeof s === 'string' && s.length > 0;
}

export function RecommendationMetaChips({
  cluster,
  clusterConfidence,
  sampleSize,
  modelVersion,
  trainedAt,
  modelId,
  stale,
  className,
}: Props) {
  const chips: Array<{ key: string; text: string }> = [];

  if (isNonEmpty(cluster)) {
    chips.push({ key: 'cluster', text: `Cluster ${cluster}` });
  }
  if (typeof clusterConfidence === 'number' && Number.isFinite(clusterConfidence)) {
    chips.push({ key: 'conf', text: `${Math.round(clusterConfidence)}% conf` });
  }
  if (typeof sampleSize === 'number' && Number.isFinite(sampleSize)) {
    chips.push({ key: 'n', text: `n=${sampleSize}` });
  }
  if (isNonEmpty(modelVersion) || isNonEmpty(modelId)) {
    const parts: string[] = [];
    if (isNonEmpty(modelId)) parts.push(modelId);
    if (isNonEmpty(modelVersion)) parts.push(`v${modelVersion}`);
    chips.push({ key: 'model', text: parts.join(' ') });
  }
  if (isNonEmpty(trainedAt)) {
    chips.push({ key: 'trained', text: `trained ${formatTrainedAt(trainedAt)}` });
  }

  if (chips.length === 0 && !stale) return null;

  return (
    <div
      data-testid="recommendation-meta-chips"
      className={`inline-flex flex-wrap items-center gap-1.5 ${className ?? ''}`}
    >
      {chips.map((c, i) => (
        <span key={c.key} className="inline-flex items-center gap-1.5">
          <span
            className="inline-flex items-center whitespace-nowrap rounded-full font-medium tabular-nums"
            style={chipStyle}
            data-testid={`rmc-${c.key}`}
          >
            {c.text}
          </span>
          {i < chips.length - 1 && (
            <span
              aria-hidden
              className="inline-block h-1 w-1 rounded-full"
              style={{ background: 'var(--hairline-strong, var(--hairline))' }}
            />
          )}
        </span>
      ))}
      {stale && (
        <>
          {chips.length > 0 && (
            <span
              aria-hidden
              className="inline-block h-1 w-1 rounded-full"
              style={{ background: 'var(--hairline-strong, var(--hairline))' }}
            />
          )}
          <span
            data-testid="rmc-stale"
            className="inline-flex items-center whitespace-nowrap rounded-full font-semibold uppercase tracking-wide"
            style={staleStyle}
          >
            Stale
          </span>
        </>
      )}
    </div>
  );
}
