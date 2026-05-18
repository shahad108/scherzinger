import { ArrowRight } from 'lucide-react';
import type { LostQuoteData, QuoteInvoiceGap } from '@/types';

function fmtPp(v: number | null | undefined): string {
  if (v === null || v === undefined) return '—';
  return `${v.toFixed(1)}pp`;
}

function GapSpark({ gap }: { gap: QuoteInvoiceGap }) {
  const rows = gap.byYear;
  if (rows.length === 0) return null;
  const values = rows.map((r) => r.mean_gap_pp ?? 0);
  const max = Math.max(...values, 1);
  return (
    <div className="grid grid-cols-4 gap-2">
      {rows.map((r) => {
        const v = r.mean_gap_pp ?? 0;
        const heightPct = Math.max(8, (v / max) * 100);
        return (
          <div key={r.year} className="flex flex-col items-stretch text-center">
            <div className="relative flex h-16 items-end justify-center rounded-md bg-[var(--surface-soft)]">
              <div
                className="w-7 rounded-t-md bg-[var(--rose)]"
                style={{ height: `${heightPct}%` }}
                title={`${r.year}: ${fmtPp(r.mean_gap_pp)} mean (median ${fmtPp(r.median_gap_pp)}, n=${r.n})`}
              />
            </div>
            <div className="mt-1.5 text-[10.5px] font-semibold text-[var(--ink)]">
              {r.year}
            </div>
            <div className="text-[10px] tabular-nums text-[var(--muted)]">
              {fmtPp(r.mean_gap_pp)} · n={r.n}
            </div>
          </div>
        );
      })}
    </div>
  );
}

export function LostQuoteCard({ data, onOpen }: { data: LostQuoteData; onOpen?: () => void }) {
  const gap = data.quoteInvoiceGap;
  const overall = gap?.overall ?? null;
  const isSignificant = typeof data.pValue === 'number' && data.pValue < 0.05;
  const diffSign = data.differential > 0 ? '+' : '';
  // Task 2 quality fix — disable Open analysis when the backend payload
  // omits a typed action intent (no silent no-op buttons).
  const disabled = !data.action;

  return (
    <>
      <div className="mb-3">
        <h2 className="font-display text-lg font-bold tracking-tight text-[var(--ink)]">
          Lost-quote margin differential
        </h2>
        <p className="mt-0.5 text-xs text-[var(--muted)]">
          {overall ? (
            <>
              Quote-to-invoice margin gap on{' '}
              <b className="font-semibold text-[var(--ink-2)]">
                {overall.n.toLocaleString()} linked records
              </b>
              {' — '}
              median <b className="font-semibold text-[var(--ink-2)]">
                {fmtPp(overall.median_gap_pp)}
              </b>
              , mean <b className="font-semibold text-[var(--ink-2)]">
                {fmtPp(overall.mean_gap_pp)}
              </b>
              .
            </>
          ) : (
            <>Pilot signal: gap between quoted and invoiced margin.</>
          )}
        </p>
      </div>
      <div className="mb-6 rounded-xl border border-[var(--hairline)] bg-white p-6 shadow-[var(--shadow)]">
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-[1.2fr_1fr]">
          <div>
            {overall && (
              <div className="mb-5">
                <div className="flex flex-wrap items-end gap-6">
                  <div>
                    <div className="font-display text-[36px] font-bold leading-none tabular-nums text-[var(--rose-deep)]">
                      {fmtPp(overall.mean_gap_pp)}
                    </div>
                    <div className="mt-1 text-[11px] font-semibold uppercase tracking-wide text-[var(--muted)]">
                      Mean quote-to-invoice gap
                    </div>
                  </div>
                  <div>
                    <div className="font-display text-[28px] font-bold leading-none tabular-nums text-[var(--ink)]">
                      {fmtPp(overall.median_gap_pp)}
                    </div>
                    <div className="mt-1 text-[11px] font-semibold uppercase tracking-wide text-[var(--muted)]">
                      Median gap
                    </div>
                  </div>
                  <span className="ml-auto inline-flex h-6 items-center rounded-full bg-[var(--surface-soft)] px-2.5 text-[11px] font-semibold text-[var(--ink-2)]">
                    n = {overall.n.toLocaleString()} · 4-yr linkage
                  </span>
                </div>
                <p className="mt-3 max-w-[60ch] text-xs leading-relaxed text-[var(--ink-3)]">
                  Quoted margin minus invoiced margin per linked order line. A
                  positive gap means we lose margin between quote and invoice —
                  re-work, freight, returns, hidden discounts. Median 1.9pp ≈{' '}
                  <b>~60k EUR / year leakage</b> on Scherzinger's 2025 volume.
                </p>
              </div>
            )}

            {gap && gap.byYear.length > 0 && (
              <div>
                <div className="mb-2 text-[10.5px] font-semibold uppercase tracking-wider text-[var(--muted)]">
                  Mean gap by year — Scherzinger linkage
                </div>
                <GapSpark gap={gap} />
              </div>
            )}
          </div>

          <div className="flex flex-col justify-between gap-4 rounded-lg bg-[var(--surface-soft)] p-5">
            <div>
              <div className="text-[10.5px] font-semibold uppercase tracking-wider text-[var(--muted)]">
                Secondary signal — won vs. price-lost quotes (current year)
              </div>
              <div className="mt-2 flex items-baseline gap-2">
                <div className="font-display text-[22px] font-bold tabular-nums text-[var(--ink)]">
                  {diffSign}{data.differential}pp
                </div>
                <div className="text-[11px] text-[var(--muted)]">
                  ({data.lostAvg}% lost · {data.wonAvg}% won)
                </div>
              </div>
              <div className="mt-2 inline-flex items-center gap-2 text-[11px]">
                <span
                  className={
                    isSignificant
                      ? 'rounded-full bg-[var(--red-bg)] px-2 py-0.5 font-semibold text-[var(--red)]'
                      : 'rounded-full bg-[var(--surface-3,#f3f4f6)] px-2 py-0.5 font-medium text-[var(--muted)]'
                  }
                >
                  p = {data.pValue ?? '—'}
                  {' '}
                  · {isSignificant ? 'significant' : 'not significant'}
                </span>
              </div>
              <p className="mt-3 text-[12px] leading-relaxed text-[var(--ink-2)]">
                {data.implication}
              </p>
            </div>
            <div className="flex items-center justify-between text-[11.5px] text-[var(--muted)]">
              <span>
                Shared with <b className="text-[var(--ink-2)]">Heiko</b> ·{' '}
                <b className="text-[var(--ink-2)]">Till</b>
              </span>
              <button
                type="button"
                onClick={onOpen}
                disabled={disabled}
                title={disabled ? 'Action not available' : undefined}
                className={
                  disabled
                    ? 'inline-flex cursor-not-allowed items-center gap-1 rounded-md bg-[var(--rose)] px-3 py-1.5 text-xs font-semibold text-white opacity-50'
                    : 'inline-flex items-center gap-1 rounded-md bg-[var(--rose)] px-3 py-1.5 text-xs font-semibold text-white transition-colors hover:bg-[var(--rose-deep)]'
                }
              >
                Open analysis
                <ArrowRight size={12} />
              </button>
            </div>
          </div>
        </div>
      </div>
    </>
  );
}
