import type { LostQuoteDifferentialData } from '@/types';

interface Props {
  data: LostQuoteDifferentialData;
}

export function LostQuoteDifferential({ data }: Props) {
  return (
    <div className="mb-4 rounded-[14px] border border-[var(--border)] bg-white p-[18px_20px] shadow-[var(--shadow-card)]" style={{ borderLeft: '4px solid var(--violet)' }}>
      <div className="mb-3.5 flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="font-display text-[18px] font-bold leading-tight tracking-[-0.018em] text-[var(--ink)]">{data.title}</h2>
          <div className="mt-1 max-w-[60ch] text-[12px] leading-[1.5] text-[var(--muted)]">{data.subtitle}</div>
        </div>
        <span className="rounded-[7px] px-2.5 py-[3px] text-[11px] font-semibold" style={{ background: 'var(--green-bg)', color: 'var(--green)' }}>
          {data.significance}
        </span>
      </div>
      <div className="mb-3.5 grid grid-cols-1 gap-3.5 sm:grid-cols-3">
        {data.tiles.map((t) => {
          const accent = t.id === 'diff' ? 'var(--violet)' : t.id === 'lost' ? 'var(--rose-deep)' : 'var(--ink)';
          const tileBg = t.id === 'diff' ? 'var(--violet-bg)' : t.id === 'lost' ? 'var(--rose-bg)' : 'white';
          const tileBorder = t.id === 'diff' ? 'var(--violet-bg)' : t.id === 'lost' ? 'var(--rose-tint)' : 'var(--border)';
          const labColor = t.id === 'diff' ? 'var(--violet)' : t.id === 'lost' ? 'var(--rose-deep)' : 'var(--muted)';
          return (
            <div
              key={t.id}
              className="flex flex-col gap-1 rounded-[11px] border p-3.5"
              style={{ background: tileBg, borderColor: tileBorder }}
            >
              <div className="text-[10.5px] font-bold uppercase tracking-[0.06em]" style={{ color: labColor }}>{t.label}</div>
              <div className="mt-0.5 font-display text-[30px] font-extrabold leading-none tabular-nums tracking-[-0.025em]" style={{ color: accent }}>{t.value}</div>
              <div className="mt-1 text-[11px]" style={{ color: t.id === 'won' ? 'var(--muted)' : labColor }}>{t.sub}</div>
            </div>
          );
        })}
      </div>
      <p className="rounded-[7px] border-l-[3px] border-[var(--violet)] bg-[var(--surface-soft)] p-3 px-3.5 text-[12.5px] leading-[1.6] text-[var(--ink-3)]" dangerouslySetInnerHTML={{ __html: data.interpretationHtml }} />
      <p className="mt-2.5 text-[11.5px] text-[var(--muted)] [&_code]:rounded [&_code]:bg-[var(--surface-soft)] [&_code]:px-1 [&_code]:py-0.5 [&_code]:text-[10.5px] [&_code]:text-[var(--rose-deep)]" dangerouslySetInnerHTML={{ __html: data.sourceHtml }} />
    </div>
  );
}
