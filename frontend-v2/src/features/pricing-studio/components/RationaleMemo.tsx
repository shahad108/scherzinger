import { useMemo, useState } from 'react';
import { usePdfDraft, type PdfDraftPayload } from '@/data/api/usePdfDraft';
import type {
  CustomerFanoutSummary,
  MemoData,
  MemoSection,
  RecommendationBlock,
  WorkbenchBlockMeta,
} from '@/types/studio';
import { renderInline } from './renderInline';
import { useBriefing } from '@/data/api/useBriefing';
import { fmt } from '@/lib/format';
import { parseDecimal } from '../lib/decimal';

interface Props {
  /** The currently-selected article — drives the live briefing fetch. */
  aid?: string | null;
  /**
   * Static seed memo (still used as a fallback while the briefing loads).
   *
   * Can be ``undefined`` while the workbench query is loading OR when the
   * BFF reports a non-live status for the ``memo`` block — the component
   * renders an empty-state card in that case rather than crashing on
   * ``data.title`` / ``data.paragraphs`` access.
   */
  data: MemoData | undefined;
  /** Persona override for briefing tone. Defaults to ``frank``. */
  persona?: string;
  /**
   * Phase A — per-block status from
   * ``workbench.meta.blocks.memo``. When ``'empty'`` we render the
   * pre-decision placeholder; ``'live'`` triggers the markdown renderer.
   */
  blockMeta?: WorkbenchBlockMeta | null;
  /** Recommendation block — used to source the recommended price for
   *  the recovery-vs-loss callout. */
  recommendation?: RecommendationBlock;
  /** Customer fan-out summary at the proposed price — drives the
   *  "Recommending even with N at-risk" sentence. */
  fanoutSummary?: CustomerFanoutSummary | null;
  /** Opens the new EmailDraftDrawer when present. */
  onOpenEmail?: () => void;
}

/**
 * Convert the BFF's `rationale_md` markdown blob into the same
 * `MemoSection[]` shape the seed renderer expects. Splits on blank
 * lines for paragraphs; bullet lines stay inline (renderInline already
 * handles `**bold**` / `*italic*` / `` `code` ``).
 *
 * The memo is BFF-authored — we never construct prose client-side from
 * raw facts (recommendation/wtp/competitor). All authoring lives in
 * ``services/briefing/*`` so paragraph order, persona tone, and language
 * are owned by the backend.
 */
function paragraphsFromMarkdown(md: string): MemoSection[] {
  const trimmed = md.trim();
  if (!trimmed) return [];
  return trimmed
    .split(/\n{2,}/)
    .map((block) => block.trim())
    .filter(Boolean)
    .map((body) => ({ body }));
}

