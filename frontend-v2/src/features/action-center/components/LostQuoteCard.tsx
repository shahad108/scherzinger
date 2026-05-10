import { ArrowRight } from 'lucide-react';
import type { LostQuoteData } from '@/types';

export function LostQuoteCard({ data }: { data: LostQuoteData }) {
  return (
    <>
      <div className="mb-3">
        <h2 className="font-display text-lg font-bold tracking-tight text-[var(--ink)]">
          Lost-quote margin differential
        </h2>
        <p className="mt-0.5 text-xs text-[var(--muted)]">
          Sales is systematically losing the highest-margin deals. Statistically significant across{' '}
          {(data.linkedRecords ?? 0).toLocaleString()} linked records.
        </p>
      </div>
      <div className="mb-6 rounded-xl border border-[var(--hairline)] bg-white p-6 shadow-[var(--shadow)]">
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-[1.2fr_1fr]">
          <div>
            <div className="mb-4 flex flex-wrap items-end gap-6">
              <div>
                <div className="font-display text-[28px] font-bold tabular-nums text-[var(--ink)]">
                  {data.wonAvg}%
                </div>
                <div className="text-[11px] font-semibold uppercase tracking-wide text-[var(--muted)]">
                  Won deals avg margin
                </div>
              </div>
              <div>
                <div className="font-display text-[28px] font-bold tabular-nums text-[var(--ink)]">
                  {data.lostAvg}%
                </div>
                <div className="text-[11px] font-semibold uppercase tracking-wide text-[var(--muted)]">
                  Lost deals avg margin
                </div>
              </div>
              <div>
                <div className="font-display text-[28px] font-bold tabular-nums text-[var(--red)]">
                  +{data.differential}pp
                </div>
                <div className="text-[11px] font-semibold uppercase tracking-wide text-[var(--red)]">
                  Differential (LOST higher!)
                </div>
              </div>
              <span className="ml-auto inline-flex h-6 items-center rounded-full bg-[var(--red-bg)] px-2.5 text-[11px] font-semibold text-[var(--red)]">
                p = {data.pValue} · significant
              </span>
            </div>
            <div className="space-y-2">
              <div className="flex items-center gap-3">
                <span className="w-12 text-xs font-semibold text-[var(--muted)]">Won</span>
                <div className="relative h-3 flex-1 overflow-hidden rounded-full bg-[var(--grey-bg)]">
                  <div
                    className="h-full bg-gradient-to-r from-emerald-400 to-emerald-500"
                    style={{ width: `${data.wonAvg}%` }}
                  />
                </div>
                <span className="w-14 text-right text-xs font-bold tabular-nums text-[var(--ink)]">
                  {data.wonAvg}%
                </span>
              </div>
              <div className="flex items-center gap-3">
                <span className="w-12 text-xs font-semibold text-[var(--red)]">Lost</span>
                <div className="relative h-3 flex-1 overflow-hidden rounded-full bg-[var(--grey-bg)]">
                  <div
                    className="h-full bg-gradient-to-r from-rose-400 to-rose-500"
                    style={{ width: `${data.lostAvg}%` }}
                  />
                </div>
                <span className="w-14 text-right text-xs font-bold tabular-nums text-[var(--red)]">
                  {data.lostAvg}%
                </span>
              </div>
            </div>
            <p className="mt-4 max-w-[60ch] text-xs leading-relaxed text-[var(--ink-3)]">
              {data.implication}
            </p>
          </div>

          <div className="flex flex-col justify-between rounded-lg bg-[var(--surface-soft)] p-5">
            <div>
              <div className="text-[10.5px] font-semibold uppercase tracking-wide text-[var(--muted)]">
                Implication
              </div>
              <p className="mt-2 text-sm leading-relaxed text-[var(--ink-2)]">
                Pricing logic on the premium tier is leaving money on the table. Investigate
                elasticity model on top decile margins.
              </p>
            </div>
            <div className="mt-5 flex items-center justify-between text-[11.5px] text-[var(--muted)]">
              <span>
                Shared with <b className="text-[var(--ink-2)]">Heiko</b> ·{' '}
                <b className="text-[var(--ink-2)]">Till</b>
              </span>
              <button className="inline-flex items-center gap-1 rounded-md bg-[var(--rose)] px-3 py-1.5 text-xs font-semibold text-white transition-colors hover:bg-[var(--rose-deep)]">
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
