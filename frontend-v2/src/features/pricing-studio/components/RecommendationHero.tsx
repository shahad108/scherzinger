// Pricing Studio v3 / Phase 1 — Recommendation Hero card.
//
// Phase D1+D2 — chip strip now uses the shared RecommendationMetaChips so the
// hero matches Action Center decision cards 1:1. Phase D2 adds a "Why this
// price?" expander that toggles the BFF-provided rationale_md inline.
//
// Replaces PriceOptions as the top of the workbench column. Reads four
// typed BFF blocks (recommendation, wtp, win_prob_curve, competitor_ref);
// each may be undefined → render <DataMissingBadge>.
//
// Visual language: rose-deep ONLY on the recommended state (high-margin
// chip, recommended price, band-rec dot). Confidence chip uses warm
// neutral tones for low/med/high. Generous padding (p-6) and grid-aligned
// band labels so dots never collide with their captions.

import { useMemo, useState } from 'react';
import { ChevronDown } from 'lucide-react';
import { RecommendationMetaChips } from '@/components/shared/RecommendationMetaChips';
import { PilotBadge, PILOT_TOOLTIPS } from '@/components/shared/PilotBadge';
import type {
  RecommendationBlock,
  WtpBlock,
  WinProbCurveBlock,
  CompetitorRefBlock,
  ConfidenceLevel,
} from '@/types/studio';
import { DataMissingBadge } from '@/components/DataMissingBadge';
import { useLineageDrawer } from '@/features/pricing-studio/lineage/LineageDrawerContext';
import { fmt } from '@/lib/format';
import { parseDecimal, pctFromFraction, signedPctDelta } from '../lib/decimal';
import { Sparkles } from 'lucide-react';
import { AlertButton } from '@/components/AlertButton';

interface Props {
  aid: string;
  recommendation?: RecommendationBlock;
  wtp?: WtpBlock;
  winProbCurve?: WinProbCurveBlock;
  competitorRef?: CompetitorRefBlock | null;
  /** Pre-formatted current price string from the existing hero (e.g. "€118.00"). */
  currentPriceLabel: string;
  /** Numeric current price for delta math; if absent we skip the Δ tile. */
  currentPriceValue?: number;
  /** Last live-tick (epoch seconds) — surfaces an "Updated Ns ago" pill. */
  lastTickAt?: number | null;
  /** Source for visual emphasis (e.g. 'margin' rings floor_protection driver). */
  source?: string | null;
}

const CONFIDENCE_TONE: Record<ConfidenceLevel, { label: string; bg: string; fg: string; border: string }> = {
  low: {
    label: 'Low',
    bg: 'var(--amber-bg)',
    fg: 'var(--amber)',
    border: 'var(--amber-border)',
  },
  med: {
    label: 'Medium',
    bg: 'var(--rose-bg)',
    fg: 'var(--rose-deep)',
    border: 'var(--rose-border)',
  },
  high: {
    label: 'High',
    bg: 'var(--green-bg)',
    fg: 'var(--green)',
    border: 'var(--green-border)',
  },
};

