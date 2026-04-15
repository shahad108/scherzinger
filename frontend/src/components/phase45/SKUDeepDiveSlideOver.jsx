import { useState, useMemo } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { X } from 'lucide-react';
import {
  LineChart, Line, ResponsiveContainer, XAxis, YAxis, Tooltip, CartesianGrid,
  BarChart, Bar, ReferenceLine, ScatterChart, Scatter, Cell, ZAxis,
} from 'recharts';
import { IS_DEMO } from '../../utils/brand';
import {
  findSKUDetail, getFloorPrices, getProfitability, getSkuImpactTable,
} from '../../utils/mockPhase45';
import { useLanguage } from '../../context/LanguageContext';
import { formatEUR } from '../../utils/formatters';
import { colors } from '../../utils/designTokensV2';

const tabs = ['pricing', 'breakEven', 'profitability', 'shock', 'anomalies', 'crossSell'];

const QUADRANT_COLOR = {
  star:         '#16a34a',
  cashcow:      '#0393da',
  questionmark: '#d97706',
  dog:          '#dc2626',
};

// Synthesize a break-even curve for any SKU. Uses the clicked SKU's full
// cost + current price if we have it in mock data, otherwise falls back to
// PS-1104's numbers so the panel always shows something plausible.
function buildBreakEven(sku) {
  const floor = getFloorPrices().find((f) => f.sku === sku);
  const base = floor || getFloorPrices()[0];
  if (!base) return null;

  const unitPrice    = base.current;
  const unitVarCost  = Math.round(base.hkvoll * 0.62);          // ~62% variable
  const fixedCost    = Math.round(base.hkvoll * 0.38 * 48);     // ~38% × typical volume
  const breakEvenUnits = Math.ceil(fixedCost / (unitPrice - unitVarCost));
  const maxUnits = Math.max(100, breakEvenUnits * 2);

  const curve = [];
  for (let u = 0; u <= maxUnits; u += Math.max(5, Math.round(maxUnits / 12))) {
    curve.push({
      units: u,
      revenue: u * unitPrice,
      cost:    fixedCost + u * unitVarCost,
    });
  }
  return {
    sku: base.sku,
    name: base.name,
    unitPrice,
    unitVarCost,
    fixedCost,
    breakEvenUnits,
    breakEvenRevenue: breakEvenUnits * unitPrice,
    curve,
  };
}

// Build a profitability dataset that always includes the clicked SKU as
// a highlighted dot, even if it wasn't in the canned 8-SKU quadrant data.
function buildProfitability(sku) {
  const base = getProfitability();
  const hasSku = base.some((p) => p.sku === sku);
  if (hasSku) {
    return { points: base, highlightSku: sku };
  }
  // Synthesize a dot for the clicked SKU from its floor + optimizer data.
  const floor = getFloorPrices().find((f) => f.sku === sku);
  if (!floor) {
    return { points: base, highlightSku: base[0]?.sku };
  }
  const margin = (floor.current - floor.hkvoll) / floor.current;
  const revenue = floor.current * 520;                 // plausible annual volume
  return {
    points: [...base, { sku: floor.sku, revenue, margin, quadrant: 'questionmark' }],
    highlightSku: floor.sku,
  };
}

function quadrantForPoint(p, medianRev, medianMargin) {
  if (p.revenue >= medianRev && p.margin >= medianMargin) return 'star';
  if (p.revenue >= medianRev && p.margin <  medianMargin) return 'cashcow';
  if (p.revenue <  medianRev && p.margin >= medianMargin) return 'questionmark';
  return 'dog';
}

