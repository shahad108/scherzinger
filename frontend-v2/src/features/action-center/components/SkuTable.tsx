import { useState } from 'react';
import { ArrowRight } from 'lucide-react';
import { cn } from '@/lib/cn';
import type { SkuRow, Tone } from '@/types';
import { EmptyBlock } from './EmptyBlock';

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
};

const confChip: Record<SkuRow['clusterTone'], string> = {
  high: 'bg-[var(--green-bg)] text-[var(--green)] border-[var(--green-border)]',
  mid: 'bg-[var(--amber-bg)] text-[var(--amber)] border-[var(--amber-border)]',
  low: 'bg-[var(--red-bg)] text-[var(--red)] border-[var(--red-border)]',
};

export function SkuTable({ rows }: { rows: SkuRow[] }) {
  const [hideLocked, setHideLocked] = useState(false);
  const visible = hideLocked ? rows.filter((r) => r.status !== 'locked') : rows;

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
      <div className="mb-6 overflow-hidden rounded-xl border border-[var(--hairline)] bg-white shadow-[var(--shadow)]">
        <table className="w-full text-sm">
          <thead>
            <tr className="bg-[var(--surface-soft)]">
              {['Article', 'Description', 'Commodity', 'Cluster conf.', 'Margin Δ', 'Status', 'Action'].map(
                (h) => (
                  <th
                    key={h}
                    className="border-b border-[var(--hairline)] px-3 py-2.5 text-left text-[10.5px] font-bold uppercase tracking-wider text-[var(--muted)]"
                  >
                    {h}
                  </th>
                ),
              )}
            </tr>
          </thead>
          <tbody>
            {visible.map((r) => (
              <tr
                key={r.article}
                className="group border-b border-[var(--hairline)] last:border-b-0 transition-colors hover:bg-[var(--surface-soft)]"
              >
                <td className="px-3 py-2.5 font-display font-bold text-[var(--ink)]">{r.article}</td>
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
                    {r.clusterConf}%
                  </span>
                </td>
                <td className={cn('px-3 py-2.5 font-bold tabular-nums', marginToneClass[r.marginTone])}>
                  {r.marginDelta}
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
                  <button className="inline-flex items-center gap-1 rounded-md border border-[var(--hairline)] bg-white px-2.5 py-1 text-[11px] font-semibold text-[var(--ink-2)] transition-all hover:border-[var(--ink-2)] hover:bg-[var(--grey-bg)]">
                    {r.actionLabel}
                    <ArrowRight size={11} />
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}