export function RecommendationHero({
  aid,
  recommendation,
  wtp,
  winProbCurve,
  competitorRef,
  currentPriceLabel,
  currentPriceValue,
  lastTickAt,
  source,
}: Props) {
  const { openLineage } = useLineageDrawer();
  // Match a curve point to the recommended price so the "win prob at this
  // price" line stays in sync — falls back to nearest point.
  const winProbAtRec = useMemo(() => {
    if (!recommendation || !winProbCurve?.points?.length) return null;
    const recNum = parseDecimal(recommendation.recommended_price);
    if (!Number.isFinite(recNum)) return null;
    let best = winProbCurve.points[0];
    let bestDist = Math.abs(parseDecimal(best.price) - recNum);
    for (const p of winProbCurve.points) {
      const d = Math.abs(parseDecimal(p.price) - recNum);
      if (d < bestDist) {
        best = p;
        bestDist = d;
      }
    }
    return parseDecimal(best.win_prob);
  }, [recommendation, winProbCurve]);

  // Empty / no-recommendation state — render the shell + missing badges so
  // the page layout doesn't collapse.
  if (!recommendation) {
    return (
      <section
        aria-labelledby={`rec-hero-${aid}`}
        className="mb-3 rounded-[var(--r-xl)] border border-[var(--hairline)] bg-white p-6 shadow-[var(--shadow-card)]"
      >
        <div className="flex items-center gap-3">
          <h3 id={`rec-hero-${aid}`} className="font-display text-[14px] font-bold uppercase tracking-[0.06em] text-[var(--muted)]">
            Recommendation
          </h3>
          <DataMissingBadge reason="No recommendation" tooltip="Recommender did not return a recommendation for this SKU." />
        </div>
      </section>
    );
  }

  const conf = CONFIDENCE_TONE[recommendation.confidence_level];
  const recPriceNum = parseDecimal(recommendation.recommended_price);
  const recPrice = Number.isFinite(recPriceNum) ? fmt.eurPrecise(recPriceNum) : '—';
  const delta =
    Number.isFinite(currentPriceValue) && Number.isFinite(recPriceNum)
      ? signedPctDelta(currentPriceValue!, recPriceNum)
      : null;
  const deltaPositive =
    delta !== null &&
    delta !== '—' &&
    !delta.startsWith('−') &&
    Number.isFinite(currentPriceValue) &&
    Number.isFinite(recPriceNum) &&
    recPriceNum > currentPriceValue!;
  const highMargin =
    recommendation.confidence_level === 'high' &&
    deltaPositive;

  const isFreshKnown = typeof lastTickAt === 'number';
  const freshSec = isFreshKnown ? Math.max(0, Math.round(Date.now() / 1000 - lastTickAt!)) : null;

  // Phase I2 — "Pilot heuristic" flag for movable revenue. The
  // recommendation payload does not (yet) carry an explicit
  // `meta.movable_revenue_source` flag, so we infer the heuristic case
  // from the lineage ref: a trained model leaves a `model` name on the
  // lineage_ref; the cost-delta × historical-win-rate heuristic does
  // not. Once the backend lands an explicit source flag (roadmap §8.3),
  // swap this check for that flag.
  const movableRevenueIsHeuristic = !recommendation.lineage_ref?.model;

  // D2 — inline "Why this price?" expander state. Hidden when rationale_md is
  // empty so we never expose an empty disclosure.
  const [whyOpen, setWhyOpen] = useState(false);
  const rationaleParagraphs = useMemo(() => {
    const md = recommendation?.rationale_md ?? '';
    return md.split(/\n{2,}/).map((p) => p.trim()).filter(Boolean);
  }, [recommendation]);
  const hasRationale = rationaleParagraphs.length > 0;

  const onOpenRecLineage = () =>
    openLineage(recommendation.lineage_ref ?? null, {
      subjectTitle: `Why ${recPrice} for ${aid}?`,
      drivers: recommendation.drivers,
      wtp: wtp ?? null,
      recommendedPrice: recommendation.recommended_price,
      confidenceLevel: recommendation.confidence_level,
      nDeals: wtp?.n_deals ?? null,
    });

  return (
    <section
      aria-labelledby={`rec-hero-${aid}`}
      className={`mb-3 rounded-[var(--r-xl)] border bg-white p-6 shadow-[var(--shadow-card)] ${
        source === 'margin' ? 'border-[var(--rose-border)] ring-1 ring-[var(--rose-tint)]' : 'border-[var(--hairline)]'
      }`}
      data-testid="recommendation-hero"
    >
      <header className="mb-4 flex flex-wrap items-start justify-between gap-3">
        <div className="flex flex-wrap items-center gap-2">
          <h3
            id={`rec-hero-${aid}`}
            className="font-display text-[11.5px] font-bold uppercase tracking-[0.08em] text-[var(--muted)]"
          >
            Recommendation
          </h3>
          {highMargin && (
            <span
              className="inline-flex items-center gap-1 rounded-full bg-[var(--rose-bg)] px-2 py-[2px] text-[10.5px] font-bold uppercase tracking-[0.05em] text-[var(--rose-deep)] ring-1 ring-[var(--rose-border)]"
              aria-label="High margin opportunity"
            >
              <Sparkles size={10} aria-hidden="true" />
              High margin
            </span>
          )}
          {isFreshKnown && (
            <span
              className="rounded-full bg-[var(--surface-soft)] px-2 py-[1px] text-[10px] font-semibold uppercase tracking-wide text-[var(--muted)]"
              title="Time since last live update"
            >
              Updated {freshSec}s ago
            </span>
          )}
        </div>
        <button
          type="button"
          onClick={onOpenRecLineage}
          className="inline-flex items-center gap-1.5 rounded-full border border-[var(--rose-border)] bg-[var(--rose-bg)] px-3 py-1 text-[11.5px] font-semibold text-[var(--rose-deep)] transition-colors hover:bg-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--rose)] focus-visible:ring-offset-1"
          data-testid="why-this-price"
        >
          Why this price?
        </button>
      </header>

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1.05fr)_minmax(0,1fr)]">
        {/* Left: prices + Δ + confidence + win prob + competitor */}
        <div>
          <div className="flex items-baseline gap-3">
            <button
              type="button"
              onClick={onOpenRecLineage}
              className="text-left font-display text-[40px] font-bold leading-none tracking-[-0.03em] tabular-nums text-[var(--rose-deep)] hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--rose)] focus-visible:ring-offset-2"
              aria-label={`Recommended price ${recPrice} — open lineage`}
              data-testid="rec-price"
            >
              {recPrice}
            </button>
            {delta && (
              <span
                className={`tabular-nums text-[14px] font-semibold ${
                  deltaPositive ? 'text-[var(--green)]' : 'text-[var(--red)]'
                }`}
                data-testid="rec-delta"
              >
                Δ {delta}
              </span>
            )}
          </div>
          <div className="mt-1 text-[12px] text-[var(--muted)]">
            Today <span className="font-semibold text-[var(--ink-3)]">{currentPriceLabel}</span>
          </div>

          {hasRationale && (
            <div className="mt-3">
              <button
                type="button"
                onClick={() => setWhyOpen((v) => !v)}
                aria-expanded={whyOpen}
                aria-controls={`why-price-panel-${aid}`}
                data-testid="why-this-price-expander"
                className="inline-flex items-center gap-1 rounded-md text-[12px] font-semibold text-[var(--rose-deep)] transition-colors hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--rose)] focus-visible:ring-offset-1"
              >
                <span>Why this price?</span>
                <ChevronDown
                  size={12}
                  aria-hidden="true"
                  className={`transition-transform duration-150 ${whyOpen ? 'rotate-180' : 'rotate-0'}`}
                />
              </button>
              {whyOpen && (
                <div
                  id={`why-price-panel-${aid}`}
                  data-testid="why-this-price-panel"
                  className="mt-2 space-y-2 rounded-[var(--r-md)] border border-[var(--hairline)] bg-[var(--surface-soft)] px-3 py-2 text-[12.5px] leading-[1.55] text-[var(--ink-2)]"
                >
                  {rationaleParagraphs.map((p, i) => (
                    <p key={i} dangerouslySetInnerHTML={{ __html: renderInlineMd(p) }} />
                  ))}
                </div>
              )}
            </div>
          )}

          <div className="mt-4 flex flex-wrap items-center gap-2 text-[11.5px]">
            <span
              className="inline-flex items-center gap-1 rounded-full border px-2 py-[2px] text-[10.5px] font-bold uppercase tracking-[0.05em]"
              style={{ background: conf.bg, color: conf.fg, borderColor: conf.border }}
              data-testid="confidence-chip"
            >
              Confidence: {conf.label}
            </span>
            <RecommendationMetaChips
              clusterConfidence={
                Number.isFinite(parseDecimal(recommendation.confidence))
                  ? parseDecimal(recommendation.confidence) * 100
                  : undefined
              }
              sampleSize={wtp?.n_deals ?? null}
              modelVersion={recommendation.lineage_ref?.model ?? null}
              trainedAt={recommendation.lineage_ref?.computed_at ?? null}
            />
            {movableRevenueIsHeuristic && (
              <PilotBadge
                tooltip={PILOT_TOOLTIPS.movableRevenue}
                testId="movable-revenue-pilot-badge"
              />
            )}
            {!wtp && <DataMissingBadge reason="No WTP sample" icon={false} />}
          </div>

          {/* Band strip */}
          <div className="mt-5">
            <BandStrip
              band={recommendation.band}
              wtp={wtp}
              recommendedPrice={recommendation.recommended_price}
              onClick={onOpenRecLineage}
            />
          </div>

          {/* Win prob line */}
          <div className="mt-5">
            {winProbAtRec === null || !Number.isFinite(winProbAtRec) ? (
              <div className="flex items-center gap-2 text-[12px] text-[var(--muted)]">
                <span className="font-semibold text-[var(--ink-3)]">Win prob at this price:</span>
                <DataMissingBadge reason="No model" icon={false} />
              </div>
            ) : (
              <div>
                <div className="mb-1 flex items-baseline justify-between gap-2">
                  <span className="text-[12px] font-semibold text-[var(--ink-3)]">Win prob at this price</span>
                  <span className="tabular-nums text-[12.5px] font-bold text-[var(--ink)]">
                    {pctFromFraction(winProbAtRec, 0)}
                  </span>
                </div>
                <div className="h-2 overflow-hidden rounded-full bg-[var(--surface-sunken)]">
                  <div
                    className="h-full rounded-full bg-[var(--rose-deep)]"
                    style={{ width: `${Math.min(100, Math.max(0, winProbAtRec * 100))}%` }}
                    aria-hidden="true"
                  />
                </div>
              </div>
            )}
          </div>

          {/* Competitor */}
          <div className="mt-5 border-t border-dashed border-[var(--hairline)] pt-3 text-[11.5px]">
            <CompetitorLine
              competitor={competitorRef ?? undefined}
              recPriceNum={recPriceNum}
              aid={aid}
            />
          </div>
        </div>

        {/* Right: rationale memo (markdown -> simple paragraphs) */}
        <aside className="rounded-[var(--r-md)] border border-[var(--hairline)] bg-[var(--surface-soft)] p-4">
          <h4 className="mb-2 font-display text-[11px] font-bold uppercase tracking-[0.06em] text-[var(--muted)]">
            Rationale
          </h4>
          <RationaleSimple md={recommendation.rationale_md} />
        </aside>
      </div>
    </section>
  );
}

