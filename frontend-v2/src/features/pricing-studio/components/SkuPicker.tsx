import { useMemo, useState } from 'react';
import type { FilterDef, SkuFlag, SkuListEntry, ToggleDef } from '@/types/studio';

export type SkuPickerMode = 'single' | 'batch';

interface Props {
  skus: SkuListEntry[];
  filters: FilterDef[];
  toggles: ToggleDef[];
  selectedAid: string;
  onSelect: (aid: string) => void;
  // Phase 6 — Batch repricing. The toggle lives in the picker so users
  // can switch modes without leaving the SKU rail. When ``mode === 'batch'``
  // each row exposes a checkbox; ``selectedAids`` is the authoritative list
  // of AIDs in the working set. "Build batch" emits onBuildBatch with that
  // list when the user confirms (≥2 AIDs).
  mode?: SkuPickerMode;
  onModeChange?: (mode: SkuPickerMode) => void;
  selectedAids?: string[];
  onToggleAid?: (aid: string) => void;
  onBuildBatch?: (aids: string[]) => void;
}

export function SkuPicker({
  skus,
  filters,
  toggles,
  selectedAid,
  onSelect,
  mode = 'single',
  onModeChange,
  selectedAids = [],
  onToggleAid,
  onBuildBatch,
}: Props) {
  const [activeFilter, setActiveFilter] = useState<SkuFlag>('all');
  const initialToggleState = useMemo(() => {
    const out: Record<string, boolean> = {};
    for (const t of toggles) out[t.id] = t.defaultActive;
    return out;
  }, [toggles]);
  const [toggleState, setToggleState] = useState<Record<string, boolean>>(initialToggleState);

  const visible = useMemo(() => {
    const hideLocked = toggleState['hide-locked'];
    const showNew = toggleState['new-skus'];
    return skus.filter((s) => {
      if (s.isNew && !showNew) return false;
      if (hideLocked && s.locked) return false;
      if (activeFilter !== 'all' && s.flag !== activeFilter) return false;
      return true;
    });
  }, [skus, activeFilter, toggleState]);

  const batchMode = mode === 'batch';
  const selectedSet = useMemo(() => new Set(selectedAids), [selectedAids]);
  const canBuild = batchMode && selectedAids.length >= 2;

  return (
    <aside className="ws-picker">
      <div className="ws-picker-head">
        SKUs flagged for repricing <span className="ws-count">{visible.length}</span>
      </div>

      {/* Phase 6 — Single/Batch mode toggle. Sits above the filters so the
          two interaction modes are visible at a glance; switching to Batch
          surfaces the bulk-select affordances. */}
      <div
        className="ws-mode-toggle"
        role="tablist"
        aria-label="SKU picker mode"
        data-testid="sku-picker-mode-toggle"
      >
        <button
          type="button"
          role="tab"
          aria-selected={!batchMode}
          className={`ws-mode-toggle-btn${!batchMode ? ' active' : ''}`}
          onClick={() => onModeChange?.('single')}
          data-testid="sku-picker-mode-single"
        >
          Single
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={batchMode}
          className={`ws-mode-toggle-btn${batchMode ? ' active' : ''}`}
          onClick={() => onModeChange?.('batch')}
          data-testid="sku-picker-mode-batch"
        >
          Batch
        </button>
      </div>

      {batchMode && (
        <div
          className="ws-batch-summary"
          data-testid="sku-picker-batch-summary"
        >
          <span className="ws-batch-summary-pill">
            Selected: <b>{selectedAids.length}</b>{' '}
            {selectedAids.length === 1 ? 'SKU' : 'SKUs'}
          </span>
          {selectedAids.length > 0 && (
            <span className="ws-batch-summary-hint">
              Pick ≥2 to enable Build batch
            </span>
          )}
        </div>
      )}

      <div className="ws-filters">
        {filters.map((f) => (
          <button
            key={f.id}
            type="button"
            className={`ws-filter${activeFilter === f.id ? ' active' : ''}`}
            onClick={() => setActiveFilter(f.id)}
          >
            {f.label}
          </button>
        ))}
        {toggles.map((t) => (
          <button
            key={t.id}
            type="button"
            className={`ws-filter toggle${toggleState[t.id] ? ' active' : ''}`}
            onClick={() =>
              setToggleState((prev) => ({ ...prev, [t.id]: !prev[t.id] }))
            }
            title={
              t.id === 'hide-locked'
                ? 'Hide contract-locked SKUs (relevance filter — Frank)'
                : 'Surface SKUs without history — comparable-cluster pricing'
            }
          >
            {t.label}
          </button>
        ))}
      </div>
      <div className="ws-list">
        {visible.map((s) => {
          const checked = selectedSet.has(s.aid);
          return (
            <div
              key={s.aid}
              className={`ws-row${
                !batchMode && s.aid === selectedAid ? ' active' : ''
              }${batchMode && checked ? ' batch-checked' : ''}`}
            >
              {batchMode && (
                <label
                  className="ws-batch-checkbox"
                  data-testid={`sku-picker-checkbox-${s.aid}`}
                  // Stop the parent row click from also firing.
                  onClick={(e) => e.stopPropagation()}
                >
                  <input
                    type="checkbox"
                    checked={checked}
                    onChange={() => onToggleAid?.(s.aid)}
                    aria-label={`Include ${s.aid} in batch`}
                  />
                </label>
              )}
              <button
                type="button"
                className="ws-row-body"
                onClick={() => {
                  if (batchMode) onToggleAid?.(s.aid);
                  else onSelect(s.aid);
                }}
              >
                <span className="ws-aid">{s.aid}</span>
                <span className={`ws-marg ${s.marginTone}`}>{s.margin}</span>
                <span className="ws-desc">
                  {s.productLine} · {s.meta}
                  <span className={`ws-clu ${s.clusterTone}`}>{s.clusterChip}</span>
                  {s.locked && <span className="ws-locked">🔒 Locked</span>}
                </span>
                <span className={`ws-tag ${s.tagTone}`}>{s.tag}</span>
              </button>
            </div>
          );
        })}
      </div>

      {batchMode && (
        <div className="ws-batch-footer">
          <button
            type="button"
            className="ws-batch-build-btn"
            disabled={!canBuild}
            onClick={() => onBuildBatch?.(selectedAids)}
            data-testid="sku-picker-build-batch"
            aria-disabled={!canBuild}
          >
            Build batch
            {selectedAids.length > 0 && (
              <span className="ws-batch-build-count">{selectedAids.length}</span>
            )}
          </button>
        </div>
      )}
    </aside>
  );
}
