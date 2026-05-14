import type { PVMBar } from '@/types/forecast';

interface Props {
  periodLabel: string;
  bars: PVMBar[];
  /** Visual mode. Revenue uses €, margin uses pp, volume uses units. */
  mode?: 'revenue' | 'margin' | 'volume';
}

const FACTOR_LABELS: Record<PVMBar['factor'], string> = {
  price: 'Price',
  volume: 'Volume',
  mix: 'Mix',
  churn: 'Churn',
  fx: 'FX',
  other: 'Other',
};

function formatDelta(v: number, mode: Props['mode']): string {
  const sign = v >= 0 ? '+' : '−';
  const abs = Math.abs(v);
  if (mode === 'margin') return `${sign}${abs.toFixed(2)} pp`;
  if (mode === 'volume') {
    return abs >= 1000 ? `${sign}${(abs / 1000).toFixed(1)}k u` : `${sign}${Math.round(abs)} u`;
  }
  if (abs >= 1e6) return `${sign}${(abs / 1e6).toFixed(2)} M€`;
  if (abs >= 1e3) return `${sign}${(abs / 1e3).toFixed(0)} K€`;
  return `${sign}${abs.toFixed(0)} €`;
}

/**
 * Arithmetic helpers — exported for unit tests so the math contract is pinned
 * even if the visual layout changes later.
 */
export function totalDelta(bars: PVMBar[]): number {
  return bars.reduce((acc, b) => acc + b.delta, 0);
}

export function maxAbsDelta(bars: PVMBar[]): number {
  return bars.reduce((acc, b) => Math.max(acc, Math.abs(b.delta)), 0);
}

export function PVMWaterfall({ periodLabel, bars, mode = 'revenue' }: Props) {
  const total = totalDelta(bars);
  const peak = maxAbsDelta(bars) || 1;

  return (
    <section
      data-testid="pvm-waterfall"
      className="mb-4 rounded-[12px] border border-[var(--hairline)] bg-white p-4 shadow-[0_1px_2px_rgba(20,20,28,0.04)]"
    >
      <header className="mb-3 flex items-baseline justify-between">
        <div>
          <h3 className="font-display text-[15px] font-bold tracking-tight text-[var(--ink)]">
            Price · Volume · Mix · Churn · FX
          </h3>
          <p className="text-[11.5px] text-[var(--muted)]">{periodLabel}</p>
        </div>
        <div
          className={`font-display text-[16px] font-bold tracking-tight ${
            total >= 0 ? 'text-emerald-700' : 'text-rose-700'
          }`}
          data-testid="pvm-total"
        >
          Net {formatDelta(total, mode)}
        </div>
      </header>
      <ol className="space-y-2" role="list">
        {bars.map((b) => {
          const widthPct = Math.max(2, (Math.abs(b.delta) / peak) * 100);
          const tone = b.delta >= 0 ? 'bg-emerald-500/85' : 'bg-rose-500/85';
          return (
            <li
              key={b.factor}
              className="grid grid-cols-[88px_1fr_120px_56px] items-center gap-3"
              data-testid={`pvm-row-${b.factor}`}
            >
              <span className="text-[12px] font-semibold text-[var(--ink-2)]">
                {FACTOR_LABELS[b.factor]}
              </span>
              <div className="relative h-3 rounded-full bg-[var(--surface-soft)]">
                <div
                  className={`absolute inset-y-0 left-0 rounded-full ${tone}`}
                  style={{ width: `${widthPct}%` }}
                />
              </div>
              <span
                className={`text-right font-mono text-[12.5px] font-semibold ${
                  b.delta >= 0 ? 'text-emerald-700' : 'text-rose-700'
                }`}
              >
                {formatDelta(b.delta, mode)}
              </span>
              <span className="text-right text-[11px] text-[var(--muted)]">
                {b.pctOfTotal.toFixed(0)}%
              </span>
            </li>
          );
        })}
      </ol>
    </section>
  );
}
