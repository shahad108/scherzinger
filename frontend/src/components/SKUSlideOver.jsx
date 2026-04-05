import React, { useMemo, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import {
  AreaChart, Area, BarChart, Bar, Cell,
  ResponsiveContainer, XAxis, YAxis, Tooltip, CartesianGrid, ReferenceLine,
} from 'recharts';
import { X, TrendingUp, TrendingDown, Minus, Package, DollarSign, Users, AlertTriangle, ShieldCheck, BarChart2, Activity, Search, Cpu } from 'lucide-react';
import { useUI } from '../context/UIContext';
import { getSKUDetail } from '../utils/skuDetailEngine';
import { computeRiskScore, computePriority, getApprovalLevel, getMarginTrajectory, productsByArticle, costTrendsByArticle } from '../utils/pricingEngine';
import { formatEUR, formatPct } from '../utils/formatters';
import { slideOverVariants, backdropVariants, slideOverSectionVariants, slideOverItemVariants } from '../utils/animations';
import KPICard from './shared/KPICard';
import { gradients, colors } from '../utils/designTokensV2';
import { track } from '../utils/tracker';

const MARGIN_FLOOR = 0.50;
const MARGIN_TARGET = 0.55;

/* ── Margin Bar (reused) ── */
function MarginBar({ current }) {
  const pct = Math.min(current / 1.0, 1) * 100;
  const floorPct = (MARGIN_FLOOR / 1.0) * 100;
  const targetPct = (MARGIN_TARGET / 1.0) * 100;
  const color = current < MARGIN_FLOOR ? 'bg-red-400' : current < MARGIN_TARGET ? 'bg-amber-400' : 'bg-green-400';
  return (
    <div className="relative w-full h-4 bg-slate-100 rounded-full overflow-hidden">
      <div className={`absolute left-0 top-0 h-full rounded-full ${color}`} style={{ width: `${pct}%` }} />
      <div className="absolute top-0 h-full border-l-2 border-dashed border-slate-400" style={{ left: `${floorPct}%` }} />
      <div className="absolute top-0 h-full border-l-2 border-dashed border-green-600" style={{ left: `${targetPct}%` }} />
      <span className="absolute inset-0 flex items-center justify-center text-[9px] font-bold">{(current * 100).toFixed(1)}%</span>
    </div>
  );
}

/* ── Price Comparison Infographic ── */
function PriceComparisonBar({ current, recommended }) {
  if (!current || !recommended) return null;
  const max = Math.max(current, recommended) * 1.1;
  const currentPct = (current / max) * 100;
  const recPct = (recommended / max) * 100;
  return (
    <div className="space-y-1">
      <div className="flex items-center gap-2">
        <span className="text-[10px] text-slate-400 w-20">Current</span>
        <div className="flex-1 h-5 bg-slate-100 rounded-full overflow-hidden relative">
          <div className="absolute left-0 top-0 h-full rounded-full bg-red-300" style={{ width: `${currentPct}%` }} />
          <span className="absolute inset-0 flex items-center px-2 text-[9px] font-bold">{formatEUR(current)}</span>
        </div>
      </div>
      <div className="flex items-center gap-2">
        <span className="text-[10px] text-green-600 font-bold w-20">Target</span>
        <div className="flex-1 h-5 bg-slate-100 rounded-full overflow-hidden relative">
          <div className="absolute left-0 top-0 h-full rounded-full bg-green-300" style={{ width: `${recPct}%` }} />
          <span className="absolute inset-0 flex items-center px-2 text-[9px] font-bold">{formatEUR(recommended)}</span>
        </div>
      </div>
    </div>
  );
}

/* ── Risk Score Badge ── */
function RiskScoreBadge({ score }) {
  const bg = score >= 70 ? 'bg-red-100' : score >= 50 ? 'bg-amber-100' : score >= 30 ? 'bg-yellow-50' : 'bg-green-50';
  const text = score >= 70 ? 'text-red-700' : score >= 50 ? 'text-amber-700' : score >= 30 ? 'text-yellow-700' : 'text-green-700';
  const ring = score >= 70 ? 'ring-red-200' : score >= 50 ? 'ring-amber-200' : score >= 30 ? 'ring-yellow-200' : 'ring-green-200';
  return (
    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold ring-1 ${bg} ${text} ${ring}`}>
      <Activity size={9} /> Risk {score}
    </span>
  );
}

/* ── Priority Badge ── */
function PriorityBadge({ priority }) {
  const styles = {
    Critical: 'bg-red-100 text-red-700 ring-red-200',
    High: 'bg-amber-100 text-amber-700 ring-amber-200',
    Medium: 'bg-yellow-50 text-yellow-700 ring-yellow-200',
    Low: 'bg-green-50 text-green-700 ring-green-200',
  };
  return (
    <span className={`inline-flex px-2 py-0.5 rounded-full text-[10px] font-bold ring-1 ${styles[priority] || styles.Low}`}>
      {priority}
    </span>
  );
}

/* ── Pricing Action Badge ── */
function PricingActionBadge({ action }) {
  if (action === 'Increase') {
    return <span className="inline-flex px-2 py-0.5 rounded-full text-[10px] font-bold bg-red-100 text-red-700 ring-1 ring-red-200">Increase</span>;
  }
  if (action === 'Monitor') {
    return <span className="inline-flex px-2 py-0.5 rounded-full text-[10px] font-bold bg-amber-100 text-amber-700 ring-1 ring-amber-200">Monitor</span>;
  }
  return <span className="inline-flex px-2 py-0.5 rounded-full text-[10px] font-bold bg-green-100 text-green-700 ring-1 ring-green-200">OK</span>;
}

export default function SKUSlideOver() {
  const { slideOver, closeSlideOver, setSidebarCollapsed } = useUI();

  const isOpen = slideOver.type === 'sku';
  const skuCode = slideOver.id;

  const detail = useMemo(() => {
    if (!isOpen || !skuCode) return null;
    return getSKUDetail(skuCode);
  }, [isOpen, skuCode]);

  // Compute enriched pricing recommendation for this article
  const enrichedRec = useMemo(() => {
    if (!isOpen || !skuCode) return null;
    const product = productsByArticle[skuCode];
    if (!product) return null;

    const costTrend = costTrendsByArticle[skuCode];
    const riskScore = computeRiskScore(product, costTrend);
    const latestMargin = product.margin_2025 ?? product.margin_2024 ?? null;
    const marginGapPct = latestMargin != null ? Math.max(0, (MARGIN_TARGET - latestMargin) * 100) : 0;
    const approval = getApprovalLevel(marginGapPct);
    const priority = computePriority(riskScore);
    const trajectory = getMarginTrajectory(product);

    // Determine pricing action
    let action = 'OK';
    if (latestMargin != null && latestMargin < MARGIN_FLOOR) action = 'Increase';
    else if (latestMargin != null && latestMargin < MARGIN_TARGET) action = 'Monitor';
    else if (product.margin_trend === 'declining' && riskScore >= 40) action = 'Monitor';

    // Determine trajectory direction
    let trajectoryDirection = 'stable';
    if (trajectory.length >= 2) {
      const first = trajectory[0].margin;
      const last = trajectory[trajectory.length - 1].margin;
      if (last > first + 0.02) trajectoryDirection = 'improving';
      else if (last < first - 0.02) trajectoryDirection = 'declining';
    }

    return {
      riskScore,
      priority,
      action,
      currentMargin: latestMargin,
      marginGapPct,
      approvalLevel: approval.level,
      approvalColor: approval.color,
      trajectoryDirection,
      trajectory,
    };
  }, [isOpen, skuCode]);

  // Auto-collapse sidebar when slide-over opens + track drilldown
  useEffect(() => {
    if (isOpen) {
      setSidebarCollapsed(true);
      if (skuCode) track.skuDrilldown(skuCode);
    }
  }, [isOpen, setSidebarCollapsed, skuCode]);

  // Close on Escape
  useEffect(() => {
    if (!isOpen) return;
    const handler = (e) => { if (e.key === 'Escape') closeSlideOver(); };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [isOpen, closeSlideOver]);

  const TrendIcon = isOpen && detail ? (detail.marginTrend === 'improving' ? TrendingUp : detail.marginTrend === 'declining' ? TrendingDown : Minus) : Minus;
  const trendColor = isOpen && detail ? (detail.marginTrend === 'improving' ? 'text-green-600' : detail.marginTrend === 'declining' ? 'text-red-600' : 'text-slate-500') : 'text-slate-500';

  return (
    <AnimatePresence>
      {isOpen && detail && (
        <>
          {/* Backdrop */}
          <motion.div
            variants={backdropVariants}
            initial="hidden"
            animate="visible"
            exit="exit"
            className="fixed inset-0 bg-black/30 z-40"
            onClick={closeSlideOver}
          />

          {/* Panel */}
          <motion.div
            variants={slideOverVariants}
            initial="hidden"
            animate="visible"
            exit="exit"
            className="fixed right-0 top-0 h-screen w-[680px] max-w-[90vw] shadow-2xl z-50 flex flex-col overflow-hidden"
            style={{ background: '#ffffff' }}
          >
        {/* ── Header ── */}
        <div className="flex-shrink-0 px-6 py-4" style={{ background: '#ffffff', borderBottom: '1px solid #f8fafc' }}>
          <div className="flex items-start justify-between">
            <div className="flex-1">
              <div className="flex items-center gap-2 flex-wrap">
                <span className="font-mono text-sm text-slate-500 bg-slate-100 px-2 py-0.5 rounded">{detail.article_id}</span>
                <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-[#c1e8ff] text-[#004b72]">{detail.commodity_group}</span>
                {detail.isAtRisk && (
                  <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-red-50 text-red-600 flex items-center gap-1">
                    <AlertTriangle size={10} /> AT RISK
                  </span>
                )}
                {detail.isBelowFloor && (
                  <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-red-100 text-red-700">BELOW FLOOR</span>
                )}
                {detail.bcgQuadrant && (
                  <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-purple-50 text-purple-600">BCG: {detail.bcgQuadrant}</span>
                )}
                {/* Risk Assessment Badges */}
                {enrichedRec && (
                  <>
                    <RiskScoreBadge score={enrichedRec.riskScore} />
                    <PricingActionBadge action={enrichedRec.action} />
                    <PriorityBadge priority={enrichedRec.priority} />
                  </>
                )}
              </div>
              <h3 className="text-lg font-bold text-slate-800 mt-1 leading-tight">{detail.description}</h3>
            </div>
            <button onClick={closeSlideOver} className="p-2 hover:bg-slate-100 rounded-lg transition-colors ml-4">
              <X size={20} className="text-slate-400" />
            </button>
          </div>
        </div>

        {/* ── Scrollable Content ── */}
        <motion.div variants={slideOverSectionVariants} initial="hidden" animate="visible" className="flex-1 overflow-y-auto px-6 py-5 space-y-5">

          {/* ── Section 1: KPI Cards ── */}
          <motion.div variants={slideOverItemVariants} className="grid grid-cols-4 gap-3">
            <KPICard
              compact
              label="Total Revenue"
              value={formatEUR(detail.totalRevenue)}
              change={detail.yoyGrowth != null ? `${detail.yoyGrowth >= 0 ? '+' : ''}${detail.yoyGrowth.toFixed(1)}% YoY` : undefined}
              changeType={detail.yoyGrowth >= 0 ? 'positive' : 'negative'}
              accentGradient={gradients.primary}
            />
            <KPICard
              compact
              label="Total Units"
              value={detail.totalUnits}
              change={detail.monthlyVelocity != null ? `${detail.monthlyVelocity.toFixed(1)}/mo` : undefined}
              changeType="neutral"
              accentGradient={gradients.navy}
            />
            <KPICard
              compact
              label="Current Margin"
              value={`${(detail.currentMargin * 100).toFixed(1)}%`}
              change={detail.marginTrend}
              changeType={detail.currentMargin < MARGIN_FLOOR ? 'negative' : detail.currentMargin < MARGIN_TARGET ? 'warning' : 'positive'}
              accentGradient={detail.currentMargin < MARGIN_FLOOR ? gradients.tertiary : detail.currentMargin < MARGIN_TARGET ? gradients.tertiary : gradients.emerald}
            />
            <KPICard
              compact
              label="Customers"
              value={detail.uniqueCustomers}
              change={`ABC: ${detail.abcClass || '—'}`}
              changeType="neutral"
              accentGradient={gradients.navy}
            />
          </motion.div>

          {/* ── Section 2: Revenue & Margin by Year (bar + line combo) ── */}
          {detail.revenueByYear.length > 0 && (
            <motion.div variants={slideOverItemVariants} className="rounded-xl p-4" style={{ background: '#ffffff', boxShadow: '0 8px 32px rgba(26,26,46,0.04)' }}>
              <h4 className="text-sm font-bold text-slate-700 mb-3 flex items-center gap-2">
                <BarChart2 size={14} className="text-[#0393da]" /> Revenue & Margin by Year
              </h4>
              <div className="h-44">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={detail.revenueByYear}>
                    <CartesianGrid stroke="#f3f4f6" />
                    <XAxis dataKey="year" tick={{ fontSize: 11 }} tickLine={false} />
                    <YAxis yAxisId="rev" tick={{ fontSize: 10 }} axisLine={false} tickLine={false} tickFormatter={(v) => `€${(v / 1000).toFixed(0)}K`} />
                    <YAxis yAxisId="margin" orientation="right" tick={{ fontSize: 10 }} axisLine={false} tickLine={false} tickFormatter={(v) => `${(v * 100).toFixed(0)}%`} domain={[0, 0.5]} />
                    <Tooltip
                      formatter={(value, name) =>
                        name === 'revenue' ? formatEUR(value) :
                        name === 'margin' ? `${(value * 100).toFixed(1)}%` :
                        value
                      }
                    />
                    <defs>
                      <linearGradient id="skuBarGrad" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%" stopColor="#0393da" />
                        <stop offset="100%" stopColor="#0393da" stopOpacity={0.4} />
                      </linearGradient>
                    </defs>
                    <Bar yAxisId="rev" dataKey="revenue" fill="url(#skuBarGrad)" radius={[6, 6, 0, 0]} name="Revenue" />
                    <ReferenceLine yAxisId="margin" y={MARGIN_FLOOR} stroke="#EF4444" strokeDasharray="4 4" label={{ value: '25% Floor', position: 'right', fill: '#EF4444', fontSize: 9 }} />
                    <ReferenceLine yAxisId="margin" y={MARGIN_TARGET} stroke="#22C55E" strokeDasharray="4 4" label={{ value: '30% Target', position: 'right', fill: '#22C55E', fontSize: 9 }} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </motion.div>
          )}

          {/* ── Section 3: Monthly Margin Trajectory (if data exists) ── */}
          {detail.monthlyMargins.length > 4 && (
            <motion.div variants={slideOverItemVariants} className="rounded-xl p-4" style={{ background: '#ffffff', boxShadow: '0 8px 32px rgba(26,26,46,0.04)' }}>
              <h4 className="text-sm font-bold text-slate-700 mb-3 flex items-center gap-2">
                <TrendingDown size={14} className="text-red-500" /> Monthly Margin Trajectory
              </h4>
              <div className="h-40">
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart data={detail.monthlyMargins}>
                    <CartesianGrid stroke="#f3f4f6" />
                    <XAxis dataKey="label" tick={{ fontSize: 9 }} tickLine={false} interval={Math.floor(detail.monthlyMargins.length / 8)} />
                    <YAxis tick={{ fontSize: 10 }} axisLine={false} tickLine={false} tickFormatter={(v) => `${(v * 100).toFixed(0)}%`} domain={['auto', 'auto']} />
                    <Tooltip formatter={(v) => `${(v * 100).toFixed(1)}%`} />
                    <ReferenceLine y={MARGIN_FLOOR} stroke="#EF4444" strokeDasharray="4 4" />
                    <ReferenceLine y={MARGIN_TARGET} stroke="#22C55E" strokeDasharray="4 4" />
                    <Area type="monotone" dataKey="margin" stroke="#6366F1" fill="#6366F1" fillOpacity={0.1} strokeWidth={2} dot={false} />
                  </AreaChart>
                </ResponsiveContainer>
              </div>
            </motion.div>
          )}

          {/* ── Section 4: Cost Structure ── */}
          <motion.div variants={slideOverItemVariants} className="rounded-xl p-4" style={{ background: '#ffffff', boxShadow: '0 8px 32px rgba(26,26,46,0.04)' }}>
            <h4 className="text-sm font-bold text-slate-700 mb-3 flex items-center gap-2">
              <Package size={14} className="text-amber-500" /> Cost Structure
            </h4>
            <div className="grid grid-cols-4 gap-3 mt-1 text-center">
              <div>
                <p className="text-[10px] text-slate-400">HKVoll/Unit</p>
                <p className="text-xs font-bold text-slate-700">{detail.hkvollPerUnit != null ? formatEUR(detail.hkvollPerUnit) : '—'}</p>
              </div>
              <div>
                <p className="text-[10px] text-slate-400">Material</p>
                <p className="text-xs font-bold text-slate-700">{detail.materialShare != null ? `${(detail.materialShare * 100).toFixed(0)}%` : detail.materialPct != null ? `${(detail.materialPct * 100).toFixed(0)}%` : '—'}</p>
              </div>
              <div>
                <p className="text-[10px] text-slate-400">Labor</p>
                <p className="text-xs font-bold text-slate-700">{detail.laborShare != null ? `${(detail.laborShare * 100).toFixed(0)}%` : detail.fekPct != null ? `${(detail.fekPct * 100).toFixed(0)}%` : '—'}</p>
              </div>
              <div>
                <p className="text-[10px] text-slate-400">Cost Trend</p>
                <p className={`text-xs font-bold ${detail.costChangePct != null && detail.costChangePct > 0.05 ? 'text-red-600' : 'text-green-600'}`}>
                  {detail.costChangePct != null ? `${(detail.costChangePct * 100).toFixed(1)}%` : '—'}
                </p>
              </div>
            </div>
          </motion.div>

          {/* ── Section 4b: Enriched Pricing Recommendation Card ── */}
          <motion.div variants={slideOverItemVariants} className={`rounded-xl border p-4 ${
            enrichedRec?.action === 'Increase' ? 'bg-red-50/60 border-red-200' :
            enrichedRec?.action === 'Monitor' ? 'bg-amber-50/60 border-amber-200' :
            'bg-green-50/60 border-green-200'
          }`} style={{ boxShadow: '0 8px 32px rgba(26,26,46,0.04)' }}>
            <h4 className="text-sm font-bold text-slate-700 mb-3 flex items-center gap-2">
              <DollarSign size={14} style={{ color: colors.primary }} /> Enriched Pricing Recommendation
            </h4>
            {enrichedRec ? (
              <div className="space-y-3">
                <div className="grid grid-cols-4 gap-3 text-center">
                  <div>
                    <p className="text-[10px] text-slate-400">Current Margin</p>
                    <p className="text-xs font-bold text-slate-700">
                      {enrichedRec.currentMargin != null ? `${(enrichedRec.currentMargin * 100).toFixed(1)}%` : '—'}
                    </p>
                  </div>
                  <div>
                    <p className="text-[10px] text-slate-400">Suggested Action</p>
                    <p className="text-xs font-bold">
                      <PricingActionBadge action={enrichedRec.action} />
                    </p>
                  </div>
                  <div>
                    <p className="text-[10px] text-slate-400">Approval Level</p>
                    <p className={`text-xs font-bold ${
                      enrichedRec.approvalColor === 'green' ? 'text-green-700' :
                      enrichedRec.approvalColor === 'amber' ? 'text-amber-700' :
                      enrichedRec.approvalColor === 'orange' ? 'text-orange-700' :
                      'text-red-700'
                    }`}>{enrichedRec.approvalLevel}</p>
                  </div>
                  <div>
                    <p className="text-[10px] text-slate-400">Priority</p>
                    <p className="text-xs font-bold">
                      <PriorityBadge priority={enrichedRec.priority} />
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-3 pt-2 border-t border-slate-200/50">
                  <span className="text-[10px] text-slate-400">Margin Trajectory:</span>
                  <span className={`inline-flex items-center gap-1 text-xs font-bold ${
                    enrichedRec.trajectoryDirection === 'improving' ? 'text-green-600' :
                    enrichedRec.trajectoryDirection === 'declining' ? 'text-red-600' :
                    'text-slate-500'
                  }`}>
                    {enrichedRec.trajectoryDirection === 'improving' ? <TrendingUp size={12} /> :
                     enrichedRec.trajectoryDirection === 'declining' ? <TrendingDown size={12} /> :
                     <Minus size={12} />}
                    {enrichedRec.trajectoryDirection.charAt(0).toUpperCase() + enrichedRec.trajectoryDirection.slice(1)}
                  </span>
                  {enrichedRec.marginGapPct > 0 && (
                    <span className="text-[10px] text-slate-500 ml-auto">
                      Gap to target: <span className="font-bold text-red-600">{enrichedRec.marginGapPct.toFixed(1)}pp</span>
                    </span>
                  )}
                </div>
              </div>
            ) : (
              <p className="text-xs text-slate-400 italic">No pricing action needed</p>
            )}
          </motion.div>

          {/* ── Section 4c: Gap Analysis ── */}
          {detail.gapAnalysis && (
            <motion.div variants={slideOverItemVariants} className="rounded-xl p-4" style={{ background: '#ffffff', boxShadow: '0 8px 32px rgba(26,26,46,0.04)' }}>
              <h4 className="text-sm font-bold text-slate-700 mb-3 flex items-center gap-2">
                <Search size={14} style={{ color: colors.tertiary }} /> Gap Analysis
              </h4>
              <div className="grid grid-cols-3 gap-4 text-center">
                <div>
                  <p className="text-[10px] text-slate-400">Mean Gap</p>
                  <p className={`text-sm font-bold ${
                    (detail.gapAnalysis.mean_gap || 0) > 0.05 ? 'text-red-600' : 'text-slate-700'
                  }`}>
                    {detail.gapAnalysis.mean_gap != null ? `${(detail.gapAnalysis.mean_gap * 100).toFixed(1)}pp` : '—'}
                  </p>
                </div>
                <div>
                  <p className="text-[10px] text-slate-400">Median Gap</p>
                  <p className={`text-sm font-bold ${
                    (detail.gapAnalysis.median_gap || 0) > 0.03 ? 'text-amber-600' : 'text-slate-700'
                  }`}>
                    {detail.gapAnalysis.median_gap != null ? `${(detail.gapAnalysis.median_gap * 100).toFixed(1)}pp` : '—'}
                  </p>
                </div>
                <div>
                  <p className="text-[10px] text-slate-400">Linked Records</p>
                  <p className="text-sm font-bold text-slate-700">
                    {detail.gapAnalysis.linked_records != null ? detail.gapAnalysis.linked_records.toLocaleString() : '—'}
                  </p>
                </div>
              </div>
              {detail.gapAnalysis.std_gap != null && (
                <div className="mt-2 pt-2 border-t border-slate-100 text-center">
                  <span className="text-[10px] text-slate-400">Std. Dev: </span>
                  <span className="text-[10px] font-bold text-slate-600">{(detail.gapAnalysis.std_gap * 100).toFixed(1)}pp</span>
                </div>
              )}
            </motion.div>
          )}

          {/* ── Section 5: Pricing Recommendation (existing) ── */}
          <motion.div variants={slideOverItemVariants} className={`rounded-lg border p-4 ${
            detail.pricingAction === 'Increase' ? 'bg-red-50/50 border-red-200' :
            detail.pricingAction === 'Monitor' ? 'bg-amber-50/50 border-amber-200' :
            'bg-green-50/50 border-green-200'
          }`}>
            <h4 className="text-sm font-bold text-slate-700 mb-3 flex items-center gap-2">
              <DollarSign size={14} className="text-green-600" /> Pricing Recommendation
            </h4>

            <div className="flex items-center gap-3 mb-3">
              <span className={`inline-flex px-3 py-1 rounded-full text-xs font-bold ${
                detail.pricingAction === 'Increase' ? 'bg-red-100 text-red-700' :
                detail.pricingAction === 'Monitor' ? 'bg-amber-100 text-amber-700' :
                'bg-green-100 text-green-700'
              }`}>
                {detail.pricingAction === 'Increase' ? '↑ Price Increase Required' :
                 detail.pricingAction === 'Monitor' ? '⊙ Monitor' : '✓ OK'}
              </span>
              {detail.marginGap > 0 && (
                <span className="text-xs text-slate-500">
                  Gap: <span className="font-bold text-red-600">{(detail.marginGap * 100).toFixed(1)}pp</span>
                </span>
              )}
              {detail.recoveryPotential > 0 && (
                <span className="text-xs text-slate-500">
                  Recovery: <span className="font-bold text-green-600">{formatEUR(detail.recoveryPotential)}</span>
                </span>
              )}
            </div>

            {/* Current margin bar */}
            <div className="mb-3">
              <p className="text-[10px] text-slate-400 mb-1">Current Margin vs Target</p>
              <MarginBar current={detail.currentMarginExact || detail.currentMargin} />
            </div>

            {/* Price comparison infographic */}
            {detail.currentAvgPrice && detail.recommendedPrice && detail.pricingAction === 'Increase' && (
              <div className="mt-3 pt-3 border-t border-slate-200/50">
                <p className="text-[10px] uppercase font-bold text-slate-400 mb-2">Price Adjustment Required</p>
                <PriceComparisonBar current={detail.currentAvgPrice} recommended={detail.recommendedPrice} />
                <div className="flex items-center justify-between mt-2 text-xs">
                  <span className="text-slate-500">
                    Increase by <span className="font-bold text-red-600">{detail.priceIncreasePct?.toFixed(1)}%</span>
                  </span>
                  <span className={`font-bold px-2 py-0.5 rounded text-[10px] ${
                    detail.approvalColor === 'green' ? 'bg-green-100 text-green-700' :
                    detail.approvalColor === 'blue' ? 'bg-[#c1e8ff] text-[#004b72]' :
                    detail.approvalColor === 'amber' ? 'bg-amber-100 text-amber-700' :
                    'bg-red-100 text-red-700'
                  }`}>
                    Approval: {detail.approvalLevel}
                  </span>
                </div>
              </div>
            )}

            {/* COGS breakdown if available */}
            {detail.landedCost && (
              <div className="mt-3 pt-3 border-t border-slate-200/50">
                <p className="text-[10px] uppercase font-bold text-slate-400 mb-1">Cost Structure</p>
                <div className="flex items-center gap-4 text-xs">
                  <span className="text-slate-500">Landed Cost: <span className="font-bold">{formatEUR(detail.landedCost)}</span></span>
                  {detail.fxRisk !== 'NONE' && (
                    <span className={`font-bold ${detail.fxRisk === 'HIGH' ? 'text-red-600' : 'text-amber-600'}`}>
                      FX Risk: {detail.fxRisk}
                    </span>
                  )}
                </div>
              </div>
            )}

            {/* Price consistency if flagged */}
            {detail.priceConsistency && (
              <div className="mt-3 pt-3 border-t border-slate-200/50">
                <p className="text-[10px] uppercase font-bold text-slate-400 mb-1">Price Variance Alert</p>
                <div className="flex items-center gap-4 text-xs">
                  <span className="text-slate-500">Min: <span className="font-bold">{formatEUR(detail.priceConsistency.minPrice)}</span></span>
                  <span className="text-slate-500">Max: <span className="font-bold">{formatEUR(detail.priceConsistency.maxPrice)}</span></span>
                  <span className="text-slate-500">CV: <span className="font-bold text-amber-600">{detail.priceConsistency.cv.toFixed(3)}</span></span>
                </div>
              </div>
            )}

            {/* Governance */}
            <div className="mt-3 pt-3 border-t border-slate-200/50 flex items-center gap-4 text-xs">
              <span className="flex items-center gap-1 text-slate-500"><ShieldCheck size={12} /> Governance</span>
              <span>Target: <span className="font-bold">{(detail.targetMargin * 100).toFixed(0)}%</span></span>
              {detail.maxDiscount && <span>Max Discount: <span className="font-bold">{(detail.maxDiscount * 100).toFixed(0)}%</span></span>}
              {detail.reviewFrequency && <span>Review: <span className="font-bold">{detail.reviewFrequency}</span></span>}
            </div>
          </motion.div>

          {/* ── Section 6: Customer Purchases ── */}
          {detail.customerPurchases.length > 0 && (
            <motion.div variants={slideOverItemVariants} className="rounded-xl p-4" style={{ background: '#ffffff', boxShadow: '0 8px 32px rgba(26,26,46,0.04)' }}>
              <h4 className="text-sm font-bold text-slate-700 mb-3 flex items-center gap-2">
                <Users size={14} className="text-[#0393da]" /> Customer Purchases ({detail.uniqueCustomers})
              </h4>

              {/* Churn Prediction Summary */}
              {detail.churnPrediction && (
                <div className="mb-3 p-2.5 rounded-lg bg-slate-50 border border-slate-100">
                  <div className="flex items-center gap-2 mb-1.5">
                    <Cpu size={12} style={{ color: colors.secondary }} />
                    <span className="text-[10px] font-bold text-slate-600 uppercase">Churn Prediction Model</span>
                    <span className={`ml-auto inline-flex items-center px-1.5 py-0.5 rounded text-[9px] font-bold ring-1 ${
                      detail.churnPrediction.accuracy >= 0.8 ? 'bg-green-50 text-green-700 ring-green-200' :
                      detail.churnPrediction.accuracy >= 0.7 ? 'bg-amber-50 text-amber-700 ring-amber-200' :
                      'bg-red-50 text-red-700 ring-red-200'
                    }`}>
                      {detail.churnPrediction.accuracy >= 0.8 ? 'High' :
                       detail.churnPrediction.accuracy >= 0.7 ? 'Medium' : 'Low'} Confidence
                    </span>
                  </div>
                  <div className="grid grid-cols-4 gap-3 text-center">
                    <div>
                      <p className="text-[10px] text-slate-400">Accuracy</p>
                      <p className="text-xs font-bold text-slate-700">{(detail.churnPrediction.accuracy * 100).toFixed(0)}%</p>
                    </div>
                    <div>
                      <p className="text-[10px] text-slate-400">Total At Risk</p>
                      <p className="text-xs font-bold text-red-600">{detail.churnPrediction.total_at_risk}</p>
                    </div>
                    <div>
                      <p className="text-[10px] text-slate-400">High Value</p>
                      <p className="text-xs font-bold text-amber-600">{detail.churnPrediction.high_value_at_risk}</p>
                    </div>
                    <div>
                      <p className="text-[10px] text-slate-400">Revenue at Risk</p>
                      <p className="text-xs font-bold text-slate-700">{formatEUR(detail.churnPrediction.revenue_at_risk_eur)}</p>
                    </div>
                  </div>
                </div>
              )}

              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs">
                  <thead>
                    <tr className="text-slate-400 uppercase text-[9px] font-bold border-b border-slate-100">
                      <th className="py-2 pr-3">Customer</th>
                      <th className="py-2 pr-3">Segment</th>
                      <th className="py-2 pr-3 text-right">Total Value</th>
                      <th className="py-2 pr-3 text-right">Avg Margin</th>
                      <th className="py-2 pr-3 text-right">Txns</th>
                      <th className="py-2">Risk Tier</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-50">
                    {detail.customerPurchases.slice(0, 10).map((cp) => (
                      <tr key={cp.customer_id} className="hover:bg-[#f8f9fa]">
                        <td className="py-2 pr-3 font-mono text-slate-600" title={cp.customer_name}>{cp.customer_name || cp.customer_id}</td>
                        <td className="py-2 pr-3">{cp.segment}</td>
                        <td className="py-2 pr-3 text-right font-semibold">{formatEUR(cp.totalValue)}</td>
                        <td className="py-2 pr-3 text-right">
                          {cp.avgMargin != null ? formatPct(cp.avgMargin) : '—'}
                        </td>
                        <td className="py-2 pr-3 text-right">{cp.txnCount}</td>
                        <td className="py-2">
                          <span className={`px-1.5 py-0.5 rounded text-[9px] font-bold ${
                            cp.riskTier === 'high' ? 'bg-red-100 text-red-700' :
                            cp.riskTier === 'medium' ? 'bg-amber-100 text-amber-700' :
                            'bg-green-100 text-green-700'
                          }`}>{cp.riskTier}</span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                {detail.customerPurchases.length > 10 && (
                  <p className="text-[10px] text-slate-400 mt-2">Showing top 10 of {detail.customerPurchases.length} customers</p>
                )}
              </div>
            </motion.div>
          )}

        </motion.div>
      </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}
