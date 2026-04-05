import React, { useState, useMemo } from 'react';
import {
  ComposedChart, Area, Line, PieChart, Pie, Cell,
  ResponsiveContainer, XAxis, YAxis, Tooltip, CartesianGrid
} from 'recharts';
import { motion } from 'motion/react';
import { containerVariants, cardVariants } from '../utils/animations';
import Header from '../components/Header';
import KPICard from '../components/shared/KPICard';
import { MiniWave, MiniProgress, MiniRange } from '../components/shared/KPIVisuals';
import ChartCard from '../components/shared/ChartCard';
import DataTable from '../components/shared/DataTable';
import PhaseNotice from '../components/shared/PhaseNotice';
import StatusBadge from '../components/shared/StatusBadge';
import CustomTooltip from '../components/shared/CustomTooltip';
import analysis from '../data/pricing_analysis.json';
import { buildEnrichedRecommendations } from '../utils/pricingEngine';
import { formatEUR, formatPct } from '../utils/formatters';
import { TOOLTIPS } from '../utils/tooltipContent';
import { useUI } from '../context/UIContext';
import { handleChartContainerClick, handlePieClick } from '../utils/pageContextResolver';
import { track } from '../utils/tracker';

const MARGIN_FLOOR = 0.50;
const MARGIN_TARGET = 0.55;

const PIE_COLORS = ['#0393da', '#10B981', '#F59E0B', '#8B5CF6', '#EC4899', '#6366F1', '#14B8A6'];

function MarginBar({ current, target = MARGIN_TARGET, floor = MARGIN_FLOOR }) {
  const pct = Math.min(current / 1.0, 1) * 100;
  const floorPct = (floor / 1.0) * 100;
  const targetPct = (target / 1.0) * 100;
  const isBelow = current < floor;
  return (
    <div className="relative w-full h-5 bg-slate-100 rounded-full overflow-hidden">
      <div
        className={`absolute left-0 top-0 h-full rounded-full transition-all ${isBelow ? 'bg-red-400' : current < target ? 'bg-amber-400' : 'bg-green-400'}`}
        style={{ width: `${pct}%` }}
      />
      <div className="absolute top-0 h-full border-l-2 border-dashed border-slate-400" style={{ left: `${floorPct}%` }} title="50% Floor" />
      <div className="absolute top-0 h-full border-l-2 border-dashed border-green-600" style={{ left: `${targetPct}%` }} title="55% Target" />
      <span className="absolute inset-0 flex items-center justify-center text-[10px] font-bold text-slate-700">
        {(current * 100).toFixed(1)}%
      </span>
    </div>
  );
}

const vulnerableColumns = [
  { key: 'article_id', label: 'Article ID', render: (v) => <span className="font-mono text-slate-500">{v}</span> },
  { key: 'description', label: 'Description' },
  { key: 'current_margin', label: 'Current DB2', align: 'right', render: (v) => <span className={v < MARGIN_FLOOR ? 'text-red-500 font-bold' : ''}>{formatPct(v)}</span> },
  { key: 'revenue', label: 'Revenue', align: 'right', render: (v) => formatEUR(v) },
  { key: 'risk', label: 'Risk', render: (v) => <StatusBadge label={v} variant={v === 'HIGH' ? 'danger' : v === 'MEDIUM' ? 'warning' : 'success'} /> },
  { key: 'action', label: 'Action', render: (v) => v ? <span className={`inline-flex px-2 py-0.5 rounded-full text-[10px] font-bold ${v === 'Increase' ? 'bg-red-100 text-red-700' : v === 'Monitor' ? 'bg-amber-100 text-amber-700' : 'bg-green-100 text-green-700'}`}>{v}</span> : '—' },
];

