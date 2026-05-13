// Wishlist #2 — Side-by-side scenario comparison.
//
// Reads ?compare=<id1>,<id2>[,<id3>] from the URL and fetches each forecast
// payload in parallel; renders a small table of cluster medians per
// scenario so Frank can eyeball "what changes if I picked the multi-input
// shock instead of the steel-only shock."

import { useQueries } from '@tanstack/react-query';
import { useMemo } from 'react';
import { useSearchParams } from 'react-router-dom';
import { X } from 'lucide-react';
import { apiFetch } from '@/lib/api/client';
import { useScenarios } from '@/data/api/useScenarios';
import type {
  ForecastMode,
  ForecastShell,
  ScenarioSummary,
} from '@/types/forecast';
import { formatMetricValue, metricUnit } from './metricFormat';

const COMPARE_DELIM = ',';

export function parseCompareIds(value: string | null): string[] {
  if (!value) return [];
  return value
    .split(COMPARE_DELIM)
    .map((s) => s.trim())
    .filter(Boolean);
}

export function useCompareParam() {
  const [params, setParams] = useSearchParams();
  const ids = parseCompareIds(params.get('compare'));

  const toggle = (id: string) => {
    const next = new URLSearchParams(params);
    let list = parseCompareIds(params.get('compare'));
    if (list.includes(id)) list = list.filter((x) => x !== id);
    else list = [...list, id].slice(0, 3);
    if (list.length === 0) next.delete('compare');
    else next.set('compare', list.join(COMPARE_DELIM));
    setParams(next, { replace: true });
  };

  const clear = () => {
    const next = new URLSearchParams(params);
    next.delete('compare');
    setParams(next, { replace: true });
  };

  return { ids, toggle, clear };
}

interface Props {
  modeParam: ForecastMode;
  horizonParam: number;
}

export function ScenarioCompareView({ modeParam, horizonParam }: Props) {
  const { ids, clear } = useCompareParam();
  const { data: scenarios } = useScenarios();

  // Always fetch the base case + each requested scenario. The result order
  // is `[base, ...ids]` so the table can read them positionally.
  const queries = useQueries({
    queries: [null, ...ids].map((id) => ({
      queryKey: ['scenario-compare', { id, modeParam, horizonParam }],
      queryFn: () =>
        apiFetch<ForecastShell>('/screens/forecast', {
          params: {
            mode: modeParam,
            horizon: horizonParam,
            scenario_id: id ?? undefined,
          },
        }),
      staleTime: 60_000,
      enabled: true,
    })),
  });

  const allScenarios = useMemo<ScenarioSummary[]>(() => {
    if (!scenarios) return [];
    return [...scenarios.system, ...scenarios.saved, ...scenarios.teamShared];
  }, [scenarios]);

  if (ids.length < 1) return null;

  const baseQuery = queries[0];
  const scenarioQueries = queries.slice(1);

  const baseRows = baseQuery.data?.distributions?.rows ?? [];

  return (
    <section className="mt-4" data-testid="scenario-compare-view">
      <div className="section-row">
        <div>
          <h2>Compare scenarios</h2>
          <div className="sub">
            Side-by-side cluster medians for the active metric and horizon. Up to 3 scenarios.
          </div>
        </div>
        <button
          type="button"
          onClick={clear}
          data-testid="scenario-compare-clear"
          className="inline-flex items-center gap-1.5 rounded-md border border-[var(--hairline)] bg-white px-2.5 py-1 text-[11.5px] font-semibold text-[var(--ink-2)] hover:bg-[var(--surface-soft)]"
        >
          <X size={12} /> Clear compare
        </button>
      </div>
      <div className="lq-card">
        <table className="w-full text-[12.5px]">
          <thead className="text-[10.5px] uppercase tracking-wide text-[var(--muted)]">
            <tr>
              <th className="px-3 py-2 text-left">Cluster</th>
              <th className="px-3 py-2 text-right">Base case</th>
              {ids.map((id) => {
                const s = allScenarios.find((x) => x.id === id);
                return (
                  <th key={id} className="px-3 py-2 text-right">
                    {s?.name ?? `Scenario ${id.slice(0, 8)}…`}
                  </th>
                );
              })}
            </tr>
          </thead>
          <tbody>
            {baseRows.slice(0, 4).map((baseRow) => (
              <tr key={baseRow.entityId} className="border-t border-[var(--hairline)]">
                <td className="px-3 py-2">
                  <b>{baseRow.entityId}</b>
                  <span className="ml-1 text-[11px] text-[var(--muted)]">{baseRow.entityName}</span>
                </td>
                <td className="px-3 py-2 text-right tabular-nums">
                  {formatMetricValue(modeParam === 'volume' ? 'quantity' : modeParam, baseRow.median)}
                </td>
                {scenarioQueries.map((q, i) => {
                  const row = q.data?.distributions?.rows.find((r) => r.entityId === baseRow.entityId);
                  const delta = row && baseRow.median != null && row.median != null ? row.median - baseRow.median : null;
                  const deltaPct = delta != null && baseRow.median ? (delta / baseRow.median) * 100 : null;
                  return (
                    <td
                      key={`${baseRow.entityId}-${ids[i]}`}
                      data-testid={`compare-cell-${baseRow.entityId}-${ids[i]}`}
                      className="px-3 py-2 text-right tabular-nums"
                    >
                      {formatMetricValue(
                        modeParam === 'volume' ? 'quantity' : modeParam,
                        row?.median,
                      )}
                      {deltaPct != null && (
                        <span
                          className={`ml-1 text-[10.5px] ${
                            deltaPct < 0
                              ? 'text-[var(--red,#9a3232)]'
                              : deltaPct > 0
                                ? 'text-[var(--green,#2e7c5a)]'
                                : 'text-[var(--muted)]'
                          }`}
                        >
                          ({deltaPct >= 0 ? '+' : ''}{deltaPct.toFixed(1)}%)
                        </span>
                      )}
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
        <div className="mt-2 text-[10.5px] text-[var(--muted)]">
          Metric: {modeParam} · {metricUnit(modeParam === 'volume' ? 'quantity' : modeParam)} · horizon {horizonParam}mo.
        </div>
      </div>
    </section>
  );
}
