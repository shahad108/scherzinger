import { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion } from 'motion/react';
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid, Cell,
} from 'recharts';
import {
  Activity, Clock, Eye, MessageSquare, MousePointerClick,
  RefreshCw, Wifi, WifiOff, LayoutDashboard, Loader,
} from 'lucide-react';
import Header from '../components/Header';

const PAGE_COLORS = {
  'Dashboard Overview': '#0393da',
  'Revenue & Margins': '#10b981',
  'Products & SKUs': '#8b5cf6',
  'Customers': '#f59e0b',
  'Forecasting': '#ef4444',
  'Pricing & FX': '#06b6d4',
  'Inventory': '#f97316',
  'ML Analytics': '#6366f1',
  'AI Insights': '#ec4899',
  'Admin Dashboard': '#64748b',
};

function StatCard({ label, value, icon: Icon, color = '#0393da' }) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      className="bg-white rounded-2xl p-5 flex items-center gap-4"
      style={{ boxShadow: '0 1px 4px rgba(0,0,0,0.04)' }}
    >
      <div className="w-12 h-12 rounded-xl flex items-center justify-center flex-shrink-0"
        style={{ background: `${color}15` }}>
        <Icon size={22} style={{ color }} />
      </div>
      <div>
        <p className="text-2xl font-bold" style={{ color: '#1a1a2e' }}>{value}</p>
        <p className="text-[11px] font-semibold uppercase tracking-wider" style={{ color: '#737373' }}>{label}</p>
      </div>
    </motion.div>
  );
}

function LiveBadge({ online, currentPage, isActive, lastSeen }) {
  const timeSince = lastSeen ? Math.round((Date.now() - new Date(lastSeen).getTime()) / 1000) : null;
  const timeLabel = timeSince != null
    ? timeSince < 60 ? `${timeSince}s ago`
    : timeSince < 3600 ? `${Math.round(timeSince / 60)}m ago`
    : `${Math.round(timeSince / 3600)}h ago`
    : 'Unknown';

  return (
    <motion.div
      initial={{ opacity: 0, y: -8 }}
      animate={{ opacity: 1, y: 0 }}
      className="bg-white rounded-2xl p-5 flex items-center justify-between"
      style={{ boxShadow: '0 1px 4px rgba(0,0,0,0.04)' }}
    >
      <div className="flex items-center gap-4">
        <div className={`w-4 h-4 rounded-full ${online ? 'bg-green-500 animate-pulse' : 'bg-slate-300'}`} />
        <div>
          <p className="text-sm font-bold" style={{ color: '#1a1a2e' }}>
            Vivek is {online ? 'ONLINE' : 'OFFLINE'}
          </p>
          {online && currentPage && (
            <p className="text-xs mt-0.5" style={{ color: '#737373' }}>
              Currently on <span className="font-semibold text-[#0393da]">{currentPage}</span>
              {isActive ? ' — active' : ' — idle'}
            </p>
          )}
          {!online && (
            <p className="text-xs mt-0.5" style={{ color: '#a3a3a3' }}>Last seen: {timeLabel}</p>
          )}
        </div>
      </div>
      {online ? <Wifi size={20} className="text-green-500" /> : <WifiOff size={20} className="text-slate-300" />}
    </motion.div>
  );
}

function EventFeedItem({ event }) {
  const time = new Date(event.created_at).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
  const categoryColors = {
    chart: '#8b5cf6',
    table: '#0393da',
    drilldown: '#f59e0b',
    navigation: '#10b981',
    notification: '#ef4444',
    filter: '#06b6d4',
    search: '#6366f1',
    ai_chat: '#ec4899',
    kpi: '#f97316',
  };
  const color = categoryColors[event.event_category] || '#64748b';

  return (
    <div className="flex items-center gap-3 py-2 px-1 border-b border-slate-50 last:border-0">
      <span className="text-[10px] font-mono tabular-nums flex-shrink-0" style={{ color: '#a3a3a3' }}>{time}</span>
      <span className="px-1.5 py-0.5 rounded text-[9px] font-bold uppercase flex-shrink-0"
        style={{ background: `${color}15`, color }}>
        {event.event_category}
      </span>
      <span className="text-xs text-slate-600 truncate">
        <span className="font-medium">{event.event_type}</span>
        {event.target_element && <span className="text-slate-400"> on {event.target_element}</span>}
      </span>
      <span className="text-[10px] text-slate-400 flex-shrink-0 ml-auto">{event.page_path}</span>
    </div>
  );
}

