import type { FunnelSectionData } from '@/types/quotes';

interface Props {
  data: FunnelSectionData;
}

const stepStyle = (tone?: 'won' | 'lost') => {
  if (tone === 'won') return { background: 'var(--green-bg)', color: 'var(--green)' };
  if (tone === 'lost') return { background: 'var(--rose-bg)', color: 'var(--rose-deep)' };
  return { background: 'var(--surface-soft)', color: 'var(--ink)' };
};

const cellStyle = (tone?: 'normal' | 'warn' | 'alert') => {
  if (tone === 'warn') return { background: 'var(--amber-bg)', color: 'var(--amber)', borderColor: 'var(--amber-bg)' };
  if (tone === 'alert') return { background: 'var(--rose-bg)', color: 'var(--rose-deep)', borderColor: 'var(--rose-tint)' };
  return { background: 'var(--surface)', color: 'var(--ink)', borderColor: 'var(--border)' };
};

export function FunnelSection({ data }: Props) {
  return (
    <section className="mb-4 rounded-[14px] border border-[var(--border)] bg-white p-[18px_20px] shadow-[var(--shadow-card)]">
      <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="font-display text-[18px] font-bold leading-tight tracking-[-0.018em] text-[var(--ink)]">
            {data.title}
          </h2>
          <div className="mt-1 max-w-[60ch] text-[12px] leading-[1.5] text-[var(--muted)]">{data.subtitle}</div>
        </div>
        <span className="rounded-[7px] bg-[var(--surface-sunken)] px-2.5 py-[3px] text-[11px] font-semibold text-[var(--ink-2)]">
          {data.rangeChip}
        </span>
      </div>

      <div className="mb-4 flex flex-wrap items-center gap-2">
        {data.funnel.map((step, i) => (
          <div key={step.id} className="flex items-center gap-2">
            <div
              className="flex flex-col gap-0.5 rounded-[11px] px-4 py-3"
              style={stepStyle(step.tone)}
            >
              <div className="font-display text-[24px] font-bold leading-none tabular-nums tracking-[-0.025em]">
                {step.count}
              </div>
              <div className="text-[11px] font-bold uppercase tracking-[0.06em]">{step.label}</div>
              <div className="text-[10.5px] opacity-80">{step.detail}</div>
            </div>
            {i < data.funnel.length - 1 && (
              <span className="text-[16px] text-[var(--muted-2)]" aria-hidden="true">→</span>
            )}
          </div>
        ))}
      </div>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {data.aging.map((cell) => (
          <div
            key={cell.label}
            className="flex flex-col gap-1 rounded-[11px] border p-3.5"
            style={cellStyle(cell.tone)}
          >
            <div className="font-display text-[22px] font-bold leading-none tabular-nums tracking-[-0.025em]">
              {cell.count}
            </div>
            <div className="text-[11px] font-bold uppercase tracking-[0.06em]">{cell.label}</div>
            <div className="mt-0.5 text-[11px] leading-[1.4] opacity-90">{cell.detail}</div>
          </div>
        ))}
      </div>
    </section>
  );
}
