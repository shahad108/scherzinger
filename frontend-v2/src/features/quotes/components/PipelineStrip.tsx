import type { PipelineCounter } from '@/types/quotes';

interface Props {
  counters: PipelineCounter[];
}

const valueColor: Record<NonNullable<PipelineCounter['valueTone']>, string> = {
  red: 'var(--red)',
  amber: 'var(--amber)',
  green: 'var(--green)',
  ink: 'var(--ink)',
};

const miniColor: Record<NonNullable<PipelineCounter['miniCounters']>[number]['tone'], string> = {
  r: 'var(--red)',
  a: 'var(--amber)',
  g: 'var(--green)',
};

const containerStyle = (tone: PipelineCounter['containerTone']): React.CSSProperties | undefined => {
  if (tone === 'warn') {
    return {
      borderColor: 'rgba(165,112,31,0.30)',
      background: 'linear-gradient(135deg, var(--surface) 0%, var(--amber-bg) 240%)',
    };
  }
  if (tone === 'alert') {
    return {
      borderColor: 'rgba(154,50,50,0.30)',
      background: 'linear-gradient(135deg, var(--surface) 0%, var(--rose-bg) 240%)',
    };
  }
  return undefined;
};

export function PipelineStrip({ counters }: Props) {
  return (
    <div className="mb-4 grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-4">
      {counters.map((c) => (
        <div
          key={c.id}
          className="relative flex flex-col gap-1.5 rounded-[14px] border border-[var(--border)] bg-white p-[16px_18px] shadow-[var(--shadow-card)]"
          style={containerStyle(c.containerTone)}
        >
          {c.live && (
            <span
              className="absolute right-3.5 top-3.5 inline-block h-2 w-2 rounded-full"
              style={{
                background: 'var(--red)',
                boxShadow: '0 0 0 4px rgba(154,50,50,0.18)',
                animation: 'pz-pulse-dot 1.6s ease-in-out infinite',
              }}
              aria-hidden="true"
            />
          )}
          <div className="text-[10.5px] font-bold uppercase tracking-[0.08em] text-[var(--muted)]">
            {c.label}
          </div>
          <div
            className="font-display text-[30px] font-bold leading-none tabular-nums tracking-[-0.025em]"
            style={c.valueTone ? { color: valueColor[c.valueTone] } : { color: 'var(--ink)' }}
          >
            {c.value}
          </div>
          {c.sub && <div className="text-[11.5px] leading-[1.4] text-[var(--muted)]">{c.sub}</div>}
          {c.miniCounters && (
            <div className="flex flex-wrap gap-2 text-[10.5px] font-bold">
              {c.miniCounters.map((m) => (
                <span key={m.label} style={{ color: miniColor[m.tone] }}>● {m.label}</span>
              ))}
            </div>
          )}
        </div>
      ))}
    </div>
  );
}