export default function Admin() {
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [isAdmin, setIsAdmin] = useState(false);
  const [refreshing, setRefreshing] = useState(false);

  const [live, setLive] = useState({ online: false, current_page: null, is_active: false, last_seen: null });
  const [todayStats, setTodayStats] = useState({ sessions_count: 0, total_page_views: 0, total_events: 0, total_chat_questions: 0, page_time: [], events: [], chat: [] });
  const [topPages, setTopPages] = useState([]);
  const [topInteractions, setTopInteractions] = useState([]);
  const [kpiStats, setKpiStats] = useState([]);
  const [eventFeed, setEventFeed] = useState([]);

  const fetchAll = useCallback(async () => {
    try {
      const [liveRes, todayRes, pagesRes, interactionsRes, kpiRes, feedRes] = await Promise.all([
        fetch('/api/admin/live'),
        fetch('/api/admin/stats/today'),
        fetch('/api/admin/stats/pages'),
        fetch('/api/admin/stats/interactions'),
        fetch('/api/admin/stats/kpi'),
        fetch('/api/admin/stats/feed'),
      ]);

      if (liveRes.status === 403) {
        setIsAdmin(false);
        setLoading(false);
        return;
      }

      setIsAdmin(true);
      setLive(await liveRes.json());
      setTodayStats(await todayRes.json());
      setTopPages(await pagesRes.json());
      setTopInteractions(await interactionsRes.json());
      setKpiStats(await kpiRes.json());
      setEventFeed(await feedRes.json());
    } catch (err) {
      console.error('Admin fetch error:', err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchAll();
    const interval = setInterval(fetchAll, 30000); // Auto-refresh every 30s
    return () => clearInterval(interval);
  }, [fetchAll]);

  const handleRefresh = async () => {
    setRefreshing(true);
    await fetchAll();
    setRefreshing(false);
  };

  // Auth check
  if (loading) {
    return (
      <div className="flex items-center justify-center h-[60vh]">
        <Loader size={24} className="animate-spin text-slate-400" />
      </div>
    );
  }

  if (!isAdmin) {
    return (
      <div className="flex flex-col items-center justify-center h-[60vh] gap-4">
        <div className="w-16 h-16 rounded-2xl bg-red-50 flex items-center justify-center">
          <LayoutDashboard size={28} className="text-red-500" />
        </div>
        <h2 className="text-lg font-bold" style={{ color: '#1a1a2e' }}>Admin Access Required</h2>
        <p className="text-sm" style={{ color: '#737373' }}>Sign in as admin to view analytics.</p>
        <button onClick={() => navigate('/login')} className="px-4 py-2 rounded-lg text-sm font-semibold text-white" style={{ background: '#0393da' }}>
          Go to Login
        </button>
      </div>
    );
  }

  // Prepare chart data
  const pageChartData = topPages.slice(0, 8).map(p => ({
    name: p.page.length > 18 ? p.page.slice(0, 16) + '...' : p.page,
    fullName: p.page,
    minutes: Math.round(p.total_seconds / 60 * 10) / 10,
    visits: p.visits,
    color: PAGE_COLORS[p.page] || '#64748b',
  }));

  const interactionChartData = topInteractions.slice(0, 10).map(i => {
    const [type, target] = i.event.split(':');
    return {
      name: target?.length > 20 ? target.slice(0, 18) + '...' : (target || type),
      fullName: i.event,
      count: i.count,
      type,
    };
  });

  // Chat stats
  const chatFromSuggestions = (todayStats.chat || []).filter(c => c.question_source === 'suggestion_button').length;
  const chatCustom = (todayStats.chat || []).filter(c => c.question_source === 'custom_typed').length;
  const thumbsUp = (todayStats.chat || []).filter(c => c.response_rating === 'thumbs_up').length;
  const thumbsDown = (todayStats.chat || []).filter(c => c.response_rating === 'thumbs_down').length;

  return (
    <>
      <Header title="Admin Analytics" />
      <div className="p-6 space-y-6 max-w-7xl mx-auto">
        {/* Refresh button */}
        <div className="flex items-center justify-between">
          <p className="text-xs" style={{ color: '#a3a3a3' }}>Auto-refreshes every 30s</p>
          <button
            onClick={handleRefresh}
            disabled={refreshing}
            className="flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors"
            style={{ background: '#f8f9fa', color: '#525252' }}
          >
            <RefreshCw size={14} className={refreshing ? 'animate-spin' : ''} />
            Refresh
          </button>
        </div>

        {/* Live Status */}
        <LiveBadge {...live} />

        {/* Today's Stats */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          <StatCard label="Sessions Today" value={todayStats.sessions_count} icon={Activity} color="#0393da" />
          <StatCard label="Page Views" value={todayStats.total_page_views} icon={Eye} color="#10b981" />
          <StatCard label="Total Events" value={todayStats.total_events} icon={MousePointerClick} color="#8b5cf6" />
          <StatCard label="AI Questions" value={todayStats.total_chat_questions} icon={MessageSquare} color="#ec4899" />
        </div>

        {/* Charts Row */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Top Pages by Time */}
          <div className="bg-white rounded-2xl p-5" style={{ boxShadow: '0 1px 4px rgba(0,0,0,0.04)' }}>
            <h3 className="text-sm font-bold mb-4" style={{ color: '#1a1a2e' }}>Top Pages by Time (7 days)</h3>
            {pageChartData.length > 0 ? (
              <ResponsiveContainer width="100%" height={280}>
                <BarChart data={pageChartData} layout="vertical" margin={{ left: 10, right: 20, top: 5, bottom: 5 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" horizontal={false} />
                  <XAxis type="number" tick={{ fontSize: 11, fill: '#a3a3a3' }} unit=" min" />
                  <YAxis type="category" dataKey="name" width={120} tick={{ fontSize: 11, fill: '#525252' }} />
                  <Tooltip
                    formatter={(val, name, props) => [`${val} min (${props.payload.visits} visits)`, 'Time Spent']}
                    contentStyle={{ borderRadius: 12, border: 'none', boxShadow: '0 4px 16px rgba(0,0,0,0.08)', fontSize: 12 }}
                  />
                  <Bar dataKey="minutes" radius={[0, 6, 6, 0]} barSize={20}>
                    {pageChartData.map((entry, i) => (
                      <Cell key={i} fill={entry.color} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            ) : (
              <div className="flex items-center justify-center h-[280px] text-sm text-slate-400">No page data yet</div>
            )}
          </div>

          {/* Top Interactions */}
          <div className="bg-white rounded-2xl p-5" style={{ boxShadow: '0 1px 4px rgba(0,0,0,0.04)' }}>
            <h3 className="text-sm font-bold mb-4" style={{ color: '#1a1a2e' }}>Top Interactions (7 days)</h3>
            {interactionChartData.length > 0 ? (
              <ResponsiveContainer width="100%" height={280}>
                <BarChart data={interactionChartData} layout="vertical" margin={{ left: 10, right: 20, top: 5, bottom: 5 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" horizontal={false} />
                  <XAxis type="number" tick={{ fontSize: 11, fill: '#a3a3a3' }} />
                  <YAxis type="category" dataKey="name" width={140} tick={{ fontSize: 11, fill: '#525252' }} />
                  <Tooltip
                    formatter={(val) => [val, 'Count']}
                    contentStyle={{ borderRadius: 12, border: 'none', boxShadow: '0 4px 16px rgba(0,0,0,0.08)', fontSize: 12 }}
                  />
                  <Bar dataKey="count" fill="#8b5cf6" radius={[0, 6, 6, 0]} barSize={20} />
                </BarChart>
              </ResponsiveContainer>
            ) : (
              <div className="flex items-center justify-center h-[280px] text-sm text-slate-400">No interaction data yet</div>
            )}
          </div>
        </div>

        {/* KPI + Chat Row */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* KPI Engagement */}
          <div className="bg-white rounded-2xl p-5" style={{ boxShadow: '0 1px 4px rgba(0,0,0,0.04)' }}>
            <h3 className="text-sm font-bold mb-4" style={{ color: '#1a1a2e' }}>KPI Card Engagement (7 days)</h3>
            {kpiStats.length > 0 ? (
              <div className="space-y-3">
                {kpiStats.slice(0, 8).map((k, i) => (
                  <div key={i} className="flex items-center justify-between py-2 border-b border-slate-50 last:border-0">
                    <div>
                      <p className="text-xs font-semibold" style={{ color: '#1a1a2e' }}>{k.card}</p>
                      <p className="text-[10px]" style={{ color: '#a3a3a3' }}>
                        {(k.total_hover_ms / 1000).toFixed(1)}s total hover · {k.hover_count} hovers · {k.click_count} clicks
                      </p>
                    </div>
                    <div className="w-24 h-2 bg-slate-100 rounded-full overflow-hidden">
                      <div
                        className="h-full rounded-full"
                        style={{
                          width: `${Math.min((k.total_hover_ms / (kpiStats[0]?.total_hover_ms || 1)) * 100, 100)}%`,
                          background: '#f59e0b',
                        }}
                      />
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="flex items-center justify-center h-32 text-sm text-slate-400">No KPI data yet</div>
            )}
          </div>

          {/* AI Chat Summary */}
          <div className="bg-white rounded-2xl p-5" style={{ boxShadow: '0 1px 4px rgba(0,0,0,0.04)' }}>
            <h3 className="text-sm font-bold mb-4" style={{ color: '#1a1a2e' }}>AI Chat Insights (Today)</h3>
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-3">
                <div className="bg-slate-50 rounded-xl p-3 text-center">
                  <p className="text-xl font-bold" style={{ color: '#1a1a2e' }}>{todayStats.total_chat_questions}</p>
                  <p className="text-[10px] uppercase tracking-wider font-semibold" style={{ color: '#737373' }}>Questions Today</p>
                </div>
                <div className="bg-slate-50 rounded-xl p-3 text-center">
                  <p className="text-xl font-bold" style={{ color: '#1a1a2e' }}>
                    {thumbsUp > 0 || thumbsDown > 0 ? `${Math.round((thumbsUp / (thumbsUp + thumbsDown)) * 100)}%` : '—'}
                  </p>
                  <p className="text-[10px] uppercase tracking-wider font-semibold" style={{ color: '#737373' }}>Satisfaction</p>
                </div>
              </div>
              <div className="flex items-center gap-4 text-xs" style={{ color: '#737373' }}>
                <span>From suggestions: <strong className="text-slate-800">{chatFromSuggestions}</strong></span>
                <span>Custom typed: <strong className="text-slate-800">{chatCustom}</strong></span>
              </div>
              <div className="flex items-center gap-4 text-xs" style={{ color: '#737373' }}>
                <span>Thumbs up: <strong className="text-green-600">{thumbsUp}</strong></span>
                <span>Thumbs down: <strong className="text-red-600">{thumbsDown}</strong></span>
              </div>
              {(todayStats.chat || []).length > 0 && (
                <div className="mt-2">
                  <p className="text-[10px] font-semibold uppercase tracking-wider mb-2" style={{ color: '#a3a3a3' }}>Recent Questions</p>
                  <div className="space-y-1.5 max-h-32 overflow-y-auto">
                    {(todayStats.chat || []).slice(0, 5).map((c, i) => (
                      <div key={i} className="text-xs text-slate-600 bg-slate-50 rounded-lg px-3 py-2 truncate">
                        {c.question_text}
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Live Event Feed */}
        <div className="bg-white rounded-2xl p-5" style={{ boxShadow: '0 1px 4px rgba(0,0,0,0.04)' }}>
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-sm font-bold" style={{ color: '#1a1a2e' }}>Live Event Feed (Last 50)</h3>
            <span className="flex items-center gap-1.5 text-[10px] font-semibold" style={{ color: '#10b981' }}>
              <span className="w-2 h-2 rounded-full bg-green-500 animate-pulse" />
              LIVE
            </span>
          </div>
          {eventFeed.length > 0 ? (
            <div className="max-h-80 overflow-y-auto">
              {eventFeed.map((e, i) => (
                <EventFeedItem key={i} event={e} />
              ))}
            </div>
          ) : (
            <div className="flex items-center justify-center h-32 text-sm text-slate-400">
              No events recorded yet. Events will appear here as Vivek uses the dashboard.
            </div>
          )}
        </div>
      </div>
    </>
  );
}
