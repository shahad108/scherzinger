// Pricing Studio v3 / Phase 1 — Win-probability curve.
//
// 20-point P(win | price) line + optional CI ribbon. The recommended price
// is plotted as a highlight dot so Frank can see "if I take this price, my
// win probability is X". Confidence ribbon is suppressed when the backend
// sends `lower_ci == upper_ci == win_prob` (flat fallback model).

import { useMemo } from 'react';
import {
  Area,
  ComposedChart,
  Line,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
  CartesianGrid,
  ReferenceDot,
} from 'recharts';
import type { WinProbCurveBlock, WorkbenchBlockMeta } from '@/types/studio';
import { DataMissingBadge } from '@/components/DataMissingBadge';
import { LineageButton } from '@/components/LineageButton';
import { parseDecimal } from '../lib/decimal';
import { fmt } from '@/lib/format';

interface Props {
  curve?: WinProbCurveBlock | null;
  recommendedPrice?: string | number | null;
  /** Deal count for the cluster — drives the low-data lock when < 12. */
  nDeals?: number | null;
  /** Block status from `meta.blocks.win_prob_curve`. Non-`live` → lock. */
  blockStatus?: WorkbenchBlockMeta | null;
  className?: string;
}

const MIN_DEALS_FOR_LIVE = 12;

interface CurveRow {
  price: number;
  winProb: number;
  lower?: number;
  upper?: number;
  /** Recharts band datum: [lower, upper] for the Area `dataKey="band"`. */
  band?: [number, number];
}

