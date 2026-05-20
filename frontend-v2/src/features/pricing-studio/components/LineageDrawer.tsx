// Pricing Studio v3 / Phase 1 — Lineage drawer.
//
// Right-rail drawer (480px). Driven by `useLineageDrawer()` context — one
// instance lives at the page root, and any LineageButton / hero click swaps
// the open ref via the provider. Subscribes to `pricing.recommendation_updated`
// so an SSE refresh while the drawer is open surfaces a "view new" banner
// rather than silently replacing the rendered lineage.

import { useEffect, useState } from 'react';
import { Drawer } from '@/components/ui/Drawer';
import { useLineageDrawer } from '@/features/pricing-studio/lineage/LineageDrawerContext';
import { usePricingLineage } from '@/data/api/usePricingLineage';
import { usePricingStream } from '@/hooks/usePricingStream';
import type { LineageSourceRow } from '@/data/api/usePricingLineage';
import type { ConfidenceLevel } from '@/types/studio';
import { ChevronRight, RefreshCw } from 'lucide-react';
import { DriverWaterfall } from './DriverWaterfall';
import { WtpBandStrip } from './WtpBandStrip';

const REC_UPDATED_TOPIC = 'pricing.recommendation_updated';

// Confidence chip palette mirrors RecommendationHero so the drawer reads
// consistently when a "Why this price?" click flows through.
const CONFIDENCE_CHIP_TONE: Record<
  ConfidenceLevel,
  { label: string; bg: string; fg: string; border: string }
> = {
  low: {
    label: 'low',
    bg: 'var(--rose-bg)',
    fg: 'var(--rose-deep)',
    border: 'var(--rose-border)',
  },
  med: {
    label: 'medium',
    bg: 'var(--amber-bg)',
    fg: 'var(--amber)',
    border: 'var(--amber-border)',
  },
  high: {
    label: 'high',
    bg: 'var(--green-bg)',
    fg: 'var(--green)',
    border: 'var(--green-border)',
  },
};

interface Props {
  /** Optional aid to filter the SSE stream by. */
  aid?: string | null;
}

export function LineageDrawer({ aid }: Props) {
  const { openLineageRef, subjectTitle, closeLineage } = useLineageDrawer();
  const open = openLineageRef !== null;

  return (
    <Drawer
      open={open}
      onOpenChange={(o) => {
        if (!o) closeLineage();
      }}
      side="right"
      width={560}
      title="Data lineage"
    >
      {open && (
        <LineageDrawerBody
          refId={openLineageRef.id}
          subjectTitle={subjectTitle ?? defaultSubjectTitle(openLineageRef.source_kind)}
          aid={aid ?? null}
        />
      )}
    </Drawer>
  );
}

function defaultSubjectTitle(kind: string): string {
  return `Lineage · ${kind.replace(/_/g, ' ')}`;
}

interface BodyProps {
  refId: string;
  subjectTitle: string;
  aid: string | null;
}

