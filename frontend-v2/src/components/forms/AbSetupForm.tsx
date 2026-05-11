import { useState } from 'react';
import { runAction, type ActionResponse } from '@/data/api/useActions';
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
  const [result, setResult] = useState<ActionResponse | null>(null);

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
      const response = await runAction('start_ab_test', {
        target_type: 'ab_test',
        target_id: aid,
        aid,
        recommendation_id: context.recommendationId,
        cluster: context.cluster,
        source_kind: context.sourceKind,
        slice_pct: slice / 100,
        control_price: ctrl,
        treatment_price: treat,
        duration_days: duration,
        success_metric: metric,
        after: {
          headline: context.headline ?? `A/B ${aid} — ${ctrl.toFixed(2)}→${treat.toFixed(2)}`,
          duration_days: duration,
          success_metric: metric,
        },
      });
      qc.invalidateQueries({ queryKey: qk.actionCenter() });
      qc.invalidateQueries({ queryKey: qk.studio() });
      qc.invalidateQueries({ queryKey: qk.auditTrail('30d') });
      const blocked = response.launch_readiness === 'blocked';
      onToast(
        blocked
          ? `A/B test recorded for ${aid} — pre-launch checks blocked.`
          : `A/B test started for ${aid}.`,
        blocked ? 'warning' : 'success',
      );
      // Phase 7 — show the audit-trail end-to-end confirmation panel
      // instead of closing the drawer; Frank needs receipts (audit hash,
      // test id, simulation outcome) to defend the test in front of Till.
      setResult(response);
      setSubmitting(false);
    } catch (err) {
      setError((err as Error).message);
      setSubmitting(false);
    }
  }

  if (result) {
    return <AbTestStartedReceipt result={result} aid={aid} onClose={onClose} />;
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

function AbTestStartedReceipt({
  result,
  aid,
  onClose,
}: {
  result: ActionResponse;
  aid: string;
  onClose: () => void;
}) {
  const blocked = result.launch_readiness === 'blocked';
  const blockers = result.blockers ?? result.simulation_summary?.blockers ?? [];
  const auditHash = result.audit.audit_hash;
  const auditId = result.audit.id;
  const createdAt = result.audit.created_at
    ? new Date(result.audit.created_at).toLocaleString()
    : '—';

  return (
    <div className="flex h-full flex-col p-6 pt-14" data-testid="ab-receipt">
      <div className="flex items-center gap-2">
        <span
          aria-hidden
          className="inline-flex h-6 w-6 items-center justify-center rounded-full text-[12px] font-bold text-white"
          style={{ background: blocked ? 'var(--amber)' : 'var(--green)' }}
        >
          {blocked ? '!' : '✓'}
        </span>
        <h2 className="font-display text-xl font-bold tracking-tight text-[var(--ink)]">
          {blocked ? 'A/B test recorded — blocked' : 'A/B test started'}
        </h2>
      </div>
      <p className="mt-2 text-sm leading-relaxed text-[var(--muted)]">
        {blocked
          ? `The audit row is on file, but pre-launch checks blocked the slice for ${aid}. Resolve the blockers below and resubmit.`
          : `Slice running for ${aid}. The audit row below is the receipt — share the hash with Till if asked.`}
      </p>

      <dl className="mt-5 grid grid-cols-[120px_minmax(0,1fr)] gap-x-3 gap-y-2 rounded-xl border border-[var(--hairline)] bg-[var(--surface-soft)] p-3 text-[12.5px]">
        <dt className="text-[10.5px] font-semibold uppercase tracking-wide text-[var(--muted)]">Audit hash</dt>
        <dd
          className="font-mono text-[11.5px] text-[var(--ink-2)] break-all"
          data-testid="audit-hash"
        >
          {auditHash}
        </dd>
        <dt className="text-[10.5px] font-semibold uppercase tracking-wide text-[var(--muted)]">Audit id</dt>
        <dd className="font-mono text-[11.5px] text-[var(--ink-2)] break-all">{auditId}</dd>
        <dt className="text-[10.5px] font-semibold uppercase tracking-wide text-[var(--muted)]">Created</dt>
        <dd className="text-[var(--ink-2)]">{createdAt}</dd>
        {result.ab_test_id && (
          <>
            <dt className="text-[10.5px] font-semibold uppercase tracking-wide text-[var(--muted)]">A/B test id</dt>
            <dd className="font-mono text-[11.5px] text-[var(--ink-2)] break-all" data-testid="ab-test-id">
              {result.ab_test_id}
            </dd>
          </>
        )}
        {result.status && (
          <>
            <dt className="text-[10.5px] font-semibold uppercase tracking-wide text-[var(--muted)]">Status</dt>
            <dd className="text-[var(--ink-2)]">
              {result.status}
              {result.decision_state && result.decision_state !== result.status && (
                <span className="ml-1 text-[var(--muted)]">· {result.decision_state}</span>
              )}
            </dd>
          </>
        )}
        {result.simulation_summary?.detected_lift_pp != null && (
          <>
            <dt className="text-[10.5px] font-semibold uppercase tracking-wide text-[var(--muted)]">Δ vs control</dt>
            <dd className="tabular-nums text-[var(--ink-2)]">
              {result.simulation_summary.detected_lift_pp >= 0 ? '+' : ''}
              {result.simulation_summary.detected_lift_pp.toFixed(1)}pp
            </dd>
          </>
        )}
      </dl>

      <div className="mt-5">
        <div className="text-[10.5px] font-semibold uppercase tracking-wide text-[var(--muted)]">
          Pre-launch simulation
        </div>
        {blockers.length > 0 ? (
          <ul className="mt-1.5 space-y-1.5 rounded-lg border border-[var(--amber-border,#FDE68A)] bg-[var(--amber-bg,#FEF3C7)] p-3 text-[12.5px] leading-snug text-[var(--ink-2)]">
            {blockers.map((b, i) => (
              <li key={i} className="flex items-start gap-2">
                <span aria-hidden className="mt-[3px] inline-block h-1.5 w-1.5 rounded-full bg-[var(--amber,#92400E)]" />
                <span>{b}</span>
              </li>
            ))}
          </ul>
        ) : (
          <div className="mt-1.5 rounded-lg border border-[var(--green-border,#BBF7D0)] bg-[var(--green-bg,#DCFCE7)] p-3 text-[12.5px] text-[var(--ink-2)]">
            ✓ All pre-launch checks passed. Treatment is live for the configured slice.
          </div>
        )}
      </div>

      <button
        type="button"
        className="mt-auto rounded-lg bg-[var(--ink)] px-4 py-2.5 text-sm font-semibold text-white hover:bg-black"
        onClick={onClose}
      >
        Done
      </button>
    </div>
  );
}
