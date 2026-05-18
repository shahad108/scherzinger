import { useEffect, useMemo, useRef, useState } from 'react';
import { ArrowRight, ChevronDown, ChevronUp } from 'lucide-react';
import { cn } from '@/lib/cn';
import type { ActionIntent, PerSkuRecommendation, SkuRow, Tone } from '@/types';
import { EmptyBlock } from './EmptyBlock';

/** Plan §2.9 F19 — rows whose last published price change is older than
 *  this threshold render a "Stale" chip. Kept as a named constant so the
 *  number never appears inline in JSX. */
const STALE_PRICE_DAYS_THRESHOLD = 365;

/** Plan §2.9 F17 — sort state is persisted in localStorage today. The
 *  plan calls for ``user_view_state.actionCenter.skuSort`` once that
 *  backing table lands; until then localStorage is the lightweight
 *  choice and the contract is read/write-symmetric here. */
const SORT_STORAGE_KEY = 'pryzm.v2.actionCenter.skuSort';

type SortColumn = 'marginDelta' | 'confidence' | 'revenueAtRisk' | 'lastMoveDays';
type SortDirection = 'asc' | 'desc';
interface SortState {
  column: SortColumn;
  direction: SortDirection;
}

const DEFAULT_SORT: SortState = { column: 'revenueAtRisk', direction: 'desc' };
const SORT_COLUMNS: Set<SortColumn> = new Set([
  'marginDelta',
  'confidence',
  'revenueAtRisk',
  'lastMoveDays',
]);
// "Oldest first" is the analytical default for the stale-price column;
// every other sortable column defaults to descending (highest impact at
// the top of the table).
const COLUMN_DEFAULT_DIRECTION: Record<SortColumn, SortDirection> = {
  marginDelta: 'desc',
  confidence: 'desc',
  revenueAtRisk: 'desc',
  lastMoveDays: 'asc',
};

function fmtPrice(value: number | null | undefined): string {
  if (value === null || value === undefined) return '—';
  if (value >= 1000) return `€${value.toFixed(0)}`;
  return `€${value.toFixed(2)}`;
}

function priceDelta(rec: PerSkuRecommendation | null | undefined): { label: string; tone: 'positive' | 'negative' | 'neutral' } {
  if (!rec || rec.current_price == null || rec.recommended_price == null) {
    return { label: '', tone: 'neutral' };
  }
  const delta = rec.recommended_price - rec.current_price;
  if (Math.abs(delta) < 0.005) return { label: 'no change', tone: 'neutral' };
  const pct = (delta / rec.current_price) * 100;
  const sign = delta >= 0 ? '+' : '−';
  return {
    label: `${sign}${Math.abs(pct).toFixed(1)}%`,
    tone: delta >= 0 ? 'positive' : 'negative',
  };
}

