import { Fragment, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ChevronRight } from 'lucide-react';
import type { ActiveQuoteDetailAction, ActiveQuoteRow, ActiveQuotesSectionData, Rag } from '@/types/quotes';
import { TierChip } from './TierChip';

interface Props {
  data: ActiveQuotesSectionData;
  onJumpToEscalation: (rank: number) => void;
}

const ragDot: Record<Rag, string> = {
  r: 'var(--red)',
  a: 'var(--amber)',
  g: 'var(--green)',
};

const ragBg: Record<Rag, { bg: string; color: string }> = {
  r: { bg: 'var(--rose-bg)',  color: 'var(--rose-deep)' },
  a: { bg: 'var(--amber-bg)', color: 'var(--amber)' },
  g: { bg: 'var(--green-bg)', color: 'var(--green)' },
};

const ageColor = (tone: ActiveQuoteRow['ageTone']) => {
  if (tone === 'fresh') return 'var(--green)';
  if (tone === 'warm') return 'var(--amber)';
  return 'var(--red)';
};

const floorColor = (tone: ActiveQuoteRow['floorTone']) => {
  if (tone === 'below') return 'var(--red)';
  if (tone === 'above') return 'var(--green)';
  return 'var(--ink-3)';
};

const detailActionPalette: Record<ActiveQuoteDetailAction['variant'], { bg: string; color: string; border: string }> = {
  floor:   { bg: 'var(--rose-bg)',     color: 'var(--rose-deep)', border: 'var(--rose-tint)' },
  counter: { bg: 'var(--surface-soft)',color: 'var(--ink)',       border: 'var(--border)' },
  approve: { bg: 'var(--green-bg)',    color: 'var(--green)',     border: 'var(--green-bg)' },
  decline: { bg: 'white',              color: 'var(--ink-2)',     border: 'var(--border)' },
  hold:    { bg: 'var(--surface-sunken)', color: 'var(--ink-2)',  border: 'var(--border)' },
};

