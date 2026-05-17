// Pricing Studio v3 / Phase 5 (§5.6) — Approval inbox bell + drawer.
//
// Lives in the Pricing Studio page header (TODO: lift to app shell once
// the cross-screen placement is settled — see plan §5.6). Click opens
// the inbox drawer; each row opens the ApprovalDrawer pre-loaded for
// that instance.

import { useState } from 'react';
import { Bell } from 'lucide-react';
import { Drawer } from '@/components/ui/Drawer';
import { useApprovalInbox, type ApprovalInboxRow } from '@/data/api/useApprovalInbox';
import { ApprovalDrawer } from './ApprovalDrawer';
import type { ProposalRow } from '@/data/api/useRecommendation';

function asProposalLike(row: ApprovalInboxRow): Pick<
  ProposalRow,
  'id' | 'article_id' | 'current_price' | 'proposed_price' | 'delta_pp' | 'status' | 'payload'
> {
  return {
    id: row.proposal_id,
    article_id: row.aid ?? '',
    current_price: row.current_price,
    proposed_price: row.proposed_price,
    delta_pp: row.delta_pp,
    status: (row.status as ProposalRow['status']) ?? 'pending_approval',
    payload: {},
  };
}

export interface ApprovalInboxBellProps {
  /** Optional handler so the parent can re-use its own BriefingButton. */
  onBrief?: (aid: string) => void;
}

export function ApprovalInboxBell({ onBrief }: ApprovalInboxBellProps) {
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState<ApprovalInboxRow | null>(null);
  const { data } = useApprovalInbox();
  const items = data?.items ?? [];
  const count = items.length;

  return (
    <>
      <button
        type="button"
        data-testid="approval-inbox-bell"
        onClick={() => setOpen(true)}
        className="relative inline-flex h-9 w-9 items-center justify-center rounded-full border border-[var(--hairline)] bg-white text-[var(--ink-2)] hover:bg-[var(--surface-soft)]"
        aria-label={`Approval inbox · ${count} pending`}
      >
        <Bell size={14} />
        {count > 0 && (
          <span
            data-testid="approval-inbox-badge"
            aria-hidden="true"
            className="absolute -right-1 -top-1 grid h-4 min-w-4 place-items-center rounded-full bg-[var(--rose-deep)] px-1 text-[9px] font-bold text-white"
          >
            {count > 9 ? '9+' : count}
          </span>
        )}
      </button>

      <Drawer open={open} onOpenChange={setOpen} width={420} title="Approval inbox">
        <div className="flex h-full flex-col overflow-hidden p-4" data-testid="approval-inbox-drawer">
          <header className="mb-3 border-b border-[var(--hairline)] pb-2">
            <h2 className="font-display text-[15px] font-bold tracking-tight text-[var(--ink)]">
              Approval inbox
            </h2>
            <p className="mt-0.5 text-[11.5px] text-[var(--muted)]">
              {count} pending decision{count === 1 ? '' : 's'} on your queue.
            </p>
          </header>
          {items.length === 0 ? (
            <p className="text-[12px] text-[var(--muted)]">No pending approvals.</p>
          ) : (
            <ul className="flex flex-col gap-2 overflow-y-auto">
              {items.map((row) => {
                const delta =
                  row.delta_pp != null
                    ? `${row.delta_pp >= 0 ? '+' : ''}${row.delta_pp.toFixed(1)}pp`
                    : '—';
                return (
                  <li key={row.approval_instance_id}>
                    <button
                      type="button"
                      data-testid={`approval-inbox-row-${row.approval_instance_id}`}
                      onClick={() => setActive(row)}
                      className="flex w-full flex-col items-start gap-1 rounded-lg border border-[var(--hairline)] bg-[var(--surface-soft)] p-3 text-left hover:border-[var(--rose-border)] hover:bg-white"
                    >
                      <div className="flex w-full items-center justify-between gap-2 text-[12px]">
                        <span className="font-semibold text-[var(--ink)]">
                          {row.aid ?? '—'}
                        </span>
                        <span className="rounded-full bg-white px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-[var(--ink-2)]">
                          {row.step_role}
                        </span>
                      </div>
                      <div className="text-[11.5px] tabular-nums text-[var(--ink-2)]">
                        €{(row.current_price ?? 0).toFixed(2)} →{' '}
                        <span className="text-[var(--rose-deep)]">
                          €{(row.proposed_price ?? 0).toFixed(2)}
                        </span>
                        <span className="ml-2 text-[var(--muted)]">Δ {delta}</span>
                      </div>
                      <div className="text-[10.5px] text-[var(--muted)]">
                        Routed{' '}
                        {row.created_at
                          ? new Date(row.created_at).toLocaleString()
                          : '—'}
                      </div>
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      </Drawer>

      <ApprovalDrawer
        open={active !== null}
        onOpenChange={(next) => {
          if (!next) setActive(null);
        }}
        proposal={active ? asProposalLike(active) : null}
        instanceId={active?.approval_instance_id ?? null}
        currentStepRole={active?.step_role ?? null}
        onBrief={onBrief}
      />
    </>
  );
}
