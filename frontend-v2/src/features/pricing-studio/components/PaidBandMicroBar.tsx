// Pricing Studio v3 / Phase 2 — Paid-band micro-bar.
//
// Tight inline strip rendered inside each CustomerFanout row. Shows
// the BFF-computed paid-band (p10 / p50 / p90) and an optional
// "proposed" marker (triangle) — used to visually communicate where
// the candidate price sits relative to this customer's historic
// transaction prices.
//
// ~120px wide, ~22px tall — designed to fit one table cell. Uses
// pure SVG so the row never reflows when the band data arrives.
//
// Tone reuses the same rose-deep / amber / warm-gray palette as the
// rest of Phase 2; NO blue/purple.

import { parseDecimal } from '../lib/decimal';
import type { PaidBand } from '@/types/studio';
import { DataMissingBadge } from '@/components/DataMissingBadge';

interface Props {
  band: PaidBand | null;
  /** Optional proposed price (Decimal-as-string or number) for the marker. */
  proposed?: string | number | null;
  className?: string;
}

const W = 120;
const H = 22;
const PAD_X = 6;

export function PaidBandMicroBar({ band, proposed, className }: Props) {
  if (!band) {
    return (
      <span className={`ws-fan-band ws-fan-band-missing ${className ?? ''}`}>
        <DataMissingBadge reason="no band" tooltip="No paid history for this customer on this SKU." />
      </span>
    );
  }

  const p10 = parseDecimal(band.p10);
  const p50 = parseDecimal(band.p50);
  const p90 = parseDecimal(band.p90);
  const prop = parseDecimal(proposed ?? null);

  // All three percentiles need to be finite — if one is NaN the band
  // is unrenderable; show the same missing pill.
  if (!Number.isFinite(p10) || !Number.isFinite(p50) || !Number.isFinite(p90)) {
    return (
      <span className={`ws-fan-band ws-fan-band-missing ${className ?? ''}`}>
        <DataMissingBadge reason="band na" tooltip="Paid band is missing or unparseable." />
      </span>
    );
  }

  // Min/max axis range: include the proposed marker if present so it
  // doesn't fall off the strip. Pad 4% so edge markers don't kiss
  // the strip borders.
  const lo0 = Math.min(p10, p90, Number.isFinite(prop) ? prop : p10);
  const hi0 = Math.max(p10, p90, Number.isFinite(prop) ? prop : p90);
  const span = Math.max(hi0 - lo0, 0.0001);
  const pad = span * 0.06;
  const lo = lo0 - pad;
  const hi = hi0 + pad;

  const toX = (v: number) => PAD_X + ((v - lo) / (hi - lo)) * (W - 2 * PAD_X);

  return (
    <span
      className={`ws-fan-band ${className ?? ''}`}
      data-testid="paid-band-micro-bar"
      aria-label={`Paid band: p10 ${band.p10}, p50 ${band.p50}, p90 ${band.p90}`}
    >
      <svg width={W} height={H} role="img">
        {/* Background track */}
        <line
          x1={PAD_X}
          x2={W - PAD_X}
          y1={H / 2}
          y2={H / 2}
          strokeWidth={4}
          strokeLinecap="round"
          stroke="var(--surface-sunken)"
        />
        {/* p10..p90 shaded band */}
        <line
          x1={toX(p10)}
          x2={toX(p90)}
          y1={H / 2}
          y2={H / 2}
          strokeWidth={4}
          strokeLinecap="round"
          stroke="var(--rose-tint)"
        />
        {/* p50 mid marker */}
        <circle cx={toX(p50)} cy={H / 2} r={3} fill="var(--rose)" stroke="white" strokeWidth={1.5} />
        {/* Proposed marker — triangle, only when proposed is finite */}
        {Number.isFinite(prop) && (
          <polygon
            data-testid="paid-band-proposed"
            points={`${toX(prop) - 4},${H / 2 - 7} ${toX(prop) + 4},${H / 2 - 7} ${toX(prop)},${H / 2 - 1}`}
            fill="var(--rose-deep)"
          />
        )}
      </svg>
    </span>
  );
}
