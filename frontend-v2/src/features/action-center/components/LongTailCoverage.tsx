import type { LongTailData, LongTailMixSegment } from '@/types';

const mixColor: Record<LongTailMixSegment['tone'], string> = {
  rose: 'bg-[var(--rose)]',
  amber: 'bg-[var(--amber)]',
  muted: 'bg-[var(--muted-2)]',
};

export function LongTailCoverage({ data }: { data: LongTailData }) {
  return (
    <>
      <div className="mb-3">
        <h2 className="font-display text-lg font-bold tracking-tight text-[var(--ink)]">
          Long-tail coverage · B and C products
        </h2>
        <p className="mt-0.5 text-xs text-[var(--muted)]">
          {data.subhead ?? 'C-tier coverage — review pricing freeze candidates.'}
        </p>
      </div>
      <div className="mb-3 grid grid-cols-2 gap-3 md:grid-cols-4">
        {data.tiles.map((t) => (
          <div
            key={t.label}
            className="rounded-xl border border-[var(--hairline)] bg-white p-4 shadow-[var(--shadow)]"
          >
            <div className="text-[10.5px] font-semibold uppercase tracking-wider text-[var(--muted)]">
              {t.label}
            </div>
            <div className="mt-1 font-display text-[28px] font-bold leading-none tabular-nums text-[var(--ink)]">
              {t.value}
            </div>
            <div className="mt-2 text-[11.5px] leading-relaxed text-[var(--muted)]">{t.caption}</div>
          </div>
        ))}
      </div>
      <div className="mb-6 rounded-xl border border-[var(--hairline)] bg-white p-5 shadow-[var(--shadow)]">
        <div className="mb-2 text-[10.5px] font-semibold uppercase tracking-wider text-[var(--muted)]">
          Revenue mix · A / B / C
        </div>
        <div className="flex h-3 overflow-hidden rounded-full bg-[var(--surface-soft)]">
          {data.mix.map((s) => (
            <div
              key={s.label}
              className={mixColor[s.tone]}
              style={{ flex: `0 0 ${s.pct}%` }}
              title={s.label}
            />
          ))}
        </div>
        <div className="mt-2 flex flex-wrap justify-between gap-3 text-[11.5px] text-[var(--muted)]">
          {data.mix.map((s) => (
            <span key={s.label}>
              <b className="text-[var(--ink-2)]">{s.label}</b> {s.subtitle}
            </span>
          ))}
        </div>
      </div>
    </>
  );
}
