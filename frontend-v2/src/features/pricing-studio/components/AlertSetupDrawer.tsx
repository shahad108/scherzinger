// Pricing Studio v3 / Phase 9 (§9.3) — Alert setup drawer.
//
// 420px right-rail drawer for creating a new alert. The trigger kind is
// pre-filled by the caller (e.g. cost_threshold from a cost tile, churn
// from a customer chip). Trigger-specific fields adapt to the kind;
// scope toggles between "this SKU / this cluster / custom JSON"; notify
// channels default to in_app.
//
// Per the design contract: decimals stay strings on the wire. The form
// keeps numeric state internally then serializes via toString() before
// POSTing so we never lose precision.

import { useCallback, useEffect, useMemo, useState } from 'react';
import { Drawer } from '@/components/ui/Drawer';
import {
  useCreateAlert,
  type AlertChannel,
  type AlertKind,
  type AlertScopeInput,
  type AlertSpec,
} from '@/data/api/usePricingAlerts';

type ScopeMode = 'sku' | 'cluster' | 'custom';

export interface AlertInitialSpec {
  pct?: number;
  pp?: number;
  days?: number;
  count?: number;
}

export interface AlertSetupDrawerProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  triggerKind: AlertKind;
  scope?: AlertScopeInput;
  initialSpec?: AlertInitialSpec;
}

const KIND_LABEL: Record<AlertKind, string> = {
  cost_threshold: 'cost moves',
  competitor_undercut: 'competitor undercuts',
  churn_spike: 'churn rises',
  floor_cross: 'price crosses floor',
  proposal_stuck: 'proposal stuck',
  pa_pr_surge: 'PA/PR surge',
  cluster_db2_drop: 'cluster DB2 drops',
};

function defaultsFor(kind: AlertKind): AlertInitialSpec {
  switch (kind) {
    case 'cost_threshold':
      return { pct: 5, days: 30 };
    case 'competitor_undercut':
      return { pct: 3 };
    case 'churn_spike':
      return { pp: 10 };
    case 'proposal_stuck':
      return { days: 7 };
    case 'pa_pr_surge':
      return { count: 5, days: 14 };
    case 'cluster_db2_drop':
      return { pp: 2 };
    case 'floor_cross':
    default:
      return {};
  }
}