function LineageDrawerBody({ refId, subjectTitle, aid }: BodyProps) {
  const {
    openLineageRef,
    drivers,
    wtp,
    recommendedPrice,
    confidenceLevel,
    nDeals,
  } = useLineageDrawer();
  // Pass workbench context into the synthesiser so the always-on frame
  // (cost-state · competitor · won-deal sample · elasticity model) is
  // sourced from real numbers when available.
  const lineage = usePricingLineage(openLineageRef, {
    wtp,
    competitorRef: null,
  });
  // SSE: surface a "recomputed" banner if the recommendation changes while
  // the drawer is open. We don't auto-replace because the user may be
  // mid-reading; they click to acknowledge.
  const { lastEvent } = usePricingStream({ topic: 'pricing', aid });
  const [recomputedAt, setRecomputedAt] = useState<number | null>(null);
  // Force a re-render counter so a tap on "view new" snapshots a refresh tick.
  const [, setRefreshTick] = useState(0);

  useEffect(() => {
    if (!lastEvent) return;
    if (lastEvent.topic !== REC_UPDATED_TOPIC) return;
    if (aid && lastEvent.aid && lastEvent.aid !== aid) return;
    setRecomputedAt(lastEvent.ts);
  }, [lastEvent, aid]);

  const headingId = `lineage-heading-${refId}`;

  return (
    <div
      role="region"
      aria-labelledby={headingId}
      className="flex h-full flex-col"
    >
      <header className="border-b border-[var(--hairline)] px-5 py-4 pr-12">
        <div className="text-[10.5px] font-semibold uppercase tracking-[0.08em] text-[var(--muted)]">
          Why this number?
        </div>
        <div className="mt-1 flex flex-wrap items-center gap-2">
          <h2
            id={headingId}
            className="font-display text-[18px] font-bold tracking-[-0.018em] text-[var(--ink)]"
          >
            {subjectTitle}
          </h2>
          <ConfidenceChip level={confidenceLevel} nDeals={nDeals} />
        </div>
        {lineage.ref && (
          <div className="mt-2 text-[11px] text-[var(--muted)]">
            <span className="font-semibold text-[var(--ink-3)]">
              {lineage.sources[0]?.kindLabel}
            </span>{' '}
            · computed {relativeTime(lineage.ref.computed_at)} by{' '}
            <code className="rounded bg-[var(--surface-soft)] px-1 py-[1px] text-[10.5px]">
              {lineage.ref.computed_by}
            </code>
          </div>
        )}
      </header>

      {recomputedAt !== null && (
        <div className="flex items-center justify-between gap-3 border-b border-[var(--rose-border)] bg-[var(--rose-bg)] px-5 py-2 text-[11.5px] text-[var(--rose-deep)]">
          <span>
            Recomputed {Math.max(0, Math.round(Date.now() / 1000 - recomputedAt))}s ago.
          </span>
          <button
            type="button"
            onClick={() => {
              setRecomputedAt(null);
              setRefreshTick((t) => t + 1);
            }}
            className="inline-flex items-center gap-1 rounded-md border border-[var(--rose-border)] bg-white px-2 py-1 text-[11px] font-semibold text-[var(--rose-deep)] hover:bg-[var(--rose-bg)]"
          >
            <RefreshCw size={11} />
            View new
          </button>
        </div>
      )}

      <div className="flex-1 overflow-y-auto px-5 py-4">
        {drivers && drivers.length > 0 && (
          <section
            aria-labelledby={`${headingId}-drivers`}
            data-testid="lineage-drawer-drivers"
          >
            <h3
              id={`${headingId}-drivers`}
              className="mb-2 text-[10.5px] font-bold uppercase tracking-[0.06em] text-[var(--muted)]"
            >
              Drivers
            </h3>
            <DriverWaterfall drivers={drivers} />
          </section>
        )}

        {wtp && (
          <section
            aria-labelledby={`${headingId}-wtp`}
            data-testid="lineage-drawer-wtp"
            className={
              drivers && drivers.length > 0
                ? 'pt-4 mt-4 border-t border-[var(--hairline)]'
                : ''
            }
          >
            <h3
              id={`${headingId}-wtp`}
              className="mb-2 text-[10.5px] font-bold uppercase tracking-[0.06em] text-[var(--muted)]"
            >
              Willingness-to-pay
            </h3>
            <WtpBandStrip wtp={wtp} recommendedPrice={recommendedPrice} />
          </section>
        )}

        <section
          aria-labelledby={`${headingId}-sources`}
          className={
            (drivers && drivers.length > 0) || wtp
              ? 'pt-4 mt-4 border-t border-[var(--hairline)]'
              : ''
          }
        >
          <h3
            id={`${headingId}-sources`}
            className="mb-2 text-[10.5px] font-bold uppercase tracking-[0.06em] text-[var(--muted)]"
          >
            Sources
          </h3>
          <ul className="space-y-1.5">
            {lineage.sources.map((s) => (
              <SourceRow key={s.id} source={s} />
            ))}
            {lineage.sources.length === 0 && !lineage.notFound && lineage.isLoading && (
              <li
                data-testid="lineage-drawer-loading"
                className="rounded-md border border-dashed border-[var(--hairline)] p-3 text-[12px] text-[var(--muted)]"
              >
                Loading lineage…
              </li>
            )}
            {lineage.sources.length === 0 && lineage.notFound && (
              <li
                data-testid="lineage-drawer-not-found"
                className="rounded-md border border-dashed border-[var(--amber-border)] bg-[var(--amber-bg)] p-3 text-[12px] text-[var(--amber)]"
              >
                Lineage not found — the underlying lineage_refs row has been pruned or never recorded.
              </li>
            )}
            {lineage.sources.length === 0 && !lineage.notFound && !lineage.isLoading && (
              <li className="rounded-md border border-dashed border-[var(--hairline)] p-3 text-[12px] text-[var(--muted)]">
                No upstream sources recorded.
              </li>
            )}
          </ul>
        </section>
      </div>

      <footer className="border-t border-[var(--hairline)] px-5 py-3 text-[10.5px] text-[var(--muted)]">
        Lineage IDs are immutable. Every numeric value the Studio displays is traceable
        back to its source row in the audit log.
      </footer>
    </div>
  );
}

