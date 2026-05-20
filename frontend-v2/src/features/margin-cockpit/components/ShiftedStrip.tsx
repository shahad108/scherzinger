import { useNavigate } from 'react-router-dom';
import type { ShiftedRow } from '@/types';

interface Props {
  title: string;
  rows: ShiftedRow[];
  netLine: string;
  onTabJump: (tab: string, segTab?: string) => void;
}

const dotBg: Record<ShiftedRow['dotTone'], string> = {
  red:    'var(--red)',
  green:  'var(--green)',
  amber:  'var(--amber)',
  muted:  'var(--muted-2)',
};

const deltaColor: Record<ShiftedRow['delta']['tone'], string> = {
  up:   'var(--red)',
  down: 'var(--green)',
  flat: 'var(--ink-3)',
};

export function ShiftedStrip({ title, rows, netLine, onTabJump }: Props) {
  const nav = useNavigate();
  return (
    <div className="mb-4 rounded-[14px] border border-[var(--border)] bg-white p-[18px_20px] shadow-[var(--shadow-card)]">
      <h5 className="mb-3 font-display text-[14px] font-bold leading-tight tracking-[-0.005em] text-[var(--ink)]">{title}</h5>
      <div className="flex flex-col">
        {rows.map((r, i) => (
          <button
            key={i}
            type="button"
            onClick={() => (r.jumpTo.kind === 'route' ? nav(r.jumpTo.to) : onTabJump(r.jumpTo.tab, r.jumpTo.segTab))}
            className="flex w-full items-center gap-3 border-t border-[var(--hairline)] px-2 py-2 text-left transition-colors first:border-t-0 hover:rounded-md hover:bg-[var(--surface-soft)]"
          >
            <span className="inline-block h-2 w-2 shrink-0 rounded-full" style={{ background: dotBg[r.dotTone] }} />
            <div className="flex-1 text-[13px] text-[var(--ink-2)]">
              <span dangerouslySetInnerHTML={{ __html: r.text }} />{' '}
              <span className="font-bold" style={{ color: deltaColor[r.delta.tone] }}>
                {r.delta.value}
              </span>
            </div>
            <span className="shrink-0 text-[12px] font-semibold" style={{ color: 'var(--rose-deep)' }}>{r.jumpLabel}</span>
          </button>
        ))}
      </div>
      <div className="mt-3 border-t border-[var(--hairline)] pt-3 text-[12px] text-[var(--muted)]" dangerouslySetInnerHTML={{ __html: netLine }} />
    </div>
  );
}
