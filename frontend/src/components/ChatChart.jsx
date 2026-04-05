import { useId } from 'react';
import {
  BarChart, Bar, LineChart, Line, PieChart, Pie, Cell,
  ScatterChart, Scatter, AreaChart, Area,
  ResponsiveContainer, XAxis, YAxis, Tooltip, CartesianGrid, Legend,
} from 'recharts';
import MeasuredChartContainer from './MeasuredChartContainer';

const COLORS = ['#0393da', '#10B981', '#F59E0B', '#8B5CF6', '#06B6D4', '#EC4899', '#6366F1', '#64748B', '#EF4444', '#14B8A6'];

function formatAxisValue(v) {
  if (typeof v !== 'number') return v;
  const abs = Math.abs(v);
  if (abs >= 1_000_000) return `€${(v / 1_000_000).toFixed(1)}M`;
  if (abs >= 1_000) return `€${(v / 1_000).toFixed(0)}K`;
  if (abs > 0 && abs < 1) return `${(v * 100).toFixed(1)}%`;
  return v.toLocaleString('en');
}

function formatTooltipValue(v) {
  if (typeof v !== 'number') return v;
  const abs = Math.abs(v);
  if (abs >= 1_000_000) return `€${(v / 1_000_000).toFixed(2)}M`;
  if (abs >= 1_000) return `€${(v / 1_000).toFixed(1)}K`;
  if (abs > 0 && abs < 1) return `${(v * 100).toFixed(1)}%`;
  return v.toLocaleString('en', { maximumFractionDigits: 2 });
}

function ChartTooltip({ active, payload, label }) {
  if (!active || !payload?.length) return null;
  return (
    <div className="bg-white px-3 py-2.5 rounded-lg shadow-xl border border-slate-200 text-xs max-w-xs">
      {label && <p className="font-semibold text-slate-800 mb-1.5 border-b border-slate-100 pb-1.5">{label}</p>}
      {payload.map((entry, i) => (
        <div key={i} className="flex items-center gap-2 py-0.5">
          <span className="w-2.5 h-2.5 rounded-sm flex-shrink-0" style={{ backgroundColor: entry.color || entry.fill }} />
          <span className="text-slate-500">{entry.name}:</span>
          <span className="font-semibold text-slate-800 ml-auto">{formatTooltipValue(entry.value)}</span>
        </div>
      ))}
    </div>
  );
}

function truncateLabel(label, maxLen = 10) {
  if (typeof label !== 'string') return label;
  return label.length > maxLen ? label.slice(0, maxLen - 1) + '..' : label;
}

function PieLegend({ data, nameKey }) {
  return (
    <div className="flex flex-wrap gap-x-4 gap-y-1.5 justify-center mt-2">
      {data.map((d, i) => (
        <div key={i} className="flex items-center gap-1.5">
          <span className="w-2.5 h-2.5 rounded-sm flex-shrink-0" style={{ backgroundColor: COLORS[i % COLORS.length] }} />
          <span className="text-[11px] text-slate-600">{d[nameKey || 'name']}</span>
        </div>
      ))}
    </div>
  );
}

