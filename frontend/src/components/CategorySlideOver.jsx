import React, { useMemo, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import {
  BarChart, Bar, Cell,
  ResponsiveContainer, XAxis, YAxis, Tooltip, CartesianGrid, ReferenceLine,
} from 'recharts';
import { X, Package, AlertTriangle, ShieldCheck, TrendingUp } from 'lucide-react';
import { useUI } from '../context/UIContext';
import { useLanguage } from '../context/LanguageContext';
import { getCategoryDetail } from '../utils/skuDetailEngine';
import { formatEUR } from '../utils/formatters';
import { slideOverVariants, backdropVariants, slideOverSectionVariants, slideOverItemVariants } from '../utils/animations';
import { track } from '../utils/tracker';

const MARGIN_FLOOR = 0.50;

export default function CategorySlideOver() {
  const { slideOver, closeSlideOver, setSidebarCollapsed, openSKUDetail } = useUI();
  const { t } = useLanguage();

  const isOpen = slideOver.type === 'category';
  const categoryName = slideOver.id;

  const detail = useMemo(() => {
    if (!isOpen || !categoryName) return null;
    return getCategoryDetail(categoryName);
  }, [isOpen, categoryName]);

  useEffect(() => {
    if (isOpen) {
      setSidebarCollapsed(true);
      if (categoryName) track.categoryDrilldown(categoryName);
    }
  }, [isOpen, setSidebarCollapsed, categoryName]);

  useEffect(() => {
    if (!isOpen) return;
    const handler = (e) => { if (e.key === 'Escape') closeSlideOver(); };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [isOpen, closeSlideOver]);

  return (
    <AnimatePresence>
      {isOpen && detail && (
        <>
          <motion.div
            variants={backdropVariants}
            initial="hidden"
            animate="visible"
            exit="exit"
            className="fixed inset-0 bg-black/30 z-40"
            onClick={closeSlideOver}
          />
          <motion.div
            variants={slideOverVariants}
            initial="hidden"
            animate="visible"
            exit="exit"
            className="fixed right-0 top-0 h-screen w-[680px] max-w-[90vw] shadow-2xl z-50 flex flex-col overflow-hidden"
            style={{ background: '#ffffff' }}
          >

        {/* Header */}
        <div className="flex-shrink-0 px-6 py-4" style={{ background: '#ffffff', borderBottom: '1px solid #f8fafc' }}>
          <div className="flex items-center justify-between">
            <div>
              <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-purple-50 text-purple-600 uppercase">{detail.commodity_group}</span>
              <h3 className="text-lg font-bold text-slate-800 mt-1">{t('category.title', { group: detail.commodity_group.replace(/_/g, ' ') })}</h3>
              <p className="text-sm text-slate-500">{t('category.subtitle', { count: detail.skuCount, atRisk: detail.atRiskCount, below: detail.belowFloorCount })}</p>
            </div>
            <button onClick={closeSlideOver} className="p-2 hover:bg-slate-100 rounded-lg transition-colors">
              <X size={20} className="text-slate-400" />
            </button>
          </div>
        </div>

        {/* Content */}
        <motion.div variants={slideOverSectionVariants} initial="hidden" animate="visible" className="flex-1 overflow-y-auto px-6 py-5 space-y-5">

          {/* KPIs */}
          <motion.div variants={slideOverItemVariants} className="grid grid-cols-4 gap-3">
            {[
              { label: t('category.kpi.revenue'), value: formatEUR(detail.totalRevenue), accent: 'linear-gradient(to right, #0393da, #c1e8ff)' },
              { label: t('category.kpi.avgMargin'), value: `${(detail.avgMargin * 100).toFixed(1)}%`, accent: detail.avgMargin < MARGIN_FLOOR ? 'linear-gradient(to right, #ef4444, #fca5a5)' : 'linear-gradient(to right, #22c55e, #86efac)' },
              { label: t('category.kpi.atRisk'), value: `${detail.atRiskCount} / ${detail.skuCount}`, accent: 'linear-gradient(to right, #f97316, #fdba74)' },
              { label: t('category.kpi.recovery'), value: formatEUR(detail.totalRecovery), sub: t('category.kpi.recovery.sub', { n: detail.pricingActions }), accent: 'linear-gradient(to right, #22c55e, #86efac)' },
            ].map((kpi) => (
              <div key={kpi.label} className="relative overflow-hidden rounded-xl p-3.5" style={{ background: '#ffffff', boxShadow: '0 2px 12px rgba(26,26,46,0.06)' }}>
                <div className="absolute top-0 left-0 w-full h-1" style={{ background: kpi.accent }} />
                <p className="text-[10px] font-semibold uppercase tracking-wider" style={{ color: '#737373' }}>{kpi.label}</p>
                <p className="text-lg font-bold mt-1" style={{ fontFamily: "'Inter', sans-serif", color: '#1a1a2e' }}>{kpi.value}</p>
                {kpi.sub && <p className="text-[10px] mt-0.5" style={{ color: '#a3a3a3' }}>{kpi.sub}</p>}
              </div>
            ))}
          </motion.div>

          {/* Revenue by Year */}
          <motion.div variants={slideOverItemVariants} className="rounded-xl p-4" style={{ background: '#ffffff', boxShadow: '0 8px 32px rgba(26,26,46,0.04)' }}>
            <h4 className="text-sm font-bold text-slate-700 mb-3">{t('category.section.revByYear')}</h4>
            <div className="h-36">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={detail.revenueByYear}>
                  <CartesianGrid stroke="#f3f4f6" />
                  <XAxis dataKey="year" tick={{ fontSize: 11 }} tickLine={false} />
                  <YAxis tick={{ fontSize: 10 }} axisLine={false} tickLine={false} tickFormatter={(v) => `€${(v / 1000).toFixed(0)}K`} />
                  <Tooltip formatter={(v) => formatEUR(v)} />
                  <defs>
                    <linearGradient id="catBarGrad" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="#0393da" />
                      <stop offset="100%" stopColor="#0393da" stopOpacity={0.4} />
                    </linearGradient>
                  </defs>
                  <Bar dataKey="revenue" fill="url(#catBarGrad)" radius={[6, 6, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </motion.div>

          {/* Revenue by SKU (top 10 horizontal bars) */}
          <motion.div variants={slideOverItemVariants} className="rounded-xl p-4" style={{ background: '#ffffff', boxShadow: '0 8px 32px rgba(26,26,46,0.04)' }}>
            <h4 className="text-sm font-bold text-slate-700 mb-3">{t('category.section.topArticles')}</h4>
            <div className="space-y-2">
              {detail.skuBreakdown.slice(0, 10).map((s) => {
                const pct = (s.revenue / detail.skuBreakdown[0].revenue) * 100;
                return (
                  <button
                    key={s.article_id}
                    onClick={() => openSKUDetail(s.article_id)}
                    className="w-full text-left group hover:bg-[#f8f9fa] rounded-lg p-1.5 transition-colors"
                  >
                    <div className="flex items-center justify-between text-xs mb-0.5">
                      <span className="font-mono text-slate-500 group-hover:text-[#0393da]">{s.article_id}</span>
                      <div className="flex items-center gap-2">
                        <span className={`font-bold ${s.margin < MARGIN_FLOOR ? 'text-red-500' : 'text-slate-700'}`}>
                          {(s.margin * 100).toFixed(1)}%
                        </span>
                        <span className="font-semibold">{formatEUR(s.revenue)}</span>
                      </div>
                    </div>
                    <div className="w-full h-2.5 bg-slate-100 rounded-full overflow-hidden">
                      <div
                        className={`h-full rounded-full ${s.isAtRisk ? 'bg-red-400' : 'bg-[#0393da]'}`}
                        style={{ width: `${pct}%` }}
                      />
                    </div>
                  </button>
                );
              })}
            </div>
          </motion.div>

          {/* Problem SKUs */}
          {detail.skuBreakdown.filter(s => s.isAtRisk).length > 0 && (
            <motion.div variants={slideOverItemVariants} className="bg-red-50/30 rounded-lg border border-red-200 p-4">
              <h4 className="text-sm font-bold text-red-700 mb-3 flex items-center gap-2">
                <AlertTriangle size={14} /> {t('category.section.problem', { n: detail.skuBreakdown.filter(s => s.isAtRisk).length })}
              </h4>
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs">
                  <thead>
                    <tr className="text-slate-400 uppercase text-[9px] font-bold border-b border-red-200">
                      <th className="py-2 pr-3">{t('category.col.articleId')}</th>
                      <th className="py-2 pr-3">{t('category.col.description')}</th>
                      <th className="py-2 pr-3 text-right">{t('category.col.margin')}</th>
                      <th className="py-2 pr-3 text-right">{t('category.col.revenue')}</th>
                      <th className="py-2">{t('category.col.trend')}</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-red-100">
                    {detail.skuBreakdown.filter(s => s.isAtRisk).map((s) => (
                      <tr
                        key={s.article_id}
                        onClick={() => openSKUDetail(s.article_id)}
                        className="hover:bg-red-100/50 cursor-pointer"
                      >
                        <td className="py-2 pr-3 font-mono text-slate-600">{s.article_id}</td>
                        <td className="py-2 pr-3 max-w-[200px] truncate">{s.description}</td>
                        <td className="py-2 pr-3 text-right font-bold text-red-600">{(s.margin * 100).toFixed(1)}%</td>
                        <td className="py-2 pr-3 text-right">{formatEUR(s.revenue)}</td>
                        <td className="py-2">
                          <span className={`px-1.5 py-0.5 rounded text-[9px] font-bold ${
                            s.trend === 'declining' ? 'bg-red-100 text-red-700' :
                            s.trend === 'improving' ? 'bg-green-100 text-green-700' :
                            'bg-slate-100 text-slate-500'
                          }`}>{s.trend === 'declining' ? t('category.trend.declining') : s.trend === 'improving' ? t('category.trend.improving') : t('category.trend.stable')}</span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </motion.div>
          )}

          {/* Commodity Group Margin Forecast */}
          {detail.forecast && (
            <motion.div variants={slideOverItemVariants} className="rounded-xl p-4" style={{ background: '#ffffff', boxShadow: '0 8px 32px rgba(26,26,46,0.04)' }}>
              <h4 className="text-sm font-bold text-slate-700 mb-3 flex items-center gap-2">
                <TrendingUp size={14} className="text-[#0393da]" /> {t('category.section.forecast')}
              </h4>
              <div className="grid grid-cols-4 gap-3 text-center text-xs">
                <div>
                  <p className="text-[10px] text-slate-400">{t('category.label.current')}</p>
                  <p className="text-sm font-bold">{((detail.forecast.current_margin || 0) * 100).toFixed(1)}%</p>
                </div>
                <div>
                  <p className="text-[10px] text-slate-400">{t('category.label.3m')}</p>
                  <p className="text-sm font-bold">{((detail.forecast.forecast_3m || 0) * 100).toFixed(1)}%</p>
                </div>
                <div>
                  <p className="text-[10px] text-slate-400">{t('category.label.6m')}</p>
                  <p className="text-sm font-bold">{((detail.forecast.forecast_6m || 0) * 100).toFixed(1)}%</p>
                </div>
                <div>
                  <p className="text-[10px] text-slate-400">{t('category.label.12m')}</p>
                  <p className="text-sm font-bold">{((detail.forecast.forecast_12m || 0) * 100).toFixed(1)}%</p>
                </div>
              </div>
            </motion.div>
          )}

          {/* Governance */}
          {detail.governance && (
            <motion.div variants={slideOverItemVariants} className="rounded-xl p-4" style={{ background: '#ffffff', boxShadow: '0 8px 32px rgba(26,26,46,0.04)' }}>
              <h4 className="text-sm font-bold text-slate-700 mb-2 flex items-center gap-2">
                <ShieldCheck size={14} className="text-green-500" /> {t('category.section.governance')}
              </h4>
              <div className="flex items-center gap-6 text-sm">
                <div>
                  <span className="text-slate-500">{t('category.label.target')} </span>
                  <span className="font-bold">{((detail.governance.target_margin || 0) * 100).toFixed(0)}%</span>
                </div>
                {detail.governance.max_discount != null && (
                  <div>
                    <span className="text-slate-500">{t('category.label.maxDiscount')} </span>
                    <span className="font-bold">{((detail.governance.max_discount || 0) * 100).toFixed(0)}%</span>
                  </div>
                )}
                {detail.governance.review_frequency && (
                  <div>
                    <span className="text-slate-500">{t('category.label.review')} </span>
                    <span className="font-bold">{detail.governance.review_frequency}</span>
                  </div>
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
