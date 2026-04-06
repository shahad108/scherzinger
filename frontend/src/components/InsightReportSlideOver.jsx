import { motion } from 'motion/react';
import { useNavigate } from 'react-router-dom';
import { X, ExternalLink, MessageSquare } from 'lucide-react';
import {
  BarChart, Bar, LineChart, Line, ResponsiveContainer,
  XAxis, YAxis, Tooltip, CartesianGrid, Legend,
} from 'recharts';
import { slideOverVariants, backdropVariants, slideOverSectionVariants, slideOverItemVariants } from '../utils/animations';
import { colors } from '../utils/designTokensV2';
import { formatEUR } from '../utils/formatters';

const badgeColors = {
  green: { bg: '#f0fdf4', text: '#16a34a' },
  red: { bg: '#fef2f2', text: '#dc2626' },
  amber: { bg: '#fffbeb', text: '#d97706' },
  orange: { bg: '#fff7ed', text: '#ea580c' },
  blue: { bg: '#eff6ff', text: '#2563eb' },
};

export default function InsightReportSlideOver({ report, onClose, onAskAbout }) {
  const navigate = useNavigate();

  if (!report) return null;

  const d = report.detail;
  const badge = badgeColors[report.borderColor] || badgeColors.blue;

  const handleAsk = () => {
    onAskAbout?.(report);
    onClose();
  };

  const handleViewPage = () => {
    onClose();
    if (report.linkPage) navigate(report.linkPage);
  };

  return (
    <>
      <motion.div
        variants={backdropVariants}
        initial="hidden"
        animate="visible"
        exit="exit"
        className="fixed inset-0 bg-black/30 z-40"
        onClick={onClose}
      />

      <motion.div
        variants={slideOverVariants}
        initial="hidden"
        animate="visible"
        exit="exit"
        className="fixed right-0 top-0 h-screen w-[680px] max-w-[92vw] z-50 flex flex-col overflow-hidden"
        style={{ background: '#fff', boxShadow: '0 0 60px rgba(26,26,46,0.12)' }}
      >
            {/* Header */}
            <div className="flex-shrink-0 px-6 py-5 flex items-start justify-between border-b border-slate-100">
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2 mb-2">
                  <span
                    className="px-2.5 py-1 rounded text-[10px] font-bold uppercase tracking-wider"
                    style={{ background: badge.bg, color: badge.text }}
                  >
                    {report.type}
                  </span>
                  {report.frequency === 'triggered' && (
                    <span className="px-2 py-0.5 rounded text-[9px] font-bold uppercase bg-red-50 text-red-500">
                      Alert
                    </span>
                  )}
                </div>
                <h2 className="text-lg font-bold text-slate-800" style={{ fontFamily: "'Manrope', sans-serif" }}>
                  {d.title}
                </h2>
                {d.subtitle && (
                  <p className="text-xs text-slate-500 mt-1">{d.subtitle}</p>
                )}
              </div>
              <button
                onClick={onClose}
                className="p-2 rounded-lg hover:bg-slate-50 transition-colors text-slate-400 flex-shrink-0"
              >
                <X size={20} />
              </button>
            </div>

            {/* Content */}
            <motion.div
              className="flex-1 overflow-y-auto px-6 py-5 space-y-6"
              variants={slideOverSectionVariants}
              initial="hidden"
              animate="visible"
            >
              {/* KPI Metrics */}
              {d.metrics?.length > 0 && (
                <motion.div variants={slideOverItemVariants} className="grid grid-cols-3 gap-3">
                  {d.metrics.map((m, i) => (
                    <div key={i} className="p-4 bg-slate-50 rounded-xl">
                      <p className="text-[10px] font-semibold uppercase tracking-wider text-slate-400">
                        {m.label}
                      </p>
                      <p className="text-xl font-bold mt-1" style={{ color: m.color || colors.darkNavy }}>
                        {m.value}
                      </p>
                      {m.change && (
                        <p className="text-[10px] font-medium mt-0.5 text-slate-500">{m.change}</p>
                      )}
                    </div>
                  ))}
                </motion.div>
              )}

              {/* Chart */}
              {d.chartData?.length > 0 && (
                <motion.div variants={slideOverItemVariants} className="p-4 bg-slate-50 rounded-xl">
                  <p className="text-xs font-bold uppercase tracking-wider text-slate-500 mb-4">
                    {d.chartTitle || 'Analysis'}
                  </p>
                  <div className="h-52">
                    <ResponsiveContainer width="100%" height="100%">
                      {d.chartType === 'line' || d.chartSeries ? (
                        <LineChart data={d.chartData}>
                          <CartesianGrid stroke="#f0f0f0" vertical={false} />
                          <XAxis
                            dataKey="name"
                            tick={{ fontSize: 9, fill: '#94a3b8' }}
                            tickLine={false}
                            axisLine={false}
                            angle={-30}
                            textAnchor="end"
                            height={50}
                          />
                          <YAxis
                            tick={{ fontSize: 10, fill: '#94a3b8' }}
                            width={45}
                            axisLine={false}
                            tickLine={false}
                            tickFormatter={(v) => v > 1000 ? formatEUR(v) : `${v}%`}
                          />
                          <Tooltip
                            contentStyle={{ fontSize: 11, borderRadius: 8, border: '1px solid #f0f0f0' }}
                            formatter={(v, name) => [`${v > 1000 ? formatEUR(v) : v + '%'}`, name]}
                          />
                          {d.chartSeries ? (
                            d.chartSeries.map((s) => (
                              <Line
                                key={s.key}
                                type="monotone"
                                dataKey={s.key}
                                stroke={s.color}
                                strokeWidth={2}
                                dot={{ r: 3, fill: '#fff', stroke: s.color, strokeWidth: 2 }}
                                name={s.label || s.key}
                              />
                            ))
                          ) : (
                            <Line
                              type="monotone"
                              dataKey="value"
                              stroke={d.barColor || colors.primary}
                              strokeWidth={2}
                              dot={{ r: 3, fill: '#fff', stroke: d.barColor || colors.primary, strokeWidth: 2 }}
                            />
                          )}
                          {d.chartSeries && <Legend wrapperStyle={{ fontSize: 10 }} />}
                        </LineChart>
                      ) : (
                        <BarChart data={d.chartData} layout={d.horizontal ? 'vertical' : 'horizontal'}>
                          <CartesianGrid stroke="#f0f0f0" vertical={!d.horizontal} horizontal={d.horizontal} />
                          {d.horizontal ? (
                            <>
                              <YAxis dataKey="name" type="category" tick={{ fontSize: 10, fill: '#94a3b8' }} width={100} axisLine={false} tickLine={false} />
                              <XAxis type="number" tickFormatter={(v) => v > 1000 ? formatEUR(v) : v} tick={{ fontSize: 10, fill: '#94a3b8' }} axisLine={false} tickLine={false} />
                            </>
                          ) : (
                            <>
                              <XAxis dataKey="name" tick={{ fontSize: 10, fill: '#94a3b8' }} tickLine={false} axisLine={false} />
                              <YAxis tick={{ fontSize: 10, fill: '#94a3b8' }} width={45} axisLine={false} tickLine={false} tickFormatter={(v) => v > 1000 ? formatEUR(v) : v} />
                            </>
                          )}
                          <Tooltip
                            contentStyle={{ fontSize: 11, borderRadius: 8, border: '1px solid #f0f0f0' }}
                            formatter={(v) => [v > 1000 ? formatEUR(v) : v]}
                          />
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

              {/* Data Table (for churn warnings, etc.) */}
              {d.dataRows?.length > 0 && d.dataColumns?.length > 0 && (
                <motion.div variants={slideOverItemVariants}>
                  <p className="text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-3">
                    {d.tableTitle || 'Affected Items'}
                  </p>
                  <div className="overflow-x-auto rounded-lg bg-slate-50">
                    <table className="w-full text-left text-xs">
                      <thead>
                        <tr>
                          {d.dataColumns.map((col) => (
                            <th key={col.key} className="px-4 py-3 text-[9px] font-bold uppercase tracking-widest text-slate-400">
                              {col.label}
                            </th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {d.dataRows.map((row, i) => (
                          <tr key={i} className="border-t border-slate-100">
                            {d.dataColumns.map((col) => (
                              <td key={col.key} className="px-4 py-3 text-slate-700">
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

              {/* Recommended Actions */}
              {d.actions?.length > 0 && (
                <motion.div variants={slideOverItemVariants}>
                  <p className="text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-3">
                    Recommended Actions
                  </p>
                  <ol className="space-y-2">
                    {d.actions.map((action, j) => (
                      <li key={j} className="flex gap-3 text-sm text-slate-700">
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
            </motion.div>

            {/* Footer Actions */}
            <div className="flex-shrink-0 px-6 py-4 border-t border-slate-100 flex items-center gap-3">
              <button
                onClick={handleAsk}
                className="flex items-center gap-2 px-4 py-2 rounded-lg text-xs font-semibold text-white transition-colors"
                style={{ background: colors.primary }}
              >
                <MessageSquare size={14} />
                Ask AI about this
              </button>
              {report.linkPage && (
                <button
                  onClick={handleViewPage}
                  className="flex items-center gap-2 px-4 py-2 rounded-lg text-xs font-semibold text-slate-600 bg-slate-100 hover:bg-slate-200 transition-colors"
                >
                  <ExternalLink size={14} />
                  View in {report.linkLabel}
                </button>
              )}
            </div>
          </motion.div>
        </>
  );
}
