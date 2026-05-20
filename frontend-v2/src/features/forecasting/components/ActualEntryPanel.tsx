// ActualEntryPanel — Phase 4 (forecast redesign v2).
//
// Right-side fixed panel that opens when Frank clicks a forecast point on the
// HeroForecast chart. Captures the actual value + a structured override
// rationale (source, confidence, reason) and POSTs it via `useCreateOverride`
// (Phase 1). Surfaces an FVA guardrail warning when the adjustment is under
// 5% (see `useFVAGuardrail`).
//
// Accessibility: role="dialog", focus on first input on mount, ESC closes,
// reason textarea enforces a 10-char minimum (matches backend validation).
// Save buttons are disabled until the form is valid OR while the mutation is
// in flight, so the action is impossible to fire twice.

import { useState, useEffect, useRef } from 'react';
import { X } from 'lucide-react';
import { useCreateOverride } from '@/data/api/useForecastOverrides';
import { computeAdjustmentPct, fvaWarning } from '../hooks/useFVAGuardrail';
import type { ForecastMode, OverrideSource, OverrideConfidence } from '@/types/forecast';

interface Props {
  month: string;
  cluster: string | null;
  mode: ForecastMode;
  modelP50: number;
  band80: [number, number];
  band95: [number, number];
  onClose: () => void;
  onSaved?: () => void;
}

const MIN_REASON = 10;

