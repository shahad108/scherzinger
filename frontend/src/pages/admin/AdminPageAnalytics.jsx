import { useState, useEffect, useCallback } from 'react';
import { motion } from 'motion/react';
import {
  BarChart, Bar, AreaChart, Area, XAxis, YAxis, Tooltip, ResponsiveContainer,
  CartesianGrid, Cell,
} from 'recharts';
import { Loader, ArrowUpDown } from 'lucide-react';
import { useDateRange } from '../../hooks/useDateRange';

const PAGE_COLORS = {
  'Dashboard Overview': '#7C3AED',
  'Revenue & Margins': '#10b981',
  'Products & SKUs': '#f59e0b',
  'Customers': '#ef4444',
  'Forecasting': '#0393da',
  'Pricing & FX': '#06b6d4',
  'Inventory': '#f97316',
  'ML Analytics': '#6366f1',
  'AI Insights': '#ec4899',
};
const DEFAULT_COLOR = '#64748b';

function formatDuration(seconds) {
  if (!seconds) return '0s';
  if (seconds < 60) return `${seconds}s`;
  const m = Math.floor(seconds / 60);
  if (m < 60) return `${m}m ${seconds % 60}s`;
  return `${Math.floor(m / 60)}h ${m % 60}m`;
}

function scrollColor(depth) {
  if (depth >= 70) return '#10b981';
  if (depth >= 40) return '#f59e0b';
  return '#ef4444';
}

