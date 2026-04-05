import { useState, useMemo } from 'react';
import { motion } from 'motion/react';
import { containerVariants, cardVariants } from '../utils/animations';
import Header from '../components/Header';
import KPICard from '../components/shared/KPICard';
import { MiniAvatars, MiniProgress, MiniWave } from '../components/shared/KPIVisuals';
import DataTable from '../components/shared/DataTable';
import StatusBadge from '../components/shared/StatusBadge';
import customersData from '../data/customers_detail.json';
import { formatEUR, formatPct } from '../utils/formatters';
import { TOOLTIPS } from '../utils/tooltipContent';
import { useUI } from '../context/UIContext';
import { track } from '../utils/tracker';
import ChartCard from '../components/shared/ChartCard';
import PhaseNotice from '../components/shared/PhaseNotice';

const customers = customersData.customers;
const segmentsMeta = customersData.segments;
const churnSummary = customersData.churn_summary;

// Risk tiers from the data: low, medium, high, critical
const HIGH_RISK_TIERS = ['high', 'critical'];
const MED_RISK_TIERS = ['medium'];
const LOW_RISK_TIERS = ['low'];

const riskVariant = (tier) => {
  if (tier === 'critical') return 'danger';
  if (tier === 'high') return 'danger';
  if (tier === 'medium') return 'warning';
  return 'success';
};

const segmentVariant = (seg) => {
  if (seg === 'Enterprise') return 'info';
  if (seg === 'Mid-Market') return 'warning';
  if (seg === 'SME') return 'neutral';
  return 'neutral';
};

// KPIs
const totalCustomers = customers.length;
const enterpriseMidMarket = customers.filter((c) => c.segment === 'Enterprise' || c.segment === 'Mid-Market');
const enterpriseMidMarketLtv = enterpriseMidMarket.reduce((s, c) => s + c.ltv_estimated, 0);
const totalLtv = customers.reduce((s, c) => s + c.ltv_estimated, 0);
const topSegmentLtvPct = totalLtv > 0 ? enterpriseMidMarketLtv / totalLtv : 0;
const highChurnCount = customers.filter((c) => HIGH_RISK_TIERS.includes(c.risk_tier)).length;
const avgMargin = customers.reduce((s, c) => s + c.avg_db2_margin, 0) / customers.length;

// Concentration — top 15 by LTV
const top15 = [...customers].sort((a, b) => b.ltv_estimated - a.ltv_estimated).slice(0, 15);
const maxLtv = top15[0]?.ltv_estimated || 1;

// Churn matrix — group by segment, count risk levels
function buildChurnMatrix() {
  const tiers = ['Enterprise', 'Mid-Market', 'SME', 'Occasional'];
  return tiers.map((tier) => {
    const group = customers.filter((c) => c.segment === tier);
    const total = group.length || 1;
    const high = group.filter((c) => HIGH_RISK_TIERS.includes(c.risk_tier)).length;
    const med = group.filter((c) => MED_RISK_TIERS.includes(c.risk_tier)).length;
    const low = group.filter((c) => LOW_RISK_TIERS.includes(c.risk_tier)).length;
    return {
      tier,
      high: Math.round((high / total) * 100),
      med: Math.round((med / total) * 100),
      low: Math.round((low / total) * 100),
    };
  });
}

const churnMatrix = buildChurnMatrix();

// Churn counts from churn_summary
const churnHigh = (churnSummary.find((r) => r.risk_level === 'High')?.count || 0) +
  (churnSummary.find((r) => r.risk_level === 'Critical')?.count || 0);
const churnMed = churnSummary.find((r) => r.risk_level === 'Medium')?.count || 0;
const churnLow = churnSummary.find((r) => r.risk_level === 'Low')?.count || 0;
const ltvAtRisk = (churnSummary.find((r) => r.risk_level === 'High')?.total_ltv || 0) +
  (churnSummary.find((r) => r.risk_level === 'Critical')?.total_ltv || 0);

// Cumulative % for top 15
const top15WithCum = (() => {
  let cumulative = 0;
  return top15.map((c) => {
    cumulative += c.ltv_estimated;
    return { ...c, cum_pct: cumulative / totalLtv };
  });
})();