function SourceRow({ source }: { source: LineageSourceRow }) {
  const [expanded, setExpanded] = useState(false);
  const unavailable = source.available === false;
  return (
    <li
      className={`rounded-md border border-[var(--hairline)] bg-white ${unavailable ? 'opacity-60' : ''}`}
      data-source-kind={source.source_kind}
    >
      <button
        type="button"
        onClick={() => setExpanded((v) => !v)}
        aria-expanded={expanded}
        className="flex w-full items-center justify-between gap-3 px-3 py-2 text-left hover:bg-[var(--surface-soft)]"
      >
        <div className="min-w-0">
          <div className="text-[10.5px] font-semibold uppercase tracking-[0.05em] text-[var(--muted)]">
            {source.kindLabel}
            {unavailable && (
              <span className="ml-1.5 rounded-full bg-[var(--surface-soft)] px-1.5 py-[1px] text-[9.5px] font-semibold uppercase tracking-wide text-[var(--muted)]">
                no recent samples
              </span>
            )}
          </div>
          <div className="mt-0.5 truncate text-[12px] font-semibold text-[var(--ink-2)]">
            {source.source_id}
          </div>
          <div className="mt-0.5 flex flex-wrap gap-x-2 gap-y-0.5 text-[10.5px] text-[var(--muted)]">
            <span>{relativeTime(source.computed_at)}</span>
            {source.model && <span>model {source.model}</span>}
            <span>by {source.computed_by}</span>
          </div>
        </div>
        <ChevronRight
          size={14}
          aria-hidden="true"
          className={`shrink-0 text-[var(--muted)] transition-transform ${expanded ? 'rotate-90' : ''}`}
        />
      </button>
      {expanded && (
        <div className="border-t border-[var(--hairline)] px-3 py-2 text-[11px] text-[var(--ink-3)]">
          {source.sql ? (
            <pre className="max-h-32 overflow-auto whitespace-pre-wrap break-words rounded bg-[var(--surface-soft)] p-2 font-mono text-[10.5px] leading-relaxed">
              {source.sql}
            </pre>
          ) : (
            <p className="text-[var(--muted)]">No SQL/feature snippet stored for this source.</p>
          )}
        </div>
      )}
    </li>
  );
}

function ConfidenceChip({
  level,
  nDeals,
}: {
  level: ConfidenceLevel | null;
  nDeals: number | null;
}) {
  if (!level && (nDeals === null || nDeals === undefined)) return null;
  const tone = level ? CONFIDENCE_CHIP_TONE[level] : null;
  const labelLevel = tone ? `confidence: ${tone.label}` : null;
  const labelDeals =
    nDeals !== null && nDeals !== undefined && Number.isFinite(nDeals)
      ? `n=${nDeals} deals`
      : null;
  const text = [labelLevel, labelDeals].filter(Boolean).join(' · ');
  const style = tone
    ? { background: tone.bg, color: tone.fg, borderColor: tone.border }
    : {
        background: 'var(--surface-soft)',
        color: 'var(--muted)',
        borderColor: 'var(--hairline)',
      };
  return (
    <span
      data-testid="lineage-drawer-confidence-chip"
      className="inline-flex items-center gap-1 rounded-full border px-2 py-[2px] text-[10.5px] font-semibold uppercase tracking-[0.04em]"
      style={style}
    >
      {text}
    </span>
  );
}

function relativeTime(iso: string): string {
  const t = Date.parse(iso);
  if (!Number.isFinite(t)) return iso;
  const diffSec = Math.max(0, (Date.now() - t) / 1000);
  if (diffSec < 60) return `${Math.round(diffSec)}s ago`;
  if (diffSec < 3600) return `${Math.round(diffSec / 60)}m ago`;
  if (diffSec < 86400) return `${Math.round(diffSec / 3600)}h ago`;
  return `${Math.round(diffSec / 86400)}d ago`;
}
