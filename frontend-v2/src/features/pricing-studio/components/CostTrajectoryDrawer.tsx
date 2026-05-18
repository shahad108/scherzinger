// Pricing Studio v3 / Phase 3 — Cost Trajectory Drawer.
//
// Right-rail drawer (480px) opened by:
//   - clicking the cost-history sparkline in <CostHistory>
//   - clicking the "View 6mo outlook" pill in <CostHistory>
//   - clicking the <TriggerBanner> body
//
// Five sections (per spec §3.3):
//   1. Header              — title + close
//   2. Today's unit cost   — `today.unit_cost`
//   3. 6mo forecast band   — history line + dashed forecast + p20-p80 ribbon
//   4. Components table    — today→forecast deltas + commodity labels
//   5. Floor cross note    — populated when `floor_crosses_at` is non-null
//   + Actions footer       — set-cost-alert (stub) + open-margin-cockpit-cost
//
// Data fetching via `useCostOutlook(aid, horizon)`. Decimal-as-string
// from the BFF → `parseDecimal` at the formatter boundary.

import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Area,
  ComposedChart,
  Line,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { Drawer } from '@/components/ui/Drawer';
import { DataMissingBadge } from '@/components/DataMissingBadge';
import { LineageButton } from '@/components/LineageButton';
import { useCostOutlook } from '@/data/api/useCostOutlook';
import type { CostHistoryBlock, CostOutlookBlock } from '@/types/studio';
import { parseDecimal } from '../lib/decimal';
import { fmt } from '@/lib/format';
import { AlertSetupDrawer } from './AlertSetupDrawer';

interface Props {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  aid: string;
  /** Cluster shown in the header sub-line (e.g. "BKAGG"). Optional. */
  cluster?: string | null;
  /** History points from the workbench payload — re-rendered as the "solid" segment of the chart. */
  history?: CostHistoryBlock | null;
  horizonMonths?: number;
}

export function CostTrajectoryDrawer({
  open,
  onOpenChange,
  aid,
  cluster,
  history,
  horizonMonths = 6,
}: Props) {
  const { data, isLoading, isError } = useCostOutlook(aid, horizonMonths, {
    enabled: open && Boolean(aid),
  });

  return (
    <Drawer
      open={open}
      onOpenChange={onOpenChange}
      width={480}
      title={`Cost outlook — ${aid}`}
    >
      <div className="ws-cost-drawer" data-testid="cost-trajectory-drawer">
        <header className="ws-cost-drawer-head" data-testid="cost-drawer-header">
          <div className="ws-cost-drawer-title">Cost outlook</div>
          <div className="ws-cost-drawer-sub">
            {aid}
            {cluster ? <> · {cluster}</> : null}
            {data?.horizon_months ? <> · next {data.horizon_months} mo</> : null}
          </div>
        </header>

        <div className="ws-cost-drawer-body" data-testid="cost-drawer-body">
          {isLoading && (
            <div className="text-[12.5px] text-[var(--muted)]" data-testid="cost-drawer-loading">
              Loading cost outlook…
            </div>
          )}
          {isError && (
            <div className="rounded border border-[var(--rose-tint)] bg-[var(--rose-bg)] p-3 text-[12.5px] text-[var(--rose-deep)]" data-testid="cost-drawer-error">
              <DataMissingBadge reason="no cost state" />
              <div className="mt-1">No CostState exists for this SKU yet.</div>
            </div>
          )}
          {data && (
            <>
              <TodaySection payload={data} />
              <ForecastSection payload={data} history={history ?? null} />
              <ComponentsSection payload={data} />
              <FloorCrossSection payload={data} />
            </>
          )}
        </div>

        {data && <ActionsFooter aid={aid} />}
      </div>
    </Drawer>
  );
}

// --- Section: Today --------------------------------------------------------

function TodaySection({ payload }: { payload: CostOutlookBlock }) {
  const today = parseDecimal(payload.today.unit_cost);
  return (
    <section className="ws-cost-section" data-testid="cost-drawer-today">
      <h5>Today's unit cost</h5>
      <div className="ws-cost-today">
        {Number.isFinite(today) ? fmt.eurPrecise(today) : <DataMissingBadge reason="no cost" />}
      </div>
    </section>
  );
}

// --- Section: Forecast band ------------------------------------------------

interface ChartPoint {
  label: string;
  history?: number;
  forecast?: number;
  band?: [number, number];
}

