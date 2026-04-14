import { useState, useMemo } from 'react';
import {
  ScatterChart, Scatter, XAxis, YAxis, ZAxis, Tooltip, ResponsiveContainer,
  CartesianGrid, ReferenceLine, ReferenceArea, BarChart, Bar, Cell, LabelList,
} from 'recharts';
import { motion } from 'motion/react';
import { containerVariants, cardVariants } from '../utils/animations';
import Header from '../components/Header';
import KPICard from '../components/shared/KPICard';
import { MiniAvatars, MiniProgress, MiniWave } from '../components/shared/KPIVisuals';
import DataTable from '../components/shared/DataTable';
import StatusBadge from '../components/shared/StatusBadge';
import ChartCard from '../components/shared/ChartCard';
import PhaseNotice from '../components/shared/PhaseNotice';
import customersData from '../data/customers_detail.json';
import revenueMarginsDetail from '../data/revenue_margins_detail.json';
import { formatEUR, formatPct } from '../utils/formatters';
import { TOOLTIPS } from '../utils/tooltipContent';
import { useUI } from '../context/UIContext';
import { useLanguage } from '../context/LanguageContext';
import { IS_DEMO } from '../utils/brand';
import WTPBands from '../components/phase45/WTPBands';
import CLVRanking from '../components/phase45/CLVRanking';
import CrossSellPanel from '../components/phase45/CrossSellPanel';

const customers = customersData.customers;
const churnSummary = customersData.churn_summary;
const customerMarginGaps = revenueMarginsDetail.customer_margin_gaps;

// Derive segments meta from actual customers array so KPIs, scatter, risk matrix,
// and the Customer Segments panel all stay in sync.
const segmentsMeta = (() => {
  const map = {};
  customers.forEach((c) => {
    if (!map[c.segment]) map[c.segment] = { segment: c.segment, count: 0, total_revenue: 0, marginSum: 0, marginN: 0 };
    map[c.segment].count += 1;
    map[c.segment].total_revenue += c.total_revenue_eur || 0;
    if (c.avg_db2_margin != null) {
      map[c.segment].marginSum += c.avg_db2_margin;
      map[c.segment].marginN += 1;
    }
  });
  return Object.values(map)
    .map((s) => ({ segment: s.segment, count: s.count, total_revenue: s.total_revenue, avg_margin: s.marginN > 0 ? s.marginSum / s.marginN : 0 }))
    .sort((a, b) => b.total_revenue - a.total_revenue);
})();

const TOTAL_CUSTOMERS_UNIVERSE = customers.length;

// Risk tier definitions
const HIGH_RISK_TIERS = ['high', 'critical'];
const MED_RISK_TIERS = ['medium'];
const LOW_RISK_TIERS = ['low'];

// Plan-specified retention / movement metrics (locked demo numbers)
const RETENTION_METRICS = {
  retention_rate_pct: 42.2,
  churned_count: 259,
  churned_revenue_eur: 1100000,
  retained_count: 189,
  new_count: 202,
  new_revenue_eur: 1100000,
  base_count_2022: 448,
  end_count: 391,
  net_change_count: -57,
};

const TARGET_MARGIN = 0.60;
const FLOOR_MARGIN = 0.25;

// Risk tier color
const RISK_COLORS = {
  low: '#10b981',
  medium: '#e7a019',
  high: '#f97316',
  critical: '#ba1a1a',
};

const riskVariant = (tier) => {
  if (tier === 'critical') return 'danger';
  if (tier === 'high') return 'danger';
  if (tier === 'medium') return 'warning';
  return 'success';
};

const segmentVariant = (seg) => {
  if (seg === 'Enterprise') return 'info';
  if (seg === 'Mid-Market') return 'warning';
  return 'neutral';
};

function marginBadge(m) {
  if (m == null) return { color: '#737373', label: '—' };
  if (m < 0.50) return { color: '#ba1a1a', label: `${(m * 100).toFixed(1)}%` };
  if (m < 0.60) return { color: '#e7a019', label: `${(m * 100).toFixed(1)}%` };
  return { color: '#10b981', label: `${(m * 100).toFixed(1)}%` };
}

// Estimate last invoice year from revenue_by_year
function lastOrderYear(customer) {
  const years = [2025, 2024, 2023, 2022];
  for (const y of years) {
    if ((customer.revenue_by_year?.[y] || 0) > 0) return y;
  }
  return null;
}

// Margin slope (pp per year) from margin_by_year 2022 → 2025
function marginSlope(customer) {
  const m = customer.margin_by_year || {};
  const m22 = m['2022'];
  const m25 = m['2025'] ?? m['2024'] ?? m22;
  if (m22 == null || m25 == null) return null;
  const years = m['2025'] != null ? 3 : m['2024'] != null ? 2 : 1;
  return ((m25 - m22) / years) * 100;
}

// Estimated lost quote revenue from win_rate
function estimatedLostRevenue(customer) {
  const wr = customer.win_rate;
  const rev = customer.total_revenue_eur || 0;
  if (!wr || wr <= 0 || wr >= 1) return 0;
  return Math.round(rev * (1 - wr) / wr);
}

// Quoted-vs-actual gap: pull from revenue_margins_detail or derive
function quotedGapPp(customer) {
  const hit = customerMarginGaps.find((g) => g.customer_id === customer.customer_id);
  if (hit) return hit.all_time?.gap_pp ?? null;
  // Fallback: estimate gap proportional to (1-win_rate) * avg_margin
  const wr = customer.win_rate || 0.5;
  const gap = Math.max(0, (1 - wr) * 15);
  return +gap.toFixed(1);
}

// Products count (top_products is sample; vary count from top_products length + derived)
function productsCount(customer) {
  const base = (customer.top_products || []).length;
  // Derive from total_invoices as a proxy (more invoices → more products, capped)
  const est = Math.min(base + Math.round((customer.total_invoices || 0) / 30), 20);
  return Math.max(base, est);
}

