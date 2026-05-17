import { useMemo } from 'react';
import type { MemoData, MemoSection } from '@/types/studio';
import { renderInline } from './renderInline';
import { useBriefing } from '@/data/api/useBriefing';

interface Props {
  /** The currently-selected article — drives the live briefing fetch. */
  aid?: string | null;
  /** Static seed memo (still used as a fallback while the briefing loads). */
  data: MemoData;
  /** Persona override for briefing tone. Defaults to ``frank``. */
  persona?: string;
}

/**
 * Convert the BFF's `rationale_md` markdown blob into the same
 * `MemoSection[]` shape the seed renderer expects. Splits on blank
 * lines for paragraphs; bullet lines stay inline (renderInline already
 * handles `**bold**` / `*italic*` / `` `code` ``).
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

export function RationaleMemo({ aid, data, persona = 'frank' }: Props) {
  const briefing = useBriefing(aid ?? null, persona);

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

  return (
    <div className="ws-memo" data-source={source}>
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
        {source === 'live' && (
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
        {isDrafting ? (
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
