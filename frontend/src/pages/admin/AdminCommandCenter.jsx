import { useState, useEffect, useCallback } from 'react';
import { motion } from 'motion/react';
import {
  LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid, Area, AreaChart,
} from 'recharts';
import {
  Activity, Clock, Eye, MousePointerClick, MessageSquare, Zap,
  Wifi, WifiOff, RefreshCw, Loader, FileBarChart, Star, Package, Users, Filter,
} from 'lucide-react';
import AdminKPICard from '../../components/admin/AdminKPICard';

const PAGE_NAMES = {
  '/': 'Dashboard', '/revenue': 'Revenue & Margins', '/products': 'Products & SKUs',
  '/customers': 'Customers', '/forecasting': 'Forecasting', '/pricing': 'Pricing & FX',
  '/inventory': 'Inventory', '/ml-analytics': 'ML Analytics', '/ai-insights': 'AI Insights',
};

const EVENT_ICONS = {
  chart: '📊', table: '🔄', drilldown: '🔍', navigation: '🧭',
  notification: '🔔', filter: '⚙️', search: '🔎', ai_chat: '💬', kpi: '📌',
};

function formatDuration(seconds) {
  if (!seconds || seconds < 60) return `${seconds || 0}s`;
  const m = Math.floor(seconds / 60);
  if (m < 60) return `${m}m`;
  const h = Math.floor(m / 60);
  return `${h}h ${m % 60}m`;
}

function diffLabel(today, yesterday) {
  if (!yesterday) return null;
  const diff = today - yesterday;
  if (diff === 0) return { text: 'same as yesterday', type: 'neutral' };
  const sign = diff > 0 ? '+' : '';
  return { text: `${sign}${diff} vs yesterday`, type: diff > 0 ? 'positive' : 'negative' };
}

// ─── Live Status Banner ──────────────────────────────────────────
function LiveStatusBanner({ live, lastEvent }) {
  const timeSince = live?.last_seen ? Math.round((Date.now() - new Date(live.last_seen).getTime()) / 1000) : null;
  const timeLabel = timeSince != null
    ? timeSince < 60 ? `${timeSince}s ago` : timeSince < 3600 ? `${Math.round(timeSince / 60)}m ago` : `${Math.round(timeSince / 3600)}h ago`
    : '';

  return (
    <motion.div
      initial={{ opacity: 0, y: -8 }}
      animate={{ opacity: 1, y: 0 }}
      className="rounded-2xl p-5 flex items-center justify-between"
      style={{
        background: live?.online ? 'linear-gradient(135deg, #f0fdf4, #ecfdf5)' : '#f8fafc',
        border: live?.online ? '1px solid #bbf7d0' : '1px solid #e2e8f0',
      }}
    >
      <div className="flex items-center gap-4">
        <div className={`w-4 h-4 rounded-full ${live?.online ? 'bg-green-500 animate-pulse' : 'bg-slate-300'}`} />
        <div>
          <p className="text-sm font-bold" style={{ color: '#1a1a2e' }}>
            VIVEK IS {live?.online ? 'ONLINE' : 'OFFLINE'}
          </p>
          {live?.online ? (
            <p className="text-xs mt-0.5" style={{ color: '#525252' }}>
              Currently on: <span className="font-semibold" style={{ color: '#7C3AED' }}>{PAGE_NAMES[live.current_page] || live.current_page}</span>
              {live.is_active ? ' — actively using' : ' — idle'}
            </p>
          ) : (
            <p className="text-xs mt-0.5" style={{ color: '#737373' }}>Last seen: {timeLabel}</p>
          )}
          {lastEvent && (
            <p className="text-[11px] mt-1" style={{ color: '#a3a3a3' }}>
              Last action: {lastEvent.event_type?.replace(/_/g, ' ')} {lastEvent.target_element ? `on ${lastEvent.target_element}` : ''}
            </p>
          )}
        </div>
      </div>
      {live?.online ? <Wifi size={22} className="text-green-500" /> : <WifiOff size={22} className="text-slate-300" />}
    </motion.div>
  );
}

