// Phase 6 — Override log accordion.
//
// Shows the list of forecast overrides stored on the server (manual actuals
// entered via the click-to-actual flow). Frank can delete an entry to undo
// a wrong actual. Empty state nudges him to enter one.

import { Accordion } from '@/components/Accordion';
import { useForecastOverrides, useDeleteOverride } from '@/data/api/useForecastOverrides';
import type { ForecastOverride } from '@/types/forecast';

function formatNumber(n: number): string {
  return n.toLocaleString('en-US', { maximumFractionDigits: 0 });
}

function formatPct(n: number): string {
  const sign = n > 0 ? '+' : '';
  return `${sign}${(n * 100).toFixed(1)}%`;
}

function formatDate(iso: string): string {
  try {
    return new Date(iso).toLocaleDateString('en-GB', {
      day: '2-digit',
      month: 'short',
      year: 'numeric',
    });
  } catch {
    return iso;
  }
}

// Phase 8 review (finding 8): factored out into its own component so each row
// owns its own `useDeleteOverride` mutation. Previously a single mutation hook
// was shared across all rows, so clicking Delete on one row disabled every
// other row's button until the mutation settled.
function OverrideRow({ o }: { o: ForecastOverride }) {
  const del = useDeleteOverride();
  return (
    <tr
      data-testid={`override-row-${o.id}`}
      className="border-b border-[var(--hairline)] align-top text-[var(--ink-2)]"
    >
      <td className="py-2 pr-3 font-mono">{o.month}</td>
      <td className="py-2 pr-3">{o.cluster ?? '—'}</td>
      <td className="py-2 pr-3 capitalize">{o.mode}</td>
      <td className="py-2 pr-3 text-right font-mono">{formatNumber(o.modelP50)}</td>
      <td className="py-2 pr-3 text-right font-mono">{formatNumber(o.actual)}</td>
      <td
        className={`py-2 pr-3 text-right font-mono ${
          o.adjustmentPct > 0
            ? 'text-[var(--accent-green-deep)]'
            : o.adjustmentPct < 0
            ? 'text-[var(--rose-deep)]'
            : ''
        }`}
      >
        {formatPct(o.adjustmentPct)}
      </td>
      <td className="py-2 pr-3 capitalize">{o.source}</td>
      <td className="py-2 pr-3 capitalize">{o.confidence}</td>
      <td className="max-w-[260px] truncate py-2 pr-3" title={o.reason}>
        {o.reason}
      </td>
      <td className="py-2 pr-3">{o.author}</td>
      <td className="py-2 pr-3">{formatDate(o.createdAt)}</td>
      <td className="py-2 pr-3 text-right">
        <button
          type="button"
          data-testid={`override-delete-${o.id}`}
          aria-label={`Delete override for ${o.month}`}
          onClick={() => del.mutate(o.id)}
          disabled={del.isPending}
          className="inline-flex items-center rounded-md border border-[var(--hairline)] bg-white px-2 py-1 text-[11px] font-semibold text-[var(--ink-2)] hover:bg-[var(--surface-soft)] disabled:opacity-50"
        >
          {del.isPending ? 'Deleting…' : 'Delete'}
        </button>
      </td>
    </tr>
  );
}

export function OverrideLog() {
  // Phase 9: surface fetch errors instead of masking them behind the empty
  // state — otherwise a 401 / 500 looks like "no overrides yet" and Frank
  // thinks his click-to-actual did nothing.
  const { data, isLoading, isError, refetch } = useForecastOverrides();
  const items: ForecastOverride[] = data?.items ?? [];
  const count = items.length;

  return (
    <Accordion
      title="Override log"
      id="block-override-log"
      defaultOpen={false}
      badge={count > 0 ? `${count}` : undefined}
    >
      {isLoading ? (
        <div className="py-4 text-[12.5px] text-[var(--muted)]">Loading overrides…</div>
      ) : isError ? (
        <div
          data-testid="override-log-error"
          role="alert"
          className="my-3 flex items-center justify-between gap-3 rounded-md border border-[var(--rose-deep)]/30 bg-[var(--rose)]/10 px-3 py-2 text-[12.5px] text-[var(--rose-deep)]"
        >
          <span>Couldn’t load overrides — please retry.</span>
          <button
            type="button"
            onClick={() => refetch()}
            className="inline-flex items-center rounded-md border border-[var(--rose-deep)]/40 bg-white px-2 py-1 text-[11px] font-semibold text-[var(--rose-deep)] hover:bg-[var(--rose)]/20"
          >
            Retry
          </button>
        </div>
      ) : count === 0 ? (
        <div
          data-testid="override-log-empty"
          className="py-4 text-[12.5px] text-[var(--muted)]"
        >
          No overrides yet. Click any month on the forecast above to enter an actual.
        </div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-left text-[12.5px]">
            <thead>
              <tr className="border-b border-[var(--hairline)] text-[11px] font-semibold uppercase tracking-wide text-[var(--muted)]">
                <th className="py-2 pr-3">Month</th>
                <th className="py-2 pr-3">Cluster</th>
                <th className="py-2 pr-3">Mode</th>
                <th className="py-2 pr-3 text-right">Model P50</th>
                <th className="py-2 pr-3 text-right">Actual</th>
                <th className="py-2 pr-3 text-right">Δ</th>
                <th className="py-2 pr-3">Source</th>
                <th className="py-2 pr-3">Confidence</th>
                <th className="py-2 pr-3">Reason</th>
                <th className="py-2 pr-3">Author</th>
                <th className="py-2 pr-3">Created</th>
                <th className="py-2 pr-3" aria-label="actions" />
              </tr>
            </thead>
            <tbody data-testid="override-log-rows">
              {items.map((o) => (
                <OverrideRow key={o.id} o={o} />
              ))}
            </tbody>
          </table>
        </div>
      )}
    </Accordion>
  );
}
