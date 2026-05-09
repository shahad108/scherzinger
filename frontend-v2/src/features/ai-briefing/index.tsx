import { useEffect } from 'react';
import { Link } from 'react-router-dom';
import { FileText, Forward, Send } from 'lucide-react';
import { useAi } from '@/data/api/useAi';
import type { AiSideCard } from '@/types/ai';

const tagPalette: Record<NonNullable<AiSideCard['tag']>['tone'], { bg: string; color: string }> = {
  amber:  { bg: 'var(--amber-bg)',  color: 'var(--amber)' },
  green:  { bg: 'var(--green-bg)',  color: 'var(--green)' },
  violet: { bg: 'var(--violet-bg)', color: 'var(--violet)' },
};

const actionIcon = (id: string) => {
  if (id === 'forward') return <Forward size={12} />;
  if (id === 'pdf') return <FileText size={12} />;
  if (id === 'email') return <Send size={12} />;
  return null;
};

export default function AiBriefingPage() {
  const { data, isLoading, error } = useAi();

  useEffect(() => {
    document.body.classList.add('pz-fullbleed');
    return () => {
      document.body.classList.remove('pz-fullbleed');
    };
  }, []);

  if (isLoading) {
    return <div className="w-full px-6 py-8 text-sm text-[var(--muted)]">Lade…</div>;
  }
  if (error || !data) {
    return (
      <div className="w-full px-6 py-8 text-sm text-[var(--red)]">
        Fehler: {(error as Error)?.message ?? 'unbekannt'}
      </div>
    );
  }

  return (
    <div id="screen-ai" className="w-full px-6 py-6">
      {/* crumbs */}
      <div className="mb-3 text-xs text-[var(--muted)]">
        {data.header.crumbTrail.map((crumb, i) => {
          const isLast = i === data.header.crumbTrail.length - 1;
          return (
            <span key={crumb}>
              {isLast ? <b className="font-semibold text-[var(--ink-2)]">{crumb}</b> : <span>{crumb}</span>}
              {!isLast && <span className="mx-1.5 text-[var(--muted-2)]">/</span>}
            </span>
          );
        })}
      </div>

      {/* page head */}
      <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="font-display text-[26px] font-bold leading-tight tracking-tight text-[var(--ink)]">
            {data.header.title}
          </h1>
          <div className="mt-2 flex flex-wrap items-center gap-2 text-[12.5px]">
            {data.header.subPills.map((p) => (
              <span
                key={p}
                className="rounded-[7px] border border-[var(--hairline)] bg-white px-2.5 py-[5px] text-[11.5px] font-semibold text-[var(--ink-2)]"
              >
                {p}
              </span>
            ))}
            {data.header.subStats.map((s) => (
              <span
                key={`${s.label}-${s.value}`}
                className="rounded-[7px] bg-[var(--surface-soft)] px-2.5 py-[5px] text-[11.5px]"
              >
                <b className="font-bold text-[var(--ink)]">{s.value}</b>{' '}
                <span className="text-[var(--muted)]">{s.label}</span>
              </span>
            ))}
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          {data.header.actions.map((a) =>
            a.primary ? (
              <button
                key={a.id}
                type="button"
                className="flex h-9 items-center gap-1.5 rounded-[12px] px-4 text-[13px] font-semibold text-white shadow-[0_6px_16px_-8px_rgba(90,125,163,0.55)] transition-colors hover:bg-[var(--rose-deep)]"
                style={{ background: 'var(--rose)' }}
              >
                {actionIcon(a.id)} {a.label}
              </button>
            ) : (
              <button
                key={a.id}
                type="button"
                className="flex h-9 items-center gap-1.5 rounded-[11px] border border-[var(--hairline)] bg-white px-3.5 text-[12.5px] font-semibold text-[var(--ink-2)] hover:bg-[#f7f9fb]"
              >
                {actionIcon(a.id)} {a.label}
              </button>
            ),
          )}
        </div>
      </div>

      {/* memo */}
      <article
        className="mb-4 rounded-[14px] border border-[var(--border)] bg-white p-[28px_32px] shadow-[var(--shadow-card)]"
        style={{ borderLeft: '4px solid var(--rose)' }}
      >
        <h3 className="font-display text-[20px] font-bold leading-tight tracking-[-0.018em] text-[var(--ink)]">
          {data.memo.title}
        </h3>
        <div className="mt-1.5 border-b border-[var(--hairline)] pb-3.5 text-[12px] text-[var(--muted)]">
          {data.memo.fromLine}
        </div>
        <div className="mt-4 space-y-3.5 text-[14px] leading-[1.7] text-[var(--ink-2)] [&_b]:font-semibold [&_b]:text-[var(--ink)]">
          {data.memo.paragraphs.map((p) => (
            <p key={p.html.slice(0, 40)} dangerouslySetInnerHTML={{ __html: p.html }} />
          ))}
        </div>
        <div className="mt-5 border-t border-[var(--hairline)] pt-3.5 text-[12.5px] italic text-[var(--muted)]">
          {data.memo.signature}
        </div>
      </article>

      {/* 3-card grid */}
      <div className="mb-4 grid grid-cols-1 gap-3 lg:grid-cols-3">
        {data.sideCards.map((c) => {
          const tagStyle = c.tag ? tagPalette[c.tag.tone] : null;
          return (
            <div
              key={c.id}
              className="flex flex-col gap-2.5 rounded-[14px] border border-[var(--border)] bg-white p-[18px_20px] shadow-[var(--shadow-card)]"
            >
              <div className="flex items-start justify-between gap-2">
                <h4 className="font-display text-[13.5px] font-bold leading-tight tracking-[-0.005em] text-[var(--ink)]">
                  {c.title}
                </h4>
                {c.tag && tagStyle && (
                  <span
                    className="rounded-[5px] px-2 py-0.5 text-[10.5px] font-bold"
                    style={{ background: tagStyle.bg, color: tagStyle.color }}
                  >
                    {c.tag.label}
                  </span>
                )}
              </div>
              {c.bullets && (
                <ul className="space-y-1.5 text-[12.5px] leading-[1.55] text-[var(--ink-3)] [&_b]:font-semibold [&_b]:text-[var(--ink)]">
                  {c.bullets.map((b) => (
                    <li
                      key={b.html.slice(0, 40)}
                      className="relative pl-3.5 before:absolute before:left-0 before:top-[7px] before:h-1.5 before:w-1.5 before:rounded-full before:bg-[var(--rose)]"
                    >
                      <span dangerouslySetInnerHTML={{ __html: b.html }} />
                    </li>
                  ))}
                </ul>
              )}
              {c.body && (
                <p
                  className={`text-[12.5px] leading-[1.6] text-[var(--ink-3)] [&_b]:font-semibold [&_b]:text-[var(--ink)] ${c.bodyItalic ? 'italic' : ''}`}
                >
                  {c.body}
                </p>
              )}
            </div>
          );
        })}
      </div>

      {/* cross-links */}
      <div className="flex flex-wrap items-center justify-between gap-2.5 rounded-[14px] border border-[var(--border)] bg-white px-4.5 py-3.5 shadow-[var(--shadow-card)]">
        <span className="text-[12px] font-semibold text-[var(--muted)]">Cross-links →</span>
        <div className="flex flex-wrap gap-1.5">
          {data.crossLinks.map((l) => (
            <Link
              key={l.label}
              to={l.jumpTo}
              className="flex h-9 items-center gap-1.5 rounded-[11px] border border-[var(--hairline)] bg-white px-3.5 text-[12.5px] font-semibold text-[var(--ink-2)] transition-colors hover:bg-[#f7f9fb]"
            >
              {l.label}
            </Link>
          ))}
        </div>
      </div>
    </div>
  );
}