export default function ChatChart({ spec }) {
  const { type, title, data, xKey = 'name', yKey = 'value', color = '#0393da', series } = spec;
  const areaGradientId = useId().replace(/:/g, '');

  if (!data?.length) return null;

  const chartHeight = 260;

  return (
    <div className="bg-slate-50 border border-slate-200 rounded-xl px-4 pt-4 pb-3 my-3 min-w-0">
      {title && <h4 className="text-xs font-bold text-slate-500 uppercase tracking-widest mb-3">{title}</h4>}
      <MeasuredChartContainer className="min-w-0" style={{ height: chartHeight }}>
        {({ width, height }) => (
        <ResponsiveContainer width={width} height={height}>
          {type === 'bar' ? (
            <BarChart data={data} margin={{ top: 4, right: 8, bottom: 0, left: 0 }}>
              <defs>
                {(series || [{ key: yKey, color }]).map((s, i) => (
                  <linearGradient key={s.key || i} id={`chatBarGrad${i}`} x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor={s.color || COLORS[i]} />
                    <stop offset="100%" stopColor={s.color || COLORS[i]} stopOpacity={0.4} />
                  </linearGradient>
                ))}
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" vertical={false} />
              <XAxis
                dataKey={xKey}
                tick={{ fontSize: 10, fill: '#64748b' }}
                interval={0}
                angle={0}
                textAnchor="middle"
                height={28}
                tickFormatter={v => truncateLabel(v)}
                tickLine={false}
                axisLine={{ stroke: '#e2e8f0' }}
              />
              <YAxis tick={{ fontSize: 10, fill: '#64748b' }} width={52} tickFormatter={formatAxisValue} tickLine={false} axisLine={false} />
              <Tooltip content={<ChartTooltip />} cursor={{ fill: 'rgba(59,130,246,0.05)' }} />
              {series ? (
                series.map((s, i) => (
                  <Bar key={s.key} dataKey={s.key} fill={`url(#chatBarGrad${i})`} radius={[3, 3, 0, 0]} maxBarSize={44} />
                ))
              ) : (
                <Bar dataKey={yKey} fill="url(#chatBarGrad0)" radius={[3, 3, 0, 0]} maxBarSize={44} />
              )}
              {series && <Legend wrapperStyle={{ fontSize: 11, paddingTop: 4 }} />}
            </BarChart>
          ) : type === 'line' ? (
            <LineChart data={data} margin={{ top: 4, right: 8, bottom: 0, left: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" vertical={false} />
              <XAxis
                dataKey={xKey}
                tick={{ fontSize: 10, fill: '#64748b' }}
                height={28}
                tickLine={false}
                axisLine={{ stroke: '#e2e8f0' }}
                tickFormatter={v => truncateLabel(v)}
              />
              <YAxis tick={{ fontSize: 10, fill: '#64748b' }} width={52} tickFormatter={formatAxisValue} tickLine={false} axisLine={false} />
              <Tooltip content={<ChartTooltip />} />
              {series ? (
                series.map((s, i) => (
                  <Line key={s.key} type="monotone" dataKey={s.key} stroke={s.color || COLORS[i]} strokeWidth={2.5} dot={false} activeDot={{ r: 4, strokeWidth: 2 }} />
                ))
              ) : (
                <Line type="monotone" dataKey={yKey} stroke={color} strokeWidth={2.5} dot={false} activeDot={{ r: 4, strokeWidth: 2 }} />
              )}
              {series && <Legend wrapperStyle={{ fontSize: 11, paddingTop: 4 }} />}
            </LineChart>
          ) : type === 'area' ? (
            <AreaChart data={data} margin={{ top: 4, right: 8, bottom: 0, left: 0 }}>
              <defs>
                <linearGradient id={areaGradientId} x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor={color} stopOpacity={0.3} />
                  <stop offset="95%" stopColor={color} stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" vertical={false} />
              <XAxis dataKey={xKey} tick={{ fontSize: 10, fill: '#64748b' }} height={28} tickLine={false} axisLine={{ stroke: '#e2e8f0' }} tickFormatter={v => truncateLabel(v)} />
              <YAxis tick={{ fontSize: 10, fill: '#64748b' }} width={52} tickFormatter={formatAxisValue} tickLine={false} axisLine={false} />
              <Tooltip content={<ChartTooltip />} />
              {series ? (
                series.map((s, i) => (
                  <Area key={s.key} type="monotone" dataKey={s.key} stroke={s.color || COLORS[i]} fill={s.color || COLORS[i]} fillOpacity={0.15} strokeWidth={2} dot={false} activeDot={{ r: 4, strokeWidth: 2 }} />
                ))
              ) : (
                <Area type="monotone" dataKey={yKey} stroke={color} fill={`url(#${areaGradientId})`} strokeWidth={2} dot={false} activeDot={{ r: 4, strokeWidth: 2 }} />
              )}
              {series && <Legend wrapperStyle={{ fontSize: 11, paddingTop: 4 }} />}
            </AreaChart>
          ) : type === 'scatter' ? (
            <ScatterChart margin={{ top: 4, right: 8, bottom: 0, left: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
              <XAxis dataKey={xKey} type="number" tick={{ fontSize: 10, fill: '#64748b' }} tickFormatter={formatAxisValue} tickLine={false} axisLine={{ stroke: '#e2e8f0' }} name={xKey} />
              <YAxis dataKey={yKey} type="number" tick={{ fontSize: 10, fill: '#64748b' }} width={52} tickFormatter={formatAxisValue} tickLine={false} axisLine={false} name={yKey} />
              <Tooltip content={<ChartTooltip />} cursor={{ strokeDasharray: '3 3' }} />
              <Scatter data={data} fill={color}>
                {data.map((_, i) => (
                  <Cell key={i} fill={COLORS[i % COLORS.length]} />
                ))}
              </Scatter>
            </ScatterChart>
          ) : type === 'pie' ? (
            <PieChart margin={{ top: 0, right: 0, bottom: 0, left: 0 }}>
              <Pie
                data={data}
                cx="50%"
                cy="50%"
                innerRadius="42%"
                outerRadius="70%"
                dataKey={yKey || 'value'}
                nameKey={xKey || 'name'}
                paddingAngle={2}
                stroke="none"
              >
                {data.map((_, i) => (
                  <Cell key={i} fill={COLORS[i % COLORS.length]} />
                ))}
              </Pie>
              <Tooltip content={<ChartTooltip />} />
            </PieChart>
          ) : null}
        </ResponsiveContainer>
        )}
      </MeasuredChartContainer>
      {type === 'pie' && <PieLegend data={data} nameKey={xKey || 'name'} />}
    </div>
  );
}
