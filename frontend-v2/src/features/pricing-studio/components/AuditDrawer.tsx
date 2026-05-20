// Pricing Studio v3 / Phase 4 — Audit Drawer.
//
// 520px right-rail drawer (Phase 4 drawer-registry width). Opened by the
// "History" button in WorkbenchHero. Body is an infinite-scroll list of
// audit rows for the open SKU, filtered by action-type pills.
//
// Live: subscribes to SSE `audit.appended` for this aid. On event, the open
// drawer invalidates its query so the new row prepends with a brief
// `audit-row--new` flash highlight (rose-tint fade-out, 1s).

import { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQueryClient } from '@tanstack/react-query';
import { Drawer } from '@/components/ui/Drawer';
import { useLineageDrawer } from '@/features/pricing-studio/lineage/LineageDrawerContext';
import { usePricingStream } from '@/hooks/usePricingStream';
import { fmt } from '@/lib/format';
import { parseDecimal } from '@/features/pricing-studio/lib/decimal';
import {
  useAuditFeed,
  auditFeedKey,
  type AuditFeedRow,
  type AuditFilterPill,
} from '@/data/api/useAuditFeed';

const AUDIT_APPENDED_TOPIC = 'audit.appended';

interface PillSpec {
  id: AuditFilterPill;
  label: string;
}

const PILLS: PillSpec[] = [
  { id: 'price', label: 'Price' },
  { id: 'proposal', label: 'Proposal' },
  { id: 'approval', label: 'Approval' },
  { id: 'cost', label: 'Cost' },
  { id: 'override', label: 'Override' },
];

const ACTION_LABEL: Record<string, string> = {
  price_set: 'Price set',
  proposal_created: 'Proposal created',
  proposal_approved: 'Proposal approved',
  proposal_rejected: 'Proposal rejected',
  cost_ingested: 'Cost ingested',
  override_added: 'Override added',
  scenario_published: 'Scenario published',
};

const PRICE_FIELDS = [
  'price',
  'proposed_price',
  'unit_cost',
  'cost',
  'after',
  'before',
] as const;

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  aid: string;
  /** Optional scroll-to handler from the page (scrolls to ProposalContextPanel). */
  onScrollToProposalPanel?: (ref?: string) => void;
}

export function AuditDrawer({ open, onOpenChange, aid, onScrollToProposalPanel }: Props) {
  const [pills, setPills] = useState<AuditFilterPill[]>([]);
  const togglePill = (p: AuditFilterPill) =>
    setPills((cur) => (cur.includes(p) ? cur.filter((x) => x !== p) : [...cur, p]));

  return (
    <Drawer
      open={open}
      onOpenChange={onOpenChange}
      side="right"
      width={560}
      title={`Audit · ${aid}`}
    >
      {open && (
        <AuditDrawerBody
          aid={aid}
          pills={pills}
          onTogglePill={togglePill}
          onScrollToProposalPanel={onScrollToProposalPanel}
          onClose={() => onOpenChange(false)}
        />
      )}
    </Drawer>
  );
}

interface BodyProps {
  aid: string;
  pills: AuditFilterPill[];
  onTogglePill: (p: AuditFilterPill) => void;
  onScrollToProposalPanel?: (ref?: string) => void;
  onClose: () => void;
}

