import { useState } from 'react';
import { ArrowRight } from 'lucide-react';
import { cn } from '@/lib/cn';
import type { PerSkuRecommendation, SkuRow, Tone } from '@/types';
import { EmptyBlock } from './EmptyBlock';

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

export function SkuTable({
  rows,
  onAction,
}: {
  rows: SkuRow[];
  onAction?: (row: SkuRow) => void;
}) {
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
              {['Article', 'Description', 'Commodity', 'Cluster conf.', 'Margin Δ', 'Recommended', 'Status', 'Action'].map(
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
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}
