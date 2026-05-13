// Phase 5 — Scenario library strip.
//
// Three groups of chips (Base / My scenarios / Team-shared). Clicking a chip
// loads that scenario via ?scenario_id=. Trash-icon deletes private scenarios.

import { useSearchParams } from 'react-router-dom';
import { useState } from 'react';
import { Trash2 } from 'lucide-react';
import { useDeleteScenario, useScenarios } from '@/data/api/useScenarios';
import type { ScenarioSummary } from '@/types/forecast';
import { ScenarioBuilder } from './ScenarioBuilder';

export function ScenarioLibrary() {
  const [params, setParams] = useSearchParams();
  const { data, isLoading } = useScenarios();
  const deleteScenario = useDeleteScenario();
  const [builderOpen, setBuilderOpen] = useState(false);
  const activeId = params.get('scenario_id');

  const setActive = (id: string | null) => {
    const p = new URLSearchParams(params);
    if (id) p.set('scenario_id', id);
    else p.delete('scenario_id');
    setParams(p, { replace: true });
  };

  return (
    <div
      className="mb-4 flex flex-wrap items-center gap-2 rounded-[14px] border border-dashed border-[var(--border)] bg-[var(--surface-soft)] px-3 py-2"
      data-testid="scenario-library"
    >
      <span className="text-[10.5px] font-semibold uppercase tracking-wide text-[var(--muted)]">
        Scenarios
      </span>
      {isLoading && <span className="text-[11px] text-[var(--muted)]">Loading…</span>}
      {data && (
        <>
          <Group label="Base" scenarios={data.system} activeId={activeId} onClick={setActive} />
          <Group label="My scenarios" scenarios={data.saved} activeId={activeId} onClick={setActive} deletable onDelete={(id) => deleteScenario.mutate(id)} />
          <Group label="Team-shared" scenarios={data.teamShared} activeId={activeId} onClick={setActive} />
        </>
      )}
      <button
        type="button"
        onClick={() => setBuilderOpen(true)}
        data-testid="scenario-add"
        className="ml-auto rounded-full bg-[var(--rose-deep)] px-3 py-1 text-[11.5px] font-semibold text-white hover:bg-[var(--rose-deep)]/90"
      >
        + New scenario
      </button>
      <ScenarioBuilder open={builderOpen} onClose={() => setBuilderOpen(false)} />
    </div>
  );
}

interface GroupProps {
  label: string;
  scenarios: ScenarioSummary[];
  activeId: string | null;
  onClick: (id: string | null) => void;
  deletable?: boolean;
  onDelete?: (id: string) => void;
}

function Group({ label, scenarios, activeId, onClick, deletable, onDelete }: GroupProps) {
  if (!scenarios.length) return null;
  return (
    <div className="flex flex-wrap items-center gap-1">
      <span className="text-[10.5px] uppercase tracking-wide text-[var(--muted)]">{label}:</span>
      {scenarios.map((s) => {
        const isActive = s.id === activeId;
        return (
          <span key={s.id} className="inline-flex items-center gap-1">
            <button
              type="button"
              data-testid={`scenario-chip-${s.id}`}
              onClick={() => onClick(isActive ? null : s.id)}
              title={s.description}
              className={
                isActive
                  ? 'rounded-full bg-[var(--rose-deep)] px-3 py-0.5 text-[11.5px] font-semibold text-white'
                  : 'rounded-full border border-[var(--hairline)] bg-white px-3 py-0.5 text-[11.5px] font-semibold text-[var(--ink-2)] hover:border-[var(--rose-deep)]'
              }
            >
              {s.name}
            </button>
            {deletable && onDelete && (
              <button
                type="button"
                aria-label={`Delete ${s.name}`}
                data-testid={`scenario-delete-${s.id}`}
                onClick={() => onDelete(s.id)}
                className="grid h-5 w-5 place-items-center rounded-full text-[var(--muted)] hover:bg-[var(--surface-sunken)] hover:text-[var(--red,#9a3232)]"
              >
                <Trash2 size={11} />
              </button>
            )}
          </span>
        );
      })}
    </div>
  );
}