interface BandStripProps {
  band: RecommendationBlock['band'];
  wtp?: WtpBlock;
  recommendedPrice: string;
  onClick: () => void;
}

function BandStrip({ band, wtp, recommendedPrice, onClick }: BandStripProps) {
  const min = parseDecimal(band.min);
  const target = parseDecimal(band.target);
  const max = parseDecimal(band.max);
  const rec = parseDecimal(recommendedPrice);
  const p10 = wtp ? parseDecimal(wtp.p10) : Number.NaN;
  const p90 = wtp ? parseDecimal(wtp.p90) : Number.NaN;

  const all = [min, target, max, rec, p10, p90].filter((v) => Number.isFinite(v));
  if (all.length < 2) {
    return <DataMissingBadge reason="No band" icon={false} />;
  }
  const lo = Math.min(...all);
  const hi = Math.max(...all);
  const span = Math.max(0.0001, hi - lo);
  const pos = (v: number) => Math.max(0, Math.min(1, (v - lo) / span));

  const dots: Array<{ key: string; v: number; label: string; rec: boolean }> = [];
  if (Number.isFinite(min)) dots.push({ key: 'min', v: min, label: 'floor', rec: false });
  if (Number.isFinite(p10)) dots.push({ key: 'p10', v: p10, label: 'p10', rec: false });
  if (Number.isFinite(target)) dots.push({ key: 't', v: target, label: 'target', rec: false });
  if (Number.isFinite(rec)) dots.push({ key: 'rec', v: rec, label: 'rec', rec: true });
  if (Number.isFinite(p90)) dots.push({ key: 'p90', v: p90, label: 'p90', rec: false });
  if (Number.isFinite(max)) dots.push({ key: 'max', v: max, label: 'ceil', rec: false });

  return (
    <button
      type="button"
      onClick={onClick}
      className="block w-full rounded-md px-2 py-1 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--rose)]"
      aria-label="Open recommendation lineage"
    >
      <div className="grid grid-cols-[3rem_1fr_3rem] items-center gap-2">
        <span className="text-right tabular-nums text-[11px] text-[var(--muted)]">{fmt.eur(lo)}</span>
        <div className="relative h-7">
          <div className="absolute left-0 right-0 top-1/2 h-1.5 -translate-y-1/2 rounded-full bg-[var(--surface-sunken)]" />
          {Number.isFinite(min) && Number.isFinite(max) && (
            <div
              className="absolute top-1/2 h-1.5 -translate-y-1/2 rounded-full bg-[var(--rose-tint)]"
              style={{
                left: `${pos(min) * 100}%`,
                width: `${(pos(max) - pos(min)) * 100}%`,
              }}
              aria-hidden="true"
            />
          )}
          {dots.map((d) => (
            <div
              key={d.key}
              className="absolute top-1/2 -translate-x-1/2 -translate-y-1/2"
              style={{ left: `${pos(d.v) * 100}%` }}
            >
              <div
                className={
                  d.rec
                    ? 'h-3.5 w-3.5 rounded-full border-2 border-white bg-[var(--rose-deep)] shadow-[0_0_0_2px_var(--rose-deep)]'
                    : 'h-2.5 w-2.5 rounded-full border-2 border-white bg-[var(--rose)]'
                }
                aria-hidden="true"
              />
            </div>
          ))}
        </div>
        <span className="tabular-nums text-[11px] text-[var(--muted)]">{fmt.eur(hi)}</span>
      </div>
      <div className="mt-1 grid grid-cols-[3rem_1fr_3rem] gap-2">
        <span />
        <div className="relative h-3 text-[10px] tracking-wide text-[var(--muted)]">
          {dots.map((d) => (
            <span
              key={`${d.key}-label`}
              className={`absolute -translate-x-1/2 ${d.rec ? 'font-bold text-[var(--rose-deep)]' : ''}`}
              style={{ left: `${pos(d.v) * 100}%`, whiteSpace: 'nowrap' }}
            >
              {d.label}
            </span>
          ))}
        </div>
        <span />
      </div>
    </button>
  );
}

