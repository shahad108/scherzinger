import { useMemo } from 'react';
import { Area, AreaChart, CartesianGrid, Legend, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import type { CostVsPriceData } from '@/types';

interface Props {
  data: CostVsPriceData;
}

export function CostVsPriceCard({ data }: Props) {
  const sparkData = useMemo(
    () => data.recovery.spark.map((v, i) => ({ i, v })),
    [data.recovery.spark],
  );

  return (
    <div className="mb-4 rounded-[14px] border border-[var(--border)] bg-white p-[18px_20px] shadow-[var(--shadow-card)]">
      <div className="mb-3.5 flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="font-display text-[18px] font-bold leading-tight tracking-[-0.018em] text-[var(--ink)]">{data.title}</h2>
          <div className="mt-1 max-w-[60ch] text-[12px] leading-[1.5] text-[var(--muted)]">{data.subtitle}</div>
        </div>
        <span className="rounded-[7px] bg-[var(--surface-sunken)] px-2.5 py-[3px] text-[11px] font-semibold text-[var(--ink-2)]">
          {data.indexedTag}
        </span>
      </div>

      <div className="grid grid-cols-1 gap-5 lg:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)]">
        <div className="h-[260px] rounded-[11px] border border-[var(--hairline)] bg-[var(--surface-soft)] p-3.5">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={data.series} margin={{ top: 8, right: 8, bottom: 8, left: 8 }}>
              <CartesianGrid stroke="var(--hairline)" vertical={false} />
              <XAxis dataKey="month" stroke="var(--muted)" tick={{ fontSize: 11 }} />
              <YAxis stroke="var(--muted)" tick={{ fontSize: 11 }} domain={['auto', 'auto']} />
              <Tooltip />
              <Legend />
              <Line type="monotone" dataKey="cost" stroke="var(--rose)" strokeWidth={2} dot={false} name="Input cost (indexed)" />
              <Line type="monotone" dataKey="price" stroke="var(--ink)" strokeWidth={2} dot={false} name="Realized price (indexed)" />
            </LineChart>
          </ResponsiveContainer>
        </div>

        <div className="flex flex-col gap-2.5">
          <div className="rounded-[11px] border p-3.5" style={{ background: 'var(--rose-bg)', borderColor: 'var(--rose-tint)' }}>
            <div className="text-[11px] font-bold uppercase tracking-[0.06em] text-[var(--rose-deep)]">{data.passThrough.label}</div>
            <div className="mt-1 font-display text-[28px] font-bold leading-none tabular-nums tracking-[-0.025em]" style={{ color: 'var(--rose-deep)' }}>{data.passThrough.value}</div>
            <div className="mt-1 text-[11.5px] leading-[1.5] text-[var(--ink-3)] [&_b]:font-semibold [&_b]:text-[var(--ink)]" dangerouslySetInnerHTML={{ __html: data.passThrough.sub }} />
            <div className="my-2 h-1.5 overflow-hidden rounded-[3px] bg-[var(--surface-sunken)]">
              <div className="h-full rounded-[3px]" style={{ width: `${data.passThrough.pct}%`, background: 'var(--rose)' }} />
            </div>
            <div className="mt-2 border-t border-dashed border-[var(--hairline)] pt-2 text-[11px] leading-[1.5] text-[var(--ink-3)] [&_b]:font-semibold [&_b]:text-[var(--ink)]" dangerouslySetInnerHTML={{ __html: data.passThrough.breakdownHtml }} />
          </div>

          <div className="rounded-[11px] border border-[var(--border)] bg-white p-3.5">
            <div className="text-[11px] font-bold uppercase tracking-[0.06em] text-[var(--muted)]">{data.recovery.label}</div>
            <div className="mt-1 font-display text-[28px] font-bold leading-none tabular-nums tracking-[-0.025em]" style={{ color: 'var(--green)' }}>{data.recovery.value}</div>
            <div className="mt-1 text-[11.5px] leading-[1.5] text-[var(--ink-3)] [&_b]:font-semibold [&_b]:text-[var(--ink)]" dangerouslySetInnerHTML={{ __html: data.recovery.sub }} />
            <div className="mt-2 h-[80px]" aria-hidden="true">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={sparkData}>
                  <Area type="monotone" dataKey="v" stroke="var(--rose)" fill="var(--rose-bg)" strokeWidth={1.8} />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