function RecommendationCell({ rec }: { rec: PerSkuRecommendation | null | undefined }) {
  const [open, setOpen] = useState(false);
  if (!rec || rec.recommended_price == null) {
    return <span className="text-[11px] text-[var(--muted)]">—</span>;
  }
  const delta = priceDelta(rec);
  const deltaClass =
    delta.tone === 'positive' ? 'text-[var(--green)]' :
    delta.tone === 'negative' ? 'text-[var(--red)]' :
    'text-[var(--muted)]';
  return (
    <div className="relative">
      <button
        type="button"
        onMouseEnter={() => setOpen(true)}
        onMouseLeave={() => setOpen(false)}
        onClick={() => setOpen((v) => !v)}
        className="inline-flex flex-col items-start text-left"
      >
        <span className="font-display text-[13px] font-bold tabular-nums text-[var(--ink)]">
          {fmtPrice(rec.recommended_price)}
        </span>
        <span className={cn('text-[10px] font-semibold tabular-nums', deltaClass)}>
          {delta.label}
          {rec.guardrail_clamped && (
            <span className="ml-1 rounded-full bg-[var(--amber-bg,#FEF3C7)] px-1 py-0.5 text-[9px] font-semibold text-[var(--amber,#92400E)]">
              capped
            </span>
          )}
        </span>
      </button>
      {open && (
        <div
          role="tooltip"
          className="absolute right-0 top-full z-30 mt-1 w-[280px] rounded-lg border border-[var(--hairline)] bg-white p-3 text-[11.5px] leading-relaxed text-[var(--ink-2)] shadow-[var(--shadow-md)]"
        >
          <div className="mb-2 grid grid-cols-3 gap-2 text-center">
            <div>
              <div className="text-[9.5px] font-semibold uppercase tracking-wider text-[var(--muted)]">Floor</div>
              <div className="font-display text-[12px] font-bold tabular-nums">{fmtPrice(rec.floor)}</div>
            </div>
            <div>
              <div className="text-[9.5px] font-semibold uppercase tracking-wider text-[var(--muted)]">Current</div>
              <div className="font-display text-[12px] font-bold tabular-nums">{fmtPrice(rec.current_price)}</div>
            </div>
            <div>
              <div className="text-[9.5px] font-semibold uppercase tracking-wider text-[var(--muted)]">Ceiling</div>
              <div className="font-display text-[12px] font-bold tabular-nums">{fmtPrice(rec.ceiling)}</div>
            </div>
          </div>
          {rec.top_drivers && rec.top_drivers.length > 0 && (
            <div className="border-t border-[var(--hairline)] pt-2">
              <div className="mb-1 text-[9.5px] font-semibold uppercase tracking-wider text-[var(--muted)]">
                Why · top 3 drivers
              </div>
              <ul className="space-y-0.5">
                {rec.top_drivers.map((d) => (
                  <li key={d.code} className="flex items-center justify-between gap-2">
                    <span className="text-[var(--ink)]">{d.label}</span>
                    <span className="tabular-nums text-[var(--muted)]">
                      {Math.round(d.weight * 100)}%
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          )}
          {rec.heuristic && (
            <p className="mt-2 border-t border-[var(--hairline)] pt-2 text-[10.5px] italic text-[var(--muted)]">
              {rec.heuristic.label}: {rec.heuristic.qualifier ?? rec.heuristic.rule}
            </p>
          )}
        </div>
      )}
    </div>
  );
}

const marginToneClass: Record<Tone, string> = {
  positive: 'text-[var(--green)]',
  negative: 'text-[var(--red)]',
  warning: 'text-[var(--amber)]',
  info: 'text-[var(--primary-deep)]',
  rose: 'text-[var(--rose)]',
  neutral: 'text-[var(--ink)]',
};

const statusChip: Record<SkuRow['status'], string> = {
  movable: 'bg-[var(--green-bg)] text-[var(--green)] border-[var(--green-border)]',
  locked: 'bg-[var(--amber-bg)] text-[var(--amber)] border-[var(--amber-border)]',
  abtest: 'bg-indigo-50 text-indigo-700 border-indigo-200',
  outlier: 'bg-[var(--red-bg)] text-[var(--red)] border-[var(--red-border)]',
};

const confChip: Record<SkuRow['clusterTone'], string> = {
  high: 'bg-[var(--green-bg)] text-[var(--green)] border-[var(--green-border)]',
  mid: 'bg-[var(--amber-bg)] text-[var(--amber)] border-[var(--amber-border)]',
  low: 'bg-[var(--red-bg)] text-[var(--red)] border-[var(--red-border)]',
};

/** Parse the trailing margin-delta percentage ("30.6% → 6.4%") into the
 *  signed change in pp. Used to rank rows when ``marginDelta`` is the
 *  active sort. Returns 0 when the string is "n/a" / unparseable. */
function marginDeltaSortValue(label: string): number {
  const m = label.match(/(-?\d+(?:\.\d+)?)%\s*→\s*(-?\d+(?:\.\d+)?)%/);
  if (!m) return 0;
  return parseFloat(m[2]) - parseFloat(m[1]);
}

function loadStoredSort(): SortState {
  if (typeof window === 'undefined') return DEFAULT_SORT;
  try {
    const raw = window.localStorage.getItem(SORT_STORAGE_KEY);
    if (!raw) return DEFAULT_SORT;
    const parsed = JSON.parse(raw) as Partial<SortState>;
    if (
      parsed &&
      typeof parsed.column === 'string' &&
      SORT_COLUMNS.has(parsed.column as SortColumn) &&
      (parsed.direction === 'asc' || parsed.direction === 'desc')
    ) {
      return { column: parsed.column as SortColumn, direction: parsed.direction };
    }
  } catch {
    // Corrupt JSON — fall through to the default sort.
  }
  return DEFAULT_SORT;
}

function persistSort(state: SortState): void {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(SORT_STORAGE_KEY, JSON.stringify(state));
  } catch {
    // Storage may be unavailable (private mode / quota); ignore.
  }
}

function sortValue(row: SkuRow, column: SortColumn): number {
  switch (column) {
    case 'marginDelta':
      return marginDeltaSortValue(row.marginDelta);
    case 'confidence':
      return row.confidence?.score ?? row.clusterConf ?? 0;
    case 'revenueAtRisk':
      return row.revenueAtRisk ?? 0;
    case 'lastMoveDays':
      // Rows with no audit history sort to the bottom of the "oldest first"
      // view — they're not "fresh", they're "unknown". Using -1 keeps them
      // out of the "stale" group regardless of direction.
      return row.lastMoveDays ?? -1;
  }
}

function SortableHeader({
  label,
  column,
  state,
  onSort,
}: {
  label: string;
  column: SortColumn;
  state: SortState;
  onSort: (column: SortColumn) => void;
}) {
  const active = state.column === column;
  const Icon = state.direction === 'asc' ? ChevronUp : ChevronDown;
  return (
    <th
      className="border-b border-[var(--hairline)] px-3 py-2.5 text-left text-[10.5px] font-bold uppercase tracking-wider text-[var(--muted)]"
    >
      <button
        type="button"
        onClick={() => onSort(column)}
        aria-sort={active ? (state.direction === 'asc' ? 'ascending' : 'descending') : 'none'}
        className={cn(
          'inline-flex items-center gap-1 transition-colors hover:text-[var(--ink-2)]',
          active && 'text-[var(--ink)]',
        )}
      >
        {label}
        {active && <Icon size={11} aria-hidden />}
      </button>
    </th>
  );
}

export function SkuTable({
  rows,
  onAction,
  onArticleClick,
  onBulk,
  queueFilter,
}: {
  rows: SkuRow[];
  onAction?: (row: SkuRow) => void;
  onArticleClick?: (row: SkuRow) => void;
  onBulk?: (intent: ActionIntent) => void;
  /** Plan §2.9 — selection state must clear when the upstream queue
   *  filter changes, otherwise a previously-selected SKU survives a
   *  filter narrow that removed it from view. */
  queueFilter?: string;
}) {
  const [hideLocked, setHideLocked] = useState(false);
  const [sort, setSort] = useState<SortState>(() => loadStoredSort());
  const [selected, setSelected] = useState<Set<string>>(() => new Set());
  const lastFilter = useRef<string | undefined>(queueFilter);

  useEffect(() => {
    if (lastFilter.current !== queueFilter) {
      lastFilter.current = queueFilter;
      setSelected(new Set());
    }
  }, [queueFilter]);

  const visible = useMemo(() => {
    const base = hideLocked ? rows.filter((r) => r.status !== 'locked') : rows;
    const sorted = [...base].sort((a, b) => {
      const av = sortValue(a, sort.column);
      const bv = sortValue(b, sort.column);
      if (av === bv) return 0;
      const cmp = av < bv ? -1 : 1;
      return sort.direction === 'asc' ? cmp : -cmp;
    });
    return sorted;
  }, [rows, hideLocked, sort]);

  const handleSort = (column: SortColumn) => {
    setSort((prev) => {
      const next: SortState =
        prev.column === column
          ? { column, direction: prev.direction === 'asc' ? 'desc' : 'asc' }
          : { column, direction: COLUMN_DEFAULT_DIRECTION[column] };
      persistSort(next);
      return next;
    });
  };

  const toggleRow = (article: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(article)) next.delete(article);
      else next.add(article);
      return next;
    });
  };

  const visibleArticles = useMemo(() => visible.map((r) => r.article), [visible]);
  const allVisibleSelected =
    visibleArticles.length > 0 && visibleArticles.every((a) => selected.has(a));
  const someVisibleSelected = !allVisibleSelected && visibleArticles.some((a) => selected.has(a));

  const toggleAll = () => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (allVisibleSelected) {
        for (const a of visibleArticles) next.delete(a);
      } else {
        for (const a of visibleArticles) next.add(a);
      }
      return next;
    });
  };

  const fireBulk = () => {
    if (selected.size === 0) return;
    const aids = Array.from(selected).join(',');
    const intent: ActionIntent = {
      route: '/pricing',
      query: { aids, source: 'action-center' },
      toast: `Opening ${selected.size} SKUs in Pricing Studio.`,
    };
    onBulk?.(intent);
    setSelected(new Set());
  };

  const fireArticle = (row: SkuRow) => {
    onArticleClick?.(row);
    if (!onArticleClick) {
      // No host wired — emit the drawer intent so the global dispatcher
      // can pick it up via the ``onBulk`` channel (same plumbing).
      onBulk?.({
        drawer: {
          title: `SKU summary · ${row.article}`,
          description: row.description,
          formKind: 'sku_summary',
          context: {
            articleId: row.article,
            headline: `SKU summary · ${row.article}`,
            sourceScreen: 'action-center',
          },
        },
      });
    }
  };

  if (!rows || rows.length === 0) {
    return (
      <EmptyBlock
        title="SKU pricing engine"
        hint="No SKUs in scope for the active filter. Toggle Hide locked off to widen the view."
      />
    );
  }

  return (
    <>
      <div className="mb-3 flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 className="font-display text-lg font-bold tracking-tight text-[var(--ink)]">
            SKU pricing engine
          </h2>
          <p className="mt-0.5 text-xs text-[var(--muted)]">
            Item-level view — cluster confidence and contract status disclosed per row.
          </p>
        </div>
        <label className="inline-flex cursor-pointer items-center gap-2 text-xs font-semibold text-[var(--muted)]">
          <input
            type="checkbox"
            checked={hideLocked}
            onChange={(e) => setHideLocked(e.target.checked)}
            className="h-3.5 w-3.5 accent-[var(--rose)]"
          />
          Hide contract-locked items
        </label>
      </div>
      {selected.size > 0 && (
        <div
          data-testid="sku-bulk-toolbar"
          className="mb-2 flex items-center justify-between gap-3 rounded-lg border border-[var(--hairline)] bg-[var(--surface-soft)] px-3 py-2 text-[12px] font-semibold text-[var(--ink-2)]"
        >
          <span>
            {selected.size} selected
          </span>
          <button
            type="button"
            onClick={fireBulk}
            className="inline-flex items-center gap-1 rounded-md border border-[var(--ink-2)] bg-white px-3 py-1.5 text-[11.5px] font-bold text-[var(--ink)] transition-colors hover:bg-[var(--grey-bg)]"
          >
            Open all in Pricing Studio ({selected.size})
            <ArrowRight size={11} />
          </button>
        </div>
      )}
      <div className="mb-6 overflow-hidden rounded-xl border border-[var(--hairline)] bg-white shadow-[var(--shadow)]">
        <table className="w-full text-sm">
          <thead>
            <tr className="bg-[var(--surface-soft)]">
              <th className="border-b border-[var(--hairline)] px-3 py-2.5 text-left">
                <input
                  type="checkbox"
                  aria-label="Select all visible SKUs"
                  checked={allVisibleSelected}
                  ref={(el) => {
                    if (el) el.indeterminate = someVisibleSelected;
                  }}
                  onChange={toggleAll}
                  className="h-3.5 w-3.5 accent-[var(--rose)]"
                />
              </th>
              <th className="border-b border-[var(--hairline)] px-3 py-2.5 text-left text-[10.5px] font-bold uppercase tracking-wider text-[var(--muted)]">
                Article
              </th>
              <th className="border-b border-[var(--hairline)] px-3 py-2.5 text-left text-[10.5px] font-bold uppercase tracking-wider text-[var(--muted)]">
                Description
              </th>
              <th className="border-b border-[var(--hairline)] px-3 py-2.5 text-left text-[10.5px] font-bold uppercase tracking-wider text-[var(--muted)]">
                Commodity
              </th>
              <SortableHeader label="Cluster conf." column="confidence" state={sort} onSort={handleSort} />
              <SortableHeader label="Margin Δ" column="marginDelta" state={sort} onSort={handleSort} />
              <SortableHeader label="Rev @ risk" column="revenueAtRisk" state={sort} onSort={handleSort} />
              <SortableHeader label="Last move" column="lastMoveDays" state={sort} onSort={handleSort} />
              <th className="border-b border-[var(--hairline)] px-3 py-2.5 text-left text-[10.5px] font-bold uppercase tracking-wider text-[var(--muted)]">
                Recommended
              </th>
              <th className="border-b border-[var(--hairline)] px-3 py-2.5 text-left text-[10.5px] font-bold uppercase tracking-wider text-[var(--muted)]">
                Status
              </th>
              <th className="border-b border-[var(--hairline)] px-3 py-2.5 text-left text-[10.5px] font-bold uppercase tracking-wider text-[var(--muted)]">
                Action
              </th>
            </tr>
          </thead>
          <tbody>
            {visible.map((r) => {
              const isStale =
                typeof r.lastMoveDays === 'number' && r.lastMoveDays >= STALE_PRICE_DAYS_THRESHOLD;
              const isSelected = selected.has(r.article);
              return (
                <tr
                  key={r.article}
                  className={cn(
                    'group border-b border-[var(--hairline)] last:border-b-0 transition-colors hover:bg-[var(--surface-soft)]',
                    isSelected && 'bg-[var(--surface-soft)]',
                  )}
                >
                  <td className="px-3 py-2.5">
                    <input
                      type="checkbox"
                      aria-label={`Select ${r.article}`}
                      checked={isSelected}
                      onChange={() => toggleRow(r.article)}
                      className="h-3.5 w-3.5 accent-[var(--rose)]"
                    />
                  </td>
                  <td className="px-3 py-2.5">
                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        onClick={() => fireArticle(r)}
                        className="font-display font-bold text-[var(--ink)] transition-colors hover:text-[var(--rose)]"
                      >
                        {r.article}
                      </button>
                      {isStale && (
                        <span
                          title={`Last price change: ${r.lastMoveDays} days ago`}
                          className="inline-flex items-center rounded-full border border-[var(--amber-border)] bg-[var(--amber-bg)] px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wider text-[var(--amber)]"
                        >
                          Stale
                        </span>
                      )}
                    </div>
                  </td>
                  <td className="px-3 py-2.5 text-[var(--ink-2)]">{r.description}</td>
                  <td className="px-3 py-2.5 text-[var(--muted)]">{r.commodity}</td>
                  <td className="px-3 py-2.5">
                    <span
                      className={cn(
                        'inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[10px] font-bold',
                        confChip[r.clusterTone],
                      )}
                    >
                      <span className="h-1.5 w-1.5 rounded-full bg-current" />
                      {r.confidence?.score ?? r.clusterConf}%
                      {r.confidence?.sampleSize != null && (
                        <span className="ml-0.5 text-[9px] font-semibold opacity-70">
                          n={r.confidence.sampleSize}
                        </span>
                      )}
                    </span>
                  </td>
                  <td className={cn('px-3 py-2.5 font-bold tabular-nums', marginToneClass[r.marginTone])}>
                    {r.marginDelta}
                  </td>
                  <td className="px-3 py-2.5 tabular-nums text-[var(--ink-2)]">
                    {r.revenueAtRisk == null ? '—' : `€${Math.round(r.revenueAtRisk).toLocaleString()}`}
                  </td>
                  <td className="px-3 py-2.5 tabular-nums text-[var(--ink-2)]">
                    {r.lastMoveDays == null ? '—' : `${r.lastMoveDays}d`}
                  </td>
                  <td className="px-3 py-2.5">
                    <RecommendationCell rec={r.recommendation} />
                  </td>
                  <td className="px-3 py-2.5">
                    <span
                      className={cn(
                        'inline-flex items-center rounded-full border px-2 py-0.5 text-[10px] font-bold',
                        statusChip[r.status],
                      )}
                    >
                      {r.statusLabel}
                    </span>
                  </td>
                  <td className="px-3 py-2.5">
                    {(() => {
                      // Task 2 quality fix — disable when typed action intent
                      // is missing instead of rendering a silent no-op button.
                      const disabled = !r.action;
                      return (
                        <button
                          type="button"
                          onClick={() => onAction?.(r)}
                          disabled={disabled}
                          title={disabled ? 'Action not available' : undefined}
                          className={cn(
                            'inline-flex items-center gap-1 rounded-md border border-[var(--hairline)] bg-white px-2.5 py-1 text-[11px] font-semibold text-[var(--ink-2)] transition-all',
                            disabled
                              ? 'cursor-not-allowed opacity-50'
                              : 'hover:border-[var(--ink-2)] hover:bg-[var(--grey-bg)]',
                          )}
                        >
                          {r.actionLabel}
                          <ArrowRight size={11} />
                        </button>
                      );
                    })()}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </>
  );
}
