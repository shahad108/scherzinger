import type { LostQuoteDifferentialData } from '@/types';

interface Props {
  data: LostQuoteDifferentialData;
}

export function LostQuoteDifferential({ data }: Props) {
  return (
    <div className="mb-4 rounded-2xl border border-[var(--hairline)] bg-white p-5" style={{ borderLeft: '4px solid var(--violet)' }}>
      <div className="mb-3 flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="font-display text-[18px] font-bold leading-tight text-[var(--ink)]">{data.title}</h2>
          <div className="mt-1 text-[12.5px] text-[var(--muted)]">{data.subtitle}</div>
        </div>
        <span className="rounded-full px-3 py-1 text-[11.5px] font-semibold" style={{ background: 'var(--green-bg)', color: 'var(--green)' }}>
          {data.significance}
        </span>
      </div>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        {data.tiles.map((t) => {
          const accent = t.id === 'diff' ? 'var(--violet)' : t.id === 'lost' ? 'var(--rose-deep)' : 'var(--ink)';
          return (
            <div key={t.id} className="rounded-xl border border-[var(--hairline)] bg-[var(--surface-soft)] p-4">
              <div className="text-[10.5px] font-bold uppercase tracking-wider text-[var(--muted)]">{t.label}</div>
              <div className="mt-1 font-display text-[26px] font-bold" style={{ color: accent }}>{t.value}</div>
              <div className="mt-1 text-[11.5px] text-[var(--muted)]">{t.sub}</div>
            </div>
          );
        })}
      </div>
      <p className="mt-4 rounded-xl bg-[var(--surface-soft)] p-3 text-[13px] text-[var(--ink-2)]" dangerouslySetInnerHTML={{ __html: data.interpretationHtml }} />
      <p className="mt-2 text-[11px] text-[var(--muted)]" dangerouslySetInnerHTML={{ __html: data.sourceHtml }} />
    </div>
  );
}
