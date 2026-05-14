// ErosionProjectionCard — v2.2 Phase E.
//
// Forward projection of list price vs. cost floor per cluster. Each row
// shows a dual-line Recharts chart (list price + floor) over the horizon
// and surfaces the month projected list crosses the floor (or a
// "above floor for full horizon" chip when there's no crossover).
//
// Also exposes the client's price-update cadence vs. a monthly
// benchmark — the reviewer flagged this as the missing forward-looking
// signal alongside the historical floor card.
//
// Filter contract (Phase C): honors cluster (backend supports it) but
// NOT tier/family. Renders the scoped variant of FilterScopeBadge when
// only cluster is active, and the muted "unfiltered" variant when
// tier/family is active.

import { Line, LineChart, ReferenceDot, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { FilterScopeBadge } from './FilterScopeBadge';
import type {
  ErosionProjection,
  ErosionProjectionPoint,
  ErosionProjectionRow,
  FilterScope,
} from '@/types/forecast';

interface Props {
  data?: ErosionProjection;
  filterScope?: FilterScope;
}

function fmtEur(v: number): string {
  return `€${v.toFixed(2)}`;
}

function crossoverPoint(row: ErosionProjectionRow): ErosionProjectionPoint | null {
  if (!row.crossoverMonth) return null;
  return row.projection.find((p) => p.month === row.crossoverMonth) ?? null;
}

function CadenceChip({ row }: { row: ErosionProjectionRow }) {
  const every = row.cadence.updatesEveryMonths;
  const text =
    every == null
      ? 'cadence unknown · benchmark monthly'
      : `updates every ${every}mo · benchmark monthly`;
  const tone =
    every == null
      ? 'bg-[var(--surface-soft)] text-[var(--ink-2)]'
      : every <= 1
        ? 'bg-emerald-50 text-emerald-800'
        : every <= 6
          ? 'bg-amber-50 text-amber-800'
          : 'bg-rose-50 text-rose-700';
  return (
    <span
      data-testid="erosion-cadence-chip"
      className={`inline-flex items-center rounded-full px-2 py-0.5 text-[10.5px] font-semibold uppercase tracking-wide ${tone}`}
    >
      {text}
    </span>
  );
}

function StatusChip({ row }: { row: ErosionProjectionRow }) {
  const crossover = row.crossoverMonth;
  if (crossover) {
    return (
      <span
        data-testid="erosion-crossover-chip"
        className="inline-flex items-center rounded-full bg-rose-50 px-2 py-0.5 text-[10.5px] font-semibold uppercase tracking-wide text-rose-700"
      >
        crosses floor: {crossover}
      </span>
    );
  }
  return (
    <span
      data-testid="erosion-safe-chip"
      className="inline-flex items-center rounded-full bg-emerald-50 px-2 py-0.5 text-[10.5px] font-semibold uppercase tracking-wide text-emerald-800"
    >
      above floor for full horizon
    </span>
  );
}

function ProjectionChart({ row }: { row: ErosionProjectionRow }) {
  const cross = crossoverPoint(row);
  return (
    <div className="h-28 w-full" data-testid="erosion-chart">
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={row.projection} margin={{ top: 6, right: 8, left: 8, bottom: 4 }}>
          <XAxis
            dataKey="month"
            tick={{ fontSize: 9, fill: 'var(--muted)' }}
            tickLine={false}
            axisLine={false}
            interval="preserveStartEnd"
          />
          <YAxis
            tick={{ fontSize: 9, fill: 'var(--muted)' }}
            tickLine={false}
            axisLine={false}
            width={36}
            tickFormatter={(v: number) => `€${v.toFixed(0)}`}
          />
          <Tooltip
            cursor={{ stroke: 'var(--hairline)', strokeWidth: 1 }}
            contentStyle={{
              fontSize: 11,
              padding: '4px 6px',
              border: '1px solid var(--hairline)',
              borderRadius: 6,
            }}
            formatter={(value: number, name: string) => [
              fmtEur(Number(value)),
              name === 'listPrice' ? 'List price' : 'Floor',
            ]}
            labelFormatter={(label: string) => label}
          />
          <Line
            type="monotone"
            dataKey="listPrice"
            stroke="#1f3a5f"
            strokeWidth={1.75}
            dot={false}
            isAnimationActive={false}
          />
          <Line
            type="monotone"
            dataKey="floor"
            stroke="#7d8693"
            strokeWidth={1.25}
            strokeDasharray="4 3"
            dot={false}
            isAnimationActive={false}
          />
          {cross && (
            <ReferenceDot
              x={cross.month}
              y={cross.listPrice}
              r={4}
              fill="#be123c"
              stroke="#fff"
              strokeWidth={1.5}
              isFront
              ifOverflow="visible"
            />
          )}
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}

export function ErosionProjectionCard({ data, filterScope }: Props) {
  if (!data || !data.rows || data.rows.length === 0) return null;

  // Card honors cluster but not tier/family. Show unfiltered badge when
  // tier or family is set; muted scoped badge when only cluster is set.
  const tierOrFamilyActive = !!filterScope && (!!filterScope.tier || !!filterScope.family);

  return (
    <section
      data-testid="erosion-projection-card"
      className="mb-4 rounded-[12px] border border-[var(--hairline)] bg-white p-4"
    >
      <header className="mb-3 flex items-baseline justify-between gap-3">
        <div>
          <div className="text-[10.5px] font-semibold uppercase tracking-wide text-[var(--muted)]">
            Erosion projection — next {data.horizonMonths} months
          </div>
          <div className="font-display text-[16px] font-bold tracking-tight">
            When does list price meet cost?
          </div>
        </div>
        {tierOrFamilyActive ? (
          <FilterScopeBadge unfiltered scope={filterScope} />
        ) : (
          <FilterScopeBadge scope={filterScope} />
        )}
      </header>
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        {data.rows.map((row) => (
          <div
            key={row.cluster}
            data-testid="erosion-row"
            data-cluster={row.cluster}
            className="rounded-[10px] border border-[var(--hairline)] p-3"
          >
            <div className="mb-1 flex items-baseline justify-between gap-2">
              <div className="font-display text-[14px] font-semibold tracking-tight">
                {row.cluster}
              </div>
              <StatusChip row={row} />
            </div>
            <div className="mb-2 flex flex-wrap items-baseline gap-x-3 gap-y-1 text-[11px] text-[var(--muted)]">
              <span>
                List <span className="font-semibold text-[var(--ink-1)]">{fmtEur(row.currentListPrice)}</span>
              </span>
              <span>
                Floor <span className="font-semibold text-[var(--ink-1)]">{fmtEur(row.currentFloor)}</span>
              </span>
              <CadenceChip row={row} />
            </div>
            <ProjectionChart row={row} />
          </div>
        ))}
      </div>
      <p className="mt-3 text-[11px] text-[var(--muted)]">
        Projects current list-price and cost trajectories forward {data.horizonMonths} months.
        A crossover marker flags the month projected list price meets the cost floor.
      </p>
    </section>
  );
}
