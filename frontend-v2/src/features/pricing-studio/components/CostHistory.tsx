import { useMemo } from 'react';
import type { CostHistoryBlock, CostPane, HistoryRow } from '@/types/studio';
import { renderInline } from './renderInline';
import { parseDecimal } from '../lib/decimal';

interface Props {
  cost: CostPane;
  history: HistoryRow[];
  /**
   * Pricing Studio v3 / Phase 3 — live cost-history payload from the BFF.
   * When supplied the bottom sparkline + commodity trajectory render from
   * `points` / `commodities` instead of the legacy hardcoded SVG points.
   */
  costHistory?: CostHistoryBlock | null;
  /**
   * Opens the Cost Trajectory Drawer. Called by the sparkline click and
   * the "View 6mo outlook" pill in the header.
   */
  onOpenCostDrawer?: () => void;
}

interface SparkPoint {
  x: number;
  y: number;
}

/** Build an SVG polyline string from numeric points using viewBox 0..240 / 0..38. */
function buildPolyline(values: number[]): string {
  if (values.length === 0) return '';
  const min = Math.min(...values);
  const max = Math.max(...values);
  const range = max - min || 1;
  const width = 240;
  const height = 38;
  const padY = 4;
  const innerH = height - padY * 2;
  const stepX = values.length > 1 ? width / (values.length - 1) : 0;
  const pts: SparkPoint[] = values.map((v, i) => ({
    x: Math.round(i * stepX * 10) / 10,
    // invert Y so higher value sits higher visually
    y: Math.round((padY + innerH * (1 - (v - min) / range)) * 10) / 10,
  }));
  return pts.map((p) => `${p.x},${p.y}`).join(' ');
}

export function CostHistory({ cost, history, costHistory, onOpenCostDrawer }: Props) {
  // Build the live polylines if we have BFF data. We prefer the BFF points
  // over the legacy `materialPoints` / `quotedPoints` SVG strings shipped
  // in the workbench shell.
  const livePolylines = useMemo(() => {
    if (!costHistory) return null;
    const livePoints = costHistory.points ?? [];
    const materialValues: number[] = [];
    for (const p of livePoints) {
      const v = parseDecimal(p.breakdown?.material ?? p.unit_cost);
      if (Number.isFinite(v)) materialValues.push(v);
    }
    // First commodity trajectory (if present) becomes the "quoted" line.
    const commodity = costHistory.commodities?.[0];
    const commodityValues: number[] = [];
    const series = commodity?.trajectory ?? commodity?.points ?? [];
    for (const t of series) {
      const v = parseDecimal(typeof t === 'object' ? (t.value ?? null) : null);
      if (Number.isFinite(v)) commodityValues.push(v);
    }
    const material = buildPolyline(materialValues);
    const commodityLine = buildPolyline(commodityValues);
    if (!material && !commodityLine) return null;
    return {
      material: material || cost.trajectory.materialPoints,
      quoted: commodityLine || cost.trajectory.quotedPoints,
    };
  }, [costHistory, cost.trajectory]);

  const materialPoints = livePolylines?.material ?? cost.trajectory.materialPoints;
  const quotedPoints = livePolylines?.quoted ?? cost.trajectory.quotedPoints;

  return (
    <div className="ws-pane">
      <h4>
        Cost composition <span className="ws-pane-sub">{renderInline(cost.paneSub)}</span>
        {onOpenCostDrawer && (
          <button
            type="button"
            className="ws-cost-pill"
            data-testid="cost-outlook-pill"
            style={{ marginLeft: 8 }}
            onClick={onOpenCostDrawer}
          >
            View 6mo outlook ↗
          </button>
        )}
      </h4>
      <div className="ws-cost">
        {cost.components.map((c) => (
          <div className="ws-cost-row" key={c.key}>
            <span className="ws-cost-name">{c.name}</span>
            <span className="ws-cost-bar">
              <span className={`ws-cost-fill ${c.key}`} style={{ width: `${c.pct}%` }} />
            </span>
            <span className="ws-cost-pct">{c.pct}%</span>
          </div>
        ))}
      </div>
      <p className="ws-cost-foot">
        {cost.note} For full cost-vs-price 24-mo trajectory see <a href="#">Margin Intelligence</a>.
      </p>

      <div className="ws-cost-traj">
        <div className="ws-cost-traj-head">
          <span>{cost.trajectory.title}</span>
          <span className="delta-bad">{cost.trajectory.delta}</span>
        </div>
        <button
          type="button"
          data-testid="cost-traj-sparkline"
          onClick={onOpenCostDrawer}
          disabled={!onOpenCostDrawer}
          aria-label="Open cost outlook drawer"
          style={{
            display: 'block',
            width: '100%',
            padding: 0,
            background: 'none',
            border: 'none',
            cursor: onOpenCostDrawer ? 'pointer' : 'default',
          }}
        >
          <svg
            viewBox="0 0 240 38"
            width="100%"
            height="38"
            preserveAspectRatio="none"
            style={{ display: 'block' }}
          >
            <polyline
              fill="none"
              stroke="#5a7da3"
              strokeWidth="2"
              points={materialPoints}
            />
            <polyline
              fill="none"
              stroke="#101418"
              strokeWidth="2"
              strokeDasharray="3 3"
              points={quotedPoints}
            />
            <text x="4" y="36" fontSize="8" fill="#4a5360">
              {cost.trajectory.yearStart}
            </text>
            <text x="220" y="36" fontSize="8" fill="#4a5360">
              {cost.trajectory.yearEnd}
            </text>
          </svg>
        </button>
        <div className="ws-cost-traj-foot">
          <span className="leg-rose">— Material cost</span> ·{' '}
          <span className="leg-ink">— Quoted price</span> · {cost.trajectory.legend}
        </div>
      </div>

      <h4 className="row2">
        Repricing history <span className="ws-pane-sub">this SKU only · audit-hash signed</span>
      </h4>
      {history.length > 0 ? (
        <div className="ws-history">
          {history.map((h) => (
            <div className="ws-hist-row" key={`${h.date}-${h.hash}`}>
              <span className="ws-hist-date">{h.date}</span>
              <span className="ws-hist-move">{h.move}</span>
              <span className={`ws-hist-vol ${h.volTone}`}>{h.vol}</span>
              <span className="ws-hist-by">
                {h.by} · <code>{h.hash}</code>
              </span>
            </div>
          ))}
        </div>
      ) : (
        <p className="cluster-note" style={{ marginTop: 4 }}>
          <i style={{ fontStyle: 'normal', color: 'var(--ink-2)', fontWeight: 600 }}>
            No prior repricings.
          </i>{' '}
          New SKU — see the <b>Comparable-cluster pricing</b> panel below for the suggested band.
        </p>
      )}
    </div>
  );
}
