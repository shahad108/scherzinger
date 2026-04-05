import { useState, useEffect, useCallback } from 'react';
import { motion } from 'motion/react';
import {
  PieChart, Pie, Cell, BarChart, Bar, AreaChart, Area, LineChart, Line,
  XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid, Legend,
} from 'recharts';
import { Loader, MousePointerClick, BarChart2, Search, Filter, Package, Users } from 'lucide-react';
import AdminKPICard from '../../components/admin/AdminKPICard';
import { useDateRange } from '../../hooks/useDateRange';

const CAT_COLORS = {
  chart: '#8b5cf6', table: '#0393da', drilldown: '#f59e0b', navigation: '#10b981',
  filter: '#06b6d4', search: '#6366f1', ai_chat: '#ec4899', notification: '#ef4444', kpi: '#f97316',
};

const PAGE_NAMES = {
  '/': 'Dashboard', '/revenue': 'Revenue', '/products': 'Products',
  '/customers': 'Customers', '/forecasting': 'Forecasting', '/pricing': 'Pricing',
  '/inventory': 'Inventory', '/ml-analytics': 'ML Analytics', '/ai-insights': 'AI Insights',
};

function timeSince(dateStr) {
  const s = Math.round((Date.now() - new Date(dateStr).getTime()) / 1000);
  if (s < 60) return `${s}s ago`;
  if (s < 3600) return `${Math.round(s / 60)}m ago`;
  if (s < 86400) return `${Math.round(s / 3600)}h ago`;
  return `${Math.round(s / 86400)}d ago`;
}

