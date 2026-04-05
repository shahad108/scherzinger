import { useState, useMemo } from 'react';
import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip } from 'recharts';
import { motion } from 'motion/react';
import { containerVariants, cardVariants } from '../utils/animations';
import Header from '../components/Header';
import KPICard from '../components/shared/KPICard';
import { MiniBars, MiniProgress, MiniRange } from '../components/shared/KPIVisuals';
import ChartCard from '../components/shared/ChartCard';
import DataTable from '../components/shared/DataTable';
import StatusBadge from '../components/shared/StatusBadge';
import CustomTooltip from '../components/shared/CustomTooltip';
import { formatEUR } from '../utils/formatters';
import { TOOLTIPS, CATEGORY_DESCRIPTIONS } from '../utils/tooltipContent';
import PhaseNotice from '../components/shared/PhaseNotice';
import { useUI } from '../context/UIContext';
import { handlePieClick } from '../utils/pageContextResolver';
import { track } from '../utils/tracker';
import cogsData from '../data/cogs_detail.json';
import inventoryData from '../data/inventory_detail.json';

const costBreakdown = cogsData.cost_breakdown;
const costByYear = cogsData.cost_by_year;
const costByCommodity = cogsData.cost_by_commodity;
const costTrends = inventoryData.cost_trends;
const costSummary = inventoryData.cost_summary;

// Normalize commodity_group values
const normalizedCostTrends = costTrends.map((item) => ({
  ...item,
  commodity_group: (!item.commodity_group || item.commodity_group === 'nan') ? 'UNCATEGORIZED' : item.commodity_group,
}));

const trendCounts = normalizedCostTrends.reduce((acc, item) => {
  acc[item.cost_trend] = (acc[item.cost_trend] || 0) + 1;
  return acc;
}, {});

const total = normalizedCostTrends.length;

// Donut data for cost composition
const compositionDonut = [
  { name: 'Material', value: costBreakdown.material_pct, color: '#0393da' },
  { name: 'Labor', value: costBreakdown.labor_pct, color: '#F59E0B' },
  { name: 'Outsourcing', value: costBreakdown.outsourcing_pct, color: '#818CF8' },
  { name: 'Overhead', value: costBreakdown.overhead_pct, color: '#10B981' },
];

const cellColor = {
  stable: 'bg-emerald-400',
  rising: 'bg-red-500',
  declining: 'bg-sky-400',
};

const trendVariant = (s) => {
  if (s === 'rising') return 'danger';
  if (s === 'declining') return 'success';
  return 'info';
};

// Group by commodity_group for heatmap
const categorized = normalizedCostTrends.reduce((acc, item) => {
  if (!acc[item.commodity_group]) acc[item.commodity_group] = [];
  acc[item.commodity_group].push(item);
  return acc;
}, {});

// Top cost risers sorted by cost_change_pct
const costRisers = normalizedCostTrends
  .filter((item) => item.cost_trend === 'rising')
  .sort((a, b) => b.cost_change_pct - a.cost_change_pct);

// Commodity group table columns
const commodityColumns = [
  { key: 'commodity_group', label: 'Commodity Group', render: (v) => <span className="font-mono text-xs font-semibold text-[#0393da]">{v}</span> },
  { key: 'avg_hkvoll', label: 'Avg HKvoll', align: 'right', render: (v) => formatEUR(v) },
  { key: 'material_pct', label: 'Material %', align: 'right', render: (v) => `${(v * 100).toFixed(0)}%` },
  { key: 'labor_pct', label: 'Labor %', align: 'right', render: (v) => `${(v * 100).toFixed(0)}%` },
  { key: 'outsourcing_pct', label: 'Outsourcing %', align: 'right', render: (v) => `${(v * 100).toFixed(0)}%` },
  { key: 'overhead_pct', label: 'Overhead %', align: 'right', render: (v) => `${(v * 100).toFixed(0)}%` },
];

// Cost trends table columns
const trendColumns = [
  {
    key: 'article_id', label: 'Article ID', render: (v) => <span className="font-mono text-xs font-semibold text-[#0393da]">{v}</span>,
  },
  { key: 'description', label: 'Description', render: (v) => <span className="font-medium max-w-[250px] truncate block" title={v}>{v}</span> },
  { key: 'commodity_group', label: 'Commodity Group', tooltip: TOOLTIPS.col_category },
  { key: 'hkvoll_2024', label: 'HKvoll 2024', align: 'right', render: (v) => formatEUR(v) },
  { key: 'hkvoll_2025', label: 'HKvoll 2025', align: 'right', render: (v) => <span className="font-semibold">{formatEUR(v)}</span> },
  { key: 'cost_change_pct', label: 'Cost Change', align: 'right', render: (v) => <span className={v > 0.1 ? 'text-red-600 font-semibold' : ''}>{(v * 100).toFixed(1)}%</span> },
  { key: 'cost_trend', label: 'Trend', render: (v) => <StatusBadge label={v} variant={trendVariant(v)} /> },
  { key: 'material_share', label: 'Material %', align: 'right', render: (v) => `${(v * 100).toFixed(0)}%` },
  { key: 'labor_share', label: 'Labor %', align: 'right', render: (v) => `${(v * 100).toFixed(0)}%` },
];