function ForecastSection({
  payload,
  history,
}: {
  payload: CostOutlookBlock;
  history: CostHistoryBlock | null;
}) {
  const chartData = useMemo<ChartPoint[]>(() => {
    const points: ChartPoint[] = [];
    // Historic segment (from workbench.cost_history.points if present)
    if (history?.points && history.points.length > 0) {
      for (const p of history.points) {
        const v = parseDecimal(p.unit_cost);
        if (Number.isFinite(v)) {
          points.push({ label: p.date, history: v });
        }
      }
    }
    // Anchor today
    const today = parseDecimal(payload.today.unit_cost);
    if (Number.isFinite(today)) {
      points.push({ label: 'now', history: today, forecast: today, band: [today, today] });
    }
    // Forecast (p20-p50-p80)
    for (const f of payload.forecast) {
      const p50 = parseDecimal(f.p50_unit_cost);
      const p20 = parseDecimal(f.p20_unit_cost);
      const p80 = parseDecimal(f.p80_unit_cost);
      if (Number.isFinite(p50)) {
        points.push({
          label: `+${f.month_offset}m`,
          forecast: p50,
          band: [
            Number.isFinite(p20) ? p20 : p50,
            Number.isFinite(p80) ? p80 : p50,
          ],
        });
      }
    }
    return points;
  }, [payload, history]);

  const hasBand = chartData.some((p) => Array.isArray(p.band));

  return (
    <section className="ws-cost-section" data-testid="cost-drawer-forecast">
      <div className="flex items-center justify-between">
        <h5>{payload.horizon_months}-month forecast (p20–p80)</h5>
        <LineageButton
          lineageRef={payload.lineage_ref ?? null}
          subjectTitle="Cost outlook"
          label="lineage"
        />
      </div>
      {chartData.length === 0 ? (
        <DataMissingBadge reason="no forecast" />
      ) : (
        <div style={{ width: '100%', height: 140 }}>
          <ResponsiveContainer width="100%" height="100%">
            <ComposedChart data={chartData} margin={{ top: 6, right: 8, left: 0, bottom: 0 }}>
              <XAxis
                dataKey="label"
                tick={{ fontSize: 10, fill: 'var(--muted)' }}
                axisLine={{ stroke: 'var(--hairline)' }}
                tickLine={false}
              />
              <YAxis
                tick={{ fontSize: 10, fill: 'var(--muted)' }}
                axisLine={{ stroke: 'var(--hairline)' }}
                tickLine={false}
                width={36}
                domain={['auto', 'auto']}
              />
              <Tooltip
                contentStyle={{ fontSize: 11, borderRadius: 6 }}
                formatter={(v: number | [number, number]) =>
                  Array.isArray(v)
                    ? `${fmt.eurPrecise(v[0])} – ${fmt.eurPrecise(v[1])}`
                    : fmt.eurPrecise(v)
                }
              />
              {hasBand && (
                <Area
                  type="monotone"
                  dataKey="band"
                  stroke="none"
                  fill="var(--amber)"
                  fillOpacity={0.18}
                  isAnimationActive={false}
                  data-testid="cost-forecast-band"
                />
              )}
              <Line
                type="monotone"
                dataKey="history"
                stroke="var(--ink-2)"
                strokeWidth={2}
                dot={false}
                connectNulls
                isAnimationActive={false}
              />
              <Line
                type="monotone"
                dataKey="forecast"
                stroke="var(--rose-deep)"
                strokeWidth={2}
                strokeDasharray="4 4"
                dot={false}
                connectNulls
                isAnimationActive={false}
              />
            </ComposedChart>
          </ResponsiveContainer>
        </div>
      )}
    </section>
  );
}

// --- Section: Components ---------------------------------------------------

function ComponentsSection({ payload }: { payload: CostOutlookBlock }) {
  return (
    <section className="ws-cost-section" data-testid="cost-drawer-components">
      <h5>Components</h5>
      <div className="ws-cost-components">
        {payload.components.map((c) => {
          const today = parseDecimal(c.today_value);
          const forecast = parseDecimal(c.forecast_value);
          const change = parseDecimal(c.change_pct);
          const up = Number.isFinite(change) && change > 0;
          const down = Number.isFinite(change) && change < 0;
          return (
            <div className="ws-cost-comp-row" key={c.name} data-component={c.name}>
              <span>
                <div className="ws-cost-comp-name">{c.name}</div>
                <div className="ws-cost-comp-commodity">{c.commodity_label}</div>
              </span>
              <span className="tabular-nums">
                {Number.isFinite(today) ? fmt.eurPrecise(today) : '—'}
              </span>
              <span className="ws-cost-comp-arrow" aria-hidden="true">→</span>
              <span
                className={`ws-cost-comp-change ${up ? 'up' : down ? 'down' : ''}`}
                title={
                  Number.isFinite(forecast)
                    ? `forecast ${fmt.eurPrecise(forecast)}`
                    : undefined
                }
              >
                {Number.isFinite(change)
                  ? `${change >= 0 ? '+' : '−'}${Math.abs(change).toFixed(1)}%`
                  : '—'}
              </span>
            </div>
          );
        })}
      </div>
    </section>
  );
}

// --- Section: Floor cross --------------------------------------------------

function FloorCrossSection({ payload }: { payload: CostOutlookBlock }) {
  if (!payload.floor_crosses_at) return null;
  // Coarse month count from horizon_months — the BFF already returns the
  // first crossing within the horizon, so this gives the user a "how far
  // out" feel without re-deriving the calculation.
  return (
    <section className="ws-cost-section" data-testid="cost-drawer-floor">
      <h5>Floor cross</h5>
      <div className="ws-cost-floor">
        Floor crosses today's list price on{' '}
        <b>{payload.floor_crosses_at}</b>
        {' '}— within the next {payload.horizon_months}-month horizon.
      </div>
    </section>
  );
}

// --- Actions footer --------------------------------------------------------

function ActionsFooter({ aid }: { aid: string }) {
  const navigate = useNavigate();
  const [alertOpen, setAlertOpen] = useState(false);

  return (
    <footer className="ws-cost-drawer-actions" data-testid="cost-drawer-actions">
      <button
        type="button"
        className="ws-cost-drawer-btn"
        data-testid="cost-drawer-set-alert"
        onClick={() => setAlertOpen(true)}
        title="Set a cost-movement alert for this SKU"
      >
        Set cost alert
      </button>
      {alertOpen && (
        <AlertSetupDrawer
          open={alertOpen}
          onOpenChange={setAlertOpen}
          triggerKind="cost_threshold"
          scope={{ aid }}
          initialSpec={{ pct: 5, days: 30 }}
        />
      )}
      <button
        type="button"
        className="ws-cost-drawer-btn ws-cost-drawer-btn--primary"
        data-testid="cost-drawer-open-margin"
        onClick={() => navigate(`/margin?aid=${encodeURIComponent(aid)}&source=studio#cost`)}
      >
        Open Margin Cockpit cost lens
      </button>
    </footer>
  );
}
