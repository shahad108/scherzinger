// Pricing Studio v3 / Phase E6 — Lineage evidence pane.
//
// Surfaces the SKU-level lineage summary list returned by
// `GET /api/v1/pricing/sku/{aid}/lineage`. Rows are grouped by `kind`
// (recommendation / wtp / curve / fanout / cost_outlook / quote_history /
// option_margin / trigger); clicking a row opens the per-record
// LineageDrawer via `useLineageDrawer().openLineage(...)`.
//
// States:
//   • Loading  — 4 shimmer placeholder rows.
//   • Empty    — dashed-empty card with explanatory copy.
//   • Degraded — warning banner + best-effort row render.
//   • Live     — grouped rows, each clickable.

import { ChevronRight } from 'lucide-react';
import { useLineageDrawer } from '@/features/pricing-studio/lineage/LineageDrawerContext';
import type {
  LineageRefBlock,
  PricingLineageBlock,
  PricingLineageKind,
  PricingLineageRow,
} from '@/types/studio';

export interface LineagePaneProps {
  data: PricingLineageBlock | undefined | null;
  isLoading?: boolean;
  error?: unknown;
}

// Canonical group order — empty groups are skipped at render time.
const GROUP_ORDER: PricingLineageKind[] = [
  'recommendation',
  'wtp',
  'curve',
  'fanout',
  'cost_outlook',
  'quote_history',
  'option_margin',
  'trigger',
  'unknown',
];

const GROUP_LABELS: Record<PricingLineageKind, string> = {
  recommendation: 'Recommendation',
  wtp: 'WTP',
  curve: 'Win-prob curve',
  fanout: 'Customer fanout',
  cost_outlook: 'Cost outlook',
  quote_history: 'Quote history',
  option_margin: 'Option margin',
  trigger: 'Trigger',
  unknown: 'Other',
};

// ---- Relative-time formatting ----------------------------------------------

const RTF = new Intl.RelativeTimeFormat('en', { numeric: 'auto' });

/** Returns a short relative-time label (e.g. "3h ago", "yesterday"). */
export function formatRelative(iso: string, now: Date = new Date()): string {
  const ts = Date.parse(iso);
  if (Number.isNaN(ts)) return iso;
  const diffMs = ts - now.getTime();
  const diffSec = Math.round(diffMs / 1000);
  const absSec = Math.abs(diffSec);
  if (absSec < 60) return RTF.format(diffSec, 'second');
  const diffMin = Math.round(diffSec / 60);
  if (Math.abs(diffMin) < 60) return RTF.format(diffMin, 'minute');
  const diffHr = Math.round(diffMin / 60);
  if (Math.abs(diffHr) < 24) return RTF.format(diffHr, 'hour');
  const diffDay = Math.round(diffHr / 24);
  if (Math.abs(diffDay) < 30) return RTF.format(diffDay, 'day');
  const diffMon = Math.round(diffDay / 30);
  if (Math.abs(diffMon) < 12) return RTF.format(diffMon, 'month');
  const diffYr = Math.round(diffMon / 12);
  return RTF.format(diffYr, 'year');
}

// ---- Sub-components ---------------------------------------------------------

function ShimmerRow() {
  return (
    <div
      data-testid="lineage-pane-shimmer-row"
      className="flex items-center justify-between gap-3 rounded-[10px] px-3 py-2.5"
      style={{ background: 'var(--surface-sunken)' }}
    >
      <div className="flex flex-1 flex-col gap-1.5">
        <div
          style={{
            width: '38%',
            height: 10,
            borderRadius: 4,
            background: 'var(--hairline)',
            opacity: 0.65,
          }}
        />
        <div
          style={{
            width: '60%',
            height: 8,
            borderRadius: 4,
            background: 'var(--hairline)',
            opacity: 0.45,
          }}
        />
      </div>
      <div
        style={{
          width: 12,
          height: 12,
          borderRadius: 3,
          background: 'var(--hairline)',
          opacity: 0.4,
        }}
      />
    </div>
  );
}

function EmptyCard({ title, body }: { title: string; body: string }) {
  return (
    <div
      data-testid="lineage-pane-empty"
      role="note"
      style={{
        margin: '4px 0',
        padding: '16px 18px',
        borderRadius: 12,
        background: 'var(--surface-sunken)',
        border: '1px dashed var(--hairline)',
        color: 'var(--ink-2)',
        fontSize: 12.5,
        lineHeight: 1.5,
      }}
    >
      <div style={{ fontWeight: 600, color: 'var(--ink)', marginBottom: 4 }}>
        {title}
      </div>
      <div>{body}</div>
    </div>
  );
}

function DegradedBanner() {
  return (
    <div
      data-testid="lineage-pane-degraded"
      role="alert"
      style={{
        marginBottom: 10,
        padding: '10px 12px',
        borderRadius: 10,
        background: 'var(--amber-bg)',
        border: '1px solid var(--amber-border)',
        color: 'var(--amber)',
        fontSize: 12.5,
        fontWeight: 500,
      }}
    >
      Lineage temporarily unavailable
    </div>
  );
}

interface RowProps {
  row: PricingLineageRow;
  onOpen: (row: PricingLineageRow) => void;
}

