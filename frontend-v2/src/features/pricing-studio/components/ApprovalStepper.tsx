// Pricing Studio v3 / Phase 5 (§5.3) — Approval Stepper.
//
// Sits at the top of ProposalContextPanel. For a single proposal it
// fetches the approval instance + action history and renders a row of
// step bubbles for the routed roles (Draft → role₁ → role₂ → Live).
//
// Visual contract (per plan §5.3):
//   - bubbles connected by hairlines, current step subtly pulses
//   - status icons: ✓ approved, ✕ rejected, ⏱ pending, ⚠ changes
//   - "Triggered by rules" lists each routed step's rule note (best-effort)
//   - "Latest comment" line surfaces the newest action.comment
//   - Recall button: visible only when proposal.status === 'draft' AND
//     user is the proposal creator
//   - Add comment: expands an inline textarea; submits via WS (collab)
//   - Lineage button → opens the lineage drawer for the routing decision

import { useMemo, useState } from 'react';
import {
  CheckCircle2,
  Clock,
  XCircle,
  AlertTriangle,
  RotateCcw,
  MessageSquarePlus,
} from 'lucide-react';
import {
  useApprovalInstance,
  useRecallProposal,
  type ApprovalInstance,
  type ApprovalStep,
} from '@/data/api/useApprovalInstance';
import { useAuthStore } from '@/stores/authStore';
import { useProposalCollab } from '@/data/api/useProposalCollab';
import { LineageButton } from '@/components/LineageButton';
import type { ProposalRow } from '@/data/api/useRecommendation';

interface Props {
  proposal: Pick<ProposalRow, 'id' | 'status' | 'article_id' | 'payload'> & {
    created_by?: string | null;
  };
  /** Optional fixture override used by tests. Skips the network query. */
  fixture?: {
    instance: ApprovalInstance;
    actions: { actor: string | null; comment: string | null; at: string | null }[];
  };
}

interface DerivedStep {
  index: number;
  role: string;
  decision: ApprovalStep['decision'];
  actor: string | null;
  at: string | null;
  comment: string | null;
  rule: string | null;
  isCurrent: boolean;
}

const ROLE_LABEL: Record<string, string> = {
  draft: 'Draft',
  frank: 'Frank',
  manuel: 'Manuel',
  md: 'MD',
  finance: 'Finance',
  legal: 'Legal',
  live: 'Live',
};

function roleLabel(role: string): string {
  const k = role.toLowerCase();
  return ROLE_LABEL[k] ?? role.charAt(0).toUpperCase() + role.slice(1);
}

function statusIconFor(
  decision: ApprovalStep['decision'],
): { Icon: typeof CheckCircle2; tone: string; label: string } {
  switch (decision) {
    case 'approved':
      return { Icon: CheckCircle2, tone: 'var(--green)', label: 'approved' };
    case 'rejected':
      return { Icon: XCircle, tone: 'var(--rose-deep)', label: 'rejected' };
    case 'changes_requested':
      return { Icon: AlertTriangle, tone: 'var(--amber)', label: 'changes requested' };
    case 'pending':
    default:
      return { Icon: Clock, tone: 'var(--muted)', label: 'pending' };
  }
}

