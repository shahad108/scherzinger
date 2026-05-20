import { useMemo, useState } from 'react';
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
import type {
  WaterfallBucket,
  WaterfallBucketClassification,
  WaterfallCardData,
} from '@/types';
import { MovableLockedOverlay } from './MovableLockedOverlay';

interface Props {
  data: WaterfallCardData;
  onTabJump: (tab: string, segTab?: string) => void;
}

const deltaColor = (tone: NonNullable<WaterfallBucket['delta']>['tone']) =>
  tone === 'up' ? 'var(--red)' : tone === 'down' ? 'var(--green)' : 'var(--ink-3)';

const dotColor = (b: WaterfallBucket) =>
  b.endpoint ? 'var(--green)' : b.delta?.tone === 'up' ? 'var(--red)' : 'var(--rose)';

const classificationStyle: Record<
  WaterfallBucketClassification,
  { label: string; bg: string; color: string }
> = {
  strategic:  { label: 'Strategic',  bg: 'var(--green-bg)',     color: 'var(--green)' },
  unintended: { label: 'Unintended', bg: 'var(--rose-bg)',      color: 'var(--rose-deep)' },
  mixed:      { label: 'Mixed',      bg: 'var(--surface-sunken)', color: 'var(--ink-2)' },
};

interface ChartDatum {
  label: string;
  base: number;
  value: number;
  kind: 'endpoint' | 'loss';
}

function ClassificationPill({
  classification,
  note,
}: {
  classification: WaterfallBucketClassification;
  note?: string;
}) {
  const [open, setOpen] = useState(false);
  const s = classificationStyle[classification];
  return (
    <span className="relative inline-block">
      <span
        role="button"
        tabIndex={0}
        onMouseEnter={() => setOpen(true)}
        onMouseLeave={() => setOpen(false)}
        onClick={(e) => {
          e.stopPropagation();
          setOpen((v) => !v);
        }}
        className="ml-2 inline-block cursor-help rounded-[5px] px-1.5 py-[1px] text-[10px] font-bold"
        style={{ background: s.bg, color: s.color }}
        aria-label={`Bucket classification: ${s.label}`}
      >
        {s.label}
      </span>
      {open && note && (
        <span
          role="tooltip"
          className="absolute left-0 top-full z-30 mt-1 block w-[260px] rounded-lg border border-[var(--hairline)] bg-white p-2.5 text-[10.5px] leading-relaxed text-[var(--ink-2)] shadow-[var(--shadow-md)]"
        >
          {note}
        </span>
      )}
    </span>
  );
}

function LowNBadge({ clusters }: { clusters: NonNullable<WaterfallBucket['lowNClusters']> }) {
  const [open, setOpen] = useState(false);
  if (clusters.length === 0) return null;
  return (
    <span className="relative inline-block">
      <span
        role="button"
        tabIndex={0}
        onMouseEnter={() => setOpen(true)}
        onMouseLeave={() => setOpen(false)}
        onClick={(e) => {
          e.stopPropagation();
          setOpen((v) => !v);
        }}
        className="ml-2 inline-block cursor-help rounded-[5px] bg-[var(--amber-bg)] px-1.5 py-[1px] text-[10px] font-bold text-[var(--amber)]"
        aria-label="Low-n cluster warning"
      >
        ⚠ low-n
      </span>
      {open && (
        <span
          role="tooltip"
          className="absolute left-0 top-full z-30 mt-1 block w-[240px] rounded-lg border border-[var(--hairline)] bg-white p-2.5 text-[10.5px] leading-relaxed text-[var(--ink-2)] shadow-[var(--shadow-md)]"
        >
          References low-n clusters: {clusters.map((c) => `${c.code} (n=${c.n}, conf ${c.conf}%)`).join(', ')}. Review manually before auto-acting.
        </span>
      )}
    </span>
  );
}