function CompetitorLine({
  competitor,
  recPriceNum,
  aid,
}: {
  competitor: CompetitorRefBlock | undefined;
  recPriceNum: number;
  aid: string;
}) {
  if (!competitor) {
    return (
      <div className="flex items-center gap-2 text-[var(--muted)]">
        <span className="font-semibold text-[var(--ink-3)]">Competitor:</span>
        <DataMissingBadge reason="No signal" icon={false} tooltip="No lost-quote signal in the last 90 days." />
        <AlertButton
          triggerKind="competitor_undercut"
          scope={{ aid }}
          initialSpec={{ pct: 3 }}
        />
      </div>
    );
  }
  const med = parseDecimal(competitor.median_price);
  const lastSeen = relativeDate(competitor.last_seen);
  const recHigher = Number.isFinite(med) && Number.isFinite(recPriceNum) && recPriceNum > med;
  const recLower = Number.isFinite(med) && Number.isFinite(recPriceNum) && recPriceNum < med;
  return (
    <div className="flex flex-wrap items-center gap-2">
      <span className="font-semibold text-[var(--ink-3)]">
        Competitor (last seen {lastSeen}):
      </span>
      <span className="tabular-nums font-bold text-[var(--ink)]">{fmt.eurPrecise(med)}</span>
      <span className="text-[var(--muted)]">· n={competitor.sample_count}</span>
      {recHigher && (
        <span className="rounded-full bg-[var(--amber-bg)] px-2 py-[1px] text-[10.5px] font-semibold uppercase tracking-wide text-[var(--amber)]">
          ⚠ above ours
        </span>
      )}
      {recLower && (
        <span className="rounded-full bg-[var(--amber-bg)] px-2 py-[1px] text-[10.5px] font-semibold uppercase tracking-wide text-[var(--amber)]">
          ⚠ below ours
        </span>
      )}
      <AlertButton
        triggerKind="competitor_undercut"
        scope={{ aid }}
        initialSpec={{ pct: 3 }}
      />
    </div>
  );
}

