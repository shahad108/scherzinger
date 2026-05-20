// Phase 5 — Scenario builder drawer.
//
// Form-based, NO SLIDERS. Typed inputs only — each input has labelled
// number field, unit, range hint, and an "anchor to live market" toggle
// (when toggled, the field is auto-filled from the current market series
// value, currently the seed median).

import { X, Plus } from 'lucide-react';
import { useState } from 'react';
import { useCreateScenario } from '@/data/api/useScenarios';
import type { ScenarioInput, ScenarioInputKind, ScenarioVisibility } from '@/types/forecast';

const PRESET_INPUTS: {
  name: string;
  kind: ScenarioInputKind;
  unit: string;
  hint: string;
  liveValue?: number;
}[] = [
  { name: 'Steel S355', kind: 'market_series', unit: '€/t · % shock', hint: '−20 to +20', liveValue: 1180 },
  { name: 'EUR/USD', kind: 'market_series', unit: 'FX · % shock', hint: '−10 to +10', liveValue: 1.08 },
  { name: 'Alloys', kind: 'market_series', unit: '€/t · % shock', hint: '−20 to +20', liveValue: 2840 },
  { name: 'Copper', kind: 'market_series', unit: '€/t · % shock', hint: '−20 to +20', liveValue: 8420 },
  { name: 'Demand growth', kind: 'internal_lever', unit: '% YoY', hint: '−15 to +15', liveValue: 3.4 },
  { name: 'List-price uplift', kind: 'internal_lever', unit: '% absolute', hint: '0 to +15' },
  { name: 'Pass-through %', kind: 'internal_lever', unit: '%', hint: '0 to 100' },
];

interface Props {
  open: boolean;
  onClose: () => void;
}

