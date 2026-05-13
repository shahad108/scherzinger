import { useState } from 'react';
import { Area, AreaChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import type { NewProductForecast as NewProductForecastData } from '@/types/forecast';
import { AccuracyBadge } from './AccuracyBadge';

const CANDIDATE_CLUSTERS: Record<string, { id: string; similarityScore: number; sampleSize: number; rationale: string }[]> = {
  BKAES: [
    { id: 'BKAES', similarityScore: 0.92, sampleSize: 627, rationale: 'Shares commodity_group BKAES + same business_unit; BOM signature overlap 86%.' },
    { id: 'BKAGG', similarityScore: 0.61, sampleSize: 370, rationale: 'Similar bearing/shaft assembly cohort.' },
    { id: 'BKAIZ', similarityScore: 0.34, sampleSize: 142, rationale: 'Adjacent coupling family; weaker match.' },
  ],
  BKAGG: [
    { id: 'BKAGG', similarityScore: 0.94, sampleSize: 370, rationale: 'Direct cluster match; n adequate.' },
    { id: 'BKAES', similarityScore: 0.58, sampleSize: 627, rationale: 'Larger neighbour cohort; useful prior.' },
    { id: 'BKAIZ', similarityScore: 0.41, sampleSize: 142, rationale: 'Adjacent coupling family.' },
  ],
  SOPU: [
    { id: 'SOPU', similarityScore: 0.79, sampleSize: 6, rationale: 'Direct match but very low n; defer to manual review.' },
    { id: 'BKAIZ', similarityScore: 0.46, sampleSize: 142, rationale: 'Specialty coupling adjacency.' },
    { id: 'BKAGG', similarityScore: 0.32, sampleSize: 370, rationale: 'Closest stable-n alternative.' },
  ],
};

interface Props {
  data: NewProductForecastData;
}

function renderBoldDescription(text: string) {
  const parts = text.split(/(\*\*[^*]+\*\*)/g);
  return parts.map((p, i) =>
    p.startsWith('**') && p.endsWith('**') ? (
      <b key={i} style={{ color: 'var(--ink)', fontWeight: 700 }}>
        {p.slice(2, -2)}
      </b>
    ) : (
      <span key={i}>{p}</span>
    ),
  );
}

export function NewProductForecast({ data }: Props) {
  const { stats, series, cards } = data;

  return (
    <>
      <div className="section-row">
        <div>
          <h2>New product forecast · comparable cluster</h2>
          <div className="sub">
            Frank's job: price new products without a historical baseline. Model assigns each new
            SKU to its closest cluster.
          </div>
        </div>
        <div className="flex items-center gap-2">
          <AccuracyBadge
            data={{
              metric: 'mape',
              value: 0.0688,
              n: 36,
              horizonMonths: 12,
              modelId: 'margin_walk_forward_v3',
            }}
            entityType="product"
            drawerTitle="New-product cluster anchor — lineage"
          />
          <span className="tag-chip">Predictive Portfolio Pricing</span>
        </div>
      </div>

      <div className="lq-card">
        <div className="lq-stats">
          {stats.map((s) => (
            <div className="lq-stat" key={s.label}>
              <div className="num">{s.num}</div>
              <div className="lab">{s.label}</div>
            </div>
          ))}
        </div>
        <div style={{ height: 160, position: 'relative' }}>
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={series} margin={{ top: 8, right: 12, left: 0, bottom: 0 }}>
              <defs>
                <linearGradient id="newProductGradient" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#5a7da3" stopOpacity={0.32} />
                  <stop offset="100%" stopColor="#5a7da3" stopOpacity={0.06} />
                </linearGradient>
              </defs>
              <XAxis
                dataKey="month"
                stroke="#7d8693"
                tick={{ fontSize: 11, fill: '#7d8693' }}
                tickLine={false}
                axisLine={false}
              />
              <YAxis hide domain={['auto', 'auto']} />
              <Tooltip
                cursor={{ stroke: '#c8cdd4', strokeDasharray: '3 3' }}
                contentStyle={{
                  background: 'var(--surface)',
                  border: '1px solid var(--border)',
                  borderRadius: 11,
                  fontSize: 12,
                  boxShadow: 'var(--shadow-pop)',
                }}
                formatter={(v) => [typeof v === 'number' ? `${v} SKUs` : String(v ?? ''), 'New SKUs']}
              />
              <Area
                type="monotone"
                dataKey="value"
                stroke="#5a7da3"
                strokeWidth={2}
                fill="url(#newProductGradient)"
                isAnimationActive={false}
              />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      </div>

      <div className="actions-list" style={{ marginTop: 14 }}>
        {cards.map((c) => (
          <NewProductCardWithPicker key={c.rank} card={c} renderBoldDescription={renderBoldDescription} />
        ))}
      </div>
    </>
  );
}

interface NewProductCardProps {
  card: NewProductForecastData['cards'][number];
  renderBoldDescription: (text: string) => React.ReactNode;
}

function NewProductCardWithPicker({ card, renderBoldDescription }: NewProductCardProps) {
  const candidates = CANDIDATE_CLUSTERS[card.cluster] ?? [];
  const [selected, setSelected] = useState(candidates[0]?.id ?? card.cluster);
  const toneCls = card.tone === 'status' ? 'status' : `status ${card.tone}`;
  const isManual = card.primaryAction === 'manual';
  const active = candidates.find((c) => c.id === selected) ?? candidates[0];

  return (
    <div className="action-card">
      <div className="ac-section">
        <div className="ac-head">
          <div className="ac-rank">{card.rank}</div>
          <div className="ac-title">
            <div className="h">{card.title}</div>
            <div className="t">{renderBoldDescription(card.description)}</div>
          </div>
          <div className="ac-tools">
            <span className={`tag-chip ${toneCls}`}>{card.confidence}</span>
          </div>
        </div>

        {candidates.length > 0 && (
          <div className="mt-3 rounded-md border border-[var(--hairline)] bg-[var(--surface-soft)] p-3" data-testid={`cluster-picker-${card.rank}`}>
            <div className="flex items-center justify-between">
              <span className="text-[10.5px] font-semibold uppercase tracking-wide text-[var(--muted)]">
                Assigned cluster
              </span>
              <select
                data-testid={`cluster-picker-select-${card.rank}`}
                value={selected}
                onChange={(e) => setSelected(e.target.value)}
                className="rounded-md border border-[var(--hairline)] bg-white px-2 py-1 text-[12px] font-semibold focus:outline-none focus:ring-2 focus:ring-[var(--rose-deep)]"
              >
                {candidates.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.id} · similarity {(c.similarityScore * 100).toFixed(0)}% · n={c.sampleSize}
                  </option>
                ))}
              </select>
            </div>
            {active && (
              <div className="mt-1 text-[11.5px] italic text-[var(--muted)]" title="Why this cluster?">
                {active.rationale}
              </div>
            )}
          </div>
        )}

        <div className="ac-cta-row" style={{ marginTop: 14 }}>
          <button type="button" className="btn-secondary">
            {card.secondaryLabel}
          </button>
          {isManual ? (
            <button type="button" className="btn-secondary">
              {card.primaryLabel}
            </button>
          ) : (
            <button type="button" className="btn-primary-rose">
              {card.primaryLabel}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
