// Pricing Studio v3 / Phase E3 — Quotes evidence pane.
//
// Renders the BFF response of GET /pricing/sku/{aid}/quote-history inside
// the EvidenceTabs surface. Iron rule: every cell flows from the typed
// block — no hardcoded numbers, no client-side recomputation of summary
// counts. The status field (`"live" | "empty" | "degraded"`) drives the
// empty / warning UI.

import { useMemo } from 'react';
import { fmt } from '@/lib/format';
import { parseDecimal } from '../lib/decimal';
import type { QuoteHistoryBlock, QuoteHistoryRow } from '@/types/studio';

interface Props {
  data: QuoteHistoryBlock | null | undefined;
  isLoading: boolean;
  error: unknown;
}

const MONTHS_SHORT = [
  'Jan',
  'Feb',
  'Mar',
  'Apr',
  'May',
  'Jun',
  'Jul',
  'Aug',
  'Sep',
  'Oct',
  'Nov',
  'Dec',
];

const MAX_VISIBLE_ROWS = 50;

function formatDateShort(value: string | null): string {
  if (!value) return '—';
  // BFF ships "YYYY-MM-DD"; only parse the leading 10 chars to avoid any
  // local TZ shifts an `Date(...)` would introduce.
  const m = /^(\d{4})-(\d{2})/.exec(value.slice(0, 10));
  if (!m) return value;
  const year = m[1];
  const monthIdx = Number(m[2]) - 1;
  if (monthIdx < 0 || monthIdx > 11) return value;
  return `${MONTHS_SHORT[monthIdx]} ${year.slice(2)}`;
}

function formatQty(value: number | null): string {
  if (value === null || value === undefined) return '—';
  if (!Number.isFinite(value)) return '—';
  return fmt.num(value);
}

function formatRevenue(value: string | null): string {
  const n = parseDecimal(value);
  if (!Number.isFinite(n)) return '—';
  return fmt.eur(n);
}

/** Margin string-decimal → "67.3%". */
function formatMarginPct(value: string | null): string {
  const n = parseDecimal(value);
  if (!Number.isFinite(n)) return '—';
  return `${(n * 100).toFixed(1)}%`;
}

/** Margin gap → signed percentage-points with leading sign. */
function formatGapPp(value: string | null): string {
  const n = parseDecimal(value);
  if (!Number.isFinite(n)) return '—';
  const pp = n * 100;
  const sign = pp >= 0 ? '+' : '−'; // U+2212 minus
  return `${sign}${Math.abs(pp).toFixed(1)} pp`;
}

/** "0.6700" → "67.0%". 1dp by spec. */
function formatWinRate(value: string | null): string {
  const n = parseDecimal(value);
  if (!Number.isFinite(n)) return '—';
  return `${(n * 100).toFixed(1)}%`;
}

function gapTone(value: string | null): 'pos' | 'neg' | 'none' {
  const n = parseDecimal(value);
  if (!Number.isFinite(n) || n === 0) return 'none';
  return n > 0 ? 'pos' : 'neg';
}

function PaneShell({ children }: { children: React.ReactNode }) {
  return <div className="ws-pane">{children}</div>;
}

function PaneHeader() {
  return (
    <h4>
      Quote history{' '}
      <span className="ws-pane-sub">this SKU only · last {MAX_VISIBLE_ROWS} quotes</span>
    </h4>
  );
}

/**
 * Quiet shimmer rows shown while the query is in flight. Mirrors the
 * skeleton density used on CostHistory so the tab swap doesn't jump.
 */
function LoadingSkeleton() {
  return (
    <PaneShell>
      <PaneHeader />
      <div
        data-testid="quote-history-loading"
        style={{ display: 'flex', flexDirection: 'column', gap: 8 }}
      >
        {[0, 1, 2, 3].map((i) => (
          <div
            key={i}
            style={{
              height: 28,
              borderRadius: 8,
              background: 'var(--surface-sunken)',
              opacity: 0.7,
            }}
          />
        ))}
      </div>
    </PaneShell>
  );
}

function EmptyCard({ body }: { body: string }) {
  return (
    <div
      role="note"
      data-testid="quote-history-empty"
      style={{
        margin: '8px 0',
        padding: '14px 16px',
        borderRadius: 12,
        background: 'var(--surface-sunken)',
        border: '1px dashed var(--hairline)',
        color: 'var(--ink-2)',
        fontSize: 12.5,
        lineHeight: 1.45,
      }}
    >
      <div style={{ fontWeight: 700, color: 'var(--ink)', fontSize: 12 }}>
        No quote history
      </div>
      <div style={{ marginTop: 4 }}>{body}</div>
    </div>
  );
}

function ErrorCard({ reason }: { reason: string }) {
  return (
    <div
      role="alert"
      data-testid="quote-history-error"
      style={{
        margin: '8px 0',
        padding: '14px 16px',
        borderRadius: 12,
        background: 'color-mix(in oklab, var(--amber-bg) 60%, white)',
        border: '1px solid color-mix(in oklab, var(--amber) 32%, white)',
        color: 'var(--ink-2)',
        fontSize: 12.5,
        lineHeight: 1.45,
      }}
    >
      <div style={{ fontWeight: 700, color: 'var(--ink)', fontSize: 12 }}>
        Quote history unavailable
      </div>
      <div style={{ marginTop: 4 }}>{reason}</div>
    </div>
  );
}

