import { useMemo, useState } from 'react';
import {
  Area,
  ComposedChart,
  Line,
  ResponsiveContainer,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ReferenceLine,
  Scatter,
} from 'recharts';
import type { ForecastHero, ForecastIntervals, ForecastMode } from '@/types/forecast';
import { useForecastOverrides } from '@/data/api/useForecastOverrides';

interface Props {
  hero: ForecastHero;
  /**
   * Phase 4.5 audit fix: the hero used to render its OWN Revenue/Margin/Volume
   * tabs that only re-labelled the axis without swapping series. Those tabs are
   * gone — the chart now follows the page-level ModeToggle. The BFF re-runs
   * the composer when `?mode=` changes, so `hero.series` is already in the
   * right metric. We use `mode` here purely for axis formatting + heading copy.
   */
  mode: ForecastMode;
  /**
   * Phase 3 (forecast redesign v2) — click-to-edit hook. When provided, P50
   * active dots become clickable and the tooltip shows a "Click to enter
   * actual →" hint. Phase 4 will wire this to the ActualEntryPanel. Optional
   * so existing call sites (AggregateViewV1) continue to compile.
   */
  onPointClick?: (month: string) => void;
}

type BandMode = 'p80' | 'p80+p95';

const MODE_TITLE: Record<ForecastMode, string> = {
  revenue: 'Revenue forecast',
  margin: 'Margin forecast',
  volume: 'Volume forecast',
};

function formatY(mode: ForecastMode, v: number): string {
  if (mode === 'margin') {
    // Backend ships margin as ratio (0..1). Render as percent.
    const pct = v <= 1.5 ? v * 100 : v;
    return `${pct.toFixed(1)}%`;
  }
  if (mode === 'volume') {
    if (Math.abs(v) >= 1_000_000) return `${(v / 1_000_000).toFixed(1)}M`;
    if (Math.abs(v) >= 1_000) return `${(v / 1_000).toFixed(0)}K`;
    return v.toFixed(0);
  }
  // revenue (EUR)
  if (Math.abs(v) >= 1_000_000) return `€${(v / 1_000_000).toFixed(1)}M`;
  if (Math.abs(v) >= 1_000) return `€${(v / 1_000).toFixed(0)}K`;
  return `€${v.toFixed(0)}`;
}

function formatTooltip(mode: ForecastMode, v: number): string {
  if (mode === 'margin') {
    const pct = v <= 1.5 ? v * 100 : v;
    return `${pct.toFixed(2)}%`;
  }
  if (mode === 'volume') {
    if (Math.abs(v) >= 1_000_000) return `${(v / 1_000_000).toFixed(2)}M units`;
    if (Math.abs(v) >= 1_000) return `${(v / 1_000).toFixed(1)}K units`;
    return `${v.toFixed(0)} units`;
  }
  if (Math.abs(v) >= 1_000_000) return `€${(v / 1_000_000).toFixed(2)}M`;
  if (Math.abs(v) >= 1_000) return `€${(v / 1_000).toFixed(1)}K`;
  return `€${v.toFixed(0)}`;
}

