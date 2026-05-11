import { useState } from 'react';
import type { QuoteToInvoiceGapData } from '@/types/quotes';

interface Props {
  data: QuoteToInvoiceGapData;
}

const toneColor: Record<QuoteToInvoiceGapData['tone'], { bg: string; fg: string; border: string }> = {
  positive: { bg: 'var(--green-bg)', fg: 'var(--green)',     border: 'var(--green-border)' },
  warning:  { bg: 'var(--amber-bg)', fg: 'var(--amber)',     border: 'var(--amber-border)' },
  negative: { bg: 'var(--rose-bg)',  fg: 'var(--rose-deep)', border: 'var(--rose-border, var(--rose-bg))' },
  neutral:  { bg: 'var(--surface-soft)', fg: 'var(--ink-2)', border: 'var(--hairline)' },
};

function formatPp(pp: number | null): string {
  if (pp === null || pp === undefined) return '—';
  return `${pp.toFixed(1)}pp`;
}

export function QuoteToInvoiceGapCard({ data }: Props) {
  const [showHeuristic, setShowHeuristic] = useState(false);
  const tone = toneColor[data.tone];

  return (
    <div
      id="block-quote-invoice-gap"
      className="mb-4 rounded-[14px] border border-[var(--border)] bg-white p-[18px_20px] shadow-[var(--shadow-card)]"
    >
      <div className="mb-3 flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="font-display text-[18px] font-bold leading-tight tracking-[-0.018em] text-[var(--ink)]">
            {data.title}
          </h2>
          <div className="mt-1 max-w-[64ch] text-[12px] leading-[1.5] text-[var(--muted)]">{data.subtitle}</div>
        </div>
        <span
          className="rounded-[7px] border px-2.5 py-[3px] text-[11px] font-semibold"
          style={{ background: tone.bg, color: tone.fg, borderColor: tone.border }}
        >
          {data.coverage.label}
        </span>
      </div>

      {data.overall ? (
        <div className="grid grid-cols-1 gap-4 md:grid-cols-[minmax(0,1.05fr)_minmax(0,1fr)]">
          <div className="rounded-[11px] border border-[var(--hairline)] bg-[var(--surface-soft)] p-3.5">
            <div className="grid grid-cols-3 gap-3 text-center">
              <div>
                <div className="text-[10px] font-bold uppercase tracking-[0.06em] text-[var(--ink-3)]">Median gap</div>
                <div className="mt-1 font-display text-[28px] font-bold leading-none tabular-nums" style={{ color: tone.fg }}>
                  {data.headline.median}
                </div>
                <div className="mt-0.5 text-[10.5px] text-[var(--muted)]">customer-weighted</div>
              </div>
              <div>
                <div className="text-[10px] font-bold uppercase tracking-[0.06em] text-[var(--ink-3)]">Mean gap</div>
                <div className="mt-1 font-display text-[28px] font-bold leading-none tabular-nums text-[var(--ink)]">
                  {data.headline.mean}
                </div>
                <div className="mt-0.5 text-[10.5px] text-[var(--muted)]">long-tail effect</div>
              </div>
              <div>
                <div className="text-[10px] font-bold uppercase tracking-[0.06em] text-[var(--ink-3)]">Linked lines</div>
                <div className="mt-1 font-display text-[28px] font-bold leading-none tabular-nums text-[var(--ink)]">
                  {data.headline.n}
                </div>
                <div className="mt-0.5 text-[10.5px] text-[var(--muted)]">quote ↔ invoice pairs</div>
              </div>
            </div>
            <p className="mt-3 text-[12px] leading-[1.5] text-[var(--ink-2)]">{data.interpretation}</p>
          </div>

          <div className="rounded-[11px] border border-[var(--hairline)] bg-white p-3.5">
            <h5 className="mb-2 font-display text-[13px] font-bold text-[var(--ink)]">By year</h5>
            {data.byYear.length === 0 ? (
              <div className="text-[12px] text-[var(--muted)]">No annual breakdown available.</div>
            ) : (
              <table className="w-full text-[12px]">
                <thead>
                  <tr className="text-left text-[10.5px] font-bold uppercase tracking-[0.06em] text-[var(--ink-3)]">
                    <th className="py-1.5">Year</th>
                    <th className="py-1.5 text-right">n</th>
                    <th className="py-1.5 text-right">Median</th>
                    <th className="py-1.5 text-right">Mean</th>
                  </tr>
                </thead>
                <tbody>
                  {data.byYear.map((y) => {
                    const isCurrent = y.year === Math.max(...data.byYear.map((r) => r.year));
                    return (
                      <tr key={y.year} className="border-t border-[var(--hairline)]">
                        <td className="py-1.5 font-semibold text-[var(--ink-2)]">
                          {y.year}
                          {isCurrent && (
                            <span
                              className="ml-1.5 rounded-[4px] px-1 py-[1px] text-[9px] font-bold"
                              style={{ background: tone.bg, color: tone.fg }}
                            >
                              latest
                            </span>
                          )}
                        </td>
                        <td className="py-1.5 text-right tabular-nums text-[var(--muted)]">{y.n.toLocaleString()}</td>
                        <td className="py-1.5 text-right tabular-nums font-bold text-[var(--ink-2)]">{formatPp(y.median_gap_pp)}</td>
                        <td className="py-1.5 text-right tabular-nums text-[var(--ink-2)]">{formatPp(y.mean_gap_pp)}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            )}
          </div>
        </div>
      ) : (
        <div className="rounded-[11px] border border-dashed border-[var(--amber-border)] bg-[var(--amber-bg)] p-4 text-[12px] text-[var(--ink-2)]">
          <b>No linkage data:</b> {data.interpretation}
        </div>
      )}

      <div className="mt-3 flex flex-wrap items-center justify-between gap-2 border-t border-[var(--hairline)] pt-2.5 text-[10.5px] text-[var(--muted)]">
        <span>
          Source · <code className="rounded bg-[var(--surface-soft)] px-1 py-0.5 text-[10.5px] text-[var(--rose-deep)]">{data.source.table}</code>
          {data.source.joinOn && <span className="ml-1">· join on <code className="rounded bg-[var(--surface-soft)] px-1 py-0.5">{data.source.joinOn}</code></span>}
        </span>
        <button
          type="button"
          onClick={() => setShowHeuristic((v) => !v)}
          className="rounded-[5px] border border-[var(--hairline)] bg-white px-2 py-[2px] text-[10.5px] font-semibold text-[var(--ink-2)] hover:bg-[var(--surface-soft)]"
          aria-expanded={showHeuristic}
        >
          {data.heuristic.label} {showHeuristic ? '▾' : '▸'}
        </button>
      </div>
      {showHeuristic && (
        <p className="mt-2 rounded-md border border-[var(--hairline)] bg-[var(--surface-soft)] px-2.5 py-1.5 text-[10.5px] italic leading-relaxed text-[var(--muted)]">
          {data.heuristic.rule}
          {data.heuristic.qualifier && <span className="ml-1 not-italic">· {data.heuristic.qualifier}</span>}
        </p>
      )}
    </div>
  );
}