export function ApprovalStepper({ proposal, fixture }: Props) {
  const query = useApprovalInstance(fixture ? null : proposal.id);
  const data = fixture
    ? {
        approval_instance: fixture.instance,
        actions: fixture.actions.map((a, i) => ({
          id: `fx-${i}`,
          actor: a.actor,
          decision: 'approved',
          comment: a.comment,
          at: a.at,
        })),
      }
    : query.data ?? null;

  const user = useAuthStore((s) => s.user);
  const recall = useRecallProposal();
  const collab = useProposalCollab({
    proposalId: proposal.id,
    aid: proposal.article_id ?? null,
    enabled: !fixture,
  });

  const [commentOpen, setCommentOpen] = useState(false);
  const [commentText, setCommentText] = useState('');

  const steps: DerivedStep[] = useMemo(() => {
    if (!data || !data.approval_instance) return [];
    const inst = data.approval_instance;
    return inst.steps.map((s, i) => ({
      index: i,
      role: s.role,
      decision: s.decision,
      actor: s.actor ?? null,
      at: s.at ?? null,
      comment: s.comment ?? null,
      rule: s.rule ?? null,
      isCurrent: i === inst.current_step && s.decision === 'pending',
    }));
  }, [data]);

  const triggeredRules = useMemo(() => {
    return steps
      .map((s) => (s.rule ? { role: s.role, rule: s.rule } : null))
      .filter((x): x is { role: string; rule: string } => x !== null);
  }, [steps]);

  const latestComment = useMemo(() => {
    if (!data?.actions?.length) return null;
    for (let i = data.actions.length - 1; i >= 0; i--) {
      const a = data.actions[i];
      if (a.comment && a.comment.trim()) return a;
    }
    return null;
  }, [data]);

  const isCreator = Boolean(
    user?.id && proposal.created_by && user.id === proposal.created_by,
  );
  const canRecall = proposal.status === 'draft' && isCreator;

  if (query.isLoading && !fixture) {
    return (
      <div
        data-testid="approval-stepper-loading"
        className="rounded-[14px] border border-[var(--hairline)] bg-[var(--surface-soft)] p-3 text-[11.5px] text-[var(--muted)]"
      >
        Loading approval status…
      </div>
    );
  }
  if (!data || steps.length === 0) {
    return null;
  }

  const onSubmitComment = () => {
    if (!commentText.trim()) return;
    const sent = collab.sendComment(commentText);
    if (sent) {
      setCommentText('');
      setCommentOpen(false);
    }
  };

  // Compose the rendered bubble list: pseudo-"Draft" prefix + each routed
  // role + a trailing "Live" node so the plan's "Draft  Frank  Manuel  MD
  // Live" anatomy renders even when the BFF only sends the routed roles.
  const bubbles: DerivedStep[] = [
    {
      index: -1,
      role: 'draft',
      decision: 'approved',
      actor: null,
      at: null,
      comment: null,
      rule: null,
      isCurrent: false,
    },
    ...steps,
    {
      index: steps.length,
      role: 'live',
      decision: proposal.status === 'approved' || proposal.status === 'implemented'
        ? 'approved'
        : 'pending',
      actor: null,
      at: null,
      comment: null,
      rule: null,
      isCurrent: false,
    },
  ];

  return (
    <section
      data-testid="approval-stepper"
      className="mb-3 rounded-[14px] border border-[var(--border)] bg-white p-4 shadow-[var(--shadow-card)]"
      aria-label={`Approval workflow for proposal ${proposal.id}`}
    >
      <header className="mb-3 flex items-baseline justify-between gap-3">
        <div>
          <h4 className="font-display text-[13px] font-bold tracking-tight text-[var(--ink)]">
            Approval · #{proposal.id.slice(0, 6)}
          </h4>
          <p className="mt-0.5 text-[11px] text-[var(--muted)]">
            {steps.filter((s) => s.decision === 'approved').length} of{' '}
            {steps.length} step{steps.length === 1 ? '' : 's'} approved
            {collab.isConnected ? ' · live' : ''}
          </p>
        </div>
        <LineageButton
          lineageRef={{ id: `approval-${data.approval_instance.id}` }}
          subjectTitle="Approval routing"
          label="Why this routing?"
        />
      </header>

      <ol
        className="flex items-center gap-2 overflow-x-auto pb-1"
        data-testid="approval-stepper-bubbles"
      >
        {bubbles.map((step, i) => {
          const tone = statusIconFor(step.decision);
          const Icon = tone.Icon;
          return (
            <li
              key={`${step.role}-${step.index}`}
              className="flex min-w-0 items-center gap-2"
              data-testid={`approval-bubble-${step.role}`}
            >
              <div
                className={`flex flex-col items-center gap-1 ${
                  step.isCurrent ? 'animate-pulse' : ''
                }`}
              >
                <span
                  className="grid h-7 w-7 place-items-center rounded-full border"
                  style={{
                    borderColor:
                      step.decision === 'approved'
                        ? 'var(--green-border)'
                        : step.decision === 'rejected'
                          ? 'var(--rose-border)'
                          : step.decision === 'changes_requested'
                            ? 'var(--amber-border)'
                            : 'var(--hairline)',
                    background:
                      step.decision === 'approved'
                        ? 'var(--green-bg)'
                        : step.decision === 'rejected'
                          ? 'var(--rose-bg)'
                          : step.decision === 'changes_requested'
                            ? 'var(--amber-bg)'
                            : 'var(--surface-soft)',
                    color: tone.tone,
                  }}
                  aria-label={`${roleLabel(step.role)}: ${tone.label}`}
                >
                  <Icon size={13} />
                </span>
                <span className="text-[10.5px] font-semibold text-[var(--ink-2)]">
                  {roleLabel(step.role)}
                </span>
                {step.actor ? (
                  <span className="text-[10px] text-[var(--muted)]">{step.actor}</span>
                ) : null}
              </div>
              {i < bubbles.length - 1 && (
                <span
                  aria-hidden="true"
                  className="h-px w-8 shrink-0 bg-[var(--hairline)]"
                />
              )}
            </li>
          );
        })}
      </ol>

      {triggeredRules.length > 0 && (
        <div className="mt-3 rounded-md border border-[var(--hairline)] bg-[var(--surface-soft)] px-3 py-2">
          <p className="text-[10.5px] font-semibold uppercase tracking-wide text-[var(--muted)]">
            Triggered by rules
          </p>
          <ul className="mt-1 flex flex-col gap-0.5 text-[11.5px] text-[var(--ink-2)]">
            {triggeredRules.map((r) => (
              <li key={`${r.role}-${r.rule}`}>
                <span className="font-medium">{r.rule}</span>
                <span className="text-[var(--muted)]"> (route to {roleLabel(r.role)})</span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {latestComment && (
        <p className="mt-3 text-[11.5px] text-[var(--ink-2)]">
          <span className="font-semibold text-[var(--muted)]">
            Latest comment ({latestComment.actor ?? 'system'} ·{' '}
            {latestComment.at
              ? new Date(latestComment.at).toLocaleTimeString([], {
                  hour: '2-digit',
                  minute: '2-digit',
                })
              : '—'}
            ):
          </span>{' '}
          “{latestComment.comment}”
        </p>
      )}

      <div className="mt-3 flex items-center gap-2">
        {canRecall && (
          <button
            type="button"
            data-testid="approval-recall-button"
            onClick={() => recall.mutate(proposal.id)}
            disabled={recall.isPending}
            className="inline-flex items-center gap-1.5 rounded-md border border-[var(--rose-border)] bg-[var(--rose-bg)] px-3 py-1.5 text-[11.5px] font-semibold text-[var(--rose-deep)] hover:bg-[color-mix(in_oklab,var(--rose-bg)_70%,white)] disabled:opacity-60"
          >
            <RotateCcw size={12} /> {recall.isPending ? 'Recalling…' : 'Recall'}
          </button>
        )}
        <button
          type="button"
          data-testid="approval-add-comment-button"
          onClick={() => setCommentOpen((v) => !v)}
          className="inline-flex items-center gap-1.5 rounded-md border border-[var(--hairline)] bg-white px-3 py-1.5 text-[11.5px] font-semibold text-[var(--ink-2)] hover:bg-[var(--surface-soft)]"
          aria-expanded={commentOpen}
        >
          <MessageSquarePlus size={12} />
          {commentOpen ? 'Cancel' : 'Add comment'}
        </button>
      </div>

      {commentOpen && (
        <div className="mt-2" data-testid="approval-comment-form">
          <label htmlFor={`approval-comment-${proposal.id}`} className="sr-only">
            Comment text
          </label>
          <textarea
            id={`approval-comment-${proposal.id}`}
            value={commentText}
            onChange={(e) => setCommentText(e.target.value)}
            rows={3}
            placeholder="Add context or a question for the next approver…"
            className="w-full rounded-md border border-[var(--hairline)] bg-white p-2 text-[12px] text-[var(--ink)] outline-none focus:border-[var(--rose-border)]"
          />
          <div className="mt-2 flex justify-end gap-2">
            <button
              type="button"
              onClick={() => {
                setCommentOpen(false);
                setCommentText('');
              }}
              className="rounded-md border border-[var(--hairline)] bg-white px-3 py-1 text-[11px] text-[var(--ink-2)]"
            >
              Discard
            </button>
            <button
              type="button"
              onClick={onSubmitComment}
              disabled={!commentText.trim()}
              className="rounded-md border border-[var(--rose-border)] bg-[var(--rose-deep)] px-3 py-1 text-[11px] font-semibold text-white disabled:opacity-50"
            >
              Post
            </button>
          </div>
          {!collab.isConnected && (
            <p className="mt-1 text-[10.5px] text-[var(--amber)]">
              Live channel unavailable — comment will not post until the
              connection recovers.
            </p>
          )}
        </div>
      )}
    </section>
  );
}
