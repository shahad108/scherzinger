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

/**
 * Partial acceptance — analyst keeps the recommendation alive but
 * commits to a softer price move than the engine proposed. Submits
 * `partial_accept` which writes the recommendation event, creates a
 * draft pricing proposal, and writes audit. Recommendation status →
 * `partial_proposed`.
 */
export function PartialAcceptForm({ context, onClose, onToast }: Props) {
  const qc = useQueryClient();
  const [proposedPrice, setProposedPrice] = useState<string>(
    context.targetPrice != null ? String(context.targetPrice) : '',
  );
  const [reason, setReason] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const currentPrice = context.currentPrice ?? null;
  const proposed = parseFloat(proposedPrice);
  const deltaPp =
    Number.isFinite(proposed) && currentPrice && currentPrice > 0
      ? ((proposed - currentPrice) / currentPrice) * 100
      : null;

  function validate(): string | null {
    if (!Number.isFinite(proposed)) return 'Enter a numeric proposed price.';
    if (proposed <= 0) return 'Proposed price must be greater than 0.';
    if (reason.trim().length < 6) return 'Add a short reason (≥ 6 characters) so the audit row carries context.';
    return null;
  }

  const validationError = validate();

  async function submit() {
    setError(null);
    setSubmitting(true);
    try {
      await runAction('partial_accept', {
        target_type: 'recommendation',
        target_id: context.recommendationId,
        recommendation_id: context.recommendationId,
        article_id: context.articleId,
        customer_id: context.customerId,
        cluster: context.cluster,
        source_kind: context.sourceKind,
        current_price: currentPrice ?? undefined,
        proposed_price: proposed,
        delta_pp: deltaPp ?? undefined,
        after: {
          headline: context.headline ?? context.recommendationId ?? 'partial accept',
          variant: 'par',
          reason: reason.trim(),
        },
      });
      onToast(
        `Partial proposal queued for ${context.articleId ?? 'recommendation'} at ${proposed.toFixed(2)}.`,
        'success',
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
      title="Partial acceptance"
      description={`Create a softer pricing proposal for ${context.articleId ?? context.recommendationId ?? 'this recommendation'}. The recommendation stays open as "partial proposed" until the proposal lands in Studio.`}
      submitLabel="Create draft proposal"
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
            <FieldLabel>Current price</FieldLabel>
            <div className="rounded-lg border border-[var(--hairline)] bg-[var(--surface-soft)] px-3 py-2 text-sm tabular-nums text-[var(--ink-2)]">
              {currentPrice != null ? `€ ${currentPrice.toFixed(2)}` : '—'}
            </div>
          </div>
          <div>
            <FieldLabel>Proposed price (€)</FieldLabel>
            <input
              type="number"
              min={0}
              step={0.01}
              value={proposedPrice}
              onChange={(e) => setProposedPrice(e.target.value)}
              className="w-full rounded-lg border border-[var(--hairline)] bg-white px-3 py-2 text-sm tabular-nums focus:border-[var(--ink-2)] focus:outline-none"
              placeholder="0.00"
              autoFocus
            />
            {deltaPp != null && Number.isFinite(deltaPp) && (
              <HelpText>
                Δ {deltaPp >= 0 ? '+' : ''}
                {deltaPp.toFixed(1)}% vs current
              </HelpText>
            )}
          </div>
        </div>

        <div>
          <FieldLabel>Reason (audit trail)</FieldLabel>
          <textarea
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            rows={4}
            className="w-full rounded-lg border border-[var(--hairline)] bg-white px-3 py-2 text-sm leading-relaxed focus:border-[var(--ink-2)] focus:outline-none"
            placeholder="e.g. customer 102330 contract — softer pass-through this period, full pass-through at Q3 renewal."
          />
        </div>
      </div>
    </FormDrawerShell>
  );
}