// Composite action score
function actionScore(customer, enrichment) {
  const slopePenalty = enrichment.margin_slope_pp != null && enrichment.margin_slope_pp < 0
    ? Math.min(Math.abs(enrichment.margin_slope_pp) / 10, 1) : 0;
  const lostRevPenalty = Math.min(enrichment.lost_revenue_eur / 500000, 1);
  const ltvRiskPenalty = HIGH_RISK_TIERS.includes(customer.risk_tier)
    ? Math.min(customer.ltv_estimated / 1500000, 1) : 0;
  const inactivityPenalty = enrichment.last_order != null && enrichment.last_order < 2025 ? 0.5 : 0;
  return +(slopePenalty * 0.4 + lostRevPenalty * 0.3 + ltvRiskPenalty * 0.2 + inactivityPenalty * 0.1).toFixed(3);
}

function actionReasons(customer, enrichment, t) {
  const reasons = [];
  if (enrichment.margin_slope_pp != null && enrichment.margin_slope_pp < -1) {
    reasons.push({ icon: '🔻', label: t('customers.action.reason.margin', { value: enrichment.margin_slope_pp.toFixed(1) }), color: 'text-red-600 bg-red-50' });
  }
  if (enrichment.lost_revenue_eur > 200000) {
    reasons.push({ icon: '⚠️', label: t('customers.action.reason.lost', { value: formatEUR(enrichment.lost_revenue_eur) }), color: 'text-amber-700 bg-amber-50' });
  }
  if (HIGH_RISK_TIERS.includes(customer.risk_tier) && customer.ltv_estimated > 500000) {
    reasons.push({ icon: '💰', label: t('customers.action.reason.ltv', { value: formatEUR(customer.ltv_estimated) }), color: 'text-orange-700 bg-orange-50' });
  }
  if (enrichment.last_order != null && enrichment.last_order < 2025) {
    reasons.push({ icon: '⏰', label: t('customers.action.reason.lastOrder', { year: enrichment.last_order }), color: 'text-slate-600 bg-slate-100' });
  }
  return reasons;
}

function suggestedAction(customer, enrichment, t) {
  if (enrichment.lost_revenue_eur > 500000) return t('customers.action.reviewPricing');
  if (enrichment.margin_slope_pp != null && enrichment.margin_slope_pp < -3) return t('customers.action.renegotiate');
  if (enrichment.last_order != null && enrichment.last_order < 2025) return t('customers.action.reEngage');
  if (HIGH_RISK_TIERS.includes(customer.risk_tier)) return t('customers.action.retention');
  return t('customers.action.routine');
}