export default function SKUDeepDiveSlideOver({ sku, onClose }) {
  if (!IS_DEMO || !sku) return null;
  const { t } = useLanguage();
  const [tab, setTab] = useState('pricing');

  const rawDetail = findSKUDetail(sku);
  const hasData = rawDetail && (rawDetail.floorPrice || rawDetail.optimizer || rawDetail.breakEven);
  const effectiveSku = hasData ? sku : 'PS-1104';
  const detail = hasData ? rawDetail : findSKUDetail('PS-1104');

  const breakEven = useMemo(() => buildBreakEven(effectiveSku), [effectiveSku]);
  const prof = useMemo(() => buildProfitability(effectiveSku), [effectiveSku]);

  if (!detail) return null;

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
        className="fixed right-0 top-0 h-screen w-[640px] max-w-[90vw] z-50 flex flex-col overflow-hidden"
        style={{ background: colors.surface, boxShadow: '0 0 60px rgba(26,26,46,0.12)' }}
      >
        {/* Header */}
        <div className="flex-shrink-0 px-6 py-5 flex items-start justify-between" style={{ borderBottom: '1px solid #f8fafc' }}>
          <div>
            <span className="px-2.5 py-1 rounded text-[10px] font-bold uppercase tracking-wider" style={{ background: '#eff6ff', color: '#2563eb' }}>
              {t('phase45.skuDeepDive.title')}
            </span>
            <h2 className="text-lg font-bold mt-2" style={{ fontFamily: "'Manrope', sans-serif", color: colors.darkNavy }}>
              {detail.floorPrice?.name || effectiveSku}
            </h2>
            <p className="text-xs mt-1" style={{ color: '#737373' }}>{effectiveSku}</p>
          </div>
          <button onClick={onClose} className="p-2 rounded-lg hover:bg-[#f8f9fa] transition-colors" style={{ color: '#a3a3a3' }}>
            <X size={20} />
          </button>
        </div>

        {/* Tabs */}
        <div className="flex-shrink-0 px-6 pt-4 flex items-center gap-1 overflow-x-auto" style={{ borderBottom: '1px solid #f8fafc' }}>
          {tabs.map((k) => (
            <button
              key={k}
              onClick={() => setTab(k)}
              className="px-3 py-2 text-xs font-semibold uppercase tracking-wider transition-colors whitespace-nowrap"
              style={{
                color: tab === k ? '#0393da' : '#737373',
                borderBottom: tab === k ? '2px solid #0393da' : '2px solid transparent',
              }}
            >
              {t(`phase45.skuDeepDive.tab.${k}`)}
            </button>
          ))}
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto px-6 py-5">
          {tab === 'pricing' && (
            <div className="space-y-4">
              {detail.optimizer ? (
                <>
                  <MetricRow label="Current" value={formatEUR(detail.optimizer.current)} />
                  <MetricRow label="Suggested" value={formatEUR(detail.optimizer.suggested)} emphasis />
                  <MetricRow label="Range" value={`${formatEUR(detail.optimizer.min)} – ${formatEUR(detail.optimizer.max)}`} />
                  <MetricRow label="Expected margin" value={`${(detail.optimizer.expectedMargin * 100).toFixed(1)}%`} />
                </>
              ) : <p className="text-sm text-slate-500">No optimizer data for this SKU.</p>}
              {detail.floorPrice && (
                <>
                  <div className="h-px bg-slate-100 my-3" />
                  <MetricRow label="Floor price" value={formatEUR(detail.floorPrice.floor)} />
                  <MetricRow label="Full cost"   value={formatEUR(detail.floorPrice.hkvoll)} />
                </>
              )}
            </div>
          )}

          {tab === 'breakEven' && breakEven && (
            <div className="space-y-4">
              <div className="grid grid-cols-3 gap-3">
                <KpiTile label="Break-even units" value={`${breakEven.breakEvenUnits}`} color="#0393da" emphasis />
                <KpiTile label="Fixed cost"       value={formatEUR(breakEven.fixedCost)} color="#525252" />
                <KpiTile label="Unit contribution" value={formatEUR(breakEven.unitPrice - breakEven.unitVarCost)} color="#16a34a" />
              </div>
              <div className="rounded-xl p-4" style={{ background: '#f8fafc' }}>
                <p className="text-[10px] font-bold uppercase tracking-wider mb-2" style={{ color: '#525252' }}>
                  Cost-volume-profit curve
                </p>
                <ResponsiveContainer width="100%" height={240}>
                  <LineChart data={breakEven.curve}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                    <XAxis dataKey="units" tick={{ fontSize: 10, fill: '#94a3b8' }} label={{ value: 'Units', position: 'insideBottom', offset: -4, fill: '#94a3b8', fontSize: 10 }} />
                    <YAxis tickFormatter={(v) => `€${(v / 1000).toFixed(0)}k`} tick={{ fontSize: 10, fill: '#94a3b8' }} />
                    <Tooltip formatter={(v) => formatEUR(v)} contentStyle={{ fontSize: 11, borderRadius: 8 }} />
                    <ReferenceLine
                      x={breakEven.breakEvenUnits}
                      stroke="#16a34a"
                      strokeDasharray="4 4"
                      label={{ value: `Break-even @ ${breakEven.breakEvenUnits}u`, fill: '#16a34a', fontSize: 10 }}
                    />
                    <Line type="monotone" dataKey="revenue" stroke="#0393da" strokeWidth={2.5} dot={false} name="Revenue" />
                    <Line type="monotone" dataKey="cost"    stroke="#dc2626" strokeWidth={2}   dot={false} name="Total cost" />
                  </LineChart>
                </ResponsiveContainer>
              </div>
              <div className="rounded-xl p-4" style={{ background: 'linear-gradient(135deg, #f0f9ff 0%, #ffffff 100%)', border: '1px solid #e0f2fe' }}>
                <p className="text-[10px] font-bold uppercase tracking-wider" style={{ color: '#0393da' }}>How it's calculated</p>
                <p className="font-mono text-xs mt-2" style={{ color: '#1a1a2e' }}>
                  Break-even = Fixed cost / (Price − Variable cost)
                </p>
                <p className="font-mono text-xs" style={{ color: '#1a1a2e' }}>
                  &nbsp;&nbsp;&nbsp;&nbsp; = {formatEUR(breakEven.fixedCost)} / ({formatEUR(breakEven.unitPrice)} − {formatEUR(breakEven.unitVarCost)})
                </p>
                <p className="font-mono text-xs font-bold" style={{ color: '#0393da' }}>
                  &nbsp;&nbsp;&nbsp;&nbsp; = {breakEven.breakEvenUnits} units
                </p>
                <p className="text-xs mt-2 leading-relaxed" style={{ color: '#525252' }}>
                  Fixed cost assumes ~38% of full cost times typical annual volume. Variable cost is ~62% of full cost per unit. Below this volume the SKU loses money; above it, each additional unit contributes {formatEUR(breakEven.unitPrice - breakEven.unitVarCost)} to overhead.
                </p>
              </div>
            </div>
          )}

          {tab === 'profitability' && (
            <ProfitabilityTab data={prof} />
          )}

          {tab === 'shock' && (
            <ResponsiveContainer width="100%" height={240}>
              <BarChart data={[
                { name: 'Material',    delta: -2.1 },
                { name: 'Labor',       delta: -1.4 },
                { name: 'Outsourcing', delta: -0.9 },
                { name: 'Volume',      delta:  1.8 },
              ]}>
                <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                <XAxis dataKey="name" tick={{ fontSize: 11, fill: '#737373' }} />
                <YAxis tickFormatter={(v) => `${v}pp`} tick={{ fontSize: 11, fill: '#737373' }} />
                <Tooltip formatter={(v) => `${v}pp`} />
                <Bar dataKey="delta" fill="#0393da" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          )}

          {tab === 'anomalies' && (
            detail.anomalies && detail.anomalies.length ? (
              <ul className="space-y-3">
                {detail.anomalies.map((a) => (
                  <li key={a.id} className="p-3 rounded-lg" style={{ background: '#f8f9fa' }}>
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-bold uppercase" style={{ color: a.severity === 'high' ? '#dc2626' : a.severity === 'medium' ? '#d97706' : '#737373' }}>
                        {a.severity}
                      </span>
                      <span className="text-xs font-mono" style={{ color: '#737373' }}>z={a.zscore}</span>
                    </div>
                    <p className="text-sm mt-1">{a.metric}: {a.note}</p>
                  </li>
                ))}
              </ul>
            ) : <p className="text-sm text-slate-500">No anomalies detected.</p>
          )}

          {tab === 'crossSell' && (
            detail.crossSell && detail.crossSell.length ? (
              <ul className="space-y-3">
                {detail.crossSell.map((r) => (
                  <li key={r.customer} className="p-3 rounded-lg" style={{ background: '#f8f9fa' }}>
                    <div className="flex items-center justify-between">
                      <span className="text-sm font-semibold">{r.customer}</span>
                      <span className="text-xs font-bold" style={{ color: '#0393da' }}>{(r.confidence * 100).toFixed(0)}%</span>
                    </div>
                    <p className="text-xs mt-1" style={{ color: '#737373' }}>{r.reason}</p>
                  </li>
                ))}
              </ul>
            ) : <p className="text-sm text-slate-500">No cross-sell candidates.</p>
          )}
        </div>
      </motion.div>
    </AnimatePresence>
  );
}

