import { useState } from 'react';
import { runAction } from '@/data/api/useActions';
import { useQueryClient } from '@tanstack/react-query';
import { qk } from '@/lib/api/queryKeys';
import type { ActionDrawerContext } from '@/types/uiActions';
import { FormDrawerShell, FieldLabel } from './FormDrawerShell';

interface Props {
  context: ActionDrawerContext;
  onClose: () => void;
  onToast: (message: string, severity?: 'info' | 'success' | 'warning' | 'error') => void;
}

const PRESETS = [
  { label: '1 week', days: 7 },
  { label: '2 weeks', days: 14 },
  { label: '1 month', days: 30 },
  { label: 'Next quarter', days: 90 },
] as const;

function isoDateInDays(days: number): string {
  const d = new Date();
  d.setDate(d.getDate() + days);
  return d.toISOString().slice(0, 10);
}

export function SnoozeForm({ context, onClose, onToast }: Props) {
  const qc = useQueryClient();
  const [until, setUntil] = useState(isoDateInDays(14));
  const [reason, setReason] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const today = new Date().toISOString().slice(0, 10);
  const validationError =
    until <= today
      ? 'Snooze must be a future date.'
      : reason.trim().length < 4
        ? 'Reason is required (≥ 4 characters).'
        : null;

  async function submit() {
    setError(null);
    setSubmitting(true);
    try {
      await runAction('snooze_recommendation', {
        target_type: 'recommendation',
        target_id: context.recommendationId,
        recommendation_id: context.recommendationId,
        article_id: context.articleId,
        cluster: context.cluster,
        source_kind: context.sourceKind,
        after: {
          headline: context.headline ?? context.recommendationId ?? 'snoozed',
          snooze_until: until,
          reason: reason.trim(),
        },
      });
      onToast(`Snoozed until ${until}.`, 'success');
      qc.invalidateQueries({ queryKey: qk.actionCenter() });
      onClose();
    } catch (err) {
      setError((err as Error).message);
      setSubmitting(false);
    }
  }

  return (
    <FormDrawerShell
      title="Snooze recommendation"
      description="Hide this recommendation from the queue until the chosen date. The audit row records who snoozed and why."
      submitLabel="Snooze"
      submitting={submitting}
      error={error ?? validationError}
      disabled={Boolean(validationError)}
      onSubmit={submit}
      onCancel={onClose}
    >
      <div className="space-y-4">
        {context.headline && (
          <div className="rounded-lg border border-[var(--hairline)] bg-[var(--surface-soft)] p-3 text-[12.5px] text-[var(--ink-2)]">
            <div className="text-[10.5px] font-semibold uppercase tracking-wide text-[var(--muted)]">
              Recommendation
            </div>
            <div className="mt-0.5 font-semibold text-[var(--ink)]">{context.headline}</div>
          </div>
        )}

        <div>
          <FieldLabel>Snooze until</FieldLabel>
          <input
            type="date"
            min={today}
            value={until}
            onChange={(e) => setUntil(e.target.value)}
            className="w-full rounded-lg border border-[var(--hairline)] bg-white px-3 py-2 text-sm focus:border-[var(--ink-2)] focus:outline-none"
          />
          <div className="mt-2 flex flex-wrap gap-1.5">
            {PRESETS.map((p) => (
              <button
                key={p.label}
                type="button"
                onClick={() => setUntil(isoDateInDays(p.days))}
                className="rounded-full border border-[var(--hairline)] bg-white px-3 py-1 text-[11.5px] font-semibold text-[var(--ink-2)] hover:bg-[var(--surface-soft)]"
              >
                {p.label}
              </button>
            ))}
          </div>
        </div>

        <div>
          <FieldLabel>Reason</FieldLabel>
          <textarea
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            rows={4}
            className="w-full rounded-lg border border-[var(--hairline)] bg-white px-3 py-2 text-sm leading-relaxed focus:border-[var(--ink-2)] focus:outline-none"
            placeholder="e.g. waiting on Q3 cost data; revisit after BAFA filing."
          />
        </div>
      </div>
    </FormDrawerShell>
  );
}