export function HeroForecast({ hero, mode, onPointClick }: Props) {
  const [bandMode, setBandMode] = useState<BandMode>('p80+p95');
  const showP95 = bandMode === 'p80+p95';
  // Phase 3 (forecast redesign v2): cap history to 6mo by default. Frank told
  // us the early history months were eating screen real estate without adding
  // signal. Toggle restores the full series on demand.
  const [showFullHistory, setShowFullHistory] = useState(false);

  // Phase 3.4 — fetch saved overrides and project them as diamond glyphs onto
  // the chart. Filtered to the active mode (a margin override doesn't belong
  // on a revenue chart). Hook tolerates a missing/empty backend (returns
  // `{ items: [] }`).
  const { data: overridesData } = useForecastOverrides({});
  const overrideMonths = useMemo(() => {
    const items = overridesData?.items ?? [];
    return new Set(items.filter((o) => o.mode === mode).map((o) => o.month));
  }, [overridesData, mode]);

  // Round 4 fix: backend now ships REAL per-mode series sourced from invoices
  // (real_hero.py). No heuristic rescale needed. Identity function.
  const scale = useMemo(() => (v: number) => v, []);
  const isApprox = false;

  // Tuple-array Area gives a true range-band between bounds without
  // forcing a 0-baseline, so we can keep the y-domain tight.
  const fullChartData = useMemo(
    () =>
      hero.series.map((p) => {
        const p80Low = scale(p.p80Low ?? p.low);
        const p80High = scale(p.p80High ?? p.high);
        const p95Low = scale(p.p95Low ?? p.low);
        const p95High = scale(p.p95High ?? p.high);
        return {
          month: p.month,
          p80: [p80Low, p80High] as [number, number],
          p95: [p95Low, p95High] as [number, number],
          primary: scale(p.p50 ?? p.primary),
          actual: p.actual != null ? scale(p.actual) : undefined,
        };
      }),
    [hero.series, scale],
  );

  // Phase 3.2 — trim to last 6 months of history + everything forward.
  // The series mixes history (actual != null) and forecast (actual == null);
  // we find the first forecast index and slice back 6 from there.
  const firstForecastIdx = useMemo(() => {
    const idx = fullChartData.findIndex((p) => p.actual == null);
    return idx === -1 ? fullChartData.length : idx;
  }, [fullChartData]);

  const chartData = useMemo(() => {
    if (showFullHistory) return fullChartData;
    if (firstForecastIdx <= 6) return fullChartData;
    return fullChartData.slice(Math.max(0, firstForecastIdx - 6));
  }, [fullChartData, firstForecastIdx, showFullHistory]);

  const firstForecastMonth = useMemo(() => {
    const idxInTrimmed = chartData.findIndex((p) => p.actual == null);
    return idxInTrimmed === -1 ? null : chartData[idxInTrimmed].month;
  }, [chartData]);

  // Diamond glyphs for months that have a saved override. We pin them to the
  // chart's own p50 line so they snap to the visible band regardless of where
  // the user's actual landed (the actual value already shows via the actual
  // dot — the diamond is the "this month was overridden" signal).
  const overrideMarkers = useMemo(
    () =>
      chartData
        .filter((p) => overrideMonths.has(p.month))
        .map((p) => ({
          month: p.month,
          overrideY: p.actual ?? p.primary,
        })),
    [chartData, overrideMonths],
  );

  const lowestBound = useMemo(
    () => Math.min(...hero.series.map((p) => scale(p.p95Low ?? p.low))),
    [hero.series, scale],
  );
  const highestBound = useMemo(
    () => Math.max(...hero.series.map((p) => scale(p.p95High ?? p.high))),
    [hero.series, scale],
  );
  // Round 4: scale-aware padding now that the series is real per mode.
  // Margin comes back as ratio 0..1 (so 0.05 = 5pp); revenue/volume in absolute units.
  const span = Math.max(highestBound - lowestBound, 1e-9);
  const pad = span * 0.08; // 8% headroom on each side
  const yMin = mode === 'margin' ? Math.max(0, lowestBound - pad) : lowestBound - pad;
  const yMax = highestBound + pad;

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
        {/*
          Phase 4.5: internal mode tabs removed — they only swapped labels, not
          data. The page-level ModeToggle is the single source of truth.
        */}
        <div>
          <div
            style={{
              fontFamily: "'Manrope', sans-serif",
              fontSize: 14,
              fontWeight: 700,
              color: 'var(--ink)',
              letterSpacing: '-0.01em',
            }}
            data-testid="hero-title"
          >
            {MODE_TITLE[mode]}
            {isApprox && (
              <span
                data-testid="hero-approx-badge"
                style={{
                  marginLeft: 8,
                  display: 'inline-block',
                  padding: '1px 6px',
                  borderRadius: 4,
                  fontSize: 10,
                  fontWeight: 600,
                  color: 'var(--muted)',
                  background: 'var(--surface-soft)',
                  border: '1px solid var(--hairline)',
                  letterSpacing: '0.02em',
                  textTransform: 'uppercase',
                }}
                title="Series approximated from revenue. Backend will ship distinct margin/volume series soon."
              >
                approximate
              </span>
            )}
          </div>
          <div style={{ fontSize: 11, color: 'var(--muted)', marginTop: 2 }}>
            Walk-forward · solid line = P50 · shaded = envelope
            {isApprox && ' · series approximated from revenue scale'}
          </div>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
          <button
            type="button"
            onClick={() => setShowFullHistory((v) => !v)}
            aria-pressed={showFullHistory}
            data-testid="hero-history-toggle"
            style={{
              background: 'transparent',
              border: '1px solid var(--hairline)',
              borderRadius: 6,
              padding: '4px 10px',
              fontSize: 11,
              fontWeight: 600,
              color: 'var(--muted)',
              cursor: 'pointer',
              letterSpacing: '0.02em',
              textTransform: 'uppercase',
              fontFamily: 'inherit',
            }}
          >
            {showFullHistory ? 'Trim history' : 'Show full history'}
          </button>
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
              {/*
                Phase 3 (forecast redesign v2) — moved bands from the legacy
                blue (#5a7da3) to the rose design language. Two stacked bands:
                P80 darker on top, P95 lighter underneath.
              */}
              <linearGradient id="p80Gradient" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="var(--rose-deep, #a04055)" stopOpacity={0.26} />
                <stop offset="100%" stopColor="var(--rose-deep, #a04055)" stopOpacity={0.18} />
              </linearGradient>
              <linearGradient id="p95Gradient" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="var(--rose-deep, #a04055)" stopOpacity={0.12} />
                <stop offset="100%" stopColor="var(--rose-deep, #a04055)" stopOpacity={0.06} />
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
              tickFormatter={(v: number) => formatY(mode, v)}
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
                  return [
                    `${formatTooltip(mode, lo)} – ${formatTooltip(mode, hi)}`,
                    n.toUpperCase(),
                  ];
                }
                if (typeof value !== 'number') return [String(value ?? ''), n];
                if (n === 'primary') return [formatTooltip(mode, value), 'P50'];
                if (n === 'actual')  return [formatTooltip(mode, value), 'Actual'];
                if (n === 'overrideY') return [formatTooltip(mode, value), 'Override'];
                return [formatTooltip(mode, value), n];
              }}
              // Phase 3.3 — when a click handler is supplied, append a small
              // hint under the tooltip rows so Frank knows the chart is
              // interactive. We compose via the `content` prop's default-ish
              // wrapper using `wrapperStyle`-friendly content trick: simpler
              // to render the hint as a labelFormatter suffix.
              labelFormatter={(label) => (
                <span>
                  {label}
                  {onPointClick && (
                    <span
                      data-testid="hero-tooltip-click-hint"
                      style={{
                        display: 'block',
                        marginTop: 2,
                        fontSize: 10,
                        fontWeight: 500,
                        color: 'var(--muted)',
                      }}
                    >
                      Click to enter actual →
                    </span>
                  )}
                </span>
              )}
            />
            {firstForecastMonth && (
              <ReferenceLine
                x={firstForecastMonth}
                stroke="var(--hairline, #dde1e7)"
                strokeDasharray="3 3"
                label={{ value: 'Now', position: 'top', fill: 'var(--muted)', fontSize: 10 }}
              />
            )}
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
              activeDot={
                onPointClick
                  ? {
                      r: 5,
                      fill: '#3e5d80',
                      cursor: 'pointer',
                      // Recharts passes the dot payload (including `month`)
                      // as the second arg of `onClick`. We tolerate both
                      // shapes — some Recharts versions pass it on the
                      // event target's `payload` property.
                      onClick: (_evt: unknown, payload: unknown) => {
                        const p = payload as { payload?: { month?: string }; month?: string } | undefined;
                        const month = p?.payload?.month ?? p?.month;
                        if (month) onPointClick(month);
                      },
                    }
                  : { r: 4, fill: '#3e5d80' }
              }
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
            {overrideMarkers.length > 0 && (
              <Scatter
                data={overrideMarkers}
                dataKey="overrideY"
                shape={DiamondShape}
                isAnimationActive={false}
                name="Override"
              />
            )}
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

// Phase 3.4 — diamond glyph drawn at the override actual on the P50 line.
// Rendered via a Recharts `<Scatter>` with this custom `shape`.
function DiamondShape(props: { cx?: number; cy?: number }) {
  const { cx, cy } = props;
  if (cx == null || cy == null) return null;
  return (
    <polygon
      points={`${cx},${cy - 6} ${cx + 6},${cy} ${cx},${cy + 6} ${cx - 6},${cy}`}
      fill="var(--rose-deep, #a04055)"
      stroke="#fff"
      strokeWidth={1.5}
      data-testid="hero-override-diamond"
    />
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
