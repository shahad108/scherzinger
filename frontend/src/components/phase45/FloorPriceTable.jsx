import { useState, useMemo } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { X, Calculator, TrendingUp, TrendingDown, AlertTriangle, Target, DollarSign } from 'lucide-react';
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid, Cell, ReferenceLine, LineChart, Line } from 'recharts';
import { IS_DEMO } from '../../utils/brand';
import { getFloorPrices, getSkuImpactTable, getCompetitive } from '../../utils/mockPhase45';
import DataTable from '../shared/DataTable';
import { useLanguage } from '../../context/LanguageContext';
import { formatEUR } from '../../utils/formatters';
import { colors } from '../../utils/designTokensV2';

// Floor pricing assumptions — same across every SKU. Documented here so the
// detail panel can cite them and the real engine can swap in live values.
const TARGET_MARGIN = 0.279;      // 27.9% — industry floor margin for pumps
const COST_OVERRUN_BUFFER = 0.05; // 5% buffer inside HKvoll for cost noise

// Decomposes a single SKU's full cost into material / labor / overhead /
// depreciation / other components. Uses real shares from skuImpactTable
// when available, falls back to industry averages otherwise.
function decomposeCost(row, impactEntry) {
  const hk = row.hkvoll;
  if (impactEntry) {
    const matShare    = impactEntry.matShare;
    const laborShare  = impactEntry.laborShare;
    const outShare    = impactEntry.outsourcingShare;
    const accountedShare = matShare + laborShare + outShare;
    // Whatever isn't attributed to direct inputs is overhead/depreciation/other.
    const overheadShare = Math.max(0, (1 - accountedShare) * 0.62);
    const depShare      = Math.max(0, (1 - accountedShare) * 0.26);
    const otherShare    = Math.max(0, (1 - accountedShare) * 0.12);
    return [
      { name: 'Material',     value: Math.round(hk * matShare),    color: '#0393da', share: matShare },
      { name: 'Labor',        value: Math.round(hk * laborShare),  color: '#16a34a', share: laborShare },
      { name: 'Outsourcing',  value: Math.round(hk * outShare),    color: '#d97706', share: outShare },
      { name: 'Overhead',     value: Math.round(hk * overheadShare),color: '#64748b', share: overheadShare },
      { name: 'Depreciation', value: Math.round(hk * depShare),    color: '#94a3b8', share: depShare },
      { name: 'Other',        value: Math.round(hk * otherShare),  color: '#cbd5e1', share: otherShare },
    ];
  }
  // Fallback — industry-average split
  return [
    { name: 'Material',     value: Math.round(hk * 0.40), color: '#0393da', share: 0.40 },
    { name: 'Labor',        value: Math.round(hk * 0.26), color: '#16a34a', share: 0.26 },
    { name: 'Outsourcing',  value: Math.round(hk * 0.11), color: '#d97706', share: 0.11 },
    { name: 'Overhead',     value: Math.round(hk * 0.14), color: '#64748b', share: 0.14 },
    { name: 'Depreciation', value: Math.round(hk * 0.06), color: '#94a3b8', share: 0.06 },
    { name: 'Other',        value: Math.round(hk * 0.03), color: '#cbd5e1', share: 0.03 },
  ];
}

function computeFloorSensitivity(row) {
  const base = row.hkvoll;
  // Floor = HKvoll / (1 - target margin)
  const floor = (hk) => Math.round(hk / (1 - TARGET_MARGIN));
  return [
    { scenario: '-10%', hk: Math.round(base * 0.90), floor: floor(base * 0.90) },
    { scenario: '-5%',  hk: Math.round(base * 0.95), floor: floor(base * 0.95) },
    { scenario: 'Base', hk: base,                     floor: floor(base) },
    { scenario: '+5%',  hk: Math.round(base * 1.05), floor: floor(base * 1.05) },
    { scenario: '+10%', hk: Math.round(base * 1.10), floor: floor(base * 1.10) },
    { scenario: '+20%', hk: Math.round(base * 1.20), floor: floor(base * 1.20) },
  ];
}

function recommendation(row) {
  const gapPct = (row.current - row.floor) / row.floor;
  if (gapPct < 0) {
    return {
      tone: 'danger',
      title: 'Price below floor — raise immediately',
      detail: `Current price of ${formatEUR(row.current)} is ${formatEUR(Math.abs(row.gap))} below the floor. Every unit sold erodes contribution. Raise to at least the floor price within the next pricing cycle.`,
    };
  }
  if (gapPct < 0.04) {
    return {
      tone: 'warning',
      title: 'Tight cushion above floor',
      detail: `Only ${(gapPct * 100).toFixed(1)}% headroom above floor. A 5% material cost shock would push this SKU below its floor. Review contract and lock in a price floor with the customer.`,
    };
  }
  if (gapPct < 0.09) {
    return {
      tone: 'ok',
      title: 'Healthy margin — maintain',
      detail: `${(gapPct * 100).toFixed(1)}% headroom above the floor is within the target operating band (5–10%). No action needed unless cost assumptions change.`,
    };
  }
  return {
    tone: 'positive',
    title: 'Premium positioning — watch volume sensitivity',
    detail: `${(gapPct * 100).toFixed(1)}% above floor implies significant pricing power. Verify with win-rate data that we're not leaving volume on the table. Consider a controlled -2% test if win rate < 35%.`,
  };
}

