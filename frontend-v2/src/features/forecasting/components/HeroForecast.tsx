import { useMemo, useState } from 'react';
import { Area, ComposedChart, Line, ResponsiveContainer, XAxis, YAxis, CartesianGrid, Tooltip } from 'recharts';
import type { ForecastHero, ForecastIntervals, ForecastMode } from '@/types/forecast';

interface Props {
  hero: ForecastHero;
}

const MODES: { id: ForecastMode; label: string }[] = [
  { id: 'revenue', label: 'Revenue €' },
  { id: 'margin',  label: 'Margin %' },
  { id: 'volume',  label: 'Volume (units)' },
];

type BandMode = 'p80' | 'p80+p95';

export function HeroForecast({ hero }: Props) {
  const [mode, setMode] = useState<ForecastMode>('revenue');
  const [bandMode, setBandMode] = useState<BandMode>('p80+p95');
  const showP95 = bandMode === 'p80+p95';

  // Tuple-array Area gives a true range-band between bounds without
  // forcing a 0-baseline, so we can keep the y-domain tight.
  const chartData = useMemo(
    () =>
      hero.series.map((p) => {
        const p80Low = p.p80Low ?? p.low;
        const p80High = p.p80High ?? p.high;
        const p95Low = p.p95Low ?? p80Low;
        const p95High = p.p95High ?? p80High;
        return {
          month: p.month,
          p80: [p80Low, p80High] as [number, number],
          p95: [p95Low, p95High] as [number, number],
          primary: p.p50 ?? p.primary,
          actual: p.actual,
        };
      }),
    [hero.series],
  );

  const lowestBound = useMemo(
    () => Math.min(...hero.series.map((p) => p.p95Low ?? p.low)),
    [hero.series],
  );
  const highestBound = useMemo(
    () => Math.max(...hero.series.map((p) => p.p95High ?? p.high)),
    [hero.series],
  );
  const yMin = lowestBound - 0.4;
  const yMax = highestBound + 0.4;

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
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
          {hero.intervals && (
            <div
              role="tablist"
              aria-label="Prediction interval bands"
              style={{
                display: 'inline-flex',
                gap: 2,
                padding: 2,
                borderRadius: 8,
                background: 'var(--surface-soft)',
                border: '1px solid var(--hairline)',
              }}
            >
              {(['p80', 'p80+p95'] as BandMode[]).map((bm) => (
                <button
                  key={bm}
                  type="button"
                  onClick={() => setBandMode(bm)}
                  className="band-toggle-btn"
                  style={{
                    border: 'none',
                    background: bandMode === bm ? 'var(--surface)' : 'transparent',
                    color: bandMode === bm ? 'var(--ink)' : 'var(--muted)',
                    boxShadow: bandMode === bm ? 'var(--shadow-sm, 0 1px 2px rgba(0,0,0,0.06))' : 'none',
                    fontSize: 11,
                    fontWeight: 600,
                    padding: '4px 10px',
                    borderRadius: 6,
                    cursor: 'pointer',
                    fontFamily: 'inherit',
                  }}
                >
                  {bm === 'p80' ? 'P50 + P80' : 'P50 + P80 + P95'}
                </button>
              ))}
            </div>
          )}
          <span className="tag-chip">{hero.caption}</span>
        </div>
      </div>

      <div style={{ height: 340, position: 'relative' }}>
        <ResponsiveContainer width="100%" height="100%">
          <ComposedChart data={chartData} margin={{ top: 12, right: 16, left: 0, bottom: 8 }}>
            <defs>
              <linearGradient id="p80Gradient" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="#5a7da3" stopOpacity={0.36} />
                <stop offset="100%" stopColor="#5a7da3" stopOpacity={0.22} />
              </linearGradient>
              <linearGradient id="p95Gradient" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="#5a7da3" stopOpacity={0.14} />
                <stop offset="100%" stopColor="#5a7da3" stopOpacity={0.06} />
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
                if ((n === 'p80' || n === 'p95') && Array.isArray(value)) {
                  const [lo, hi] = value as [number, number];
                  return [`€${lo.toFixed(2)}M – €${hi.toFixed(2)}M`, n.toUpperCase()];
                }
                if (typeof value !== 'number') return [String(value ?? ''), n];
                if (n === 'primary') return [`€${value.toFixed(2)}M`, 'P50'];
                if (n === 'actual')  return [`€${value.toFixed(2)}M`, 'Actual'];
                return [`€${value.toFixed(2)}M`, n];
              }}
            />
            {showP95 && (
              <Area
                type="monotone"
                dataKey="p95"
                stroke="none"
                fill="url(#p95Gradient)"
                isAnimationActive={false}
              />
            )}
            <Area
              type="monotone"
              dataKey="p80"
              stroke="none"
              fill="url(#p80Gradient)"
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

      {hero.intervals && <IntervalsPanel intervals={hero.intervals} showP95={showP95} />}

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

function IntervalsPanel({ intervals, showP95 }: { intervals: ForecastIntervals; showP95: boolean }) {
  const [heuristicOpen, setHeuristicOpen] = useState(false);
  const visibleBands = intervals.bands.filter((b) => showP95 || b.id !== 'p95');
  return (
    <div
      style={{
        marginTop: 14,
        borderRadius: 11,
        border: '1px solid var(--hairline)',
        background: 'var(--surface-soft)',
        padding: '12px 14px',
      }}
      aria-label="Prediction interval calibration"
    >
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 12, flexWrap: 'wrap' }}>
        <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--ink)' }}>{intervals.title}</div>
        <div style={{ fontSize: 11, color: 'var(--muted)' }}>{intervals.calibration.footnote}</div>
      </div>
      <div style={{ marginTop: 8, display: 'grid', gridTemplateColumns: `repeat(${visibleBands.length}, minmax(0, 1fr))`, gap: 10 }}>
        {visibleBands.map((b) => (
          <div key={b.id} style={{ borderLeft: '3px solid var(--rose)', paddingLeft: 8 }}>
            <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--ink)' }}>{b.name}</div>
            <div style={{ marginTop: 2, fontSize: 10.5, color: 'var(--ink-2)', lineHeight: 1.45 }}>{b.desc}</div>
            {b.calibration && (
              <div style={{ marginTop: 4, fontSize: 10.5, fontWeight: 600, color: 'var(--ink-2)', fontVariantNumeric: 'tabular-nums' }}>
                {b.calibration}
              </div>
            )}
          </div>
        ))}
      </div>
      <p style={{ marginTop: 8, fontSize: 11, color: 'var(--ink-2)', lineHeight: 1.5 }}>{intervals.disclosure}</p>
      <button
        type="button"
        onClick={() => setHeuristicOpen((v) => !v)}
        aria-expanded={heuristicOpen}
        style={{
          marginTop: 4,
          background: 'transparent',
          border: '1px solid var(--hairline)',
          borderRadius: 5,
          padding: '2px 7px',
          fontSize: 10.5,
          fontWeight: 600,
          color: 'var(--ink-2)',
          cursor: 'pointer',
        }}
      >
        {intervals.heuristic.label} {heuristicOpen ? '▾' : '▸'}
      </button>
      {heuristicOpen && (
        <p style={{ marginTop: 6, fontSize: 10.5, fontStyle: 'italic', color: 'var(--muted)', lineHeight: 1.45 }}>
          {intervals.heuristic.rule}
          {intervals.heuristic.qualifier && <span style={{ fontStyle: 'normal' }}> · {intervals.heuristic.qualifier}</span>}
        </p>
      )}
    </div>
  );
}
