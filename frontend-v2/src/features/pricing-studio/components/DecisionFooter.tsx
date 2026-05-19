import { useEffect, useMemo, useRef, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import type { DecisionData } from '@/types/studio';
import { renderInline } from './renderInline';
import type { ActiveOptionView } from './PriceOptions';
import { useCreateProposal } from '@/data/api/useProposals';
import { useUiAction } from '@/hooks/useUiAction';
import { proposalPdfUrl } from '@/data/api/usePublishPrice';
import { useUserLanguage } from '@/data/api/useUserLanguage';
import type { UserLanguage } from '@/data/api/useUserLanguage';
import { PublishConfirmationDrawer } from './PublishConfirmationDrawer';
import { ShareDecisionDrawer } from './ShareDecisionDrawer';
import { ABTestCard } from './ABTestCard';
import { Drawer } from '@/components/ui/Drawer';
import {
  useAcceptDecision,
  useDeclineDecision,
  useSnoozeDecision,
} from '@/data/api/useActions';

type PdfPersona = 'frank' | 'till' | 'manuel';

const PDF_PERSONA_OPTIONS: { value: PdfPersona; label: string }[] = [
  { value: 'frank', label: 'Frank · Analyst' },
  { value: 'till', label: 'Till · CFO' },
  { value: 'manuel', label: 'Manuel · Sales' },
];

const PDF_LANG_OPTIONS: { value: UserLanguage; label: string }[] = [
  { value: 'en', label: 'English' },
  { value: 'de', label: 'Deutsch' },
];

// Phase F (F3) — snooze quick-pick presets. We compute the ISO date on the
// frontend; backend treats payload.until opaquely.
type SnoozePreset = '1d' | '1w' | 'next_review';
const SNOOZE_OPTIONS: { value: SnoozePreset; label: string }[] = [
  { value: '1d', label: 'Snooze 1 day' },
  { value: '1w', label: 'Snooze 1 week' },
  { value: 'next_review', label: 'Snooze until next review' },
];

function snoozeUntilISO(preset: SnoozePreset): string {
  const now = new Date();
  if (preset === '1d') {
    now.setUTCDate(now.getUTCDate() + 1);
  } else if (preset === '1w') {
    now.setUTCDate(now.getUTCDate() + 7);
  } else {
    // Next-review heuristic: snooze 14 days, the typical weekly-queue cadence.
    now.setUTCDate(now.getUTCDate() + 14);
  }
  return now.toISOString();
}

// Lifecycle chip state — kept local to the footer so the optimistic update
// doesn't depend on a refetch. Iron rule §A: the row stays visible after
// Accept/Reject; only the badge changes.
type LifecycleState = 'idle' | 'accepted' | 'rejected' | 'snoozed';

interface Props {
  /**
   * Decision-footer bundle from the workbench. Can be ``undefined`` while
   * the workbench query is loading OR when the BFF reports a non-live
   * status for the ``decision`` block — the component renders an
   * empty-state card in that case rather than crashing on nested
   * ``data.summary`` / ``data.effectiveDate`` / ``data.notifyDefaults``
   * access.
   */
  data: DecisionData | undefined;
  activeOption: ActiveOptionView | null;
  /** Current catalog price string from the workbench hero (e.g. "€ 4.10"). */
  currentPriceLabel?: string | null;
  /** Optional proposal id linked to the active option (enables Publish + PDF). */
  proposalId?: string | null;
  /** Called when "View approval stepper" is clicked. Scrolls to ProposalContextPanel. */
  onScrollToApproval?: () => void;
}

function parsePrice(s: string | null | undefined): number | null {
  if (!s) return null;
  const m = String(s).match(/[\d,.-]+/);
  if (!m) return null;
  const n = parseFloat(m[0].replace(',', '.'));
  return Number.isFinite(n) ? n : null;
}

// Strip "€127.00" → "127.00" so the AB drawer's defaultControlPrice receives
// a plain decimal string the way ABTestCard expects.
function priceToDecimal(label: string | null | undefined): string {
  if (!label) return '';
  return String(label).replace(/[^\d,.\-]/g, '').replace(',', '.');
}

export function DecisionFooter({
  data,
  activeOption,
  currentPriceLabel,
  proposalId,
  onScrollToApproval,
}: Props) {
  const [params] = useSearchParams();
  // Safe defaults so initial render before the workbench `decision` block
  // arrives doesn't throw on undefined; the early-return below replaces
  // the visible UI with an empty-state card until the block lands.
  const [effectiveDate, setEffectiveDate] = useState(
    data?.effectiveDate ?? new Date().toISOString().slice(0, 10),
  );
  const [notify, setNotify] = useState(
    data?.notifyDefaults ?? { sales: false, customers: false, escalate: false, abTest: false },
  );
  const [error, setError] = useState<string | null>(null);
  const [publishOpen, setPublishOpen] = useState(false);
  const [shareOpen, setShareOpen] = useState(false);
  const [snoozeOpen, setSnoozeOpen] = useState(false);
  const [abDrawerOpen, setAbDrawerOpen] = useState(false);
  const [lifecycle, setLifecycle] = useState<LifecycleState>('idle');
  const createProposal = useCreateProposal();
  const acceptMutation = useAcceptDecision();
  const declineMutation = useDeclineDecision();
  const snoozeMutation = useSnoozeDecision();
  const runUiAction = useUiAction();
  // Phase 10 — Branded PDF popover state (persona + language).
  const { lang: userLang } = useUserLanguage();
  const [pdfOpen, setPdfOpen] = useState(false);
  const [pdfPersona, setPdfPersona] = useState<PdfPersona>('frank');
  const [pdfLang, setPdfLang] = useState<UserLanguage>(userLang);
  const pdfPopoverRef = useRef<HTMLDivElement | null>(null);
  const snoozePopoverRef = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    setPdfLang(userLang);
  }, [userLang]);
  useEffect(() => {
    if (!pdfOpen) return;
    const onDown = (e: MouseEvent) => {
      if (!pdfPopoverRef.current?.contains(e.target as Node)) setPdfOpen(false);
    };
    document.addEventListener('mousedown', onDown);
    return () => document.removeEventListener('mousedown', onDown);
  }, [pdfOpen]);
  useEffect(() => {
    if (!snoozeOpen) return;
    const onDown = (e: MouseEvent) => {
      if (!snoozePopoverRef.current?.contains(e.target as Node)) setSnoozeOpen(false);
    };
    document.addEventListener('mousedown', onDown);
    return () => document.removeEventListener('mousedown', onDown);
  }, [snoozeOpen]);

  // Defensive reads — when `data` is undefined (workbench loading / non-live
  // decision block) the early-return below shows the empty-state card; these
  // values only matter when `data` is present, but they execute on every
  // render and must not crash. `?? ''` keeps types narrow downstream.
  const proposed = activeOption
    ? activeOption.price
    : data?.summary?.proposedPrice ?? '';
  const recommendationId = params.get('recommendation') ?? null;
  const articleId = data?.summary?.aid ?? '';

  const proposedPriceNum = parsePrice(proposed);
  const currentPriceNum = parsePrice(currentPriceLabel ?? null);
  const deltaPp =
    proposedPriceNum != null && currentPriceNum != null && currentPriceNum > 0
      ? ((proposedPriceNum - currentPriceNum) / currentPriceNum) * 100
      : null;

  // Decimal-as-string for the Publish mutation. Re-derived from the active
  // option's price string so cent precision is preserved end-to-end (the
  // BFF's PublishIn accepts a Decimal, never a JS float).
  const proposedPriceDecimal = useMemo(() => {
    if (proposedPriceNum == null) return null;
    const cleaned = String(proposed).replace(/[^\d,.\-]/g, '').replace(',', '.');
    return cleaned.length > 0 ? cleaned : null;
  }, [proposed, proposedPriceNum]);

  function buildBody(approvalRequired: boolean) {
    return {
      article_id: articleId,
      recommendation_id: recommendationId,
      current_price: currentPriceNum,
      proposed_price: proposedPriceNum,
      delta_pp: deltaPp,
      approval_required: approvalRequired,
      payload: {
        effective_date: effectiveDate,
        notify,
        proposed_label: proposed,
        current_label: currentPriceLabel ?? null,
        margin: data?.summary?.margin ?? null,
        recovery: data?.summary?.recovery ?? null,
      },
    };
  }

  function handleSave(approvalRequired: boolean, label: string) {
    setError(null);
    if (proposedPriceNum == null) {
      setError('Could not parse the proposed price — pick a price option above.');
      return;
    }
    createProposal.mutate(buildBody(approvalRequired), {
      onSuccess: (row) =>
        runUiAction({
          toast: `${label} for ${articleId} (proposal ${row.id.slice(0, 8)}, ${row.status}).`,
        }),
      onError: (err) => setError((err as Error).message),
    });
  }

  // Phase F (F2) — Accept. Optimistic chip → "Accepted"; row stays visible.
  function handleAccept() {
    setError(null);
    const previous = lifecycle;
    setLifecycle('accepted');
    const recId = recommendationId ?? articleId;
    acceptMutation.mutate(
      {
        target_type: 'recommendation',
        target_id: recId,
        recommendation_id: recId,
        article_id: articleId,
        after: { headline: `Accepted ${articleId} @ ${proposed}` },
      },
      {
        onSuccess: () =>
          runUiAction({ toast: `Accepted ${articleId}.` }),
        onError: (err) => {
          setLifecycle(previous);
          setError(`Could not accept: ${(err as Error).message}`);
        },
      },
    );
  }

  // Phase F (F3) — Reject. Row stays visible; chip → "Rejected".
  function handleReject() {
    setError(null);
    const previous = lifecycle;
    setLifecycle('rejected');
    const recId = recommendationId ?? articleId;
    declineMutation.mutate(
      {
        target_type: 'recommendation',
        target_id: recId,
        recommendation_id: recId,
        article_id: articleId,
        reason: null,
        payload: { reason: null },
        after: { headline: `Rejected ${articleId}` },
      },
      {
        onSuccess: () => runUiAction({ toast: `Rejected ${articleId}.` }),
        onError: (err) => {
          setLifecycle(previous);
          setError(`Could not reject: ${(err as Error).message}`);
        },
      },
    );
  }

  // Phase F (F3) — Snooze with preset → ISO until-date.
  function handleSnooze(preset: SnoozePreset) {
    setSnoozeOpen(false);
    setError(null);
    const previous = lifecycle;
    setLifecycle('snoozed');
    const recId = recommendationId ?? articleId;
    const until = snoozeUntilISO(preset);
    snoozeMutation.mutate(
      {
        target_type: 'recommendation',
        target_id: recId,
        recommendation_id: recId,
        article_id: articleId,
        until,
        payload: { until, preset },
        after: { headline: `Snoozed ${articleId} until ${until.slice(0, 10)}` },
      },
      {
        onSuccess: () =>
          runUiAction({
            toast: `Snoozed ${articleId} until ${until.slice(0, 10)}.`,
          }),
        onError: (err) => {
          setLifecycle(previous);
          setError(`Could not snooze: ${(err as Error).message}`);
        },
      },
    );
  }

  const accepting = acceptMutation.isPending;
  const rejecting = declineMutation.isPending;
  const snoozing = snoozeMutation.isPending;
  const anyLifecycleInflight = accepting || rejecting || snoozing;

  const abControlPrice = priceToDecimal(currentPriceLabel) || '0';
  const abVariantPrice = priceToDecimal(proposed) || abControlPrice;

  // No decision data and no active option yet → render nothing. We used to
  // surface a dashed "Decision footer unavailable" placeholder card here,
  // but it added persistent visual noise on every workbench landing. The
  // parent now only synthesises a footer payload after the user has picked
  // a price option (see PricingStudioPage), so this branch reliably means
  // "the user hasn't engaged yet" — keep the canvas clean.
  // Placed after all hooks so React's hook order stays stable across
  // renders as the workbench arrives.
  if (!data || !data.summary || !data.notifyLabels) {
    return null;
  }

  return (
    <div className="ws-decision">
      {lifecycle !== 'idle' && (
        <div
          data-testid="decision-footer-lifecycle-chip"
          className="inline-flex w-fit items-center gap-1.5 rounded-full px-2.5 py-0.5 text-[11px] font-semibold uppercase tracking-wide"
          style={{
            background:
              lifecycle === 'accepted'
                ? 'color-mix(in oklab, var(--emerald, #10b981) 14%, white)'
                : lifecycle === 'rejected'
                  ? 'color-mix(in oklab, var(--rose, #f43f5e) 14%, white)'
                  : 'color-mix(in oklab, var(--amber, #f59e0b) 14%, white)',
            color:
              lifecycle === 'accepted'
                ? 'var(--emerald-deep, #047857)'
                : lifecycle === 'rejected'
                  ? 'var(--rose-deep, #be123c)'
                  : 'var(--amber-deep, #b45309)',
            border: '1px solid var(--hairline)',
          }}
        >
          {lifecycle === 'accepted'
            ? 'Accepted'
            : lifecycle === 'rejected'
              ? 'Rejected'
              : 'Snoozed'}
        </div>
      )}
      {/* Slimmed in the 2026-05-19 coherence pass: projected margin /
          projected recovery used to repeat KPI-tile values above. They
          are now owned by the AI Insights pane + RationaleMemo, so the
          summary line only states what's unique to the footer: the
          actual proposal + the residual risk callout. */}
      <div className="ws-decision-summary">
        You're proposing <b>{proposed}</b> on Article <b>{articleId}</b>.{' '}
        <span style={{ color: 'var(--ink-2)' }}>{data.summary.riskLine}</span>
      </div>
      {error && (
        <div
          role="alert"
          className="mt-2 rounded-lg border border-[var(--red)] bg-[color-mix(in_oklab,var(--red)_8%,white)] px-3 py-2 text-[12.5px] text-[var(--red)]"
        >
          {error}
        </div>
      )}
      <div className="ws-decision-controls">
        <label>
          Effective date{' '}
          <input
            type="date"
            value={effectiveDate}
            onChange={(e) => setEffectiveDate(e.target.value)}
          />
        </label>
        <label>
          <input
            type="checkbox"
            checked={notify.sales}
            onChange={(e) => setNotify((prev) => ({ ...prev, sales: e.target.checked }))}
          />
          {renderInline(data.notifyLabels.sales)}
        </label>
        <label>
          <input
            type="checkbox"
            checked={notify.customers}
            onChange={(e) => setNotify((prev) => ({ ...prev, customers: e.target.checked }))}
          />
          {renderInline(data.notifyLabels.customers)}
        </label>
        <label>
          <input
            type="checkbox"
            checked={notify.escalate}
            onChange={(e) => setNotify((prev) => ({ ...prev, escalate: e.target.checked }))}
          />
          {renderInline(data.notifyLabels.escalate)}
        </label>
        <label>
          <input
            type="checkbox"
            checked={notify.abTest}
            onChange={(e) => setNotify((prev) => ({ ...prev, abTest: e.target.checked }))}
          />
          {renderInline(data.notifyLabels.abTest)}
        </label>
      </div>
      <div className="ws-decision-buttons">
        {/* Phase F (F2) — Accept */}
        <button
          type="button"
          className="btn primary"
          data-testid="decision-footer-accept"
          onClick={handleAccept}
          disabled={anyLifecycleInflight}
          title="Mark this recommendation as accepted."
        >
          ✓ {accepting ? 'Accepting…' : 'Accept'}
        </button>
        {/* Phase F (F3) — Reject */}
        <button
          type="button"
          className="btn"
          data-testid="decision-footer-reject"
          onClick={handleReject}
          disabled={anyLifecycleInflight}
          style={{
            background:
              'color-mix(in oklab, var(--rose, #f43f5e) 8%, white)',
            borderColor: 'var(--rose, #f43f5e)',
            color: 'var(--rose-deep, #be123c)',
          }}
          title="Reject this recommendation. The row stays visible."
        >
          ✕ {rejecting ? 'Rejecting…' : 'Reject'}
        </button>
        {/* Phase F (F3) — Snooze popover */}
        <div ref={snoozePopoverRef} style={{ position: 'relative' }}>
          <button
            type="button"
            className="btn"
            data-testid="decision-footer-snooze"
            aria-expanded={snoozeOpen}
            aria-haspopup="menu"
            onClick={() => setSnoozeOpen((v) => !v)}
            disabled={anyLifecycleInflight}
            title="Snooze this recommendation."
          >
            ⏳ {snoozing ? 'Snoozing…' : 'Snooze'}
          </button>
          {snoozeOpen && (
            <div
              role="menu"
              data-testid="decision-footer-snooze-popover"
              style={{
                position: 'absolute',
                bottom: 'calc(100% + 6px)',
                left: 0,
                zIndex: 30,
                minWidth: 220,
                background: 'var(--surface, #fff)',
                border: '1px solid var(--hairline)',
                borderRadius: 10,
                boxShadow: 'var(--shadow-pop, 0 10px 32px rgba(0,0,0,0.16))',
                padding: 6,
                fontSize: 12.5,
                display: 'flex',
                flexDirection: 'column',
                gap: 2,
              }}
            >
              {SNOOZE_OPTIONS.map((opt) => (
                <button
                  type="button"
                  key={opt.value}
                  role="menuitem"
                  data-testid={`decision-footer-snooze-${opt.value}`}
                  onClick={() => handleSnooze(opt.value)}
                  style={{
                    background: 'transparent',
                    border: 'none',
                    textAlign: 'left',
                    padding: '7px 10px',
                    borderRadius: 6,
                    cursor: 'pointer',
                    color: 'var(--ink-2)',
                  }}
                  onMouseEnter={(e) =>
                    ((e.currentTarget as HTMLElement).style.background =
                      'var(--surface-soft, #f7f9fb)')
                  }
                  onMouseLeave={(e) =>
                    ((e.currentTarget as HTMLElement).style.background = 'transparent')
                  }
                >
                  {opt.label}
                </button>
              ))}
            </div>
          )}
        </div>
        {/* Phase F (F4) — Share */}
        <button
          type="button"
          className="btn"
          data-testid="decision-footer-share"
          onClick={() => setShareOpen(true)}
          title="Share this decision with Till or Heiko."
        >
          ↗ Share
        </button>
        {/* Phase F (F6) — A/B Slice */}
        <button
          type="button"
          className="btn"
          data-testid="decision-footer-ab-slice"
          onClick={() => setAbDrawerOpen(true)}
          title="Open the A/B slice setup pre-filled with the current and proposed prices."
        >
          🧪 A/B Slice
        </button>
        {/* F5 — Save as proposal */}
        <button
          type="button"
          className="btn"
          onClick={() => handleSave(false, 'Saved as draft proposal')}
          disabled={createProposal.isPending}
        >
          📌 {createProposal.isPending ? 'Saving…' : 'Save as proposal'}
        </button>
        {/* F5 — Add to weekly queue */}
        <button
          type="button"
          className="btn"
          onClick={() => handleSave(true, 'Queued for weekly approval')}
          disabled={createProposal.isPending}
        >
          🗂 {createProposal.isPending && notify.escalate ? 'Queuing…' : 'Add to weekly queue'}
        </button>
        {/* F7 — Push to quoting (opens the PublishConfirmationDrawer) */}
        <button
          type="button"
          className="btn dark"
          data-testid="decision-footer-push"
          title={
            proposedPriceDecimal
              ? 'Open the publish confirmation drawer.'
              : 'Pick a price option first.'
          }
          onClick={() => {
            if (!proposedPriceDecimal) {
              setError('Pick a price option before publishing.');
              return;
            }
            setError(null);
            setPublishOpen(true);
          }}
          disabled={!proposedPriceDecimal}
        >
          ⚡ Push to quoting
        </button>
        {/* F5 — View approval stepper */}
        {onScrollToApproval && (
          <button
            type="button"
            className="btn"
            data-testid="decision-footer-view-stepper"
            onClick={() => onScrollToApproval()}
            title="Approval routing is decided by approval_rules — jump to the stepper."
          >
            ↗ View approval stepper
          </button>
        )}
        {/* F8 — Branded PDF popover */}
        <div ref={pdfPopoverRef} style={{ position: 'relative' }}>
          <button
            type="button"
            className="btn"
            data-testid="decision-footer-pdf"
            aria-expanded={pdfOpen}
            aria-haspopup="dialog"
            title={
              proposalId
                ? 'Open the persona + language picker, then generate the branded PDF.'
                : 'Save the proposal first — PDF is tied to a proposal id.'
            }
            onClick={() => {
              if (!proposalId) {
                runUiAction({
                  disabledReason:
                    'Branded PDF needs a saved proposal — save as draft first.',
                });
                return;
              }
              setPdfOpen((v) => !v);
            }}
            disabled={!proposalId}
          >
            📄 Branded PDF
          </button>
          {pdfOpen && proposalId && (
            <div
              role="dialog"
              aria-label="Branded PDF options"
              data-testid="decision-footer-pdf-popover"
              style={{
                position: 'absolute',
                bottom: 'calc(100% + 6px)',
                right: 0,
                zIndex: 30,
                minWidth: 220,
                background: 'var(--surface, #fff)',
                border: '1px solid var(--hairline)',
                borderRadius: 10,
                boxShadow: 'var(--shadow-pop, 0 10px 32px rgba(0,0,0,0.16))',
                padding: 10,
                fontSize: 12,
              }}
            >
              <div style={{ fontWeight: 700, fontSize: 11, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '0.04em', marginBottom: 6 }}>
                Persona
              </div>
              <div role="radiogroup" aria-label="Persona" style={{ display: 'flex', flexDirection: 'column', gap: 4, marginBottom: 8 }}>
                {PDF_PERSONA_OPTIONS.map((opt) => (
                  <label
                    key={opt.value}
                    data-testid={`decision-footer-pdf-persona-${opt.value}`}
                    style={{ display: 'flex', alignItems: 'center', gap: 6, cursor: 'pointer' }}
                  >
                    <input
                      type="radio"
                      name="pdf-persona"
                      value={opt.value}
                      checked={pdfPersona === opt.value}
                      onChange={() => setPdfPersona(opt.value)}
                    />
                    <span>{opt.label}</span>
                  </label>
                ))}
              </div>
              <div style={{ fontWeight: 700, fontSize: 11, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '0.04em', marginBottom: 6 }}>
                Language
              </div>
              <div role="radiogroup" aria-label="Language" style={{ display: 'flex', gap: 8, marginBottom: 10 }}>
                {PDF_LANG_OPTIONS.map((opt) => (
                  <label
                    key={opt.value}
                    data-testid={`decision-footer-pdf-lang-${opt.value}`}
                    style={{ display: 'flex', alignItems: 'center', gap: 4, cursor: 'pointer' }}
                  >
                    <input
                      type="radio"
                      name="pdf-lang"
                      value={opt.value}
                      checked={pdfLang === opt.value}
                      onChange={() => setPdfLang(opt.value)}
                    />
                    <span>{opt.label}</span>
                  </label>
                ))}
              </div>
              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 6 }}>
                <button
                  type="button"
                  className="btn"
                  data-testid="decision-footer-pdf-cancel"
                  onClick={() => setPdfOpen(false)}
                >
                  Cancel
                </button>
                <button
                  type="button"
                  className="btn primary"
                  data-testid="decision-footer-pdf-submit"
                  onClick={() => {
                    if (typeof window !== 'undefined') {
                      window.open(
                        proposalPdfUrl(proposalId, { persona: pdfPersona, lang: pdfLang }),
                        '_blank',
                        'noopener,noreferrer',
                      );
                    }
                    setPdfOpen(false);
                  }}
                >
                  Generate PDF
                </button>
              </div>
            </div>
          )}
        </div>
      </div>

      <PublishConfirmationDrawer
        open={publishOpen}
        onOpenChange={setPublishOpen}
        aid={articleId}
        proposedPrice={proposedPriceDecimal}
        currentPriceLabel={currentPriceLabel ?? null}
        sourceProposalId={proposalId ?? null}
        notifyDefaults={{
          sales: notify.sales,
          customers: notify.customers,
          escalate: notify.escalate,
        }}
        onViewAudit={onScrollToApproval}
      />

      <ShareDecisionDrawer
        open={shareOpen}
        onOpenChange={setShareOpen}
        articleId={articleId}
        recommendationId={recommendationId}
        headline={`${articleId} → ${proposed}`}
      />

      {/* Phase F (F6) — A/B Slice drawer wraps the existing inline ABTestCard
          so the same setup pane the user gets inside PriceOptions is available
          straight from the footer with the current + proposed prices pre-filled. */}
      <Drawer
        open={abDrawerOpen}
        onOpenChange={setAbDrawerOpen}
        width={520}
        title="A/B slice setup"
      >
        <div
          className="flex h-full flex-col"
          data-testid="decision-footer-ab-drawer"
        >
          <header
            className="px-6 pb-4 pt-6"
            style={{ borderBottom: '1px solid var(--hairline)' }}
          >
            <h3 className="text-[15px] font-semibold text-[var(--ink)]">
              A/B slice — {articleId}
            </h3>
            <p className="mt-1 text-[12px] text-[var(--ink-3)]">
              Slice eligible customers between {currentPriceLabel ?? '—'} (control)
              and {proposed} (variant). Promote the winner after the criterion
              is met.
            </p>
          </header>
          <div className="flex-1 overflow-y-auto px-6 py-5">
            <ABTestCard
              aid={articleId}
              defaultControlPrice={abControlPrice}
              defaultVariantPrice={abVariantPrice}
              activeTest={null}
              onCreated={() => setAbDrawerOpen(false)}
            />
          </div>
        </div>
      </Drawer>
    </div>
  );
}