export default function Customers() {
  const { selectItem, selectedItem, openCustomerDetail } = useUI();
  const { t } = useLanguage();
  const [segmentFilter, setSegmentFilter] = useState('All');
  const [churnFilter, setChurnFilter] = useState('All');
  const [customerSearch, setCustomerSearch] = useState('');
  const [tablePreset, setTablePreset] = useState('glance'); // 'glance' | 'risk' | 'competitiveness' | 'portfolio' | 'full'

  // Customer enrichment
  const enrichedCustomers = useMemo(() =>
    customers.map((c) => {
      const margin_slope_pp = marginSlope(c);
      const lost_revenue_eur = estimatedLostRevenue(c);
      const quoted_gap_pp = quotedGapPp(c);
      const last_order = lastOrderYear(c);
      const products = productsCount(c);
      const enrichment = { margin_slope_pp, lost_revenue_eur, quoted_gap_pp, last_order, products };
      return {
        ...c,
        margin_slope_pp,
        lost_revenue_eur,
        quoted_gap_pp,
        last_order,
        products,
        action_score: actionScore(c, enrichment),
      };
    }),
    []);

  const filteredCustomers = useMemo(() => {
    let list = enrichedCustomers;
    if (segmentFilter !== 'All') list = list.filter((c) => c.segment === segmentFilter);
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
    const riskOrder = (c) => c.risk_tier === 'critical' ? 0 : c.risk_tier === 'high' ? 1 : c.risk_tier === 'medium' ? 2 : 3;
    return [...list].sort((a, b) => riskOrder(a) - riskOrder(b) || b.ltv_estimated - a.ltv_estimated);
  }, [enrichedCustomers, segmentFilter, churnFilter, customerSearch]);

  // KPIs
  const filteredCount = filteredCustomers.length;
  const filteredLtv = filteredCustomers.reduce((s, c) => s + c.ltv_estimated, 0);
  const highCriticalCount = filteredCustomers.filter((c) => HIGH_RISK_TIERS.includes(c.risk_tier)).length;
  const avgMargin = filteredCustomers.length
    ? filteredCustomers.reduce((s, c) => s + c.avg_db2_margin, 0) / filteredCustomers.length
    : 0;

  // YoY margin (avg of margin_by_year 2024 - 2025)
  const marginYoYDeltaPp = useMemo(() => {
    const m24 = enrichedCustomers.map((c) => c.margin_by_year?.['2024']).filter((v) => v != null);
    const m25 = enrichedCustomers.map((c) => c.margin_by_year?.['2025']).filter((v) => v != null);
    if (!m24.length || !m25.length) return null;
    const avg24 = m24.reduce((s, v) => s + v, 0) / m24.length;
    const avg25 = m25.reduce((s, v) => s + v, 0) / m25.length;
    return (avg25 - avg24) * 100;
  }, [enrichedCustomers]);

  // Scatter data — group by risk tier
  const scatterData = useMemo(() => {
    const grouped = {};
    filteredCustomers.forEach((c) => {
      const tier = c.risk_tier || 'low';
      if (!grouped[tier]) grouped[tier] = [];
      grouped[tier].push({
        x: c.total_revenue_eur,
        y: c.avg_db2_margin,
        z: c.total_invoices || 1,
        name: c.name,
        customer_id: c.customer_id,
        segment: c.segment,
      });
    });
    return grouped;
  }, [filteredCustomers]);

  // Growing/declining (top 5 each based on revenue_by_year 2022 → 2024)
  const growingDeclining = useMemo(() => {
    const deltas = enrichedCustomers.map((c) => {
      const r22 = c.revenue_by_year?.['2022'] || 0;
      const r24 = c.revenue_by_year?.['2024'] || 0;
      return { customer_id: c.customer_id, name: c.name, delta: r24 - r22, rev_2022: r22, rev_2024: r24 };
    });
    const sorted = [...deltas].sort((a, b) => b.delta - a.delta);
    const growers = sorted.slice(0, 5);
    const decliners = sorted.slice(-5).reverse();
    // Combine into single diverging array with decliners on left (negative), growers on right
    const combined = [...decliners.reverse(), ...growers].map((d) => ({
      ...d,
      label: d.customer_id,
    }));
    return combined;
  }, [enrichedCustomers]);

  // Concentration — top 15 by LTV with margin health
  const top15 = useMemo(() => {
    const totalLtv = enrichedCustomers.reduce((s, c) => s + c.ltv_estimated, 0);
    let cumulative = 0;
    return [...enrichedCustomers]
      .sort((a, b) => b.ltv_estimated - a.ltv_estimated)
      .slice(0, 15)
      .map((c) => {
        cumulative += c.ltv_estimated;
        return { ...c, cum_pct: cumulative / totalLtv };
      });
  }, [enrichedCustomers]);
  const maxLtv = top15[0]?.ltv_estimated || 1;

  // Risk matrix — € revenue at risk per (segment × risk_tier)
  const riskMatrix = useMemo(() => {
    const tiers = ['Enterprise', 'Mid-Market', 'SME', 'Occasional'];
    return tiers.map((segment) => {
      const group = enrichedCustomers.filter((c) => c.segment === segment);
      const highRev = group.filter((c) => HIGH_RISK_TIERS.includes(c.risk_tier)).reduce((s, c) => s + c.total_revenue_eur, 0);
      const medRev = group.filter((c) => MED_RISK_TIERS.includes(c.risk_tier)).reduce((s, c) => s + c.total_revenue_eur, 0);
      const lowRev = group.filter((c) => LOW_RISK_TIERS.includes(c.risk_tier)).reduce((s, c) => s + c.total_revenue_eur, 0);
      const total = highRev + medRev + lowRev || 1;
      return { segment, highRev, medRev, lowRev, total };
    });
  }, [enrichedCustomers]);

  // Action list (top 8 by score)
  const actionList = useMemo(() =>
    [...enrichedCustomers]
      .sort((a, b) => b.action_score - a.action_score)
      .slice(0, 8)
      .map((c) => ({
        ...c,
        reasons: actionReasons(c, c, t),
        action: suggestedAction(c, c, t),
      })),
    [enrichedCustomers, t]);

  // Table presets
  const marginSlopeCell = (v) => {
    if (v == null) return '—';
    const color = v < -1 ? 'text-red-600' : v < 0 ? 'text-amber-600' : 'text-emerald-600';
    const arrow = v < -0.5 ? '↓' : v > 0.5 ? '↑' : '→';
    return <span className={`font-semibold ${color}`}>{arrow} {v >= 0 ? '+' : ''}{v.toFixed(1)}pp/yr</span>;
  };

  const lastOrderCell = (v) => {
    if (v == null) return '—';
    const isStale = v < 2025;
    return <span className={isStale ? 'text-red-600 font-semibold' : 'text-slate-700'}>{v}{isStale && ' ⚠'}</span>;
  };

  const productsCell = (v) => {
    if (v == null || v === 0) return '—';
    const isSingle = v === 1;
    return <span className={isSingle ? 'text-red-600 font-bold' : 'font-semibold'}>{v}{isSingle && ' ⚠'}</span>;
  };

  const columnPresets = {
    glance: [
      { key: 'customer_id', label: t('customers.col.id'), render: (v) => <span className="font-mono font-bold text-[#0393da]">{v}</span> },
      { key: 'name', label: t('customers.col.customer') },
      { key: 'segment', label: t('customers.col.segment'), render: (v) => <StatusBadge label={v} variant={segmentVariant(v)} /> },
      { key: 'total_revenue_eur', label: t('customers.col.revenue'), align: 'right', render: (v) => <span className="font-semibold">{formatEUR(v)}</span> },
      { key: 'avg_db2_margin', label: t('customers.col.avgMargin'), align: 'right', render: (v) => {
        const badge = marginBadge(v);
        return <span className="font-semibold" style={{ color: badge.color }}>{badge.label}</span>;
      } },
      { key: 'margin_slope_pp', label: t('customers.col.marginTrend'), align: 'right', tooltip: TOOLTIPS.margin_trend_slope, render: marginSlopeCell },
      { key: 'risk_tier', label: t('customers.col.risk'), render: (v) => <StatusBadge label={v} variant={riskVariant(v)} /> },
    ],
    risk: [
      { key: 'customer_id', label: t('customers.col.id'), render: (v) => <span className="font-mono font-bold text-[#0393da]">{v}</span> },
      { key: 'name', label: t('customers.col.customer') },
      { key: 'risk_score', label: t('customers.col.riskScore'), align: 'right', render: (v) => v != null ? <span className="font-bold">{(v * 100).toFixed(0)}</span> : '—' },
      { key: 'risk_tier', label: t('customers.col.riskTier'), render: (v) => <StatusBadge label={v} variant={riskVariant(v)} /> },
      { key: 'margin_slope_pp', label: t('customers.col.marginTrend'), align: 'right', render: marginSlopeCell },
      { key: 'last_order', label: t('customers.col.lastOrder'), align: 'right', tooltip: TOOLTIPS.last_order, render: lastOrderCell },
      { key: 'ltv_estimated', label: t('customers.col.estLtv'), align: 'right', render: (v) => <span className="font-semibold">{formatEUR(v)}</span> },
    ],
    competitiveness: [
      { key: 'customer_id', label: t('customers.col.id'), render: (v) => <span className="font-mono font-bold text-[#0393da]">{v}</span> },
      { key: 'name', label: t('customers.col.customer') },
      { key: 'total_revenue_eur', label: t('customers.col.revenue'), align: 'right', render: (v) => <span className="font-semibold">{formatEUR(v)}</span> },
      { key: 'win_rate', label: t('customers.col.winRate'), align: 'right', render: (v) => {
        if (v == null) return '—';
        const c = v < 0.40 ? 'text-red-600' : v < 0.60 ? 'text-amber-600' : 'text-emerald-600';
        return <span className={`font-semibold ${c}`}>{(v * 100).toFixed(1)}%</span>;
      } },
      { key: 'lost_revenue_eur', label: t('customers.col.lostQuoteRev'), align: 'right', tooltip: TOOLTIPS.lost_revenue, render: (v) => <span className="font-bold text-red-600">{formatEUR(v)}</span> },
      { key: 'quoted_gap_pp', label: t('customers.col.marginGap'), align: 'right', render: (v) => {
        if (v == null) return '—';
        const c = v >= 15 ? 'text-red-600' : v >= 10 ? 'text-amber-600' : 'text-slate-700';
        return <span className={`font-semibold ${c}`}>{v.toFixed(1)}pp</span>;
      } },
    ],
    portfolio: [
      { key: 'customer_id', label: t('customers.col.id'), render: (v) => <span className="font-mono font-bold text-[#0393da]">{v}</span> },
      { key: 'name', label: t('customers.col.customer') },
      { key: 'products', label: t('customers.col.products'), align: 'right', tooltip: TOOLTIPS.customer_count, render: productsCell },
      { key: 'total_invoices', label: t('customers.col.invoices'), align: 'right' },
      { key: 'total_revenue_eur', label: t('customers.col.revenue'), align: 'right', render: (v) => <span className="font-semibold">{formatEUR(v)}</span> },
      { key: 'avg_db2_margin', label: t('customers.col.avgMargin'), align: 'right', render: (v) => {
        const badge = marginBadge(v);
        return <span className="font-semibold" style={{ color: badge.color }}>{badge.label}</span>;
      } },
      { key: 'segment', label: t('customers.col.segment'), render: (v) => <StatusBadge label={v} variant={segmentVariant(v)} /> },
    ],
    full: [
      { key: 'customer_id', label: t('customers.col.id'), render: (v) => <span className="font-mono font-bold text-[#0393da]">{v}</span> },
      { key: 'name', label: t('customers.col.customer') },
      { key: 'segment', label: t('customers.col.segment'), render: (v) => <StatusBadge label={v} variant={segmentVariant(v)} /> },
      { key: 'total_revenue_eur', label: t('customers.col.revenue'), align: 'right', render: (v) => <span className="font-semibold">{formatEUR(v)}</span> },
      { key: 'avg_db2_margin', label: t('customers.col.margin'), align: 'right', render: (v) => {
        const badge = marginBadge(v);
        return <span className="font-semibold" style={{ color: badge.color }}>{badge.label}</span>;
      } },
      { key: 'margin_slope_pp', label: t('customers.col.trend'), align: 'right', render: marginSlopeCell },
      { key: 'quoted_gap_pp', label: t('customers.col.gap'), align: 'right', render: (v) => v == null ? '—' : <span>{v.toFixed(1)}pp</span> },
      { key: 'win_rate', label: t('customers.col.winPct'), align: 'right', render: (v) => v == null ? '—' : `${(v * 100).toFixed(0)}%` },
      { key: 'lost_revenue_eur', label: t('customers.col.lost'), align: 'right', render: (v) => <span className="text-red-600">{formatEUR(v)}</span> },
      { key: 'products', label: t('customers.col.skus'), align: 'right', render: productsCell },
      { key: 'total_invoices', label: t('customers.col.inv'), align: 'right' },
      { key: 'last_order', label: t('customers.col.last'), align: 'right', render: lastOrderCell },
      { key: 'risk_tier', label: t('customers.col.risk'), render: (v) => <StatusBadge label={v} variant={riskVariant(v)} /> },
      { key: 'ltv_estimated', label: t('customers.col.ltv'), align: 'right', render: (v) => <span className="font-semibold">{formatEUR(v)}</span> },
    ],
  };

  const customerColumns = columnPresets[tablePreset];
  const netRevDelta = RETENTION_METRICS.new_revenue_eur - RETENTION_METRICS.churned_revenue_eur;

  return (
    <>
      <Header title={t('customers.title')} />
      <div className="p-8 space-y-6 max-w-[1440px] mx-auto">
        {/* Filter Bar */}
        <div className="flex flex-wrap items-center gap-4">
          <div className="relative flex-1 max-w-sm">
            <input
              type="text"
              placeholder={t('customers.search.placeholder')}
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
                  segmentFilter === seg ? 'bg-[#0393da] text-white' : 'bg-white border border-slate-200 hover:border-[#0393da]'
                }`}
              >
                {seg === 'All' ? t('customers.filter.allSegments') : seg}
              </button>
            ))}
          </div>
          <div className="flex gap-1.5">
            {['All', 'High', 'Medium', 'Low'].map((risk) => (
              <button
                key={risk}
                onClick={() => setChurnFilter(risk)}
                className={`px-3 py-1.5 rounded-full text-xs font-medium transition-all flex items-center gap-1.5 ${
                  churnFilter === risk ? 'bg-[#0393da] text-white' : 'bg-white border border-slate-200 hover:border-[#0393da]'
                }`}
              >
                {risk !== 'All' && (
                  <span className={`size-2 rounded-full ${
                    risk === 'High' ? 'bg-red-500' : risk === 'Medium' ? 'bg-amber-500' : 'bg-green-500'
                  }`} />
                )}
                {risk === 'All' ? t('customers.filter.allRisk') : t('customers.filter.riskSuffix', { risk })}
              </button>
            ))}
          </div>
          {(segmentFilter !== 'All' || churnFilter !== 'All' || customerSearch) && (
            <button
              onClick={() => { setSegmentFilter('All'); setChurnFilter('All'); setCustomerSearch(''); }}
              className="text-xs text-[#0393da] font-medium hover:underline"
            >
              {t('customers.filter.clear')}
            </button>
          )}
        </div>

        {/* Row 0 — KPI Cards */}
        <motion.div
          className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6"
          variants={containerVariants}
          initial="hidden"
          animate="visible"
        >
          <motion.div variants={cardVariants}>
            <KPICard
              label={t('customers.kpi.total')}
              value={filteredCount.toLocaleString()}
              tooltip={TOOLTIPS.active_customers}
              formulaId="customer_count"
              confidence="verified"
              bottomContent={
                <div className="text-[10px] italic" style={{ color: '#737373' }}>
                  {t('customers.kpi.total.bottom', { n: TOTAL_CUSTOMERS_UNIVERSE.toLocaleString() })}
                </div>
              }
            />
          </motion.div>
          <motion.div variants={cardVariants}>
            <KPICard
              label={t('customers.kpi.retention')}
              value={`${RETENTION_METRICS.retention_rate_pct.toFixed(1)}%`}
              change={t('customers.kpi.retention.change', { value: formatEUR(RETENTION_METRICS.churned_revenue_eur) })}
              changeType="warning"
              tooltip={TOOLTIPS.retention_rate}
              formulaId="customer_segments"
              confidence="derived"
              bottomContent={<MiniProgress value={RETENTION_METRICS.retention_rate_pct} color="#e7a019" />}
            />
          </motion.div>
          <motion.div
            variants={cardVariants}
            onClick={() => setChurnFilter(churnFilter === 'High' ? 'All' : 'High')}
            className="cursor-pointer"
          >
            <KPICard
              label={t('customers.kpi.highRisk')}
              value={highCriticalCount}
              change={churnFilter === 'High' ? t('customers.kpi.clickToClear') : t('customers.kpi.clickToFilter')}
              changeType="negative"
              tooltip={TOOLTIPS.churn_risk}
              formulaId="risk_distribution"
              confidence="derived"
              bottomContent={<MiniProgress value={highCriticalCount} max={filteredCount || 1} color="#EF4444" />}
            />
          </motion.div>
          <motion.div variants={cardVariants}>
            <KPICard
              label={t('customers.kpi.avgMargin')}
              value={formatPct(avgMargin)}
              change={marginYoYDeltaPp != null ? `${marginYoYDeltaPp >= 0 ? '▲' : '▼'}${Math.abs(marginYoYDeltaPp).toFixed(1)}pp YoY` : undefined}
              changeType={marginYoYDeltaPp >= 0 ? 'positive' : 'warning'}
              tooltip={TOOLTIPS.gross_margin}
              formulaId="risk_score_avg"
              confidence="derived"
              bottomContent={<MiniWave color={avgMargin >= 0.60 ? '#10b981' : '#e7a019'} />}
            />
          </motion.div>
        </motion.div>

        {/* Row 1 — Revenue x Margin Scatter */}
        <ChartCard
          title={t('customers.scatter.title')}
          subtitle={t('customers.scatter.subtitle')}
          formulaId="top_customers"
          confidence="verified"
          headerRight={
            <div className="flex items-center gap-3 text-[10px] font-semibold">
              {Object.entries(RISK_COLORS).map(([tier, color]) => (
                <div key={tier} className="flex items-center gap-1.5">
                  <span className="size-2 rounded-full" style={{ backgroundColor: color }} />
                  <span className="uppercase tracking-wider text-slate-500">{t(`dashboard.tier.${tier}`)}</span>
                </div>
              ))}
            </div>
          }
        >
          <div className="h-[440px] relative">
            <ResponsiveContainer width="100%" height="100%">
              <ScatterChart margin={{ top: 16, right: 20, bottom: 20, left: 10 }}>
                <CartesianGrid stroke="#f0f0f0" strokeDasharray="none" />
                <XAxis
                  type="number"
                  dataKey="x"
                  name="Revenue"
                  tickFormatter={(v) => formatEUR(v)}
                  tick={{ fontSize: 10, fill: '#94a3b8' }}
                  tickLine={false}
                  label={{ value: t('customers.scatter.axis.revenue'), position: 'bottom', fontSize: 10 }}
                />
                <YAxis
                  type="number"
                  dataKey="y"
                  name="Margin"
                  tickFormatter={(v) => `${(v * 100).toFixed(0)}%`}
                  tick={{ fontSize: 10, fill: '#94a3b8' }}
                  tickLine={false}
                  axisLine={false}
                  domain={[0, 1]}
                  ticks={[0, 0.25, 0.5, 0.75, 1]}
                  label={{ value: t('customers.scatter.axis.margin'), angle: -90, position: 'insideLeft', fontSize: 10 }}
                />
                <ZAxis type="number" dataKey="z" range={[40, 400]} />
                <ReferenceArea y1={0} y2={FLOOR_MARGIN} fill="#fef2f2" fillOpacity={0.6} />
                <ReferenceArea y1={FLOOR_MARGIN} y2={TARGET_MARGIN} fill="#fffbeb" fillOpacity={0.5} />
                <ReferenceLine
                  y={TARGET_MARGIN}
                  stroke="#10b981"
                  strokeDasharray="4 4"
                  strokeWidth={1.5}
                  label={{ value: t('customers.scatter.target60'), position: 'insideTopRight', fill: '#10b981', fontSize: 10, fontWeight: 700 }}
                />
                <ReferenceLine
                  y={FLOOR_MARGIN}
                  stroke="#EF4444"
                  strokeDasharray="5 5"
                  label={{ value: t('customers.scatter.floor25'), position: 'insideBottomRight', fill: '#EF4444', fontSize: 10, fontWeight: 700 }}
                />
                <Tooltip
                  cursor={{ strokeDasharray: '3 3' }}
                  content={({ payload }) => {
                    if (!payload?.length) return null;
                    const d = payload[0].payload;
                    return (
                      <div className="border border-slate-100 rounded-xl p-3 shadow-xl text-xs backdrop-blur-sm" style={{ background: 'rgba(255,255,255,0.95)' }}>
                        <p className="font-bold text-slate-900 mb-1">{d.name}</p>
                        <p className="font-mono text-[10px] text-slate-400 mb-2 pb-2 border-b border-slate-100">{d.customer_id} · {d.segment}</p>
                        <div className="space-y-1">
                          <div className="flex justify-between gap-4"><span className="text-slate-500">{t('customers.scatter.tip.revenue')}</span><span className="font-bold">{formatEUR(d.x)}</span></div>
                          <div className="flex justify-between gap-4"><span className="text-slate-500">{t('customers.scatter.tip.margin')}</span><span className={`font-bold ${d.y < FLOOR_MARGIN ? 'text-red-500' : d.y < TARGET_MARGIN ? 'text-amber-600' : 'text-green-600'}`}>{formatPct(d.y)}</span></div>
                          <div className="flex justify-between gap-4"><span className="text-slate-500">{t('customers.scatter.tip.invoices')}</span><span className="font-bold">{d.z}</span></div>
                        </div>
                      </div>
                    );
                  }}
                />
                {Object.entries(scatterData).map(([tier, points]) => (
                  <Scatter
                    key={tier}
                    name={tier}
                    data={points}
                    fill={RISK_COLORS[tier] || '#64748B'}
                    fillOpacity={0.7}
                    stroke={RISK_COLORS[tier] || '#64748B'}
                    strokeWidth={1.5}
                    cursor="pointer"
                    onClick={(data) => { selectItem({ type: 'customer', id: data.customer_id, label: data.name, data }); openCustomerDetail(data.customer_id); }}
                  />
                ))}
              </ScatterChart>
            </ResponsiveContainer>
            {/* Quadrant labels */}
            <div className="pointer-events-none absolute top-6 left-[70px] text-[10px] font-bold uppercase tracking-wider text-slate-400/70">{t('customers.scatter.q.profitable')}</div>
            <div className="pointer-events-none absolute top-6 right-6 text-[10px] font-bold uppercase tracking-wider text-emerald-600/80">{t('customers.scatter.q.strategic')}</div>
            <div className="pointer-events-none absolute bottom-14 left-[70px] text-[10px] font-bold uppercase tracking-wider text-slate-400/70">{t('customers.scatter.q.review')}</div>
            <div className="pointer-events-none absolute bottom-14 right-6 text-[10px] font-bold uppercase tracking-wider text-red-600/80">{t('customers.scatter.q.fix')}</div>
          </div>
        </ChartCard>

        {/* Row 2 — Customer Movement */}
        <div>
          <div className="mb-3">
            <h3 className="font-bold text-base" style={{ fontFamily: "'Manrope', sans-serif", color: '#1a1a2e' }}>{t('customers.movement.title')}</h3>
            <p className="text-xs mt-0.5" style={{ color: '#737373' }}>{t('customers.movement.subtitle')}</p>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
            <div className="p-5 rounded-2xl shadow-sm" style={{ background: '#fff', boxShadow: '0 8px 32px rgba(26,26,46,0.04)' }}>
              <div className="flex justify-between items-start mb-2">
                <p className="text-[11px] font-semibold uppercase tracking-wider" style={{ color: '#737373' }}>{t('customers.movement.churned')}</p>
                <span className="text-xs text-red-600 font-bold">{t('customers.movement.churnedDelta')}</span>
              </div>
              <p className="text-2xl font-bold text-red-600">−{RETENTION_METRICS.churned_count}</p>
              <p className="text-xs mt-1 text-slate-500">{t('customers.movement.lost', { value: formatEUR(-RETENTION_METRICS.churned_revenue_eur) })}</p>
            </div>
            <div className="p-5 rounded-2xl shadow-sm" style={{ background: '#fff', boxShadow: '0 8px 32px rgba(26,26,46,0.04)' }}>
              <div className="flex justify-between items-start mb-2">
                <p className="text-[11px] font-semibold uppercase tracking-wider" style={{ color: '#737373' }}>{t('customers.movement.retained')}</p>
              </div>
              <p className="text-2xl font-bold text-slate-700">{RETENTION_METRICS.retained_count}</p>
              <p className="text-xs mt-1 text-slate-500">{t('customers.movement.retainedSub', { pct: RETENTION_METRICS.retention_rate_pct.toFixed(1) })}</p>
            </div>
            <div className="p-5 rounded-2xl shadow-sm" style={{ background: '#fff', boxShadow: '0 8px 32px rgba(26,26,46,0.04)' }}>
              <div className="flex justify-between items-start mb-2">
                <p className="text-[11px] font-semibold uppercase tracking-wider" style={{ color: '#737373' }}>{t('customers.movement.new')}</p>
                <span className="text-xs text-emerald-600 font-bold">{t('customers.movement.newDelta')}</span>
              </div>
              <p className="text-2xl font-bold text-emerald-600">+{RETENTION_METRICS.new_count}</p>
              <p className="text-xs mt-1 text-slate-500">{t('customers.movement.added', { value: formatEUR(RETENTION_METRICS.new_revenue_eur) })}</p>
            </div>
            <div className="p-5 rounded-2xl shadow-sm border-l-4 border-[#0393da]" style={{ background: '#fff', boxShadow: '0 8px 32px rgba(26,26,46,0.04)' }}>
              <div className="flex justify-between items-start mb-2">
                <p className="text-[11px] font-semibold uppercase tracking-wider" style={{ color: '#737373' }}>{t('customers.movement.netChange')}</p>
              </div>
              <p className="text-2xl font-bold" style={{ color: '#1a1a2e' }}>{RETENTION_METRICS.net_change_count}</p>
              <p className="text-xs mt-1 text-slate-500">{t('customers.movement.netSub', { value: `${netRevDelta >= 0 ? '+' : ''}${formatEUR(netRevDelta)}`, n: RETENTION_METRICS.end_count })}</p>
            </div>
          </div>
        </div>

        {/* Row 3 — Growing vs Declining */}
        <ChartCard
          title={t('customers.growing.title')}
          subtitle={t('customers.growing.subtitle')}
          tooltip={TOOLTIPS.growing_declining}
          formulaId="top_customers"
          confidence="verified"
        >
          <div className="h-[320px]">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={growingDeclining} layout="vertical" margin={{ top: 8, right: 100, left: 100, bottom: 8 }}>
                <CartesianGrid stroke="#f0f0f0" horizontal={false} />
                <XAxis
                  type="number"
                  tickFormatter={(v) => formatEUR(v)}
                  tick={{ fontSize: 10, fill: '#94a3b8' }}
                  axisLine={false}
                  tickLine={false}
                />
                <YAxis
                  type="category"
                  dataKey="label"
                  tick={{ fontSize: 10, fill: '#1a1a2e', fontWeight: 600, fontFamily: 'monospace' }}
                  width={80}
                  axisLine={false}
                  tickLine={false}
                />
                <Tooltip
                  cursor={{ fill: 'rgba(148,163,184,0.08)' }}
                  content={({ active, payload }) => {
                    if (!active || !payload?.length) return null;
                    const d = payload[0].payload;
                    return (
                      <div className="px-3 py-2 rounded-lg shadow-lg text-xs" style={{ background: '#fff', border: '1px solid #e5e5e5' }}>
                        <div className="font-bold mb-1">{d.name}</div>
                        <div className="text-slate-500">2022: <span className="font-semibold">{formatEUR(d.rev_2022)}</span></div>
                        <div className="text-slate-500">2024: <span className="font-semibold">{formatEUR(d.rev_2024)}</span></div>
                        <div className="pt-1 mt-1" style={{ borderTop: '1px solid #f0f0f0' }}>
                          Δ <span className={`font-bold ${d.delta >= 0 ? 'text-emerald-600' : 'text-red-600'}`}>{d.delta >= 0 ? '+' : ''}{formatEUR(d.delta)}</span>
                        </div>
                      </div>
                    );
                  }}
                />
                <ReferenceLine x={0} stroke="#94a3b8" strokeWidth={1} />
                <Bar dataKey="delta" radius={4} animationDuration={800}>
                  {growingDeclining.map((entry, i) => (
                    <Cell key={i} fill={entry.delta >= 0 ? '#10b981' : '#ef4444'} />
                  ))}
                  <LabelList
                    dataKey="delta"
                    position="right"
                    formatter={(v) => (typeof v === 'number' ? `${v >= 0 ? '+' : ''}${formatEUR(v)}` : '')}
                    style={{ fontSize: 10, fontWeight: 700, fill: '#1a1a2e' }}
                  />
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
          <p className="text-[10px] italic text-slate-500 mt-2">
            {t('customers.growing.note')}
          </p>
        </ChartCard>

        {/* Row 4 — Customer Concentration (enhanced) */}
        <ChartCard
          title={t('customers.concentration.title')}
          subtitle={t('customers.concentration.subtitle')}
          formulaId="customer_segments"
          confidence="verified"
        >
          <div className="space-y-2.5">
            {top15.map((c) => {
              const badge = marginBadge(c.avg_db2_margin);
              return (
                <div key={c.customer_id} className="grid grid-cols-[160px_1fr_90px_60px_50px] items-center gap-3 text-xs">
                  <span className="font-medium truncate" title={c.name}>{c.name}</span>
                  <div className="relative h-5 bg-slate-100 rounded-md overflow-hidden">
                    <div
                      className="absolute inset-y-0 left-0 rounded-md transition-all duration-500"
                      style={{ width: `${(c.ltv_estimated / maxLtv) * 100}%`, background: '#94a3b8' }}
                    />
                  </div>
                  <span className="font-bold text-right">{formatEUR(c.ltv_estimated)}</span>
                  <span
                    className="px-2 py-0.5 rounded-full text-[10px] font-bold text-white text-center"
                    style={{ backgroundColor: badge.color }}
                  >
                    {badge.label}
                  </span>
                  <span className="text-slate-400 text-right">{(c.cum_pct * 100).toFixed(0)}%</span>
                </div>
              );
            })}
          </div>
        </ChartCard>

        {/* Row 5 — Risk Matrix + Segments */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <ChartCard title={t('customers.risk.title')} subtitle={t('customers.risk.subtitle')} formulaId="risk_distribution" confidence="derived">
            <div className="space-y-4">
              {riskMatrix.map((row) => {
                const highPct = (row.highRev / row.total) * 100;
                const medPct = (row.medRev / row.total) * 100;
                const lowPct = (row.lowRev / row.total) * 100;
                return (
                  <div key={row.segment}>
                    <div className="flex justify-between items-center mb-1.5">
                      <span className="text-xs font-bold" style={{ color: '#1a1a2e' }}>{row.segment}</span>
                      <span className="text-[10px] text-slate-500">{formatEUR(row.total)}</span>
                    </div>
                    <div className="flex h-8 rounded overflow-hidden">
                      {row.highRev > 0 && (
                        <div className="flex items-center justify-center bg-red-500 text-white text-[10px] font-bold px-1 transition-all duration-300" style={{ width: `${highPct}%` }}>
                          {highPct > 18 ? formatEUR(row.highRev) : ''}
                        </div>
                      )}
                      {row.medRev > 0 && (
                        <div className="flex items-center justify-center bg-amber-500 text-white text-[10px] font-bold px-1 transition-all duration-300" style={{ width: `${medPct}%` }}>
                          {medPct > 18 ? formatEUR(row.medRev) : ''}
                        </div>
                      )}
                      {row.lowRev > 0 && (
                        <div className="flex items-center justify-center bg-emerald-500 text-white text-[10px] font-bold px-1 transition-all duration-300" style={{ width: `${lowPct}%` }}>
                          {lowPct > 18 ? formatEUR(row.lowRev) : ''}
                        </div>
                      )}
                    </div>
                  </div>
                );
              })}
              <div className="flex items-center gap-4 pt-3 border-t border-slate-100 text-[10px]">
                <span className="flex items-center gap-1.5"><span className="size-2 rounded-full bg-red-500" />{t('customers.risk.legend.high')}</span>
                <span className="flex items-center gap-1.5"><span className="size-2 rounded-full bg-amber-500" />{t('customers.risk.legend.medium')}</span>
                <span className="flex items-center gap-1.5"><span className="size-2 rounded-full bg-emerald-500" />{t('customers.risk.legend.low')}</span>
              </div>
            </div>
          </ChartCard>

          <ChartCard title={t('customers.segments.title')} formulaId="customer_segments" confidence="verified">
            <div className="space-y-3">
              {segmentsMeta.map((s) => {
                const badge = marginBadge(s.avg_margin);
                return (
                  <div key={s.segment} className="p-3 bg-slate-50 rounded-lg">
                    <div className="flex justify-between items-center mb-2">
                      <span className="font-bold text-sm" style={{ color: '#1a1a2e' }}>{s.segment}</span>
                      <span className="text-[10px] font-bold px-2 py-0.5 rounded-full text-white" style={{ backgroundColor: badge.color }}>
                        {badge.label}
                      </span>
                    </div>
                    <div className="flex justify-between text-xs text-slate-600">
                      <span>{t('customers.segments.count', { n: s.count.toLocaleString() })}</span>
                      <span className="font-semibold text-slate-800">{formatEUR(s.total_revenue)}</span>
                    </div>
                  </div>
                );
              })}
            </div>
          </ChartCard>
        </div>

        {/* Row 6 — Customer Table with View Presets */}
        <motion.div variants={cardVariants}>
          <DataTable
            title={t('customers.table.title')}
            columns={customerColumns}
            data={filteredCustomers}
            rowKey="customer_id"
            selectedRowId={selectedItem?.id}
            onRowClick={(row) => { selectItem({ type: 'customer', id: row.customer_id, label: row.name, data: row }); openCustomerDetail(row.customer_id); }}
            formulaId="top_customers"
            confidence="verified"
            headerRight={
              <div className="flex items-center gap-1 p-1 bg-slate-100 rounded-lg">
                {[
                  { key: 'glance', label: t('customers.preset.glance') },
                  { key: 'risk', label: t('customers.preset.risk') },
                  { key: 'competitiveness', label: t('customers.preset.competitive') },
                  { key: 'portfolio', label: t('customers.preset.portfolio') },
                  { key: 'full', label: t('customers.preset.full') },
                ].map((p) => (
                  <button
                    key={p.key}
                    onClick={() => setTablePreset(p.key)}
                    className={`px-2.5 py-1 text-[11px] font-medium rounded-md transition-all ${
                      tablePreset === p.key ? 'bg-white text-[#0393da] shadow-sm font-bold' : 'text-slate-500 hover:text-slate-900'
                    }`}
                  >
                    {p.label}
                  </button>
                ))}
              </div>
            }
          />
        </motion.div>

        {/* Row 7 — Action List */}
        <div className="p-6 rounded-2xl shadow-sm" style={{ background: '#fff', boxShadow: '0 8px 32px rgba(26,26,46,0.04)' }}>
          <div className="flex justify-between items-start mb-4">
            <div>
              <h3 className="font-bold text-base" style={{ fontFamily: "'Manrope', sans-serif", color: '#1a1a2e' }}>
                {t('customers.action.title')}
              </h3>
              <p className="text-xs mt-0.5" style={{ color: '#737373' }}>
                {t('customers.action.subtitle')}
              </p>
            </div>
            <span className="px-2.5 py-1 text-[10px] font-bold uppercase tracking-wider rounded-full bg-[#0393da] text-white">{t('customers.action.monday')}</span>
          </div>
          <div className="space-y-2">
            {actionList.map((a, i) => (
              <div
                key={a.customer_id}
                className="flex items-center gap-4 p-3 rounded-lg hover:bg-slate-50 transition-colors cursor-pointer"
                onClick={() => { selectItem({ type: 'customer', id: a.customer_id, label: a.name, data: a }); openCustomerDetail(a.customer_id); }}
              >
                <span className="w-6 text-center text-sm font-bold text-slate-400">{i + 1}</span>
                <div className="min-w-[120px]">
                  <span className="font-mono font-bold text-[#0393da] text-sm">{a.customer_id}</span>
                  <p className="text-[11px] text-slate-500 truncate max-w-[100px]">{a.segment}</p>
                </div>
                <div className="flex flex-wrap gap-1.5 flex-1">
                  {a.reasons.length === 0 && <span className="text-[11px] italic text-slate-400">{t('customers.action.baseline')}</span>}
                  {a.reasons.map((r, j) => (
                    <span key={j} className={`inline-flex items-center gap-1 text-[10px] font-semibold px-2 py-0.5 rounded-full ${r.color}`}>
                      {r.icon} {r.label}
                    </span>
                  ))}
                </div>
                <span className="text-xs font-semibold text-slate-700">{a.action}</span>
                <svg className="size-4 text-slate-400" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" /></svg>
              </div>
            ))}
          </div>
        </div>

        {IS_DEMO && (
          <div className="space-y-6 mt-8">
            <WTPBands />
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              <CLVRanking />
              <CrossSellPanel />
            </div>
          </div>
        )}

        <PhaseNotice type="mixed" />
      </div>
    </>
  );
}