function DegradedBanner({ reason }: { reason: string }) {
  return (
    <div
      role="alert"
      data-testid="quote-history-degraded"
      style={{
        margin: '4px 0 10px',
        padding: '10px 14px',
        borderRadius: 10,
        background: 'color-mix(in oklab, var(--amber-bg) 60%, white)',
        border: '1px solid color-mix(in oklab, var(--amber) 32%, white)',
        color: 'var(--ink-2)',
        fontSize: 12.5,
        lineHeight: 1.45,
      }}
    >
      <span style={{ fontWeight: 700, color: 'var(--ink)' }}>
        Quote history degraded:
      </span>{' '}
      {reason}
    </div>
  );
}

interface KpiTileProps {
  label: string;
  value: string;
  testId?: string;
}

function KpiTile({ label, value, testId }: KpiTileProps) {
  return (
    <div
      data-testid={testId}
      style={{
        flex: '1 1 0',
        minWidth: 110,
        padding: '10px 12px',
        borderRadius: 10,
        background: 'white',
        border: '1px solid var(--hairline)',
      }}
    >
      <div
        style={{
          fontSize: 10.5,
          color: 'var(--ink-3)',
          fontWeight: 600,
          letterSpacing: '0.05em',
          textTransform: 'uppercase',
        }}
      >
        {label}
      </div>
      <div
        style={{
          marginTop: 4,
          fontSize: 18,
          fontWeight: 700,
          color: 'var(--ink)',
        }}
      >
        {value}
      </div>
    </div>
  );
}

function SummaryStrip({
  summary,
}: {
  summary: QuoteHistoryBlock['summary'];
}) {
  return (
    <div
      data-testid="quote-history-summary"
      style={{
        display: 'flex',
        flexWrap: 'wrap',
        gap: 8,
        margin: '4px 0 12px',
      }}
    >
      <KpiTile
        label="Total quotes"
        value={fmt.num(summary.n_total)}
        testId="quote-kpi-total"
      />
      <KpiTile
        label="Won"
        value={fmt.num(summary.n_won)}
        testId="quote-kpi-won"
      />
      <KpiTile
        label="Lost"
        value={fmt.num(summary.n_lost)}
        testId="quote-kpi-lost"
      />
      <KpiTile
        label="Win rate"
        value={formatWinRate(summary.win_rate)}
        testId="quote-kpi-win-rate"
      />
    </div>
  );
}

function OutcomePill({ row }: { row: QuoteHistoryRow }) {
  if (row.is_won) {
    return (
      <span
        data-testid={`quote-outcome-${row.quote_id}-${row.position}`}
        data-tone="success"
        style={{
          display: 'inline-flex',
          alignItems: 'center',
          padding: '2px 8px',
          borderRadius: 999,
          fontSize: 11,
          fontWeight: 600,
          background: 'color-mix(in oklab, var(--emerald-bg, #ecfdf5) 80%, white)',
          color: 'var(--emerald-deep, #047857)',
          border:
            '1px solid color-mix(in oklab, var(--emerald, #10b981) 26%, white)',
        }}
      >
        Won
      </span>
    );
  }
  return (
    <span
      data-testid={`quote-outcome-${row.quote_id}-${row.position}`}
      data-tone="muted"
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: 6,
        padding: '2px 8px',
        borderRadius: 999,
        fontSize: 11,
        fontWeight: 600,
        background: 'var(--surface-sunken)',
        color: 'var(--ink-2)',
        border: '1px solid var(--hairline)',
      }}
    >
      <span>Lost</span>
      {row.rejection_code && (
        <i
          style={{
            fontStyle: 'italic',
            fontWeight: 500,
            color: 'var(--ink-3)',
          }}
        >
          {row.rejection_code}
        </i>
      )}
    </span>
  );
}

function GapCell({ row }: { row: QuoteHistoryRow }) {
  const tone = gapTone(row.margin_gap);
  const label = formatGapPp(row.margin_gap);
  const color =
    tone === 'pos'
      ? 'var(--emerald-deep, #047857)'
      : tone === 'neg'
        ? 'var(--rose-deep, #be123c)'
        : 'var(--ink-3)';
  return (
    <span
      data-testid={`quote-gap-${row.quote_id}-${row.position}`}
      data-tone={tone}
      style={{
        color,
        fontVariantNumeric: 'tabular-nums',
        fontWeight: 600,
      }}
    >
      {label}
    </span>
  );
}