function AuditDrawerBody({
  aid,
  pills,
  onTogglePill,
  onScrollToProposalPanel,
  onClose,
}: BodyProps) {
  const filters = useMemo(() => ({ pills }), [pills]);
  const query = useAuditFeed(aid, filters, { enabled: Boolean(aid) });
  const { fetchNextPage, hasNextPage, isFetchingNextPage } = query;

  // SSE-driven live append: when a new audit row is committed, invalidate so
  // the first page re-fetches. A small in-state set of "fresh" ids drives the
  // 1s flash highlight on prepend.
  const queryClient = useQueryClient();
  const { lastEvent } = usePricingStream({ topic: 'audit', aid });
  const [freshIds, setFreshIds] = useState<Set<string>>(new Set());
  const prevTopRowRef = useRef<string | null>(null);

  useEffect(() => {
    if (!lastEvent) return;
    if (lastEvent.topic !== AUDIT_APPENDED_TOPIC) return;
    if (lastEvent.aid && lastEvent.aid !== aid) return;
    queryClient.invalidateQueries({ queryKey: auditFeedKey(aid, filters) });
  }, [lastEvent, aid, filters, queryClient]);

  // After invalidation re-fetches, any row that's newer than the previous top
  // row gets a brief flash. We compare by `id` so a re-order from a filter
  // change doesn't accidentally flash everything.
  const rows = useMemo<AuditFeedRow[]>(() => {
    if (!query.data) return [];
    return query.data.pages.flatMap((p) => p.rows);
  }, [query.data]);

  useEffect(() => {
    if (rows.length === 0) return;
    const topId = rows[0].id;
    const prev = prevTopRowRef.current;
    // Unconditionally update the ref so the next prepend compares against the
    // current top (not the original one from first mount), preventing a re-flash
    // loop where every SSE tick re-flashes previously-seen rows.
    prevTopRowRef.current = topId;
    if (prev !== null && topId !== prev) {
      const added: string[] = [];
      for (const r of rows) {
        if (r.id === prev) break;
        added.push(r.id);
      }
      if (added.length) {
        setFreshIds(new Set(added));
        const tid = window.setTimeout(() => setFreshIds(new Set()), 1100);
        return () => window.clearTimeout(tid);
      }
    }
    return undefined;
  }, [rows]);

  // Infinite-scroll: IntersectionObserver on a sentinel near the bottom.
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const sentinelRef = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    const root = scrollRef.current;
    const sentinel = sentinelRef.current;
    if (!root || !sentinel) return;
    const io = new IntersectionObserver(
      (entries) => {
        for (const e of entries) {
          if (e.isIntersecting && hasNextPage && !isFetchingNextPage) {
            void fetchNextPage();
          }
        }
      },
      { root, threshold: 0.1 },
    );
    io.observe(sentinel);
    return () => io.disconnect();
  }, [fetchNextPage, hasNextPage, isFetchingNextPage]);

  const total = query.data?.pages[0]?.total ?? 0;
  const headingId = `audit-drawer-heading-${aid}`;

  return (
    <div
      role="region"
      aria-labelledby={headingId}
      className="flex h-full flex-col"
      data-testid="audit-drawer"
    >
      <header className="border-b border-[var(--hairline)] px-5 py-4 pr-12">
        <div className="text-[10.5px] font-semibold uppercase tracking-[0.08em] text-[var(--muted)]">
          Decision history
        </div>
        <div className="mt-1 flex flex-wrap items-baseline gap-2">
          <h2
            id={headingId}
            className="font-display text-[18px] font-bold tracking-[-0.018em] text-[var(--ink)]"
          >
            Audit · {aid}
          </h2>
          <span className="text-[11px] text-[var(--muted)]">last 90 days · {total} events</span>
        </div>
        <div
          className="mt-3 flex flex-wrap gap-1.5"
          role="group"
          aria-label="Filter audit by action type"
          data-testid="audit-drawer-pills"
        >
          {PILLS.map((p) => {
            const active = pills.includes(p.id);
            return (
              <button
                key={p.id}
                type="button"
                onClick={() => onTogglePill(p.id)}
                aria-pressed={active}
                data-testid={`audit-pill-${p.id}`}
                className={
                  active
                    ? 'rounded-full border border-[var(--rose-border)] bg-[var(--rose-bg)] px-2.5 py-[3px] text-[10.5px] font-semibold uppercase tracking-[0.04em] text-[var(--rose-deep)]'
                    : 'rounded-full border border-[var(--hairline)] bg-white px-2.5 py-[3px] text-[10.5px] font-semibold uppercase tracking-[0.04em] text-[var(--muted)] hover:border-[var(--rose-border)] hover:text-[var(--rose-deep)]'
                }
              >
                {p.label}
              </button>
            );
          })}
        </div>
      </header>

      <div ref={scrollRef} className="flex-1 overflow-y-auto" data-testid="audit-drawer-scroll">
        {query.isLoading && (
          <p className="px-5 py-6 text-[12px] text-[var(--muted)]" data-testid="audit-drawer-loading">
            Loading audit…
          </p>
        )}
        {!query.isLoading && rows.length === 0 && (
          <p className="px-5 py-6 text-[12px] text-[var(--muted)]" data-testid="audit-drawer-empty">
            No audit events match these filters.
          </p>
        )}
        {rows.length > 0 && (
          <ul className="divide-y divide-[var(--hairline)]" data-testid="audit-drawer-list">
            {rows.map((row) => (
              <AuditRow
                key={row.id}
                row={row}
                fresh={freshIds.has(row.id)}
                onOpenProposal={(ref) => {
                  onScrollToProposalPanel?.(ref);
                  onClose();
                }}
              />
            ))}
          </ul>
        )}
        <div ref={sentinelRef} aria-hidden="true" className="h-4" data-testid="audit-drawer-sentinel" />
        {isFetchingNextPage && (
          <p className="px-5 py-3 text-[11px] text-[var(--muted)]" data-testid="audit-drawer-loading-more">
            Loading more…
          </p>
        )}
        {!hasNextPage && rows.length > 0 && (
          <p className="px-5 py-3 text-[10.5px] text-[var(--muted)]" data-testid="audit-drawer-end">
            End of history.
          </p>
        )}
      </div>
    </div>
  );
}

