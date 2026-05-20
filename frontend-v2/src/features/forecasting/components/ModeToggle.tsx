// Phase 1 — Header-level mode toggle (Revenue / Margin / Volume) + horizon dropdown.
//
// Replaces the dead "Tier · All ▾ / Family · All ▾ / Cluster lens · All ▾" pills
// at the top of the forecasting page. State is hoisted to `?mode=` and
// `?horizon=` query string params so deep links round-trip cleanly.

import { useSearchParams } from 'react-router-dom';
import type { ForecastMode } from '@/types/forecast';

const MODES: { id: ForecastMode; label: string; sub: string }[] = [
  { id: 'revenue', label: 'Revenue €', sub: '12-month booking forecast' },
  { id: 'margin', label: 'Margin %', sub: 'DB2 contribution margin' },
  { id: 'volume', label: 'Volume', sub: 'Quantity / units forecast' },
];

const HORIZONS: { value: 3 | 6 | 12; label: string }[] = [
  { value: 3, label: '3 months' },
  { value: 6, label: '6 months' },
  { value: 12, label: '12 months' },
];

interface Props {
  active: ForecastMode;
  horizonMonths: 3 | 6 | 12;
}

export function ModeToggle({ active, horizonMonths }: Props) {
  const [params, setParams] = useSearchParams();

  const setMode = (next: ForecastMode) => {
    const p = new URLSearchParams(params);
    if (next === 'revenue') p.delete('mode');
    else p.set('mode', next);
    setParams(p, { replace: true });
  };

  const setHorizon = (value: 3 | 6 | 12) => {
    const p = new URLSearchParams(params);
    if (value === 12) p.delete('horizon');
    else p.set('horizon', String(value));
    setParams(p, { replace: true });
  };

  return (
    <div
      role="group"
      aria-label="Forecast mode"
      data-testid="mode-toggle"
      className="mb-4 flex flex-wrap items-center gap-3 rounded-[14px] border border-[var(--border)] bg-[var(--surface-soft)] px-3 py-2.5"
    >
      <div
        role="tablist"
        aria-label="Forecast metric"
        className="inline-flex items-center gap-1 rounded-full bg-white p-1 shadow-[inset_0_0_0_1px_var(--hairline)]"
      >
        {MODES.map((m) => {
          const isActive = m.id === active;
          return (
            <button
              key={m.id}
              role="tab"
              type="button"
              aria-selected={isActive}
              data-testid={`mode-pill-${m.id}`}
              onClick={() => setMode(m.id)}
              title={m.sub}
              className={
                isActive
                  ? 'rounded-full bg-[var(--rose-bg)] px-3.5 py-1.5 text-[12.5px] font-semibold text-[var(--rose-deep)]'
                  : 'rounded-full px-3.5 py-1.5 text-[12.5px] font-semibold text-[var(--muted)] hover:bg-[var(--surface-sunken)]'
              }
            >
              {m.label}
            </button>
          );
        })}
      </div>

      <label className="flex items-center gap-2 text-[11.5px] font-semibold uppercase tracking-wide text-[var(--muted)]">
        Horizon
        <select
          data-testid="horizon-select"
          value={horizonMonths}
          onChange={(e) => setHorizon(Number(e.target.value) as 3 | 6 | 12)}
          className="rounded-md border border-[var(--hairline)] bg-white px-2 py-1 text-[12px] font-semibold text-[var(--ink-2)] focus:outline-none focus:ring-2 focus:ring-[var(--rose-deep)]"
        >
          {HORIZONS.map((h) => (
            <option key={h.value} value={h.value}>
              {h.label}
            </option>
          ))}
        </select>
      </label>

      <span className="ml-auto text-[11px] text-[var(--muted)]">
        Toggle re-runs the tornado, distributions, hero, and downstream cards against the chosen
        metric × horizon.
      </span>
    </div>
  );
}
