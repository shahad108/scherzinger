// BiasCard — per-cluster forecast bias diagnostic.
//
// MAPE tells you the magnitude of error. Bias (mean error sign) tells you
// whether the model is systematically over- or under-shooting. Low MAPE +
// persistent bias is "quietly wrong by the same amount every period" —
// dangerous to defend without surfacing it.
//
// Tracking signal = cumulative ME / MAD. Conventional thresholds: |TS| > 4
// flags bias, |TS| > 2 is amber.

import { ArrowUp, ArrowDown, Minus } from 'lucide-react';
import type { BiasPanel, BiasRow } from '@/types/forecast';

interface Props {
  data: BiasPanel | undefined;
}

function trackingSignalTone(ts: number): { bg: string; fg: string } {
  const abs = Math.abs(ts);
  if (abs > 4) return { bg: 'bg-rose-50', fg: 'text-rose-700' };
  if (abs > 2) return { bg: 'bg-amber-50', fg: 'text-amber-800' };
  return { bg: 'bg-[var(--surface-soft)]', fg: 'text-[var(--ink-2)]' };
}

function DirectionChip({ direction }: { direction: BiasRow['trailing6moDirection'] }) {
  if (direction === 'over') {
    return (
      <span data-testid="bias-direction" data-direction="over" className="inline-flex items-center gap-0.5 rounded-full bg-rose-50 px-2 py-0.5 text-[10.5px] font-semibold uppercase tracking-wide text-rose-700">
        <ArrowUp size={11} /> Over
      </span>
    );
  }
  if (direction === 'under') {
    return (
      <span data-testid="bias-direction" data-direction="under" className="inline-flex items-center gap-0.5 rounded-full bg-sky-50 px-2 py-0.5 text-[10.5px] font-semibold uppercase tracking-wide text-sky-700">
        <ArrowDown size={11} /> Under
      </span>
    );
  }
  return (
    <span data-testid="bias-direction" data-direction="flat" className="inline-flex items-center gap-0.5 rounded-full bg-[var(--surface-soft)] px-2 py-0.5 text-[10.5px] font-semibold uppercase tracking-wide text-[var(--muted)]">
      <Minus size={11} /> Flat
    </span>
  );
}

export function BiasCard({ data }: Props) {
  if (!data || !data.rows || data.rows.length === 0) return null;
  return (
    <section data-testid="bias-card" className="mb-4 rounded-[12px] border border-[var(--hairline)] bg-white p-4">
      <header className="mb-3 flex items-baseline justify-between">
        <div>
          <div className="text-[10.5px] font-semibold uppercase tracking-wide text-[var(--muted)]">Forecast bias — trailing {data.windowMonths}mo</div>
          <div className="font-display text-[16px] font-bold tracking-tight">Are we systematically over- or under-forecasting?</div>
        </div>
      </header>
      <table className="w-full text-left text-[12.5px]">
        <thead className="text-[10.5px] uppercase tracking-wide text-[var(--muted)]">
          <tr className="border-b border-[var(--hairline)]">
            <th className="py-2">Cluster</th>
            <th>Tracking signal</th>
            <th>Hit rate ±5%</th>
            <th>Trailing 6mo</th>
          </tr>
        </thead>
        <tbody>
          {data.rows.map((row) => {
            const tone = trackingSignalTone(row.cmeOverMad);
            return (
              <tr key={row.cluster} className="border-b border-[var(--hairline)] last:border-0">
                <td className="py-2 font-semibold">{row.cluster}</td>
                <td>
                  <span data-testid="bias-ts" className={`inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-semibold ${tone.bg} ${tone.fg}`}>
                    {row.cmeOverMad >= 0 ? '+' : ''}{row.cmeOverMad.toFixed(2)}
                  </span>
                </td>
                <td className="text-[var(--ink-2)]">{row.hitRatePct.toFixed(0)}%</td>
                <td><DirectionChip direction={row.trailing6moDirection} /></td>
              </tr>
            );
          })}
        </tbody>
      </table>
      {data.footnote && <p className="mt-2 text-[11px] text-[var(--muted)]">{data.footnote}</p>}
    </section>
  );
}
