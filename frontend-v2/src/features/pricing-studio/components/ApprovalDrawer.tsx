// Pricing Studio v3 / Phase 5 (§5.4) — Approval Drawer.
//
// Right-rail drawer the approver opens from their inbox or by clicking
// the current-step bubble in the stepper. Renders six sections per
// plan §5.4:
//   1. Proposal summary
//   2. Rule trace
//   3. Lineage (embedded mini-lineage + "view full" link)
//   4. Past similar (deferred; stubbed with a TODO when no endpoint exists)
//   5. Comment (Markdown-ish textarea; mentions are a future polish)
//   6. Decision — Approve · Approve with changes · Reject
//
// Reject without a comment surfaces an inline error before submit.

import { useMemo, useState } from 'react';
import { Drawer } from '@/components/ui/Drawer';
import { useApprovalDecision } from '@/data/api/useApprovalInbox';
import { useApprovalInstance } from '@/data/api/useApprovalInstance';
import { useLineageDrawer } from '@/features/pricing-studio/lineage/LineageDrawerContext';
import type { ProposalRow } from '@/data/api/useRecommendation';
import {
  CheckCircle2,
  XCircle,
  PencilLine,
  AlertCircle,
  Info,
  Megaphone,
} from 'lucide-react';

interface Props {
  open: boolean;
  onOpenChange: (next: boolean) => void;
  /** Proposal under review. May be null while loading from the inbox row. */
  proposal?: Pick<
    ProposalRow,
    'id' | 'article_id' | 'current_price' | 'proposed_price' | 'delta_pp' | 'status' | 'payload'
  > | null;
  /** Approval instance id; required for posting decisions. */
  instanceId: string | null;
  /** Optional: pre-fetched current step role for the rule-trace header. */
  currentStepRole?: string | null;
  /** Called when the user wants to brief Manuel on this SKU. Optional. */
  onBrief?: (aid: string) => void;
}

type DecisionUiMode = 'idle' | 'approve_with_changes';