export default function FloorPriceTable() {
  if (!IS_DEMO) return null;
  const { t } = useLanguage();
  const data = getFloorPrices();
  const [selected, setSelected] = useState(null);

  const columns = [
    { key: 'sku',     label: t('phase45.floorPrice.col.sku') },
    { key: 'name',    label: t('phase45.floorPrice.col.name') },
    { key: 'cg',      label: t('phase45.floorPrice.col.cg') },
    { key: 'hkvoll',  label: t('phase45.floorPrice.col.hkvoll'),  render: (val) => formatEUR(val) },
    { key: 'floor',   label: t('phase45.floorPrice.col.floor'),   render: (val) => formatEUR(val) },
    { key: 'current', label: t('phase45.floorPrice.col.current'), render: (val) => formatEUR(val) },
    {
      key: 'gap',
      label: t('phase45.floorPrice.col.gap'),
      render: (val) => (
        <span style={{ color: val >= 0 ? '#16a34a' : '#dc2626', fontWeight: 600 }}>
          {val >= 0 ? '+' : ''}{formatEUR(val)}
        </span>
      ),
    },
  ];

  return (
    <>
      <DataTable
        title={t('phase45.floorPrice.title')}
        columns={columns}
        data={data}
        rowKey="sku"
        onRowClick={(row) => setSelected(row)}
        selectedRowId={selected?.sku}
      />
      <FloorPriceDetailPanel row={selected} onClose={() => setSelected(null)} />
    </>
  );
}

const TONE_COLORS = {
  danger:   { bg: '#fee2e2', color: '#dc2626', icon: AlertTriangle },
  warning:  { bg: '#fef3c7', color: '#d97706', icon: AlertTriangle },
  ok:       { bg: '#e0f2fe', color: '#0393da', icon: Target },
  positive: { bg: '#dcfce7', color: '#16a34a', icon: TrendingUp },
};