function TableRow({ row, aid }: { row: QuoteHistoryRow; aid: string }) {
  const rowKey = `${row.quote_id}-${row.position}`;
  return (
    <tr
      data-testid={`quote-row-${rowKey}`}
      data-aid={aid}
      style={{ borderTop: '1px solid var(--hairline)' }}
    >
      <td style={tdStyle}>{formatDateShort(row.date)}</td>
      <td style={{ ...tdStyle, fontFamily: 'var(--mono, monospace)' }}>
        {row.quote_id}
      </td>
      <td style={{ ...tdStyle, fontFamily: 'var(--mono, monospace)' }}>
        {row.customer_id}
      </td>
      <td style={{ ...tdStyle, textAlign: 'right' }}>
        {formatQty(row.quantity)}
      </td>
      <td style={{ ...tdStyle, textAlign: 'right' }}>
        {formatRevenue(row.revenue)}
      </td>
      <td style={{ ...tdStyle, textAlign: 'right' }}>
        {formatMarginPct(row.quoted_db2_margin)}
      </td>
      <td
        style={{
          ...tdStyle,
          textAlign: 'right',
          color: row.actual_db2_margin ? 'var(--ink)' : 'var(--ink-3)',
        }}
      >
        {formatMarginPct(row.actual_db2_margin)}
      </td>
      <td style={{ ...tdStyle, textAlign: 'right' }}>
        <GapCell row={row} />
      </td>
      <td style={tdStyle}>
        <OutcomePill row={row} />
      </td>
    </tr>
  );
}

const thStyle: React.CSSProperties = {
  padding: '8px 10px',
  fontSize: 10.5,
  fontWeight: 700,
  color: 'var(--ink-2)',
  letterSpacing: '0.04em',
  textTransform: 'uppercase',
  textAlign: 'left',
  whiteSpace: 'nowrap',
};

const tdStyle: React.CSSProperties = {
  padding: '8px 10px',
  fontSize: 12.5,
  color: 'var(--ink)',
  verticalAlign: 'middle',
  whiteSpace: 'nowrap',
};

function QuoteTable({
  rows,
  aid,
}: {
  rows: QuoteHistoryRow[];
  aid: string;
}) {
  return (
    <div style={{ overflowX: 'auto' }}>
      <table
        data-testid="quote-history-table"
        style={{
          width: '100%',
          borderCollapse: 'collapse',
          tableLayout: 'auto',
        }}
      >
        <caption className="sr-only">Quote history for SKU {aid}</caption>
        <thead>
          <tr>
            <th scope="col" style={thStyle}>
              Date
            </th>
            <th scope="col" style={thStyle}>
              Quote #
            </th>
            <th scope="col" style={thStyle}>
              Customer
            </th>
            <th scope="col" style={{ ...thStyle, textAlign: 'right' }}>
              Qty
            </th>
            <th scope="col" style={{ ...thStyle, textAlign: 'right' }}>
              Revenue
            </th>
            <th scope="col" style={{ ...thStyle, textAlign: 'right' }}>
              Quoted Margin
            </th>
            <th scope="col" style={{ ...thStyle, textAlign: 'right' }}>
              Actual Margin
            </th>
            <th scope="col" style={{ ...thStyle, textAlign: 'right' }}>
              Gap
            </th>
            <th scope="col" style={thStyle}>
              Outcome
            </th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <TableRow key={`${r.quote_id}-${r.position}`} row={r} aid={aid} />
          ))}
        </tbody>
      </table>
    </div>
  );
}

export interface QuoteHistoryPaneProps extends Props {
  /**
   * Aid for the table caption — purely informational so the sr-only
   * caption can name the SKU; defaults to empty string when unknown.
   */
  aid?: string;
}

export function QuoteHistoryPane({
  data,
  isLoading,
  error,
  aid = '',
}: QuoteHistoryPaneProps) {
  const visibleRows = useMemo(() => {
    if (!data) return [] as QuoteHistoryRow[];
    return data.rows.slice(0, MAX_VISIBLE_ROWS);
  }, [data]);

  if (isLoading && !data) {
    return <LoadingSkeleton />;
  }

  if (error && !data) {
    const reason =
      error instanceof Error && error.message
        ? error.message
        : 'Could not load quote history for this SKU.';
    return (
      <PaneShell>
        <PaneHeader />
        <ErrorCard reason={reason} />
      </PaneShell>
    );
  }

  if (!data) {
    // Disabled (no aid yet) — fall through to a quiet empty state.
    return (
      <PaneShell>
        <PaneHeader />
        <EmptyCard body="No SKU selected." />
      </PaneShell>
    );
  }

  if (data.status === 'empty' || data.summary.n_total === 0) {
    return (
      <PaneShell>
        <PaneHeader />
        <EmptyCard
          body={
            data.reason ?? 'No quotes have been recorded for this SKU yet.'
          }
        />
      </PaneShell>
    );
  }

  return (
    <PaneShell>
      <PaneHeader />
      {data.status === 'degraded' && (
        <DegradedBanner
          reason={
            data.reason ?? 'Backend reported a partial failure loading quotes.'
          }
        />
      )}
      <SummaryStrip summary={data.summary} />
      <QuoteTable rows={visibleRows} aid={aid} />
    </PaneShell>
  );
}
