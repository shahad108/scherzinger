import {
  LineChart, Line, BarChart, Bar, PieChart, Pie, Cell,
  XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer,
} from 'recharts';

const COLORS = ['#2563eb', '#16a34a', '#dc2626', '#d97706', '#7c3aed', '#0891b2'];

function toRows(series) {
  if (!series || series.length === 0) return [];
  const firstData = series[0].data || [];
  const rows = firstData.map((d, i) => {
    const x = (d && typeof d === 'object' && 'x' in d) ? d.x : i;
    const row = { x };
    series.forEach(s => {
      const point = (s.data || [])[i];
      const y = (point && typeof point === 'object') ? point.y : point;
      row[s.name] = y;
    });
    return row;
  });
  return rows;
}

export default function Chart({ spec }) {
  const { variant, title, series = [], xLabel, yLabel, caption } = spec;
  return (
    <div className="my-3 rounded-xl ring-1 ring-slate-200 bg-white p-4">
      {title && <div className="text-sm font-semibold text-slate-800 mb-2">{title}</div>}
      <div className="h-56">
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
              <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
              <XAxis dataKey="x" label={xLabel ? { value: xLabel, position: 'insideBottom', offset: -4 } : undefined} tick={{ fontSize: 11 }} />
              <YAxis label={yLabel ? { value: yLabel, angle: -90, position: 'insideLeft' } : undefined} tick={{ fontSize: 11 }} />
              <Tooltip />
              <Legend />
              {series.map((s, i) => <Bar key={s.name} dataKey={s.name} fill={COLORS[i % COLORS.length]} />)}
            </BarChart>
          ) : (
            <LineChart data={toRows(series)}>
              <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
              <XAxis dataKey="x" label={xLabel ? { value: xLabel, position: 'insideBottom', offset: -4 } : undefined} tick={{ fontSize: 11 }} />
              <YAxis label={yLabel ? { value: yLabel, angle: -90, position: 'insideLeft' } : undefined} tick={{ fontSize: 11 }} />
              <Tooltip />
              <Legend />
              {series.map((s, i) => <Line key={s.name} type="monotone" dataKey={s.name} stroke={COLORS[i % COLORS.length]} strokeWidth={2} dot={false} />)}
            </LineChart>
          )}
        </ResponsiveContainer>
      </div>
      {caption && <div className="mt-2 text-xs text-slate-500">{caption}</div>}
    </div>
  );
}
