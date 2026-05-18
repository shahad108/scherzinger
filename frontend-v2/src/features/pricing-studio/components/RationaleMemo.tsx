import { useMemo } from 'react';
import type { MemoData, MemoSection, WorkbenchBlockMeta } from '@/types/studio';
import { renderInline } from './renderInline';
import { useBriefing } from '@/data/api/useBriefing';

interface Props {
  /** The currently-selected article — drives the live briefing fetch. */
  aid?: string | null;
  /** Static seed memo (still used as a fallback while the briefing loads). */
  data: MemoData;
  /** Persona override for briefing tone. Defaults to ``frank``. */
  persona?: string;
  /**
   * Phase A — per-block status from
   * ``workbench.meta.blocks.memo``. When ``'empty'`` we render the
   * pre-decision placeholder; ``'live'`` triggers the markdown renderer.
   */
  blockMeta?: WorkbenchBlockMeta | null;
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

export function RationaleMemo({ aid, data, persona = 'frank', blockMeta }: Props) {
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
    return { paragraphs: data.paragraphs, source: 'fallback' as const };
  }, [briefing.data, data.paragraphs]);

  const isDrafting = briefing.isLoading && !briefing.data;

  // Phase C6 — when the backend marks the memo block ``empty`` (no
  // decision has been authored for this SKU yet) we replace the body
  // with a quiet placeholder. The header keeps its actions so Frank can
  // still kick off an email / PDF once the memo lands.
  const isEmpty = memoStatus === 'empty';

  return (
    <div className="ws-memo" data-source={source} data-status={memoStatus}>
      <div className="ws-memo-head">
        <span className="ws-memo-title">{data.title}</span>
        <span className="ws-memo-edit">click to edit</span>
        <button type="button" className="btn">
          📋 Copy
        </button>
        <button type="button" className="btn">
          ✉ Email to Till
        </button>
        <button type="button" className="btn">
          ⬇ Branded PDF
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
          paragraphs.map((p, i) => (
            <p key={i} className={p.isSig ? 'sig' : undefined}>
              {renderInline(p.body)}
            </p>
          ))
        )}
      </div>
    </div>
  );
}
