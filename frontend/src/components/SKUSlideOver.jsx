import React, { useMemo, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'motion/react';
import {
  AreaChart, Area, BarChart, Bar,
  ResponsiveContainer, XAxis, YAxis, Tooltip, CartesianGrid, ReferenceLine,
} from 'recharts';
import {
  X, TrendingUp, TrendingDown, Minus, Package, DollarSign, Users,
  AlertTriangle, ShieldCheck, BarChart2, Activity, Target, Clock,
  Link2, ArrowUpRight, ChevronRight, ChevronLeft,
} from 'lucide-react';
import { useUI } from '../context/UIContext';
import { useT, useLanguage } from '../context/LanguageContext';
import { getSKUDetail } from '../utils/skuDetailEngine';
import { computeRiskScore, computePriority, getApprovalLevel, getMarginTrajectory, productsByArticle, costTrendsByArticle } from '../utils/pricingEngine';
import { formatEUR, formatPct } from '../utils/formatters';
import { slideOverVariants, backdropVariants, slideOverSectionVariants, slideOverItemVariants } from '../utils/animations';
import KPICard from './shared/KPICard';
import { gradients, colors } from '../utils/designTokensV2';
import { track } from '../utils/tracker';

const MARGIN_FLOOR = 0.50;
const MARGIN_TARGET = 0.55;

/* ── Margin Bar ── */
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

/* ── Risk Score Badge ── */
function RiskScoreBadge({ score }) {
  const t = useT();
  const bg = score >= 70 ? 'bg-red-100' : score >= 50 ? 'bg-amber-100' : score >= 30 ? 'bg-yellow-50' : 'bg-green-50';
  const text = score >= 70 ? 'text-red-700' : score >= 50 ? 'text-amber-700' : score >= 30 ? 'text-yellow-700' : 'text-green-700';
  const ring = score >= 70 ? 'ring-red-200' : score >= 50 ? 'ring-amber-200' : score >= 30 ? 'ring-yellow-200' : 'ring-green-200';
  return (
    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold ring-1 ${bg} ${text} ${ring}`}>
      <Activity size={9} /> {t('sku.risk')} {score}
    </span>
  );
}

/* ── Priority Badge ── */
const PRIORITY_KEY = { Critical: 'sku.priority.critical', High: 'sku.priority.high', Medium: 'sku.priority.medium', Low: 'sku.priority.low' };
function PriorityBadge({ priority }) {
  const t = useT();
  const styles = {
    Critical: 'bg-red-100 text-red-700 ring-red-200',
    High: 'bg-amber-100 text-amber-700 ring-amber-200',
    Medium: 'bg-yellow-50 text-yellow-700 ring-yellow-200',
    Low: 'bg-green-50 text-green-700 ring-green-200',
  };
  return (
    <span className={`inline-flex px-2 py-0.5 rounded-full text-[10px] font-bold ring-1 ${styles[priority] || styles.Low}`}>
      {t(PRIORITY_KEY[priority] || 'sku.priority.low')}
    </span>
  );
}

/* ── Pricing Action Badge ── */
function PricingActionBadge({ action }) {
  const t = useT();
  if (action === 'Increase') return <span className="inline-flex px-2 py-0.5 rounded-full text-[10px] font-bold bg-red-100 text-red-700 ring-1 ring-red-200">{t('sku.action.increase')}</span>;
  if (action === 'Monitor') return <span className="inline-flex px-2 py-0.5 rounded-full text-[10px] font-bold bg-amber-100 text-amber-700 ring-1 ring-amber-200">{t('sku.action.monitor')}</span>;
  return <span className="inline-flex px-2 py-0.5 rounded-full text-[10px] font-bold bg-green-100 text-green-700 ring-1 ring-green-200">{t('sku.action.ok')}</span>;
}

/* ── Section wrapper ── */
function Section({ icon: Icon, iconColor, title, children, className = '' }) {
  return (
    <motion.div variants={slideOverItemVariants} className={`rounded-xl p-4 ${className}`} style={{ background: '#ffffff', boxShadow: '0 8px 32px rgba(26,26,46,0.04)' }}>
      <h4 className="text-sm font-bold text-slate-700 mb-3 flex items-center gap-2">
        <Icon size={14} className={iconColor} /> {title}
      </h4>
      {children}
    </motion.div>
  );
}

export default function SKUSlideOver() {
  const navigate = useNavigate();
  const { slideOver, closeSlideOver, setSidebarCollapsed, openCustomerDetail, openSKUDetail, panelHistory, goBackPanel } = useUI();
  const { t } = useLanguage();

  const isOpen = slideOver.type === 'sku';
  const skuCode = slideOver.id;

  const detail = useMemo(() => {
    if (!isOpen || !skuCode) return null;
    return getSKUDetail(skuCode);
  }, [isOpen, skuCode]);

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

    let action = 'OK';
    if (latestMargin != null && latestMargin < MARGIN_FLOOR) action = 'Increase';
    else if (latestMargin != null && latestMargin < MARGIN_TARGET) action = 'Monitor';
    else if (product.margin_trend === 'declining' && riskScore >= 40) action = 'Monitor';

    let trajectoryDirection = 'stable';
    if (trajectory.length >= 2) {
      const first = trajectory[0].margin;
      const last = trajectory[trajectory.length - 1].margin;
      if (last > first + 0.02) trajectoryDirection = 'improving';
      else if (last < first - 0.02) trajectoryDirection = 'declining';
    }

    return { riskScore, priority, action, currentMargin: latestMargin, marginGapPct, approvalLevel: approval.level, approvalColor: approval.color, trajectoryDirection, trajectory };
  }, [isOpen, skuCode]);

  useEffect(() => {
    if (isOpen) {
      setSidebarCollapsed(true);
      if (skuCode) track.skuDrilldown(skuCode);
    }
  }, [isOpen, setSidebarCollapsed, skuCode]);

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
        {/* ── Breadcrumb ── */}
        {panelHistory.length > 0 && (() => {
          const prev = panelHistory[panelHistory.length - 1];
          return (
            <div className="flex-shrink-0 px-6 py-2 bg-slate-50 border-b border-slate-100 flex items-center gap-2 text-xs">
              <button onClick={goBackPanel} className="flex items-center gap-1 text-[#0393da] hover:text-[#0270a8] font-medium transition-colors">
                <ChevronLeft size={14} />
                {prev.type === 'customer' ? t('sku.bc.customer', { id: prev.id }) : prev.type === 'category' ? prev.id : t('sku.bc.sku', { id: prev.id })}
              </button>
              <ChevronRight size={12} className="text-slate-300" />
              <span className="text-slate-500">{t('sku.bc.sku', { id: detail.article_id })}</span>
            </div>
          );
        })()}

        {/* ── Header ── */}
        <div className="flex-shrink-0 px-6 py-4" style={{ background: '#ffffff', borderBottom: '1px solid #f0f1f3' }}>
          <div className="flex items-start justify-between">
            <div className="flex-1">
              <div className="flex items-center gap-2 flex-wrap">
                <span className="font-mono text-sm text-slate-500 bg-slate-100 px-2 py-0.5 rounded">{detail.article_id}</span>
                <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-[#c1e8ff] text-[#004b72]">{detail.commodity_group}</span>
                {/* Product type from description */}
                <span className="px-2 py-0.5 rounded text-[10px] font-medium bg-slate-50 text-slate-600">{detail.description}</span>
                {detail.isAtRisk && (
                  <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-red-50 text-red-600 flex items-center gap-1">
                    <AlertTriangle size={10} /> {t('sku.atRisk')}
                  </span>
                )}
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

          {/* ── Section 1: KPI Cards (4, fixed bugs) ── */}
          <motion.div variants={slideOverItemVariants} className="grid grid-cols-4 gap-3">
            <KPICard
              compact
              label={t('sku.kpi.revenue')}
              value={formatEUR(detail.totalRevenue)}
              change={detail.yoyGrowth != null ? `${detail.yoyGrowth >= 0 ? '+' : ''}${detail.yoyGrowth.toFixed(1)}% YoY` : undefined}
              changeType={detail.yoyGrowth >= 0 ? 'positive' : 'negative'}
              accentGradient={gradients.primary}
            />
            <KPICard
              compact
              label={t('sku.kpi.units')}
              value={detail.totalUnits}
              changeType="neutral"
              accentGradient={gradients.navy}
            />
            <KPICard
              compact
              label={t('sku.kpi.currentMargin')}
              value={`${(detail.currentMargin * 100).toFixed(1)}%`}
              change={detail.marginTrend}
              changeType={detail.currentMargin < MARGIN_FLOOR ? 'negative' : detail.currentMargin < MARGIN_TARGET ? 'warning' : 'positive'}
              accentGradient={detail.currentMargin < MARGIN_FLOOR ? gradients.tertiary : detail.currentMargin < MARGIN_TARGET ? gradients.tertiary : gradients.emerald}
            />
            <KPICard
              compact
              label={t('sku.kpi.customers')}
              value={detail.uniqueCustomers}
              change={detail.articleConcentration ? `${detail.articleConcentration}` : undefined}
              changeType={detail.articleConcentration === 'HIGH' || detail.articleConcentration?.includes('critical') ? 'warning' : 'neutral'}
              accentGradient={gradients.navy}
            />
          </motion.div>

          {/* ── Section 2: Revenue & Margin by Year ── */}
          {detail.revenueByYear.length > 0 && (
            <Section icon={BarChart2} iconColor="text-[#0393da]" title={t('sku.section.revByYear')}>
              <div className="h-44">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={detail.revenueByYear}>
                    <CartesianGrid stroke="#f3f4f6" />
                    <XAxis dataKey="year" tick={{ fontSize: 11 }} tickLine={false} />
                    <YAxis yAxisId="rev" tick={{ fontSize: 10 }} axisLine={false} tickLine={false} tickFormatter={(v) => `€${(v / 1000).toFixed(0)}K`} />
                    <YAxis yAxisId="margin" orientation="right" tick={{ fontSize: 10 }} axisLine={false} tickLine={false} tickFormatter={(v) => `${(v * 100).toFixed(0)}%`} domain={[0, 0.5]} />
                    <Tooltip formatter={(value, name) => name === 'revenue' ? formatEUR(value) : name === 'margin' ? `${(value * 100).toFixed(1)}%` : value} />
                    <defs>
                      <linearGradient id="skuBarGrad" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%" stopColor="#0393da" />
                        <stop offset="100%" stopColor="#0393da" stopOpacity={0.4} />
                      </linearGradient>
                    </defs>
                    <Bar yAxisId="rev" dataKey="revenue" fill="url(#skuBarGrad)" radius={[6, 6, 0, 0]} name="Revenue" />
                    <ReferenceLine yAxisId="margin" y={MARGIN_FLOOR} stroke="#EF4444" strokeDasharray="4 4" label={{ value: t('sku.label.floor'), position: 'right', fill: '#EF4444', fontSize: 9 }} />
                    <ReferenceLine yAxisId="margin" y={MARGIN_TARGET} stroke="#22C55E" strokeDasharray="4 4" label={{ value: t('sku.label.target'), position: 'right', fill: '#22C55E', fontSize: 9 }} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </Section>
          )}

          {/* ── Section 3: Monthly Margin Trajectory ── */}
          {detail.monthlyMargins.length > 4 && (
            <Section icon={TrendingDown} iconColor="text-red-500" title={t('sku.section.monthlyTraj')}>
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
            </Section>
          )}

          {/* ── Section 4: Quote Performance (NEW) ── */}
          <Section icon={Target} iconColor="text-indigo-500" title={t('sku.section.quotePerf')}>
            {detail.quotePerformance ? (
              <div className="space-y-3">
                <div className="grid grid-cols-3 gap-3 text-center">
                  <div>
                    <p className="text-[10px] text-slate-400">{t('sku.label.winRate')}</p>
                    <p className={`text-sm font-bold ${detail.quotePerformance.winRate < 0.4 ? 'text-red-600' : detail.quotePerformance.winRate < 0.6 ? 'text-amber-600' : 'text-green-600'}`}>
                      {detail.quotePerformance.win}/{detail.quotePerformance.total} ({(detail.quotePerformance.winRate * 100).toFixed(0)}%)
                    </p>
                  </div>
                  <div>
                    <p className="text-[10px] text-slate-400">{t('sku.label.lostRevenue')}</p>
                    <p className="text-sm font-bold text-red-600">{formatEUR(detail.quotePerformance.lostRevenue)}</p>
                  </div>
                  <div>
                    <p className="text-[10px] text-slate-400">{t('sku.label.wonAvgMargin')}</p>
                    <p className="text-sm font-bold text-slate-700">
                      {detail.quotePerformance.wonAvgMargin != null ? `${(detail.quotePerformance.wonAvgMargin * 100).toFixed(1)}%` : '—'}
                    </p>
                  </div>
                </div>
                {detail.quotePerformance.wonAvgMargin != null && detail.quotePerformance.lostAvgMargin != null && (
                  <div className="flex items-center gap-2 text-[11px] text-slate-500 pt-2 border-t border-slate-100">
                    <span>{t('sku.text.wonMargin')} <span className="font-bold text-green-600">{(detail.quotePerformance.wonAvgMargin * 100).toFixed(1)}%</span></span>
                    <span>{t('sku.text.vsLost')} <span className="font-bold text-red-600">{(detail.quotePerformance.lostAvgMargin * 100).toFixed(1)}%</span></span>
                    <span className="ml-auto font-bold text-slate-700">
                      {t('sku.text.gap', { value: ((detail.quotePerformance.wonAvgMargin - detail.quotePerformance.lostAvgMargin) * 100).toFixed(1) })}
                    </span>
                  </div>
                )}
              </div>
            ) : (
              <p className="text-xs text-slate-400 italic">{t('sku.text.noQuotes')}</p>
            )}
          </Section>

          {/* ── Section 5: Customer List (NEW — clickable, concentration flag) ── */}
          {detail.uniqueCustomers > 0 && (
            <Section icon={Users} iconColor="text-[#0393da]" title={t('sku.section.customers', { n: detail.uniqueCustomers })}>
              {/* Concentration warning */}
              {detail.articleTopCustomerShare != null && detail.articleTopCustomerShare > 0.6 && (
                <div className="flex items-start gap-2 bg-amber-50 rounded-lg p-2.5 text-[11px] text-amber-800 mb-3">
                  <AlertTriangle size={12} className="text-amber-500 mt-0.5 flex-shrink-0" />
                  <span>{t('sku.text.concentration', { pct: (detail.articleTopCustomerShare * 100).toFixed(0) })}</span>
                </div>
              )}

              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs">
                  <thead>
                    <tr className="text-slate-400 uppercase text-[9px] font-bold border-b border-slate-100">
                      <th className="py-2 pr-3">{t('sku.col.customer')}</th>
                      <th className="py-2 pr-3">{t('sku.col.segment')}</th>
                      <th className="py-2 pr-3 text-right">{t('sku.col.revenue')}</th>
                      <th className="py-2 pr-3 text-right">{t('sku.col.share')}</th>
                      <th className="py-2 text-right">{t('sku.col.margin')}</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-50">
                    {(detail.articleCustomerList.length > 0 ? detail.articleCustomerList : detail.customerPurchases).slice(0, 5).map((cp) => (
                      <tr
                        key={cp.customer_id}
                        className="hover:bg-[#f0f7ff] cursor-pointer transition-colors"
                        onClick={() => openCustomerDetail?.(cp.customer_id)}
                      >
                        <td className="py-2 pr-3 font-mono text-[#0393da] font-medium flex items-center gap-1">
                          {cp.customer_name || cp.customer_id}
                          <ChevronRight size={10} className="text-slate-300" />
                        </td>
                        <td className="py-2 pr-3">{cp.segment}</td>
                        <td className="py-2 pr-3 text-right font-semibold">{formatEUR(cp.revenue ?? cp.totalValue)}</td>
                        <td className="py-2 pr-3 text-right">{cp.share != null ? `${(cp.share * 100).toFixed(0)}%` : '—'}</td>
                        <td className="py-2 text-right">
                          {(cp.avgMargin != null) ? formatPct(cp.avgMargin) : '—'}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                {detail.uniqueCustomers > 5 && (
                  <p className="text-[10px] text-[#0393da] mt-2 cursor-pointer hover:underline">
                    {t('sku.text.andMore', { n: detail.uniqueCustomers - 5 })}
                  </p>
                )}
              </div>
            </Section>
          )}

          {/* ── Section 6: Price vs Cost Trend (NEW) ── */}
          {detail.priceCostByYear.length >= 2 && detail.priceCostByYear.some(y => y.costPerUnit) && (
            <Section icon={DollarSign} iconColor="text-emerald-500" title={t('sku.section.priceCost')}>
              <div className="overflow-x-auto">
                <table className="w-full text-xs text-center">
                  <thead>
                    <tr className="text-slate-400 uppercase text-[9px] font-bold border-b border-slate-100">
                      <th className="py-2">{t('sku.col.year')}</th>
                      <th className="py-2">{t('sku.col.price')}</th>
                      <th className="py-2">{t('sku.col.cost')}</th>
                      <th className="py-2">{t('sku.col.margin')}</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-50">
                    {detail.priceCostByYear.map((y, i) => {
                      const prev = i > 0 ? detail.priceCostByYear[i - 1] : null;
                      const priceChange = prev?.pricePerUnit && y.pricePerUnit ? ((y.pricePerUnit - prev.pricePerUnit) / prev.pricePerUnit * 100) : null;
                      const costChange = prev?.costPerUnit && y.costPerUnit ? ((y.costPerUnit - prev.costPerUnit) / prev.costPerUnit * 100) : null;
                      return (
                        <tr key={y.year}>
                          <td className="py-2 font-bold text-slate-700">{y.year}</td>
                          <td className="py-2">
                            {y.pricePerUnit != null ? formatEUR(y.pricePerUnit) : '—'}
                            {priceChange != null && (
                              <span className={`block text-[9px] ${priceChange >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                                ({priceChange >= 0 ? '+' : ''}{priceChange.toFixed(1)}%)
                              </span>
                            )}
                          </td>
                          <td className="py-2">
                            {y.costPerUnit != null ? formatEUR(y.costPerUnit) : '—'}
                            {costChange != null && (
                              <span className={`block text-[9px] ${costChange <= 0 ? 'text-green-600' : 'text-red-600'}`}>
                                ({costChange >= 0 ? '+' : ''}{costChange.toFixed(1)}%)
                              </span>
                            )}
                          </td>
                          <td className="py-2 font-bold">
                            {y.margin != null ? `${(y.margin * 100).toFixed(1)}%` : '—'}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
              {detail.costPassThrough != null && (
                <div className="mt-3 pt-3 border-t border-slate-100 text-[11px] text-slate-600">
                  <span className="font-bold">{t('sku.text.passThrough', { pct: (detail.costPassThrough * 100).toFixed(0) })}</span>
                  {detail.costPassThrough < 1 && (
                    <span className="text-amber-700 ml-2">
                      {t('sku.text.absorbing', { pct: ((1 - detail.costPassThrough) * 100).toFixed(0) })}
                    </span>
                  )}
                </div>
              )}
            </Section>
          )}

          {/* ── Section 7: Cost Structure ── */}
          <Section icon={Package} iconColor="text-amber-500" title={t('sku.section.costStructure')}>
            <div className="grid grid-cols-4 gap-3 mt-1 text-center">
              <div>
                <p className="text-[10px] text-slate-400">{t('sku.label.hkvoll')}</p>
                <p className="text-xs font-bold text-slate-700">{detail.hkvollPerUnit != null ? formatEUR(detail.hkvollPerUnit) : '—'}</p>
              </div>
              <div>
                <p className="text-[10px] text-slate-400">{t('sku.label.material')}</p>
                <p className="text-xs font-bold text-slate-700">{detail.materialShare != null ? `${(detail.materialShare * 100).toFixed(0)}%` : detail.materialPct != null ? `${(detail.materialPct * 100).toFixed(0)}%` : '—'}</p>
              </div>
              <div>
                <p className="text-[10px] text-slate-400">{t('sku.label.labor')}</p>
                <p className="text-xs font-bold text-slate-700">{detail.laborShare != null ? `${(detail.laborShare * 100).toFixed(0)}%` : detail.fekPct != null ? `${(detail.fekPct * 100).toFixed(0)}%` : '—'}</p>
              </div>
              <div>
                <p className="text-[10px] text-slate-400">{t('sku.label.costTrend')}</p>
                <p className={`text-xs font-bold ${detail.costChangePct != null && detail.costChangePct > 0.05 ? 'text-red-600' : 'text-green-600'}`}>
                  {detail.costChangePct != null ? `${(detail.costChangePct * 100).toFixed(1)}%` : '—'}
                </p>
              </div>
            </div>
            {(detail.materialShare || 0) > 0.40 && (
              <div className="flex items-start gap-2 bg-amber-50 rounded-lg p-2.5 text-[11px] text-amber-800 mt-3">
                <span className="font-bold">!</span>
                <span>{t('sku.text.materialWarning', { pct: ((detail.materialShare || 0) * 100).toFixed(0) })}</span>
              </div>
            )}
          </Section>

          {/* ── Section 8: Order Frequency & Recency (NEW) ── */}
          <Section icon={Clock} iconColor="text-blue-500" title={t('sku.section.orderActivity')}>
            <div className="grid grid-cols-3 gap-3 text-center">
              <div>
                <p className="text-[10px] text-slate-400">{t('sku.label.lastOrder')}</p>
                <p className="text-xs font-bold text-slate-700">{detail.orderActivity.lastOrderDate || '—'}</p>
              </div>
              <div>
                <p className="text-[10px] text-slate-400">{t('sku.label.avgOrders')}</p>
                <p className="text-xs font-bold text-slate-700">{detail.orderActivity.avgOrdersPerYear}</p>
              </div>
              <div>
                <p className="text-[10px] text-slate-400">{t('sku.label.totalOrders')}</p>
                <p className="text-xs font-bold text-slate-700">{detail.orderActivity.totalOrders}</p>
              </div>
            </div>
            <div className="flex items-center gap-2 mt-3 pt-3 border-t border-slate-100">
              <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold ring-1 ${
                detail.orderActivity.status === 'Active' ? 'bg-green-50 text-green-700 ring-green-200' :
                detail.orderActivity.status === 'Slowing' ? 'bg-amber-50 text-amber-700 ring-amber-200' :
                detail.orderActivity.status === 'Inactive' ? 'bg-red-50 text-red-700 ring-red-200' :
                'bg-slate-50 text-slate-500 ring-slate-200'
              }`}>
                {detail.orderActivity.status === 'Active' ? t('sku.status.active') :
                 detail.orderActivity.status === 'Slowing' ? t('sku.status.slowing') :
                 detail.orderActivity.status === 'Inactive' ? t('sku.status.inactive') :
                 detail.orderActivity.status}
              </span>
              {detail.orderActivity.isInactive && (
                <span className="text-[11px] text-red-600 font-medium">
                  {t('sku.text.inactive', { n: detail.orderActivity.monthsSinceLastOrder, prev: detail.orderActivity.avgOrdersPerYear })}
                </span>
              )}
            </div>
          </Section>

          {/* ── Section 9: Margin Gap — THIS ARTICLE (FIXED — was showing portfolio data) ── */}
          {detail.articleGap ? (
            <Section icon={Target} iconColor="text-purple-500" title={t('sku.section.marginGapArticle')}>
              <div className="grid grid-cols-3 gap-4 text-center">
                <div>
                  <p className="text-[10px] text-slate-400">{t('sku.label.quoted')}</p>
                  <p className="text-sm font-bold text-slate-700">{(detail.articleGap.quoted * 100).toFixed(1)}%</p>
                </div>
                <div>
                  <p className="text-[10px] text-slate-400">{t('sku.label.actual')}</p>
                  <p className="text-sm font-bold text-slate-700">{(detail.articleGap.actual * 100).toFixed(1)}%</p>
                </div>
                <div>
                  <p className="text-[10px] text-slate-400">{t('sku.label.gap')}</p>
                  <p className={`text-sm font-bold ${detail.articleGap.gap > 0.03 ? 'text-red-600' : detail.articleGap.gap > 0.01 ? 'text-amber-600' : 'text-green-600'}`}>
                    {(detail.articleGap.gap * 100).toFixed(1)}pp
                  </p>
                </div>
              </div>
              {detail.portfolioGap && (
                <div className="mt-2 pt-2 border-t border-slate-100 text-center text-[10px] text-slate-400">
                  {t('sku.text.vsPortfolio')} <span className="font-bold text-slate-600">{(detail.portfolioGap.mean_gap * 100).toFixed(1)}pp</span>
                  {detail.articleGap.gap > detail.portfolioGap.mean_gap * 2 && (
                    <span className="text-red-500 font-bold ml-1">
                      {t('sku.text.aboveAvg', { x: (detail.articleGap.gap / detail.portfolioGap.mean_gap).toFixed(1) })}
                    </span>
                  )}
                </div>
              )}
            </Section>
          ) : detail.portfolioGap ? (
            <Section icon={Target} iconColor="text-purple-500" title={t('sku.section.marginGap')}>
              <p className="text-xs text-slate-400 italic">{t('sku.text.noGap', { pp: (detail.portfolioGap.mean_gap * 100).toFixed(1) })}</p>
            </Section>
          ) : null}

          {/* ── Section 10: Margin Rank (NEW) ── */}
          {detail.marginRank && (
            <motion.div variants={slideOverItemVariants} className="rounded-xl px-4 py-3 flex items-center gap-3" style={{ background: '#f8fafc' }}>
              <BarChart2 size={14} className="text-indigo-500" />
              <span className="text-xs text-slate-700">
                <span className="font-bold">{t('sku.rank.line', { rank: detail.marginRank.rank, total: detail.marginRank.total, group: detail.commodity_group })}</span>
                <span className="ml-1 font-bold text-[#0393da]">{t('sku.rank.top', { pct: 100 - detail.marginRank.percentile })}</span>
              </span>
            </motion.div>
          )}

          {/* ── Section 11: Related / Similar SKUs (NEW) ── */}
          {detail.relatedSkus.length > 0 && (
            <Section icon={Link2} iconColor="text-slate-500" title={t('sku.section.related')}>
              <div className="space-y-2">
                {detail.relatedSkus.map(rs => (
                  <div
                    key={rs.article_id}
                    className="flex items-center gap-3 text-xs py-1.5 px-2 rounded-lg hover:bg-[#f0f7ff] cursor-pointer transition-colors"
                    onClick={() => openSKUDetail(rs.article_id)}
                  >
                    <span className="font-mono text-[#0393da] font-medium w-20">{rs.article_id}</span>
                    <span className="text-slate-600 flex-1 truncate">{rs.description}</span>
                    <span className="font-semibold">{formatEUR(rs.revenue)}</span>
                    <span className={`font-bold ${rs.margin != null && rs.margin < MARGIN_FLOOR ? 'text-red-600' : 'text-slate-700'}`}>
                      {rs.margin != null ? `${(rs.margin * 100).toFixed(1)}%` : '—'}
                    </span>
                    <span className={`text-[10px] ${rs.marginTrend === 'improving' ? 'text-green-500' : rs.marginTrend === 'declining' ? 'text-red-500' : 'text-slate-400'}`}>
                      {rs.marginTrend === 'improving' ? '▲' : rs.marginTrend === 'declining' ? '▼' : '→'} {rs.marginTrend}
                    </span>
                    {rs.isVariant && <span className="text-[9px] bg-purple-50 text-purple-600 px-1.5 py-0.5 rounded font-bold">{t('sku.related.variant')}</span>}
                  </div>
                ))}
              </div>
            </Section>
          )}

          {/* ── Section 12: Enriched Pricing Recommendation ── */}
          <motion.div variants={slideOverItemVariants} className={`rounded-xl border p-4 ${
            enrichedRec?.action === 'Increase' ? 'bg-red-50/60 border-red-200' :
            enrichedRec?.action === 'Monitor' ? 'bg-amber-50/60 border-amber-200' :
            'bg-green-50/60 border-green-200'
          }`} style={{ boxShadow: '0 8px 32px rgba(26,26,46,0.04)' }}>
            <h4 className="text-sm font-bold text-slate-700 mb-3 flex items-center gap-2">
              <DollarSign size={14} style={{ color: colors.primary }} /> {t('sku.section.pricingRec')}
            </h4>
            {enrichedRec ? (
              <div className="space-y-3">
                <div className="grid grid-cols-4 gap-3 text-center">
                  <div>
                    <p className="text-[10px] text-slate-400">{t('sku.kpi.currentMargin')}</p>
                    <p className="text-xs font-bold text-slate-700">
                      {enrichedRec.currentMargin != null ? `${(enrichedRec.currentMargin * 100).toFixed(1)}%` : '—'}
                    </p>
                  </div>
                  <div>
                    <p className="text-[10px] text-slate-400">{t('sku.label.action')}</p>
                    <p className="text-xs font-bold"><PricingActionBadge action={enrichedRec.action} /></p>
                  </div>
                  <div>
                    <p className="text-[10px] text-slate-400">{t('sku.label.approval')}</p>
                    <p className={`text-xs font-bold ${
                      enrichedRec.approvalColor === 'green' ? 'text-green-700' :
                      enrichedRec.approvalColor === 'amber' ? 'text-amber-700' :
                      'text-red-700'
                    }`}>{enrichedRec.approvalLevel}</p>
                  </div>
                  <div>
                    <p className="text-[10px] text-slate-400">{t('sku.label.priority')}</p>
                    <p className="text-xs font-bold"><PriorityBadge priority={enrichedRec.priority} /></p>
                  </div>
                </div>
                <div className="flex items-center gap-3 pt-2 border-t border-slate-200/50">
                  <span className="text-[10px] text-slate-400">{t('sku.label.trajectory')}</span>
                  <span className={`inline-flex items-center gap-1 text-xs font-bold ${
                    enrichedRec.trajectoryDirection === 'improving' ? 'text-green-600' :
                    enrichedRec.trajectoryDirection === 'declining' ? 'text-red-600' :
                    'text-slate-500'
                  }`}>
                    {enrichedRec.trajectoryDirection === 'improving' ? <TrendingUp size={12} /> :
                     enrichedRec.trajectoryDirection === 'declining' ? <TrendingDown size={12} /> :
                     <Minus size={12} />}
                    {enrichedRec.trajectoryDirection === 'improving' ? t('sku.text.trajectory.improving') :
                     enrichedRec.trajectoryDirection === 'declining' ? t('sku.text.trajectory.declining') :
                     t('sku.text.trajectory.stable')}
                  </span>
                  {enrichedRec.marginGapPct > 0 && (
                    <span className="text-[10px] text-slate-500 ml-auto">
                      {t('sku.text.gapToTarget', { pp: enrichedRec.marginGapPct.toFixed(1) })}
                    </span>
                  )}
                </div>
              </div>
            ) : (
              <p className="text-xs text-slate-400 italic">{t('sku.text.noPricing')}</p>
            )}
          </motion.div>

          {/* ── Footer ── */}
          <motion.div variants={slideOverItemVariants} className="pt-3 border-t border-slate-100">
            <button
              onClick={() => { closeSlideOver(); navigate('/products'); }}
              className="flex items-center gap-2 text-xs font-medium text-[#0393da] hover:text-[#0270a8] transition-colors"
            >
              {t('sku.openInProducts')} <ArrowUpRight size={12} />
            </button>
          </motion.div>

        </motion.div>
      </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}
