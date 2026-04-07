import React, { useMemo, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'motion/react';
import {
  BarChart, Bar, ResponsiveContainer, XAxis, YAxis, Tooltip, CartesianGrid,
} from 'recharts';
import {
  X, TrendingUp, TrendingDown, Users, AlertTriangle, Target,
  Package, BarChart2, Shield, ArrowUpRight, ChevronLeft, ChevronRight, Clock, Copy,
} from 'lucide-react';
import { useUI } from '../context/UIContext';
import { getCustomerDetail } from '../utils/customerDetailEngine';
import { formatEUR, formatPct } from '../utils/formatters';
import { slideOverVariants, backdropVariants, slideOverSectionVariants, slideOverItemVariants } from '../utils/animations';
import KPICard from './shared/KPICard';
import { gradients, colors } from '../utils/designTokensV2';
import { track } from '../utils/tracker';

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

/* ── Risk tier badge ── */
function RiskTierBadge({ tier }) {
  const styles = {
    critical: 'bg-red-100 text-red-700 ring-red-200',
    high: 'bg-red-100 text-red-700 ring-red-200',
    medium: 'bg-amber-100 text-amber-700 ring-amber-200',
    low: 'bg-green-100 text-green-700 ring-green-200',
  };
  return (
    <span className={`inline-flex px-2 py-0.5 rounded-full text-[10px] font-bold ring-1 capitalize ${styles[tier] || styles.low}`}>
      {tier} Risk
    </span>
  );
}

/* ── Severity dot ── */
function SeverityDot({ severity }) {
  const c = severity === 'critical' ? 'bg-red-500' : severity === 'warning' ? 'bg-amber-400' : 'bg-green-400';
  return <span className={`w-2.5 h-2.5 rounded-full ${c} inline-block`} />;
}

export default function CustomerSlideOver() {
  const navigate = useNavigate();
  const { slideOver, closeSlideOver, setSidebarCollapsed, panelHistory, goBackPanel, openSKUDetail } = useUI();

  const isOpen = slideOver.type === 'customer';
  const customerId = slideOver.id;

  const detail = useMemo(() => {
    if (!isOpen || !customerId) return null;
    return getCustomerDetail(customerId);
  }, [isOpen, customerId]);

  useEffect(() => {
    if (isOpen) {
      setSidebarCollapsed(true);
      if (customerId) track.event?.('customer_drilldown', { customer_id: customerId });
    }
  }, [isOpen, setSidebarCollapsed, customerId]);

  useEffect(() => {
    if (!isOpen) return;
    const handler = (e) => { if (e.key === 'Escape') closeSlideOver(); };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [isOpen, closeSlideOver]);

  const hasBreadcrumb = panelHistory.length > 0;
  const prevPanel = hasBreadcrumb ? panelHistory[panelHistory.length - 1] : null;

  const handleCopyBrief = () => {
    if (!detail) return;
    const brief = `Customer ${detail.customer_id} · ${detail.segment} · ${formatEUR(detail.totalRevenue)} · ${(detail.avgMargin * 100).toFixed(1)}% margin · ${detail.winRate != null ? (detail.winRate * 100).toFixed(1) : '?'}% win rate${detail.customerGap ? ` · ${detail.customerGap.gap_pp.toFixed(1)}pp margin gap` : ''} · ${detail.overallRisk} risk`;
    navigator.clipboard?.writeText(brief);
  };

  return (
    <AnimatePresence>
      {isOpen && detail && (
        <>
          <motion.div
            variants={backdropVariants}
            initial="hidden" animate="visible" exit="exit"
            className="fixed inset-0 bg-black/30 z-40"
            onClick={closeSlideOver}
          />

          <motion.div
            variants={slideOverVariants}
            initial="hidden" animate="visible" exit="exit"
            className="fixed right-0 top-0 h-screen w-[680px] max-w-[90vw] shadow-2xl z-50 flex flex-col overflow-hidden"
            style={{ background: '#ffffff' }}
          >
        {/* ── Breadcrumb ── */}
        {hasBreadcrumb && (
          <div className="flex-shrink-0 px-6 py-2 bg-slate-50 border-b border-slate-100 flex items-center gap-2 text-xs">
            <button onClick={goBackPanel} className="flex items-center gap-1 text-[#0393da] hover:text-[#0270a8] font-medium transition-colors">
              <ChevronLeft size={14} />
              {prevPanel.type === 'sku' ? `SKU ${prevPanel.id}` : prevPanel.type === 'category' ? prevPanel.id : `Customer ${prevPanel.id}`}
            </button>
            <ChevronRight size={12} className="text-slate-300" />
            <span className="text-slate-500">Customer {detail.customer_id}</span>
          </div>
        )}

        {/* ── Header ── */}
        <div className="flex-shrink-0 px-6 py-4" style={{ background: '#ffffff', borderBottom: '1px solid #f0f1f3' }}>
          <div className="flex items-start justify-between">
            <div className="flex-1">
              <div className="flex items-center gap-2 flex-wrap">
                <span className="font-mono text-sm text-slate-500 bg-slate-100 px-2 py-0.5 rounded">{detail.customer_id}</span>
                <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-[#c1e8ff] text-[#004b72]">{detail.segment}</span>
                <RiskTierBadge tier={detail.riskTier} />
              </div>
              <h3 className="text-lg font-bold text-slate-800 mt-1 leading-tight">{detail.name}</h3>
              {detail.commodityMix.length > 0 && (
                <p className="text-xs text-slate-400 mt-0.5">
                  Primary: {detail.commodityMix.map(c => c.group).join(' + ')} mix
                </p>
              )}
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
              label="Revenue"
              value={formatEUR(detail.totalRevenue)}
              change={detail.yoyGrowth != null ? `${detail.yoyGrowth >= 0 ? '+' : ''}${detail.yoyGrowth.toFixed(1)}% YoY` : undefined}
              changeType={detail.yoyGrowth != null && detail.yoyGrowth < -20 ? 'negative' : detail.yoyGrowth >= 0 ? 'positive' : 'warning'}
              accentGradient={gradients.primary}
            />
            <KPICard
              compact
              label="DB2 Margin"
              value={`${(detail.avgMargin * 100).toFixed(1)}%`}
              change={detail.avgMargin < 0.55 ? 'Below avg' : undefined}
              changeType={detail.avgMargin < 0.50 ? 'negative' : detail.avgMargin < 0.55 ? 'warning' : 'positive'}
              accentGradient={detail.avgMargin < 0.50 ? gradients.tertiary : gradients.emerald}
            />
            <KPICard
              compact
              label="Win Rate"
              value={detail.winRate != null ? `${(detail.winRate * 100).toFixed(1)}%` : '—'}
              change={detail.totalQuotes > 0 ? `${detail.quotePerformance.won}/${detail.totalQuotes}` : undefined}
              changeType={detail.winRate != null && detail.winRate < 0.3 ? 'negative' : detail.winRate < 0.5 ? 'warning' : 'positive'}
              accentGradient={detail.winRate != null && detail.winRate < 0.3 ? gradients.tertiary : gradients.navy}
            />
            <KPICard
              compact
              label="Orders"
              value={detail.totalInvoices}
              changeType="neutral"
              accentGradient={gradients.navy}
            />
          </motion.div>

          {/* ── Section 2: Revenue & Margin by Year ── */}
          {detail.revenueByYear.length > 0 && (
            <Section icon={BarChart2} iconColor="text-[#0393da]" title="Revenue & Margin by Year">
              <div className="space-y-2">
                {detail.revenueByYear.map((y, i) => {
                  const prev = i > 0 ? detail.revenueByYear[i - 1] : null;
                  const revChange = prev ? y.revenue - prev.revenue : null;
                  const marginChange = prev && y.margin != null && prev.margin != null ? (y.margin - prev.margin) : null;
                  return (
                    <div key={y.year} className="flex items-center gap-3 text-xs">
                      <span className="font-bold text-slate-700 w-10">{y.year}:</span>
                      <span className="font-semibold w-16">{formatEUR(y.revenue)}</span>
                      <span className="w-12">{y.margin != null ? `${(y.margin * 100).toFixed(1)}%` : '—'}</span>
                      {revChange != null && (
                        <span className={`text-[10px] ${revChange >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                          ({revChange >= 0 ? '+' : ''}{formatEUR(revChange)} {revChange >= 0 ? '✓' : '⚠'})
                        </span>
                      )}
                      {marginChange != null && (
                        <span className={`text-[10px] ${marginChange >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                          ({marginChange >= 0 ? '+' : ''}{(marginChange * 100).toFixed(1)}pp)
                        </span>
                      )}
                    </div>
                  );
                })}
              </div>
              {detail.yoyGrowth != null && detail.yoyGrowth < -30 && (
                <div className="mt-3 p-2.5 bg-red-50 rounded-lg text-[11px] text-red-700 flex items-start gap-2">
                  <AlertTriangle size={12} className="mt-0.5 flex-shrink-0" />
                  <span>Revenue collapsed {Math.abs(detail.yoyGrowth).toFixed(0)}% YoY. Flag for immediate review.</span>
                </div>
              )}
            </Section>
          )}

          {/* ── Section 3: Order Recency Banner ── */}
          {detail.isInactive ? (
            <motion.div variants={slideOverItemVariants} className="rounded-xl p-4 bg-red-50 border border-red-200">
              <div className="flex items-start gap-3">
                <AlertTriangle size={18} className="text-red-500 mt-0.5 flex-shrink-0" />
                <div>
                  <p className="text-sm font-bold text-red-800">Inactivity Alert</p>
                  <p className="text-xs text-red-700 mt-1">
                    Last order: {detail.lastOrderDate || 'unknown'} — no orders in {detail.monthsSinceLastOrder} months
                  </p>
                  <p className="text-xs text-red-600 mt-0.5">
                    Previously: {detail.totalInvoices} total invoices across {detail.revenueByYear.length} years
                  </p>
                </div>
              </div>
            </motion.div>
          ) : detail.lastOrderDate ? (
            <motion.div variants={slideOverItemVariants} className="rounded-xl px-4 py-3 flex items-center gap-3" style={{ background: '#f8fafc' }}>
              <Clock size={14} className="text-green-500" />
              <span className="text-xs text-slate-700">
                Last order: <span className="font-bold">{detail.lastOrderDate}</span>
                {detail.avgOrdersPerMonth > 0 && <span className="ml-2">· {detail.avgOrdersPerMonth} orders/month</span>}
              </span>
            </motion.div>
          ) : null}

          {/* ── Section 4: Quote Performance ── */}
          <Section icon={Target} iconColor="text-indigo-500" title="Quote Performance">
            {detail.totalQuotes > 0 ? (
              <div className="space-y-3">
                <div className="grid grid-cols-3 gap-3 text-center">
                  <div>
                    <p className="text-[10px] text-slate-400">Won</p>
                    <p className="text-sm font-bold text-green-600">{detail.quotePerformance.won}</p>
                  </div>
                  <div>
                    <p className="text-[10px] text-slate-400">Lost</p>
                    <p className="text-sm font-bold text-red-600">{detail.quotePerformance.lost}</p>
                  </div>
                  <div>
                    <p className="text-[10px] text-slate-400">Win Rate</p>
                    <p className={`text-sm font-bold ${detail.winRate < 0.3 ? 'text-red-600' : detail.winRate < 0.5 ? 'text-amber-600' : 'text-green-600'}`}>
                      {(detail.winRate * 100).toFixed(1)}%
                    </p>
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-3 text-center pt-2 border-t border-slate-100">
                  <div>
                    <p className="text-[10px] text-slate-400">Lost Revenue</p>
                    <p className="text-xs font-bold text-red-600">{formatEUR(detail.quotePerformance.lostRevenue)}</p>
                  </div>
                  <div>
                    <p className="text-[10px] text-slate-400">Won vs Lost Margin</p>
                    <p className="text-xs text-slate-700">
                      <span className="font-bold text-green-600">{detail.quotePerformance.wonAvgMargin != null ? `${(detail.quotePerformance.wonAvgMargin * 100).toFixed(1)}%` : '—'}</span>
                      {' vs '}
                      <span className="font-bold text-red-600">{detail.quotePerformance.lostAvgMargin != null ? `${(detail.quotePerformance.lostAvgMargin * 100).toFixed(1)}%` : '—'}</span>
                    </p>
                  </div>
                </div>
                {detail.quotePerformance.wonAvgMargin != null && detail.quotePerformance.lostAvgMargin != null && (
                  <p className="text-[11px] text-slate-500 italic pt-2 border-t border-slate-100">
                    {detail.winRate < 0.3
                      ? `Losing on competitive deals at ${(detail.quotePerformance.lostAvgMargin * 100).toFixed(1)}% margin — either competitor is undercutting or relationship needs attention.`
                      : detail.quotePerformance.wonAvgMargin - detail.quotePerformance.lostAvgMargin > 0.05
                      ? `Won quotes margin ${((detail.quotePerformance.wonAvgMargin - detail.quotePerformance.lostAvgMargin) * 100).toFixed(1)}pp above lost — pricing strategy is working for the right deals.`
                      : 'Win/loss margin differential is tight — pricing likely not the main factor in lost deals.'
                    }
                  </p>
                )}
              </div>
            ) : (
              <p className="text-xs text-slate-400 italic">No quote data available for this customer.</p>
            )}
          </Section>

          {/* ── Section 5: Product Mix ── */}
          {detail.uniqueArticles > 0 && (
            <Section icon={Package} iconColor="text-amber-500" title={`Product Mix (${detail.uniqueArticles} unique articles)`}>
              {detail.commodityMix.length > 0 && (
                <div className="space-y-2 mb-3">
                  {detail.commodityMix.map(cm => (
                    <div key={cm.group} className="flex items-center gap-3 text-xs">
                      <span className="font-bold text-[#004b72] bg-[#c1e8ff] px-2 py-0.5 rounded text-[10px] w-14 text-center">{cm.group}</span>
                      <span className="text-slate-600">{cm.articles} articles</span>
                      <span className="font-semibold">{formatEUR(cm.revenue)}</span>
                      <span className="text-slate-400">({(cm.share * 100).toFixed(0)}%)</span>
                      <span className={`font-bold ${cm.avgMargin != null && cm.avgMargin < 0.50 ? 'text-red-600' : 'text-slate-700'}`}>
                        Avg: {cm.avgMargin != null ? `${(cm.avgMargin * 100).toFixed(1)}%` : '—'}
                      </span>
                    </div>
                  ))}
                </div>
              )}
              {/* Top articles */}
              <div className="pt-3 border-t border-slate-100">
                <p className="text-[10px] text-slate-400 uppercase font-bold mb-2">Top Articles</p>
                {detail.articles.slice(0, 3).map(a => (
                  <div
                    key={a.article_id}
                    className="flex items-center gap-3 text-xs py-1.5 px-2 rounded-lg hover:bg-[#f0f7ff] cursor-pointer transition-colors"
                    onClick={() => openSKUDetail(a.article_id)}
                  >
                    <span className="font-mono text-[#0393da] font-medium w-20">{a.article_id}</span>
                    <span className="font-semibold">{formatEUR(a.revenue)}</span>
                    <span className={`font-bold ${a.avgMargin != null && a.avgMargin < 0.50 ? 'text-red-600' : 'text-slate-700'}`}>
                      {a.avgMargin != null ? `${(a.avgMargin * 100).toFixed(1)}%` : '—'}
                    </span>
                    <span className="text-slate-400 flex-1 truncate">{a.description}</span>
                    <ChevronRight size={10} className="text-slate-300" />
                  </div>
                ))}
              </div>
              {/* Attribution note */}
              {detail.commodityMix.length >= 2 && (() => {
                const lowest = detail.commodityMix[detail.commodityMix.length - 1];
                const highest = detail.commodityMix[0];
                if (lowest.avgMargin != null && highest.avgMargin != null && highest.avgMargin - lowest.avgMargin > 0.1) {
                  return (
                    <p className="text-[11px] text-slate-500 italic mt-3 pt-3 border-t border-slate-100">
                      {lowest.group} portion ({(lowest.share * 100).toFixed(0)}% of orders) drags average margin down — {lowest.group} avg {(lowest.avgMargin * 100).toFixed(1)}% vs {highest.group} {(highest.avgMargin * 100).toFixed(1)}%.
                    </p>
                  );
                }
                return null;
              })()}
            </Section>
          )}

          {/* ── Section 6: Margin Gap — THIS CUSTOMER ── */}
          {detail.customerGap && (
            <Section icon={Target} iconColor="text-purple-500" title="Margin Gap (this customer)">
              <div className="grid grid-cols-3 gap-4 text-center">
                <div>
                  <p className="text-[10px] text-slate-400">Quoted</p>
                  <p className="text-sm font-bold text-slate-700">{(detail.customerGap.quoted_margin * 100).toFixed(1)}%</p>
                </div>
                <div>
                  <p className="text-[10px] text-slate-400">Actual</p>
                  <p className="text-sm font-bold text-slate-700">{(detail.customerGap.actual_margin * 100).toFixed(1)}%</p>
                </div>
                <div>
                  <p className="text-[10px] text-slate-400">Gap</p>
                  <p className={`text-sm font-bold ${detail.customerGap.gap_pp > 10 ? 'text-red-600' : detail.customerGap.gap_pp > 5 ? 'text-amber-600' : 'text-green-600'}`}>
                    {detail.customerGap.gap_pp.toFixed(1)}pp
                  </p>
                </div>
              </div>
              {detail.portfolioGap && (
                <div className="mt-2 pt-2 border-t border-slate-100 text-center text-[10px] text-slate-400">
                  vs portfolio avg gap: <span className="font-bold text-slate-600">{(detail.portfolioGap.mean_gap * 100).toFixed(1)}pp</span>
                  {detail.customerGap.gap_pp > detail.portfolioGap.mean_gap * 100 * 3 && (
                    <span className="text-red-500 font-bold ml-1">
                      — {(detail.customerGap.gap_pp / (detail.portfolioGap.mean_gap * 100)).toFixed(0)}× worse than average
                    </span>
                  )}
                </div>
              )}
              {detail.customerGap.impact_eur > 0 && (
                <p className="text-[11px] text-slate-500 italic mt-2 pt-2 border-t border-slate-100">
                  Impact: {formatEUR(detail.customerGap.impact_eur)} margin leakage.
                  {detail.commodityMix.length >= 2 && ` Gap likely driven by ${detail.commodityMix[detail.commodityMix.length - 1].group} product mix.`}
                </p>
              )}
            </Section>
          )}

          {/* ── Section 7: Comparable Customers ── */}
          {detail.comparables.length > 0 && (
            <Section icon={Users} iconColor="text-slate-500" title={`Similar Customers (${detail.segment}, ${formatEUR(detail.totalRevenue * 0.5)}-${formatEUR(detail.totalRevenue * 1.5)})`}>
              <div className="space-y-2">
                {detail.comparables.map(c => (
                  <div key={c.customer_id} className="flex items-center gap-3 text-xs py-1.5 px-2 rounded-lg bg-slate-50">
                    <span className="font-mono text-slate-600 w-16">{c.customer_id}</span>
                    <span className="font-semibold">{formatEUR(c.revenue)}</span>
                    <span className="font-bold text-slate-700">{(c.margin * 100).toFixed(1)}%</span>
                    <span className="text-slate-500">Win: {c.winRate != null ? `${(c.winRate * 100).toFixed(0)}%` : '—'}</span>
                  </div>
                ))}
              </div>
              <div className="mt-3 pt-3 border-t border-slate-100 text-xs text-slate-600">
                <span className="font-bold">This customer:</span> {(detail.avgMargin * 100).toFixed(1)}% margin, {detail.winRate != null ? `${(detail.winRate * 100).toFixed(1)}%` : '—'} win rate
                {detail.peerAvgMargin != null && (
                  <div className="mt-1">
                    <span className="font-bold">vs peer avg:</span>{' '}
                    <span className={detail.avgMargin < detail.peerAvgMargin ? 'text-red-600 font-bold' : 'text-green-600 font-bold'}>
                      {((detail.avgMargin - detail.peerAvgMargin) * 100).toFixed(1)}pp margin
                    </span>
                    {detail.peerAvgWinRate != null && detail.winRate != null && (
                      <span className={`ml-2 ${detail.winRate < detail.peerAvgWinRate ? 'text-red-600 font-bold' : 'text-green-600 font-bold'}`}>
                        {((detail.winRate - detail.peerAvgWinRate) * 100).toFixed(1)}pp win rate
                      </span>
                    )}
                  </div>
                )}
              </div>
            </Section>
          )}

          {/* ── Section 8: Risk Signals ── */}
          {detail.riskSignals.length > 0 && (
            <Section icon={Shield} iconColor="text-red-500" title="Risk Assessment">
              <div className="space-y-2">
                {detail.riskSignals.map((sig, i) => (
                  <div key={i} className="flex items-center gap-3 text-xs">
                    <SeverityDot severity={sig.severity} />
                    <span className="text-slate-600 flex-1">{sig.label}</span>
                    <span className="font-bold text-slate-700">{sig.value}</span>
                  </div>
                ))}
              </div>
              <div className="mt-3 pt-3 border-t border-slate-100 flex items-center gap-3">
                <span className={`text-xs font-bold px-3 py-1 rounded-full ${
                  detail.overallRisk === 'HIGH' ? 'bg-red-100 text-red-700' :
                  detail.overallRisk === 'MEDIUM' ? 'bg-amber-100 text-amber-700' :
                  'bg-green-100 text-green-700'
                }`}>
                  Overall: {detail.overallRisk} RISK
                </span>
                <button
                  onClick={handleCopyBrief}
                  className="flex items-center gap-1 text-xs text-[#0393da] hover:text-[#0270a8] font-medium transition-colors ml-auto"
                >
                  <Copy size={12} /> Copy Brief
                </button>
              </div>
            </Section>
          )}

          {/* ── Footer ── */}
          <motion.div variants={slideOverItemVariants} className="pt-3 border-t border-slate-100">
            <button
              onClick={() => { closeSlideOver(); navigate('/customers'); }}
              className="flex items-center gap-2 text-xs font-medium text-[#0393da] hover:text-[#0270a8] transition-colors"
            >
              Open in Customers <ArrowUpRight size={12} />
            </button>
          </motion.div>

        </motion.div>
      </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}
