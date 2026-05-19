// Pricing Studio v3 / Phase 7 (§7.3) — Publish Confirmation Drawer.
//
// Right-rail drawer (480px) the user opens by clicking "Push to quoting" in
// DecisionFooter. Two states share one container:
//
//   1. "Compose"   — Effective-date + old/new price book preview +
//                    notification toggles + warning + Confirm/Cancel.
//   2. "Published" — Post-confirm receipt: price book confirmation,
//                    per-channel notification results, Open PDF /
//                    View audit / Rollback (within 72h).
//
// All money is Decimal-as-string end-to-end (the BFF preserves cent
// precision via Pydantic Decimal). Rollback inline confirmation gates the
// destructive POST behind a "reason" textarea.

import { useEffect, useMemo, useState } from 'react';
import {
  AlertTriangle,
  CheckCircle2,
  FileDown,
  History,
  Mail,
  MessageSquare,
  Megaphone,
  RotateCcw,
  XCircle,
} from 'lucide-react';
import { Drawer } from '@/components/ui/Drawer';
import {
  defaultEffectiveAt,
  isWithinRollbackWindow,
  proposalPdfUrl,
  usePriceBook,
  usePublishPrice,
  useRollback,
  type NotificationDispatched,
  type PublishReceipt,
} from '@/data/api/usePublishPrice';

export interface PublishConfirmationDrawerNotifyDefaults {
  sales: boolean;
  customers: boolean;
  escalate: boolean;
}

interface Props {
  open: boolean;
  onOpenChange: (next: boolean) => void;
  /** The SKU we're publishing on. */
  aid: string;
  /** Proposed price as a Decimal-string ("127.00"). Required to publish. */
  proposedPrice: string | null;
  /** Pre-formatted current price label, e.g. "€118.00", used for the side-by-side preview. */
  currentPriceLabel?: string | null;
  /** Optional proposal id — populates `source_proposal_id` + enables Branded PDF / audit link. */
  sourceProposalId?: string | null;
  /** Notify defaults from the proposal's payload. Mirrors DecisionData.notifyDefaults. */
  notifyDefaults?: Partial<PublishConfirmationDrawerNotifyDefaults>;
  /** Optional callback invoked when "View audit" is clicked in the published state. */
  onViewAudit?: () => void;
}

interface NotifyState {
  sales: boolean;
  customers: boolean;
  escalate: boolean;
}

const ROSE_PILL =
  'inline-flex items-center justify-center gap-1.5 rounded-md border border-[var(--rose-border)] bg-[var(--rose-deep)] px-3 py-2 text-[11.5px] font-semibold text-white hover:bg-[color-mix(in_oklab,var(--rose-deep)_88%,black)] disabled:opacity-60';
const NEUTRAL_PILL =
  'inline-flex items-center justify-center gap-1.5 rounded-md border border-[var(--hairline)] bg-white px-3 py-2 text-[11.5px] font-semibold text-[var(--ink-2)] hover:bg-[var(--surface-soft)] disabled:opacity-60';
const AMBER_PILL =
  'inline-flex items-center justify-center gap-1.5 rounded-md border border-[var(--amber-border)] bg-[var(--amber-bg)] px-3 py-2 text-[11.5px] font-semibold text-[var(--amber)] hover:bg-[color-mix(in_oklab,var(--amber-bg)_70%,white)] disabled:opacity-60';

function formatPriceLabel(price: string | null | undefined): string {
  if (!price) return '—';
  const n = Number(price);
  if (!Number.isFinite(n)) return price;
  return `€${n.toFixed(2)}`;
}

function formatValidRange(
  validFrom: string | null | undefined,
  validTo: string | null | undefined,
): string {
  const from = validFrom ? validFrom.slice(0, 10) : '—';
  const to = validTo ? validTo.slice(0, 10) : '∞';
  return `${from} → ${to}`;
}

function channelIcon(channel: string) {
  const c = channel.toLowerCase();
  if (c.includes('slack')) return MessageSquare;
  if (c.includes('email') || c.includes('mail')) return Mail;
  return Megaphone;
}

