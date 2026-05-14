// Phase 3 — Cost decomposition multi-line.

import {
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
  Legend,
} from 'recharts';
import type { CostDecomposition } from '@/types/forecast';
import { AccuracyBadge } from './AccuracyBadge';

const LAYER_COLOR = ['#3e5d80', '#9a3232', '#6c5b9a'];

interface Props {
  data: CostDecomposition;
}

export function CostDecompositionCard({ data }: Props) {
  const merged = data.quarters.map((q, i) => {
    const row: Record<string, number | string> = { quarter: q };
    data.layers.forEach((layer) => {
      row[layer.name] = layer.values[i];
    });
    return row;
  });

  return (
    <section className="mt-6">
      <div className="section-row">
        <div>
          <h2>Cost decomposition · material vs full manufacturing</h2>
          <div className="sub">
            Each layer plotted as % of revenue. The insights below are data-driven trend reads.
          </div>
        </div>
        {/* Phase 4.5 audit fix #4: was hardcoded value=0.04. CostDecomposition
            payload doesn't carry its own model MAPE → render "—". */}
        <AccuracyBadge
          data={{ metric: 'mape', value: null, n: data.quarters.length, horizonMonths: 12 }}
          entityType="commodity_group"
          drawerTitle="Cost decomposition — lineage"
        />
      </div>

      <div className="lq-card">
        <div style={{ height: 240 }}>
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={merged} margin={{ top: 8, right: 16, left: 0, bottom: 8 }}>
              <CartesianGrid stroke="#eaedf1" vertical={false} />
              <XAxis dataKey="quarter" stroke="#7d8693" tick={{ fontSize: 11, fill: '#7d8693' }} tickLine={false} axisLine={{ stroke: '#dde1e7' }} />
              <YAxis stroke="#7d8693" tick={{ fontSize: 11, fill: '#7d8693' }} tickLine={false} axisLine={false} domain={[15, 55]} tickFormatter={(v) => `${v.toFixed(0)}%`} width={42} />
              <Tooltip
                contentStyle={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 11, fontSize: 12, boxShadow: 'var(--shadow-pop)' }}
                formatter={(v: number) => `${v.toFixed(1)}%`}
              />
              <Legend wrapperStyle={{ fontSize: 11 }} />
              {data.layers.map((layer, idx) => (
                <Line
                  key={layer.name}
                  type="monotone"
                  dataKey={layer.name}
                  stroke={LAYER_COLOR[idx % LAYER_COLOR.length]}
                  strokeWidth={2}
                  dot={false}
                  isAnimationActive={false}
                />
              ))}
            </LineChart>
          </ResponsiveContainer>
        </div>

        <ul className="mt-3 space-y-1.5 text-[12.5px]" data-testid="cost-insights">
          {data.layers.map((layer, idx) => (
            <li key={layer.name} className="flex items-start gap-2">
              <span
                aria-hidden
                className="mt-1.5 inline-block h-2 w-2 rounded-full"
                style={{ backgroundColor: LAYER_COLOR[idx % LAYER_COLOR.length] }}
              />
              <span>
                <b>{layer.name}:</b> {layer.insight}
              </span>
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}
