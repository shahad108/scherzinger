import { useState } from 'react';
import { runAction } from '@/data/api/useActions';
import { useQueryClient } from '@tanstack/react-query';
import { qk } from '@/lib/api/queryKeys';
import type { ActionDrawerContext } from '@/types/uiActions';
import { FormDrawerShell, FieldLabel, HelpText } from './FormDrawerShell';

interface Props {
  context: ActionDrawerContext;
  onClose: () => void;
  onToast: (message: string, severity?: 'info' | 'success' | 'warning' | 'error') => void;
}

const SUCCESS_METRICS = [
  { value: 'margin_lift_pp', label: 'Margin lift (pp) — primary' },
  { value: 'revenue_per_quote', label: 'Revenue per quote' },
  { value: 'win_rate', label: 'Win rate' },
] as const;

export function AbSetupForm({ context, onClose, onToast }: Props) {
  const qc = useQueryClient();
  const aid = context.articleId ?? '';
  const cur = context.currentPrice ?? 0;
  const tgt = context.targetPrice ?? cur * 1.05;

  const [controlPrice, setControlPrice] = useState(cur > 0 ? cur.toFixed(2) : '');
  const [treatmentPrice, setTreatmentPrice] = useState(tgt > 0 ? tgt.toFixed(2) : '');
  const [slicePct, setSlicePct] = useState('10');
  const [durationDays, setDurationDays] = useState('21');
  const [metric, setMetric] = useState<string>(SUCCESS_METRICS[0].value);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const ctrl = parseFloat(controlPrice);
  const treat = parseFloat(treatmentPrice);
  const slice = parseFloat(slicePct);
  const duration = parseInt(durationDays, 10);
  const liftPp = Number.isFinite(ctrl) && ctrl > 0 ? ((treat - ctrl) / ctrl) * 100 : null;

  const validationError = !aid
    ? 'Article id is required to start an A/B test — open this from a SKU or recommendation.'
    : !Number.isFinite(ctrl) || ctrl <= 0
      ? 'Enter a numeric control price.'
      : !Number.isFinite(treat) || treat <= 0
        ? 'Enter a numeric treatment price.'
        : !Number.isFinite(slice) || slice <= 0 || slice > 50
          ? 'Slice must be between 1% and 50%.'
          : !Number.isFinite(duration) || duration < 7 || duration > 90
            ? 'Duration must be 7–90 days.'
            : null;

  async function submit() {
    setError(null);
    setSubmitting(true);
    try {
      await runAction('start_ab_test', {
        target_type: 'ab_test',
        target_id: aid,
        aid,
        recommendation_id: context.recommendationId,
        cluster: context.cluster,
        source_kind: context.sourceKind,
        slice_pct: slice / 100,
        control_price: ctrl,
        treatment_price: treat,
        after: {
          headline: context.headline ?? `A/B ${aid} — ${ctrl.toFixed(2)}→${treat.toFixed(2)}`,
          duration_days: duration,
          success_metric: metric,
        },
      });
      onToast(`A/B test started for ${aid}.`, 'success');
      qc.invalidateQueries({ queryKey: qk.actionCenter() });
      qc.invalidateQueries({ queryKey: qk.studio() });
      onClose();
    } catch (err) {
      setError((err as Error).message);
      setSubmitting(false);
    }
  }

  return (
    <FormDrawerShell
      title="Start A/B test"
      description={`Slice a measured price test for ${aid || 'this SKU'}. Audit + ab_tests row are created on submit; the experiment timeline is observable in Pricing Studio.`}
      submitLabel="Start test"
      submitting={submitting}
      error={error ?? validationError}
      disabled={Boolean(validationError)}
      onSubmit={submit}
      onCancel={onClose}
    >
      <div className="space-y-4">
        <div className="rounded-lg border border-[var(--hairline)] bg-[var(--surface-soft)] p-3 text-[12.5px] text-[var(--ink-2)]">
          <div className="text-[10.5px] font-semibold uppercase tracking-wide text-[var(--muted)]">
            Article
          </div>
          <div className="mt-0.5 font-semibold text-[var(--ink)]">{aid || '— missing —'}</div>
          {context.cluster && <HelpText>cluster {context.cluster}</HelpText>}
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <FieldLabel>Control price (€)</FieldLabel>
            <input
              type="number"
              min={0}
              step={0.01}
              value={controlPrice}
              onChange={(e) => setControlPrice(e.target.value)}
              className="w-full rounded-lg border border-[var(--hairline)] bg-white px-3 py-2 text-sm tabular-nums focus:border-[var(--ink-2)] focus:outline-none"
            />
          </div>
          <div>
            <FieldLabel>Treatment price (€)</FieldLabel>
            <input
              type="number"
              min={0}
              step={0.01}
              value={treatmentPrice}
              onChange={(e) => setTreatmentPrice(e.target.value)}
              className="w-full rounded-lg border border-[var(--hairline)] bg-white px-3 py-2 text-sm tabular-nums focus:border-[var(--ink-2)] focus:outline-none"
            />
            {liftPp != null && Number.isFinite(liftPp) && (
              <HelpText>
                Δ {liftPp >= 0 ? '+' : ''}
                {liftPp.toFixed(1)}% vs control
              </HelpText>
            )}
          </div>
          <div>
            <FieldLabel>Slice (%)</FieldLabel>
            <input
              type="number"
              min={1}
              max={50}
              step={1}
              value={slicePct}
              onChange={(e) => setSlicePct(e.target.value)}
              className="w-full rounded-lg border border-[var(--hairline)] bg-white px-3 py-2 text-sm tabular-nums focus:border-[var(--ink-2)] focus:outline-none"
            />
            <HelpText>Share of customers receiving the treatment price (≤ 50%).</HelpText>
          </div>
          <div>
            <FieldLabel>Duration (days)</FieldLabel>
            <input
              type="number"
              min={7}
              max={90}
              step={1}
              value={durationDays}
              onChange={(e) => setDurationDays(e.target.value)}
              className="w-full rounded-lg border border-[var(--hairline)] bg-white px-3 py-2 text-sm tabular-nums focus:border-[var(--ink-2)] focus:outline-none"
            />
          </div>
        </div>

        <div>
          <FieldLabel>Success metric</FieldLabel>
          <select
            value={metric}
            onChange={(e) => setMetric(e.target.value)}
            className="w-full rounded-lg border border-[var(--hairline)] bg-white px-3 py-2 text-sm focus:border-[var(--ink-2)] focus:outline-none"
          >
            {SUCCESS_METRICS.map((m) => (
              <option key={m.value} value={m.value}>
                {m.label}
              </option>
            ))}
          </select>
        </div>
      </div>
    </FormDrawerShell>
  );
}
