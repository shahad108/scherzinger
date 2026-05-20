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
          <div className="flex h-full flex-col gap-1.5 rounded-[14px] border border-[var(--border)] bg-white p-[16px_18px] shadow-[0_1px_0_rgba(20,16,12,.04),0_1px_2px_rgba(20,16,12,.04)] transition-all hover:border-[var(--border-strong)] hover:shadow-[var(--shadow-pop)]">
            <div className="text-[10.5px] font-bold uppercase tracking-[0.08em] text-[var(--muted)]">
              {cell.label}
            </div>
            {cell.id === 'score' ? (
              <div className="mt-1 flex items-center gap-3">
                <div
                  className="relative grid h-14 w-14 flex-none place-items-center font-display text-[18px] font-bold text-[var(--ink)] before:absolute before:inset-[5px] before:rounded-full before:bg-white"
                  style={{
                    borderRadius: '50%',
                    background: `conic-gradient(${verdictColor[cell.scoreTone ?? 'amber']} ${(Number(cell.scoreRing ?? 0) / 100) * 360}deg, var(--surface-sunken) 0)`,
                  }}
                >
                  <span className="relative z-10">{cell.scoreRing}</span>
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
                  className="mt-1 font-display text-[26px] font-bold leading-none text-[var(--ink)] tabular-nums tracking-[-0.025em]"
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
                  <div className="mt-2 flex flex-wrap gap-1.5 text-[10.5px] font-semibold">
                    <span className="rounded-[5px] px-1.5 py-0.5" style={{ background: 'var(--green-bg)', color: 'var(--green)' }}>{cell.authSplit.yours}</span>
                    <span className="rounded-[5px] px-1.5 py-0.5" style={{ background: 'var(--rose-bg)', color: 'var(--rose-deep)' }}>{cell.authSplit.needsMd}</span>
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
