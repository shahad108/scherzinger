// Phase 5 — Scenario library strip.
//
// Three groups of chips (Base / My scenarios / Team-shared). Clicking a chip
// loads that scenario via ?scenario_id=. Shift-click toggles compare mode
// (up to 3 scenarios). Trash-icon deletes private scenarios.

import { useSearchParams } from 'react-router-dom';
import { useState } from 'react';
import { Trash2, GitCompareArrows } from 'lucide-react';
import { useDeleteScenario, useScenarios } from '@/data/api/useScenarios';
import type { ScenarioSummary } from '@/types/forecast';
import { ScenarioBuilder } from './ScenarioBuilder';
import { useCompareParam } from './ScenarioCompareView';

// v2.1 — pump-manufacturer-specific scenario presets. Five one-click
// scenarios for Frank's weekly review, eliminating the friction of
// composing driver multipliers in the ScenarioBuilder. Each preset writes
// `?scenario_id=preset:<key>` so the BFF picks it up the same way it does
// saved-scenario ids.
const SCENARIO_PRESETS: { key: string; label: string; desc: string }[] = [
  { key: 'preset:steel-spike', label: 'Steel S355 +20%', desc: 'Commodity stress · 60% pass-through' },
  { key: 'preset:list-uplift', label: '+3% list price', desc: 'Price action · 50% capture' },
  { key: 'preset:bkagg-churn', label: 'Lose top-3 BKAGG', desc: 'Concentration risk · churn shock' },
  { key: 'preset:recapture-pa', label: 'Win +5pp PA quotes', desc: 'p=0.003 finding · recapture' },
  { key: 'preset:macro-recession', label: '−10% volume', desc: 'Industrial recession · macro' },
];

export function ScenarioLibrary() {
  const [params, setParams] = useSearchParams();
  const { data, isLoading } = useScenarios();
  const deleteScenario = useDeleteScenario();
  const { ids: compareIds, toggle: toggleCompare } = useCompareParam();
  const [builderOpen, setBuilderOpen] = useState(false);
  const activeId = params.get('scenario_id');

  const setActive = (id: string | null) => {
    const p = new URLSearchParams(params);
    if (id) p.set('scenario_id', id);
    else p.delete('scenario_id');
    setParams(p, { replace: true });
  };

  const handleChipClick = (id: string, modifier: boolean) => {
    if (modifier) {
      toggleCompare(id);
      return;
    }
    setActive(id === activeId ? null : id);
  };

  return (
    <div
      className="mb-4 flex flex-wrap items-center gap-2 rounded-[14px] border border-dashed border-[var(--border)] bg-[var(--surface-soft)] px-3 py-2"
      data-testid="scenario-library"
    >
      <span className="text-[10.5px] font-semibold uppercase tracking-wide text-[var(--muted)]">
        Scenarios
      </span>
      {/* v2.1 — one-click presets row. */}
      <div data-testid="scenario-presets" className="flex flex-wrap items-center gap-1.5">
        <span className="text-[10.5px] font-semibold uppercase tracking-wide text-[var(--muted)]">Presets:</span>
        {SCENARIO_PRESETS.map((preset) => {
          const isActive = activeId === preset.key;
          return (
            <button
              key={preset.key}
              type="button"
              data-testid={`scenario-preset-${preset.key.replace(/[:_]/g, '-')}`}
              onClick={() => setActive(isActive ? null : preset.key)}
              title={preset.desc}
              className={`rounded-full border px-2.5 py-0.5 text-[11px] font-semibold transition ${
                isActive
                  ? 'border-[var(--rose-deep)] bg-[var(--rose-bg)] text-[var(--rose-deep)]'
                  : 'border-[var(--hairline)] bg-white text-[var(--ink-2)] hover:bg-[var(--surface-soft)]'
              }`}
            >
              {preset.label}
            </button>
          );
        })}
      </div>
      {isLoading && <span className="text-[11px] text-[var(--muted)]">Loading…</span>}
      {data && (
        <>
          <Group
            label="Base"
            scenarios={data.system}
            activeId={activeId}
            compareIds={compareIds}
            onClick={handleChipClick}
          />
          <Group
            label="My scenarios"
            scenarios={data.saved}
            activeId={activeId}
            compareIds={compareIds}
            onClick={handleChipClick}
            deletable
            onDelete={(id) => deleteScenario.mutate(id)}
          />
          <Group
            label="Team-shared"
            scenarios={data.teamShared}
            activeId={activeId}
            compareIds={compareIds}
            onClick={handleChipClick}
          />
        </>
      )}
      <span className="ml-auto inline-flex items-center gap-2">
        {compareIds.length > 0 && (
          <span className="inline-flex items-center gap-1 rounded-full bg-[var(--surface-sunken)] px-2.5 py-0.5 text-[11px] font-semibold text-[var(--ink-2)]">
            <GitCompareArrows size={11} /> compare {compareIds.length}/3
          </span>
        )}
        <button
          type="button"
          onClick={() => setBuilderOpen(true)}
          data-testid="scenario-add"
          className="rounded-full bg-[var(--rose-deep)] px-3 py-1 text-[11.5px] font-semibold text-white hover:bg-[var(--rose-deep)]/90"
        >
          + New scenario
        </button>
      </span>
      <ScenarioBuilder open={builderOpen} onClose={() => setBuilderOpen(false)} />
    </div>
  );
}

interface GroupProps {
  label: string;
  scenarios: ScenarioSummary[];
  activeId: string | null;
  compareIds: string[];
  onClick: (id: string, modifier: boolean) => void;
  deletable?: boolean;
  onDelete?: (id: string) => void;
}

function Group({ label, scenarios, activeId, compareIds, onClick, deletable, onDelete }: GroupProps) {
  if (!scenarios.length) return null;
  return (
    <div className="flex flex-wrap items-center gap-1">
      <span className="text-[10.5px] uppercase tracking-wide text-[var(--muted)]">{label}:</span>
      {scenarios.map((s) => {
        const isActive = s.id === activeId;
        const isCompared = compareIds.includes(s.id);
        const className = isActive
          ? 'rounded-full bg-[var(--rose-deep)] px-3 py-0.5 text-[11.5px] font-semibold text-white'
          : isCompared
            ? 'rounded-full bg-[var(--surface-sunken)] px-3 py-0.5 text-[11.5px] font-semibold text-[var(--ink-2)] ring-2 ring-[var(--rose-deep)]'
            : 'rounded-full border border-[var(--hairline)] bg-white px-3 py-0.5 text-[11.5px] font-semibold text-[var(--ink-2)] hover:border-[var(--rose-deep)]';
        return (
          <span key={s.id} className="inline-flex items-center gap-1">
            <button
              type="button"
              data-testid={`scenario-chip-${s.id}`}
              onClick={(e) => onClick(s.id, e.shiftKey || e.metaKey || e.ctrlKey)}
              title={
                (s.description ?? '') +
                ' — Shift-click to add to comparison view.'
              }
              className={className}
            >
              {s.name}
              {isCompared && <span className="ml-1 text-[10px]">⇄</span>}
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
