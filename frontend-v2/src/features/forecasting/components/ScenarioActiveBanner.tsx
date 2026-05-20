// Wishlist #1 — One-line banner under the page header when a scenario is
// applied. Reads the BFF's `scenarioApplied` receipt + resolves the
// scenario_id to a human-readable name via useScenarios.

import { X } from 'lucide-react';
import { useMemo } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useScenarios } from '@/data/api/useScenarios';
import type { ScenarioAppliedReceipt } from '@/types/forecast';
import { metricUnit } from './metricFormat';

interface Props {
  scenarioId: string;
  applied?: ScenarioAppliedReceipt | null;
}

export function ScenarioActiveBanner({ scenarioId, applied }: Props) {
  const [params, setParams] = useSearchParams();
  const { data } = useScenarios();

  const scenario = useMemo(() => {
    if (!data) return null;
    return (
      [...data.system, ...data.saved, ...data.teamShared].find((s) => s.id === scenarioId) ?? null
    );
  }, [data, scenarioId]);

  const onClear = () => {
    const p = new URLSearchParams(params);
    p.delete('scenario_id');
    setParams(p, { replace: true });
  };

  const headline = scenario?.name ?? `Scenario ${scenarioId.slice(0, 8)}…`;
  const delta = applied
    ? applied.metric === 'margin'
      ? `Δ ${applied.shiftPpMargin >= 0 ? '+' : ''}${applied.shiftPpMargin.toFixed(1)}pp margin`
      : `Δ ${applied.relativePctOnMetric >= 0 ? '+' : ''}${applied.relativePctOnMetric.toFixed(1)}% ${metricUnit(applied.metric)}`
    : null;
  const tone =
    applied && applied.relativePctOnMetric < 0
      ? 'border-[var(--red,#9a3232)] bg-[var(--rose-bg)]'
      : applied && applied.relativePctOnMetric > 0
        ? 'border-[var(--green,#2e7c5a)] bg-[var(--surface-soft)]'
        : 'border-[var(--hairline)] bg-[var(--surface-soft)]';

  return (
    <div
      data-testid="scenario-active-banner"
      className={`mb-3 flex items-start justify-between gap-3 rounded-[12px] border-l-4 ${tone} border border-[var(--hairline)] px-3 py-2 text-[12.5px]`}
    >
      <div className="min-w-0">
        <div className="text-[10.5px] font-semibold uppercase tracking-wide text-[var(--muted)]">
          Scenario applied
        </div>
        <div className="font-display text-[14px] font-bold tracking-tight text-[var(--ink)]">
          {headline}
          {delta && (
            <span className="ml-2 tag-chip" data-testid="scenario-delta-chip">
              {delta}
            </span>
          )}
        </div>
        {scenario?.description && (
          <div className="mt-0.5 text-[11.5px] text-[var(--muted)]">{scenario.description}</div>
        )}
      </div>
      <button
        type="button"
        onClick={onClear}
        aria-label="Clear scenario"
        data-testid="scenario-banner-clear"
        className="grid h-7 w-7 place-items-center rounded-md text-[var(--muted)] hover:bg-[var(--surface-sunken)] hover:text-[var(--ink-2)]"
      >
        <X size={14} />
      </button>
    </div>
  );
}