export function RationaleMemo({
  aid,
  data,
  persona = 'frank',
  blockMeta,
  recommendation,
  fanoutSummary,
  onOpenEmail,
}: Props) {
  const briefing = useBriefing(aid ?? null, persona);

  const memoStatus = blockMeta?.status ?? 'live';

  const { paragraphs, source } = useMemo(() => {
    const md = briefing.data?.rationale_md?.trim() ?? '';
    if (md) {
      const live = paragraphsFromMarkdown(md);
      if (live.length > 0) {
        return { paragraphs: live, source: 'live' as const };
      }
    }
    return {
      paragraphs: data?.paragraphs ?? [],
      source: 'fallback' as const,
    };
  }, [briefing.data, data?.paragraphs]);

  // Guard against an undefined workbench `memo` block. Every nested-field
  // access below (data.title / data.paragraphs) would crash otherwise.
  // The parent passes `wb?.memo` which is undefined while the workbench
  // is loading OR when the BFF reports a non-live status for the memo
  // block. The briefing fetch may still produce live paragraphs in that
  // case, so we only short-circuit when BOTH the seed and the live
  // briefing are empty.
  if (!data && paragraphs.length === 0) {
    return (
      <div
        role="note"
        data-testid="rationale-memo-missing"
        style={{
          margin: '14px 0',
          padding: '14px 16px',
          borderRadius: 12,
          background: 'var(--surface-sunken)',
          border: '1px dashed var(--hairline)',
          color: 'var(--ink-2)',
          fontSize: 12.5,
          lineHeight: 1.45,
        }}
      >
        <div
          style={{
            fontWeight: 700,
            color: 'var(--ink)',
            fontSize: 12,
            marginBottom: 4,
          }}
        >
          Rationale memo unavailable
        </div>
        <div>
          {blockMeta?.reason
            ? blockMeta.reason
            : 'Memo will be generated when Frank accepts or proposes a price.'}
        </div>
      </div>
    );
  }

  const isDrafting = briefing.isLoading && !briefing.data;

  // Phase C6 — when the backend marks the memo block ``empty`` (no
  // decision has been authored for this SKU yet) we replace the body
  // with a quiet placeholder. The header keeps its actions so Frank can
  // still kick off an email / PDF once the memo lands.
  const isEmpty = memoStatus === 'empty';

  const pdfDraft = usePdfDraft(aid ?? null);
  const [pdfPreview, setPdfPreview] = useState<PdfDraftPayload | null>(null);
  const onGeneratePdf = () => {
    pdfDraft.mutate(
      { persona: (persona as 'frank' | 'till' | 'manuel') ?? 'till', lang: 'en' },
      { onSuccess: (data) => setPdfPreview(data) },
    );
  };
  const onCopyMemo = async () => {
    try {
      const text = paragraphs.map((p) => p.body ?? '').join('\n\n');
      if (text) await navigator.clipboard.writeText(text);
    } catch {
      /* clipboard denied — silent fallback; the user can still select+copy. */
    }
  };

  return (
    <div
      className="ws-memo"
      data-source={source}
      data-status={memoStatus}
      data-testid="rationale-memo"
    >
      <div className="ws-memo-head">
        <span className="ws-memo-title">{data?.title ?? 'Decision memo'}</span>
        <span className="ws-memo-edit">click to edit</span>
        <button
          type="button"
          className="btn"
          data-testid="rationale-memo-regenerate"
          disabled={briefing.isFetching}
          onClick={() => briefing.refetch()}
          title="Re-run the briefing pipeline and re-fetch the memo."
        >
          {briefing.isFetching ? '↻ …' : '↻ Regenerate'}
        </button>
        <button
          type="button"
          className="btn"
          data-testid="rationale-memo-copy"
          onClick={onCopyMemo}
        >
          📋 Copy
        </button>
        <button
          type="button"
          className="btn"
          data-testid="rationale-memo-email"
          onClick={() => onOpenEmail?.()}
        >
          ✉ Email to Till
        </button>
        <button
          type="button"
          className="btn"
          data-testid="rationale-memo-pdf"
          disabled={pdfDraft.isPending}
          onClick={onGeneratePdf}
        >
          {pdfDraft.isPending ? '⬇ Drafting…' : '⬇ Branded PDF'}
        </button>
        {source === 'live' && !isEmpty && (
          <span
            className="ws-memo-source"
            data-testid="rationale-source-chip"
            style={{
              marginLeft: 'auto',
              fontSize: 10,
              color: 'var(--ink-2)',
              fontWeight: 600,
              letterSpacing: '0.05em',
              textTransform: 'uppercase',
            }}
          >
            live
          </span>
        )}
      </div>
      {fanoutSummary && fanoutSummary.at_risk_count > 0 && recommendation && (
        <RecoveryVsLossCallout
          summary={fanoutSummary}
          recommendedPrice={recommendation.recommended_price}
        />
      )}
      <div className="ws-memo-body" contentEditable suppressContentEditableWarning>
        {isEmpty ? (
          <p
            data-testid="rationale-memo-empty"
            style={{ color: 'var(--muted)', fontStyle: 'italic', fontSize: 12.5 }}
          >
            Memo will be generated when Frank accepts or proposes a price.
          </p>
        ) : isDrafting ? (
          <p style={{ color: 'var(--ink-2)', fontStyle: 'italic' }}>Drafting rationale…</p>
        ) : (
          paragraphs.map((p, i) => {
            // Detect inline bullet runs of the form
            //   "Why €X? - Reason 1. - Reason 2. - Reason 3."
            // and surface them as a proper list + lead-in sentence. The
            // BFF authors the memo as a single markdown blob; surfacing
            // each bullet on its own line is purely a presentation choice
            // — paragraph order, copy and persona tone stay BFF-owned.
            const body = p.body ?? '';
            const dashSplit = body.split(/\s+-\s+(?=\S)/);
            if (dashSplit.length >= 3) {
              const [lead, ...bullets] = dashSplit;
              return (
                <div key={i} className={p.isSig ? 'sig' : undefined}>
                  <p style={{ fontWeight: 600, margin: 0 }}>
                    {renderInline(lead.trim())}
                  </p>
                  <ul
                    style={{
                      listStyle: 'disc',
                      paddingLeft: 18,
                      margin: '6px 0 0',
                    }}
                  >
                    {bullets.map((b, j) => (
                      <li key={j} style={{ marginBottom: 2 }}>
                        {renderInline(b.replace(/\s+$/, ''))}
                      </li>
                    ))}
                  </ul>
                </div>
              );
            }
            return (
              <p key={i} className={p.isSig ? 'sig' : undefined}>
                {renderInline(p.body)}
              </p>
            );
          })
        )}
      </div>
      {pdfPreview && (
        <PdfNarrativePreview
          preview={pdfPreview}
          onClose={() => setPdfPreview(null)}
        />
      )}
    </div>
  );
}