export function PublishConfirmationDrawer({
  open,
  onOpenChange,
  aid,
  proposedPrice,
  currentPriceLabel,
  sourceProposalId,
  notifyDefaults,
  onViewAudit,
}: Props) {
  const [effectiveAt, setEffectiveAt] = useState<string>(() => defaultEffectiveAt());
  const [notify, setNotify] = useState<NotifyState>({
    sales: notifyDefaults?.sales ?? true,
    customers: notifyDefaults?.customers ?? true,
    escalate: notifyDefaults?.escalate ?? false,
  });
  const [error, setError] = useState<string | null>(null);
  const [receipt, setReceipt] = useState<PublishReceipt | null>(null);
  const [scheduled, setScheduled] = useState(false);
  const [rollbackOpen, setRollbackOpen] = useState(false);
  const [rollbackReason, setRollbackReason] = useState('');
  const [rollbackError, setRollbackError] = useState<string | null>(null);
  const [rolledBack, setRolledBack] = useState(false);

  // Reset transient state every time the drawer re-opens. The user might
  // close + reopen for a different SKU; we don't want stale receipts or
  // toggles leaking.
  useEffect(() => {
    if (!open) {
      setReceipt(null);
      setScheduled(false);
      setRollbackOpen(false);
      setRollbackReason('');
      setRollbackError(null);
      setRolledBack(false);
      setError(null);
      setEffectiveAt(defaultEffectiveAt());
      setNotify({
        sales: notifyDefaults?.sales ?? true,
        customers: notifyDefaults?.customers ?? true,
        escalate: notifyDefaults?.escalate ?? false,
      });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const publish = usePublishPrice(aid);
  const rollback = useRollback(aid);
  const priceBook = usePriceBook(aid, { limit: 5, enabled: open });

  const currentRow = useMemo(() => {
    const rows = priceBook.data?.rows ?? [];
    // The active row has valid_to === null. Falls back to the most recent.
    return rows.find((r) => r.valid_to === null) ?? rows[0] ?? null;
  }, [priceBook.data]);

  // The selected effective_at gets formatted for the wire — we ship UTC
  // ISO so the server's tz-aware parser doesn't reinterpret.
  const effectiveAtIso = useMemo(() => {
    if (!effectiveAt) return null;
    // datetime-local input is naive; treat as UTC (we generated it that way).
    const dt = new Date(`${effectiveAt}:00Z`);
    return Number.isFinite(dt.getTime()) ? dt.toISOString() : null;
  }, [effectiveAt]);

  const canConfirm = Boolean(proposedPrice) && Boolean(aid) && !publish.isPending;
  const withinRollback = receipt
    ? !receipt.rolled_back_at && isWithinRollbackWindow(receipt.published_at)
    : false;

  function handleConfirm() {
    if (!proposedPrice || !aid) {
      setError('Cannot publish: missing price or article id.');
      return;
    }
    setError(null);
    publish.mutate(
      {
        price: proposedPrice,
        effective_at: effectiveAtIso,
        source_proposal_id: sourceProposalId ?? null,
      },
      {
        onSuccess: (resp) => {
          if (resp.scheduled) {
            setScheduled(true);
            setReceipt(null);
          } else {
            setReceipt(resp.receipt ?? null);
            setScheduled(false);
          }
        },
        onError: (err) => setError((err as Error).message),
      },
    );
  }

  function handleRollback() {
    if (!receipt) return;
    if (!rollbackReason.trim()) {
      setRollbackError('Reason is required to roll back.');
      return;
    }
    setRollbackError(null);
    rollback.mutate(
      { receipt_id: receipt.id, reason: rollbackReason.trim() },
      {
        onSuccess: (resp) => {
          setReceipt(resp.receipt);
          setRolledBack(true);
          setRollbackOpen(false);
        },
        onError: (err) => setRollbackError((err as Error).message),
      },
    );
  }

  function handleOpenPdf() {
    if (!sourceProposalId) return;
    if (typeof window !== 'undefined') {
      window.open(proposalPdfUrl(sourceProposalId), '_blank', 'noopener,noreferrer');
    }
  }

  const proposedLabel = formatPriceLabel(proposedPrice);
  const currentLabelResolved =
    currentPriceLabel ?? (currentRow ? formatPriceLabel(currentRow.price) : '—');

  return (
    <Drawer
      open={open}
      onOpenChange={onOpenChange}
      width={560}
      title="Publish confirmation"
    >
      <div
        data-testid="publish-confirmation-drawer"
        className="flex h-full flex-col overflow-y-auto p-5"
      >
        <header className="mb-3 border-b border-[var(--hairline)] pb-3">
          <p className="text-[10.5px] font-semibold uppercase tracking-wide text-[var(--muted)]">
            Push to quoting
          </p>
          <h2 className="font-display text-[17px] font-bold tracking-tight text-[var(--ink)]">
            Publish <span className="text-[var(--rose-deep)]">{proposedLabel}</span> on {aid}
          </h2>
        </header>

        {receipt && !scheduled ? (
          <PublishedState
            receipt={receipt}
            rolledBack={rolledBack}
            withinRollback={withinRollback}
            rollbackOpen={rollbackOpen}
            rollbackReason={rollbackReason}
            rollbackError={rollbackError}
            rollbackPending={rollback.isPending}
            onOpenRollback={() => setRollbackOpen(true)}
            onCancelRollback={() => {
              setRollbackOpen(false);
              setRollbackReason('');
              setRollbackError(null);
            }}
            onChangeReason={setRollbackReason}
            onConfirmRollback={handleRollback}
            onOpenPdf={handleOpenPdf}
            hasPdf={Boolean(sourceProposalId)}
            onViewAudit={onViewAudit}
            onClose={() => onOpenChange(false)}
          />
        ) : scheduled ? (
          <ScheduledState
            aid={aid}
            price={proposedLabel}
            effectiveAt={effectiveAt}
            onClose={() => onOpenChange(false)}
          />
        ) : (
          <ComposeState
            aid={aid}
            proposedLabel={proposedLabel}
            currentLabel={currentLabelResolved}
            currentRowValidRange={
              currentRow
                ? formatValidRange(currentRow.valid_from, currentRow.valid_to)
                : '—'
            }
            effectiveAt={effectiveAt}
            onChangeEffectiveAt={setEffectiveAt}
            notify={notify}
            onChangeNotify={setNotify}
            onConfirm={handleConfirm}
            onCancel={() => onOpenChange(false)}
            canConfirm={canConfirm}
            isPending={publish.isPending}
            error={error}
          />
        )}
      </div>
    </Drawer>
  );
}

// ---------------------------------------------------------------------------
// Compose state — initial body of the drawer.
// ---------------------------------------------------------------------------

interface ComposeProps {
  aid: string;
  proposedLabel: string;
  currentLabel: string;
  currentRowValidRange: string;
  effectiveAt: string;
  onChangeEffectiveAt: (next: string) => void;
  notify: NotifyState;
  onChangeNotify: (next: NotifyState) => void;
  onConfirm: () => void;
  onCancel: () => void;
  canConfirm: boolean;
  isPending: boolean;
  error: string | null;
}

function ComposeState(props: ComposeProps) {
  const {
    aid,
    proposedLabel,
    currentLabel,
    currentRowValidRange,
    effectiveAt,
    onChangeEffectiveAt,
    notify,
    onChangeNotify,
    onConfirm,
    onCancel,
    canConfirm,
    isPending,
    error,
  } = props;

  return (
    <>
      {/* Effective date */}
      <section
        className="mb-3 rounded-lg border border-[var(--hairline)] bg-[var(--surface-soft)] p-3"
        data-testid="publish-drawer-effective"
      >
        <label className="block">
          <span className="text-[11px] font-semibold uppercase tracking-wide text-[var(--muted)]">
            Effective at (UTC)
          </span>
          <input
            type="datetime-local"
            value={effectiveAt}
            onChange={(e) => onChangeEffectiveAt(e.target.value)}
            data-testid="publish-drawer-effective-input"
            className="mt-1 w-full rounded-md border border-[var(--hairline)] bg-white p-2 text-[12.5px] tabular-nums text-[var(--ink)] outline-none focus:border-[var(--rose-border)]"
          />
          <p className="mt-1 text-[10.5px] text-[var(--muted)]">
            Defaults to tomorrow 00:00 UTC. Future dates schedule the publish.
          </p>
        </label>
      </section>

      {/* Old / new price book rows */}
      <section
        className="mb-3 rounded-lg border border-[var(--hairline)] p-3"
        data-testid="publish-drawer-rows"
      >
        <h3 className="text-[11px] font-semibold uppercase tracking-wide text-[var(--muted)]">
          Price book change
        </h3>
        <dl className="mt-2 grid grid-cols-[auto_1fr] gap-x-3 gap-y-1.5 text-[12px]">
          <dt className="text-[var(--muted)]">Old row</dt>
          <dd className="tabular-nums text-[var(--ink-2)]">
            {currentLabel}{' '}
            <span className="text-[var(--muted)]">({currentRowValidRange})</span>
          </dd>
          <dt className="text-[var(--muted)]">New row</dt>
          <dd className="tabular-nums font-semibold text-[var(--rose-deep)]">
            {proposedLabel}{' '}
            <span className="font-normal text-[var(--muted)]">
              ({effectiveAt ? effectiveAt.slice(0, 10) : '—'} → ∞)
            </span>
          </dd>
          <dt className="text-[var(--muted)]">SKU</dt>
          <dd className="text-[var(--ink-2)]">{aid}</dd>
        </dl>
      </section>

      {/* Notify */}
      <section
        className="mb-3 rounded-lg border border-[var(--hairline)] p-3"
        data-testid="publish-drawer-notify"
      >
        <h3 className="text-[11px] font-semibold uppercase tracking-wide text-[var(--muted)]">
          Will notify
        </h3>
        <div className="mt-2 flex flex-col gap-1.5 text-[12px] text-[var(--ink-2)]">
          <label className="inline-flex items-center gap-2">
            <input
              type="checkbox"
              checked={notify.sales}
              onChange={(e) => onChangeNotify({ ...notify, sales: e.target.checked })}
              data-testid="publish-drawer-notify-sales"
            />
            <MessageSquare size={12} className="text-[var(--muted)]" />
            Heiko (sales lead) — Slack
          </label>
          <label className="inline-flex items-center gap-2">
            <input
              type="checkbox"
              checked={notify.customers}
              onChange={(e) => onChangeNotify({ ...notify, customers: e.target.checked })}
              data-testid="publish-drawer-notify-customers"
            />
            <Mail size={12} className="text-[var(--muted)]" />
            Tier-A customers — email
          </label>
          <label className="inline-flex items-center gap-2">
            <input
              type="checkbox"
              checked={notify.escalate}
              onChange={(e) => onChangeNotify({ ...notify, escalate: e.target.checked })}
              data-testid="publish-drawer-notify-escalate"
            />
            <Megaphone size={12} className="text-[var(--muted)]" />
            Internal escalation
          </label>
        </div>
      </section>

      {/* Warning */}
      <section
        className="mb-3 rounded-lg border border-[var(--amber-border)] bg-[var(--amber-bg)] p-3 text-[11.5px] text-[var(--amber)]"
        data-testid="publish-drawer-warning"
      >
        <p className="inline-flex items-start gap-1.5">
          <AlertTriangle size={14} className="mt-px shrink-0" />
          <span>
            This price will appear in CPQ quotes from 00:00 UTC. Rollback
            available for 72 h.
          </span>
        </p>
      </section>

      {error && (
        <p
          role="alert"
          data-testid="publish-drawer-error"
          className="mb-2 rounded-md border border-[var(--rose-border)] bg-[var(--rose-bg)] px-2.5 py-1.5 text-[11px] font-semibold text-[var(--rose-deep)]"
        >
          {error}
        </p>
      )}

      <div className="mt-auto flex flex-col gap-2 border-t border-[var(--hairline)] pt-3">
        <button
          type="button"
          onClick={onConfirm}
          disabled={!canConfirm}
          data-testid="publish-drawer-confirm"
          className={ROSE_PILL}
        >
          <CheckCircle2 size={12} />
          {isPending ? 'Publishing…' : 'Confirm publish'}
        </button>
        <button
          type="button"
          onClick={onCancel}
          data-testid="publish-drawer-cancel"
          className={NEUTRAL_PILL}
        >
          Cancel
        </button>
      </div>
    </>
  );
}

// ---------------------------------------------------------------------------
// Scheduled state — when effective_at is in the future the BFF returns a
// scheduled_publish row rather than a receipt. The UI mirrors that.
// ---------------------------------------------------------------------------

interface ScheduledProps {
  aid: string;
  price: string;
  effectiveAt: string;
  onClose: () => void;
}

function ScheduledState({ aid, price, effectiveAt, onClose }: ScheduledProps) {
  return (
    <>
      <section
        className="mb-3 rounded-lg border border-[var(--green-border)] bg-[var(--green-bg)] p-3 text-[12px] text-[var(--green)]"
        data-testid="publish-drawer-scheduled"
      >
        <p className="inline-flex items-start gap-1.5">
          <CheckCircle2 size={14} className="mt-px shrink-0" />
          <span>
            Scheduled <b>{price}</b> on <b>{aid}</b> for {effectiveAt} UTC.
          </span>
        </p>
        <p className="mt-2 text-[11px] text-[var(--ink-2)]">
          The scheduler will fire this publish at the effective time. You can
          rollback during the 72 h window after it fires.
        </p>
      </section>
      <div className="mt-auto flex flex-col gap-2 border-t border-[var(--hairline)] pt-3">
        <button type="button" onClick={onClose} className={NEUTRAL_PILL}>
          Close
        </button>
      </div>
    </>
  );
}

// ---------------------------------------------------------------------------
// Published state — receipt + per-channel notification list + actions.
// ---------------------------------------------------------------------------

interface PublishedProps {
  receipt: PublishReceipt;
  rolledBack: boolean;
  withinRollback: boolean;
  rollbackOpen: boolean;
  rollbackReason: string;
  rollbackError: string | null;
  rollbackPending: boolean;
  onOpenRollback: () => void;
  onCancelRollback: () => void;
  onChangeReason: (next: string) => void;
  onConfirmRollback: () => void;
  onOpenPdf: () => void;
  hasPdf: boolean;
  onViewAudit?: () => void;
  onClose: () => void;
}

function PublishedState(props: PublishedProps) {
  const {
    receipt,
    rolledBack,
    withinRollback,
    rollbackOpen,
    rollbackReason,
    rollbackError,
    rollbackPending,
    onOpenRollback,
    onCancelRollback,
    onChangeReason,
    onConfirmRollback,
    onOpenPdf,
    hasPdf,
    onViewAudit,
    onClose,
  } = props;

  const receiptShort = receipt.id.slice(0, 8);
  const sent = (receipt.notifications_dispatched ?? []).filter(
    (n) => n.status === 'sent',
  );
  const failed = (receipt.notifications_dispatched ?? []).filter(
    (n) => n.status !== 'sent',
  );

  return (
    <>
      <section
        className="mb-3 rounded-lg border border-[var(--green-border)] bg-[var(--green-bg)] p-3 text-[12px] text-[var(--green)]"
        data-testid="publish-drawer-published"
      >
        <p className="inline-flex items-start gap-1.5 font-semibold">
          <CheckCircle2 size={14} className="mt-px shrink-0" />
          <span>{rolledBack ? 'Rolled back' : 'Published'}</span>
        </p>
        <ul className="mt-2 flex flex-col gap-1 text-[11.5px] text-[var(--ink-2)]">
          <li>
            <CheckCircle2 size={11} className="mr-1 inline align-text-bottom text-[var(--green)]" />
            Price book updated
          </li>
          {sent.length > 0 && (
            <li>
              <CheckCircle2 size={11} className="mr-1 inline align-text-bottom text-[var(--green)]" />
              {sent.length} notification{sent.length === 1 ? '' : 's'} dispatched
            </li>
          )}
          <li className="font-mono text-[10.5px] text-[var(--muted)]">
            Receipt id: pub_{receiptShort}…
          </li>
          {rolledBack && receipt.rollback_reason && (
            <li className="text-[var(--muted)]">
              Rollback reason: {receipt.rollback_reason}
            </li>
          )}
        </ul>
      </section>

      {/* Notifications fanout */}
      <section
        className="mb-3 rounded-lg border border-[var(--hairline)] p-3"
        data-testid="publish-drawer-fanout"
      >
        <h3 className="text-[11px] font-semibold uppercase tracking-wide text-[var(--muted)]">
          Notifications dispatched
        </h3>
        {receipt.notifications_dispatched.length === 0 ? (
          <p className="mt-1 text-[12px] text-[var(--muted)]">
            No notifications configured.
          </p>
        ) : (
          <ul className="mt-2 flex flex-col gap-1 text-[12px] text-[var(--ink-2)]">
            {receipt.notifications_dispatched.map((n, i) => (
              <NotificationRow key={`${n.channel}-${n.recipient}-${i}`} n={n} />
            ))}
          </ul>
        )}
        {failed.length > 0 && (
          <p className="mt-2 text-[10.5px] text-[var(--amber)]">
            {failed.length} channel{failed.length === 1 ? '' : 's'} failed —
            hover for details. Failures do not roll back the publish.
          </p>
        )}
      </section>

      {/* Inline rollback confirmation */}
      {rollbackOpen && (
        <section
          className="mb-3 rounded-lg border border-[var(--amber-border)] bg-[var(--amber-bg)] p-3"
          data-testid="publish-drawer-rollback-confirm"
        >
          <h3 className="text-[11px] font-semibold uppercase tracking-wide text-[var(--amber)]">
            Confirm rollback
          </h3>
          <label htmlFor="publish-rollback-reason" className="sr-only">
            Rollback reason
          </label>
          <textarea
            id="publish-rollback-reason"
            value={rollbackReason}
            onChange={(e) => onChangeReason(e.target.value)}
            rows={2}
            placeholder="Why are you rolling back?"
            data-testid="publish-drawer-rollback-reason"
            className="mt-2 w-full rounded-md border border-[var(--hairline)] bg-white p-2 text-[12px] text-[var(--ink)] outline-none focus:border-[var(--rose-border)]"
          />
          {rollbackError && (
            <p
              role="alert"
              className="mt-1 text-[11px] font-semibold text-[var(--rose-deep)]"
              data-testid="publish-drawer-rollback-error"
            >
              {rollbackError}
            </p>
          )}
          <div className="mt-2 flex gap-2">
            <button
              type="button"
              onClick={onConfirmRollback}
              disabled={rollbackPending}
              data-testid="publish-drawer-rollback-confirm-button"
              className={AMBER_PILL}
            >
              <RotateCcw size={12} />
              {rollbackPending ? 'Rolling back…' : 'Confirm rollback'}
            </button>
            <button
              type="button"
              onClick={onCancelRollback}
              className={NEUTRAL_PILL}
            >
              Cancel
            </button>
          </div>
        </section>
      )}

      <div className="mt-auto flex flex-col gap-2 border-t border-[var(--hairline)] pt-3">
        <div className="grid grid-cols-2 gap-2">
          <button
            type="button"
            onClick={onOpenPdf}
            disabled={!hasPdf}
            data-testid="publish-drawer-open-pdf"
            className={NEUTRAL_PILL}
            title={hasPdf ? 'Open the branded proposal PDF' : 'No proposal id linked'}
          >
            <FileDown size={12} /> Open PDF
          </button>
          <button
            type="button"
            onClick={onViewAudit}
            disabled={!onViewAudit}
            data-testid="publish-drawer-view-audit"
            className={NEUTRAL_PILL}
          >
            <History size={12} /> View audit
          </button>
        </div>
        <button
          type="button"
          onClick={onOpenRollback}
          disabled={!withinRollback || rollbackOpen || rolledBack}
          data-testid="publish-drawer-rollback"
          className={AMBER_PILL}
          title={
            rolledBack
              ? 'Already rolled back'
              : withinRollback
                ? 'Rollback within 72 h of publish'
                : 'Rollback window expired (72 h)'
          }
        >
          <RotateCcw size={12} /> Rollback (within 72 h)
        </button>
        <button type="button" onClick={onClose} className={NEUTRAL_PILL}>
          Close
        </button>
      </div>
    </>
  );
}

function NotificationRow({ n }: { n: NotificationDispatched }) {
  const Icon = channelIcon(n.channel);
  const failed = n.status !== 'sent';
  return (
    <li
      className="flex items-start gap-1.5"
      data-testid="publish-drawer-fanout-row"
      data-channel={n.channel}
      data-status={n.status}
    >
      <Icon
        size={12}
        className={failed ? 'mt-0.5 text-[var(--amber)]' : 'mt-0.5 text-[var(--muted)]'}
      />
      <span className="flex-1">
        <span className="font-semibold text-[var(--ink)]">{n.channel}</span>{' '}
        <span className="text-[var(--muted)]">→ {n.recipient}</span>
      </span>
      {failed ? (
        <span
          className="inline-flex items-center gap-1 rounded-md border border-[var(--amber-border)] bg-[var(--amber-bg)] px-1.5 py-0.5 text-[10.5px] font-semibold text-[var(--amber)]"
          title={n.error ?? 'Notification failed'}
        >
          <XCircle size={10} /> {n.status}
        </span>
      ) : (
        <span className="inline-flex items-center gap-1 rounded-md border border-[var(--green-border)] bg-[var(--green-bg)] px-1.5 py-0.5 text-[10.5px] font-semibold text-[var(--green)]">
          <CheckCircle2 size={10} /> sent
        </span>
      )}
    </li>
  );
}
