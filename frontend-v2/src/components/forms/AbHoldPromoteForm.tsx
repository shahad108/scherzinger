import { useState } from 'react';
import { runAction, type ActionKind } from '@/data/api/useActions';
import { useQueryClient } from '@tanstack/react-query';
import { qk } from '@/lib/api/queryKeys';
import type { ActionDrawerContext } from '@/types/uiActions';
import { FormDrawerShell, FieldLabel } from './FormDrawerShell';

interface Props {
  context: ActionDrawerContext;
  onClose: () => void;
  onToast: (message: string, severity?: 'info' | 'success' | 'warning' | 'error') => void;
  mode: 'hold' | 'promote';
}

const HOLD_REASONS = [
  'Insufficient sample size',
  'Suspected data-quality issue',
  'External market shock — pause for review',
  'Customer escalation',
  'Other (note required)',
];

export function AbHoldPromoteForm({ context, onClose, onToast, mode }: Props) {
  const qc = useQueryClient();
  const [reason, setReason] = useState(mode === 'hold' ? HOLD_REASONS[0] : '');
  const [note, setNote] = useState('');
  const [acceptApproval, setAcceptApproval] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const aid = context.articleId ?? context.abTestId ?? 'this test';

  const isOther = mode === 'hold' && reason === HOLD_REASONS[HOLD_REASONS.length - 1];
  const validationError =
    !context.abTestId
      ? 'A/B test id is required to update the experiment.'
      : mode === 'hold' && isOther && note.trim().length < 4
        ? 'Add a short note explaining the hold.'
        : mode === 'promote' && !acceptApproval
          ? 'You must acknowledge MD approval is required before promotion.'
          : null;

  async function submit() {
    setError(null);
    setSubmitting(true);
    const kind: ActionKind = mode === 'hold' ? 'hold_ab_test' : 'promote_ab_test';
    try {
      await runAction(kind, {
        target_type: 'ab_test',
        target_id: context.abTestId,
        ab_test_id: context.abTestId,
        test_id: context.abTestId,
        aid: context.articleId,
        after: {
          headline: context.headline ?? `${mode} A/B ${aid}`,
          reason: mode === 'hold' ? reason : undefined,
          note: note.trim() || null,
          approval_acknowledged: mode === 'promote' ? true : undefined,
        },
      });
      onToast(
        mode === 'hold'
          ? `A/B test ${aid} put on hold.`
          : `A/B test ${aid} promoted to rollout.`,
        mode === 'hold' ? 'warning' : 'success',
      );
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
      title={mode === 'hold' ? `Hold A/B test · ${aid}` : `Promote A/B test · ${aid}`}
      description={
        mode === 'hold'
          ? 'Pause the experiment without ending it. The test resumes from the same baseline when you release the hold.'
          : 'Promote the treatment price to full rollout. This stops the test, locks in the treatment, and queues a rollout proposal for MD approval.'
      }
      submitLabel={mode === 'hold' ? 'Put on hold' : 'Promote to rollout'}
      submitting={submitting}
      error={error ?? validationError}
      disabled={Boolean(validationError)}
      onSubmit={submit}
      onCancel={onClose}
    >
      <div className="space-y-4">
        {mode === 'hold' ? (
          <>
            <div>
              <FieldLabel>Hold reason</FieldLabel>
              <select
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                className="w-full rounded-lg border border-[var(--hairline)] bg-white px-3 py-2 text-sm focus:border-[var(--ink-2)] focus:outline-none"
              >
                {HOLD_REASONS.map((r) => (
                  <option key={r} value={r}>
                    {r}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <FieldLabel>{isOther ? 'Required note' : 'Note (optional)'}</FieldLabel>
              <textarea
                value={note}
                onChange={(e) => setNote(e.target.value)}
                rows={4}
                className="w-full rounded-lg border border-[var(--hairline)] bg-white px-3 py-2 text-sm leading-relaxed focus:border-[var(--ink-2)] focus:outline-none"
                placeholder={isOther ? 'Describe the hold reason for the audit row.' : 'Optional context.'}
              />
            </div>
          </>
        ) : (
          <>
            <div className="rounded-lg border border-[var(--amber)] bg-[color-mix(in_oklab,var(--amber)_8%,white)] p-3 text-[12.5px] text-[var(--ink-2)]">
              <div className="font-semibold text-[var(--ink)]">MD approval required</div>
              <p className="mt-1">
                Promoting the test creates a rollout proposal. Frank can stage the
                proposal but Till must approve it before the catalog price changes.
              </p>
            </div>
            <div>
              <FieldLabel>Promotion note (optional)</FieldLabel>
              <textarea
                value={note}
                onChange={(e) => setNote(e.target.value)}
                rows={4}
                className="w-full rounded-lg border border-[var(--hairline)] bg-white px-3 py-2 text-sm leading-relaxed focus:border-[var(--ink-2)] focus:outline-none"
                placeholder="e.g. lift +3.3pp at p<0.01, n=412 quotes; recommend full rollout."
              />
            </div>
            <label className="flex items-start gap-2 text-[12.5px] text-[var(--ink-2)]">
              <input
                type="checkbox"
                checked={acceptApproval}
                onChange={(e) => setAcceptApproval(e.target.checked)}
                className="mt-0.5"
              />
              <span>I acknowledge this requires MD approval before going live.</span>
            </label>
          </>
        )}
      </div>
    </FormDrawerShell>
  );
}