// ─── Page Ranking Table ──────────────────────────────────────────
function PageRankingTable({ ranking }) {
  const [sortKey, setSortKey] = useState('total_seconds');
  const [sortDir, setSortDir] = useState('desc');

  const handleSort = (key) => {
    if (sortKey === key) setSortDir(d => d === 'asc' ? 'desc' : 'asc');
    else { setSortKey(key); setSortDir('desc'); }
  };

  const sorted = [...ranking].sort((a, b) => {
    const av = a[sortKey] || 0, bv = b[sortKey] || 0;
    return sortDir === 'asc' ? av - bv : bv - av;
  });

  return (
    <div className="bg-white rounded-2xl overflow-hidden" style={{ boxShadow: '0 1px 4px rgba(0,0,0,0.04)' }}>
      <div className="p-5 pb-0">
        <h3 className="text-sm font-bold" style={{ color: '#1a1a2e' }}>Page Ranking</h3>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-left">
          <thead>
            <tr className="text-[10px] font-bold uppercase tracking-widest" style={{ color: '#737373' }}>
              <th className="px-5 py-3">#</th>
              <th className="px-5 py-3">Page</th>
              {[
                { key: 'total_seconds', label: 'Total Time' },
                { key: 'visits', label: 'Visits' },
                { key: 'avg_seconds', label: 'Avg Time' },
                { key: 'avg_scroll_depth', label: 'Scroll Depth' },
              ].map(col => (
                <th key={col.key} className="px-5 py-3 cursor-pointer select-none" onClick={() => handleSort(col.key)}>
                  <span className="inline-flex items-center gap-1">
                    {col.label}
                    {sortKey === col.key && <ArrowUpDown size={10} style={{ color: '#7C3AED' }} />}
                  </span>
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="text-sm">
            {sorted.map((p, i) => (
              <tr key={p.page} className="border-t border-slate-50 hover:bg-slate-50/50 transition-colors">
                <td className="px-5 py-3 font-bold" style={{ color: '#a3a3a3' }}>{i + 1}</td>
                <td className="px-5 py-3">
                  <div className="flex items-center gap-2">
                    <span className="w-2.5 h-2.5 rounded-full flex-shrink-0" style={{ background: PAGE_COLORS[p.page] || DEFAULT_COLOR }} />
                    <span className="font-medium" style={{ color: '#1a1a2e' }}>{p.page}</span>
                  </div>
                </td>
                <td className="px-5 py-3 font-semibold" style={{ color: '#1a1a2e' }}>{formatDuration(p.total_seconds)}</td>
                <td className="px-5 py-3">{p.visits}</td>
                <td className="px-5 py-3">{formatDuration(p.avg_seconds)}</td>
                <td className="px-5 py-3">
                  <div className="flex items-center gap-2">
                    <div className="w-16 h-2 bg-slate-100 rounded-full overflow-hidden">
                      <div className="h-full rounded-full" style={{ width: `${p.avg_scroll_depth}%`, background: scrollColor(p.avg_scroll_depth) }} />
                    </div>
                    <span className="text-xs font-semibold" style={{ color: scrollColor(p.avg_scroll_depth) }}>{p.avg_scroll_depth}%</span>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ─── Time Distribution (Bar Chart - cleaner than treemap) ────────
function TimeDistributionChart({ ranking }) {
  const data = ranking.filter(p => p.total_seconds > 0).map(p => ({
    name: p.page.length > 16 ? p.page.slice(0, 14) + '...' : p.page,
    fullName: p.page,
    minutes: Math.round(p.total_seconds / 60),
    color: PAGE_COLORS[p.page] || DEFAULT_COLOR,
  }));

  if (!data.length) return null;

  return (
    <div className="bg-white rounded-2xl p-5" style={{ boxShadow: '0 1px 4px rgba(0,0,0,0.04)' }}>
      <h3 className="text-sm font-bold mb-4" style={{ color: '#1a1a2e' }}>Time Distribution</h3>
      <div className="space-y-3">
        {data.map((d, i) => {
          const maxMin = data[0]?.minutes || 1;
          return (
            <div key={i} className="flex items-center gap-3">
              <span className="text-[11px] font-medium w-28 text-right truncate" style={{ color: '#525252' }}>{d.fullName}</span>
              <div className="flex-1 h-7 bg-slate-50 rounded-lg overflow-hidden">
                <motion.div
                  initial={{ width: 0 }}
                  animate={{ width: `${(d.minutes / maxMin) * 100}%` }}
                  transition={{ duration: 0.6, delay: i * 0.05 }}
                  className="h-full rounded-lg flex items-center justify-end pr-2"
                  style={{ background: d.color, minWidth: d.minutes > 0 ? 40 : 0 }}
                >
                  <span className="text-[10px] font-bold text-white">{d.minutes}m</span>
                </motion.div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ─── Page Usage Over Time (Stacked Area) ─────────────────────────
function PageUsageAreaChart({ daily, pageNames }) {
  if (!daily?.length) return null;

  const chartData = daily.map(d => ({
    ...d,
    label: new Date(d.day).toLocaleDateString('en-IN', { month: 'short', day: 'numeric' }),
  }));

  const sanitized = (pageNames || []).map(n => n.replace(/[^a-zA-Z]/g, '_'));

  return (
    <div className="bg-white rounded-2xl p-5" style={{ boxShadow: '0 1px 4px rgba(0,0,0,0.04)' }}>
      <h3 className="text-sm font-bold mb-4" style={{ color: '#1a1a2e' }}>Page Usage Over Time (minutes)</h3>
      <ResponsiveContainer width="100%" height={280}>
        <AreaChart data={chartData} margin={{ top: 5, right: 20, bottom: 5, left: 0 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
          <XAxis dataKey="label" tick={{ fontSize: 10, fill: '#a3a3a3' }} interval="preserveStartEnd" />
          <YAxis tick={{ fontSize: 10, fill: '#a3a3a3' }} width={35} />
          <Tooltip contentStyle={{ borderRadius: 12, border: 'none', boxShadow: '0 4px 16px rgba(0,0,0,0.08)', fontSize: 12 }} />
          {sanitized.map((key, i) => {
            const origName = (pageNames || [])[i];
            const color = PAGE_COLORS[origName] || DEFAULT_COLOR;
            return (
              <Area key={key} type="monotone" dataKey={key} stackId="1" stroke={color} fill={color} fillOpacity={0.6} name={origName} />
            );
          })}
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}

// ─── Scroll Depth Chart ──────────────────────────────────────────
function ScrollDepthChart({ scrollDepth }) {
  if (!scrollDepth?.length) return null;

  const data = scrollDepth.map(s => ({
    name: s.page.length > 16 ? s.page.slice(0, 14) + '...' : s.page,
    fullName: s.page,
    depth: s.avg_scroll,
    color: scrollColor(s.avg_scroll),
  }));

  return (
    <div className="bg-white rounded-2xl p-5" style={{ boxShadow: '0 1px 4px rgba(0,0,0,0.04)' }}>
      <h3 className="text-sm font-bold mb-4" style={{ color: '#1a1a2e' }}>Average Scroll Depth by Page</h3>
      <ResponsiveContainer width="100%" height={250}>
        <BarChart data={data} layout="vertical" margin={{ left: 10, right: 20, top: 5, bottom: 5 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" horizontal={false} />
          <XAxis type="number" domain={[0, 100]} tick={{ fontSize: 10, fill: '#a3a3a3' }} unit="%" />
          <YAxis type="category" dataKey="name" width={120} tick={{ fontSize: 11, fill: '#525252' }} />
          <Tooltip formatter={(val) => [`${val}%`, 'Scroll Depth']} contentStyle={{ borderRadius: 12, border: 'none', boxShadow: '0 4px 16px rgba(0,0,0,0.08)', fontSize: 12 }} />
          <Bar dataKey="depth" radius={[0, 6, 6, 0]} barSize={18}>
            {data.map((entry, i) => <Cell key={i} fill={entry.color} />)}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

// ─── Page Flow (simple visual) ───────────────────────────────────
function PageFlowDiagram({ flow }) {
  if (!flow?.length) return null;

  const maxCount = flow[0]?.count || 1;

  return (
    <div className="bg-white rounded-2xl p-5" style={{ boxShadow: '0 1px 4px rgba(0,0,0,0.04)' }}>
      <h3 className="text-sm font-bold mb-4" style={{ color: '#1a1a2e' }}>Top Navigation Paths</h3>
      <div className="space-y-2">
        {flow.slice(0, 12).map((f, i) => (
          <div key={i} className="flex items-center gap-3">
            <div className="flex items-center gap-2 flex-1 min-w-0">
              <span className="text-xs font-medium truncate px-2 py-1 rounded-lg" style={{ background: `${PAGE_COLORS[f.from] || DEFAULT_COLOR}15`, color: PAGE_COLORS[f.from] || DEFAULT_COLOR }}>
                {f.from}
              </span>
              <span className="text-slate-300">→</span>
              <span className="text-xs font-medium truncate px-2 py-1 rounded-lg" style={{ background: `${PAGE_COLORS[f.to] || DEFAULT_COLOR}15`, color: PAGE_COLORS[f.to] || DEFAULT_COLOR }}>
                {f.to}
              </span>
            </div>
            <div className="w-24 flex items-center gap-2">
              <div className="flex-1 h-2 bg-slate-100 rounded-full overflow-hidden">
                <div className="h-full rounded-full" style={{ width: `${(f.count / maxCount) * 100}%`, background: '#7C3AED' }} />
              </div>
              <span className="text-[11px] font-bold tabular-nums" style={{ color: '#7C3AED' }}>{f.count}</span>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

// ─── Main Page Analytics ─────────────────────────────────────────
export default function AdminPageAnalytics() {
  const { from, to } = useDateRange();
  const [data, setData] = useState(null);
  const [flow, setFlow] = useState(null);
  const [loading, setLoading] = useState(true);

  const fetchData = useCallback(async () => {
    try {
      const [pageRes, flowRes] = await Promise.all([
        fetch(`/api/admin/pages/analytics?from=${from}&to=${to}`),
        fetch(`/api/admin/pages/flow?from=${from}`),
      ]);
      if (pageRes.ok) setData(await pageRes.json());
      if (flowRes.ok) setFlow(await flowRes.json());
    } catch { /* silent */ } finally { setLoading(false); }
  }, [from, to]);

  useEffect(() => { setLoading(true); fetchData(); }, [fetchData]);

  if (loading) {
    return <div className="flex items-center justify-center h-[60vh]"><Loader size={24} className="animate-spin text-purple-400" /></div>;
  }

  return (
    <div className="p-6 space-y-6 max-w-7xl mx-auto">
      {/* Page Ranking Table */}
      <PageRankingTable ranking={data?.ranking || []} />

      {/* Treemap + Scroll Depth */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <TimeDistributionChart ranking={data?.ranking || []} />
        <ScrollDepthChart scrollDepth={data?.scrollDepth || []} />
      </div>

      {/* Stacked Area Chart */}
      <PageUsageAreaChart daily={data?.daily || []} pageNames={data?.pageNames || []} />

      {/* Page Flow */}
      <PageFlowDiagram flow={flow || []} />
    </div>
  );
}
