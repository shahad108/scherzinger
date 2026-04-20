import { useMemo, useState } from 'react';
import {
  ComposedChart, Line, Bar, Area, LineChart,
  ResponsiveContainer, XAxis, YAxis, Tooltip, CartesianGrid, ReferenceLine, Legend,
} from 'recharts';
import { motion } from 'motion/react';
import { TrendingDown, TrendingUp, AlertTriangle, ShieldCheck, Activity } from 'lucide-react';
import ChartCard from '../shared/ChartCard';
import DataTable from '../shared/DataTable';
import KPICard from '../shared/KPICard';
import CustomTooltip from '../shared/CustomTooltip';
import { colors, shadows, radius } from '../../utils/designTokensV2';
import { useLanguage } from '../../context/LanguageContext';
import { useUI } from '../../context/UIContext';
import { getFloorPrices, getSkuImpactTable } from '../../utils/mockPhase45';
import forecastingData from '../../data/forecasting.json';
import SKUDeepDiveSlideOver from './SKUDeepDiveSlideOver';

/* ── Derivation (deterministic, no randomness) ──
 *
 * For each SKU in floorPrices:
 *   currentMargin  = (current − HKvoll) / current
 *   firmwideSlopeQ = quarter-over-quarter slope of forecasting.json
 *                    quarterly_margins (pp per quarter)
 *   matPressure    = (matShare − avgMatShare) * 0.012
 *                    (more material exposure → more downside)
 *   forecast[q]    = currentMargin + (firmwideSlopeQ − matPressure) * q
 *
 * Confidence widens each quarter: conf[q] = 0.92 − q*0.04 − |matShare-0.35|*0.3
 *
 * Revenue per quarter holds volume constant (we synthesise a plausible
 * quarterly volume from the floor-price gap) and applies the growth
 * factor from forecasting.json revenue_projections.
 */

function computeSlopePerQuarter(series) {
  const n = series.length;
  if (n < 2) return 0;
  const meanX = (n - 1) / 2;
  const meanY = series.reduce((s, d) => s + d.margin, 0) / n;
  let num = 0, den = 0;
  series.forEach((d, i) => {
    num += (i - meanX) * (d.margin - meanY);
    den += (i - meanX) ** 2;
  });
  return num / den;
}

function riskBucket(currentPct, q4Pct) {
  const drop = currentPct - q4Pct;
  if (drop >= 2) return 'atRisk';
  if (drop >= 0.8) return 'watch';
  return 'stable';
}

// Rough synthetic quarterly units — proportional to (current price)^-0.6
// so higher-priced SKUs have fewer units. Grounded in the observation that
// PW-0555 @ €4680 moves less volume than PM-0431 @ €920.
function syntheticQuarterlyUnits(current) {
  return Math.round(18000 / Math.pow(current, 0.55));
}

function buildSKUForecasts() {
  const floors = getFloorPrices();
  const impact = getSkuImpactTable();
  if (!floors || floors.length === 0) return [];

  const quarterlyMargins = forecastingData.quarterly_margins;
  const slopeQ = computeSlopePerQuarter(quarterlyMargins); // pp/q as fraction (≈ -0.004)
  const avgMatShare = impact.reduce((s, r) => s + r.matShare, 0) / impact.length;

  const growthFactorsByQ = forecastingData.revenue_projections.map(p => p.growth_factor);
  const seasonalFactorsByQ = forecastingData.revenue_projections.map(p => p.seasonal_factor);

  return floors.map(f => {
    const impactEntry = impact.find(i => i.sku === f.sku) || { matShare: avgMatShare };
    const currentMargin = (f.current - f.hkvoll) / f.current;
    const matPressure = (impactEntry.matShare - avgMatShare) * 0.012;

    const forecastQuarters = [1, 2, 3, 4].map((q, idx) => {
      const margin = currentMargin + (slopeQ - matPressure) * q;
      const units = syntheticQuarterlyUnits(f.current);
      const revenue = f.current * units * (growthFactorsByQ[idx] || 1) * (seasonalFactorsByQ[idx] || 1);
      const confidence = Math.max(0.4, 0.92 - q * 0.04 - Math.abs(impactEntry.matShare - 0.35) * 0.3);
      const spread = margin * (1 - confidence) * 0.25; // band half-width
      return {
        q: `Q${q} 2025`,
        qKey: `q${q}`,
        margin: +(margin * 100).toFixed(1),
        revenue: Math.round(revenue),
        upper: +((margin + spread) * 100).toFixed(1),
        lower: +((margin - spread) * 100).toFixed(1),
        confidence,
      };
    });

    const currentPct = +(currentMargin * 100).toFixed(1);
    const q4Pct = forecastQuarters[3].margin;
    const swingPP = +(currentPct - q4Pct).toFixed(1);
    const avgConf = forecastQuarters.reduce((s, q) => s + q.confidence, 0) / 4;

    return {
      sku: f.sku,
      name: f.name,
      cg: f.cg,
      currentMargin: currentPct,
      forecast: forecastQuarters,
      q1: forecastQuarters[0].margin,
      q2: forecastQuarters[1].margin,
      q3: forecastQuarters[2].margin,
      q4: q4Pct,
      swingPP,
      avgConfidence: +avgConf.toFixed(2),
      risk: riskBucket(currentPct, q4Pct),
    };
  });
}