function PdfNarrativePreview({
  preview,
  onClose,
}: {
  preview: PdfDraftPayload;
  onClose: () => void;
}) {
  return (
    <div
      data-testid="pdf-narrative-preview"
      style={{
        marginTop: 12,
        padding: 14,
        border: '1px solid var(--hairline)',
        borderRadius: 12,
        background: 'var(--surface-soft)',
      }}
    >
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: 8,
          marginBottom: 8,
        }}
      >
        <strong style={{ fontSize: 12, color: 'var(--ink)' }}>
          PDF narrative preview · {preview.persona_used} · {preview.lang}
        </strong>
        <button
          type="button"
          className="btn"
          data-testid="pdf-narrative-close"
          onClick={onClose}
        >
          Close
        </button>
      </div>
      <p
        data-testid="pdf-narrative-exec"
        style={{ fontSize: 12.5, color: 'var(--ink-2)', margin: '0 0 8px' }}
      >
        {preview.exec_summary}
      </p>
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))',
          gap: 10,
        }}
      >
        {[
          { title: 'Key facts', items: preview.bullets, color: 'var(--ink)' },
          { title: 'Risks', items: preview.risks, color: 'var(--rose-deep)' },
          { title: 'Next steps', items: preview.next_steps, color: 'var(--green-deep)' },
        ].map((b) => (
          <div key={b.title}>
            <div
              style={{
                fontSize: 10.5,
                fontWeight: 700,
                letterSpacing: '0.06em',
                textTransform: 'uppercase',
                color: b.color,
                marginBottom: 4,
              }}
            >
              {b.title}
            </div>
            <ul style={{ paddingLeft: 16, margin: 0, fontSize: 12, lineHeight: 1.45 }}>
              {b.items.map((it, i) => (
                <li key={i} style={{ marginBottom: 2 }}>
                  {it}
                </li>
              ))}
            </ul>
          </div>
        ))}
      </div>
      <div
        style={{
          marginTop: 8,
          fontSize: 10.5,
          color: 'var(--ink-3)',
          textAlign: 'right',
        }}
      >
        Generated by {preview.model}
      </div>
    </div>
  );
}

/** Frontend-only narrative line that answers the analyst's question
 *  "why are you still recommending this if there's churn risk?". Data
 *  is sourced from the BFF's `customer_fanout.summary` block — no new
 *  LLM call, no new endpoint, just a structured restatement of the
 *  recovery > loss math. */
function RecoveryVsLossCallout({
  summary,
  recommendedPrice,
}: {
  summary: CustomerFanoutSummary;
  recommendedPrice: string;
}) {
  const recovery = parseDecimal(summary.gross_recovery_eur_yr);
  const loss = parseDecimal(summary.expected_loss_eur_yr);
  const net = parseDecimal(summary.net_recovery_eur_yr);
  const recommendsAnyway = net > 0 && summary.at_risk_count > 0;
  const recPriceNum = parseDecimal(recommendedPrice);
  const recPriceLabel = Number.isFinite(recPriceNum) ? fmt.eurPrecise(recPriceNum) : '—';

  // v1.4 fix: previously the sentence hardcoded "expected recovery X exceeds
  // expected loss Y" regardless of whether net was positive — the memo lied
  // when recovery < loss. Gate wording on the sign of net so the UI tells
  // the truth and surfaces a warning when the engine's recommendation has
  // negative expected contribution.
  const isWarning = net <= 0 && summary.at_risk_count > 0;
  const headlineColor = isWarning ? 'var(--rose-deep)' : 'var(--ink)';
  const comparator = net > 0 ? 'exceeds' : 'is below';
  const comparatorTone = net > 0 ? 'var(--green-deep)' : 'var(--rose-deep)';
  return (
    <div
      data-testid="rationale-recovery-callout"
      style={{
        marginTop: 8,
        padding: '10px 12px',
        borderRadius: 10,
        background: isWarning
          ? 'color-mix(in oklab, var(--rose-bg) 80%, white)'
          : recommendsAnyway
          ? 'color-mix(in oklab, var(--rose-bg) 60%, white)'
          : 'var(--surface-soft)',
        border: isWarning ? '1px solid var(--rose-deep)' : '1px solid var(--hairline)',
        fontSize: 12.5,
        lineHeight: 1.5,
        color: 'var(--ink-2)',
      }}
    >
      <span style={{ fontWeight: 700, color: headlineColor }}>
        {isWarning ? 'Review required at ' : 'Recommending '}
        {recPriceLabel}
      </span>{' '}
      {isWarning ? 'because ' : 'even with '}
      <b style={{ color: 'var(--rose-deep)' }}>{summary.at_risk_count}</b>{' '}
      customer{summary.at_risk_count === 1 ? '' : 's'} at elevated churn risk:
      expected recovery{' '}
      <b style={{ color: 'var(--green-deep)' }}>{fmt.eur(recovery)}/yr</b>{' '}
      <b style={{ color: comparatorTone }}>{comparator}</b> expected loss{' '}
      <b style={{ color: 'var(--rose-deep)' }}>{fmt.eur(loss)}/yr</b> · net{' '}
      <b style={{ color: net >= 0 ? 'var(--green-deep)' : 'var(--rose-deep)' }}>
        {net >= 0 ? '+' : ''}
        {fmt.eur(net)}/yr
      </b>
      .
      {isWarning && (
        <div style={{ marginTop: 4, fontSize: 11, color: 'var(--rose-deep)' }}>
          Loss exceeds recovery — escalate before submitting for approval.
        </div>
      )}
    </div>
  );
}
