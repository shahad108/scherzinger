import type { ForecastMode } from '@/types/forecast';

interface Props {
  forecast12mo: number; // value in mode's units
  varianceVsPlanPct: number; // e.g., -2.3 means 2.3% below plan
  mape: number; // 8.4 means 8.4%
  fva: { score: number; verdict: 'helping' | 'neutral' | 'hurting'; n: number };
  mode: ForecastMode;
}

function formatValue(v: number, mode: ForecastMode): string {
  if (mode === 'revenue') {
    if (Math.abs(v) >= 1e6) return `${(v / 1e6).toFixed(1)}M €`;
    return `${(v / 1e3).toFixed(0)}K €`;
  }
  if (mode === 'margin') return `${(v * 100).toFixed(1)}%`;
  return `${Math.round(v).toLocaleString()} u`;
}

export function HeroKPIStrip({ forecast12mo, varianceVsPlanPct, mape, fva, mode }: Props) {
  const varTone = varianceVsPlanPct >= 0 ? 'text-emerald-700' : 'text-amber-700';
  const fvaTone =
    fva.verdict === 'helping'
      ? 'text-emerald-700'
      : fva.verdict === 'hurting'
        ? 'text-rose-700'
        : 'text-[var(--muted)]';
  return (
    <div data-testid="hero-kpi-strip" className="mb-4 grid grid-cols-4 gap-3">
      <Tile label="Forecast (next 12mo)" value={formatValue(forecast12mo, mode)} />
      <Tile
        label="Variance vs plan"
        value={`${varianceVsPlanPct > 0 ? '+' : ''}${varianceVsPlanPct.toFixed(1)}%`}
        valueClass={varTone}
      />
      <Tile label="MAPE (trailing 6mo)" value={`${mape.toFixed(1)}%`} />
      <Tile
        label={`FVA — ${fva.verdict}`}
        value={`${fva.score >= 0 ? '+' : ''}${fva.score.toFixed(1)} (n=${fva.n})`}
        valueClass={fvaTone}
      />
    </div>
  );
}

function Tile({
  label,
  value,
  valueClass = 'text-[var(--ink)]',
}: {
  label: string;
  value: string;
  valueClass?: string;
}) {
  return (
    <div className="rounded-[12px] border border-[var(--hairline)] bg-white p-4 shadow-[0_1px_2px_rgba(20,20,28,0.04)]">
      <div className="text-[10.5px] font-semibold uppercase tracking-wide text-[var(--muted)]">
        {label}
      </div>
      <div className={`mt-1 font-display text-[22px] font-bold tracking-tight ${valueClass}`}>
        {value}
      </div>
    </div>
  );
}