export function WinProbCurve({
  curve,
  recommendedPrice,
  nDeals,
  blockStatus,
  className,
}: Props) {
  const { rows, hasCi, recPoint } = useMemo(() => {
    if (!curve || curve.points.length === 0) {
      return { rows: [] as CurveRow[], hasCi: false, recPoint: null as CurveRow | null };
    }
    let anyCi = false;
    const rs: CurveRow[] = curve.points.map((p) => {
      const price = parseDecimal(p.price);
      const winProb = parseDecimal(p.win_prob);
      const lower = p.lower_ci !== undefined ? parseDecimal(p.lower_ci) : undefined;
      const upper = p.upper_ci !== undefined ? parseDecimal(p.upper_ci) : undefined;
      // CI ribbon only when bounds differ from the point (rules out the
      // flat fallback where lower==upper==win_prob).
      if (
        lower !== undefined &&
        upper !== undefined &&
        Number.isFinite(lower) &&
        Number.isFinite(upper) &&
        (Math.abs(upper - winProb) > 1e-6 || Math.abs(lower - winProb) > 1e-6)
      ) {
        anyCi = true;
      }
      return {
        price,
        winProb,
        lower,
        upper,
        band:
          lower !== undefined && upper !== undefined && Number.isFinite(lower) && Number.isFinite(upper)
            ? [lower, upper]
            : undefined,
      };
    });

    let rec: CurveRow | null = null;
    const recPriceNum = parseDecimal(recommendedPrice ?? null);
    if (Number.isFinite(recPriceNum)) {
      // Snap to nearest sampled point.
      const sorted = [...rs].sort(
        (a, b) => Math.abs(a.price - recPriceNum) - Math.abs(b.price - recPriceNum),
      );
      rec = sorted[0] ?? null;
    }
    return { rows: rs, hasCi: anyCi, recPoint: rec };
  }, [curve, recommendedPrice]);

  // Phase D4 — locked overlay when sample is too small OR the BFF flags the
  // block as non-live (empty / degraded / locked). The chart still renders
  // beneath the overlay (faded) so Frank can see the shape that would be
  // there once enough deals close.
  const effectiveNDeals = typeof nDeals === 'number' ? nDeals : curve?.n_deals ?? 0;
  const statusKind = blockStatus?.status ?? 'live';
  const isLocked = statusKind !== 'live' || effectiveNDeals < MIN_DEALS_FOR_LIVE;

  // Phase D4 — keep only first / last / recommended-price x-ticks. Recharts
  // calls `tickFormatter` per tick; returning the empty string suppresses the
  // label while keeping the tick mark itself (which we hide via stroke).
  const tickPrices = useMemo(() => {
    if (rows.length === 0) return new Set<number>();
    const first = rows[0].price;
    const last = rows[rows.length - 1].price;
    const keep = new Set<number>([first, last]);
    if (recPoint) keep.add(recPoint.price);
    return keep;
  }, [rows, recPoint]);

  if (!curve || rows.length === 0) {
    return (
      <div
        className={`rounded-[var(--r-md)] border border-[var(--hairline)] bg-white p-3 ${className ?? ''}`}
      >
        <div className="mb-2 flex items-center justify-between">
          <h5 className="font-display text-[11px] font-bold uppercase tracking-[0.06em] text-[var(--muted)]">
            Win probability vs price
          </h5>
        </div>
        <div className="grid h-[160px] place-items-center">
          <DataMissingBadge
            reason="No win-prob model"
            tooltip="Logistic fit needs at least one won and one lost deal in the window."
          />
        </div>
      </div>
    );
  }

  return (
    <div
      className={`rounded-[var(--r-md)] border border-[var(--hairline)] bg-white p-3 ${className ?? ''}`}
      data-testid="win-prob-curve"
    >
      <div className="mb-2 flex items-center justify-between gap-2">
        <div className="flex items-baseline gap-2">
          <h5 className="font-display text-[11px] font-bold uppercase tracking-[0.06em] text-[var(--muted)]">
            Win probability vs price
          </h5>
          <span className="text-[11px] text-[var(--muted)]">
            n={curve.n_deals}
            {curve.confidence_band && ` · CI: ${curve.confidence_band}`}
          </span>
        </div>
        <LineageButton
          lineageRef={curve.lineage_ref ?? null}
          label="lineage"
          subjectTitle="Win-probability curve"
        />
      </div>
      <div className="relative h-[160px]">
        <div
          aria-hidden={isLocked ? 'true' : undefined}
          style={{ opacity: isLocked ? 0.35 : 1, height: '100%' }}
        >
          <ResponsiveContainer width="100%" height="100%">
            <ComposedChart data={rows} margin={{ top: 6, right: 12, left: 0, bottom: 0 }}>
              <CartesianGrid stroke="var(--hairline)" vertical={false} />
              <XAxis
                dataKey="price"
                type="number"
                domain={['dataMin', 'dataMax']}
                stroke="var(--muted)"
                tick={{ fontSize: 10 }}
                tickFormatter={(v: number) => (tickPrices.has(v) ? fmt.eur(v) : '')}
              />
              <YAxis
                dataKey="winProb"
                domain={[0, 1]}
                stroke="var(--muted)"
                tick={{ fontSize: 10 }}
                interval="preserveStartEnd"
                tickCount={3}
                tickFormatter={(v: number) => `${Math.round(v * 100)}%`}
              />
              <Tooltip
                cursor={{ stroke: 'var(--rose-soft)', strokeDasharray: '3 3' }}
                // Recharts 3.x typed the formatter against the union ValueType.
                // Coerce at the boundary so we keep the strong types inside
                // our callback without disabling tsc on the whole file.
                formatter={((value: unknown, key: unknown) => {
                  const num = typeof value === 'number' ? value : Number(value);
                  if (key === 'winProb' && Number.isFinite(num)) {
                    return [`${(num * 100).toFixed(1)}%`, 'P(win)'];
                  }
                  if (key === 'band') return [null, null];
                  return [String(value ?? ''), String(key ?? '')];
                }) as never}
                labelFormatter={(label) => fmt.eurPrecise(label as number)}
              />
              {hasCi && (
                <Area
                  type="monotone"
                  dataKey="band"
                  stroke="none"
                  fill="var(--rose-tint)"
                  fillOpacity={0.18}
                  isAnimationActive={false}
                />
              )}
              <Line
                type="monotone"
                dataKey="winProb"
                stroke="var(--rose-deep)"
                strokeWidth={1.75}
                dot={false}
                isAnimationActive={false}
              />
              {recPoint && (
                <ReferenceDot
                  x={recPoint.price}
                  y={recPoint.winProb}
                  r={5}
                  fill="var(--rose-deep)"
                  stroke="white"
                  strokeWidth={2}
                />
              )}
            </ComposedChart>
          </ResponsiveContainer>
        </div>
        {isLocked && (
          <div
            data-testid="win-prob-curve-locked"
            className="absolute inset-0 grid place-items-center rounded-[var(--r-md)]"
            style={{
              background:
                'color-mix(in oklab, var(--surface) 72%, transparent)',
              border: '1px dashed var(--hairline)',
            }}
          >
            <div
              className="rounded-full bg-white/90 px-3 py-1.5 text-center text-[11px] font-semibold text-[var(--ink-2)] shadow-sm"
              style={{ border: '1px solid var(--hairline)' }}
            >
              Locked — needs ≥12 quote outcomes for this cluster
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