function DeltaChip({ base, value }) {
  const delta = +(value - base).toFixed(1);
  const tone = delta > 0 ? 'positive' : delta < -0.5 ? 'negative' : 'neutral';
  const bg = tone === 'positive' ? '#ecfdf5' : tone === 'negative' ? '#fef2f2' : '#f1f5f9';
  const fg = tone === 'positive' ? '#047857' : tone === 'negative' ? '#b91c1c' : '#64748b';
  const arrow = delta > 0 ? '▲' : delta < 0 ? '▼' : '→';
  return (
    <div className="inline-flex flex-col items-end">
      <span className="font-semibold text-sm" style={{ color: colors.darkNavy }}>{value.toFixed(1)}%</span>
      <span className="text-[10px] font-medium px-1.5 py-0.5 rounded" style={{ background: bg, color: fg }}>
        {arrow} {Math.abs(delta).toFixed(1)} pp
      </span>
    </div>
  );
}

function Sparkline({ row }) {
  const points = [
    row.currentMargin,
    ...row.forecast.map((f) => f.margin),
  ];
  const stroke = row.risk === 'atRisk' ? '#ef4444' : row.risk === 'watch' ? '#f59e0b' : '#10b981';
  const w = 80, h = 28, pad = 3;
  const min = Math.min(...points);
  const max = Math.max(...points);
  const range = max - min || 1;
  const xStep = (w - pad * 2) / (points.length - 1);
  const path = points
    .map((y, i) => `${i === 0 ? 'M' : 'L'}${(pad + i * xStep).toFixed(1)},${(h - pad - ((y - min) / range) * (h - pad * 2)).toFixed(1)}`)
    .join(' ');
  return (
    <svg width={w} height={h} style={{ display: 'block' }}>
      <path d={path} fill="none" stroke={stroke} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function RiskChip({ risk, t }) {
  const config = {
    stable:  { bg: '#ecfdf5', fg: '#047857', label: t('phase45.forecast.sku.risk.stable'), icon: ShieldCheck },
    watch:   { bg: '#fffbeb', fg: '#b45309', label: t('phase45.forecast.sku.risk.watch'),  icon: Activity },
    atRisk:  { bg: '#fef2f2', fg: '#b91c1c', label: t('phase45.forecast.sku.risk.atRisk'), icon: AlertTriangle },
  }[risk];
  const Icon = config.icon;
  return (
    <span className="inline-flex items-center gap-1 text-[11px] font-semibold px-2 py-1 rounded-full" style={{ background: config.bg, color: config.fg }}>
      <Icon size={11} /> {config.label}
    </span>
  );
}

export default function SKUForecastSection() {
  const { t } = useLanguage();
  const { selectItem } = useUI();
  const [selectedSku, setSelectedSku] = useState(null);

  const handleRowClick = (row) => {
    setSelectedSku(row.sku);
    selectItem({
      type: 'sku',
      id: row.sku,
      label: `${row.sku} — ${row.name} · Current ${row.currentMargin.toFixed(1)}% → Q4 2025 ${row.q4.toFixed(1)}% (${row.risk})`,
      data: {
        sku: row.sku,
        name: row.name,
        commodity_group: row.cg,
        current_margin_pct: row.currentMargin,
        forecast_q1_2025: row.q1,
        forecast_q2_2025: row.q2,
        forecast_q3_2025: row.q3,
        forecast_q4_2025: row.q4,
        swing_pp: row.swingPP,
        risk: row.risk,
        confidence: row.avgConfidence,
      },
    });
  };

  const rows = useMemo(() => buildSKUForecasts(), []);

  const riskStats = useMemo(() => {
    if (rows.length === 0) return { atRiskCount: 0, avgConfidence: 0, biggestSwing: null };
    const atRiskCount = rows.filter(r => r.risk === 'atRisk').length;
    const avgConfidence = rows.reduce((s, r) => s + r.avgConfidence, 0) / rows.length;
    const biggestSwing = rows.slice().sort((a, b) => Math.abs(b.swingPP) - Math.abs(a.swingPP))[0];
    return { atRiskCount, avgConfidence, biggestSwing };
  }, [rows]);

  const aggregated = useMemo(() => {
    if (rows.length === 0) return [];
    const baseRevenue = rows.reduce((s, r) => {
      const firstForecastRev = r.forecast[0].revenue;
      const growth = forecastingData.revenue_projections[0].growth_factor;
      const seasonal = forecastingData.revenue_projections[0].seasonal_factor;
      return s + firstForecastRev / (growth * seasonal);
    }, 0);
    const baseMargin = rows.length
      ? rows.reduce((s, r) => s + r.currentMargin, 0) / rows.length
      : 0;
    const baseRow = {
      q: '2024-Q4',
      revenue: Math.round(baseRevenue),
      margin: +baseMargin.toFixed(1),
      upper: +baseMargin.toFixed(1),
      lower: +baseMargin.toFixed(1),
    };

    const qRows = [0, 1, 2, 3].map(i => {
      const revenue = rows.reduce((s, r) => s + r.forecast[i].revenue, 0);
      const margin = rows.reduce((s, r) => s + r.forecast[i].margin, 0) / rows.length;
      const upper  = rows.reduce((s, r) => s + r.forecast[i].upper,  0) / rows.length;
      const lower  = rows.reduce((s, r) => s + r.forecast[i].lower,  0) / rows.length;
      return {
        q: `2025-Q${i + 1}`,
        revenue: Math.round(revenue),
        margin: +margin.toFixed(1),
        upper: +upper.toFixed(1),
        lower: +lower.toFixed(1),
        band: [+lower.toFixed(1), +upper.toFixed(1)],
      };
    });

    return [baseRow, ...qRows];
  }, [rows]);

  const columns = [
    { key: 'sku',  label: t('phase45.forecast.sku.col.sku'),  render: (v) => <span className="font-semibold" style={{ color: colors.darkNavy }}>{v}</span> },
    { key: 'name', label: t('phase45.forecast.sku.col.name'), render: (v) => <span className="text-slate-600">{v}</span> },
    { key: 'cg',   label: t('phase45.forecast.sku.col.cg'),   render: (v) => <span className="text-[10px] font-bold px-2 py-0.5 rounded" style={{ background: '#eef6ff', color: '#0369a1' }}>{v}</span> },
    { key: 'currentMargin', label: t('phase45.forecast.sku.col.current'), align: 'right',
      render: (v) => <span className="font-semibold text-sm" style={{ color: colors.darkNavy }}>{v.toFixed(1)}%</span> },
    { key: 'q1', label: t('phase45.forecast.sku.col.q1'), align: 'right',
      render: (v, row) => <DeltaChip base={row.currentMargin} value={v} /> },
    { key: 'q2', label: t('phase45.forecast.sku.col.q2'), align: 'right',
      render: (v, row) => <DeltaChip base={row.currentMargin} value={v} /> },
    { key: 'q3', label: t('phase45.forecast.sku.col.q3'), align: 'right',
      render: (v, row) => <DeltaChip base={row.currentMargin} value={v} /> },
    { key: 'q4', label: t('phase45.forecast.sku.col.q4'), align: 'right',
      render: (v, row) => <DeltaChip base={row.currentMargin} value={v} /> },
    { key: 'trend', label: t('phase45.forecast.sku.col.trend'), align: 'right',
      render: (_, row) => <div className="flex justify-end"><Sparkline row={row} /></div> },
    { key: 'risk', label: t('phase45.forecast.sku.col.risk'), align: 'right',
      render: (v) => <RiskChip risk={v} t={t} /> },
  ];

  const fmtEUR = (v) =>
    v >= 1_000_000 ? `€${(v / 1_000_000).toFixed(1)}M` :
    v >= 1_000     ? `€${(v / 1_000).toFixed(0)}K`     : `€${v}`;

  return (
    <div className="space-y-6">
      {/* Risk KPI strip */}
      <motion.div
        className="grid grid-cols-1 md:grid-cols-3 gap-6"
        initial={{ opacity: 0, y: 10 }}
        whileInView={{ opacity: 1, y: 0 }}
        viewport={{ once: true }}
      >
        <KPICard
          label={t('phase45.forecast.risk.atRiskCount')}
          value={`${riskStats.atRiskCount} / ${rows.length}`}
          change={t('phase45.forecast.risk.atRiskHint')}
          changeType={riskStats.atRiskCount > 0 ? 'negative' : 'positive'}
          confidence="derived"
        />
        <KPICard
          label={t('phase45.forecast.risk.avgConfidence')}
          value={`${(riskStats.avgConfidence * 100).toFixed(0)}%`}
          change={t('phase45.forecast.risk.avgConfidenceHint')}
          changeType="neutral"
          confidence="derived"
        />
        <KPICard
          label={t('phase45.forecast.risk.biggestSwing')}
          value={riskStats.biggestSwing ? `${riskStats.biggestSwing.sku} · ${riskStats.biggestSwing.swingPP >= 0 ? '−' : '+'}${Math.abs(riskStats.biggestSwing.swingPP)} pp` : '—'}
          change={t('phase45.forecast.risk.biggestSwingHint')}
          changeType={riskStats.biggestSwing && riskStats.biggestSwing.swingPP > 0 ? 'negative' : 'positive'}
          confidence="derived"
        />
      </motion.div>

      {/* Aggregated 2025 forecast chart */}
      <ChartCard
        title={t('phase45.forecast.agg.title')}
        subtitle={t('phase45.forecast.agg.subtitle')}
        confidence="derived"
      >
        <ResponsiveContainer width="100%" height={320}>
          <ComposedChart data={aggregated} margin={{ top: 10, right: 30, bottom: 10, left: 10 }}>
            <CartesianGrid stroke="#f1f5f9" vertical={false} />
            <XAxis dataKey="q" tick={{ fontSize: 11, fill: '#64748b' }} />
            <YAxis yAxisId="left" orientation="left" tick={{ fontSize: 11, fill: '#64748b' }} tickFormatter={fmtEUR} />
            <YAxis yAxisId="right" orientation="right" tick={{ fontSize: 11, fill: '#64748b' }} tickFormatter={(v) => `${v}%`} domain={[20, 75]} />
            <Tooltip content={<CustomTooltip />} />
            <Legend wrapperStyle={{ fontSize: 11 }} />
            <Bar yAxisId="left" dataKey="revenue" name={t('phase45.forecast.agg.revenue')} fill="#cbd5e1" radius={[4, 4, 0, 0]} />
            <Area yAxisId="right" dataKey="band" name={t('phase45.forecast.agg.band')} fill="#0393da" fillOpacity={0.12} stroke="none" />
            <Line yAxisId="right" type="monotone" dataKey="margin" name={t('phase45.forecast.agg.margin')} stroke="#0393da" strokeWidth={3} dot={{ r: 4, fill: '#0393da' }} />
            <ReferenceLine yAxisId="right" x="2024-Q4" stroke="#94a3b8" strokeDasharray="4 4" />
          </ComposedChart>
        </ResponsiveContainer>
      </ChartCard>

      {/* Per-SKU table */}
      <div>
        <DataTable
          title={t('phase45.forecast.sku.title')}
          tooltip={t('phase45.forecast.sku.subtitle')}
          columns={columns}
          data={rows}
          rowKey="sku"
          selectedRowId={selectedSku}
          onRowClick={handleRowClick}
          confidence="derived"
        />
        <p className="mt-3 text-[11px] leading-relaxed px-2" style={{ color: '#94a3b8' }}>
          {t('phase45.forecast.methodology')}
        </p>
      </div>

      <SKUDeepDiveSlideOver sku={selectedSku} onClose={() => setSelectedSku(null)} />
    </div>
  );
}
