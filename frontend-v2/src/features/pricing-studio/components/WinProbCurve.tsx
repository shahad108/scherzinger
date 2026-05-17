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
import type { WinProbCurveBlock } from '@/types/studio';
import { DataMissingBadge } from '@/components/DataMissingBadge';
import { LineageButton } from '@/components/LineageButton';
import { parseDecimal } from '../lib/decimal';
import { fmt } from '@/lib/format';

interface Props {
  curve?: WinProbCurveBlock | null;
  recommendedPrice?: string | number | null;
  className?: string;
}

interface CurveRow {
  price: number;
  winProb: number;
  lower?: number;
  upper?: number;
  /** Recharts band datum: [lower, upper] for the Area `dataKey="band"`. */
  band?: [number, number];
}

export function WinProbCurve({ curve, recommendedPrice, className }: Props) {
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
      <div className="h-[160px]">
        <ResponsiveContainer width="100%" height="100%">
          <ComposedChart data={rows} margin={{ top: 6, right: 12, left: 0, bottom: 0 }}>
            <CartesianGrid stroke="var(--hairline)" vertical={false} />
            <XAxis
              dataKey="price"
              type="number"
              domain={['dataMin', 'dataMax']}
              stroke="var(--muted)"
              tick={{ fontSize: 10 }}
              tickFormatter={(v: number) => fmt.eur(v)}
            />
            <YAxis
              dataKey="winProb"
              domain={[0, 1]}
              stroke="var(--muted)"
              tick={{ fontSize: 10 }}
              tickFormatter={(v: number) => `${Math.round(v * 100)}%`}
            />
            <Tooltip
              cursor={{ stroke: 'var(--rose-soft)', strokeDasharray: '3 3' }}
              formatter={(value: number, key: string) => {
                if (key === 'winProb') return [`${(value * 100).toFixed(1)}%`, 'P(win)'];
                if (key === 'band') return [null, null];
                return [value, key];
              }}
              labelFormatter={(label) => fmt.eurPrecise(label as number)}
            />
            {hasCi && (
              <Area
                type="monotone"
                dataKey="band"
                stroke="none"
                fill="var(--rose-tint)"
                fillOpacity={0.7}
                isAnimationActive={false}
              />
            )}
            <Line
              type="monotone"
              dataKey="winProb"
              stroke="var(--rose-deep)"
              strokeWidth={2}
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
                isFront
              />
            )}
          </ComposedChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