export function ApprovalDrawer({
  open,
  onOpenChange,
  proposal,
  instanceId,
  currentStepRole,
  onBrief,
}: Props) {
  const decide = useApprovalDecision(instanceId);
  const approval = useApprovalInstance(proposal?.id ?? null);
  const { openLineage } = useLineageDrawer();

  const [comment, setComment] = useState('');
  const [mode, setMode] = useState<DecisionUiMode>('idle');
  const [editedPrice, setEditedPrice] = useState<string>('');
  const [rejectError, setRejectError] = useState<string | null>(null);

  const ruleNotes = useMemo(() => {
    const inst = approval.data?.approval_instance;
    if (!inst) return [] as string[];
    const step = inst.steps[inst.current_step];
    if (!step) return [];
    const notes: string[] = [];
    if (step.rule) notes.push(step.rule);
    const payload = (proposal?.payload ?? {}) as Record<string, unknown>;
    const thresholds = payload.thresholds_hit;
    if (Array.isArray(thresholds)) {
      for (const t of thresholds) {
        if (typeof t === 'string') notes.push(t);
      }
    }
    return notes;
  }, [approval.data, proposal?.payload]);

  const submit = async (decision: 'approve' | 'reject' | 'request_changes') => {
    if (decision === 'reject' && !comment.trim()) {
      setRejectError('A reason is required when rejecting.');
      return;
    }
    setRejectError(null);
    const finalComment =
      mode === 'approve_with_changes' && editedPrice.trim()
        ? `${comment.trim() ? comment.trim() + '\n\n' : ''}Suggested price: ${editedPrice.trim()}`
        : comment.trim() || undefined;
    await decide.mutateAsync({ decision, comment: finalComment });
    setComment('');
    setEditedPrice('');
    setMode('idle');
    onOpenChange(false);
  };

  const summaryDelta =
    proposal?.delta_pp != null
      ? `${proposal.delta_pp >= 0 ? '+' : ''}${proposal.delta_pp.toFixed(1)}pp`
      : '—';
  const aid = proposal?.article_id ?? '—';

  return (
    <Drawer
      open={open}
      onOpenChange={onOpenChange}
      width={520}
      title="Approval review"
    >
      <div
        data-testid="approval-drawer"
        className="flex h-full flex-col overflow-y-auto p-5"
      >
        <header className="mb-3 border-b border-[var(--hairline)] pb-3">
          <p className="text-[10.5px] font-semibold uppercase tracking-wide text-[var(--muted)]">
            Approval review
          </p>
          <h2 className="font-display text-[17px] font-bold tracking-tight text-[var(--ink)]">
            #{proposal?.id?.slice(0, 8) ?? '—'} · {aid}
          </h2>
          {currentStepRole && (
            <p className="mt-0.5 text-[11.5px] text-[var(--ink-2)]">
              Awaiting <span className="font-semibold">{currentStepRole}</span> approval
            </p>
          )}
        </header>

        {/* 1. Proposal summary */}
        <section
          className="mb-3 rounded-lg border border-[var(--hairline)] bg-[var(--surface-soft)] p-3"
          data-testid="drawer-section-summary"
        >
          <h3 className="text-[11px] font-semibold uppercase tracking-wide text-[var(--muted)]">
            Proposal summary
          </h3>
          <dl className="mt-2 grid grid-cols-2 gap-x-3 gap-y-1 text-[12px]">
            <dt className="text-[var(--muted)]">Current</dt>
            <dd className="tabular-nums font-semibold text-[var(--ink)]">
              €{(proposal?.current_price ?? 0).toFixed(2)}
            </dd>
            <dt className="text-[var(--muted)]">Proposed</dt>
            <dd className="tabular-nums font-semibold text-[var(--rose-deep)]">
              €{(proposal?.proposed_price ?? 0).toFixed(2)}
            </dd>
            <dt className="text-[var(--muted)]">Δ</dt>
            <dd className="tabular-nums">{summaryDelta}</dd>
            <dt className="text-[var(--muted)]">Projected DB2</dt>
            <dd className="text-[var(--ink-2)]">
              {((proposal?.payload as Record<string, unknown> | undefined)?.projected_db2 as
                | string
                | undefined) ?? '—'}
            </dd>
            <dt className="text-[var(--muted)]">Win prob</dt>
            <dd className="text-[var(--ink-2)]">
              {((proposal?.payload as Record<string, unknown> | undefined)?.win_prob as
                | string
                | undefined) ?? '—'}
            </dd>
          </dl>
        </section>

        {/* 2. Rule trace */}
        <section
          className="mb-3 rounded-lg border border-[var(--hairline)] p-3"
          data-testid="drawer-section-rules"
        >
          <h3 className="text-[11px] font-semibold uppercase tracking-wide text-[var(--muted)]">
            Rule trace
          </h3>
          {ruleNotes.length === 0 ? (
            <p className="mt-1 text-[12px] text-[var(--muted)]">
              No rule annotations recorded for this step.
            </p>
          ) : (
            <ul className="mt-1 flex flex-col gap-0.5 text-[12px] text-[var(--ink-2)]">
              {ruleNotes.map((r) => (
                <li key={r} className="flex items-start gap-1.5">
                  <Info size={11} className="mt-1 text-[var(--muted)]" /> {r}
                </li>
              ))}
            </ul>
          )}
        </section>

        {/* 3. Lineage */}
        <section
          className="mb-3 rounded-lg border border-[var(--hairline)] p-3"
          data-testid="drawer-section-lineage"
        >
          <h3 className="text-[11px] font-semibold uppercase tracking-wide text-[var(--muted)]">
            Lineage
          </h3>
          <p className="mt-1 text-[12px] text-[var(--ink-2)]">
            Recommendation drivers, WTP, win-prob curve are sourced from the
            same lineage shown in the Studio workbench.
          </p>
          <button
            type="button"
            onClick={() =>
              openLineage(
                { id: `proposal-${proposal?.id ?? 'unknown'}` },
                { subjectTitle: `Proposal #${proposal?.id?.slice(0, 8) ?? '—'}` },
              )
            }
            className="mt-2 inline-flex items-center gap-1 rounded-md border border-[var(--rose-border)] bg-[var(--rose-bg)] px-2.5 py-1 text-[11px] font-semibold text-[var(--rose-deep)] hover:bg-[color-mix(in_oklab,var(--rose-bg)_70%,white)]"
          >
            View full lineage
          </button>
        </section>

        {/* 4. Past similar — deferred, stub */}
        <section
          className="mb-3 rounded-lg border border-dashed border-[var(--hairline)] p-3"
          data-testid="drawer-section-past"
        >
          <h3 className="text-[11px] font-semibold uppercase tracking-wide text-[var(--muted)]">
            Past similar
          </h3>
          <p className="mt-1 text-[12px] text-[var(--muted)]">
            TODO (v3): surface the last 5 approved proposals on this SKU /
            cluster with realised outcomes once the endpoint is live.
          </p>
        </section>

        {/* 5. Comment */}
        <section
          className="mb-3 rounded-lg border border-[var(--hairline)] p-3"
          data-testid="drawer-section-comment"
        >
          <h3 className="text-[11px] font-semibold uppercase tracking-wide text-[var(--muted)]">
            Comment
          </h3>
          <label htmlFor="approval-decision-comment" className="sr-only">
            Comment for this decision
          </label>
          <textarea
            id="approval-decision-comment"
            data-testid="drawer-comment-input"
            value={comment}
            onChange={(e) => {
              setComment(e.target.value);
              if (rejectError) setRejectError(null);
            }}
            rows={3}
            placeholder="Add context. @mentions become user links."
            className="mt-2 w-full rounded-md border border-[var(--hairline)] bg-white p-2 text-[12px] text-[var(--ink)] outline-none focus:border-[var(--rose-border)]"
          />
          {mode === 'approve_with_changes' && (
            <div className="mt-2" data-testid="drawer-edit-price">
              <label
                htmlFor="approval-edit-price"
                className="block text-[10.5px] font-semibold uppercase tracking-wide text-[var(--muted)]"
              >
                New price
              </label>
              <input
                id="approval-edit-price"
                data-testid="drawer-edit-price-input"
                value={editedPrice}
                onChange={(e) => setEditedPrice(e.target.value)}
                placeholder="e.g. 121.50"
                className="mt-1 w-full rounded-md border border-[var(--rose-border)] bg-white p-2 text-[12px] tabular-nums text-[var(--ink)] outline-none focus:border-[var(--rose-deep)]"
              />
            </div>
          )}
          {rejectError && (
            <p
              role="alert"
              data-testid="drawer-reject-error"
              className="mt-2 inline-flex items-center gap-1 text-[11px] font-semibold text-[var(--rose-deep)]"
            >
              <AlertCircle size={11} /> {rejectError}
            </p>
          )}
        </section>

        {/* 6. Decision buttons */}
        <section
          className="mt-auto flex flex-col gap-2 border-t border-[var(--hairline)] pt-3"
          data-testid="drawer-section-decision"
        >
          {onBrief && aid !== '—' && (
            <button
              type="button"
              onClick={() => onBrief(aid)}
              className="inline-flex items-center justify-center gap-1.5 rounded-md border border-[var(--hairline)] bg-white px-3 py-2 text-[11.5px] font-semibold text-[var(--ink-2)] hover:bg-[var(--surface-soft)]"
            >
              <Megaphone size={12} /> Brief me on this SKU
            </button>
          )}
          <div className="grid grid-cols-3 gap-2">
            <button
              type="button"
              data-testid="drawer-approve-button"
              onClick={() => submit('approve')}
              disabled={decide.isPending}
              className="inline-flex items-center justify-center gap-1 rounded-md border border-[var(--rose-border)] bg-[var(--rose-deep)] px-2 py-2 text-[11.5px] font-semibold text-white hover:bg-[color-mix(in_oklab,var(--rose-deep)_88%,black)] disabled:opacity-60"
            >
              <CheckCircle2 size={12} /> Approve
            </button>
            <button
              type="button"
              data-testid="drawer-approve-changes-button"
              onClick={() => {
                if (mode !== 'approve_with_changes') {
                  setMode('approve_with_changes');
                  return;
                }
                void submit('approve');
              }}
              disabled={decide.isPending}
              className="inline-flex items-center justify-center gap-1 rounded-md border border-[var(--amber-border)] bg-[var(--amber-bg)] px-2 py-2 text-[11.5px] font-semibold text-[var(--amber)] hover:bg-[color-mix(in_oklab,var(--amber-bg)_70%,white)] disabled:opacity-60"
            >
              <PencilLine size={12} />{' '}
              {mode === 'approve_with_changes' ? 'Submit changes' : 'With changes'}
            </button>
            <button
              type="button"
              data-testid="drawer-reject-button"
              onClick={() => submit('reject')}
              disabled={decide.isPending}
              className="inline-flex items-center justify-center gap-1 rounded-md border border-[var(--hairline)] bg-white px-2 py-2 text-[11.5px] font-semibold text-[var(--ink-2)] hover:bg-[var(--surface-soft)] disabled:opacity-60"
            >
              <XCircle size={12} /> Reject
            </button>
          </div>
        </section>
      </div>
    </Drawer>
  );
}