export default function CostIntelligence() {
  const { selectItem, selectedItem } = useUI();
  const [selectedGridItem, setSelectedGridItem] = useState(null);

  // Calculate year-over-year COGS change
  const latestYear = costByYear[costByYear.length - 1];
  const previousYear = costByYear[costByYear.length - 2];
  const yoyChange = previousYear ? ((latestYear.total_cogs - previousYear.total_cogs) / previousYear.total_cogs) : 0;

  return (
    <>
      <Header title="Cost Intelligence" />
      <div className="p-8 space-y-8 max-w-[1440px] mx-auto">
        {/* Cost Alert Banner */}
        {(trendCounts.rising || 0) > 0 && (
          <div className="flex items-center gap-4 p-4 bg-red-50 border border-red-200 rounded-xl">
            <div className="size-10 bg-red-500 text-white rounded-lg flex items-center justify-center text-lg font-bold flex-shrink-0">!</div>
            <div className="flex-1">
              <p className="text-sm font-bold text-red-700">
                {trendCounts.rising} products with RISING cost trend — immediate review required
              </p>
              <p className="text-xs text-red-600 mt-0.5">
                {costSummary.regime_note}
              </p>
            </div>
            <a href="#cost-alerts" className="px-4 py-2 bg-red-500 text-white text-xs font-bold rounded-lg hover:bg-red-600 transition-colors flex-shrink-0">
              View Cost Alerts
            </a>
          </div>
        )}

        {/* KPIs */}
        <motion.div
          className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6"
          variants={containerVariants}
          initial="hidden"
          animate="visible"
        >
          <motion.div variants={cardVariants}>
            <KPICard label="Total COGS" value={formatEUR(costBreakdown.total_cogs_eur)} tooltip="Total cost of goods sold across all products" formulaId="cost_breakdown" confidence="verified" bottomContent={<MiniBars data={costByYear.map(y => y.total_cogs / 1000)} color="#0393da" />} />
          </motion.div>
          <motion.div variants={cardVariants}>
            <KPICard label="Cost Alert" value={trendCounts.rising || 0} change="Review now" changeType="negative" infoTooltip="Number of articles with rising cost trends" formulaId="hkvar_total" confidence="verified" bottomContent={<MiniProgress value={trendCounts.rising || 0} max={total} color="#EF4444" />} />
          </motion.div>
          <motion.div variants={cardVariants}>
            <KPICard label="YoY Change" value={`${(yoyChange * 100).toFixed(1)}%`} change={yoyChange < 0 ? 'Decreasing' : 'Increasing'} changeType={yoyChange < 0 ? 'positive' : 'negative'} infoTooltip="Year-over-year change in total COGS" formulaId="cost_by_year" confidence="verified" bottomContent={<MiniProgress value={Math.abs(Math.round(yoyChange * 100))} max={30} color="#f97316" />} />
          </motion.div>
          <motion.div variants={cardVariants}>
            <KPICard label="Stable Products" value={trendCounts.stable || 0} change="Cost-efficient" changeType="positive" tooltip="Products with stable cost trends" formulaId="hkvoll_total" confidence="verified" bottomContent={<MiniRange text={`${costSummary.cost_stable} cost-stable articles`} />} />
          </motion.div>
        </motion.div>

        {/* Cost Trend Heatmap — grouped by commodity_group */}
        <div className="p-6 rounded-2xl shadow-sm" style={{ background: '#ffffff', boxShadow: '0 8px 32px rgba(26,26,46,0.04)' }}>
          <div className="flex items-center justify-between mb-6">
            <h3 className="text-base font-bold" style={{ fontFamily: "'Manrope', sans-serif", color: '#1a1a2e' }}>Cost Status Grid</h3>
            <div className="flex items-center gap-4 text-xs font-medium">
              <div className="flex items-center gap-1.5"><span className="size-3 bg-red-500 rounded-sm" /> Rising</div>
              <div className="flex items-center gap-1.5"><span className="size-3 bg-emerald-400 rounded-sm" /> Stable</div>
              <div className="flex items-center gap-1.5"><span className="size-3 bg-sky-400 rounded-sm" /> Declining</div>
            </div>
          </div>
          <div className="space-y-4">
            {Object.entries(categorized).map(([group, items]) => {
              const COLS = 32;
              const ROWS = 2;
              const totalSlots = COLS * ROWS;
              const emptyCount = Math.max(totalSlots - items.length, 0);
              return (
                <div key={group}>
                  <p className="text-xs font-bold text-slate-400 uppercase mb-2">{group} ({items.length})</p>
                  <div className="grid gap-1.5" style={{ gridTemplateColumns: `repeat(${COLS}, minmax(0, 1fr))` }}>
                    {items.map((item) => (
                      <div
                        key={item.article_id}
                        className={`aspect-square ${cellColor[item.cost_trend] || 'bg-slate-300'} rounded-sm hover:scale-125 hover:ring-2 ring-[#0393da] cursor-pointer transition-transform duration-150`}
                        onClick={() => setSelectedGridItem(item)}
                      />
                    ))}
                    {Array.from({ length: emptyCount }).map((_, i) => (
                      <div
                        key={`empty-${i}`}
                        className="aspect-square bg-slate-100 rounded-sm"
                      />
                    ))}
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Grid Item Detail Popup */}
        {selectedGridItem && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/20" onClick={() => setSelectedGridItem(null)}>
            <div className="rounded-2xl p-6 max-w-md w-full mx-4" style={{ background: '#ffffff', boxShadow: '0 8px 32px rgba(26,26,46,0.04)' }} onClick={(e) => e.stopPropagation()}>
              <div className="flex items-start justify-between mb-4">
                <div>
                  <h4 className="text-base font-bold" style={{ fontFamily: "'Manrope', sans-serif", color: '#1a1a2e' }}>{selectedGridItem.description}</h4>
                  <p className="text-xs font-mono text-slate-500">{selectedGridItem.article_id}</p>
                </div>
                <StatusBadge label={selectedGridItem.cost_trend} variant={trendVariant(selectedGridItem.cost_trend)} />
              </div>
              <div className="grid grid-cols-2 gap-4 mb-4">
                <div className="p-3 bg-slate-50 rounded-lg">
                  <p className="text-[10px] text-slate-400 uppercase font-bold">HKvoll 2022</p>
                  <p className="text-xl font-bold">{formatEUR(selectedGridItem.hkvoll_2022)}</p>
                </div>
                <div className="p-3 bg-slate-50 rounded-lg">
                  <p className="text-[10px] text-slate-400 uppercase font-bold">HKvoll 2023</p>
                  <p className="text-xl font-bold">{formatEUR(selectedGridItem.hkvoll_2023)}</p>
                </div>
                <div className="p-3 bg-slate-50 rounded-lg">
                  <p className="text-[10px] text-slate-400 uppercase font-bold">HKvoll 2024</p>
                  <p className="text-xl font-bold">{formatEUR(selectedGridItem.hkvoll_2024)}</p>
                </div>
                <div className="p-3 bg-slate-50 rounded-lg">
                  <p className="text-[10px] text-slate-400 uppercase font-bold">HKvoll 2025</p>
                  <p className="text-xl font-bold">{formatEUR(selectedGridItem.hkvoll_2025)}</p>
                </div>
                <div className="p-3 bg-slate-50 rounded-lg">
                  <p className="text-[10px] text-slate-400 uppercase font-bold">Cost Change</p>
                  <p className={`text-xl font-bold ${selectedGridItem.cost_change_pct > 0.1 ? 'text-red-500' : ''}`}>{(selectedGridItem.cost_change_pct * 100).toFixed(1)}%</p>
                </div>
                <div className="p-3 bg-slate-50 rounded-lg">
                  <p className="text-[10px] text-slate-400 uppercase font-bold">Commodity Group</p>
                  <p className="text-xl font-bold">{selectedGridItem.commodity_group}</p>
                </div>
              </div>
              <div className="p-3 bg-slate-50 rounded-lg mb-4">
                <p className="text-[10px] text-slate-400 uppercase font-bold mb-2">Cost Composition</p>
                <div className="flex gap-4 text-xs">
                  <span>Material: <strong>{(selectedGridItem.material_share * 100).toFixed(0)}%</strong></span>
                  <span>Labor: <strong>{(selectedGridItem.labor_share * 100).toFixed(0)}%</strong></span>
                  <span>Outsourcing: <strong>{(selectedGridItem.outsourcing_share * 100).toFixed(0)}%</strong></span>
                </div>
              </div>
              {selectedGridItem.cost_trend === 'rising' && (
                <div className="p-3 rounded-lg bg-red-50 border border-red-200">
                  <p className="text-xs font-bold text-red-700">
                    Cost rising {(selectedGridItem.cost_change_pct * 100).toFixed(1)}% since 2022 — review sourcing strategy
                  </p>
                </div>
              )}
              <div className="flex gap-3 mt-4">
                <button
                  onClick={() => setSelectedGridItem(null)}
                  className="px-4 py-2 bg-slate-100 text-slate-600 text-sm font-medium rounded-lg hover:bg-slate-200 transition-colors"
                >
                  Close
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Donut (Cost Composition) + Cost Alerts */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          <ChartCard title="COGS Composition" tooltip="Breakdown of total cost of goods sold by category" formulaId="cost_breakdown" confidence="verified">
            <div className="flex flex-col items-center">
              <div className="relative size-48">
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie data={compositionDonut} cx="50%" cy="50%" innerRadius={55} outerRadius={75} dataKey="value" stroke="none" cornerRadius={3} paddingAngle={4} animationDuration={800} cursor="pointer" onClick={(data) => { handlePieClick('Cost Composition', selectItem, data); track.chartClick('COGS Composition', data); }}>
                      {compositionDonut.map((entry, i) => (
                        <Cell key={i} fill={entry.color} />
                      ))}
                    </Pie>
                    <Tooltip content={<CustomTooltip descriptions={CATEGORY_DESCRIPTIONS} />} />
                  </PieChart>
                </ResponsiveContainer>
                <div className="absolute inset-0 flex flex-col items-center justify-center">
                  <span className="text-lg font-bold">{formatEUR(costBreakdown.total_cogs_eur)}</span>
                  <span className="text-[10px] text-slate-500 font-bold uppercase">Total COGS</span>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-x-8 gap-y-3 mt-6 w-full">
                {compositionDonut.map((d) => (
                  <div key={d.name} className="flex items-center gap-2">
                    <span className="size-2 rounded-full" style={{ backgroundColor: d.color }} />
                    <span className="text-xs font-medium">{d.name}: {(d.value * 100).toFixed(0)}%</span>
                  </div>
                ))}
              </div>
            </div>
          </ChartCard>

          <div id="cost-alerts" className="lg:col-span-2 p-6 rounded-2xl shadow-sm" style={{ background: '#ffffff', boxShadow: '0 8px 32px rgba(26,26,46,0.04)' }}>
            <div className="flex items-center justify-between mb-6">
              <h3 className="text-base font-bold" style={{ fontFamily: "'Manrope', sans-serif", color: '#1a1a2e' }}>Cost & Supply Alerts</h3>
            </div>
            <div className="space-y-4 max-h-[400px] overflow-y-auto pr-2">
              {costRisers.slice(0, 12).map((item) => {
                const isHigh = item.cost_change_pct > 0.25;
                return (
                  <div key={item.article_id} className={`flex items-center justify-between p-4 ${isHigh ? 'bg-red-50 border-red-100' : 'bg-amber-50 border-amber-100'} border rounded-lg`}>
                    <div className="flex items-center gap-4">
                      <div className={`size-10 ${isHigh ? 'bg-red-500' : 'bg-amber-500'} text-white rounded-lg flex items-center justify-center text-sm font-bold`}>!</div>
                      <div>
                        <p className="font-bold text-sm">{item.description}</p>
                        <p className="text-xs text-slate-500">
                          ID: {item.article_id} | {item.commodity_group} | HKvoll 2025: {formatEUR(item.hkvoll_2025)}
                        </p>
                      </div>
                    </div>
                    <div className="flex items-center gap-3">
                      <span className={`text-sm font-bold ${isHigh ? 'text-red-600' : 'text-amber-600'}`}>+{(item.cost_change_pct * 100).toFixed(1)}%</span>
                      <StatusBadge label={item.cost_trend} variant={isHigh ? 'danger' : 'warning'} />
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>

        {/* Commodity Group Breakdown Table */}
        <DataTable
          title="Cost by Commodity Group"
          columns={commodityColumns}
          data={costByCommodity}
          rowKey="commodity_group"
          formulaId="cost_by_commodity"
          confidence="verified"
          selectedRowId={selectedItem?.id}
          onRowClick={(row) => selectItem({ type: 'commodity', id: row.commodity_group, label: row.commodity_group, data: row })}
        />

        {/* Full Product Cost Analysis Table */}
        <DataTable
          title="Product Cost Analysis"
          columns={trendColumns}
          data={normalizedCostTrends}
          rowKey="article_id"
          formulaId="inventory_cost_trends"
          confidence="verified"
          selectedRowId={selectedItem?.id}
          onRowClick={(row) => selectItem({ type: 'article', id: row.article_id, label: row.description, data: row })}
        />
        <PhaseNotice type="derived" />
      </div>
    </>
  );
}
