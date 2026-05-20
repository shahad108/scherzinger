// Scenario Run Panel — Run button + result display.
//
// Shows a Run button when a scenario is selected. Clicking it POSTs to
// /scenarios/{id}/run (which triggers a fresh forecast computation including
// Chronos volume inference) and renders the baseline-vs-shifted deltas when
// the response arrives. Button shows "Running…" while in-flight.

import { Play, Loader2 } from 'lucide-react';
import { useRunScenario, type ScenarioRunResponse } from '@/data/api/useScenarios';

interface Props {
  scenarioId: string | null;
  scenarioName?: string | null;
}

export function ScenarioRunPanel({ scenarioId, scenarioName }: Props) {
  const run = useRunScenario();

  if (!scenarioId) return null;

  const handleRun = () => {
    run.mutate({ id: scenarioId, horizon: 12 });
  };

  return (
    <div
      data-testid="scenario-run-panel"
      className="mb-4 rounded-[14px] border border-[var(--border)] bg-white p-4"
    >
      <div className="flex items-center justify-between gap-3">
        <div>
          <div className="text-[10.5px] font-semibold uppercase tracking-wide text-[var(--muted)]">
            Scenario simulator
          </div>
          <div className="text-[14px] font-bold text-[var(--ink)]">
            {scenarioName ?? 'Selected scenario'}
          </div>
          <div className="text-[11.5px] text-[var(--muted)] mt-0.5">
            Runs the full v3.1 stack (Chronos volume + AutoETS price/cost reconciliation). Takes a few seconds on first run.
          </div>
        </div>
        <button
          type="button"
          data-testid="scenario-run-button"
          onClick={handleRun}
          disabled={run.isPending}
          className="inline-flex items-center gap-2 rounded-md bg-[var(--rose-deep)] px-4 py-2 text-[12.5px] font-semibold text-white hover:bg-[var(--rose-deep)]/90 disabled:cursor-wait disabled:opacity-70"
        >
          {run.isPending ? (
            <>
              <Loader2 size={14} className="animate-spin" />
              Running…
            </>
          ) : (
            <>
              <Play size={14} />
              Run scenario
            </>
          )}
        </button>
      </div>

      {run.isError && (
        <div
          data-testid="scenario-run-error"
          className="mt-3 rounded-md border border-[var(--red,#9a3232)]/30 bg-[var(--red,#9a3232)]/5 px-3 py-2 text-[12px] text-[var(--red,#9a3232)]"
        >
          Run failed: {run.error?.message ?? 'unknown error'}
        </div>
      )}

      {run.isPending && (
        <div className="mt-3 rounded-md bg-[var(--surface-soft)] px-3 py-2 text-[12px] text-[var(--muted)]">
          Computing baseline + scenario-applied forecast… please wait.
        </div>
      )}

      {run.data && !run.isPending && <ScenarioRunResults data={run.data} />}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Result display — totals delta table + per-month line for revenue
// ---------------------------------------------------------------------------

function fmtEur(v: number | null): string {
  if (v === null || v === undefined) return '—';
  if (Math.abs(v) >= 1_000_000) return `€${(v / 1_000_000).toFixed(2)}M`;
  if (Math.abs(v) >= 1_000) return `€${(v / 1_000).toFixed(0)}K`;
  return `€${Math.round(v).toLocaleString()}`;
}

function fmtUnit(v: number | null, unit: string | null): string {
  if (v === null || v === undefined) return '—';
  if (unit === 'eur') return fmtEur(v);
  if (unit === 'units') return `${Math.round(v).toLocaleString()} u`;
  if (unit === 'margin_ratio') {
    // Margin under scenario apply may come back in pp instead of fraction;
    // guard the formatter so we never show "625%". Values >2 are treated
    // as pp-deltas rather than fractions.
    if (Math.abs(v) > 2) return `${v.toFixed(2)}pp`;
    return `${(v * 100).toFixed(1)}%`;
  }
  return Math.round(v).toLocaleString();
}

function fmtPct(v: number | null): string {
  if (v === null || v === undefined) return '—';
  const sign = v >= 0 ? '+' : '';
  return `${sign}${v.toFixed(2)}%`;
}

function deltaTone(v: number | null): string {
  if (v === null) return 'text-[var(--muted)]';
  if (v > 0) return 'text-[var(--green,#15803d)]';
  if (v < 0) return 'text-[var(--red,#9a3232)]';
  return 'text-[var(--muted)]';
}

function ScenarioRunResults({ data }: { data: ScenarioRunResponse }) {
  const rows: { key: 'revenue' | 'volume' | 'margin'; label: string; unit: string | null }[] = [
    { key: 'revenue', label: 'Revenue (12 mo)', unit: data.baseline.revenue.unit },
    { key: 'volume',  label: 'Volume (12 mo)',  unit: data.baseline.volume.unit },
    { key: 'margin',  label: 'Margin avg',      unit: data.baseline.margin.unit },
  ];

  return (
    <div data-testid="scenario-run-results" className="mt-4 space-y-3">
      {data.receipt && (
        <div className="rounded-md bg-[var(--surface-soft)] px-3 py-2 text-[11.5px] text-[var(--ink-2)]">
          Scenario applied: <b>{fmtPct(data.receipt.shiftPpMargin)}</b> on margin
          {' · '}{data.receipt.inputCount} input{data.receipt.inputCount === 1 ? '' : 's'} matched
          {data.receipt.unmappedInputs.length > 0 && (
            <span className="text-[var(--muted)]">
              {' · unmatched: '}{data.receipt.unmappedInputs.join(', ')}
            </span>
          )}
        </div>
      )}

      <table className="w-full text-[12.5px] tabular-nums">
        <thead className="text-[10.5px] font-semibold uppercase tracking-wide text-[var(--muted)]">
          <tr>
            <th className="text-left py-1">Metric</th>
            <th className="text-right py-1">Baseline</th>
            <th className="text-right py-1">Scenario</th>
            <th className="text-right py-1">Δ</th>
            <th className="text-right py-1">Δ%</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => {
            const d = data.deltas[r.key];
            return (
              <tr key={r.key} className="border-t border-[var(--hairline)]">
                <td className="py-2 text-[var(--ink-2)]">{r.label}</td>
                <td className="py-2 text-right">{fmtUnit(d.baseline, r.unit)}</td>
                <td className="py-2 text-right">{fmtUnit(d.shifted, r.unit)}</td>
                <td className={`py-2 text-right font-semibold ${deltaTone(d.absoluteDelta)}`}>
                  {fmtUnit(d.absoluteDelta, r.unit)}
                </td>
                <td className={`py-2 text-right font-semibold ${deltaTone(d.pctDelta)}`}>
                  {fmtPct(d.pctDelta)}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
