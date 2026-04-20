import {
  LineChart, Line, BarChart, Bar, PieChart, Pie, Cell,
  XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer,
} from 'recharts';

const COLORS = ['#2563eb', '#16a34a', '#dc2626', '#d97706', '#7c3aed', '#0891b2'];

function toRows(series) {
  if (!series || series.length === 0) return [];
  const firstData = series[0].data || [];
  return firstData.map((d, i) => {
    const x = (d && typeof d === 'object' && 'x' in d) ? d.x : i;
    const row = { x };
    series.forEach(s => {
      const point = (s.data || [])[i];
      const y = (point && typeof point === 'object') ? point.y : point;
      row[s.name] = y;
    });
    return row;
  });
}

function CompactDonutList({ spec }) {
  const data = (spec.series?.[0]?.data || []).map((d, i) => ({
    name: (d && d.x) ?? `Slice ${i+1}`,
    value: Number((d && d.y) ?? d) || 0,
  }));
  const total = data.reduce((s, d) => s + d.value, 0) || 1;
  const top3 = [...data].sort((a, b) => b.value - a.value).slice(0, 3);
  return (
    <div className="my-2 rounded-xl ring-1 ring-slate-200 bg-white p-3">
      {spec.title && <div className="text-[11px] font-semibold text-slate-800 mb-1.5">{spec.title}</div>}
      <ul className="space-y-1">
        {top3.map((d, i) => (
          <li key={i} className="flex items-center gap-2 text-[11px]">
            <span className="w-2 h-2 rounded-full" style={{ background: COLORS[i % COLORS.length] }} />
            <span className="flex-1 min-w-0 truncate text-slate-700">{d.name}</span>
            <span className="font-semibold text-slate-900 tabular-nums">{((d.value / total) * 100).toFixed(0)}%</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

export default function Chart({ spec, compact = false }) {
  const { variant, title, series = [], xLabel, yLabel, caption } = spec;

  if (compact && variant === 'donut') return <CompactDonutList spec={spec} />;

  const height = compact ? 80 : 224;
  const showAxes = !compact;
  const showLegend = !compact;
  const wrapperPad = compact ? 'p-2' : 'p-4';
  const titleCls = compact ? 'text-[11px] font-semibold text-slate-800 mb-1' : 'text-sm font-semibold text-slate-800 mb-2';

  return (
    <div className={`my-2 rounded-xl ring-1 ring-slate-200 bg-white ${wrapperPad}`}>
      {title && <div className={titleCls}>{title}</div>}
      <div style={{ height }}>
        <ResponsiveContainer width="100%" height="100%">
          {variant === 'donut' ? (
            <PieChart>
              <Pie
                data={(series[0]?.data || []).map((d, i) => ({
                  name: (d && d.x) ?? `Slice ${i+1}`,
                  value: (d && d.y) ?? d,
                }))}
                dataKey="value"
                nameKey="name"
                innerRadius={50}
                outerRadius={80}
                paddingAngle={2}
              >
                {(series[0]?.data || []).map((_, i) => (
                  <Cell key={i} fill={COLORS[i % COLORS.length]} />
                ))}
              </Pie>
              <Tooltip />
              <Legend />
            </PieChart>
          ) : variant === 'bar' ? (
            <BarChart data={toRows(series)}>
              {!compact && <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />}
              {showAxes && <XAxis dataKey="x" label={xLabel ? { value: xLabel, position: 'insideBottom', offset: -4 } : undefined} tick={{ fontSize: 11 }} />}
              {showAxes && <YAxis label={yLabel ? { value: yLabel, angle: -90, position: 'insideLeft' } : undefined} tick={{ fontSize: 11 }} />}
              <Tooltip />
              {showLegend && <Legend />}
              {series.map((s, i) => <Bar key={s.name} dataKey={s.name} fill={COLORS[i % COLORS.length]} />)}
            </BarChart>
          ) : (
            <LineChart data={toRows(series)}>
              {!compact && <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />}
              {showAxes && <XAxis dataKey="x" label={xLabel ? { value: xLabel, position: 'insideBottom', offset: -4 } : undefined} tick={{ fontSize: 11 }} />}
              {showAxes && <YAxis label={yLabel ? { value: yLabel, angle: -90, position: 'insideLeft' } : undefined} tick={{ fontSize: 11 }} />}
              <Tooltip />
              {showLegend && <Legend />}
              {series.map((s, i) => <Line key={s.name} type="monotone" dataKey={s.name} stroke={COLORS[i % COLORS.length]} strokeWidth={2} dot={false} />)}
            </LineChart>
          )}
        </ResponsiveContainer>
      </div>
      {!compact && caption && <div className="mt-2 text-xs text-slate-500">{caption}</div>}
    </div>
  );
}
