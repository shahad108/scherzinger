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
import { ChevronRight, RefreshCw } from 'lucide-react';

const REC_UPDATED_TOPIC = 'pricing.recommendation_updated';

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
      width={480}
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
  const { openLineageRef } = useLineageDrawer();
  const lineage = usePricingLineage(openLineageRef);
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
        <h2
          id={headingId}
          className="mt-1 font-display text-[18px] font-bold tracking-[-0.018em] text-[var(--ink)]"
        >
          {subjectTitle}
        </h2>
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
        <section aria-labelledby={`${headingId}-sources`}>
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
            {lineage.sources.length === 0 && (
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
  return (
    <li className="rounded-md border border-[var(--hairline)] bg-white">
      <button
        type="button"
        onClick={() => setExpanded((v) => !v)}
        aria-expanded={expanded}
        className="flex w-full items-center justify-between gap-3 px-3 py-2 text-left hover:bg-[var(--surface-soft)]"
      >
        <div className="min-w-0">
          <div className="text-[10.5px] font-semibold uppercase tracking-[0.05em] text-[var(--muted)]">
            {source.kindLabel}
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

function relativeTime(iso: string): string {
  const t = Date.parse(iso);
  if (!Number.isFinite(t)) return iso;
  const diffSec = Math.max(0, (Date.now() - t) / 1000);
  if (diffSec < 60) return `${Math.round(diffSec)}s ago`;
  if (diffSec < 3600) return `${Math.round(diffSec / 60)}m ago`;
  if (diffSec < 86400) return `${Math.round(diffSec / 3600)}h ago`;
  return `${Math.round(diffSec / 86400)}d ago`;
}
