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
    <div className="mb-4 rounded-2xl border border-[var(--hairline)] bg-white p-4">
      <h5 className="mb-2 text-[12px] font-bold uppercase tracking-wider text-[var(--muted)]">{title}</h5>
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
      <div className="mt-2 text-[12px] text-[var(--ink-3)]" dangerouslySetInnerHTML={{ __html: netLine }} />
    </div>
  );
}
