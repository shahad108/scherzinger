import { useState, useEffect, useCallback } from 'react';
import { motion } from 'motion/react';
import {
  PieChart, Pie, Cell, BarChart, Bar, AreaChart, Area, ScatterChart, Scatter,
  XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid, Legend, ZAxis,
} from 'recharts';
import { Loader, MessageSquare, ThumbsUp, ThumbsDown, Sparkles, Zap } from 'lucide-react';
import AdminKPICard from '../../components/admin/AdminKPICard';
import { useDateRange } from '../../hooks/useDateRange';

const SOURCE_COLORS = ['#7C3AED', '#f59e0b'];
const RATING_COLORS = { thumbs_up: '#10b981', thumbs_down: '#ef4444', none: '#cbd5e1' };

// ─── Question Source Pie ─────────────────────────────────────────
function QuestionSourcePie({ bySource }) {
  if (!bySource?.length) return null;
  return (
    <div className="bg-white rounded-2xl p-5" style={{ boxShadow: '0 1px 4px rgba(0,0,0,0.04)' }}>
      <h3 className="text-sm font-bold mb-4" style={{ color: '#1a1a2e' }}>Question Source</h3>
      <div className="flex items-center gap-6">
        <ResponsiveContainer width={160} height={160}>
          <PieChart>
            <Pie data={bySource} dataKey="count" nameKey="source" cx="50%" cy="50%" innerRadius={45} outerRadius={70} paddingAngle={3}>
              {bySource.map((_, i) => <Cell key={i} fill={SOURCE_COLORS[i]} />)}
            </Pie>
            <Tooltip contentStyle={{ borderRadius: 12, border: 'none', fontSize: 12 }} />
          </PieChart>
        </ResponsiveContainer>
        <div className="space-y-2">
          {bySource.map((s, i) => (
            <div key={i} className="flex items-center gap-2 text-xs">
              <span className="w-3 h-3 rounded-full" style={{ background: SOURCE_COLORS[i] }} />
              <span className="text-slate-600">{s.source}</span>
              <span className="font-bold" style={{ color: '#1a1a2e' }}>{s.count}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

// ─── Questions by Page Bar ───────────────────────────────────────
function QuestionsByPageBar({ byPage }) {
  if (!byPage?.length) return null;
  const data = byPage.slice(0, 9).map(p => ({
    name: p.page?.length > 18 ? p.page.slice(0, 16) + '...' : p.page,
    count: p.count,
  }));

  return (
    <div className="bg-white rounded-2xl p-5" style={{ boxShadow: '0 1px 4px rgba(0,0,0,0.04)' }}>
      <h3 className="text-sm font-bold mb-4" style={{ color: '#1a1a2e' }}>Questions by Page Context</h3>
      <ResponsiveContainer width="100%" height={220}>
        <BarChart data={data} layout="vertical" margin={{ left: 10, right: 20, top: 5, bottom: 5 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" horizontal={false} />
          <XAxis type="number" tick={{ fontSize: 10, fill: '#a3a3a3' }} />
          <YAxis type="category" dataKey="name" width={130} tick={{ fontSize: 11, fill: '#525252' }} />
          <Tooltip contentStyle={{ borderRadius: 12, border: 'none', fontSize: 12 }} />
          <Bar dataKey="count" fill="#7C3AED" radius={[0, 6, 6, 0]} barSize={18} name="Questions" />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

// ─── Keyword Frequency Chart ─────────────────────────────────────
function TopicKeywordChart({ keywords }) {
  if (!keywords?.length) return null;
  const data = keywords.slice(0, 15);
  const maxCount = data[0]?.count || 1;

  return (
    <div className="bg-white rounded-2xl p-5" style={{ boxShadow: '0 1px 4px rgba(0,0,0,0.04)' }}>
      <h3 className="text-sm font-bold mb-4" style={{ color: '#1a1a2e' }}>Top Keywords in Questions</h3>
      <div className="space-y-2">
        {data.map((k, i) => (
          <div key={i} className="flex items-center gap-3">
            <span className="text-xs font-medium w-20 text-right truncate" style={{ color: '#525252' }}>{k.word}</span>
            <div className="flex-1 h-5 bg-slate-50 rounded-full overflow-hidden">
              <motion.div
                initial={{ width: 0 }}
                animate={{ width: `${(k.count / maxCount) * 100}%` }}
                transition={{ duration: 0.5, delay: i * 0.03 }}
                className="h-full rounded-full flex items-center justify-end pr-2"
                style={{ background: `linear-gradient(90deg, #C4B5FD, #7C3AED)` }}
              >
                <span className="text-[10px] font-bold text-white">{k.count}</span>
              </motion.div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

// ─── Question Timeline Scatter ───────────────────────────────────
function QuestionTimeline({ timeline }) {
  if (!timeline?.length) return null;

  const data = timeline.map((t, i) => ({
    x: new Date(t.date).getTime(),
    y: t.hour,
    rating: t.rating,
    question: t.question,
    z: 60,
  }));

  return (
    <div className="bg-white rounded-2xl p-5" style={{ boxShadow: '0 1px 4px rgba(0,0,0,0.04)' }}>
      <h3 className="text-sm font-bold mb-4" style={{ color: '#1a1a2e' }}>Question Timeline (Date x Time of Day)</h3>
      <ResponsiveContainer width="100%" height={220}>
        <ScatterChart margin={{ top: 10, right: 20, bottom: 5, left: 0 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
          <XAxis
            dataKey="x" type="number" scale="time" domain={['auto', 'auto']}
            tickFormatter={v => new Date(v).toLocaleDateString('en-IN', { month: 'short', day: 'numeric' })}
            tick={{ fontSize: 10, fill: '#a3a3a3' }}
          />
          <YAxis dataKey="y" type="number" domain={[6, 22]} name="Hour"
            tickFormatter={v => `${Math.floor(v)}:00`}
            tick={{ fontSize: 10, fill: '#a3a3a3' }} width={45}
          />
          <ZAxis dataKey="z" range={[40, 40]} />
          <Tooltip
            content={({ payload }) => {
              if (!payload?.[0]) return null;
              const d = payload[0].payload;
              return (
                <div className="bg-white rounded-xl shadow-lg border border-slate-100 px-3 py-2 text-xs max-w-[250px]">
                  <p className="font-semibold text-slate-800 truncate">{d.question}</p>
                  <p className="text-slate-400 mt-1">{new Date(d.x).toLocaleDateString()} at {Math.floor(d.y)}:{String(Math.round((d.y % 1) * 60)).padStart(2, '0')}</p>
                </div>
              );
            }}
          />
          <Scatter data={data} shape={({ cx, cy, payload }) => (
            <circle cx={cx} cy={cy} r={5} fill={RATING_COLORS[payload.rating] || RATING_COLORS.none} opacity={0.8} stroke="#fff" strokeWidth={1} />
          )} />
        </ScatterChart>
      </ResponsiveContainer>
      <div className="flex items-center gap-4 mt-2 justify-center">
        {[['Thumbs Up', '#10b981'], ['Thumbs Down', '#ef4444'], ['No Rating', '#cbd5e1']].map(([label, color]) => (
          <div key={label} className="flex items-center gap-1.5 text-[10px] text-slate-500">
            <span className="w-2.5 h-2.5 rounded-full" style={{ background: color }} />{label}
          </div>
        ))}
      </div>
    </div>
  );
}

// ─── Response Quality ────────────────────────────────────────────
function ResponseQuality({ quality, thumbsDown }) {
  const rows = [
    { label: 'Thumbs Up', ...quality?.thumbs_up, color: '#10b981', icon: ThumbsUp },
    { label: 'Thumbs Down', ...quality?.thumbs_down, color: '#ef4444', icon: ThumbsDown },
    { label: 'No Rating', ...quality?.no_rating, color: '#94a3b8', icon: null },
  ];

  return (
    <div className="bg-white rounded-2xl p-5" style={{ boxShadow: '0 1px 4px rgba(0,0,0,0.04)' }}>
      <h3 className="text-sm font-bold mb-4" style={{ color: '#1a1a2e' }}>Response Quality</h3>
      <div className="space-y-3 mb-4">
        {rows.map((r, i) => (
          <div key={i} className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              {r.icon && <r.icon size={14} style={{ color: r.color }} />}
              <span className="text-xs font-medium" style={{ color: '#525252' }}>{r.label}</span>
            </div>
            <div className="flex items-center gap-3">
              <div className="w-20 h-2 bg-slate-100 rounded-full overflow-hidden">
                <div className="h-full rounded-full" style={{ width: `${r.pct || 0}%`, background: r.color }} />
              </div>
              <span className="text-xs font-bold w-8 text-right" style={{ color: r.color }}>{r.count || 0}</span>
              <span className="text-[10px] text-slate-400 w-8 text-right">{r.pct || 0}%</span>
            </div>
          </div>
        ))}
      </div>
      {thumbsDown?.length > 0 && (
        <>
          <p className="text-[10px] font-semibold uppercase tracking-wider mb-2" style={{ color: '#ef4444' }}>Thumbs Down Questions:</p>
          <div className="space-y-1.5 max-h-32 overflow-y-auto">
            {thumbsDown.map((td, i) => (
              <div key={i} className="text-xs bg-red-50 rounded-lg px-3 py-2">
                <p className="text-red-700 truncate">{td.question}</p>
                <p className="text-[10px] text-red-400 mt-0.5">{td.page} · {new Date(td.date).toLocaleDateString()}</p>
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  );
}

// ─── Chat Usage Trend ────────────────────────────────────────────
function ChatUsageTrend({ trend }) {
  if (!trend?.length) return null;
  const chartData = trend.map(d => ({
    ...d,
    label: new Date(d.day).toLocaleDateString('en-IN', { month: 'short', day: 'numeric' }),
  }));

  return (
    <div className="bg-white rounded-2xl p-5" style={{ boxShadow: '0 1px 4px rgba(0,0,0,0.04)' }}>
      <h3 className="text-sm font-bold mb-4" style={{ color: '#1a1a2e' }}>Chat Usage Trend</h3>
      <ResponsiveContainer width="100%" height={220}>
        <AreaChart data={chartData} margin={{ top: 5, right: 20, bottom: 5, left: 0 }}>
          <defs>
            <linearGradient id="chatGrad" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#7C3AED" stopOpacity={0.15} />
              <stop offset="100%" stopColor="#7C3AED" stopOpacity={0} />
            </linearGradient>
          </defs>
          <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
          <XAxis dataKey="label" tick={{ fontSize: 10, fill: '#a3a3a3' }} interval="preserveStartEnd" />
          <YAxis tick={{ fontSize: 10, fill: '#a3a3a3' }} width={30} />
          <Tooltip contentStyle={{ borderRadius: 12, border: 'none', fontSize: 12 }} />
          <Area type="monotone" dataKey="questions" stroke="#7C3AED" strokeWidth={2} fill="url(#chatGrad)" name="Questions" />
          <Area type="monotone" dataKey="thumbs_up" stroke="#10b981" strokeWidth={1.5} fill="none" name="Thumbs Up" />
          <Area type="monotone" dataKey="thumbs_down" stroke="#ef4444" strokeWidth={1.5} fill="none" name="Thumbs Down" />
          <Legend wrapperStyle={{ fontSize: 10 }} />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}

// ─── Recent Questions List ───────────────────────────────────────
function RecentQuestions({ questions }) {
  if (!questions?.length) return null;
  return (
    <div className="bg-white rounded-2xl p-5" style={{ boxShadow: '0 1px 4px rgba(0,0,0,0.04)' }}>
      <h3 className="text-sm font-bold mb-4" style={{ color: '#1a1a2e' }}>Recent Questions</h3>
      <div className="space-y-2 max-h-80 overflow-y-auto">
        {questions.map((q, i) => (
          <div key={i} className="flex items-start gap-3 py-2 border-b border-slate-50 last:border-0">
            <span className="mt-0.5">
              {q.rating === 'thumbs_up' ? <ThumbsUp size={12} className="text-green-500" /> :
               q.rating === 'thumbs_down' ? <ThumbsDown size={12} className="text-red-500" /> :
               <MessageSquare size={12} className="text-slate-300" />}
            </span>
            <div className="flex-1 min-w-0">
              <p className="text-xs text-slate-700">{q.question}</p>
              <div className="flex items-center gap-2 mt-1">
                <span className="text-[10px] px-1.5 py-0.5 rounded font-semibold" style={{
                  background: q.source === 'suggestion_button' ? '#f5f3ff' : '#f8fafc',
                  color: q.source === 'suggestion_button' ? '#7C3AED' : '#94a3b8',
                }}>
                  {q.source === 'suggestion_button' ? 'suggestion' : 'typed'}
                </span>
                <span className="text-[10px] text-slate-400">{q.page}</span>
                <span className="text-[10px] text-slate-400 ml-auto">{new Date(q.date).toLocaleDateString()}</span>
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

// ─── Main Chat Intel Page ────────────────────────────────────────
export default function AdminChatIntel() {
  const { from, to } = useDateRange();
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);

  const fetchData = useCallback(async () => {
    try {
      const res = await fetch(`/api/admin/chat/analytics?from=${from}&to=${to}`);
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
      <div className="grid grid-cols-2 lg:grid-cols-6 gap-4">
        <AdminKPICard label="Total Questions" icon={MessageSquare} rawNumber={k.total_questions} subtitle="Selected period" />
        <AdminKPICard label="From Suggestions" icon={Sparkles} rawNumber={k.from_suggestion} change={k.total_questions ? `${Math.round(k.from_suggestion / k.total_questions * 100)}%` : ''} changeType="neutral" />
        <AdminKPICard label="Custom Typed" icon={Zap} rawNumber={k.custom_typed} change={k.total_questions ? `${Math.round(k.custom_typed / k.total_questions * 100)}%` : ''} changeType="neutral" />
        <AdminKPICard label="Thumbs Up" icon={ThumbsUp} rawNumber={k.thumbs_up} change={k.satisfaction_pct != null ? `${k.satisfaction_pct}% satisfaction` : ''} changeType="positive" />
        <AdminKPICard label="Thumbs Down" icon={ThumbsDown} rawNumber={k.thumbs_down} changeType="negative" />
        <AdminKPICard label="No Rating" rawNumber={k.no_rating} changeType="neutral" />
      </div>

      {/* Source Pie + Questions by Page */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <QuestionSourcePie bySource={data?.bySource} />
        <div className="lg:col-span-2">
          <QuestionsByPageBar byPage={data?.byPage} />
        </div>
      </div>

      {/* Keywords + Quality */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <TopicKeywordChart keywords={data?.keywords} />
        <ResponseQuality quality={data?.quality} thumbsDown={data?.thumbsDown} />
      </div>

      {/* Timeline Scatter */}
      <QuestionTimeline timeline={data?.timeline} />

      {/* Trend + Recent Questions */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <ChatUsageTrend trend={data?.trend} />
        <RecentQuestions questions={data?.questions} />
      </div>
    </div>
  );
}
