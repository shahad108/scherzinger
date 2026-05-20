// Pricing Studio v3 / Phase 6 — Batch Workbench.
//
// Replaces the single-SKU workbench when the user is in Batch mode and has
// staged ≥ 2 AIDs. Three stacked sections:
//   (a) Rule selector — live form, no save until "Preview batch"
//   (b) KPI strip — totals across the preview
//   (c) Preview table — per-AID rows with lock toggle + click-to-lineage
//
// The Rule + Scope form holds local state until the user presses "Preview
// batch", which calls POST /pricing/batches. The returned ``batch_id`` is
// then handed back via ``onBatchCreated`` so the page can hold it on the
// URL + use ``useBatch`` for subsequent renders.
//
// Decimal-as-string is preserved end-to-end. Where we display we go through
// ``parseDecimal`` + ``Intl.NumberFormat`` formatters; the wire value never
// loses precision.

import { useMemo, useState } from 'react';
import {
  useCreateBatch,
  type BatchEnvelope,
  type BatchItem,
  type BatchRule,
  type BatchRuleKind,
  type ScopeFilter,
} from '@/data/api/useBatch';
import { parseDecimal } from '../lib/decimal';

interface Props {
  aids: string[];
  batch: BatchEnvelope | null;
  staleAids: Set<string>;
  lockedAids: string[];
  onToggleLock: (aid: string) => void;
  onBatchCreated: (batchId: string) => void;
  onOpenLineageForAid?: (aid: string, lineageRef: string | null) => void;
  onCommitClick: () => void;
  onCancelClick: () => void;
  scopeFilter?: ScopeFilter;
}

const RULE_LABELS: Record<BatchRuleKind, string> = {
  floor_plus: 'Floor + X pp',
  pct_move: 'Uniform % move',
  match_competitor: 'Match competitor',
  target_db2: 'Target DB2 %',
  custom_jsonlogic: 'Custom (advanced)',
};

const RULE_HINTS: Record<BatchRuleKind, string> = {
  floor_plus:
    'Sets after = floor × (1 + margin/100). Falls back to unit cost when no floor is recorded.',
  pct_move:
    'Uniform percentage move. Optional WTP-p90 cap protects against over-aggressive raises.',
  match_competitor:
    'Anchors to competitor median × (1 − undershoot/100). Holds current price when the competitor signal is missing.',
  target_db2:
    'Solves for the price on the win-prob curve whose projected DB2/invoiced hits the target.',
  custom_jsonlogic:
    'Advanced. Provide a JSON-logic expression that returns the numeric after-price.',
};

function fmtEuro(value: string | null | undefined): string {
  const n = parseDecimal(value ?? null);
  if (!Number.isFinite(n)) return '—';
  return new Intl.NumberFormat('de-DE', {
    style: 'currency',
    currency: 'EUR',
    maximumFractionDigits: 2,
  }).format(n);
}

function fmtEuroSigned(value: string | null | undefined): string {
  const n = parseDecimal(value ?? null);
  if (!Number.isFinite(n)) return '—';
  const sign = n >= 0 ? '+' : '−';
  return `${sign}${new Intl.NumberFormat('de-DE', {
    style: 'currency',
    currency: 'EUR',
    maximumFractionDigits: 0,
  }).format(Math.abs(n))}`;
}

function fmtPct(value: string | null | undefined, digits = 1): string {
  const n = parseDecimal(value ?? null);
  if (!Number.isFinite(n)) return '—';
  return `${(n * 100).toFixed(digits)}%`;
}

function fmtDeltaPct(
  before: string | null | undefined,
  after: string | null | undefined,
): string {
  const b = parseDecimal(before ?? null);
  const a = parseDecimal(after ?? null);
  if (!Number.isFinite(b) || !Number.isFinite(a) || b === 0) return '—';
  const pct = ((a - b) / b) * 100;
  const sign = pct >= 0 ? '+' : '−';
  return `${sign}${Math.abs(pct).toFixed(1)}%`;
}

function riskTone(score: string | null | undefined): 'lo' | 'mid' | 'hi' {
  const n = parseDecimal(score ?? null);
  if (!Number.isFinite(n)) return 'lo';
  if (n < 0.34) return 'lo';
  if (n < 0.67) return 'mid';
  return 'hi';
}

function riskLabel(score: string | null | undefined): string {
  const tone = riskTone(score);
  return tone === 'lo' ? 'Low' : tone === 'mid' ? 'Med' : 'High';
}