export function ActiveQuotesTable({ data, onJumpToEscalation }: Props) {
  const nav = useNavigate();
  const [activeFilter, setActiveFilter] = useState<'all' | Rag>('all');
  const [expanded, setExpanded] = useState<string | null>(null);

  const visibleRows = data.rows.filter((r) => activeFilter === 'all' || r.rag === activeFilter);

  return (
    <section
      id="active-quotes-block"
      className="mb-4 rounded-[14px] border border-[var(--border)] bg-white p-[18px_20px] shadow-[var(--shadow-card)]"
    >
      <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="font-display text-[18px] font-bold leading-tight tracking-[-0.018em] text-[var(--ink)]">
            {data.title}
          </h2>
          <div className="mt-1 max-w-[60ch] text-[12px] leading-[1.5] text-[var(--muted)]">{data.subtitle}</div>
        </div>
        <div className="inline-flex flex-wrap gap-0.5 rounded-[10px] bg-[var(--surface-sunken)] p-[3px]">
          {data.ragFilters.map((f) => {
            const isActive = activeFilter === f.id;
            const dotStyle = f.id === 'all' ? null : ragDot[f.id as Rag];
            return (
              <button
                key={f.id}
                type="button"
                onClick={() => setActiveFilter(f.id)}
                aria-pressed={isActive}
                className={`flex items-center gap-1.5 rounded-[8px] px-3 py-[7px] text-[12.5px] transition-all ${
                  isActive
                    ? 'bg-white font-semibold text-[var(--ink)] shadow-[var(--shadow-card)]'
                    : 'font-medium text-[var(--ink-3)] hover:text-[var(--ink-2)]'
                }`}
              >
                {dotStyle && (
                  <span className="inline-block h-1.5 w-1.5 rounded-full" style={{ background: dotStyle }} aria-hidden="true" />
                )}
                <span>{f.label}</span>
                <b className="font-bold">{f.count}</b>
              </button>
            );
          })}
        </div>
      </div>

      <div className="mb-3 flex flex-wrap items-center gap-3 rounded-[8px] border border-[var(--hairline)] bg-[var(--surface-soft)] px-3.5 py-2.5 text-[12px] text-[var(--ink-3)]">
        <span className="flex-1 [&_b]:font-semibold [&_b]:text-[var(--ink)]" dangerouslySetInnerHTML={{ __html: data.bulkInfoHtml }} />
        {data.bulkActions.map((a) => (
          <button
            key={a.id}
            type="button"
            className="rounded-[8px] border border-[var(--ink)] bg-[var(--ink)] px-3 py-1.5 text-[11.5px] font-medium text-white"
          >
            {a.label}
          </button>
        ))}
      </div>

      <div className="overflow-hidden rounded-[11px] border border-[var(--border)]">
        <table className="w-full text-[12.5px]">
          <thead>
            <tr className="bg-[var(--surface-soft)] text-left text-[10.5px] uppercase tracking-[0.06em] text-[var(--muted)]">
              {['Quote #', 'Customer', 'Article', 'Quoted price', 'Margin', 'Floor reference', 'Age', 'Guardrail', 'Action'].map((h) => (
                <th key={h} className="px-3 py-2.5 font-bold">{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {visibleRows.map((r) => {
              const isOpen = expanded === r.id;
              const ragStyle = ragBg[r.rag];
              const rowBg = r.rag === 'r' ? '#fef2f2' : undefined;
              return (
                <Fragment key={r.id}>
                  <tr
                    onClick={() => setExpanded(isOpen ? null : r.id)}
                    className="cursor-pointer transition-colors hover:bg-[var(--surface-soft)]"
                    style={rowBg ? { background: rowBg } : undefined}
                  >
                    <td className="border-t border-[var(--hairline)] px-3 py-2.5">
                      <ChevronRight
                        size={11}
                        className="mr-1.5 inline-block transition-transform"
                        style={{ transform: isOpen ? 'rotate(90deg)' : 'none', color: 'var(--muted)' }}
                      />
                      <b className="font-bold tabular-nums">{r.id}</b>
                    </td>
                    <td className="border-t border-[var(--hairline)] px-3 py-2.5">
                      <span className="inline-flex items-center"><TierChip tier={r.tier} />{r.customer}</span>
                    </td>
                    <td className="border-t border-[var(--hairline)] px-3 py-2.5">{r.article}</td>
                    <td className="border-t border-[var(--hairline)] px-3 py-2.5 text-right tabular-nums">{r.quotedPrice}</td>
                    <td
                      className="border-t border-[var(--hairline)] px-3 py-2.5 text-right tabular-nums font-semibold"
                      style={{ color: r.marginTone === 'pos' ? 'var(--green)' : r.marginTone === 'neg' ? 'var(--red)' : 'var(--ink-2)' }}
                    >
                      {r.margin}
                    </td>
                    <td className="border-t border-[var(--hairline)] px-3 py-2.5">
                      <span className="text-[11.5px]" style={{ color: floorColor(r.floorTone) }}>
                        {r.floorReference}
                      </span>
                    </td>
                    <td className="border-t border-[var(--hairline)] px-3 py-2.5">
                      <span
                        className="inline-flex items-center rounded-[5px] px-2 py-0.5 text-[10.5px] font-bold"
                        style={{
                          background: r.ageTone === 'fresh' ? 'var(--green-bg)' : r.ageTone === 'warm' ? 'var(--amber-bg)' : 'var(--rose-bg)',
                          color: ageColor(r.ageTone),
                        }}
                      >
                        {r.age}
                      </span>
                    </td>
                    <td className="border-t border-[var(--hairline)] px-3 py-2.5">
                      <span
                        className="inline-flex items-center gap-1.5 rounded-[6px] px-2.5 py-[3px] text-[11px] font-semibold"
                        style={{ background: ragStyle.bg, color: ragStyle.color }}
                      >
                        <span className="inline-block h-1.5 w-1.5 rounded-full" style={{ background: ragDot[r.rag] }} aria-hidden="true" />
                        {r.guardrailLabel}
                      </span>
                    </td>
                    <td className="border-t border-[var(--hairline)] px-3 py-2.5">
                      <div className="flex flex-wrap gap-1.5">
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            if (r.rowActionTarget === 'escalation') {
                              const rankFromId: Record<string, number> = { '12848': 1, '12831': 2 };
                              onJumpToEscalation(rankFromId[r.id] ?? 1);
                            } else {
                              nav('/pricing');
                            }
                          }}
                          className={`rounded-[8px] px-2.5 py-1.5 text-[11.5px] font-medium ${
                            r.rowActionPrimary
                              ? 'border border-[var(--ink)] bg-[var(--ink)] text-white'
                              : 'border border-[var(--border)] bg-white text-[var(--ink-2)] hover:bg-[#f7f9fb]'
                          }`}
                        >
                          {r.rowActionLabel}
                        </button>
                        {r.rowActionTarget === 'escalation' && (
                          <button
                            type="button"
                            onClick={(e) => { e.stopPropagation(); nav('/pricing'); }}
                            className="rounded-[8px] border border-[var(--border)] bg-white px-2.5 py-1.5 text-[11.5px] font-medium text-[var(--ink-2)] hover:bg-[#f7f9fb]"
                          >
                            Studio
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                  {isOpen && (
                    <tr style={rowBg ? { background: rowBg } : undefined}>
                      <td colSpan={9} className="border-t border-[var(--hairline)] px-3 py-3">
                        <div className="grid grid-cols-1 gap-3 lg:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)]">
                          <div className="rounded-[8px] border-l-[3px] border-[var(--rose)] bg-[var(--surface-soft)] p-3 px-3.5">
                            <h6 className="mb-1.5 text-[10.5px] font-bold uppercase tracking-[0.06em] text-[var(--muted)]">Evidence</h6>
                            <div
                              className="text-[12px] leading-[1.55] text-[var(--ink-3)] [&_b]:font-semibold [&_b]:text-[var(--ink)]"
                              dangerouslySetInnerHTML={{ __html: r.evidenceHtml }}
                            />
                            <div className="mt-2 text-[11.5px] italic text-[var(--muted)]">{r.metaLine}</div>
                          </div>
                          <div className="flex flex-col gap-1.5">
                            <h6 className="text-[10.5px] font-bold uppercase tracking-[0.06em] text-[var(--muted)]">Decide</h6>
                            {r.detailActions.map((a) => {
                              const p = detailActionPalette[a.variant];
                              return (
                                <button
                                  key={a.id}
                                  type="button"
                                  onClick={(e) => e.stopPropagation()}
                                  className="rounded-[8px] border px-3 py-2 text-left text-[12px] font-medium transition-colors hover:opacity-90"
                                  style={{ background: p.bg, color: p.color, borderColor: p.border }}
                                >
                                  {a.label}
                                </button>
                              );
                            })}
                          </div>
                        </div>
                      </td>
                    </tr>
                  )}
                </Fragment>
              );
            })}
          </tbody>
        </table>
      </div>
      <p
        className="mt-3 text-[11.5px] text-[var(--muted)] [&_a]:text-[var(--rose-deep)] [&_a]:underline"
        dangerouslySetInnerHTML={{ __html: data.footerNoteHtml }}
      />
    </section>
  );
}