export function ActualEntryPanel({
  month,
  cluster,
  mode,
  modelP50,
  band80,
  band95,
  onClose,
  onSaved,
}: Props) {
  const [actual, setActual] = useState<string>('');
  const [source, setSource] = useState<OverrideSource>('manual');
  const [confidence, setConfidence] = useState<OverrideConfidence>('medium');
  const [reason, setReason] = useState('');
  const [submitError, setSubmitError] = useState<string | null>(null);
  const createMut = useCreateOverride();
  const firstFieldRef = useRef<HTMLInputElement | null>(null);
  const panelRef = useRef<HTMLDivElement | null>(null);

  // Focus the first input on mount and restore the previously focused element
  // on unmount (dialog focus-restoration pattern).
  useEffect(() => {
    const previouslyFocused = document.activeElement as HTMLElement | null;
    firstFieldRef.current?.focus();
    return () => {
      // Restore focus only if the previously focused element is still attached.
      if (previouslyFocused && document.body.contains(previouslyFocused)) {
        try {
          previouslyFocused.focus();
        } catch {
          /* element no longer focusable — ignore */
        }
      }
    };
  }, []);

  // ESC closes the panel.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [onClose]);

  // Focus trap — cycle Tab/Shift-Tab at the boundaries so focus stays inside
  // the dialog (matches aria-modal="true" semantics).
  useEffect(() => {
    const node = panelRef.current;
    if (!node) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Tab') return;
      const focusables = node.querySelectorAll<HTMLElement>(
        'button, input, select, textarea, [href], [tabindex]:not([tabindex="-1"])',
      );
      const list = Array.from(focusables).filter(
        (el) => !el.hasAttribute('disabled') && el.tabIndex !== -1,
      );
      if (list.length === 0) return;
      const first = list[0];
      const last = list[list.length - 1];
      const active = document.activeElement as HTMLElement | null;
      if (e.shiftKey) {
        if (active === first || !node.contains(active)) {
          e.preventDefault();
          last.focus();
        }
      } else {
        if (active === last) {
          e.preventDefault();
          first.focus();
        }
      }
    };
    node.addEventListener('keydown', onKey);
    return () => node.removeEventListener('keydown', onKey);
  }, []);

  const parsed = Number(actual);
  const reasonOk = reason.trim().length >= MIN_REASON;
  const numberOk = actual.trim() !== '' && !Number.isNaN(parsed);
  const valid = numberOk && reasonOk;
  const adjPct = valid ? computeAdjustmentPct(parsed, modelP50) : 0;
  const warning = valid ? fvaWarning(adjPct) : null;

  const onSubmit = async (retrainNow = false) => {
    if (!valid) return;
    setSubmitError(null);
    try {
      await createMut.mutateAsync({
        month,
        cluster,
        mode,
        actual: parsed,
        modelP50,
        source,
        confidence,
        reason: reason.trim(),
      });
      onSaved?.();
      if (retrainNow) {
        // Backend integration ships in a follow-up phase. For now, broadcast a
        // window event so the page (or a future RetrainPill) can react.
        window.dispatchEvent(
          new CustomEvent('forecast:retrain-requested', { detail: { month, mode } }),
        );
      }
      setTimeout(onClose, 400);
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Save failed';
      setSubmitError(msg);
    }
  };

  return (
    <div
      ref={panelRef}
      role="dialog"
      aria-modal="true"
      aria-label="Enter actual value"
      data-testid="actual-entry-panel"
      className="fixed right-0 top-0 z-50 h-screen w-[420px] overflow-y-auto border-l border-[var(--hairline)] bg-white shadow-2xl"
    >
      <header className="sticky top-0 z-10 flex items-center justify-between border-b border-[var(--hairline)] bg-white p-4">
        <div>
          <div className="text-[10.5px] font-semibold uppercase tracking-wide text-[var(--muted)]">
            Month
          </div>
          <div className="font-display text-[16px] font-bold tracking-tight">
            {month}
            {cluster ? ` · ${cluster}` : ''}
          </div>
        </div>
        <button
          type="button"
          aria-label="Close panel"
          onClick={onClose}
          className="grid h-8 w-8 place-items-center rounded-md text-[var(--muted)] hover:bg-[var(--surface-soft)]"
        >
          <X size={16} />
        </button>
      </header>

      <section className="space-y-3 p-4 text-[13px]">
        <div className="rounded-[10px] border border-[var(--hairline)] bg-[var(--surface-soft)] p-3">
          <div className="text-[10.5px] font-semibold uppercase tracking-wide text-[var(--muted)]">
            Model forecast
          </div>
          <div className="mt-1 font-display text-[18px] font-bold tracking-tight">
            €{modelP50.toLocaleString()}
          </div>
          <div className="text-[11.5px] text-[var(--muted)]">
            80%: €{band80[0].toLocaleString()} – €{band80[1].toLocaleString()}
          </div>
          <div className="text-[11.5px] text-[var(--muted)]">
            95%: €{band95[0].toLocaleString()} – €{band95[1].toLocaleString()}
          </div>
        </div>

        <label className="block">
          <span className="block text-[11.5px] font-semibold text-[var(--ink-2)]">Actual (€)</span>
          <input
            ref={firstFieldRef}
            type="number"
            value={actual}
            onChange={(e) => setActual(e.target.value)}
            className="mt-1 block w-full rounded-md border border-[var(--hairline)] px-3 py-2 text-[14px]"
            data-testid="actual-input"
          />
        </label>

        <label className="block">
          <span className="block text-[11.5px] font-semibold text-[var(--ink-2)]">Source</span>
          <select
            value={source}
            onChange={(e) => setSource(e.target.value as OverrideSource)}
            className="mt-1 block w-full rounded-md border border-[var(--hairline)] px-3 py-2 text-[13px]"
          >
            <option value="manual">Manual reconciliation</option>
            <option value="erp">ERP feed</option>
            <option value="contracted">Contracted</option>
            <option value="other">Other</option>
          </select>
        </label>

        <div>
          <span className="block text-[11.5px] font-semibold text-[var(--ink-2)]">Confidence</span>
          <div
            role="radiogroup"
            aria-label="Confidence"
            className="mt-1 inline-flex rounded-full bg-[var(--surface-soft)] p-0.5 text-[12px]"
          >
            {(['low', 'medium', 'high'] as OverrideConfidence[]).map((c) => (
              <button
                key={c}
                type="button"
                role="radio"
                aria-checked={confidence === c}
                onClick={() => setConfidence(c)}
                className={
                  confidence === c
                    ? 'rounded-full bg-white px-3 py-1 font-semibold text-[var(--ink)] shadow-sm'
                    : 'px-3 py-1 text-[var(--muted)]'
                }
              >
                {c}
              </button>
            ))}
          </div>
        </div>

        <label className="block">
          <span className="block text-[11.5px] font-semibold text-[var(--ink-2)]">
            Reason (required, min {MIN_REASON} chars)
          </span>
          <textarea
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            rows={3}
            className="mt-1 block w-full rounded-md border border-[var(--hairline)] px-3 py-2 text-[13px]"
            data-testid="reason-input"
          />
          <span className="text-[10.5px] text-[var(--muted)]">
            {reason.trim().length}/{MIN_REASON}
          </span>
        </label>

        {warning && (
          <div
            data-testid="fva-warning"
            className="rounded-md border border-amber-200 bg-amber-50 p-3 text-[12px] text-amber-900"
          >
            {warning}
          </div>
        )}

        {valid && (
          <div className="rounded-md border border-[var(--hairline)] bg-[var(--surface-soft)] p-3 text-[12px] text-[var(--ink-2)]">
            Adjustment:{' '}
            <span className="font-semibold">{(adjPct * 100).toFixed(1)}%</span> vs model P50
          </div>
        )}

        {submitError && (
          <div
            role="alert"
            data-testid="actual-entry-error"
            className="rounded-md border border-red-200 bg-red-50 p-3 text-[12px] text-red-900"
          >
            Couldn’t save override: {submitError}
          </div>
        )}

        <div className="flex flex-wrap items-center gap-2 pt-2">
          <button
            type="button"
            disabled={!valid || createMut.isPending}
            onClick={() => onSubmit(false)}
            className="rounded-md bg-[var(--rose-deep,#a04055)] px-4 py-2 text-[13px] font-semibold text-white disabled:opacity-40"
          >
            {createMut.isPending ? 'Saving…' : 'Save actual'}
          </button>
          <button
            type="button"
            disabled={!valid || createMut.isPending}
            onClick={() => onSubmit(true)}
            className="rounded-md border border-[var(--hairline)] px-4 py-2 text-[13px] font-semibold text-[var(--ink-2)] disabled:opacity-40"
          >
            Save &amp; retrain now
          </button>
          <button
            type="button"
            onClick={onClose}
            className="ml-auto text-[12px] text-[var(--muted)] hover:text-[var(--ink-2)]"
          >
            Cancel
          </button>
        </div>
      </section>
    </div>
  );
}
