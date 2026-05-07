import { Link } from 'react-router-dom';
import type { MarginHealthCell } from '@/types';

interface Props {
  cells: MarginHealthCell[];
}

const verdictColor: Record<NonNullable<MarginHealthCell['scoreTone']>, string> = {
  green: 'var(--green)',
  amber: 'var(--amber)',
  red: 'var(--red)',
};

const trendColor: Record<NonNullable<MarginHealthCell['trendTone']>, string> = {
  up: 'var(--red)',
  down: 'var(--green)',
  flat: 'var(--ink-3)',
};

export function MarginHealthStrip({ cells }: Props) {
  return (
    <div className="mb-4 grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-4">
      {cells.map((cell) => {
        const inner = (
          <div className="flex h-full flex-col rounded-2xl border border-[var(--hairline)] bg-white p-4 transition-shadow hover:shadow-[var(--shadow-pop)]">
            <div className="text-[10.5px] font-bold uppercase tracking-[0.08em] text-[var(--muted)]">
              {cell.label}
            </div>
            {cell.id === 'score' ? (
              <div className="mt-1 flex items-center gap-3">
                <div
                  className="flex h-12 w-12 items-center justify-center rounded-full font-display text-[18px] font-bold text-[var(--ink)]"
                  style={{ background: 'var(--surface-soft)', border: `2px solid ${verdictColor[cell.scoreTone ?? 'amber']}` }}
                >
                  <span>{cell.scoreRing}</span>
                </div>
                <div>
                  <div className="font-display text-[20px] font-bold" style={{ color: verdictColor[cell.scoreTone ?? 'amber'] }}>
                    {cell.scoreVerdict}
                  </div>
                  <div className="text-[11.5px] text-[var(--muted)]">{cell.sub}</div>
                </div>
              </div>
            ) : (
              <>
                <div
                  className="mt-1 font-display text-[24px] font-bold text-[var(--ink)]"
                  style={cell.id === 'belowPlan' ? { color: 'var(--red)' } : cell.id === 'closable' ? { color: 'var(--green)' } : undefined}
                >
                  {cell.value}
                  {cell.trend && (
                    <span className="ml-2 text-[12px] font-bold" style={{ color: trendColor[cell.trendTone ?? 'flat'] }}>
                      {cell.trend}
                    </span>
                  )}
                </div>
                {cell.sub && <div className="text-[11.5px] text-[var(--muted)]" dangerouslySetInnerHTML={{ __html: cell.sub }} />}
                {cell.benchmark && (
                  <div className="mt-2 border-t border-[var(--hairline)] pt-2 text-[11px] text-[var(--ink-3)]" dangerouslySetInnerHTML={{ __html: cell.benchmark }} />
                )}
                {cell.authSplit && (
                  <div className="mt-2 flex flex-wrap gap-1.5 text-[11px] font-semibold">
                    <span className="rounded-md px-1.5 py-0.5" style={{ background: 'var(--green-bg)', color: 'var(--green)' }}>{cell.authSplit.yours}</span>
                    <span className="rounded-md px-1.5 py-0.5" style={{ background: 'var(--rose-bg)', color: 'var(--rose-deep)' }}>{cell.authSplit.needsMd}</span>
                  </div>
                )}
              </>
            )}
          </div>
        );
        if (cell.jumpTo) {
          return (
            <Link key={cell.id} to={cell.jumpTo} aria-label={cell.label} className="block">
              {inner}
            </Link>
          );
        }
        return <div key={cell.id}>{inner}</div>;
      })}
    </div>
  );
}
