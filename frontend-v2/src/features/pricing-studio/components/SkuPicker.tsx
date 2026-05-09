import { useMemo, useState } from 'react';
import type { FilterDef, SkuFlag, SkuListEntry, ToggleDef } from '@/types/studio';

interface Props {
  skus: SkuListEntry[];
  filters: FilterDef[];
  toggles: ToggleDef[];
  selectedAid: string;
  onSelect: (aid: string) => void;
}

export function SkuPicker({ skus, filters, toggles, selectedAid, onSelect }: Props) {
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

  return (
    <aside className="ws-picker">
      <div className="ws-picker-head">
        SKUs flagged for repricing <span className="ws-count">{visible.length}</span>
      </div>
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
            onClick={() => setToggleState((prev) => ({ ...prev, [t.id]: !prev[t.id] }))}
            title={t.id === 'hide-locked' ? 'Hide contract-locked SKUs (relevance filter — Frank)' : 'Surface SKUs without history — comparable-cluster pricing'}
          >
            {t.label}
          </button>
        ))}
      </div>
      <div className="ws-list">
        {visible.map((s) => (
          <button
            key={s.aid}
            type="button"
            className={`ws-row${s.aid === selectedAid ? ' active' : ''}`}
            onClick={() => onSelect(s.aid)}
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
        ))}
      </div>
    </aside>
  );
}