// ─── Interaction Donut ───────────────────────────────────────────
function InteractionDonut({ categories }) {
  if (!categories?.length) return null;
  return (
    <div className="bg-white rounded-2xl p-5" style={{ boxShadow: '0 1px 4px rgba(0,0,0,0.04)' }}>
      <h3 className="text-sm font-bold mb-4" style={{ color: '#1a1a2e' }}>Interaction Categories</h3>
      <div className="flex items-center gap-6">
        <ResponsiveContainer width={180} height={180}>
          <PieChart>
            <Pie data={categories} dataKey="count" nameKey="category" cx="50%" cy="50%" innerRadius={50} outerRadius={80} paddingAngle={2}>
              {categories.map((c, i) => <Cell key={i} fill={CAT_COLORS[c.category] || '#94a3b8'} />)}
            </Pie>
            <Tooltip formatter={(val, name) => [val, name]} contentStyle={{ borderRadius: 12, border: 'none', fontSize: 12 }} />
          </PieChart>
        </ResponsiveContainer>
        <div className="flex-1 space-y-1.5">
          {categories.slice(0, 8).map((c, i) => (
            <div key={i} className="flex items-center justify-between text-xs">
              <div className="flex items-center gap-2">
                <span className="w-2.5 h-2.5 rounded-full" style={{ background: CAT_COLORS[c.category] || '#94a3b8' }} />
                <span className="text-slate-600 capitalize">{c.category.replace(/_/g, ' ')}</span>
              </div>
              <div className="flex items-center gap-2">
                <span className="font-bold" style={{ color: '#1a1a2e' }}>{c.count}</span>
                <span className="text-slate-400">{c.pct}%</span>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

// ─── Top Interactions Table ──────────────────────────────────────
function TopInteractionsTable({ interactions }) {
  if (!interactions?.length) return null;
  return (
    <div className="bg-white rounded-2xl p-5" style={{ boxShadow: '0 1px 4px rgba(0,0,0,0.04)' }}>
      <h3 className="text-sm font-bold mb-4" style={{ color: '#1a1a2e' }}>Top 20 Interactions</h3>
      <div className="overflow-x-auto max-h-80 overflow-y-auto">
        <table className="w-full text-left text-xs">
          <thead className="sticky top-0 bg-white">
            <tr className="text-[10px] font-bold uppercase tracking-widest" style={{ color: '#737373' }}>
              <th className="px-3 py-2">#</th>
              <th className="px-3 py-2">Interaction</th>
              <th className="px-3 py-2">Target</th>
              <th className="px-3 py-2">Page</th>
              <th className="px-3 py-2 text-right">Count</th>
              <th className="px-3 py-2 text-right">Last Used</th>
            </tr>
          </thead>
          <tbody>
            {interactions.map((item, i) => (
              <tr key={i} className="border-t border-slate-50 hover:bg-slate-50/50">
                <td className="px-3 py-2 font-bold text-slate-400">{i + 1}</td>
                <td className="px-3 py-2">
                  <span className="px-1.5 py-0.5 rounded text-[10px] font-bold" style={{ background: `${CAT_COLORS[item.event_type?.split('_')[0]] || '#94a3b8'}15`, color: CAT_COLORS[item.event_type?.split('_')[0]] || '#94a3b8' }}>
                    {item.event_type?.replace(/_/g, ' ')}
                  </span>
                </td>
                <td className="px-3 py-2 text-slate-600 truncate max-w-[150px]">{item.target || '—'}</td>
                <td className="px-3 py-2 text-slate-500">{PAGE_NAMES[item.page] || item.page}</td>
                <td className="px-3 py-2 text-right font-bold" style={{ color: '#7C3AED' }}>{item.count}</td>
                <td className="px-3 py-2 text-right text-slate-400">{timeSince(item.last)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ─── Top Drilled Items ───────────────────────────────────────────
function TopDrilledItems({ skus, customers }) {
  const RankedList = ({ title, items, icon: Icon, color }) => (
    <div className="bg-white rounded-2xl p-5" style={{ boxShadow: '0 1px 4px rgba(0,0,0,0.04)' }}>
      <div className="flex items-center gap-2 mb-4">
        <Icon size={14} style={{ color }} />
        <h3 className="text-sm font-bold" style={{ color: '#1a1a2e' }}>{title}</h3>
      </div>
      {items?.length ? (
        <div className="space-y-2">
          {items.slice(0, 8).map((item, i) => (
            <div key={i} className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <span className="text-[10px] font-bold text-slate-400 w-5">{i + 1}.</span>
                <span className="text-xs font-medium truncate" style={{ color: '#1a1a2e' }}>{item.name}</span>
              </div>
              <span className="text-xs font-bold" style={{ color }}>{item.count} views</span>
            </div>
          ))}
        </div>
      ) : (
        <p className="text-xs text-slate-400 text-center py-4">No drilldown data yet</p>
      )}
    </div>
  );

  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
      <RankedList title="Top Articles (by drilldown)" items={skus} icon={Package} color="#7C3AED" />
      <RankedList title="Top Customers (by drilldown)" items={customers} icon={Users} color="#10b981" />
    </div>
  );
}

// ─── KPI Attention Table ─────────────────────────────────────────
function KPIAttentionTable({ kpiAttention }) {
  if (!kpiAttention?.length) return null;
  const maxHover = kpiAttention[0]?.total_hover_ms || 1;

  return (
    <div className="bg-white rounded-2xl p-5" style={{ boxShadow: '0 1px 4px rgba(0,0,0,0.04)' }}>
      <h3 className="text-sm font-bold mb-4" style={{ color: '#1a1a2e' }}>KPI Card Attention</h3>
      <div className="space-y-3">
        {kpiAttention.slice(0, 10).map((k, i) => (
          <div key={i} className="flex items-center justify-between py-1.5">
            <div className="flex-1 min-w-0">
              <p className="text-xs font-semibold truncate" style={{ color: '#1a1a2e' }}>{k.card}</p>
              <p className="text-[10px] text-slate-400">
                {(k.total_hover_ms / 1000).toFixed(1)}s hover · {k.hover_count} hovers · {k.click_count} clicks
              </p>
            </div>
            <div className="w-28 flex items-center gap-2 ml-4">
              <div className="flex-1 h-2 bg-slate-100 rounded-full overflow-hidden">
                <div className="h-full rounded-full" style={{ width: `${(k.total_hover_ms / maxHover) * 100}%`, background: '#f59e0b' }} />
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

// ─── Interaction Trend Chart ─────────────────────────────────────
function InteractionTrendChart({ trend }) {
  if (!trend?.length) return null;

  const chartData = trend.map(d => ({
    ...d,
    label: new Date(d.day).toLocaleDateString('de-DE', { month: 'short', day: 'numeric' }),
  }));

  return (
    <div className="bg-white rounded-2xl p-5" style={{ boxShadow: '0 1px 4px rgba(0,0,0,0.04)' }}>
      <h3 className="text-sm font-bold mb-4" style={{ color: '#1a1a2e' }}>Interaction Trend</h3>
      <ResponsiveContainer width="100%" height={250}>
        <AreaChart data={chartData} margin={{ top: 5, right: 20, bottom: 5, left: 0 }}>
          <defs>
            <linearGradient id="intGrad" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#7C3AED" stopOpacity={0.15} />
              <stop offset="100%" stopColor="#7C3AED" stopOpacity={0} />
            </linearGradient>
          </defs>
          <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
          <XAxis dataKey="label" tick={{ fontSize: 10, fill: '#a3a3a3' }} interval="preserveStartEnd" />
          <YAxis tick={{ fontSize: 10, fill: '#a3a3a3' }} width={35} />
          <Tooltip contentStyle={{ borderRadius: 12, border: 'none', boxShadow: '0 4px 16px rgba(0,0,0,0.08)', fontSize: 12 }} />
          <Area type="monotone" dataKey="total" stroke="#7C3AED" strokeWidth={2} fill="url(#intGrad)" name="Total Events" />
          <Line type="monotone" dataKey="chart" stroke={CAT_COLORS.chart} strokeWidth={1.5} dot={false} name="Charts" />
          <Line type="monotone" dataKey="table" stroke={CAT_COLORS.table} strokeWidth={1.5} dot={false} name="Tables" />
          <Line type="monotone" dataKey="drilldown" stroke={CAT_COLORS.drilldown} strokeWidth={1.5} dot={false} name="Drilldowns" />
          <Legend wrapperStyle={{ fontSize: 10 }} />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}

// ─── Main Interactions Page ──────────────────────────────────────
export default function AdminInteractions() {
  const { from, to } = useDateRange();
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);

  const fetchData = useCallback(async () => {
    try {
      const res = await fetch(`/api/admin/interactions/analytics?from=${from}&to=${to}`);
      if (res.ok) setData(await res.json());
    } catch { /* silent */ } finally { setLoading(false); }
  }, [from, to]);

  useEffect(() => { setLoading(true); fetchData(); }, [fetchData]);

  if (loading) {
    return <div className="flex items-center justify-center h-[60vh]"><Loader size={24} className="animate-spin text-purple-400" /></div>;
  }

  const k = data?.kpis || {};

  return (
    <div className="p-6 space-y-6 max-w-7xl mx-auto">
      {/* KPI Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-5 gap-4">
        <AdminKPICard label="Total Events" icon={MousePointerClick} rawNumber={k.total} subtitle="Selected period" />
        <AdminKPICard label="Chart Clicks" icon={BarChart2} rawNumber={k.chart} change={k.total ? `${Math.round(k.chart / k.total * 100)}%` : ''} changeType="neutral" subtitle="of total" />
        <AdminKPICard label="Table Sorts" rawNumber={k.table} change={k.total ? `${Math.round(k.table / k.total * 100)}%` : ''} changeType="neutral" subtitle="of total" />
        <AdminKPICard label="Drilldowns" rawNumber={k.drilldown} change={k.total ? `${Math.round(k.drilldown / k.total * 100)}%` : ''} changeType="neutral" subtitle="of total" />
        <AdminKPICard label="Searches" icon={Search} rawNumber={k.search} change={k.total ? `${Math.round(k.search / k.total * 100)}%` : ''} changeType="neutral" subtitle="of total" />
      </div>

      {/* Donut + Top Interactions */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <InteractionDonut categories={data?.categories} />
        <div className="lg:col-span-2">
          <TopInteractionsTable interactions={data?.topInteractions} />
        </div>
      </div>

      {/* Trend Chart */}
      <InteractionTrendChart trend={data?.trend} />

      {/* Drilldowns + KPI Attention */}
      <TopDrilledItems skus={data?.drilldowns?.skus} customers={data?.drilldowns?.customers} />
      <KPIAttentionTable kpiAttention={data?.kpiAttention} />
    </div>
  );
}
