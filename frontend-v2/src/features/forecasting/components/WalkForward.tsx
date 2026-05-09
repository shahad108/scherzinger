import { CartesianGrid, Line, LineChart, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import type { BacktestPanel } from '@/types/forecast';

interface Props {
  panel: BacktestPanel;
}

export function WalkForward({ panel }: Props) {
  const { series, target, kpis } = panel;

  return (
    <>
      <div className="section-row">
        <div>
          <h2>Walk-forward backtest · 12-month MAPE</h2>
          <div className="sub">
            Each Monday's primary forecast tested against next month's actuals. Walk-forward
            retraining ensures accuracy improves over time.
          </div>
        </div>
        <span className="tag-chip status">Target &lt;5%</span>
      </div>

      <div className="lq-card">
        <div style={{ height: 180, position: 'relative' }}>
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={series} margin={{ top: 8, right: 16, left: 0, bottom: 8 }}>
              <CartesianGrid stroke="#eaedf1" vertical={false} />
              <XAxis
                dataKey="month"
                stroke="#7d8693"
                tick={{ fontSize: 11, fill: '#7d8693' }}
                tickLine={false}
                axisLine={{ stroke: '#dde1e7' }}
              />
              <YAxis
                stroke="#7d8693"
                tick={{ fontSize: 11, fill: '#7d8693' }}
                tickLine={false}
                axisLine={false}
                width={42}
                domain={[3.5, 6]}
                tickFormatter={(v: number) => `${v.toFixed(1)}%`}
              />
              <Tooltip
                cursor={{ stroke: '#c8cdd4', strokeDasharray: '3 3' }}
                contentStyle={{
                  background: 'var(--surface)',
                  border: '1px solid var(--border)',
                  borderRadius: 11,
                  fontSize: 12,
                  boxShadow: 'var(--shadow-pop)',
                }}
                formatter={(value) => [
                  typeof value === 'number' ? `${value.toFixed(1)}%` : String(value ?? ''),
                  'MAPE',
                ]}
              />
              <ReferenceLine
                y={target}
                stroke="#9a3232"
                strokeDasharray="4 4"
                label={{
                  value: `Target ${target.toFixed(1)}%`,
                  position: 'right',
                  fill: '#9a3232',
                  fontSize: 11,
                }}
              />
              <Line
                type="monotone"
                dataKey="mape"
                stroke="#5a7da3"
                strokeWidth={2}
                strokeLinecap="round"
                dot={{ r: 3, fill: '#3e5d80', stroke: '#fff', strokeWidth: 1.2 }}
                activeDot={{ r: 4.5, fill: '#3e5d80' }}
                isAnimationActive={false}
              />
            </LineChart>
          </ResponsiveContainer>
        </div>
      </div>

      <div className="trust-grid" style={{ marginTop: 14 }}>
        {kpis.map((k) => (
          <div className="trust-tile" key={k.label}>
            <div className="lab">{k.label}</div>
            <div className="big" style={{ color: 'var(--green)' }}>
              {k.value}
            </div>
            <div className="cap">{k.caption}</div>
          </div>
        ))}
      </div>
    </>
  );
}
