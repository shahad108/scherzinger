// Pricing Studio v3 / Phase 1 — Willingness-to-pay strip.
//
// Horizontal band with p10 / p50 / p90 markers and (optionally) a
// recommended-price dot. The strip is a fixed-height (80px) Recharts wrapper
// using ReferenceDot on a 0-1 ScatterChart-like axis — but to keep the
// component dependency surface small we render an SVG by hand. Recharts
// for the curve below; SVG for this strip. Aligned with the design
// language: rose-deep for the recommended dot, muted neutrals for p10/p50/p90.

import { useMemo } from 'react';
import type { WtpBlock } from '@/types/studio';
import { DataMissingBadge } from '@/components/DataMissingBadge';
import { LineageButton } from '@/components/LineageButton';
import { parseDecimal } from '../lib/decimal';
import { fmt } from '@/lib/format';

interface Props {
  wtp?: WtpBlock | null;
  /** Recommended price plotted as a highlight dot. */
  recommendedPrice?: string | number | null;
  /** Optional explicit floor — keeps spacing consistent when present. */
  floor?: string | number | null;
  /** Optional CTA-row override (defaults to a LineageButton). */
  rightSlot?: React.ReactNode;
  className?: string;
}

interface Marker {
  key: 'floor' | 'p10' | 'p50' | 'p90' | 'rec';
  label: string;
  /** Raw price. */
  value: number;
  /** Position 0..1 along the strip. */
  pos: number;
  variant: 'rec' | 'edge' | 'mid';
}

const STRIP_HEIGHT = 80;

