import { useNavigate } from 'react-router-dom';
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import type { WaterfallBucket, WaterfallCardData } from '@/types';
import { MovableLockedOverlay } from './MovableLockedOverlay';

interface Props {
  data: WaterfallCardData;
  onTabJump: (tab: string, segTab?: string) => void;
}

const deltaColor = (tone: NonNullable<WaterfallBucket['delta']>['tone']) =>
  tone === 'up' ? 'var(--red)' : tone === 'down' ? 'var(--green)' : 'var(--ink-3)';

const dotColor = (b: WaterfallBucket) =>
  b.endpoint ? 'var(--green)' : b.delta?.tone === 'up' ? 'var(--red)' : 'var(--rose)';

interface ChartDatum {
  label: string;
  base: number;
  value: number;
  kind: 'endpoint' | 'loss';
}

export function WaterfallCard({ data, onTabJump }: Props) {
  const nav = useNavigate();

  // Recharts data: stacked-floating bar — invisible base + visible delta on top.
  // Loss bars sit between cumulative_after and cumulative_before; endpoints rise from 0.
  const chartData: ChartDatum[] = data.chart.map((p, i, arr) => {
    if (p.kind === 'endpoint') return { label: p.label, base: 0, value: p.cumulative, kind: p.kind };
    const prev = arr[i - 1].cumulative;
    return { label: p.label, base: p.cumulative, value: prev - p.cumulative, kind: p.kind };
  });

  return (
    <div className="mb-4 rounded-2xl border border-[var(--hairline)] bg-white p-5">
      <div className="mb-3 flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="font-display text-[18px] font-bold leading-tight text-[var(--ink)]">
            {data.title}
          </h2>
          <div className="mt-1 text-[12.5px] text-[var(--muted)]">{data.subtitle}</div>
        </div>
        <span className="rounded-full border border-[var(--hairline)] bg-[var(--surface-soft)] px-3 py-1 text-[11.5px] font-semibold text-[var(--ink-2)]">
          {data.totalChip}
        </span>
      </div>

      <div className="grid grid-cols-1 gap-5 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.1fr)]">
        <div className="h-[280px]">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={chartData} margin={{ top: 8, right: 8, bottom: 8, left: 8 }}>
              <CartesianGrid stroke="var(--hairline)" vertical={false} />
              <XAxis dataKey="label" stroke="var(--muted)" tick={{ fontSize: 11 }} />
              <YAxis stroke="var(--muted)" tick={{ fontSize: 11 }} domain={[0, 30]} />
              <Tooltip />
              <Bar dataKey="base" stackId="wf" fill="transparent" />
              <Bar dataKey="value" stackId="wf" fill="var(--rose)">
                {chartData.map((d, idx) => (
                  <Cell
                    key={`wf-${idx}`}
                    fill={d.kind === 'endpoint' ? 'var(--green)' : 'var(--rose)'}
                  />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>

        <div>
          <h5 className="mb-2 text-[12px] font-bold uppercase tracking-wider text-[var(--muted)]">
            Bucket breakdown · click any bucket to drill
          </h5>
          <div className="flex flex-col">
            {data.buckets.map((b) => {
              const className = [
                'grid grid-cols-[10px_1fr_70px_70px_90px] items-center gap-3 border-t border-[var(--hairline)] px-2 py-2 text-left first:border-t-0',
                b.jumpTo ? 'transition-colors hover:rounded-md hover:bg-[var(--surface-soft)]' : '',
                b.endpoint ? 'bg-[var(--green-bg)]/30' : '',
              ].join(' ');

              const inner = (
                <>
                  <span
                    className="inline-block h-2 w-2 shrink-0 rounded-full"
                    style={{ background: dotColor(b) }}
                  />
                  <div>
                    <div className="text-[13px] font-semibold text-[var(--ink-2)]">
                      {b.name}
                      {b.delta && (
                        <span
                          className="ml-2 inline-block rounded-full px-1.5 py-0.5 text-[10.5px] font-bold"
                          style={{ background: 'var(--surface-soft)', color: deltaColor(b.delta.tone) }}
                        >
                          {b.delta.label}
                        </span>
                      )}
                    </div>
                    {b.source && (
                      <div
                        className="mt-0.5 text-[11px] text-[var(--ink-3)]"
                        dangerouslySetInnerHTML={{ __html: b.source }}
                      />
                    )}
                  </div>
                  <span className="text-right text-[12px] font-bold text-[var(--ink-2)]">{b.pct}</span>
                  <span className="text-right text-[12px] font-semibold text-[var(--muted)]">{b.eur}</span>
                  <span
                    className="text-right text-[11.5px] font-semibold"
                    style={{ color: 'var(--rose-deep)' }}
                  >
                    {b.jumpLabel ?? ''}
                  </span>
                </>
              );

              if (b.jumpTo) {
                const jumpTo = b.jumpTo;
                return (
                  <button
                    key={b.id}
                    type="button"
                    onClick={() =>
                      jumpTo.kind === 'route' ? nav(jumpTo.to) : onTabJump(jumpTo.tab, jumpTo.segTab)
                    }
                    className={className}
                  >
                    {inner}
                  </button>
                );
              }

              return (
                <div key={b.id} className={className}>
                  {inner}
                </div>
              );
            })}
          </div>
        </div>
      </div>

      <MovableLockedOverlay data={data.movableLocked} />
    </div>
  );
}
