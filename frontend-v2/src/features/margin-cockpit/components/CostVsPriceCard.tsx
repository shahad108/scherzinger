import { useMemo } from 'react';
import { Area, AreaChart, CartesianGrid, Legend, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import type { CostVsPriceData } from '@/types';

interface Props {
  data: CostVsPriceData;
}

export function CostVsPriceCard({ data }: Props) {
  const seriesData = useMemo(() => data.series, [data.series]);
  const sparkData = useMemo(
    () => data.recovery.spark.map((v, i) => ({ i, v })),
    [data.recovery.spark],
  );

  return (
    <div className="mb-4 rounded-2xl border border-[var(--hairline)] bg-white p-5">
      <div className="mb-3 flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="font-display text-[18px] font-bold leading-tight text-[var(--ink)]">{data.title}</h2>
          <div className="mt-1 text-[12.5px] text-[var(--muted)]">{data.subtitle}</div>
        </div>
        <span className="rounded-full border border-[var(--hairline)] bg-[var(--surface-soft)] px-3 py-1 text-[11.5px] font-semibold text-[var(--ink-2)]">
          {data.indexedTag}
        </span>
      </div>

      <div className="grid grid-cols-1 gap-5 lg:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)]">
        <div className="h-[260px]">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={seriesData} margin={{ top: 8, right: 8, bottom: 8, left: 8 }}>
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

        <div className="flex flex-col gap-3">
          <div className="rounded-xl border border-[var(--hairline)] p-4" style={{ background: 'var(--rose-bg)' }}>
            <div className="text-[12px] font-semibold uppercase tracking-wider text-[var(--rose-deep)]">{data.passThrough.label}</div>
            <div className="mt-1 font-display text-[28px] font-bold text-[var(--ink)]">{data.passThrough.value}</div>
            <div className="mt-1 text-[12px] text-[var(--ink-2)]" dangerouslySetInnerHTML={{ __html: data.passThrough.sub }} />
            <div className="mt-3 h-2 overflow-hidden rounded-full bg-white">
              <div className="h-full rounded-full" style={{ width: `${data.passThrough.pct}%`, background: 'var(--rose)' }} />
            </div>
            <div className="mt-3 border-t border-dashed border-[var(--hairline)] pt-2 text-[11px] text-[var(--ink-3)]" dangerouslySetInnerHTML={{ __html: data.passThrough.breakdownHtml }} />
          </div>

          <div className="rounded-xl border border-[var(--hairline)] p-4">
            <div className="text-[12px] font-semibold uppercase tracking-wider text-[var(--muted)]">{data.recovery.label}</div>
            <div className="mt-1 font-display text-[28px] font-bold" style={{ color: 'var(--green)' }}>{data.recovery.value}</div>
            <div className="mt-1 text-[12px] text-[var(--ink-2)]" dangerouslySetInnerHTML={{ __html: data.recovery.sub }} />
            <div className="mt-2 h-[80px]">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={sparkData}>
                  <Area type="monotone" dataKey="v" stroke="var(--rose)" fill="var(--rose-bg)" strokeWidth={2} />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