function FloorPriceDetailPanel({ row, onClose }) {
  const { t } = useLanguage();
  const impactEntry = useMemo(
    () => (row ? getSkuImpactTable().find((s) => s.sku === row.sku) : null),
    [row]
  );
  const costStack = useMemo(() => (row ? decomposeCost(row, impactEntry) : []), [row, impactEntry]);
  const sensitivity = useMemo(() => (row ? computeFloorSensitivity(row) : []), [row]);
  const compMarket = useMemo(
    () => (row ? getCompetitive().find((c) => c.sku === row.sku) : null),
    [row]
  );

  if (!row) return null;

  const floorMargin   = (row.floor - row.hkvoll) / row.floor;
  const currentMargin = (row.current - row.hkvoll) / row.current;
  const headroomPct   = (row.current - row.floor) / row.floor;
  const rec = recommendation(row);
  const RecIcon = TONE_COLORS[rec.tone].icon;

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="fixed inset-0 bg-black/30 z-40"
        onClick={onClose}
      />
      <motion.div
        initial={{ x: '100%' }}
        animate={{ x: 0 }}
        exit={{ x: '100%' }}
        transition={{ type: 'spring', damping: 30, stiffness: 300 }}
        className="fixed right-0 top-0 h-screen w-[640px] max-w-[94vw] z-50 flex flex-col overflow-hidden"
        style={{ background: colors.surface, boxShadow: '0 0 60px rgba(26,26,46,0.12)' }}
      >
        {/* Header */}
        <div className="flex-shrink-0 px-6 py-5 flex items-start justify-between" style={{ borderBottom: '1px solid #f8fafc' }}>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2">
              <span className="inline-flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-wider px-2.5 py-1 rounded-full" style={{ background: '#eff6ff', color: '#2563eb' }}>
                <Calculator size={11} />
                Floor price breakdown
              </span>
              <span className="font-mono text-xs font-semibold" style={{ color: '#1a1a2e' }}>{row.sku}</span>
              <span className="text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded" style={{ background: '#f1f5f9', color: '#525252' }}>{row.cg}</span>
            </div>
            <h2 className="text-lg font-bold mt-2" style={{ fontFamily: "'Manrope', sans-serif", color: colors.darkNavy }}>
              {row.name}
            </h2>
          </div>
          <button onClick={onClose} className="p-2 rounded-lg hover:bg-[#f8f9fa] transition-colors flex-shrink-0" style={{ color: '#a3a3a3' }}>
            <X size={20} />
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto px-6 py-5 space-y-6">
          {/* KPI strip */}
          <div className="grid grid-cols-4 gap-3">
            <Kpi label="Full cost"    value={formatEUR(row.hkvoll)}  color="#525252" />
            <Kpi label="Floor price"  value={formatEUR(row.floor)}   color="#0393da" emphasis />
            <Kpi label="Current"      value={formatEUR(row.current)} color="#1a1a2e" />
            <Kpi
              label="Headroom"
              value={`${headroomPct >= 0 ? '+' : ''}${(headroomPct * 100).toFixed(1)}%`}
              color={headroomPct < 0 ? '#dc2626' : headroomPct < 0.04 ? '#d97706' : '#16a34a'}
            />
          </div>

          {/* Formula explanation */}
          <div
            className="rounded-xl p-5"
            style={{ background: 'linear-gradient(135deg, #f0f9ff 0%, #ffffff 100%)', border: '1px solid #e0f2fe' }}
          >
            <div className="flex items-center gap-2 mb-3">
              <DollarSign size={14} style={{ color: '#0393da' }} />
              <span className="text-[10px] font-bold uppercase tracking-wider" style={{ color: '#0393da' }}>How the floor is calculated</span>
            </div>
            <div className="font-mono text-sm space-y-1" style={{ color: '#1a1a2e' }}>
              <div>
                <span style={{ color: '#737373' }}>Floor</span> = HKvoll / (1 − target margin)
              </div>
              <div>
                <span style={{ color: '#737373' }}>    </span>= {formatEUR(row.hkvoll)} / (1 − {(TARGET_MARGIN * 100).toFixed(1)}%)
              </div>
              <div className="font-bold" style={{ color: '#0393da' }}>
                <span style={{ color: '#737373', fontWeight: 400 }}>    </span>= {formatEUR(row.floor)}
              </div>
            </div>
            <p className="text-xs mt-3 leading-relaxed" style={{ color: '#525252' }}>
              The target margin of {(TARGET_MARGIN * 100).toFixed(1)}% is the minimum DB2 contribution that keeps the SKU profitable after absorbing variable overhead, depreciation, and a {(COST_OVERRUN_BUFFER * 100).toFixed(0)}% cost-overrun buffer. Below this price the SKU loses its share of fixed-cost coverage.
            </p>
          </div>

          {/* Cost component breakdown */}
          <div>
            <SectionLabel label={`Full cost breakdown — ${formatEUR(row.hkvoll)}`} />
            <div className="mt-3 rounded-xl p-4" style={{ background: '#f8fafc' }}>
              <ResponsiveContainer width="100%" height={200}>
                <BarChart data={costStack} layout="vertical" margin={{ left: 10, right: 30 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" horizontal={false} />
                  <XAxis type="number" tickFormatter={(v) => `€${v}`} tick={{ fontSize: 10, fill: '#94a3b8' }} />
                  <YAxis type="category" dataKey="name" width={100} tick={{ fontSize: 11, fill: '#525252' }} axisLine={false} tickLine={false} />
                  <Tooltip formatter={(v) => formatEUR(v)} contentStyle={{ fontSize: 11, borderRadius: 8 }} />
                  <Bar dataKey="value" radius={[0, 4, 4, 0]}>
                    {costStack.map((c, i) => (
                      <Cell key={i} fill={c.color} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
              <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1">
                {costStack.map((c) => (
                  <span key={c.name} className="inline-flex items-center gap-1.5 text-[10px]" style={{ color: '#525252' }}>
                    <span className="inline-block size-2 rounded-full" style={{ background: c.color }} />
                    {c.name} {(c.share * 100).toFixed(0)}%
                  </span>
                ))}
              </div>
            </div>
          </div>

          {/* Margin comparison: floor vs current */}
          <div>
            <SectionLabel label="Margin comparison" />
            <div className="mt-3 grid grid-cols-2 gap-3">
              <MarginCard
                label="Margin at floor"
                pct={floorMargin}
                sub="Minimum viable (target)"
                color="#0393da"
              />
              <MarginCard
                label="Margin at current price"
                pct={currentMargin}
                sub={headroomPct >= 0 ? 'Above floor — profitable' : 'Below floor — loss'}
                color={headroomPct >= 0 ? '#16a34a' : '#dc2626'}
              />
            </div>
          </div>

          {/* Cost sensitivity */}
          <div>
            <SectionLabel label="Floor under cost shock" />
            <div className="mt-3 rounded-xl p-4" style={{ background: '#f8fafc' }}>
              <ResponsiveContainer width="100%" height={180}>
                <LineChart data={sensitivity}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                  <XAxis dataKey="scenario" tick={{ fontSize: 10, fill: '#94a3b8' }} axisLine={false} tickLine={false} />
                  <YAxis tickFormatter={(v) => `€${(v / 1000).toFixed(1)}k`} tick={{ fontSize: 10, fill: '#94a3b8' }} axisLine={false} tickLine={false} />
                  <Tooltip formatter={(v) => formatEUR(v)} contentStyle={{ fontSize: 11, borderRadius: 8 }} />
                  <ReferenceLine y={row.current} stroke="#16a34a" strokeDasharray="4 4" label={{ value: 'Current', fill: '#16a34a', fontSize: 10 }} />
                  <Line type="monotone" dataKey="floor" stroke="#0393da" strokeWidth={2.5} dot={{ r: 4, fill: '#0393da' }} name="Floor price" />
                </LineChart>
              </ResponsiveContainer>
              <p className="text-[10px] mt-2" style={{ color: '#94a3b8' }}>
                Shows how the floor price moves as full cost drifts ±10% around today's baseline. Green dashed line = current price.
              </p>
            </div>
          </div>

          {/* Market context */}
          {compMarket && (
            <div>
              <SectionLabel label="Market context" />
              <div className="mt-3 grid grid-cols-3 gap-3">
                <ContextTile label="Market low"  value={formatEUR(compMarket.marketLow)}  color="#94a3b8" />
                <ContextTile label="Our price"   value={formatEUR(compMarket.our)}        color="#0393da" emphasis />
                <ContextTile label="Market high" value={formatEUR(compMarket.marketHigh)} color="#94a3b8" />
              </div>
              <p className="text-[11px] mt-2" style={{ color: '#525252' }}>
                Inferred from PA-coded loss quotes — we sit in the {compMarket.position} segment of the observable market band.
              </p>
            </div>
          )}

          {/* Recommendation */}
          <div
            className="rounded-xl p-4 flex items-start gap-3"
            style={{ background: TONE_COLORS[rec.tone].bg, border: `1px solid ${TONE_COLORS[rec.tone].color}22` }}
          >
            <div
              className="size-9 rounded-lg flex items-center justify-center flex-shrink-0"
              style={{ background: '#ffffff', color: TONE_COLORS[rec.tone].color }}
            >
              <RecIcon size={16} />
            </div>
            <div className="flex-1">
              <p className="text-[10px] font-bold uppercase tracking-wider" style={{ color: TONE_COLORS[rec.tone].color }}>
                Recommendation
              </p>
              <p className="text-sm font-semibold mt-1" style={{ color: '#1a1a2e' }}>{rec.title}</p>
              <p className="text-xs mt-1 leading-relaxed" style={{ color: '#525252' }}>{rec.detail}</p>
            </div>
          </div>
        </div>
      </motion.div>
    </AnimatePresence>
  );
}

function Kpi({ label, value, color, emphasis }) {
  return (
    <div className="rounded-xl p-3" style={{ background: '#f8fafc', border: emphasis ? '1px solid #bae6fd' : '1px solid transparent' }}>
      <p className="text-[9px] font-bold uppercase tracking-wider" style={{ color: '#94a3b8' }}>{label}</p>
      <p className="text-sm font-bold tabular-nums mt-1" style={{ color, fontFamily: "'Manrope', sans-serif" }}>{value}</p>
    </div>
  );
}

function SectionLabel({ label }) {
  return (
    <div className="flex items-center gap-2">
      <span className="text-[10px] font-bold uppercase tracking-wider" style={{ color: '#525252' }}>{label}</span>
    </div>
  );
}

function MarginCard({ label, pct, sub, color }) {
  return (
    <div className="rounded-xl p-4" style={{ background: '#f8fafc' }}>
      <p className="text-[10px] font-bold uppercase tracking-wider" style={{ color: '#94a3b8' }}>{label}</p>
      <p className="text-2xl font-bold tabular-nums mt-1" style={{ color, fontFamily: "'Manrope', sans-serif" }}>
        {(pct * 100).toFixed(1)}%
      </p>
      <p className="text-[10px] mt-1" style={{ color: '#94a3b8' }}>{sub}</p>
    </div>
  );
}

function ContextTile({ label, value, color, emphasis }) {
  return (
    <div
      className="rounded-xl p-3 text-center"
      style={{
        background: emphasis ? '#eff6ff' : '#f8fafc',
        border: emphasis ? '1px solid #bae6fd' : '1px solid transparent',
      }}
    >
      <p className="text-[9px] font-bold uppercase tracking-wider" style={{ color: '#94a3b8' }}>{label}</p>
      <p className="text-sm font-bold tabular-nums mt-1" style={{ color, fontFamily: "'Manrope', sans-serif" }}>{value}</p>
    </div>
  );
}
