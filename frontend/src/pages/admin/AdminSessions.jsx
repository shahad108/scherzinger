import { useState, useEffect, useCallback } from 'react';
import { motion } from 'motion/react';
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid, Cell,
} from 'recharts';
import { Loader, Activity, Clock, Timer, Zap, Sun, Monitor } from 'lucide-react';
import AdminKPICard from '../../components/admin/AdminKPICard';
import { useDateRange } from '../../hooks/useDateRange';

function formatDuration(seconds) {
  if (!seconds) return '0s';
  if (seconds < 60) return `${seconds}s`;
  const m = Math.floor(seconds / 60);
  if (m < 60) return `${m}m`;
  return `${Math.floor(m / 60)}h ${m % 60}m`;
}

const DOW_LABELS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

// ─── Calendar Heatmap (GitHub-style) ─────────────────────────────
function CalendarHeatmap({ calendar }) {
  if (!calendar?.length) return (
    <div className="bg-white rounded-2xl p-5" style={{ boxShadow: '0 1px 4px rgba(0,0,0,0.04)' }}>
      <h3 className="text-sm font-bold mb-4" style={{ color: '#1a1a2e' }}>Daily Activity</h3>
      <p className="text-xs text-slate-400 text-center py-8">No session data yet</p>
    </div>
  );

  const maxMin = Math.max(...calendar.map(c => c.minutes), 1);
  const dayMap = {};
  calendar.forEach(c => { dayMap[c.day] = c; });

  // Build grid: last 90 days
  const days = [];
  for (let i = 89; i >= 0; i--) {
    const d = new Date(Date.now() - i * 86400000);
    const key = d.toISOString().split('T')[0];
    days.push({ date: key, dow: d.getDay(), ...dayMap[key] });
  }

  const intensity = (minutes) => {
    if (!minutes) return '#f1f5f9';
    const pct = minutes / maxMin;
    if (pct > 0.75) return '#7C3AED';
    if (pct > 0.5) return '#A78BFA';
    if (pct > 0.25) return '#C4B5FD';
    return '#DDD6FE';
  };

  return (
    <div className="bg-white rounded-2xl p-5" style={{ boxShadow: '0 1px 4px rgba(0,0,0,0.04)' }}>
      <h3 className="text-sm font-bold mb-4" style={{ color: '#1a1a2e' }}>Daily Activity (Last 90 Days)</h3>
      <div className="flex gap-0.5 flex-wrap">
        {days.map((d, i) => (
          <div
            key={i}
            className="rounded-sm"
            style={{ width: 12, height: 12, background: intensity(d.minutes) }}
            title={`${d.date}: ${d.minutes || 0}m, ${d.sessions || 0} sessions`}
          />
        ))}
      </div>
      <div className="flex items-center gap-2 mt-3 text-[10px] text-slate-400">
        <span>Less</span>
        {['#f1f5f9', '#DDD6FE', '#C4B5FD', '#A78BFA', '#7C3AED'].map(c => (
          <div key={c} className="rounded-sm" style={{ width: 10, height: 10, background: c }} />
        ))}
        <span>More</span>
      </div>
    </div>
  );
}