// ─── Quick Stats Grid ────────────────────────────────────────────
function QuickStatsGrid({ stats }) {
  const items = [
    { label: 'Most Visited Page', value: stats?.topPage?.name || '—', detail: stats?.topPage ? `${stats.topPage.visits} visits, ${formatDuration(stats.topPage.seconds)}` : '', icon: FileBarChart },
    { label: 'Most Used Feature', value: stats?.topFeature?.name?.replace(/_/g, ' ') || '—', detail: stats?.topFeature ? `${stats.topFeature.count} times` : '', icon: Star },
    { label: 'Most Viewed SKU', value: stats?.topSKU?.name || '—', detail: stats?.topSKU ? `${stats.topSKU.count} drilldowns` : '', icon: Package },
    { label: 'Most Viewed Customer', value: stats?.topCustomer?.name || '—', detail: stats?.topCustomer ? `${stats.topCustomer.count} drilldowns` : '', icon: Users },
    { label: 'Avg Session Length', value: stats?.avgSessionMinutes ? `${stats.avgSessionMinutes}m` : '—', detail: '30-day average', icon: Clock },
  ];

  return (
    <div className="grid grid-cols-2 lg:grid-cols-5 gap-4">
      {items.map((item, i) => (
        <motion.div
          key={i}
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: i * 0.05 }}
          className="bg-white rounded-xl p-4"
          style={{ boxShadow: '0 1px 4px rgba(0,0,0,0.04)' }}
        >
          <div className="flex items-center gap-2 mb-2">
            <item.icon size={14} style={{ color: '#7C3AED' }} />
            <p className="text-[10px] font-semibold uppercase tracking-wider" style={{ color: '#a3a3a3' }}>{item.label}</p>
          </div>
          <p className="text-sm font-bold truncate" style={{ color: '#1a1a2e' }}>{item.value}</p>
          <p className="text-[10px] mt-0.5" style={{ color: '#a3a3a3' }}>{item.detail}</p>
        </motion.div>
      ))}
    </div>
  );
}

