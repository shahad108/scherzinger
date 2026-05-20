// Pricing Studio v3 / Phase 1 — Willingness-to-pay strip.
//
// Horizontal band with p10 / p50 / p90 markers and (optionally) a
// recommended-price dot. The strip is a fixed-height (80px) Recharts wrapper
// using ReferenceDot on a 0-1 ScatterChart-like axis — but to keep the
// component dependency surface small we render an SVG by hand. Recharts
// for the curve below; SVG for this strip. Aligned with the design
// language: rose-deep for the recommended dot, muted neutrals for p10/p50/p90.

import { useMemo } from 'react';
import type { WtpBlock, WorkbenchBlockMeta } from '@/types/studio';
import { DataMissingBadge } from '@/components/DataMissingBadge';
import { LineageButton } from '@/components/LineageButton';
import { PilotBadge, PILOT_TOOLTIPS } from '@/components/shared/PilotBadge';
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
  /** Block status from `meta.blocks.wtp`. `empty` → flat placeholder strip. */
  blockStatus?: WorkbenchBlockMeta | null;
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
  blockStatus,
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

  // Phase D5 — when the BFF marks the wtp block as empty, render a flat
  // placeholder strip ("not yet computed for this SKU") in place of a real
  // band. This keeps vertical rhythm consistent with the rest of the page
  // and avoids ambiguity between "no data" and "no signal yet".
  if (blockStatus?.status === 'empty') {
    return (
      <div
        className={`rounded-[var(--r-md)] border border-dashed border-[var(--hairline)] bg-[var(--surface-soft)] px-3 py-3 text-[12px] text-[var(--muted)] ${className ?? ''}`}
        data-testid="wtp-band-strip-empty"
        style={{ minHeight: STRIP_HEIGHT - 16 }}
      >
        <h5 className="font-display text-[11px] font-bold uppercase tracking-[0.06em] text-[var(--muted)]">
          Willingness-to-pay band
        </h5>
        <div className="mt-1.5">WTP band — not yet computed for this SKU</div>
      </div>
    );
  }

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

  // Phase D5 — tooltip text on band hover summarises the three percentiles.
  // `<title>` is the only zero-JS tooltip mechanism the rest of this file
  // already relies on (see Dot below), so we reuse the same pattern.
  const p10Marker = markers.find((m) => m.key === 'p10');
  const p50Marker = markers.find((m) => m.key === 'p50');
  const p90Marker = markers.find((m) => m.key === 'p90');
  const recMarker = markers.find((m) => m.key === 'rec');
  const bandTooltip = [
    p10Marker ? `P10: ${fmt.eurPrecise(p10Marker.value)}` : null,
    p50Marker ? `P50: ${fmt.eurPrecise(p50Marker.value)}` : null,
    p90Marker ? `P90: ${fmt.eurPrecise(p90Marker.value)}` : null,
  ]
    .filter(Boolean)
    .join(' · ');

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
          {/* Phase I2 — Pilot heuristic badge. The BFF does not yet emit
              an explicit `wtp.source` flag, so we infer cluster-fallback
              from the existing `anchored_from_cluster` boolean OR a
              sample-size <30 (per roadmap §8.3 unlock requirement). When
              the backend lands an explicit source flag, swap this check. */}
          {(wtp.anchored_from_cluster || wtp.n_deals < 30) && (
            <PilotBadge
              tooltip={PILOT_TOOLTIPS.wtpClusterFallback}
              testId="wtp-pilot-badge"
            />
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
        <div
          className="relative"
          style={{ height: STRIP_HEIGHT - 24 }}
          title={bandTooltip || undefined}
          data-testid="wtp-band-strip-track"
        >
          {/* Track */}
          <div className="absolute left-2 right-2 top-1/2 h-1.5 -translate-y-1/2 rounded-full bg-[var(--surface-sunken)]" />
          {/* Inter-percentile shaded zone (p10..p90) — soft rose to evoke "deal zone" */}
          {p10Marker && p90Marker && (
            <div
              className="absolute top-1/2 h-1.5 -translate-y-1/2 rounded-full"
              style={{
                left: `calc(0.5rem + (100% - 1rem) * ${p10Marker.pos})`,
                width: `calc((100% - 1rem) * ${p90Marker.pos - p10Marker.pos})`,
                background: 'var(--rose-tint)',
              }}
            />
          )}
          {/* Phase D5 — explicit vertical pin marking the recommended price
              inside the P10–P90 band. The dot below stays for emphasis; the
              line makes the rec-price intersection unambiguous at small sizes. */}
          {recMarker && (
            <div
              data-testid="wtp-rec-pin"
              aria-hidden="true"
              className="absolute"
              style={{
                left: `calc(0.5rem + (100% - 1rem) * ${recMarker.pos})`,
                top: '10%',
                bottom: '10%',
                width: 0,
                borderLeft: '2px solid var(--rose-deep)',
                transform: 'translateX(-1px)',
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
