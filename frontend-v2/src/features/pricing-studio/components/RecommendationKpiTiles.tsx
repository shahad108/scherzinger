// Pricing Studio v3 / Phase 1 — KPI tiles row.
//
// Six tiles, each reading one BFF field and rendering one value. NO client
// thresholds and no client math beyond a single Δ between current and
// recommended (which the design calls out explicitly). When a source field
// is absent, the tile shows <DataMissingBadge> in place of the value but
// keeps its slot so the grid doesn't reshuffle.

import type {
  RecommendationBlock,
  WinProbCurveBlock,
  ConfidenceLevel,
  LineageRefBlock,
} from '@/types/studio';
import { DataMissingBadge } from '@/components/DataMissingBadge';
import { useLineageDrawer } from '@/features/pricing-studio/lineage/LineageDrawerContext';
import { fmt } from '@/lib/format';
import { parseDecimal, pctFromFraction, signedPctDelta } from '../lib/decimal';

interface Props {
  aid: string;
  recommendation?: RecommendationBlock;
  winProbCurve?: WinProbCurveBlock;
  /** Pre-formatted current price string. */
  currentPriceLabel: string;
  /** Numeric current price for Δ math. */
  currentPriceValue?: number;
  /** Pre-formatted current margin string (e.g. "28.4%"). */
  currentMarginLabel?: string;
  /** Optional projected DB2 at recommended — once Phase 3 ships option_margin
   *  this will be wired; for now we display the missing badge. */
  projectedDb2Label?: string;
  projectedDb2Lineage?: LineageRefBlock | null;
}

const CONF_LABEL: Record<ConfidenceLevel, string> = {
  low: 'Low',
  med: 'Medium',
  high: 'High',
};

export function RecommendationKpiTiles({
  recommendation,
  winProbCurve,
  currentPriceLabel,
  currentPriceValue,
  projectedDb2Label,
  projectedDb2Lineage,
}: Props) {
  const { openLineage } = useLineageDrawer();

  const recPriceNum = recommendation ? parseDecimal(recommendation.recommended_price) : Number.NaN;
  const recPriceLabel = Number.isFinite(recPriceNum) ? fmt.eurPrecise(recPriceNum) : null;
  const deltaLabel =
    Number.isFinite(currentPriceValue) && Number.isFinite(recPriceNum)
      ? signedPctDelta(currentPriceValue!, recPriceNum)
      : null;
  const deltaPositive = deltaLabel !== null && !deltaLabel.startsWith('−');

  // Win prob at recommended price — snap to nearest curve point.
  const winProbAtRec = (() => {
    if (!recommendation || !winProbCurve?.points?.length) return null;
    if (!Number.isFinite(recPriceNum)) return null;
    let best = winProbCurve.points[0];
    let bestDist = Math.abs(parseDecimal(best.price) - recPriceNum);
    for (const p of winProbCurve.points) {
      const d = Math.abs(parseDecimal(p.price) - recPriceNum);
      if (d < bestDist) {
        best = p;
        bestDist = d;
      }
    }
    return parseDecimal(best.win_prob);
  })();

  return (
    <div
      className="mb-3 grid gap-2 sm:grid-cols-2 md:grid-cols-3 xl:grid-cols-6"
      data-testid="rec-kpi-tiles"
    >
      <Tile
        label="Current price"
        value={currentPriceLabel}
        sub="today on file"
        onClick={recommendation?.lineage_ref ? undefined : undefined /* no lineage — just informational */}
      />
      <Tile
        label="Recommended"
        value={recPriceLabel}
        sub={recommendation ? `confidence: ${CONF_LABEL[recommendation.confidence_level]}` : undefined}
        tone={recommendation ? 'rose' : 'neutral'}
        onClick={
          recommendation?.lineage_ref
            ? () =>
                openLineage(recommendation.lineage_ref!, {
                  subjectTitle: 'Recommended price',
                })
            : undefined
        }
      />
      <Tile
        label="Δ to current"
        value={deltaLabel}
        sub={
          deltaLabel === null
            ? undefined
            : deltaPositive
              ? 'margin upside'
              : 'margin sacrifice'
        }
        tone={deltaLabel === null ? 'neutral' : deltaPositive ? 'good' : 'bad'}
      />
      <Tile
        label="Projected DB2"
        value={projectedDb2Label}
        sub="at recommended"
        onClick={
          projectedDb2Lineage
            ? () =>
                openLineage(projectedDb2Lineage, {
                  subjectTitle: 'Projected DB2 at recommended',
                })
            : undefined
        }
      />
      <Tile
        label="Win prob"
        value={winProbAtRec === null || !Number.isFinite(winProbAtRec) ? null : pctFromFraction(winProbAtRec, 0)}
        sub="at recommended"
        onClick={
          winProbCurve?.lineage_ref
            ? () =>
                openLineage(winProbCurve.lineage_ref!, {
                  subjectTitle: 'Win-probability curve',
                })
            : undefined
        }
      />
      <Tile
        label="Confidence"
        value={recommendation ? CONF_LABEL[recommendation.confidence_level] : null}
        sub={
          recommendation
            ? `${(parseDecimal(recommendation.confidence) * 100).toFixed(0)}% model conf.`
            : undefined
        }
        tone={
          !recommendation
            ? 'neutral'
            : recommendation.confidence_level === 'high'
              ? 'good'
              : recommendation.confidence_level === 'low'
                ? 'bad'
                : 'neutral'
        }
        onClick={
          recommendation?.lineage_ref
            ? () =>
                openLineage(recommendation.lineage_ref!, {
                  subjectTitle: 'Confidence',
                })
            : undefined
        }
      />
    </div>
  );
}

type TileTone = 'neutral' | 'rose' | 'good' | 'bad';

interface TileProps {
  label: string;
  value: string | null | undefined;
  sub?: string;
  tone?: TileTone;
  onClick?: () => void;
}

function Tile({ label, value, sub, tone = 'neutral', onClick }: TileProps) {
  const valueColor =
    tone === 'rose'
      ? 'text-[var(--rose-deep)]'
      : tone === 'good'
        ? 'text-[var(--green)]'
        : tone === 'bad'
          ? 'text-[var(--red)]'
          : 'text-[var(--ink)]';
  const inner = (
    <>
      <div className="text-[10.5px] font-bold uppercase tracking-[0.08em] text-[var(--muted)]">{label}</div>
      <div className={`mt-1 font-display text-[22px] font-bold leading-tight tabular-nums tracking-[-0.02em] ${valueColor}`}>
        {value !== null && value !== undefined ? value : <DataMissingBadge reason="No data" />}
      </div>
      {sub && <div className="mt-0.5 text-[10.5px] text-[var(--muted)]">{sub}</div>}
    </>
  );
  const sharedClasses =
    'flex h-full min-h-[88px] flex-col justify-between rounded-[var(--r-md)] border border-[var(--hairline)] bg-white p-3 text-left shadow-[var(--shadow-card)] transition-colors';
  if (onClick) {
    return (
      <button
        type="button"
        onClick={onClick}
        className={`${sharedClasses} hover:border-[var(--rose-border)] hover:bg-[var(--rose-bg)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--rose)] focus-visible:ring-offset-1`}
      >
        {inner}
      </button>
    );
  }
  return <div className={sharedClasses}>{inner}</div>;
}
