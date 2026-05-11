// Phase 11 — share a Frank decision with Till (MD) or Heiko (Sales).
// Submits to POST /actions/share_decision; backend writes a Notification
// row for the recipient + a Note row for the sender + an audit row tying
// both to the recommendation. The form transitions to a receipt panel on
// success so Frank has the notification id + audit hash.
import { useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { runAction, type ActionResponse } from '@/data/api/useActions';
import { qk } from '@/lib/api/queryKeys';
import type { ActionDrawerContext } from '@/types/uiActions';
import { FormDrawerShell, FieldLabel, HelpText } from './FormDrawerShell';

interface Props {
  context: ActionDrawerContext;
  onClose: () => void;
  onToast: (message: string, severity?: 'info' | 'success' | 'warning' | 'error') => void;
}

const RECIPIENTS = [
  { id: 'till',  label: 'Till (MD)',   sub: 'Send to MD review queue · gets a notification + branded link' },
  { id: 'heiko', label: 'Heiko (Sales)', sub: 'Send to Sales KAM · for negotiation prep + customer follow-up' },
] as const;

type Recipient = (typeof RECIPIENTS)[number]['id'];

export function ShareDecisionForm({ context, onClose, onToast }: Props) {
  const qc = useQueryClient();
  const targetId = context.recommendationId ?? context.articleId ?? '';
  const headline = context.headline ?? `Decision ${targetId || '—'}`;
  const [recipient, setRecipient] = useState<Recipient>('till');
  const [note, setNote] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<ActionResponse | null>(null);

  const validationError = !targetId
    ? 'A recommendation or article id is required to share — open this from a decision card.'
    : null;

  async function submit() {
    setError(null);
    setSubmitting(true);
    try {
      const response = await runAction('share_decision', {
        target_type: 'recommendation',
        target_id: targetId,
        recommendation_id: context.recommendationId,
        aid: context.articleId,
        cluster: context.cluster,
        recipient,
        note: note.trim() || undefined,
        headline,
        link: `/action-center?focus=rec-${targetId}`,
        after: { headline, recipient, note: note.trim() || null },
      });
      qc.invalidateQueries({ queryKey: qk.shell() });
      qc.invalidateQueries({ queryKey: qk.actionCenter() });
      qc.invalidateQueries({ queryKey: qk.auditTrail('30d') });
      qc.invalidateQueries({ queryKey: ['notes'] });
      onToast(
        response.recipient_resolved
          ? `Shared with ${recipient === 'till' ? 'Till' : 'Heiko'}.`
          : `Recorded — ${recipient} user not provisioned in this env.`,
        response.recipient_resolved ? 'success' : 'warning',
      );
      setResult(response);
      setSubmitting(false);
    } catch (err) {
      setError((err as Error).message);
      setSubmitting(false);
    }
  }

  if (result) {
    return <ShareDecisionReceipt result={result} headline={headline} onClose={onClose} />;
  }

  return (
    <FormDrawerShell
      title="Share decision"
      description={`Forward "${headline}" to Till (MD) or Heiko (Sales). They get an unread notification linking back here; you get a note in your journal with the audit hash.`}
      submitLabel={`Share with ${recipient === 'till' ? 'Till' : 'Heiko'}`}
      submitting={submitting}
      error={error ?? validationError}
      disabled={Boolean(validationError)}
      onSubmit={submit}
      onCancel={onClose}
    >
      <div className="space-y-4">
        <div className="rounded-lg border border-[var(--hairline)] bg-[var(--surface-soft)] p-3 text-[12.5px] text-[var(--ink-2)]">
          <div className="text-[10.5px] font-semibold uppercase tracking-wide text-[var(--muted)]">
            Decision
          </div>
          <div className="mt-0.5 font-semibold text-[var(--ink)]">{headline}</div>
          {targetId && <HelpText>target {targetId}</HelpText>}
        </div>

        <fieldset className="space-y-2">
          <FieldLabel>Recipient</FieldLabel>
          {RECIPIENTS.map((r) => (
            <label
              key={r.id}
              data-testid={`recipient-${r.id}`}
              className={`flex cursor-pointer items-start gap-3 rounded-lg border px-3 py-2 transition-colors ${
                recipient === r.id
                  ? 'border-[var(--rose)] bg-[var(--rose-bg)]'
                  : 'border-[var(--hairline)] bg-white hover:bg-[var(--surface-soft)]'
              }`}
            >
              <input
                type="radio"
                name="share-recipient"
                value={r.id}
                checked={recipient === r.id}
                onChange={() => setRecipient(r.id)}
                className="mt-1 accent-[var(--rose)]"
              />
              <span className="flex flex-col">
                <span className="text-[13px] font-semibold text-[var(--ink)]">{r.label}</span>
                <span className="text-[11.5px] text-[var(--muted)]">{r.sub}</span>
              </span>
            </label>
          ))}
        </fieldset>

        <div>
          <FieldLabel>Note (optional)</FieldLabel>
          <textarea
            value={note}
            onChange={(e) => setNote(e.target.value)}
            rows={3}
            placeholder="One-line context for the recipient (optional)…"
            className="w-full rounded-lg border border-[var(--hairline)] bg-white px-3 py-2 text-sm focus:border-[var(--ink-2)] focus:outline-none"
          />
          <HelpText>
            The note becomes the body of the recipient's notification AND the body of the note we
            file in your journal.
          </HelpText>
        </div>
      </div>
    </FormDrawerShell>
  );
}

function ShareDecisionReceipt({
  result,
  headline,
  onClose,
}: {
  result: ActionResponse;
  headline: string;
  onClose: () => void;
}) {
  const recipientLabel = result.recipient === 'heiko' ? 'Heiko (Sales)' : 'Till (MD)';
  const resolved = result.recipient_resolved !== false;
  return (
    <div className="flex h-full flex-col p-6 pt-14" data-testid="share-receipt">
      <div className="flex items-center gap-2">
        <span
          aria-hidden
          className="inline-flex h-6 w-6 items-center justify-center rounded-full text-[12px] font-bold text-white"
          style={{ background: resolved ? 'var(--green)' : 'var(--amber)' }}
        >
          {resolved ? '✓' : '!'}
        </span>
        <h2 className="font-display text-xl font-bold tracking-tight text-[var(--ink)]">
          {resolved ? `Shared with ${recipientLabel}` : 'Recorded — recipient unresolved'}
        </h2>
      </div>
      <p className="mt-2 text-sm leading-relaxed text-[var(--muted)]">
        {resolved
          ? `"${headline}" forwarded. ${recipientLabel} now has an unread notification in their shell — link back to this decision attached.`
          : `Audit row + sender note are on file, but no user with persona "${result.recipient}" is provisioned in this environment.`}
      </p>

      <dl className="mt-5 grid grid-cols-[120px_minmax(0,1fr)] gap-x-3 gap-y-2 rounded-xl border border-[var(--hairline)] bg-[var(--surface-soft)] p-3 text-[12.5px]">
        <dt className="text-[10.5px] font-semibold uppercase tracking-wide text-[var(--muted)]">Recipient</dt>
        <dd className="text-[var(--ink-2)]">{recipientLabel}</dd>
        {result.notification_id && (
          <>
            <dt className="text-[10.5px] font-semibold uppercase tracking-wide text-[var(--muted)]">Notification</dt>
            <dd
              className="font-mono text-[11.5px] text-[var(--ink-2)] break-all"
              data-testid="share-notification-id"
            >
              {result.notification_id}
            </dd>
          </>
        )}
        {result.note_id && (
          <>
            <dt className="text-[10.5px] font-semibold uppercase tracking-wide text-[var(--muted)]">Your note</dt>
            <dd className="font-mono text-[11.5px] text-[var(--ink-2)] break-all">{result.note_id}</dd>
          </>
        )}
        <dt className="text-[10.5px] font-semibold uppercase tracking-wide text-[var(--muted)]">Audit hash</dt>
        <dd className="font-mono text-[11.5px] text-[var(--ink-2)] break-all" data-testid="share-audit-hash">
          {result.audit_hash ?? result.audit.audit_hash}
        </dd>
        {result.share_link && (
          <>
            <dt className="text-[10.5px] font-semibold uppercase tracking-wide text-[var(--muted)]">Deep-link</dt>
            <dd className="text-[var(--ink-2)] break-all">
              <code className="rounded bg-white px-1 py-[1px]">{result.share_link}</code>
            </dd>
          </>
        )}
      </dl>

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