export function WaterfallCard({ data, onTabJump }: Props) {
  const nav = useNavigate();
  const [movableOnly, setMovableOnly] = useState(false);

  const view = movableOnly && data.movableView ? data.movableView : data;
  const buckets = movableOnly && data.movableView ? data.movableView.buckets : data.buckets;
  const chart = movableOnly && data.movableView ? data.movableView.chart : data.chart;

  // Recharts data: stacked-floating bar — invisible base + visible delta on top.
  // Loss bars sit between cumulative_after and cumulative_before; endpoints rise from 0.
  const chartData: ChartDatum[] = useMemo(
    () =>
      chart.map((p, i, arr) => {
        if (p.kind === 'endpoint') return { label: p.label, base: 0, value: p.cumulative, kind: p.kind };
        const prev = i > 0 ? arr[i - 1].cumulative : p.cumulative;
        return { label: p.label, base: p.cumulative, value: prev - p.cumulative, kind: p.kind };
      }),
    [chart],
  );

  return (
    <div className="mb-4 rounded-[14px] border border-[var(--border)] bg-white p-[18px_20px] shadow-[var(--shadow-card)]">
      <div className="mb-3 flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="font-display text-[18px] font-bold leading-tight tracking-[-0.018em] text-[var(--ink)]">
            {data.title}
          </h2>
          <div className="mt-1 max-w-[60ch] text-[12px] leading-[1.5] text-[var(--muted)]">{data.subtitle}</div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {data.movableView && (
            <label className="inline-flex cursor-pointer items-center gap-1.5 rounded-[7px] border border-[var(--hairline)] bg-white px-2.5 py-[5px] text-[11px] font-semibold text-[var(--ink-2)]">
              <input
                type="checkbox"
                checked={movableOnly}
                onChange={(e) => setMovableOnly(e.target.checked)}
                className="h-3 w-3 accent-[var(--rose)]"
                aria-label="Show movable-only waterfall"
              />
              Movable-only
            </label>
          )}
          <span className="rounded-[7px] bg-[var(--surface-sunken)] px-2.5 py-[3px] text-[11px] font-semibold text-[var(--ink-2)]">
            {view.totalChip}
          </span>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-5 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.1fr)]">
        <div className="h-[280px] rounded-[11px] border border-[var(--hairline)] bg-[var(--surface-soft)] p-3.5">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={chartData} margin={{ top: 8, right: 8, bottom: 8, left: 8 }}>
              <CartesianGrid stroke="var(--hairline)" vertical={false} />
              <XAxis dataKey="label" stroke="var(--muted)" tick={{ fontSize: 11 }} />
              <YAxis stroke="var(--muted)" tick={{ fontSize: 11 }} domain={[0, 'auto']} />
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
          <h5 className="mb-2.5 font-display text-[13px] font-bold text-[var(--ink)]">
            Bucket breakdown · click any bucket to drill
          </h5>
          <div className="flex flex-col">
            {buckets.map((b) => {
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
                          className="ml-2 inline-block rounded-[5px] px-1.5 py-[1px] text-[10px] font-bold"
                          style={{
                            background: b.delta.tone === 'up' ? 'var(--red-bg)' : b.delta.tone === 'down' ? 'var(--green-bg)' : 'var(--surface-sunken)',
                            color: deltaColor(b.delta.tone),
                          }}
                        >
                          {b.delta.label}
                        </span>
                      )}
                      {b.classification && (
                        <ClassificationPill classification={b.classification} note={b.classificationNote} />
                      )}
                      {b.lowNClusters && b.lowNClusters.length > 0 && <LowNBadge clusters={b.lowNClusters} />}
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
          {movableOnly && data.movableView?.heuristic && (
            <p className="mt-2 rounded-md border border-[var(--hairline)] bg-[var(--surface-soft)] px-2.5 py-1.5 text-[10.5px] italic leading-relaxed text-[var(--muted)]">
              <b className="not-italic text-[var(--ink-2)]">{data.movableView.heuristic.label}:</b>{' '}
              {data.movableView.heuristic.qualifier ?? data.movableView.heuristic.rule}
            </p>
          )}
        </div>
      </div>

      <MovableLockedOverlay data={data.movableLocked} />
    </div>
  );
}
