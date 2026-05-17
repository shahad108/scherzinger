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

interface Props {
  data: DecisionData;
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

export function DecisionFooter({
  data,
  activeOption,
  currentPriceLabel,
  proposalId,
  onScrollToApproval,
}: Props) {
  const [params] = useSearchParams();
  const [effectiveDate, setEffectiveDate] = useState(data.effectiveDate);
  const [notify, setNotify] = useState(data.notifyDefaults);
  const [error, setError] = useState<string | null>(null);
  const [publishOpen, setPublishOpen] = useState(false);
  const createProposal = useCreateProposal();
  const runUiAction = useUiAction();
  // Phase 10 — Branded PDF popover state (persona + language).
  const { lang: userLang } = useUserLanguage();
  const [pdfOpen, setPdfOpen] = useState(false);
  const [pdfPersona, setPdfPersona] = useState<PdfPersona>('frank');
  const [pdfLang, setPdfLang] = useState<UserLanguage>(userLang);
  const pdfPopoverRef = useRef<HTMLDivElement | null>(null);
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

  const proposed = activeOption ? activeOption.price : data.summary.proposedPrice;
  const recommendationId = params.get('recommendation') ?? null;
  const articleId = data.summary.aid;

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
    // Active option label looks like "€5.10" or "5,10" — normalise.
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
        margin: data.summary.margin,
        recovery: data.summary.recovery,
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

  return (
    <div className="ws-decision">
      <div className="ws-decision-summary">
        You're proposing <b>{proposed}</b> on Article <b>{articleId}</b> · projected margin{' '}
        <b>{data.summary.margin}</b> · projected recovery <b>{data.summary.recovery}</b> ·{' '}
        <b>{data.summary.riskLine}</b>.
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
        <button
          type="button"
          className="btn primary"
          onClick={() => handleSave(false, 'Saved as draft proposal')}
          disabled={createProposal.isPending}
        >
          📌 {createProposal.isPending ? 'Saving…' : 'Save as proposal'}
        </button>
        <button
          type="button"
          className="btn"
          onClick={() => handleSave(true, 'Queued for weekly approval')}
          disabled={createProposal.isPending}
        >
          🗂 {createProposal.isPending && notify.escalate ? 'Queuing…' : 'Add to weekly queue'}
        </button>
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
    </div>
  );
}