interface RowProps {
  row: AuditFeedRow;
  fresh: boolean;
  onOpenProposal: (ref: string) => void;
}

function AuditRow({ row, fresh, onOpenProposal }: RowProps) {
  const navigate = useNavigate();
  const { openLineage } = useLineageDrawer();
  const label = ACTION_LABEL[row.action] ?? row.action.replace(/_/g, ' ');
  const fromTo = renderFromTo(row);
  const ts = formatTimestamp(row.at);

  // Lineage ref shape on the wire is `{ id }` (from `_serialize_lineage`).
  // The page-level LineageDrawer accepts a full LineageRefBlock so we
  // synthesise the missing audit-side fields when the drawer opens.
  const lineageBlock = row.lineage_ref
    ? {
        id: row.lineage_ref.id,
        source_kind: 'audit_event',
        source_id: row.id,
        computed_at: row.at ?? new Date().toISOString(),
        computed_by: row.actor,
      }
    : null;

  return (
    <li
      data-testid="audit-row"
      data-action={row.action}
      className={
        'px-5 py-3 transition-colors ' +
        (fresh ? 'audit-row--new audit-row-flash bg-[var(--rose-bg)]' : '')
      }
    >
      <div className="flex items-baseline justify-between gap-3">
        <div className="min-w-0">
          <div className="flex items-baseline gap-2 text-[11px] text-[var(--muted)]">
            <span>{ts}</span>
            <span aria-hidden="true">·</span>
            <span className="font-semibold text-[var(--ink-3)]">{row.actor}</span>
          </div>
          <div className="mt-0.5 text-[13px] font-bold text-[var(--ink)]">{label}</div>
          {fromTo && (
            <div className="mt-0.5 text-[12px] tabular-nums text-[var(--ink-2)]">{fromTo}</div>
          )}
          {row.reason && (
            <div className="mt-0.5 text-[11.5px] italic text-[var(--muted)]">{row.reason}</div>
          )}
        </div>
        <div className="flex shrink-0 flex-col items-end gap-1.5">
          {lineageBlock && (
            <button
              type="button"
              onClick={() =>
                openLineage(lineageBlock, {
                  subjectTitle: `Audit · ${label}`,
                })
              }
              data-testid="audit-row-lineage"
              className="rounded-full border border-[var(--hairline)] bg-white px-2 py-[2px] text-[10.5px] font-semibold uppercase tracking-[0.04em] text-[var(--muted)] hover:border-[var(--rose-border)] hover:bg-[var(--rose-bg)] hover:text-[var(--rose-deep)]"
            >
              View lineage
            </button>
          )}
          {row.linked_rec && (
            <button
              type="button"
              onClick={() => {
                if (row.action.startsWith('proposal') && row.linked_rec) {
                  onOpenProposal(row.linked_rec.ref);
                  return;
                }
                if (row.link_target) {
                  navigate(row.link_target);
                  return;
                }
                if (row.linked_rec) {
                  navigate(`/action-center?ref=${encodeURIComponent(row.linked_rec.ref)}`);
                }
              }}
              data-testid="audit-row-open-proposal"
              className="rounded-full border border-[var(--rose-border)] bg-white px-2 py-[2px] text-[10.5px] font-semibold uppercase tracking-[0.04em] text-[var(--rose-deep)] hover:bg-[var(--rose-bg)]"
            >
              Open proposal
            </button>
          )}
        </div>
      </div>
    </li>
  );
}

function renderFromTo(row: AuditFeedRow): string | null {
  const before = pickMoney(row.before);
  const after = pickMoney(row.after);
  if (before === null && after === null) return null;
  const left = before === null ? '—' : fmt.eurPrecise(before);
  const right = after === null ? '—' : fmt.eurPrecise(after);
  return `from ${left} → to ${right}`;
}

function pickMoney(payload: Record<string, unknown> | null): number | null {
  if (!payload) return null;
  for (const k of PRICE_FIELDS) {
    if (k in payload) {
      const v = payload[k];
      if (typeof v === 'number' && Number.isFinite(v)) return v;
      if (typeof v === 'string') {
        const n = parseDecimal(v);
        if (Number.isFinite(n)) return n;
      }
    }
  }
  return null;
}

function formatTimestamp(iso: string | null): string {
  if (!iso) return '—';
  const t = Date.parse(iso);
  if (!Number.isFinite(t)) return iso;
  const d = new Date(t);
  // YYYY-MM-DD HH:MM
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}