export function AlertSetupDrawer({
  open,
  onOpenChange,
  triggerKind,
  scope,
  initialSpec,
}: AlertSetupDrawerProps) {
  const merged = useMemo(
    () => ({ ...defaultsFor(triggerKind), ...initialSpec }),
    [triggerKind, initialSpec],
  );

  const [kind, setKind] = useState<AlertKind>(triggerKind);
  const [pct, setPct] = useState<number>(merged.pct ?? 0);
  const [pp, setPp] = useState<number>(merged.pp ?? 0);
  const [days, setDays] = useState<number>(merged.days ?? 0);
  const [count, setCount] = useState<number>(merged.count ?? 0);

  const [scopeMode, setScopeMode] = useState<ScopeMode>(scope?.aid ? 'sku' : 'cluster');
  const [customJson, setCustomJson] = useState<string>('');
  const [advanced, setAdvanced] = useState(false);

  const [channels, setChannels] = useState<AlertChannel[]>(['in_app']);
  const [error, setError] = useState<string | null>(null);

  const mutation = useCreateAlert();

  // Re-seed state whenever the drawer opens with a new trigger kind. We
  // don't reset when the drawer closes — keep the last form so reopening
  // by mistake doesn't lose the user's input.
  useEffect(() => {
    if (!open) return;
    setKind(triggerKind);
    const d = { ...defaultsFor(triggerKind), ...initialSpec };
    setPct(d.pct ?? 0);
    setPp(d.pp ?? 0);
    setDays(d.days ?? 0);
    setCount(d.count ?? 0);
    setScopeMode(scope?.aid ? 'sku' : scope?.cluster ? 'cluster' : 'sku');
    setError(null);
  }, [open, triggerKind, initialSpec, scope?.aid, scope?.cluster]);

  const toggleChannel = useCallback((channel: AlertChannel) => {
    setChannels((prev) =>
      prev.includes(channel)
        ? prev.filter((c) => c !== channel)
        : [...prev, channel],
    );
  }, []);

  const buildSpec = useCallback((): AlertSpec | null => {
    // Scope envelope from the radio selection. "custom" forwards an
    // empty scope — the BFF accepts no-scope alerts only for cluster_*
    // and proposal_stuck kinds; the rest are validated server-side.
    const scopeEnvelope: AlertScopeInput =
      scopeMode === 'sku'
        ? { aid: scope?.aid ?? null }
        : scopeMode === 'cluster'
          ? { cluster: scope?.cluster ?? null, family: scope?.family ?? null }
          : {};

    const base = { ...scopeEnvelope, channels };

    switch (kind) {
      case 'cost_threshold':
        return { kind, ...base, pct: pct.toString(), days };
      case 'competitor_undercut':
        return { kind, ...base, pct: pct.toString() };
      case 'churn_spike':
        return { kind, ...base, pp: pp.toString() };
      case 'floor_cross':
        return { kind, ...base };
      case 'proposal_stuck':
        return { kind, ...base, days };
      case 'pa_pr_surge':
        return { kind, ...base, count, days };
      case 'cluster_db2_drop':
        return { kind, ...base, pp: pp.toString() };
    }
  }, [kind, scopeMode, scope, channels, pct, pp, days, count]);

  const handleSubmit = useCallback(async () => {
    setError(null);
    const spec = buildSpec();
    if (!spec) {
      setError('Could not build alert spec.');
      return;
    }
    if (scopeMode === 'custom' && advanced && customJson.trim()) {
      try {
        const parsed = JSON.parse(customJson) as Record<string, unknown>;
        Object.assign(spec, parsed);
      } catch (err) {
        setError(`Invalid custom JSON: ${(err as Error).message}`);
        return;
      }
    }
    try {
      await mutation.mutateAsync(spec);
      onOpenChange(false);
    } catch (err) {
      setError((err as Error).message);
    }
  }, [advanced, buildSpec, customJson, mutation, onOpenChange, scopeMode]);

  return (
    <Drawer open={open} onOpenChange={onOpenChange} width={560} title="New alert">
      <div
        className="flex h-full flex-col overflow-hidden p-5"
        data-testid="alert-setup-drawer"
      >
        <header className="mb-4 border-b border-[var(--hairline)] pb-3">
          <div className="text-[10.5px] font-semibold uppercase tracking-wide text-[var(--muted)]">
            New alert
          </div>
          <h2 className="font-display text-[16px] font-bold tracking-tight text-[var(--ink)]">
            {KIND_LABEL[kind]}
          </h2>
        </header>

        <form
          className="flex flex-1 flex-col gap-4 overflow-y-auto pr-1 text-[12.5px]"
          onSubmit={(e) => {
            e.preventDefault();
            void handleSubmit();
          }}
          data-testid="alert-setup-form"
        >
          {/* Trigger section ------------------------------------------------ */}
          <fieldset className="flex flex-col gap-2">
            <legend className="text-[11px] font-semibold uppercase tracking-wide text-[var(--muted)]">
              When
            </legend>
            <label className="flex items-center justify-between gap-3">
              <span className="text-[var(--ink-2)]">Trigger</span>
              <select
                data-testid="alert-kind-select"
                value={kind}
                onChange={(e) => setKind(e.target.value as AlertKind)}
                className="rounded-md border border-[var(--hairline)] bg-white px-2 py-1 text-[12px]"
              >
                {(Object.keys(KIND_LABEL) as AlertKind[]).map((k) => (
                  <option key={k} value={k}>
                    {KIND_LABEL[k]}
                  </option>
                ))}
              </select>
            </label>

            <KindFields
              kind={kind}
              pct={pct}
              setPct={setPct}
              pp={pp}
              setPp={setPp}
              days={days}
              setDays={setDays}
              count={count}
              setCount={setCount}
            />
          </fieldset>

          {/* Scope ---------------------------------------------------------- */}
          <fieldset className="flex flex-col gap-2">
            <legend className="text-[11px] font-semibold uppercase tracking-wide text-[var(--muted)]">
              Scope
            </legend>
            <label className="flex items-center gap-2">
              <input
                type="radio"
                name="alert-scope"
                value="sku"
                checked={scopeMode === 'sku'}
                onChange={() => setScopeMode('sku')}
                data-testid="alert-scope-sku"
              />
              <span>this SKU{scope?.aid ? ` (${scope.aid})` : ''}</span>
            </label>
            <label className="flex items-center gap-2">
              <input
                type="radio"
                name="alert-scope"
                value="cluster"
                checked={scopeMode === 'cluster'}
                onChange={() => setScopeMode('cluster')}
                data-testid="alert-scope-cluster"
              />
              <span>
                cluster{scope?.cluster ? ` (${scope.cluster})` : ''}
              </span>
            </label>
            <label className="flex items-center gap-2">
              <input
                type="radio"
                name="alert-scope"
                value="custom"
                checked={scopeMode === 'custom'}
                onChange={() => setScopeMode('custom')}
                data-testid="alert-scope-custom"
              />
              <span>custom rule</span>
            </label>
            {scopeMode === 'custom' && (
              <div className="flex flex-col gap-1.5 pl-5">
                <label className="flex items-center gap-2 text-[11px] text-[var(--muted)]">
                  <input
                    type="checkbox"
                    checked={advanced}
                    onChange={(e) => setAdvanced(e.target.checked)}
                    data-testid="alert-advanced-toggle"
                  />
                  Advanced (raw JSON-logic overlay)
                </label>
                {advanced && (
                  <textarea
                    data-testid="alert-custom-json"
                    value={customJson}
                    onChange={(e) => setCustomJson(e.target.value)}
                    placeholder='{"family": "MV"}'
                    rows={4}
                    className="rounded-md border border-[var(--hairline)] bg-[var(--surface-soft)] px-2 py-1 font-mono text-[11.5px]"
                  />
                )}
              </div>
            )}
          </fieldset>

          {/* Notify --------------------------------------------------------- */}
          <fieldset className="flex flex-col gap-2">
            <legend className="text-[11px] font-semibold uppercase tracking-wide text-[var(--muted)]">
              Notify
            </legend>
            <div className="flex flex-wrap gap-3">
              {(['in_app', 'email', 'slack'] as const).map((c) => (
                <label key={c} className="flex items-center gap-1.5">
                  <input
                    type="checkbox"
                    checked={channels.includes(c)}
                    onChange={() => toggleChannel(c)}
                    data-testid={`alert-channel-${c}`}
                  />
                  <span className="capitalize">{c.replace('_', '-')}</span>
                </label>
              ))}
            </div>
          </fieldset>

          {error && (
            <div
              className="rounded-md border border-[var(--rose-border)] bg-[var(--rose-bg)] p-2 text-[11.5px] text-[var(--rose-deep)]"
              data-testid="alert-setup-error"
            >
              {error}
            </div>
          )}
        </form>

        <footer className="mt-4 flex items-center justify-end gap-2 border-t border-[var(--hairline)] pt-3">
          <button
            type="button"
            onClick={() => onOpenChange(false)}
            className="rounded-md border border-[var(--hairline)] bg-white px-3 py-1.5 text-[12.5px] font-semibold text-[var(--ink-2)]"
            data-testid="alert-setup-cancel"
          >
            Cancel
          </button>
          <button
            type="button"
            disabled={mutation.isPending || channels.length === 0}
            onClick={() => void handleSubmit()}
            className="rounded-md bg-[var(--rose-deep)] px-3 py-1.5 text-[12.5px] font-semibold text-white disabled:opacity-50"
            data-testid="alert-setup-submit"
          >
            {mutation.isPending ? 'Creating…' : 'Create'}
          </button>
        </footer>
      </div>
    </Drawer>
  );
}

