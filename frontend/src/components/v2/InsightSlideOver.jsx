import { motion, AnimatePresence } from 'motion/react';
import { X } from 'lucide-react';
import {
  BarChart, Bar, ResponsiveContainer, XAxis, YAxis, Tooltip, CartesianGrid,
  LineChart, Line,
} from 'recharts';
import { slideOverVariants, backdropVariants, slideOverSectionVariants, slideOverItemVariants } from '../../utils/animations';
import { colors, shadows, radius } from '../../utils/designTokensV2';
import { formatEUR } from '../../utils/formatters';
import { useLanguage } from '../../context/LanguageContext';

const badgeColors = {
  green: { bg: '#f0fdf4', text: '#16a34a' },
  red: { bg: '#fef2f2', text: '#dc2626' },
  amber: { bg: '#fffbeb', text: '#d97706' },
  orange: { bg: '#fff7ed', text: '#ea580c' },
  blue: { bg: '#eff6ff', text: '#2563eb' },
};

export default function InsightSlideOver({ insight, onClose }) {
  const { t } = useLanguage();
  if (!insight) return null;
  const d = insight.detail;
  const badge = badgeColors[insight.badgeColor] || badgeColors.blue;

  return (
    <AnimatePresence>
      {insight && (
        <>
          {/* Backdrop */}
          <motion.div
            variants={backdropVariants}
            initial="hidden"
            animate="visible"
            exit="exit"
            className="fixed inset-0 bg-black/30 z-40"
            onClick={onClose}
          />

          {/* Panel */}
          <motion.div
            variants={slideOverVariants}
            initial="hidden"
            animate="visible"
            exit="exit"
            className="fixed right-0 top-0 h-screen w-[640px] max-w-[90vw] z-50 flex flex-col overflow-hidden"
            style={{ background: colors.surface, boxShadow: '0 0 60px rgba(26,26,46,0.12)' }}
          >
            {/* Header */}
            <div className="flex-shrink-0 px-6 py-5 flex items-start justify-between" style={{ borderBottom: '1px solid #f8fafc' }}>
              <div>
                <span
                  className="px-2.5 py-1 rounded text-[10px] font-bold uppercase tracking-wider"
                  style={{ background: badge.bg, color: badge.text }}
                >
                  {insight.type}
                </span>
                <h2 className="text-lg font-bold mt-2" style={{ fontFamily: "'Manrope', sans-serif", color: colors.darkNavy }}>
                  {d.title}
                </h2>
                {d.subtitle && (
                  <p className="text-xs mt-1" style={{ color: '#737373' }}>{d.subtitle}</p>
                )}
              </div>
              <button
                onClick={onClose}
                className="p-2 rounded-lg hover:bg-[#f8f9fa] transition-colors"
                style={{ color: '#a3a3a3' }}
              >
                <X size={20} />
              </button>
            </div>

            {/* Scrollable Content */}
            <motion.div
              className="flex-1 overflow-y-auto px-6 py-5 space-y-6"
              variants={slideOverSectionVariants}
              initial="hidden"
              animate="visible"
            >
              {/* KPI Metrics Row */}
              {d.metrics && d.metrics.length > 0 && (
                <motion.div variants={slideOverItemVariants} className="grid grid-cols-3 gap-3">
                  {d.metrics.map((m, i) => (
                    <div
                      key={i}
                      className="relative overflow-hidden p-4"
                      style={{ background: '#f8f9fa', borderRadius: '1rem' }}
                    >
                      <p className="text-[10px] font-semibold uppercase tracking-wider" style={{ color: '#a3a3a3' }}>
                        {m.label}
                      </p>
                      <p className="text-xl font-bold mt-1" style={{ color: m.color || colors.darkNavy }}>
                        {m.value}
                      </p>
                      {m.change && (
                        <p className="text-[10px] font-medium mt-0.5" style={{ color: '#737373' }}>{m.change}</p>
                      )}
                    </div>
                  ))}
                </motion.div>
              )}

              {/* Chart */}
              {d.chartData && d.chartData.length > 0 && (
                <motion.div
                  variants={slideOverItemVariants}
                  className="p-4"
                  style={{ background: '#f8f9fa', borderRadius: '1rem' }}
                >
                  <p className="text-xs font-bold uppercase tracking-wider mb-4" style={{ color: '#737373' }}>
                    {d.chartTitle || t('insight.slideOver.analysis')}
                  </p>
                  <div className="h-48">
                    <ResponsiveContainer width="100%" height="100%">
                      {d.chartType === 'line' ? (
                        <LineChart data={d.chartData}>
                          <CartesianGrid stroke="#f0f0f0" vertical={false} />
                          <XAxis dataKey="name" tick={{ fontSize: 10, fill: '#94a3b8' }} tickLine={false} axisLine={false} />
                          <YAxis tickFormatter={(v) => formatEUR(v)} tick={{ fontSize: 10, fill: '#94a3b8' }} width={55} axisLine={false} tickLine={false} />
                          <Tooltip formatter={(v) => formatEUR(v)} />
                          <Line type="monotone" dataKey="actual" stroke={colors.primary} strokeWidth={2} dot={{ r: 3, fill: '#fff', stroke: colors.primary, strokeWidth: 2 }} />
                          {d.chartData[0]?.forecast != null && (
                            <Line type="monotone" dataKey="forecast" stroke="#8b5cf6" strokeWidth={2} strokeDasharray="6 3" dot={false} />
                          )}
                        </LineChart>
                      ) : (
                        <BarChart data={d.chartData} layout={d.horizontal ? 'vertical' : 'horizontal'}>
                          <CartesianGrid stroke="#f0f0f0" vertical={!d.horizontal} horizontal={d.horizontal} />
                          {d.horizontal ? (
                            <>
                              <YAxis dataKey="name" type="category" tick={{ fontSize: 10, fill: '#94a3b8' }} width={120} axisLine={false} tickLine={false} />
                              <XAxis type="number" tickFormatter={(v) => typeof v === 'number' && v > 1000 ? formatEUR(v) : v} tick={{ fontSize: 10, fill: '#94a3b8' }} axisLine={false} tickLine={false} />
                            </>
                          ) : (
                            <>
                              <XAxis dataKey="name" tick={{ fontSize: 10, fill: '#94a3b8' }} tickLine={false} axisLine={false} />
                              <YAxis tick={{ fontSize: 10, fill: '#94a3b8' }} width={45} axisLine={false} tickLine={false} />
                            </>
                          )}
                          <Tooltip formatter={(v) => typeof v === 'number' && v > 1000 ? formatEUR(v) : v} />
                          <Bar
                            dataKey="value"
                            fill={d.barColor || colors.primary}
                            radius={d.horizontal ? [0, 6, 6, 0] : [6, 6, 0, 0]}
                          />
                        </BarChart>
                      )}
                    </ResponsiveContainer>
                  </div>
                </motion.div>
              )}

              {/* Recommended Actions */}
              {d.actions && d.actions.length > 0 && (
                <motion.div variants={slideOverItemVariants}>
                  <p className="text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-3">
                    {t('insight.slideOver.recommendedActions')}
                  </p>
                  <ol className="space-y-2">
                    {d.actions.map((action, j) => (
                      <li key={j} className="flex gap-3 text-sm" style={{ color: colors.darkNavy }}>
                        <span
                          className="flex-shrink-0 w-5 h-5 rounded-full flex items-center justify-center text-[10px] font-bold text-white"
                          style={{ background: colors.primary }}
                        >
                          {j + 1}
                        </span>
                        {action}
                      </li>
                    ))}
                  </ol>
                </motion.div>
              )}

              {/* Affected Items Table */}
              {d.dataRows && d.dataRows.length > 0 && (
                <motion.div variants={slideOverItemVariants}>
                  <p className="text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-3">
                    {d.tableTitle || t('insight.slideOver.affectedItems')}
                  </p>
                  <div className="overflow-x-auto rounded-lg" style={{ background: '#f8f9fa' }}>
                    <table className="w-full text-left text-xs">
                      <thead>
                        <tr>
                          {d.dataColumns.map((col) => (
                            <th key={col.key} className="px-4 py-3 text-[9px] font-bold uppercase tracking-widest" style={{ color: '#a3a3a3' }}>
                              {col.label}
                            </th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {d.dataRows.map((row, i) => (
                          <tr key={i} style={{ borderTop: '1px solid #f0f0f0' }}>
                            {d.dataColumns.map((col) => (
                              <td key={col.key} className="px-4 py-3" style={{ color: colors.darkNavy }}>
                                {col.render ? col.render(row[col.key], row) : row[col.key]}
                              </td>
                            ))}
                          </tr>
                        ))}
                      </tbody>
                    </table>
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
