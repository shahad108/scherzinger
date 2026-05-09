import { useMemo, useState } from 'react';
import { Area, ComposedChart, Line, ResponsiveContainer, XAxis, YAxis, CartesianGrid, Tooltip } from 'recharts';
import type { ForecastHero, ForecastMode } from '@/types/forecast';

interface Props {
  hero: ForecastHero;
}

const MODES: { id: ForecastMode; label: string }[] = [
  { id: 'revenue', label: 'Revenue €' },
  { id: 'margin',  label: 'Margin %' },
  { id: 'volume',  label: 'Volume (units)' },
];

export function HeroForecast({ hero }: Props) {
  const [mode, setMode] = useState<ForecastMode>('revenue');

  // Tuple-array Area gives a true range-band between low and high without
  // forcing a 0-baseline, so we can keep the y-domain tight on actual values.
  const chartData = useMemo(
    () =>
      hero.series.map((p) => ({
        month: p.month,
        envelope: [p.low, p.high] as [number, number],
        primary: p.primary,
        actual: p.actual,
      })),
    [hero.series],
  );

  const yMin = useMemo(() => Math.min(...hero.series.map((p) => p.low)) - 0.4, [hero.series]);
  const yMax = useMemo(() => Math.max(...hero.series.map((p) => p.high)) + 0.4, [hero.series]);

  const movablePct = hero.movableLockedSplit.movablePct;

  return (
    <div className="hero-card" style={{ marginTop: 14 }}>
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'flex-start',
          gap: 14,
          flexWrap: 'wrap',
          marginBottom: 14,
        }}
      >
        <div className="fc-mode-toggle" role="tablist">
          {MODES.map((m) => (
            <button
              key={m.id}
              type="button"
              className={mode === m.id ? 'active' : undefined}
              onClick={() => setMode(m.id)}
            >
              {m.label}
            </button>
          ))}
        </div>
        <span className="tag-chip">{hero.caption}</span>
      </div>

      <div style={{ height: 340, position: 'relative' }}>
        <ResponsiveContainer width="100%" height="100%">
          <ComposedChart data={chartData} margin={{ top: 12, right: 16, left: 0, bottom: 8 }}>
            <defs>
              <linearGradient id="bandGradient" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="#5a7da3" stopOpacity={0.32} />
                <stop offset="100%" stopColor="#5a7da3" stopOpacity={0.16} />
              </linearGradient>
            </defs>
            <CartesianGrid stroke="#eaedf1" vertical={false} />
            <XAxis
              dataKey="month"
              stroke="#7d8693"
              tick={{ fontSize: 11, fill: '#7d8693' }}
              tickLine={false}
              axisLine={{ stroke: '#dde1e7' }}
            />
            <YAxis
              stroke="#7d8693"
              tick={{ fontSize: 11, fill: '#7d8693' }}
              tickLine={false}
              axisLine={false}
              width={48}
              tickFormatter={(v: number) => `€${v.toFixed(1)}M`}
              domain={[yMin, yMax]}
            />
            <Tooltip
              cursor={{ stroke: '#c8cdd4', strokeDasharray: '3 3' }}
              contentStyle={{
                background: 'var(--surface)',
                border: '1px solid var(--border)',
                borderRadius: 11,
                fontSize: 12,
                boxShadow: 'var(--shadow-pop)',
              }}
              formatter={(value, name) => {
                const n = String(name);
                if (n === 'envelope' && Array.isArray(value)) {
                  const [lo, hi] = value as [number, number];
                  return [`€${lo.toFixed(2)}M – €${hi.toFixed(2)}M`, 'Envelope'];
                }
                if (typeof value !== 'number') return [String(value ?? ''), n];
                if (n === 'primary') return [`€${value.toFixed(2)}M`, 'Primary'];
                if (n === 'actual')  return [`€${value.toFixed(2)}M`, 'Actual'];
                return [`€${value.toFixed(2)}M`, n];
              }}
            />
            <Area
              type="monotone"
              dataKey="envelope"
              stroke="none"
              fill="url(#bandGradient)"
              isAnimationActive={false}
            />
            <Line
              type="monotone"
              dataKey="primary"
              stroke="#5a7da3"
              strokeWidth={2}
              strokeLinecap="round"
              dot={false}
              activeDot={{ r: 4, fill: '#3e5d80' }}
              isAnimationActive={false}
            />
            <Line
              type="monotone"
              dataKey="actual"
              stroke="transparent"
              dot={{ r: 3.5, fill: '#3e5d80', stroke: '#fff', strokeWidth: 1.5 }}
              activeDot={{ r: 5, fill: '#3e5d80' }}
              connectNulls={false}
              isAnimationActive={false}
            />
          </ComposedChart>
        </ResponsiveContainer>
      </div>

      <div className="signal-with-trend" style={{ marginTop: 18 }}>
        <div className="signal-pane">
          <div className="ttl">
            What changed since last week
            <span className="ttl-sub">— top 3 movers</span>
          </div>
          <div className="fact-list">
            {hero.movers.map((m) => (
              <div className="fact-row" key={m.label}>
                <div className="fact-l">{m.label}</div>
                <div className="fact-mid">
                  <div className={`fact-v ${m.tone}`}>{m.value}</div>
                  <div className="fact-s" dangerouslySetInnerHTML={{ __html: m.sub.replace(/\b(\d{6}|\+€\d+K)\b/g, '<b>$1</b>') }} />
                </div>
              </div>
            ))}
          </div>
        </div>
        <div className="trend-pane">
          <div className="lab">{hero.movableLockedSplit.label}</div>
          <div className="v">{hero.movableLockedSplit.value}</div>
          <div
            style={{
              display: 'flex',
              height: 6,
              borderRadius: 4,
              overflow: 'hidden',
              marginTop: 10,
              background: 'var(--surface-soft)',
            }}
          >
            <div style={{ flex: `0 0 ${movablePct}%`, background: 'var(--rose)' }} />
            <div style={{ flex: 1, background: 'var(--ink-3)', opacity: 0.35 }} />
          </div>
          <div style={{ fontSize: 11, color: 'var(--muted)', marginTop: 8, lineHeight: 1.4 }}>
            {hero.movableLockedSplit.sub}
          </div>
        </div>
      </div>

      <div className="lq-card" style={{ marginTop: 14, padding: '18px 20px' }}>
        <div className="ttl">
          {hero.whyBandMoves.title}
          <span className="ttl-sub">— {hero.whyBandMoves.sub}</span>
        </div>
        <div className="fact-list">
          {hero.whyBandMoves.rows.map((r) => (
            <div className="fact-row" key={r.label}>
              <div className="fact-l">{r.label}</div>
              <div className="fact-mid">
                <div className={`fact-v ${r.tone}`}>{r.value}</div>
                <div className="fact-s">{r.sub}</div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
