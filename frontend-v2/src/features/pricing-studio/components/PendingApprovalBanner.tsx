// Pricing Studio v3 / Phase G (§5 row G2) — Pending approval banner.
//
// When a proposal is in `pending_approval`, this amber banner anchors the
// top of the ProposalContextPanel and tells Frank who has the ball,
// since when, and offers a Recall escape hatch. The actual Recall call
// goes through `useRecallProposal` so it shares cache invalidations with
// the rest of the studio (action-center, pricing-proposals list, the
// approval-instance per-proposal cache).

import { useMemo, useState } from 'react';
import { Clock, RotateCcw } from 'lucide-react';
import {
  useApprovalInstance,
  useRecallProposal,
} from '@/data/api/useApprovalInstance';
import { useActionFeedbackStore } from '@/stores/actionFeedbackStore';
import type { ProposalRow } from '@/data/api/useRecommendation';

interface Props {
  proposal: Pick<ProposalRow, 'id' | 'status' | 'updated_at' | 'created_at'>;
}

const ROLE_LABEL: Record<string, string> = {
  draft: 'Draft',
  frank: 'Frank',
  manuel: 'Manuel',
  md: 'Till',
  till: 'Till',
  finance: 'Finance',
  legal: 'Legal',
  live: 'Live',
};

function prettyRole(role: string | null | undefined): string {
  if (!role) return 'Till';
  const k = role.toLowerCase();
  return ROLE_LABEL[k] ?? role.charAt(0).toUpperCase() + role.slice(1);
}

/** Compact "Nh ago" / "Nm ago" / "just now" formatter. */
export function relativeTime(iso: string | null | undefined, now: number = Date.now()): string {
  if (!iso) return '—';
  const t = Date.parse(iso);
  if (Number.isNaN(t)) return '—';
  const diffSec = Math.max(0, Math.round((now - t) / 1000));
  if (diffSec < 60) return 'just now';
  const diffMin = Math.round(diffSec / 60);
  if (diffMin < 60) return `${diffMin}m ago`;
  const diffHr = Math.round(diffMin / 60);
  if (diffHr < 48) return `${diffHr}h ago`;
  const diffDay = Math.round(diffHr / 24);
  return `${diffDay}d ago`;
}

export function PendingApprovalBanner({ proposal }: Props) {
  const instance = useApprovalInstance(
    proposal.status === 'pending_approval' ? proposal.id : null,
  );
  const recall = useRecallProposal();
  const pushToast = useActionFeedbackStore((s) => s.pushToast);
  const [confirmOpen, setConfirmOpen] = useState(false);

  const nextActor = useMemo(() => {
    const inst = instance.data?.approval_instance;
    if (!inst) return null;
    const steps = inst.steps ?? [];
    const step = steps[inst.current_step];
    if (!step || step.decision !== 'pending') return null;
    return step.role ?? null;
  }, [instance.data]);

  // Prefer the approval instance's created_at (the moment it was routed),
  // fall back to the proposal's updated_at, then created_at.
  const sinceIso =
    instance.data?.approval_instance?.created_at ??
    proposal.updated_at ??
    proposal.created_at ??
    null;

  if (proposal.status !== 'pending_approval') return null;

  const recipientName = prettyRole(nextActor);

  const onConfirmRecall = () => {
    recall.mutate(proposal.id, {
      onSuccess: () => {
        pushToast('Proposal recalled.', 'success');
        setConfirmOpen(false);
      },
      onError: () => {
        pushToast('Could not recall proposal — please retry.', 'error');
        setConfirmOpen(false);
      },
    });
  };

  return (
    <div
      data-testid="pending-approval-banner"
      role="status"
      className="mb-3 flex items-center gap-3 rounded-[12px] border px-3 py-2"
      style={{
        background: 'color-mix(in oklab, var(--amber) 8%, white)',
        borderColor: 'color-mix(in oklab, var(--amber) 30%, transparent)',
      }}
    >
      <span
        aria-hidden="true"
        className="grid h-7 w-7 shrink-0 place-items-center rounded-full"
        style={{
          background: 'color-mix(in oklab, var(--amber) 14%, white)',
          color: 'var(--amber)',
        }}
      >
        <Clock size={14} />
      </span>
      <p className="min-w-0 flex-1 text-[12px] text-[var(--ink-2)]">
        Sent to{' '}
        <span className="font-semibold text-[var(--ink)]">{recipientName}</span>{' '}
        for approval ·{' '}
        <span data-testid="pending-approval-banner-since">
          {relativeTime(sinceIso)}
        </span>
      </p>
      <button
        type="button"
        data-testid="pending-approval-recall-button"
        onClick={() => setConfirmOpen(true)}
        disabled={recall.isPending}
        className="inline-flex items-center gap-1.5 rounded-md border border-[color-mix(in_oklab,var(--amber)_30%,transparent)] bg-white px-2.5 py-1 text-[11.5px] font-semibold text-[var(--ink-2)] hover:bg-[color-mix(in_oklab,var(--amber)_6%,white)] disabled:opacity-60"
      >
        <RotateCcw size={12} /> {recall.isPending ? 'Recalling…' : 'Recall'}
      </button>

      {confirmOpen && (
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="recall-confirm-title"
          data-testid="pending-approval-recall-confirm"
          className="fixed inset-0 z-50 grid place-items-center bg-black/30 p-4"
        >
          <div className="w-full max-w-sm rounded-[14px] border border-[var(--border)] bg-white p-4 shadow-[var(--shadow-card)]">
            <h4
              id="recall-confirm-title"
              className="font-display text-[14px] font-bold tracking-tight text-[var(--ink)]"
            >
              Recall this proposal?
            </h4>
            <p className="mt-1 text-[12px] text-[var(--ink-2)]">
              It will return to Draft state and {recipientName} will no longer
              see it in their inbox.
            </p>
            <div className="mt-3 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setConfirmOpen(false)}
                disabled={recall.isPending}
                className="rounded-md border border-[var(--hairline)] bg-white px-3 py-1.5 text-[11.5px] font-semibold text-[var(--ink-2)] hover:bg-[var(--surface-soft)]"
              >
                Keep pending
              </button>
              <button
                type="button"
                data-testid="pending-approval-recall-confirm-button"
                onClick={onConfirmRecall}
                disabled={recall.isPending}
                className="rounded-md border border-[var(--rose-border)] bg-[var(--rose-deep)] px-3 py-1.5 text-[11.5px] font-semibold text-white hover:bg-[color-mix(in_oklab,var(--rose-deep)_85%,black)] disabled:opacity-60"
              >
                {recall.isPending ? 'Recalling…' : 'Recall'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