function relativeDate(iso: string): string {
  const t = Date.parse(iso);
  if (!Number.isFinite(t)) return iso;
  const days = Math.max(0, Math.round((Date.now() - t) / 86400000));
  if (days <= 0) return 'today';
  if (days === 1) return 'yesterday';
  if (days < 30) return `${days}d ago`;
  return new Date(t).toISOString().slice(0, 10);
}

/**
 * Very small markdown renderer — paragraphs and bold only. We deliberately
 * avoid a heavy markdown dep here; the rationale_md from the backend is
 * a short, controlled string and we don't want to expand the bundle.
 */
function RationaleSimple({ md }: { md: string }) {
  const paragraphs = useMemo(() => md.split(/\n{2,}/).filter(Boolean), [md]);
  if (paragraphs.length === 0) {
    return <DataMissingBadge reason="No rationale" />;
  }
  return (
    <div className="space-y-2 text-[12.5px] leading-[1.55] text-[var(--ink-2)]">
      {paragraphs.map((p, i) => (
        <p key={i} dangerouslySetInnerHTML={{ __html: renderInlineMd(p) }} />
      ))}
    </div>
  );
}

function renderInlineMd(src: string): string {
  // Escape HTML, then upgrade **bold** and `code`.
  const escaped = src
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
  return escaped
    .replace(/\*\*([^*]+)\*\*/g, '<strong class="text-[var(--ink)]">$1</strong>')
    .replace(/`([^`]+)`/g, '<code class="rounded bg-white px-1 py-[1px] text-[11.5px] font-mono text-[var(--ink-2)]">$1</code>');
}

