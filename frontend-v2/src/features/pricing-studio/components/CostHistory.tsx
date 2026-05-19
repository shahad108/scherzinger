import { useMemo } from 'react';
import type {
  CostComponent,
  CostHistoryBlock,
  CostPane,
  CostOutlookBlock,
  HistoryRow,
  WorkbenchBlockMeta,
} from '@/types/studio';
import { renderInline } from './renderInline';
import { parseDecimal, signedPctDelta } from '../lib/decimal';
import { useAuditFeed, type AuditFeedRow } from '@/data/api/useAuditFeed';
import { useCostOutlook } from '@/data/api/useCostOutlook';
import { DataMissingBadge } from '@/components/DataMissingBadge';

interface Props {
  /** Currently selected article — drives the live audit + cost-outlook fetch. */
  aid?: string | null;
  cost: CostPane;
  history: HistoryRow[];
  /**
   * Pricing Studio v3 / Phase 3 — live cost-history payload from the BFF.
   * When supplied the bottom sparkline + commodity trajectory render from
   * `points` / `commodities` instead of the legacy hardcoded SVG points.
   */
  costHistory?: CostHistoryBlock | null;
  /**
   * Phase C3 — `meta.blocks.cost_history` status from the BFF workbench
   * payload. When `locked` / `degraded` / `empty` the inline summary
   * renders a DataMissingBadge + reason instead of fake data. Optional —
   * older BFFs that don't emit meta degrade silently to the live path.
   */
  costHistoryStatus?: WorkbenchBlockMeta | null;
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

/** Map BFF cost-outlook components → the seed-shaped CostComponent[]. */
function componentsFromCostOutlook(
  outlook: CostOutlookBlock,
): CostComponent[] {
  // The BFF ships `breakdown` as fractional shares of unit cost (sum≈1.0).
  // If they happen to be absolute Euros (sum > 1.5) we re-normalise by the
  // total so the rendered bars always stay 0..100%.
  const breakdown = outlook.today?.breakdown ?? {
    material: '0',
    labor: '0',
    outsourcing: '0',
    overhead: '0',
  };
  const values = {
    material: parseDecimal(breakdown.material),
    labor: parseDecimal(breakdown.labor),
    outsourcing: parseDecimal(breakdown.outsourcing),
    overhead: parseDecimal(breakdown.overhead),
  };
  const finite = (n: number) => (Number.isFinite(n) ? n : 0);
  const sum =
    finite(values.material) +
    finite(values.labor) +
    finite(values.outsourcing) +
    finite(values.overhead);
  // Fractional shares already (sum ≈ 1) → just × 100.
  // Absolute Euros (sum > 1.5) → normalise by sum first.
  const scale = sum > 1.5 && sum > 0 ? 100 / sum : 100;
  const pct = (n: number) =>
    Number.isFinite(n) ? Math.round(n * scale * 10) / 10 : 0;
  return [
    { key: 'material', name: 'Material', pct: pct(values.material) },
    { key: 'labor', name: 'Labor', pct: pct(values.labor) },
    { key: 'outsourcing', name: 'Outsourcing', pct: pct(values.outsourcing) },
    { key: 'overhead', name: 'Overhead', pct: pct(values.overhead) },
  ];
}

/** Audit row → human-readable repricing history line. */
function auditRowToHistory(row: AuditFeedRow): HistoryRow | null {
  if (row.action !== 'price_set') return null;
  const at = row.at ?? '';
  // Quarter label "YYYY-QN" from ISO timestamp.
  let dateLabel = at.slice(0, 10) || '—';
  if (at) {
    const d = new Date(at);
    if (!Number.isNaN(d.getTime())) {
      const q = Math.floor(d.getUTCMonth() / 3) + 1;
      dateLabel = `${d.getUTCFullYear()}-Q${q}`;
    }
  }

  // The BFF ships before/after payloads. Older builds nested fields under
  // `payload.from` / `payload.to`; we accept either to be defensive.
  const before = (row.before ?? {}) as Record<string, unknown>;
  const after = (row.after ?? {}) as Record<string, unknown>;
  const pickPrice = (bag: Record<string, unknown>, ...keys: string[]) => {
    for (const k of keys) {
      const v = bag[k];
      if (typeof v === 'string' || typeof v === 'number') return String(v);
    }
    return null;
  };
  const fromStr = pickPrice(before, 'price', 'list_price', 'from');
  const toStr = pickPrice(after, 'price', 'list_price', 'to');
  const fromN = parseDecimal(fromStr);
  const toN = parseDecimal(toStr);

  let move = '—';
  if (Number.isFinite(fromN) && Number.isFinite(toN)) {
    move = `€${fromN.toFixed(2)} → €${toN.toFixed(2)} (${signedPctDelta(fromN, toN, 1)})`;
  } else if (Number.isFinite(toN)) {
    move = `→ €${toN.toFixed(2)}`;
  }

  let volTone: 'up' | 'down' | 'flat' = 'flat';
  if (Number.isFinite(fromN) && Number.isFinite(toN)) {
    if (toN > fromN) volTone = 'up';
    else if (toN < fromN) volTone = 'down';
  }

  const by = row.actor || 'system';
  const hash = (row.lineage_ref?.id ?? row.id ?? '').slice(0, 6) || '—';

  return {
    date: dateLabel,
    move,
    vol: row.reason ?? '',
    volTone,
    by,
    hash,
  };
}

export function CostHistory({
  aid,
  cost,
  history,
  costHistory,
  costHistoryStatus,
  onOpenCostDrawer,
}: Props) {
  // Phase C3 — surface BFF block status (locked/degraded/empty) as a
  // DataMissingBadge in the inline summary. The deep-dive drawer fetches
  // /pricing/sku/{aid}/cost-outlook itself, so a locked workbench block
  // doesn't block the drawer.
  const blockedStatus =
    costHistoryStatus && costHistoryStatus.status !== 'live'
      ? costHistoryStatus
      : null;
  // ---- Live audit feed (repricing history) -----------------------------
  // We only request the first page (PAGE_SIZE=50 server-side) and
  // pre-filter to `price` actions. The hook is a no-op until aid is set.
  const auditFilters = useMemo(
    () => ({ pills: ['price'] as const }),
    [],
  );
  const auditQuery = useAuditFeed(aid ?? '', auditFilters, {
    enabled: Boolean(aid),
  });

  const liveHistory = useMemo<HistoryRow[] | null>(() => {
    const pages = auditQuery.data?.pages;
    if (!pages || pages.length === 0) return null;
    const rows = pages.flatMap((p) => p.rows);
    if (rows.length === 0) return [];
    const mapped: HistoryRow[] = [];
    for (const r of rows) {
      const h = auditRowToHistory(r);
      if (h) mapped.push(h);
    }
    return mapped;
  }, [auditQuery.data]);

  const historySource: 'live' | 'fallback' =
    auditQuery.isSuccess && liveHistory !== null ? 'live' : 'fallback';
  const historyRows: HistoryRow[] =
    historySource === 'live' && liveHistory ? liveHistory : history;

  // ---- Live cost outlook (composition + commodity trajectory) ---------
  const outlookQuery = useCostOutlook(aid ?? '', 6, {
    enabled: Boolean(aid),
  });
  const outlook = outlookQuery.data ?? null;

  const components: CostComponent[] = useMemo(() => {
    if (outlook) return componentsFromCostOutlook(outlook);
    return cost.components;
  }, [outlook, cost.components]);

  // ---- Trajectory polylines -------------------------------------------
  // Priority: BFF cost_history payload → BFF cost-outlook forecast →
  // legacy hard-coded seed strings.
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

  // Fall back to the cost-outlook forecast as a synthetic trajectory when
  // cost_history is empty but cost-outlook is available.
  const outlookPolyline = useMemo(() => {
    if (livePolylines) return null;
    if (!outlook?.forecast?.length) return null;
    const values: number[] = [];
    for (const f of outlook.forecast) {
      const v = parseDecimal(f.p50_unit_cost);
      if (Number.isFinite(v)) values.push(v);
    }
    const built = buildPolyline(values);
    if (!built) return null;
    return built;
  }, [livePolylines, outlook]);

  const materialPoints =
    livePolylines?.material ?? outlookPolyline ?? cost.trajectory.materialPoints;
  const quotedPoints =
    livePolylines?.quoted ?? cost.trajectory.quotedPoints;

  // Compute a real "+X% YYYY→YYYY" delta when we have trajectory data.
  const trajectoryDelta = useMemo(() => {
    const livePoints = costHistory?.points ?? [];
    if (livePoints.length >= 2) {
      const first = parseDecimal(livePoints[0].unit_cost);
      const last = parseDecimal(livePoints[livePoints.length - 1].unit_cost);
      if (Number.isFinite(first) && Number.isFinite(last)) {
        return `Trajectory ${signedPctDelta(first, last, 1)} cluster`;
      }
    }
    if (outlook?.commodity_trend?.length) {
      const t = outlook.commodity_trend[0];
      // BFF ships monthly_yoy_pct already as a percent unit (e.g. -4.76
      // means -4.76%), so we render it directly without re-scaling.
      const sign = t.monthly_yoy_pct >= 0 ? '+' : '';
      return `${t.commodity} ${sign}${t.monthly_yoy_pct.toFixed(1)}% YoY`;
    }
    return cost.trajectory.delta;
  }, [costHistory, outlook, cost.trajectory.delta]);

  const compositionSource: 'live' | 'fallback' = outlook
    ? 'live'
    : 'fallback';
  const compositionEmpty =
    !outlook && !cost.components.length && !costHistory?.points?.length;

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
        {compositionSource === 'live' && (
          <span
            data-testid="cost-composition-source"
            style={{
              marginLeft: 6,
              fontSize: 10,
              color: 'var(--ink-2)',
              fontWeight: 600,
              letterSpacing: '0.05em',
              textTransform: 'uppercase',
            }}
          >
            live
          </span>
        )}
      </h4>
      {blockedStatus ? (
        <div
          data-testid="cost-history-block-status"
          data-status={blockedStatus.status}
          style={{ marginTop: 4 }}
        >
          <DataMissingBadge
            reason={blockedStatus.reason ?? blockedStatus.status}
          />
        </div>
      ) : compositionEmpty ? (
        <p className="cluster-note" style={{ marginTop: 4 }}>
          <i style={{ fontStyle: 'normal', color: 'var(--ink-2)', fontWeight: 600 }}>
            Cost composition not yet available for this SKU.
          </i>
        </p>
      ) : (
        <div className="ws-cost">
          {components.map((c) => (
            <div className="ws-cost-row" key={c.key}>
              <span className="ws-cost-name">{c.name}</span>
              <span className="ws-cost-bar">
                <span className={`ws-cost-fill ${c.key}`} style={{ width: `${c.pct}%` }} />
              </span>
              <span className="ws-cost-pct">{c.pct}%</span>
            </div>
          ))}
        </div>
      )}
      <p className="ws-cost-foot">
        {cost.note} For full cost-vs-price 24-mo trajectory see <a href="#">Margin Intelligence</a>.
      </p>

      <div className="ws-cost-traj">
        <div className="ws-cost-traj-head">
          <span>{cost.trajectory.title}</span>
          <span className="delta-bad">{trajectoryDelta}</span>
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
              stroke="var(--rose)"
              strokeWidth="2"
              points={materialPoints}
            />
            <polyline
              fill="none"
              stroke="var(--ink)"
              strokeWidth="2"
              strokeDasharray="3 3"
              points={quotedPoints}
            />
            <text x="4" y="36" fontSize="8" fill="var(--ink-3)">
              {cost.trajectory.yearStart}
            </text>
            <text x="220" y="36" fontSize="8" fill="var(--ink-3)">
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
        Repricing history{' '}
        <span className="ws-pane-sub">this SKU only · audit-hash signed</span>
        {historySource === 'live' && (
          <span
            data-testid="repricing-source-chip"
            style={{
              marginLeft: 6,
              fontSize: 10,
              color: 'var(--ink-2)',
              fontWeight: 600,
              letterSpacing: '0.05em',
              textTransform: 'uppercase',
            }}
          >
            live
          </span>
        )}
      </h4>
      {historySource === 'live' && historyRows.length === 0 ? (
        <p className="cluster-note" style={{ marginTop: 4 }}>
          <i style={{ fontStyle: 'normal', color: 'var(--ink-2)', fontWeight: 600 }}>
            No repricing events recorded for this SKU yet.
          </i>{' '}
          New SKU — see the <b>Comparable-cluster pricing</b> panel below for the suggested band.
        </p>
      ) : historyRows.length > 0 ? (
        <div className="ws-history">
          {historyRows.map((h, idx) => (
            <div className="ws-hist-row" key={`${h.date}-${h.hash}-${idx}`}>
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