export default function PricingQuotes() {
  const { selectItem, selectedItem } = useUI();
  const [marginFilter, setMarginFilter] = useState('all');

  // Derive data from actual JSON
  const quotedVsActual = useMemo(() =>
    analysis.gap_analysis.by_year.map((d) => ({
      period: String(d.year),
      quoted_margin: d.avg_quoted_margin,
      actual_margin: d.avg_actual_margin,
    })),
  []);

  const winRateByMarginBand = useMemo(() =>
    analysis.win_rate_by_margin_band.map((d) => ({
      band: d.band,
      win_rate: +(d.win_rate * 100).toFixed(1),
    })),
  []);

  const rejectionReasons = useMemo(() =>
    analysis.rejection_codes.map((d) => ({
      reason: d.description,
      count: d.count,
      revenue_lost: d.revenue_lost,
    })),
  []);

  // Get at-risk articles from pricing engine
  const enrichedRecs = useMemo(() => buildEnrichedRecommendations(), []);
  const vulnerableArticles = useMemo(() =>
    enrichedRecs
      .filter((r) => r.priority === 'Critical' || r.priority === 'High')
      .sort((a, b) => b.recovery_eur - a.recovery_eur)
      .slice(0, 10)
      .map((r) => ({
        article_id: r.article_id,
        description: r.description,
        current_margin: r.current_margin,
        revenue: r.revenue_latest,
        risk: r.priority === 'Critical' ? 'HIGH' : r.priority === 'High' ? 'HIGH' : 'MEDIUM',
        action: r.action,
      })),
  [enrichedRecs]);

  // Compute recovery by priority from enriched data
  const recoveryByPriority = useMemo(() => {
    const buckets = { 'Critical': 0, 'High': 0, 'Medium': 0 };
    enrichedRecs.forEach((r) => {
      if (r.priority in buckets) buckets[r.priority] += r.recovery_eur;
    });
    return Object.entries(buckets)
      .filter(([, v]) => v > 0)
      .map(([priority, potential]) => ({ priority, potential }));
  }, [enrichedRecs]);

  // KPI values from actual data
  const totalLostRevenue = analysis.rejection_codes.reduce((s, c) => s + c.revenue_lost, 0);
  const totalRejections = analysis.rejection_codes.reduce((s, c) => s + c.count, 0);
  const totalRecovery = enrichedRecs.reduce((s, r) => s + r.recovery_eur, 0);
  const priceSensitivity = analysis.price_sensitivity;
  const gapOverall = analysis.gap_analysis.overall;

  return (
    <>
      <Header title="Pricing & Quotes" />
      <div className="p-8 space-y-8 max-w-[1440px] mx-auto">
        {/* KPI Row */}
        <motion.div
          className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6"
          variants={containerVariants}
          initial="hidden"
          animate="visible"
        >
          <motion.div variants={cardVariants}>
            <KPICard label="Won Avg Margin" value={formatPct(priceSensitivity.won_avg_margin)} change="Quote-to-Invoice" changeType="positive" infoTooltip={TOOLTIPS.win_rate} bottomContent={<MiniProgress value={priceSensitivity.won_avg_margin * 100} color="#10b981" />} formulaId="win_rate" confidence="verified" />
          </motion.div>
          <motion.div variants={cardVariants}>
            <KPICard label="Avg Margin Gap" value={`${(gapOverall.mean_gap * 100).toFixed(1)}pp`} change="Quoted vs Actual" changeType="negative" infoTooltip={TOOLTIPS.margin_gap} bottomContent={<MiniWave color="#f97316" />} formulaId="price_cost_gap" confidence="derived" />
          </motion.div>
          <motion.div variants={cardVariants}>
            <KPICard label="Lost Revenue" value={formatEUR(totalLostRevenue)} change="Rejected quotes" changeType="negative" tooltip={TOOLTIPS.lost_revenue} bottomContent={<MiniRange text={`${totalRejections} rejections`} />} formulaId="quote_lost" confidence="verified" />
          </motion.div>
          <motion.div variants={cardVariants}>
            <KPICard label="Recovery Potential" value={formatEUR(totalRecovery)} change="From repricing" changeType="positive" tooltip={TOOLTIPS.recovery_potential} bottomContent={<MiniWave color="#10b981" />} formulaId="price_cost_gap" confidence="derived" />
          </motion.div>
        </motion.div>

        {/* Charts Row 1 */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Quoted vs Actual Margin */}
          <ChartCard title="Quoted vs Actual Margin" subtitle="Gap analysis by year" tooltip={TOOLTIPS.quoted_vs_actual} formulaId="price_cost_gap" confidence="derived">
            <div className="h-64">
              <ResponsiveContainer width="100%" height="100%">
                <ComposedChart data={quotedVsActual}>
                  <CartesianGrid stroke="#f0f0f0" strokeDasharray="none" />
                  <XAxis dataKey="period" tick={{ fontSize: 10, fill: '#94a3b8' }} tickLine={false} />
                  <YAxis tickFormatter={(v) => `${(v * 100).toFixed(0)}%`} tick={{ fontSize: 10, fill: '#94a3b8' }} width={45} axisLine={false} tickLine={false} />
                  <Tooltip content={<CustomTooltip formatter={(v) => `${(v * 100).toFixed(1)}%`} />} />
                  <Area type="monotone" dataKey="quoted_margin" fill="#0393da" stroke="#0393da" fillOpacity={0.1} />
                  <Line type="monotone" dataKey="actual_margin" stroke="#EF4444" strokeWidth={2.5} dot={{ r: 3 }} />
                </ComposedChart>
              </ResponsiveContainer>
            </div>
          </ChartCard>

          {/* Win Rate by Margin Band */}
          <ChartCard title="Win Rate by Margin Band" subtitle="Price sensitivity analysis" tooltip={TOOLTIPS.win_rate_by_margin} formulaId="win_rate_by_margin" confidence="verified">
            <div className="h-64">
              <ResponsiveContainer width="100%" height="100%">
                <ComposedChart data={winRateByMarginBand}>
                  <CartesianGrid stroke="#f0f0f0" strokeDasharray="none" />
                  <XAxis dataKey="band" tick={{ fontSize: 10, fill: '#94a3b8' }} tickLine={false} />
                  <YAxis tickFormatter={(v) => `${v}%`} tick={{ fontSize: 10, fill: '#94a3b8' }} width={45} axisLine={false} tickLine={false} />
                  <Tooltip content={<CustomTooltip formatter={(v) => `${v}%`} />} />
                  <Area type="monotone" dataKey="win_rate" fill="#10B981" stroke="#10B981" fillOpacity={0.2} />
                  <Line type="monotone" dataKey="win_rate" stroke="#10B981" strokeWidth={2.5} dot={{ r: 3 }} />
                </ComposedChart>
              </ResponsiveContainer>
            </div>
          </ChartCard>
        </div>

        {/* Charts Row 2 */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Rejection Reasons */}
          <ChartCard title="Rejection Codes" subtitle="Top reasons for quote rejection" tooltip={TOOLTIPS.rejection_reasons} formulaId="rejection_codes" confidence="derived">
            <div className="h-64">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={rejectionReasons}
                    cx="50%"
                    cy="50%"
                    innerRadius={50}
                    outerRadius={90}
                    paddingAngle={2}
                    dataKey="count"
                    nameKey="reason"
                  >
                    {rejectionReasons.map((entry, i) => (
                      <Cell key={`cell-${i}`} fill={PIE_COLORS[i % PIE_COLORS.length]} />
                    ))}
                  </Pie>
                  <Tooltip />
                </PieChart>
              </ResponsiveContainer>
            </div>
          </ChartCard>

          {/* Recovery Potential by Priority */}
          <ChartCard title="Margin Recovery Potential" subtitle="By priority level" tooltip={TOOLTIPS.recovery_by_priority} formulaId="price_cost_gap" confidence="derived">
            <div className="h-64">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={recoveryByPriority}
                    cx="50%"
                    cy="50%"
                    innerRadius={50}
                    outerRadius={90}
                    paddingAngle={2}
                    dataKey="potential"
                    nameKey="priority"
                  >
                    {recoveryByPriority.map((entry, i) => (
                      <Cell key={`cell-${i}`} fill={['#0393da', '#F59E0B', '#8B5CF6'][i]} />
                    ))}
                  </Pie>
                  <Tooltip content={<CustomTooltip formatter={(v) => formatEUR(v)} />} />
                </PieChart>
              </ResponsiveContainer>
            </div>
          </ChartCard>
        </div>

        {/* Vulnerable Articles */}
        <DataTable
          title="At-Risk Articles"
          columns={vulnerableColumns}
          data={vulnerableArticles}
          rowKey="article_id"
          selectedRowId={selectedItem?.id}
          onRowClick={(row) => selectItem({ type: 'article', id: row.article_id, label: row.description, data: row })}
          formulaId="price_cost_gap"
          confidence="derived"
        />

        <PhaseNotice type="derived" />
      </div>
    </>
  );
}
