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

function defaultRenewalDate(): string {
  // Default to Q3 renewal window: Sep 1 of current year if before Sep, else next year.
  const now = new Date();
  const year = now.getMonth() < 8 ? now.getFullYear() : now.getFullYear() + 1;
  return `${year}-09-01`;
}

export function QueueRenewalForm({ context, onClose, onToast }: Props) {
  const qc = useQueryClient();
  const [renewalDate, setRenewalDate] = useState(defaultRenewalDate());
  const [contractRef, setContractRef] = useState('');
  const [note, setNote] = useState('');
  const [owner, setOwner] = useState<'frank' | 'till' | 'heiko'>('till');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const today = new Date().toISOString().slice(0, 10);
  const validationError =
    renewalDate <= today
      ? 'Renewal date must be in the future.'
      : note.trim().length < 4
        ? 'Add a short renewal note (≥ 4 characters).'
        : null;

  async function submit() {
    setError(null);
    setSubmitting(true);
    try {
      await runAction('queue_renewal', {
        target_type: 'recommendation',
        target_id: context.recommendationId,
        recommendation_id: context.recommendationId,
        article_id: context.articleId,
        customer_id: context.customerId,
        cluster: context.cluster,
        source_kind: context.sourceKind,
        after: {
          headline: context.headline ?? context.recommendationId ?? 'queued for renewal',
          renewal_date: renewalDate,
          contract_ref: contractRef.trim() || null,
          owner,
          note: note.trim(),
        },
      });
      onToast(`Queued for renewal review on ${renewalDate}.`, 'success');
      qc.invalidateQueries({ queryKey: qk.actionCenter() });
      onClose();
    } catch (err) {
      setError((err as Error).message);
      setSubmitting(false);
    }
  }

  return (
    <FormDrawerShell
      title="Queue for renewal"
      description="Schedule this contract-locked SKU for the next pricing review window. The renewal queue feeds Forecasting and the contracted-customer worklist."
      submitLabel="Queue renewal"
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

        <div className="grid grid-cols-2 gap-3">
          <div>
            <FieldLabel>Renewal date</FieldLabel>
            <input
              type="date"
              min={today}
              value={renewalDate}
              onChange={(e) => setRenewalDate(e.target.value)}
              className="w-full rounded-lg border border-[var(--hairline)] bg-white px-3 py-2 text-sm focus:border-[var(--ink-2)] focus:outline-none"
            />
          </div>
          <div>
            <FieldLabel>Owner</FieldLabel>
            <select
              value={owner}
              onChange={(e) => setOwner(e.target.value as typeof owner)}
              className="w-full rounded-lg border border-[var(--hairline)] bg-white px-3 py-2 text-sm focus:border-[var(--ink-2)] focus:outline-none"
            >
              <option value="till">Till — MD authority</option>
              <option value="frank">Frank — analyst follow-up</option>
              <option value="heiko">Heiko — sales relationship</option>
            </select>
          </div>
        </div>

        <div>
          <FieldLabel>Contract reference (optional)</FieldLabel>
          <input
            type="text"
            value={contractRef}
            onChange={(e) => setContractRef(e.target.value)}
            className="w-full rounded-lg border border-[var(--hairline)] bg-white px-3 py-2 text-sm focus:border-[var(--ink-2)] focus:outline-none"
            placeholder="e.g. CON-2024-318"
          />
        </div>

        <div>
          <FieldLabel>Renewal note</FieldLabel>
          <textarea
            value={note}
            onChange={(e) => setNote(e.target.value)}
            rows={4}
            className="w-full rounded-lg border border-[var(--hairline)] bg-white px-3 py-2 text-sm leading-relaxed focus:border-[var(--ink-2)] focus:outline-none"
            placeholder="e.g. cost pass-through behind by 4pp, target +3.5% on renewal."
          />
        </div>
      </div>
    </FormDrawerShell>
  );
}