function deltaPctNumeric(
  before: string | null | undefined,
  after: string | null | undefined,
): number {
  const b = parseDecimal(before ?? null);
  const a = parseDecimal(after ?? null);
  if (!Number.isFinite(b) || !Number.isFinite(a) || b === 0) return Number.NaN;
  return ((a - b) / b) * 100;
}

export function BatchWorkbench({
  aids,
  batch,
  staleAids,
  lockedAids,
  onToggleLock,
  onBatchCreated,
  onOpenLineageForAid,
  onCommitClick,
  onCancelClick,
  scopeFilter,
}: Props) {
  const [ruleKind, setRuleKind] = useState<BatchRuleKind>('floor_plus');
  const [marginPp, setMarginPp] = useState<string>('20');
  const [pct, setPct] = useState<string>('5');
  const [floorCap, setFloorCap] = useState<boolean>(false);
  const [undershootPct, setUndershootPct] = useState<string>('2');
  const [targetPp, setTargetPp] = useState<string>('30');
  const [jsonLogic, setJsonLogic] = useState<string>(
    '{"+": [{"var": "current_price"}, 0]}',
  );

  const createBatch = useCreateBatch();

  const items = batch?.items ?? [];
  const kpi = batch?.kpi_summary ?? null;
  const routing = batch?.approval_routing_summary ?? null;
  const lockedSet = useMemo(() => new Set(lockedAids), [lockedAids]);

  const buildRule = (): BatchRule | null => {
    switch (ruleKind) {
      case 'floor_plus':
        return { kind: 'floor_plus', margin_pp: marginPp };
      case 'pct_move':
        return { kind: 'pct_move', pct, floor_cap: floorCap };
      case 'match_competitor':
        return { kind: 'match_competitor', undershoot_pct: undershootPct };
      case 'target_db2':
        return { kind: 'target_db2', target_pp: targetPp };
      case 'custom_jsonlogic': {
        try {
          const expr = JSON.parse(jsonLogic) as Record<string, unknown>;
          return { kind: 'custom_jsonlogic', expression: expr };
        } catch {
          return null;
        }
      }
    }
  };

  const onPreview = () => {
    const rule = buildRule();
    if (!rule || aids.length < 2) return;
    createBatch.mutate(
      { aids, rule, scope_filter: scopeFilter ?? {} },
      {
        onSuccess: (data) => onBatchCreated(data.batch_id),
      },
    );
  };

  const ruleValid = useMemo(() => buildRule() !== null, [
    ruleKind,
    marginPp,
    pct,
    floorCap,
    undershootPct,
    targetPp,
    jsonLogic,
    // eslint-disable-next-line react-hooks/exhaustive-deps
  ]);

  // Liveness of commit: any items with a finite after_price that are not
  // locked or blocked.
  const committableCount = items.filter(
    (it) => !lockedSet.has(it.aid) && !it.preview.block && it.after_price !== null,
  ).length;

  return (
    <div
      className="ws-batch-workbench"
      data-testid="batch-workbench"
    >
      {/* ── (a) Rule selector ─────────────────────────────────────────── */}
      <section
        className="ws-batch-card"
        data-testid="batch-rule-selector"
      >
        <div className="ws-batch-card-head">
          <div>
            <h3 className="ws-batch-card-title">Repricing rule</h3>
            <div className="ws-batch-card-sub">
              {aids.length} SKUs staged. Adjust the rule below, then preview the move.
            </div>
          </div>
        </div>
        <div className="ws-batch-rule-fields">
          <div className="ws-batch-field">
            <label htmlFor="ws-batch-rule-kind">Rule</label>
            <select
              id="ws-batch-rule-kind"
              value={ruleKind}
              onChange={(e) => setRuleKind(e.target.value as BatchRuleKind)}
              data-testid="batch-rule-kind-select"
            >
              {(Object.keys(RULE_LABELS) as BatchRuleKind[]).map((k) => (
                <option key={k} value={k}>
                  {RULE_LABELS[k]}
                </option>
              ))}
            </select>
          </div>

          <div className="ws-batch-field">
            {ruleKind === 'floor_plus' && (
              <>
                <label htmlFor="ws-batch-margin-pp">Margin (pp over floor)</label>
                <input
                  id="ws-batch-margin-pp"
                  type="number"
                  step="0.5"
                  value={marginPp}
                  onChange={(e) => setMarginPp(e.target.value)}
                  data-testid="batch-rule-input"
                />
              </>
            )}
            {ruleKind === 'pct_move' && (
              <>
                <label htmlFor="ws-batch-pct">Move (%)</label>
                <input
                  id="ws-batch-pct"
                  type="number"
                  step="0.5"
                  value={pct}
                  onChange={(e) => setPct(e.target.value)}
                  data-testid="batch-rule-input"
                />
                <label
                  htmlFor="ws-batch-floor-cap"
                  style={{
                    marginTop: 6,
                    fontSize: 11,
                    display: 'flex',
                    gap: 6,
                    alignItems: 'center',
                    textTransform: 'none',
                    letterSpacing: 0,
                    color: 'var(--ink-2)',
                  }}
                >
                  <input
                    id="ws-batch-floor-cap"
                    type="checkbox"
                    checked={floorCap}
                    onChange={(e) => setFloorCap(e.target.checked)}
                  />
                  Cap at WTP p90
                </label>
              </>
            )}
            {ruleKind === 'match_competitor' && (
              <>
                <label htmlFor="ws-batch-undershoot">Undershoot (%)</label>
                <input
                  id="ws-batch-undershoot"
                  type="number"
                  step="0.5"
                  value={undershootPct}
                  onChange={(e) => setUndershootPct(e.target.value)}
                  data-testid="batch-rule-input"
                />
              </>
            )}
            {ruleKind === 'target_db2' && (
              <>
                <label htmlFor="ws-batch-target-pp">Target DB2 (pp)</label>
                <input
                  id="ws-batch-target-pp"
                  type="number"
                  step="0.5"
                  value={targetPp}
                  onChange={(e) => setTargetPp(e.target.value)}
                  data-testid="batch-rule-input"
                />
              </>
            )}
            {ruleKind === 'custom_jsonlogic' && (
              <>
                <label htmlFor="ws-batch-jsonlogic">Expression (JSON-logic)</label>
                <input
                  id="ws-batch-jsonlogic"
                  type="text"
                  value={jsonLogic}
                  onChange={(e) => setJsonLogic(e.target.value)}
                  spellCheck={false}
                  data-testid="batch-rule-input"
                />
              </>
            )}
          </div>

          <div className="ws-batch-field">
            <label>&nbsp;</label>
            <button
              type="button"
              className="ws-batch-preview-btn"
              onClick={onPreview}
              disabled={
                !ruleValid || aids.length < 2 || createBatch.isPending
              }
              data-testid="batch-preview-button"
            >
              {createBatch.isPending ? 'Previewing…' : 'Preview batch'}
            </button>
          </div>
        </div>
        <p className="ws-batch-rule-hint">{RULE_HINTS[ruleKind]}</p>
      </section>

      {/* ── (b) KPI strip ─────────────────────────────────────────────── */}
      {batch && (
        <section
          className="ws-batch-kpis"
          data-testid="batch-kpi-strip"
        >
          <div className="ws-batch-kpi">
            <span className="ws-batch-kpi-label">SKUs in batch</span>
            <span className="ws-batch-kpi-value">{kpi?.count ?? items.length}</span>
            <span className="ws-batch-kpi-sub">
              {lockedSet.size} locked · {committableCount} committable
            </span>
          </div>
          <div className="ws-batch-kpi">
            <span className="ws-batch-kpi-label">Revenue impact</span>
            <span
              className={`ws-batch-kpi-value ${
                parseDecimal(kpi?.total_revenue_impact ?? '0') >= 0 ? 'pos' : 'neg'
              }`}
            >
              {fmtEuroSigned(kpi?.total_revenue_impact)}
            </span>
            <span className="ws-batch-kpi-sub">12mo, list × deltas</span>
          </div>
          <div className="ws-batch-kpi">
            <span className="ws-batch-kpi-label">Margin impact</span>
            <span
              className={`ws-batch-kpi-value ${
                parseDecimal(kpi?.total_margin_impact ?? '0') >= 0 ? 'pos' : 'neg'
              }`}
            >
              {fmtEuroSigned(kpi?.total_margin_impact)}
            </span>
            <span className="ws-batch-kpi-sub">Sum of projected DB2</span>
          </div>
          <div className="ws-batch-kpi">
            <span className="ws-batch-kpi-label">Avg win-prob</span>
            <span className="ws-batch-kpi-value">
              {fmtPct(kpi?.avg_win_prob_at_new ?? null)}
            </span>
            <span className="ws-batch-kpi-sub">At new prices</span>
          </div>
          <div className="ws-batch-kpi">
            <span className="ws-batch-kpi-label">Approval routing</span>
            <span className="ws-batch-kpi-value" style={{ fontSize: 13 }}>
              {routing
                ? `${routing.auto_approve} auto`
                : '—'}
            </span>
            <div className="ws-batch-routing-chips">
              {routing &&
                Object.entries(routing).map(([role, count]) => {
                  if (count === 0) return null;
                  const cls =
                    role === 'auto_approve'
                      ? 'auto'
                      : role === 'block'
                        ? 'block'
                        : role === 'manuel'
                          ? 'manuel'
                          : role === 'md'
                            ? 'md'
                            : '';
                  const label =
                    role === 'auto_approve'
                      ? 'Auto'
                      : role.charAt(0).toUpperCase() + role.slice(1);
                  return (
                    <span
                      key={role}
                      className={`ws-batch-routing-chip ${cls}`.trim()}
                      data-testid={`batch-routing-chip-${role}`}
                    >
                      {label} · {count}
                    </span>
                  );
                })}
            </div>
          </div>
        </section>
      )}

      {/* ── (c) Preview table ─────────────────────────────────────────── */}
      <section className="ws-batch-card" data-testid="batch-preview-table-card">
        <div className="ws-batch-card-head">
          <div>
            <h3 className="ws-batch-card-title">Preview</h3>
            <div className="ws-batch-card-sub">
              Click a row to inspect that SKU's lineage. Lock rows to exclude
              them from commit.
            </div>
          </div>
        </div>
        <div className="ws-batch-table-wrap">
          <table
            className="ws-batch-table"
            data-testid="batch-preview-table"
          >
            <thead>
              <tr>
                <th>AID</th>
                <th>Cluster</th>
                <th>Current</th>
                <th>After</th>
                <th>Δ%</th>
                <th>Projected DB2</th>
                <th>Win-prob</th>
                <th>Risk</th>
                <th>Lock</th>
              </tr>
            </thead>
            <tbody>
              {items.length === 0 && (
                <tr>
                  <td className="ws-batch-empty" colSpan={9}>
                    {createBatch.isPending
                      ? 'Building preview…'
                      : 'Press "Preview batch" to compute the per-SKU moves.'}
                  </td>
                </tr>
              )}
              {items.map((item: BatchItem) => {
                const locked = lockedSet.has(item.aid);
                const stale = staleAids.has(item.aid);
                const delta = deltaPctNumeric(item.before_price, item.after_price);
                const tone = riskTone(item.preview.risk_score);
                return (
                  <tr
                    key={item.id}
                    className={`${locked ? 'locked' : ''} ${stale ? 'stale' : ''}`.trim()}
                    data-testid={`batch-row-${item.aid}`}
                    onClick={() =>
                      onOpenLineageForAid?.(item.aid, item.per_sku_lineage_ref)
                    }
                  >
                    <td>
                      {stale && (
                        <span
                          className="ws-batch-stale-dot"
                          title="Cost moved; preview may be outdated"
                          data-testid={`batch-stale-${item.aid}`}
                        />
                      )}
                      {item.aid}
                    </td>
                    <td style={{ color: 'var(--ink-3)' }}>—</td>
                    <td>{fmtEuro(item.before_price)}</td>
                    <td>{fmtEuro(item.after_price)}</td>
                    <td
                      className={`ws-batch-delta ${
                        Number.isFinite(delta) && delta >= 0 ? 'pos' : 'neg'
                      }`}
                    >
                      {fmtDeltaPct(item.before_price, item.after_price)}
                    </td>
                    <td>{fmtEuro(item.preview.projected_db2)}</td>
                    <td>{fmtPct(item.preview.win_prob_at_new)}</td>
                    <td>
                      <span className={`ws-batch-risk ${tone}`}>
                        {riskLabel(item.preview.risk_score)}
                      </span>
                    </td>
                    <td>
                      <button
                        type="button"
                        className={`ws-batch-lock-toggle${locked ? ' locked' : ''}`}
                        onClick={(e) => {
                          e.stopPropagation();
                          onToggleLock(item.aid);
                        }}
                        data-testid={`batch-lock-${item.aid}`}
                        aria-pressed={locked}
                      >
                        {locked ? 'Locked' : 'Lock'}
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        {batch && (
          <div className="ws-batch-commit-bar">
            <div style={{ fontSize: 11.5, color: 'var(--muted)' }}>
              {committableCount} SKUs will commit · {lockedSet.size} locked excluded
            </div>
            <div style={{ display: 'flex', gap: 8 }}>
              <button
                type="button"
                className="ws-batch-cancel-btn"
                onClick={onCancelClick}
                data-testid="batch-cancel-button"
              >
                Cancel batch
              </button>
              <button
                type="button"
                className="ws-batch-commit-btn"
                onClick={onCommitClick}
                disabled={committableCount === 0 || batch.status !== 'preview'}
                data-testid="batch-commit-button"
              >
                Commit batch
              </button>
            </div>
          </div>
        )}
      </section>
    </div>
  );
}