export function WtpBandStrip({
  wtp,
  recommendedPrice,
  floor,
  rightSlot,
  className,
}: Props) {
  const { markers, range, degenerate } = useMemo(() => {
    if (!wtp) return { markers: [] as Marker[], range: { lo: 0, hi: 1 }, degenerate: true };
    const p10 = parseDecimal(wtp.p10);
    const p50 = parseDecimal(wtp.p50);
    const p90 = parseDecimal(wtp.p90);
    const rec = parseDecimal(recommendedPrice ?? null);
    const fl = parseDecimal(floor ?? null);

    const points: Marker[] = [];
    if (Number.isFinite(fl)) {
      points.push({ key: 'floor', label: 'floor', value: fl, pos: 0, variant: 'edge' });
    }
    if (Number.isFinite(p10)) {
      points.push({ key: 'p10', label: 'p10', value: p10, pos: 0, variant: 'mid' });
    }
    if (Number.isFinite(p50)) {
      points.push({ key: 'p50', label: 'p50', value: p50, pos: 0, variant: 'mid' });
    }
    if (Number.isFinite(rec)) {
      points.push({ key: 'rec', label: 'rec', value: rec, pos: 0, variant: 'rec' });
    }
    if (Number.isFinite(p90)) {
      points.push({ key: 'p90', label: 'p90', value: p90, pos: 0, variant: 'mid' });
    }

    if (points.length === 0) {
      return { markers: [], range: { lo: 0, hi: 1 }, degenerate: true };
    }
    const lo = Math.min(...points.map((p) => p.value));
    const hi = Math.max(...points.map((p) => p.value));
    const span = hi - lo;

    // Degenerate: every marker is on top of the others → still render, but
    // with a small synthetic spread so labels don't overlap.
    if (span < 0.0001) {
      points.forEach((p, i) => {
        p.pos = points.length === 1 ? 0.5 : i / (points.length - 1);
      });
      return { markers: points, range: { lo, hi }, degenerate: true };
    }
    // Pad the range 6% so the edges don't touch the strip border.
    const pad = span * 0.06;
    const r = { lo: lo - pad, hi: hi + pad };
    const rspan = r.hi - r.lo;
    points.forEach((p) => {
      p.pos = (p.value - r.lo) / rspan;
    });
    return { markers: points, range: r, degenerate: false };
  }, [wtp, recommendedPrice, floor]);

  if (!wtp) {
    return (
      <div
        className={`flex items-center gap-2 rounded-[var(--r)] border border-[var(--hairline)] bg-[var(--surface-soft)] px-3 py-2 ${className ?? ''}`}
        style={{ minHeight: STRIP_HEIGHT }}
      >
        <DataMissingBadge reason="No WTP sample" tooltip="Insufficient won-deal sample to build a willingness-to-pay band." />
      </div>
    );
  }

  return (
    <div
      className={`rounded-[var(--r-md)] border border-[var(--hairline)] bg-white p-3 ${className ?? ''}`}
      data-testid="wtp-band-strip"
    >
      <div className="mb-1.5 flex items-baseline justify-between gap-2">
        <div className="flex items-baseline gap-2">
          <h5 className="font-display text-[11px] font-bold uppercase tracking-[0.06em] text-[var(--muted)]">
            Willingness-to-pay band
          </h5>
          <span className="text-[11px] text-[var(--muted)]">
            n={wtp.n_deals} won deals · {wtp.window_days}d window
          </span>
          {wtp.anchored_from_cluster && (
            <span
              title="Anchored from cluster comparables (sample below n=5 floor)"
              className="rounded-full bg-[var(--amber-bg)] px-1.5 py-[1px] text-[10px] font-semibold uppercase tracking-wide text-[var(--amber)]"
            >
              cluster anchor
            </span>
          )}
        </div>
        {rightSlot ?? (
          <LineageButton
            lineageRef={wtp.lineage_ref ?? null}
            label="lineage"
            subjectTitle="Willingness-to-pay band"
          />
        )}
      </div>

      {degenerate ? (
        <div className="grid place-items-center" style={{ height: STRIP_HEIGHT - 24 }}>
          <DataMissingBadge reason="Single point" tooltip="WTP p10 / p50 / p90 collapsed to a single value — too few samples to spread." />
        </div>
      ) : (
        <div className="relative" style={{ height: STRIP_HEIGHT - 24 }}>
          {/* Track */}
          <div className="absolute left-2 right-2 top-1/2 h-1.5 -translate-y-1/2 rounded-full bg-[var(--surface-sunken)]" />
          {/* Inter-percentile shaded zone (p10..p90) — soft rose to evoke "deal zone" */}
          {markers.find((m) => m.key === 'p10') && markers.find((m) => m.key === 'p90') && (
            <div
              className="absolute top-1/2 h-1.5 -translate-y-1/2 rounded-full"
              style={{
                left: `calc(0.5rem + (100% - 1rem) * ${markers.find((m) => m.key === 'p10')!.pos})`,
                width: `calc((100% - 1rem) * ${
                  markers.find((m) => m.key === 'p90')!.pos -
                  markers.find((m) => m.key === 'p10')!.pos
                })`,
                background: 'var(--rose-tint)',
              }}
            />
          )}
          {/* Markers */}
          {markers.map((m) => (
            <Dot key={m.key} marker={m} />
          ))}
        </div>
      )}

      <div className="mt-1 flex justify-between text-[10.5px] tabular-nums text-[var(--muted)]">
        <span>{fmt.eurPrecise(range.lo)}</span>
        <span>{fmt.eurPrecise(range.hi)}</span>
      </div>
    </div>
  );
}

function Dot({ marker }: { marker: Marker }) {
  const isRec = marker.variant === 'rec';
  const isEdge = marker.variant === 'edge';
  return (
    <div
      className="absolute top-1/2 -translate-x-1/2 -translate-y-1/2"
      style={{ left: `calc(0.5rem + (100% - 1rem) * ${marker.pos})` }}
    >
      <div
        className={
          isRec
            ? 'h-3.5 w-3.5 rounded-full border-2 border-white bg-[var(--rose-deep)] shadow-[0_0_0_2px_var(--rose-deep)]'
            : isEdge
              ? 'h-2.5 w-2.5 rounded-full border-2 border-white bg-[var(--ink-3)]'
              : 'h-2.5 w-2.5 rounded-full border-2 border-white bg-[var(--rose)]'
        }
        aria-hidden="true"
      />
      <div
        className={`mt-1 -translate-x-1/2 text-center text-[10.5px] font-semibold tracking-wide ${
          isRec ? 'text-[var(--rose-deep)]' : 'text-[var(--muted)]'
        }`}
        style={{ position: 'absolute', left: '50%', whiteSpace: 'nowrap' }}
      >
        {marker.label}
      </div>
    </div>
  );
}
