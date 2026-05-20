import { useNavigate } from 'react-router-dom';
import type { EscalationAction, EscalationCard, EscalationsSectionData } from '@/types/quotes';
import { TierChip } from './TierChip';

interface Props {
  data: EscalationsSectionData;
  onJumpByRep: () => void;
}

const actionPalette: Record<EscalationAction['variant'], { bg: string; text: string; border: string; hover: string }> = {
  floor: {
    bg: 'var(--rose-bg)',
    text: 'var(--rose-deep)',
    border: 'var(--rose-tint)',
    hover: 'rgba(248,237,237,0.7)',
  },
  counter: {
    bg: 'var(--surface-soft)',
    text: 'var(--ink)',
    border: 'var(--border)',
    hover: '#f7f9fb',
  },
  approve: {
    bg: 'var(--green-bg)',
    text: 'var(--green)',
    border: 'var(--green-bg)',
    hover: 'rgba(227,239,230,0.7)',
  },
  decline: {
    bg: 'white',
    text: 'var(--ink-2)',
    border: 'var(--border)',
    hover: '#f7f9fb',
  },
};

function CardView({ card, onJumpStudio }: { card: EscalationCard; onJumpStudio: (toast: string) => void }) {
  return (
    <div
      id={`esc-card-${card.rank}`}
      className="grid grid-cols-[40px_minmax(0,1fr)_280px] gap-4 rounded-[14px] border border-[var(--border)] bg-white p-[18px_20px] shadow-[var(--shadow-card)]"
    >
      <div className="flex h-9 w-9 items-center justify-center rounded-[10px] bg-[var(--surface-sunken)] font-display text-[15px] font-bold text-[var(--ink-2)]">
        {card.rank}
      </div>
      <div className="min-w-0">
        <h4 className="flex flex-wrap items-center gap-2 font-display text-[15px] font-bold leading-tight tracking-[-0.012em] text-[var(--ink)]">
          <span>Quote #{card.quoteId}</span>
          <span className="text-[var(--muted)]">·</span>
          <span className="flex items-center"><TierChip tier={card.tier} />Customer {card.customer}</span>
          <span className="text-[var(--muted)]">·</span>
          <span>
            Article {card.article}
            {card.articleDescription && <span className="ml-1 text-[12.5px] font-medium text-[var(--muted)]">({card.articleDescription})</span>}
          </span>
          <span
            className="rounded-[5px] px-1.5 py-0.5 text-[10.5px] font-bold"
            style={
              card.authority === 'md'
                ? { background: 'var(--rose-bg)', color: 'var(--rose-deep)' }
                : { background: 'var(--green-bg)', color: 'var(--green)' }
            }
          >
            {card.authority === 'md' ? '↗ Needs MD' : '✓ Your authority'}
          </span>
          <button
            type="button"
            onClick={() => onJumpStudio(card.studioJumpToast)}
            className="ml-auto text-[11.5px] font-semibold text-[var(--rose-deep)] hover:underline"
          >
            ↗ Studio
          </button>
        </h4>
        <div
          className="mt-2.5 text-[13px] leading-[1.6] text-[var(--ink-2)] [&_b]:font-semibold [&_b]:text-[var(--ink)]"
          dangerouslySetInnerHTML={{ __html: card.detailHtml }}
        />
        <div
          className="mt-2.5 rounded-[7px] border-l-[3px] border-[var(--rose)] bg-[var(--surface-soft)] p-2.5 px-3.5 text-[12px] leading-[1.6] text-[var(--ink-3)] [&_b]:font-semibold [&_b]:text-[var(--ink)]"
          dangerouslySetInnerHTML={{ __html: card.evidenceHtml }}
        />
        {card.metaLine && (
          <div className="mt-2 text-[11.5px] italic text-[var(--muted)]">{card.metaLine}</div>
        )}
      </div>
      <div className="flex flex-col gap-1.5">
        {card.actions.map((a) => {
          const p = actionPalette[a.variant];
          return (
            <button
              key={a.id}
              type="button"
              className="rounded-[8px] border px-3 py-2 text-left text-[12px] font-medium transition-colors"
              style={{ background: p.bg, color: p.text, borderColor: p.border }}
              onMouseEnter={(e) => (e.currentTarget.style.background = p.hover)}
              onMouseLeave={(e) => (e.currentTarget.style.background = p.bg)}
            >
              {a.label}
            </button>
          );
        })}
      </div>
    </div>
  );
}

export function EscalationsSection({ data, onJumpByRep }: Props) {
  const nav = useNavigate();
  return (
    <section className="mb-4 flex flex-col gap-3">
      <div className="rounded-[14px] border border-[var(--border)] bg-white p-[18px_20px] shadow-[var(--shadow-card)]">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h2 className="font-display text-[18px] font-bold leading-tight tracking-[-0.018em] text-[var(--ink)]">
              {data.title}
            </h2>
            <div className="mt-1 max-w-[60ch] text-[12px] leading-[1.5] text-[var(--muted)]">{data.subtitle}</div>
          </div>
          <span className="rounded-[7px] bg-[var(--surface-sunken)] px-2.5 py-[3px] text-[11px] font-semibold text-[var(--ink-2)]">
            {data.reRankedChip}
          </span>
        </div>

        <div className="mt-3 flex flex-wrap items-center gap-3 rounded-[8px] border border-[var(--rose-tint)] bg-[var(--rose-bg)] px-3.5 py-2.5 text-[12px] text-[var(--ink-2)]">
          <span className="text-[14px]" aria-hidden="true">🎯</span>
          <span
            className="flex-1 [&_b]:font-semibold [&_b]:text-[var(--ink)]"
            dangerouslySetInnerHTML={{ __html: data.concentrationHtml }}
          />
          <button
            type="button"
            onClick={onJumpByRep}
            className="text-[11.5px] font-semibold text-[var(--rose-deep)] hover:underline"
          >
            See by-rep view →
          </button>
        </div>

        <div className="mt-2.5 flex flex-wrap items-center gap-3 rounded-[8px] border border-[var(--violet-bg)] bg-[var(--violet-bg)] px-3.5 py-2.5 text-[12px] text-[var(--violet)]">
          <span className="text-[14px]" aria-hidden="true">⚡</span>
          <span
            className="flex-1 [&_b]:font-semibold [&_b]:text-[var(--violet)]"
            dangerouslySetInnerHTML={{ __html: data.bulkRecommendationHtml }}
          />
          <button
            type="button"
            className="rounded-[8px] bg-[var(--violet)] px-3 py-1.5 text-[11.5px] font-semibold text-white hover:opacity-90"
          >
            {data.bulkAcceptLabel}
          </button>
        </div>
      </div>

      {data.cards.map((c) => (
        <CardView key={c.rank} card={c} onJumpStudio={() => nav('/pricing')} />
      ))}
    </section>
  );
}