interface KindFieldsProps {
  kind: AlertKind;
  pct: number;
  setPct: (n: number) => void;
  pp: number;
  setPp: (n: number) => void;
  days: number;
  setDays: (n: number) => void;
  count: number;
  setCount: (n: number) => void;
}

function KindFields({
  kind,
  pct,
  setPct,
  pp,
  setPp,
  days,
  setDays,
  count,
  setCount,
}: KindFieldsProps) {
  if (kind === 'floor_cross') {
    return (
      <p className="rounded-md border border-[var(--hairline)] bg-[var(--surface-soft)] px-2 py-1.5 text-[11.5px] text-[var(--muted)]">
        Fires whenever the recommended price drops to or below the SKU floor.
      </p>
    );
  }
  if (kind === 'cost_threshold') {
    return (
      <>
        <RowNumber
          label="Pct"
          unit="%"
          testId="alert-field-pct"
          value={pct}
          onChange={setPct}
          step={0.1}
        />
        <RowNumber
          label="Over"
          unit="days"
          testId="alert-field-days"
          value={days}
          onChange={setDays}
        />
      </>
    );
  }
  if (kind === 'competitor_undercut') {
    return (
      <RowNumber
        label="Pct"
        unit="%"
        testId="alert-field-pct"
        value={pct}
        onChange={setPct}
        step={0.1}
      />
    );
  }
  if (kind === 'churn_spike' || kind === 'cluster_db2_drop') {
    return (
      <RowNumber
        label={kind === 'churn_spike' ? 'Rise' : 'Drop'}
        unit="pp"
        testId="alert-field-pp"
        value={pp}
        onChange={setPp}
        step={0.1}
      />
    );
  }
  if (kind === 'proposal_stuck') {
    return (
      <RowNumber
        label="Days"
        unit="days"
        testId="alert-field-days"
        value={days}
        onChange={setDays}
      />
    );
  }
  if (kind === 'pa_pr_surge') {
    return (
      <>
        <RowNumber
          label="Count"
          unit="rejections"
          testId="alert-field-count"
          value={count}
          onChange={setCount}
        />
        <RowNumber
          label="Over"
          unit="days"
          testId="alert-field-days"
          value={days}
          onChange={setDays}
        />
      </>
    );
  }
  return null;
}

interface RowNumberProps {
  label: string;
  unit: string;
  testId: string;
  value: number;
  onChange: (n: number) => void;
  step?: number;
}

function RowNumber({ label, unit, testId, value, onChange, step = 1 }: RowNumberProps) {
  return (
    <label className="flex items-center justify-between gap-3">
      <span className="text-[var(--ink-2)]">{label}</span>
      <span className="inline-flex items-center gap-1.5">
        <input
          type="number"
          data-testid={testId}
          value={value}
          step={step}
          onChange={(e) => onChange(Number(e.target.value))}
          className="w-24 rounded-md border border-[var(--hairline)] bg-white px-2 py-1 text-right tabular-nums"
        />
        <span className="text-[11px] text-[var(--muted)]">{unit}</span>
      </span>
    </label>
  );
}