export function ScenarioBuilder({ open, onClose }: Props) {
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [visibility, setVisibility] = useState<ScenarioVisibility>('private');
  const [inputs, setInputs] = useState<ScenarioInput[]>([]);
  const create = useCreateScenario();

  if (!open) return null;

  const addInput = (preset: (typeof PRESET_INPUTS)[number]) => {
    if (inputs.some((i) => i.name === preset.name)) return;
    setInputs((prev) => [
      ...prev,
      {
        name: preset.name,
        kind: preset.kind,
        unit: preset.unit,
        perturbation: { type: 'pct', value: 0 },
      },
    ]);
  };

  const updateValue = (idx: number, value: number) => {
    setInputs((prev) =>
      prev.map((i, j) => (j === idx ? { ...i, perturbation: { ...i.perturbation, value } } : i)),
    );
  };

  const updateType = (idx: number, type: 'pct' | 'absolute') => {
    setInputs((prev) =>
      prev.map((i, j) => (j === idx ? { ...i, perturbation: { ...i.perturbation, type } } : i)),
    );
  };

  const removeInput = (idx: number) => {
    setInputs((prev) => prev.filter((_, j) => j !== idx));
  };

  const handleSave = async () => {
    if (!name.trim()) return;
    await create.mutateAsync({
      name: name.trim(),
      description: description.trim() || undefined,
      inputs,
      visibility,
    });
    setName('');
    setDescription('');
    setInputs([]);
    onClose();
  };

  return (
    <div
      className="fixed inset-0 z-50 flex justify-end"
      role="dialog"
      aria-modal="true"
      data-testid="scenario-builder"
    >
      <button
        type="button"
        aria-label="Dismiss"
        onClick={onClose}
        className="absolute inset-0 bg-black/30"
      />
      <aside className="relative ml-auto h-full w-full max-w-[520px] overflow-y-auto bg-white shadow-2xl">
        <header className="sticky top-0 flex items-start justify-between border-b border-[var(--border)] bg-white px-5 py-4">
          <div>
            <div className="text-[10.5px] font-semibold uppercase tracking-wide text-[var(--muted)]">
              Scenario builder
            </div>
            <h2 className="font-display text-[18px] font-bold tracking-tight text-[var(--ink)]">
              New scenario
            </h2>
          </div>
          <button
            type="button"
            aria-label="Close"
            onClick={onClose}
            className="grid h-8 w-8 place-items-center rounded-md text-[var(--muted)] hover:bg-[var(--surface-sunken)]"
          >
            <X size={16} />
          </button>
        </header>

        <div className="p-5 space-y-5">
          <label className="block">
            <span className="text-[11px] font-semibold uppercase tracking-wide text-[var(--muted)]">
              Scenario name
            </span>
            <input
              data-testid="scenario-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              maxLength={120}
              placeholder="e.g. Q4 hard-landing"
              className="mt-1 w-full rounded-md border border-[var(--hairline)] bg-white px-3 py-2 text-[13px] focus:outline-none focus:ring-2 focus:ring-[var(--rose-deep)]"
            />
          </label>

          <label className="block">
            <span className="text-[11px] font-semibold uppercase tracking-wide text-[var(--muted)]">
              Description (optional)
            </span>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              maxLength={500}
              rows={2}
              className="mt-1 w-full rounded-md border border-[var(--hairline)] bg-white px-3 py-2 text-[12.5px] focus:outline-none focus:ring-2 focus:ring-[var(--rose-deep)]"
            />
          </label>

          <section>
            <div className="mb-2 flex items-center justify-between">
              <h3 className="text-[12px] font-semibold uppercase tracking-wide text-[var(--muted)]">
                Inputs
              </h3>
              <span className="text-[10.5px] text-[var(--muted)]">No sliders — typed values only.</span>
            </div>
            <div className="flex flex-wrap gap-1">
              {PRESET_INPUTS.map((p) => {
                const already = inputs.some((i) => i.name === p.name);
                return (
                  <button
                    key={p.name}
                    type="button"
                    onClick={() => addInput(p)}
                    disabled={already}
                    className={
                      already
                        ? 'tag-chip opacity-60 cursor-not-allowed'
                        : 'tag-chip hover:bg-[var(--rose-bg)] hover:text-[var(--rose-deep)] cursor-pointer'
                    }
                  >
                    <Plus size={10} className="inline mr-1" /> {p.name}
                  </button>
                );
              })}
            </div>
            <ul className="mt-3 space-y-2">
              {inputs.map((inp, idx) => {
                const preset = PRESET_INPUTS.find((p) => p.name === inp.name);
                return (
                  <li key={inp.name} className="rounded-md border border-[var(--hairline)] bg-[var(--surface-soft)] p-3">
                    <div className="flex items-center justify-between">
                      <b className="text-[13px]">{inp.name}</b>
                      <button
                        type="button"
                        onClick={() => removeInput(idx)}
                        aria-label={`Remove ${inp.name}`}
                        className="text-[11px] text-[var(--muted)] hover:text-[var(--red,#9a3232)]"
                      >
                        Remove
                      </button>
                    </div>
                    <div className="mt-2 grid grid-cols-[1fr_120px] gap-2 items-center">
                      <input
                        type="number"
                        data-testid={`scenario-value-${inp.name}`}
                        value={inp.perturbation.value}
                        onChange={(e) => updateValue(idx, Number(e.target.value))}
                        step="0.5"
                        className="w-full rounded-md border border-[var(--hairline)] bg-white px-2 py-1 text-[13px] tabular-nums focus:outline-none focus:ring-2 focus:ring-[var(--rose-deep)]"
                      />
                      <select
                        value={inp.perturbation.type}
                        onChange={(e) => updateType(idx, e.target.value as 'pct' | 'absolute')}
                        className="rounded-md border border-[var(--hairline)] bg-white px-2 py-1 text-[12px] font-semibold focus:outline-none focus:ring-2 focus:ring-[var(--rose-deep)]"
                      >
                        <option value="pct">% shock</option>
                        <option value="absolute">absolute</option>
                      </select>
                    </div>
                    <div className="mt-1 flex items-center justify-between text-[11px] text-[var(--muted)]">
                      <span>{inp.unit || preset?.unit}</span>
                      <span>Range hint: {preset?.hint ?? '—'}</span>
                    </div>
                    {preset?.liveValue !== undefined && (
                      <div className="mt-1 text-[11px] text-[var(--muted)]">
                        Live market value: <b>{preset.liveValue}</b>
                      </div>
                    )}
                  </li>
                );
              })}
              {!inputs.length && (
                <li className="text-[11.5px] italic text-[var(--muted)]">
                  Tap a preset above to start. Inputs are typed values — no sliders.
                </li>
              )}
            </ul>
          </section>

          <section className="flex items-center gap-2">
            <span className="text-[11px] font-semibold uppercase tracking-wide text-[var(--muted)]">
              Visibility
            </span>
            <div className="inline-flex items-center gap-1 rounded-full bg-white p-1 shadow-[inset_0_0_0_1px_var(--hairline)]">
              {(['private', 'team'] as const).map((v) => (
                <button
                  key={v}
                  type="button"
                  data-testid={`scenario-visibility-${v}`}
                  aria-selected={visibility === v}
                  onClick={() => setVisibility(v)}
                  className={
                    visibility === v
                      ? 'rounded-full bg-[var(--rose-bg)] px-3 py-0.5 text-[11.5px] font-semibold text-[var(--rose-deep)]'
                      : 'rounded-full px-3 py-0.5 text-[11.5px] font-semibold text-[var(--muted)] hover:bg-[var(--surface-soft)]'
                  }
                >
                  {v}
                </button>
              ))}
            </div>
          </section>
        </div>

        <footer className="sticky bottom-0 flex items-center justify-end gap-2 border-t border-[var(--border)] bg-white px-5 py-3">
          <button
            type="button"
            onClick={onClose}
            className="rounded-md border border-[var(--hairline)] bg-white px-3 py-1.5 text-[12.5px] font-semibold text-[var(--ink-2)] hover:bg-[var(--surface-soft)]"
          >
            Cancel
          </button>
          <button
            type="button"
            data-testid="scenario-save"
            onClick={handleSave}
            disabled={!name.trim() || create.isPending}
            className="rounded-md bg-[var(--rose-deep)] px-3 py-1.5 text-[12.5px] font-semibold text-white hover:bg-[var(--rose-deep)]/90 disabled:opacity-50"
          >
            {create.isPending ? 'Saving…' : 'Save scenario'}
          </button>
        </footer>
      </aside>
    </div>
  );
}