// ─── Hourly Activity Heatmap ─────────────────────────────────────
function HourlyHeatmap({ hourly }) {
  if (!hourly?.length) return null;

  const maxActive = Math.max(...hourly.map(h => h.active), 1);
  const grid = {};
  hourly.forEach(h => { grid[`${h.dow}-${h.hour}`] = h; });

  const hours = Array.from({ length: 15 }, (_, i) => i + 7); // 7am to 9pm

  const intensity = (active) => {
    if (!active) return '#f8fafc';
    const pct = active / maxActive;
    if (pct > 0.75) return '#7C3AED';
    if (pct > 0.5) return '#A78BFA';
    if (pct > 0.25) return '#C4B5FD';
    return '#EDE9FE';
  };

  return (
    <div className="bg-white rounded-2xl p-5" style={{ boxShadow: '0 1px 4px rgba(0,0,0,0.04)' }}>
      <h3 className="text-sm font-bold mb-4" style={{ color: '#1a1a2e' }}>Hourly Activity Pattern</h3>
      <div className="overflow-x-auto">
        <table className="text-[10px]">
          <thead>
            <tr>
              <th className="pr-2 text-right text-slate-400 font-normal" />
              {hours.map(h => <th key={h} className="px-0.5 text-slate-400 font-normal w-6 text-center">{h}</th>)}
            </tr>
          </thead>
          <tbody>
            {[1, 2, 3, 4, 5, 6, 0].map(dow => (
              <tr key={dow}>
                <td className="pr-2 text-right text-slate-500 font-medium">{DOW_LABELS[dow]}</td>
                {hours.map(h => {
                  const cell = grid[`${dow}-${h}`];
                  return (
                    <td key={h} className="px-0.5 py-0.5">
                      <div
                        className="rounded-sm mx-auto"
                        style={{ width: 18, height: 18, background: intensity(cell?.active || 0) }}
                        title={`${DOW_LABELS[dow]} ${h}:00 — ${cell?.active || 0} active pings`}
                      />
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ─── Duration Histogram ──────────────────────────────────────────
function DurationHistogram({ histogram }) {
  if (!histogram?.length) return null;
  const colors = ['#DDD6FE', '#C4B5FD', '#A78BFA', '#8B5CF6', '#7C3AED'];

  return (
    <div className="bg-white rounded-2xl p-5" style={{ boxShadow: '0 1px 4px rgba(0,0,0,0.04)' }}>
      <h3 className="text-sm font-bold mb-4" style={{ color: '#1a1a2e' }}>Session Duration Distribution</h3>
      <ResponsiveContainer width="100%" height={200}>
        <BarChart data={histogram} margin={{ top: 5, right: 20, bottom: 5, left: 0 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
          <XAxis dataKey="label" tick={{ fontSize: 11, fill: '#525252' }} />
          <YAxis tick={{ fontSize: 10, fill: '#a3a3a3' }} width={30} />
          <Tooltip contentStyle={{ borderRadius: 12, border: 'none', fontSize: 12 }} />
          <Bar dataKey="count" radius={[6, 6, 0, 0]} barSize={40} name="Sessions">
            {histogram.map((_, i) => <Cell key={i} fill={colors[i] || colors[4]} />)}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

// ─── Session Timeline (Gantt-style) ──────────────────────────────
function SessionTimeline({ sessions }) {
  if (!sessions?.length) return null;

  // Group by day, show last 7 days
  const byDay = {};
  sessions.forEach(s => {
    const day = s.started_at?.split('T')[0];
    if (!day) return;
    if (!byDay[day]) byDay[day] = [];
    byDay[day].push(s);
  });

  const days = Object.entries(byDay).sort((a, b) => b[0].localeCompare(a[0])).slice(0, 7);

  const activeColor = (pct) => {
    if (pct == null) return '#A78BFA';
    if (pct >= 75) return '#10b981';
    if (pct >= 50) return '#f59e0b';
    return '#94a3b8';
  };

  return (
    <div className="bg-white rounded-2xl p-5" style={{ boxShadow: '0 1px 4px rgba(0,0,0,0.04)' }}>
      <h3 className="text-sm font-bold mb-4" style={{ color: '#1a1a2e' }}>Session Timeline (Recent Days)</h3>
      <div className="space-y-3">
        {days.map(([day, daySessions]) => (
          <div key={day} className="flex items-center gap-3">
            <span className="text-[11px] font-medium w-16 text-right flex-shrink-0" style={{ color: '#525252' }}>
              {new Date(day).toLocaleDateString('en-IN', { month: 'short', day: 'numeric' })}
            </span>
            <div className="flex-1 flex items-center gap-1.5 overflow-hidden">
              {daySessions.map((s, i) => {
                const startTime = new Date(s.started_at).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' });
                const dur = formatDuration(s.duration_seconds);
                return (
                  <div
                    key={i}
                    className="h-6 rounded-md flex items-center px-2 text-[10px] font-semibold text-white whitespace-nowrap"
                    style={{
                      background: activeColor(s.active_pct),
                      minWidth: Math.max(Math.round((s.duration_seconds || 60) / 60) * 2, 40),
                    }}
                    title={`${startTime} — ${dur} (${s.active_pct != null ? s.active_pct + '% active' : 'no ping data'})`}
                  >
                    {startTime} · {dur}
                  </div>
                );
              })}
            </div>
          </div>
        ))}
      </div>
      <div className="flex items-center gap-4 mt-3 text-[10px] text-slate-400">
        {[['Active (>75%)', '#10b981'], ['Mixed (50-75%)', '#f59e0b'], ['Low (<50%)', '#94a3b8']].map(([l, c]) => (
          <div key={l} className="flex items-center gap-1.5">
            <span className="w-3 h-3 rounded-sm" style={{ background: c }} />{l}
          </div>
        ))}
      </div>
    </div>
  );
}

// ─── Weekly Usage Trend ──────────────────────────────────────────
function WeeklyTrend({ weekly }) {
  if (!weekly?.length) return null;
  const data = weekly.map(w => ({
    ...w,
    label: new Date(w.week).toLocaleDateString('en-IN', { month: 'short', day: 'numeric' }),
    hours: Math.round(w.minutes / 60 * 10) / 10,
  }));

  return (
    <div className="bg-white rounded-2xl p-5" style={{ boxShadow: '0 1px 4px rgba(0,0,0,0.04)' }}>
      <h3 className="text-sm font-bold mb-4" style={{ color: '#1a1a2e' }}>Weekly Usage Trend</h3>
      <ResponsiveContainer width="100%" height={200}>
        <BarChart data={data} margin={{ top: 5, right: 20, bottom: 5, left: 0 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
          <XAxis dataKey="label" tick={{ fontSize: 10, fill: '#a3a3a3' }} />
          <YAxis tick={{ fontSize: 10, fill: '#a3a3a3' }} width={35} unit="h" />
          <Tooltip formatter={(v) => [`${v}h`, 'Usage']} contentStyle={{ borderRadius: 12, border: 'none', fontSize: 12 }} />
          <Bar dataKey="hours" fill="#7C3AED" radius={[6, 6, 0, 0]} barSize={32} name="Hours" />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

// ─── Device Info Table ───────────────────────────────────────────
function DeviceTable({ devices }) {
  if (!devices?.length) return null;
  return (
    <div className="bg-white rounded-2xl p-5" style={{ boxShadow: '0 1px 4px rgba(0,0,0,0.04)' }}>
      <div className="flex items-center gap-2 mb-4">
        <Monitor size={14} style={{ color: '#7C3AED' }} />
        <h3 className="text-sm font-bold" style={{ color: '#1a1a2e' }}>Screen Resolutions</h3>
      </div>
      <div className="space-y-2">
        {devices.map((d, i) => (
          <div key={i} className="flex items-center justify-between">
            <span className="text-xs font-medium" style={{ color: '#525252' }}>{d.screen}</span>
            <div className="flex items-center gap-3">
              <div className="w-20 h-2 bg-slate-100 rounded-full overflow-hidden">
                <div className="h-full rounded-full" style={{ width: `${d.pct}%`, background: '#7C3AED' }} />
              </div>
              <span className="text-xs font-bold w-8 text-right" style={{ color: '#7C3AED' }}>{d.count}</span>
              <span className="text-[10px] text-slate-400 w-8 text-right">{d.pct}%</span>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

// ─── Main Sessions Page ──────────────────────────────────────────
export default function AdminSessions() {
  const { from, to } = useDateRange();
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);

  const fetchData = useCallback(async () => {
    try {
      const res = await fetch(`/api/admin/sessions/analytics?from=${from}&to=${to}`);
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
        <AdminKPICard label="Total Sessions" icon={Activity} rawNumber={k.total_sessions} subtitle="Selected period" />
        <AdminKPICard label="Avg Length" icon={Clock} value={formatDuration(k.avg_length_seconds)} subtitle="Per session" />
        <AdminKPICard label="Longest" icon={Timer} value={formatDuration(k.longest_seconds)} subtitle={k.longest_date || ''} />
        <AdminKPICard label="Active %" icon={Zap} value={`${k.active_pct || 0}%`} subtitle="vs idle" changeType={k.active_pct >= 60 ? 'positive' : 'neutral'} />
        <AdminKPICard label="Peak Hour" icon={Sun} value={k.peak_hour || '—'} subtitle="Most active" />
      </div>

      {/* Calendar + Hourly Heatmaps */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <CalendarHeatmap calendar={data?.calendar} />
        <HourlyHeatmap hourly={data?.hourly} />
      </div>

      {/* Histogram + Weekly */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <DurationHistogram histogram={data?.histogram} />
        <WeeklyTrend weekly={data?.weekly} />
      </div>

      {/* Session Timeline */}
      <SessionTimeline sessions={data?.sessions} />

      {/* Device Info */}
      <DeviceTable devices={data?.devices} />
    </div>
  );
}