function LineageRowButton({ row, onOpen }: RowProps) {
  const modelLabel = row.model ?? 'Unknown model';
  const relative = formatRelative(row.computed_at);
  return (
    <button
      type="button"
      data-testid={`lineage-pane-row-${row.id}`}
      data-row-id={row.id}
      onClick={() => onOpen(row)}
      className="flex w-full items-center justify-between gap-3 rounded-[10px] px-3 py-2 text-left transition-colors hover:bg-[var(--surface-sunken)] focus-visible:bg-[var(--surface-sunken)] focus-visible:outline-none focus-visible:ring-2"
      style={{ color: 'var(--ink)' }}
    >
      <div className="flex flex-1 flex-col gap-0.5 min-w-0">
        <div className="flex items-baseline gap-2 min-w-0">
          <span
            className="truncate"
            style={{ fontWeight: 600, fontSize: 13 }}
          >
            {modelLabel}
          </span>
          {row.model_version && (
            <span
              className="truncate"
              style={{
                color: 'var(--ink-3)',
                fontSize: 11.5,
                fontVariantNumeric: 'tabular-nums',
              }}
            >
              {row.model_version}
            </span>
          )}
        </div>
        <div
          style={{
            color: 'var(--ink-2)',
            fontSize: 11.5,
            fontVariantNumeric: 'tabular-nums',
          }}
        >
          <span data-testid={`lineage-pane-row-relative-${row.id}`}>
            {relative}
          </span>
          {row.row_count !== null && row.row_count !== undefined && (
            <span data-testid={`lineage-pane-row-count-${row.id}`}>
              {' · '}
              {row.row_count} rows
            </span>
          )}
        </div>
      </div>
      <ChevronRight size={14} aria-hidden="true" style={{ color: 'var(--ink-3)', flexShrink: 0 }} />
    </button>
  );
}

interface GroupProps {
  kind: PricingLineageKind;
  rows: PricingLineageRow[];
  onOpen: (row: PricingLineageRow) => void;
}

function LineageGroup({ kind, rows, onOpen }: GroupProps) {
  return (
    <section
      data-testid={`lineage-pane-group-${kind}`}
      data-group-kind={kind}
      style={{ marginTop: 4 }}
    >
      <h3
        style={{
          margin: '8px 4px 6px',
          color: 'var(--ink-3)',
          fontSize: 11,
          fontWeight: 600,
          letterSpacing: 0.4,
          textTransform: 'uppercase',
        }}
      >
        {GROUP_LABELS[kind]}
      </h3>
      <div className="flex flex-col gap-0.5">
        {rows.map((row) => (
          <LineageRowButton key={row.id} row={row} onOpen={onOpen} />
        ))}
      </div>
    </section>
  );
}

// ---- Helpers ----------------------------------------------------------------

function groupRows(
  rows: PricingLineageRow[],
): Map<PricingLineageKind, PricingLineageRow[]> {
  const out = new Map<PricingLineageKind, PricingLineageRow[]>();
  for (const row of rows) {
    const k: PricingLineageKind = GROUP_ORDER.includes(row.kind) ? row.kind : 'unknown';
    const list = out.get(k) ?? [];
    list.push(row);
    out.set(k, list);
  }
  return out;
}

/**
 * Map a summary-row → LineageRefBlock so the existing drawer's
 * `openLineage(ref)` API can be reused without changes. The drawer in turn
 * re-fetches the full record via GET /api/v1/lineage/{id}, so we only need
 * to plumb enough fields to satisfy the type and let the header render
 * meaningfully on the first frame.
 */
export function rowToLineageRef(row: PricingLineageRow): LineageRefBlock {
  return {
    id: row.id,
    source_kind: row.source_kind,
    source_id: row.id,
    sql: row.sql_preview,
    model: row.model,
    computed_at: row.computed_at,
    computed_by: 'lineage_summary',
  };
}

// ---- Main component ---------------------------------------------------------

export function LineagePane({ data, isLoading, error }: LineagePaneProps) {
  const { openLineage } = useLineageDrawer();

  const handleOpen = (row: PricingLineageRow) => {
    openLineage(rowToLineageRef(row), {
      subjectTitle: `Lineage · ${GROUP_LABELS[
        GROUP_ORDER.includes(row.kind) ? row.kind : 'unknown'
      ]}`,
    });
  };

  if (isLoading && !data) {
    return (
      <div data-testid="lineage-pane-loading" className="flex flex-col gap-1">
        <ShimmerRow />
        <ShimmerRow />
        <ShimmerRow />
        <ShimmerRow />
      </div>
    );
  }

  // Treat network error as degraded if we have nothing to fall back on; if we
  // somehow have stale data, surface it under the banner.
  if (error && !data) {
    return (
      <div data-testid="lineage-pane" className="flex flex-col">
        <DegradedBanner />
      </div>
    );
  }

  if (!data || data.status === 'empty' || data.rows.length === 0) {
    return (
      <EmptyCard
        title="No lineage records"
        body="Decisions for this SKU have not been computed yet."
      />
    );
  }

  const grouped = groupRows(data.rows);

  return (
    <div data-testid="lineage-pane" className="flex flex-col">
      {data.status === 'degraded' && <DegradedBanner />}
      {GROUP_ORDER.map((kind) => {
        const rows = grouped.get(kind);
        if (!rows || rows.length === 0) return null;
        return (
          <LineageGroup
            key={kind}
            kind={kind}
            rows={rows}
            onOpen={handleOpen}
          />
        );
      })}
    </div>
  );
}