function ProfitabilityTab({ data }) {
  const { points, highlightSku } = data;
  const median = useMemo(() => {
    if (!points.length) return { revenue: 0, margin: 0 };
    const revs = points.map((p) => p.revenue).sort((a, b) => a - b);
    return { revenue: revs[Math.floor(revs.length / 2)], margin: 0.62 };
  }, [points]);

  const me = points.find((p) => p.sku === highlightSku);
  const myQuadrant = me ? quadrantForPoint(me, median.revenue, median.margin) : null;

  const quadLabels = {
    star:         { title: 'Star',          sub: 'High revenue, high margin' },
    cashcow:      { title: 'Cash cow',      sub: 'High revenue, lower margin' },
    questionmark: { title: 'Question mark', sub: 'Lower revenue, high margin' },
    dog:          { title: 'Dog',           sub: 'Lower revenue, lower margin' },
  };

  return (
    <div className="space-y-4">
      {me && (
        <div className="grid grid-cols-3 gap-3">
          <KpiTile label="Revenue" value={`€${(me.revenue / 1e6).toFixed(2)}M`} color="#0393da" />
          <KpiTile label="DB2 margin" value={`${(me.margin * 100).toFixed(1)}%`} color="#16a34a" />
          <KpiTile
            label="Quadrant"
            value={quadLabels[myQuadrant]?.title || '—'}
            color={QUADRANT_COLOR[myQuadrant] || '#737373'}
            emphasis
          />
        </div>
      )}
      <div className="rounded-xl p-4" style={{ background: '#f8fafc' }}>
        <p className="text-[10px] font-bold uppercase tracking-wider mb-2" style={{ color: '#525252' }}>
          Revenue vs DB2 margin — this SKU highlighted
        </p>
        <ResponsiveContainer width="100%" height={260}>
          <ScatterChart margin={{ top: 10, right: 24, bottom: 24, left: 24 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
            <XAxis
              dataKey="revenue"
              type="number"
              tickFormatter={(v) => `€${(v / 1e6).toFixed(1)}M`}
              tick={{ fontSize: 10, fill: '#94a3b8' }}
              label={{ value: 'Annual revenue', position: 'insideBottom', offset: -6, fill: '#94a3b8', fontSize: 10 }}
            />
            <YAxis
              dataKey="margin"
              type="number"
              domain={[0.3, 0.8]}
              tickFormatter={(v) => `${Math.round(v * 100)}%`}
              tick={{ fontSize: 10, fill: '#94a3b8' }}
              label={{ value: 'DB2 margin', angle: -90, position: 'insideLeft', fill: '#94a3b8', fontSize: 10 }}
            />
            <ZAxis range={[80, 80]} />
            <Tooltip
              formatter={(v, name) => name === 'margin' ? `${(v * 100).toFixed(1)}%` : `€${Number(v).toLocaleString()}`}
              contentStyle={{ fontSize: 11, borderRadius: 8 }}
              cursor={{ strokeDasharray: '3 3' }}
            />
            <ReferenceLine x={median.revenue} stroke="#cbd5e1" strokeDasharray="4 4" />
            <ReferenceLine y={median.margin} stroke="#cbd5e1" strokeDasharray="4 4" />
            <Scatter data={points}>
              {points.map((p, i) => {
                const q = quadrantForPoint(p, median.revenue, median.margin);
                const isMe = p.sku === highlightSku;
                return (
                  <Cell
                    key={i}
                    fill={QUADRANT_COLOR[q]}
                    fillOpacity={isMe ? 1 : 0.35}
                    stroke={isMe ? '#1a1a2e' : 'transparent'}
                    strokeWidth={isMe ? 2 : 0}
                  />
                );
              })}
            </Scatter>
          </ScatterChart>
        </ResponsiveContainer>
        <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1">
          {Object.entries(QUADRANT_COLOR).map(([k, color]) => (
            <span key={k} className="inline-flex items-center gap-1.5 text-[10px]" style={{ color: '#525252' }}>
              <span className="inline-block size-2 rounded-full" style={{ background: color }} />
              {quadLabels[k].title}
            </span>
          ))}
        </div>
      </div>
      {me && myQuadrant && (
        <div className="rounded-xl p-4" style={{ background: 'linear-gradient(135deg, #f0f9ff 0%, #ffffff 100%)', border: '1px solid #e0f2fe' }}>
          <p className="text-[10px] font-bold uppercase tracking-wider" style={{ color: '#0393da' }}>
            Quadrant interpretation
          </p>
          <p className="text-sm font-semibold mt-1" style={{ color: '#1a1a2e' }}>
            {quadLabels[myQuadrant].title} — {quadLabels[myQuadrant].sub}
          </p>
          <p className="text-xs mt-2 leading-relaxed" style={{ color: '#525252' }}>
            {myQuadrant === 'star' && 'High revenue, high margin. Protect volume, defend pricing, monitor competitive threats.'}
            {myQuadrant === 'cashcow' && 'High revenue, lower margin. Milk for cash flow, avoid overinvesting. Test price increases in safe segments.'}
            {myQuadrant === 'questionmark' && 'Strong margin but modest revenue. Evaluate whether marketing or cross-sell can grow the revenue footprint without diluting margin.'}
            {myQuadrant === 'dog' && 'Below median on both axes. Candidate for price increase, cost engineering, or discontinuation if volumes do not justify the fixed-cost absorption.'}
          </p>
        </div>
      )}
    </div>
  );
}

function MetricRow({ label, value, emphasis }) {
  return (
    <div className="flex items-center justify-between py-2">
      <span className="text-xs uppercase tracking-wider" style={{ color: '#737373' }}>{label}</span>
      <span className="text-sm tabular-nums" style={{ color: emphasis ? '#0393da' : '#1a1a2e', fontWeight: emphasis ? 700 : 500 }}>{value}</span>
    </div>
  );
}

function KpiTile({ label, value, color, emphasis }) {
  return (
    <div className="rounded-xl p-3" style={{ background: '#f8fafc', border: emphasis ? '1px solid #bae6fd' : '1px solid transparent' }}>
      <p className="text-[9px] font-bold uppercase tracking-wider" style={{ color: '#94a3b8' }}>{label}</p>
      <p className="text-sm font-bold tabular-nums mt-1" style={{ color, fontFamily: "'Manrope', sans-serif" }}>{value}</p>
    </div>
  );
}
