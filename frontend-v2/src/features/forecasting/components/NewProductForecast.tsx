import { Area, AreaChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import type { NewProductForecast as NewProductForecastData } from '@/types/forecast';
import { AccuracyBadge } from './AccuracyBadge';

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
        {cards.map((c) => {
          const toneCls = c.tone === 'status' ? 'status' : `status ${c.tone}`;
          const isManual = c.primaryAction === 'manual';
          return (
            <div className="action-card" key={c.rank}>
              <div className="ac-section">
                <div className="ac-head">
                  <div className="ac-rank">{c.rank}</div>
                  <div className="ac-title">
                    <div className="h">{c.title}</div>
                    <div className="t">{renderBoldDescription(c.description)}</div>
                  </div>
                  <div className="ac-tools">
                    <span className={`tag-chip ${toneCls}`}>{c.confidence}</span>
                  </div>
                </div>
                <div className="ac-cta-row" style={{ marginTop: 14 }}>
                  <button type="button" className="btn-secondary">
                    {c.secondaryLabel}
                  </button>
                  {isManual ? (
                    <button type="button" className="btn-secondary">
                      {c.primaryLabel}
                    </button>
                  ) : (
                    <button type="button" className="btn-primary-rose">
                      {c.primaryLabel}
                    </button>
                  )}
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </>
  );
}