// ─── Live Event Feed ─────────────────────────────────────────────
function LiveEventFeed({ events }) {
  if (!events?.length) {
    return (
      <div className="bg-white rounded-2xl p-5" style={{ boxShadow: '0 1px 4px rgba(0,0,0,0.04)' }}>
        <h3 className="text-sm font-bold mb-4" style={{ color: '#1a1a2e' }}>Live Event Feed</h3>
        <div className="flex items-center justify-center h-32 text-sm text-slate-400">
          No events recorded yet. Events appear as Vivek uses the dashboard.
        </div>
      </div>
    );
  }

  return (
    <div className="bg-white rounded-2xl p-5" style={{ boxShadow: '0 1px 4px rgba(0,0,0,0.04)' }}>
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-sm font-bold" style={{ color: '#1a1a2e' }}>Live Event Feed</h3>
        <span className="flex items-center gap-1.5 text-[10px] font-semibold" style={{ color: '#10b981' }}>
          <span className="w-2 h-2 rounded-full bg-green-500 animate-pulse" /> LIVE
        </span>
      </div>
      <div className="max-h-72 overflow-y-auto space-y-0">
        {events.map((e, i) => {
          const time = new Date(e.created_at).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
          const icon = EVENT_ICONS[e.event_category] || '•';
          return (
            <div key={i} className="flex items-center gap-3 py-1.5 px-1 border-b border-slate-50 last:border-0 text-xs">
              <span className="text-[10px] font-mono tabular-nums flex-shrink-0" style={{ color: '#a3a3a3' }}>{time}</span>
              <span className="flex-shrink-0">{icon}</span>
              <span className="text-slate-600 truncate">
                <span className="font-medium">{e.event_type?.replace(/_/g, ' ')}</span>
                {e.target_element && <span className="text-slate-400"> — {e.target_element}</span>}
              </span>
              <span className="text-[10px] text-slate-400 flex-shrink-0 ml-auto">{PAGE_NAMES[e.page_path] || e.page_path}</span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ─── Usage Trend Chart ───────────────────────────────────────────
function UsageTrendChart({ data }) {
  const [metric, setMetric] = useState('minutes');
  const metrics = [
    { key: 'minutes', label: 'Time (min)' },
    { key: 'sessions', label: 'Sessions' },
    { key: 'events', label: 'Events' },
    { key: 'pages', label: 'Page Views' },
  ];

  if (!data?.length) {
    return (
      <div className="bg-white rounded-2xl p-5" style={{ boxShadow: '0 1px 4px rgba(0,0,0,0.04)' }}>
        <h3 className="text-sm font-bold mb-4" style={{ color: '#1a1a2e' }}>Usage Trend (30 Days)</h3>
        <div className="flex items-center justify-center h-[250px] text-sm text-slate-400">No trend data yet</div>
      </div>
    );
  }

  const chartData = data.map(d => ({
    ...d,
    label: new Date(d.day).toLocaleDateString('en-IN', { month: 'short', day: 'numeric' }),
  }));

  return (
    <div className="bg-white rounded-2xl p-5" style={{ boxShadow: '0 1px 4px rgba(0,0,0,0.04)' }}>
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-sm font-bold" style={{ color: '#1a1a2e' }}>Usage Trend (30 Days)</h3>
        <div className="flex gap-1">
          {metrics.map(m => (
            <button
              key={m.key}
              onClick={() => setMetric(m.key)}
              className={`px-3 py-1 rounded-lg text-[11px] font-semibold transition-colors ${
                metric === m.key ? 'bg-purple-100 text-purple-700' : 'text-slate-400 hover:bg-slate-50'
              }`}
            >
              {m.label}
            </button>
          ))}
        </div>
      </div>
      <ResponsiveContainer width="100%" height={250}>
        <AreaChart data={chartData} margin={{ top: 5, right: 20, bottom: 5, left: 0 }}>
          <defs>
            <linearGradient id="trendGrad" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#7C3AED" stopOpacity={0.2} />
              <stop offset="100%" stopColor="#7C3AED" stopOpacity={0} />
            </linearGradient>
          </defs>
          <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
          <XAxis dataKey="label" tick={{ fontSize: 10, fill: '#a3a3a3' }} interval="preserveStartEnd" />
          <YAxis tick={{ fontSize: 10, fill: '#a3a3a3' }} width={40} />
          <Tooltip
            contentStyle={{ borderRadius: 12, border: 'none', boxShadow: '0 4px 16px rgba(0,0,0,0.08)', fontSize: 12 }}
          />
          <Area type="monotone" dataKey={metric} stroke="#7C3AED" strokeWidth={2} fill="url(#trendGrad)" dot={false} />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}

// ─── Main Command Center ─────────────────────────────────────────
export default function AdminCommandCenter() {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const fetchData = useCallback(async () => {
    try {
      const res = await fetch('/api/admin/command-center');
      if (res.ok) setData(await res.json());
    } catch { /* silent */ } finally { setLoading(false); }
  }, []);

  useEffect(() => {
    fetchData();
    const interval = setInterval(fetchData, 30000);
    return () => clearInterval(interval);
  }, [fetchData]);

  const handleRefresh = async () => {
    setRefreshing(true);
    await fetchData();
    setRefreshing(false);
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-[60vh]">
        <Loader size={24} className="animate-spin text-purple-400" />
      </div>
    );
  }

  const t = data?.today || {};
  const y = data?.yesterday || {};
  const sessionsDiff = diffLabel(t.sessions, y.sessions);
  const timeDiff = diffLabel(Math.round(t.total_time_seconds / 60), Math.round(y.total_time_seconds / 60));
  const pagesDiff = diffLabel(t.page_views, y.page_views);
  const eventsDiff = diffLabel(t.events, y.events);
  const chatDiff = diffLabel(t.chat_questions, y.chat_questions);

  // Build sparklines from trend data (last 7 entries)
  const trend7 = (data?.trend || []).slice(-7);
  const sessionsSpark = trend7.map(d => d.sessions);
  const timeSpark = trend7.map(d => d.minutes);
  const pagesSpark = trend7.map(d => d.pages);
  const eventsSpark = trend7.map(d => d.events);

  return (
    <div className="p-6 space-y-6 max-w-7xl mx-auto">
      {/* Refresh */}
      <div className="flex items-center justify-end">
        <button
          onClick={handleRefresh}
          disabled={refreshing}
          className="flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors"
          style={{ background: '#f5f3ff', color: '#7C3AED' }}
        >
          <RefreshCw size={14} className={refreshing ? 'animate-spin' : ''} />
          Refresh
        </button>
      </div>

      {/* Live Status Banner */}
      <LiveStatusBanner live={data?.live} lastEvent={data?.feed?.[0]} />

      {/* Today's KPI Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-5 gap-4">
        <AdminKPICard
          label="Sessions" icon={Activity}
          rawNumber={t.sessions} change={sessionsDiff?.text} changeType={sessionsDiff?.type || 'neutral'}
          sparklineData={sessionsSpark.length > 1 ? sessionsSpark : null} subtitle="Today"
        />
        <AdminKPICard
          label="Total Time" icon={Clock}
          value={formatDuration(t.total_time_seconds)} change={timeDiff?.text} changeType={timeDiff?.type || 'neutral'}
          sparklineData={timeSpark.length > 1 ? timeSpark : null} subtitle="Today"
        />
        <AdminKPICard
          label="Page Views" icon={Eye}
          rawNumber={t.page_views} change={pagesDiff?.text} changeType={pagesDiff?.type || 'neutral'}
          sparklineData={pagesSpark.length > 1 ? pagesSpark : null} subtitle="Today"
        />
        <AdminKPICard
          label="Events" icon={MousePointerClick}
          rawNumber={t.events} change={eventsDiff?.text} changeType={eventsDiff?.type || 'neutral'}
          sparklineData={eventsSpark.length > 1 ? eventsSpark : null} subtitle="Today"
        />
        <AdminKPICard
          label="AI Questions" icon={MessageSquare}
          rawNumber={t.chat_questions} change={chatDiff?.text} changeType={chatDiff?.type || 'neutral'}
          subtitle="Today"
        />
      </div>

      {/* Usage Trend + Live Feed */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2">
          <UsageTrendChart data={data?.trend} />
        </div>
        <LiveEventFeed events={data?.feed} />
      </div>

      {/* Quick Stats */}
      <QuickStatsGrid stats={data?.quickStats} />
    </div>
  );
}