export default function Customers() {
  const { selectItem, selectedItem } = useUI();
  const [segmentFilter, setSegmentFilter] = useState('All');
  const [churnFilter, setChurnFilter] = useState('All');
  const [customerSearch, setCustomerSearch] = useState('');

  const filteredCustomers = useMemo(() => {
    let list = customers;
    if (segmentFilter !== 'All') {
      list = list.filter((c) => c.segment === segmentFilter);
    }
    if (churnFilter !== 'All') {
      if (churnFilter === 'High') list = list.filter((c) => HIGH_RISK_TIERS.includes(c.risk_tier));
      else if (churnFilter === 'Medium') list = list.filter((c) => MED_RISK_TIERS.includes(c.risk_tier));
      else if (churnFilter === 'Low') list = list.filter((c) => LOW_RISK_TIERS.includes(c.risk_tier));
    }
    if (customerSearch.trim()) {
      const q = customerSearch.toLowerCase();
      list = list.filter((c) =>
        c.customer_id?.toLowerCase().includes(q) ||
        c.name?.toLowerCase().includes(q) ||
        c.segment?.toLowerCase().includes(q)
      );
    }
    // Sort: high-risk first, then medium, then low — within each group sort by LTV descending
    const riskOrder = (c) => {
      if (c.risk_tier === 'critical') return 0;
      if (c.risk_tier === 'high') return 1;
      if (c.risk_tier === 'medium') return 2;
      return 3;
    };
    list = [...list].sort((a, b) => riskOrder(a) - riskOrder(b) || b.ltv_estimated - a.ltv_estimated);
    return list;
  }, [segmentFilter, churnFilter, customerSearch]);

  const filteredLtv = filteredCustomers.reduce((s, c) => s + c.ltv_estimated, 0);
  const filteredHighChurn = filteredCustomers.filter((c) => HIGH_RISK_TIERS.includes(c.risk_tier)).length;

  const customerColumns = [
    { key: 'customer_id', label: 'ID', render: (v) => <span className="font-bold">{v}</span> },
    { key: 'name', label: 'Customer' },
    { key: 'segment', label: 'Segment', render: (v) => <StatusBadge label={v} variant={segmentVariant(v)} /> },
    { key: 'ltv_estimated', label: 'Est. LTV', align: 'right', render: (v) => <span className="font-semibold">{formatEUR(v)}</span>, tooltip: TOOLTIPS.ltv },
    { key: 'total_revenue_eur', label: 'Revenue', align: 'right', render: (v) => formatEUR(v) },
    { key: 'risk_tier', label: 'Risk Tier', render: (v) => <StatusBadge label={v} variant={riskVariant(v)} />, tooltip: TOOLTIPS.churn_risk },
    { key: 'total_invoices', label: 'Invoices', align: 'right' },
    { key: 'avg_db2_margin', label: 'Avg Margin', align: 'right', render: (v) => formatPct(v) },
    { key: 'win_rate', label: 'Win Rate', align: 'right', render: (v) => formatPct(v) },
    { key: 'risk_score', label: 'Risk Score', align: 'right', render: (v) => v != null ? (v * 100).toFixed(0) : '—', tooltip: TOOLTIPS.risk_score },
  ];

  return (
    <>
      <Header title="Customers" />
      <div className="p-8 space-y-8 max-w-[1440px] mx-auto">
        {/* Filter Bar */}
        <div className="flex flex-wrap items-center gap-4">
          <div className="relative flex-1 max-w-sm">
            <input
              type="text"
              placeholder="Search customer ID, name, segment..."
              value={customerSearch}
              onChange={(e) => setCustomerSearch(e.target.value)}
              className="w-full px-4 py-2 pl-10 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#0393da]/30 focus:border-[#0393da]"
            />
            <svg className="absolute left-3 top-2.5 h-4 w-4 text-slate-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
            </svg>
          </div>
          <div className="flex gap-1.5">
            {['All', 'Enterprise', 'Mid-Market', 'SME', 'Occasional'].map((seg) => (
              <button
                key={seg}
                onClick={() => setSegmentFilter(seg)}
                className={`px-3 py-1.5 rounded-full text-xs font-medium transition-all ${
                  segmentFilter === seg
                    ? seg === 'Enterprise' ? 'bg-[#0393da] text-white'
                    : seg === 'Mid-Market' ? 'bg-amber-500 text-white'
                    : seg === 'SME' ? 'bg-slate-500 text-white'
                    : seg === 'Occasional' ? 'bg-orange-600 text-white'
                    : 'bg-[#0393da] text-white'
                    : 'bg-white border border-slate-200 hover:border-[#0393da]'
                }`}
              >
                {seg === 'All' ? 'All Segments' : seg}
              </button>
            ))}
          </div>
          <div className="flex gap-1.5">
            {['All', 'High', 'Medium', 'Low'].map((risk) => (
              <button
                key={risk}
                onClick={() => setChurnFilter(risk)}
                className={`px-3 py-1.5 rounded-full text-xs font-medium transition-all flex items-center gap-1.5 ${
                  churnFilter === risk
                    ? 'bg-[#0393da] text-white'
                    : 'bg-white border border-slate-200 hover:border-[#0393da]'
                }`}
              >
                {risk !== 'All' && (
                  <span className={`size-2 rounded-full ${
                    risk === 'High' ? 'bg-red-500' : risk === 'Medium' ? 'bg-amber-500' : 'bg-green-500'
                  }`} />
                )}
                {risk === 'All' ? 'All Risk' : `${risk} Risk`}
              </button>
            ))}
          </div>
          {(segmentFilter !== 'All' || churnFilter !== 'All' || customerSearch) && (
            <button
              onClick={() => { setSegmentFilter('All'); setChurnFilter('All'); setCustomerSearch(''); }}
              className="text-xs text-[#0393da] font-medium hover:underline"
            >
              Clear filters
            </button>
          )}
        </div>

        {(segmentFilter !== 'All' || churnFilter !== 'All' || customerSearch) && (
          <div className="flex items-center gap-6 px-4 py-3 bg-[#c1e8ff]/30 rounded-lg">
            <p className="text-sm text-[#0393da]">
              <span className="font-bold">{filteredCustomers.length}</span> of {customers.length} customers
            </p>
            <p className="text-sm text-[#0393da]">
              LTV: <span className="font-bold">{formatEUR(filteredLtv)}</span>
            </p>
            <p className="text-sm text-[#0393da]">
              High Churn: <span className="font-bold text-red-600">{filteredHighChurn}</span>
            </p>
          </div>
        )}

        {/* KPI Row */}
        <motion.div
          className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6"
          variants={containerVariants}
          initial="hidden"
          animate="visible"
        >
          <motion.div variants={cardVariants}>
            <KPICard label="Total Customers" value={totalCustomers} tooltip={TOOLTIPS.active_customers} formulaId="customer_count" confidence="verified" bottomContent={<MiniAvatars count={totalCustomers} shown={3} />} />
          </motion.div>
          <motion.div variants={cardVariants}>
            <KPICard label="Enterprise+Mid-Market LTV %" value={formatPct(topSegmentLtvPct)} infoTooltip={TOOLTIPS.platinum_gold_ltv_pct} formulaId="customer_segments" confidence="verified" bottomContent={<MiniProgress value={topSegmentLtvPct * 100} color="#e7a019" />} />
          </motion.div>
          <motion.div variants={cardVariants} onClick={() => setChurnFilter(churnFilter === 'High' ? 'All' : 'High')} className="cursor-pointer">
            <KPICard label="High / Critical Risk" value={highChurnCount} change={churnFilter === 'High' ? 'Click to clear' : 'Click to filter'} changeType="negative" infoTooltip={TOOLTIPS.churn_risk} formulaId="risk_distribution" confidence="derived" bottomContent={<MiniProgress value={highChurnCount} max={totalCustomers} color="#EF4444" />} />
          </motion.div>
          <motion.div variants={cardVariants}>
            <KPICard label="Avg Margin" value={formatPct(avgMargin)} tooltip={TOOLTIPS.gross_margin} formulaId="risk_score_avg" confidence="derived" bottomContent={<MiniWave color="#0393da" />} />
          </motion.div>
        </motion.div>

        {/* Customer Concentration */}
        <ChartCard title="Customer Concentration" subtitle="Top 15 customers by estimated lifetime value" formulaId="customer_segments" confidence="verified">
          <div className="space-y-3">
            {top15WithCum.map((c) => (
              <div key={c.customer_id} className="grid grid-cols-[180px_1fr_80px_60px] items-center gap-4">
                <span className="text-sm font-medium truncate" title={c.name}>{c.name}</span>
                <div className="relative h-4 bg-slate-100 rounded-full overflow-hidden">
                  <div
                    className="absolute inset-y-0 left-0 rounded-full transition-all duration-500"
                    style={{
                      width: `${(c.ltv_estimated / maxLtv) * 100}%`,
                      background: 'linear-gradient(to right, #0393da, #c1e8ff)',
                    }}
                  />
                </div>
                <span className="text-xs font-bold text-right">{formatEUR(c.ltv_estimated)}</span>
                <span className="text-xs text-slate-400 text-right">{(c.cum_pct * 100).toFixed(0)}%</span>
              </div>
            ))}
          </div>
        </ChartCard>

        {/* Churn Matrix + Segments */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
          <ChartCard title="Risk Tier Matrix" formulaId="risk_distribution" confidence="derived">
            <div className="space-y-6">
              {churnMatrix.map((row) => (
                <div key={row.tier} className="flex flex-col gap-2">
                  <div className="flex h-10 gap-1">
                    {row.high > 0 && <div className="flex items-center justify-center bg-red-500 text-white text-[10px] font-bold rounded-l transition-all duration-300" style={{ width: `${row.high}%` }}>High</div>}
                    {row.med > 0 && <div className="flex items-center justify-center bg-amber-400 text-white text-[10px] font-bold transition-all duration-300" style={{ width: `${row.med}%` }}>Med</div>}
                    {row.low > 0 && <div className="flex items-center justify-center bg-green-500 text-white text-[10px] font-bold rounded-r transition-all duration-300" style={{ width: `${row.low}%` }}>Low</div>}
                  </div>
                  <p className="text-sm font-semibold">{row.tier}</p>
                </div>
              ))}
            </div>
          </ChartCard>

          <ChartCard title="Customer Segments" formulaId="churn_summary" confidence="forecast">
            <div className="p-4 bg-slate-50 rounded-lg">
              <p className="text-xs font-bold text-slate-400 uppercase mb-3">By Segment</p>
              <ul className="space-y-2">
                {segmentsMeta.map((s) => (
                  <li key={s.segment} className="flex justify-between text-sm">
                    <span>{s.segment}</span>
                    <div className="flex gap-4">
                      <span className="text-slate-500">{s.count} customers</span>
                      <span className="font-bold">{formatEUR(s.total_revenue)}</span>
                      <span className="text-slate-500">{formatPct(s.avg_margin)} margin</span>
                    </div>
                  </li>
                ))}
              </ul>
            </div>
            <div className="mt-4 p-4 border border-[#0393da]/20 bg-[#0393da]/5 rounded-lg">
              <div className="flex justify-between items-center">
                <div>
                  <p className="text-xs font-bold text-[#0393da] uppercase">Churn Summary</p>
                  <p className="text-sm font-medium mt-1">
                    <span className="text-red-500 font-bold">{churnHigh} High+Critical</span> / {churnMed} Medium / {churnLow} Low
                  </p>
                </div>
                <div className="text-right">
                  <p className="text-[10px] font-bold text-red-400 uppercase">LTV at Risk</p>
                  <p className="text-lg font-bold text-red-500">
                    {formatEUR(ltvAtRisk)}
                  </p>
                </div>
              </div>
            </div>
          </ChartCard>
        </div>

        {/* Customer Table */}
        <DataTable
          title="Customer List"
          columns={customerColumns}
          data={filteredCustomers}
          rowKey="customer_id"
          selectedRowId={selectedItem?.id}
          onRowClick={(row) => selectItem({ type: 'customer', id: row.customer_id, label: row.name, data: row })}
          formulaId="top_customers"
          confidence="verified"
        />

        <PhaseNotice type="mixed" />
      </div>
    </>
  );
}
