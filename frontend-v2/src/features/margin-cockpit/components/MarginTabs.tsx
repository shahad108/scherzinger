import type { MarginTabs as MarginTabsType } from '@/types';
import { CrossCustomerPane } from './panes/CrossCustomerPane';
import { SkuLeakagePane } from './panes/SkuLeakagePane';
// SegmentPane, ErosionPane, CustomerTrendPane added in Tasks 6 + 7

interface Props {
  tabs: MarginTabsType;
  activeTab: string;
  onTabChange: (tab: string) => void;
  activeSegTab: string;
  onSegTabChange: (seg: string) => void;
}

const TAB_DEFS: { id: keyof MarginTabsType; label: string; badge?: string }[] = [
  { id: 'cross', label: 'Cross-Customer Discrepancy', badge: '★ Proprietary' },
  { id: 'leak',  label: 'SKU Margin Leakage' },
  { id: 'seg',   label: 'Segment pivot' },
  { id: 'erode', label: 'List-price erosion' },
  { id: 'cust',  label: 'Customer trend' },
];

export function MarginTabs({ tabs, activeTab, onTabChange }: Props) {
  return (
    <div id="marginTabsBlock" className="mb-4 rounded-2xl border border-[var(--hairline)] bg-white p-5">
      <div role="tablist" className="mb-4 flex flex-wrap gap-2">
        {TAB_DEFS.map((d) => {
          const active = d.id === activeTab;
          return (
            <button
              key={d.id}
              type="button"
              role="tab"
              aria-selected={active}
              id={`tab-${d.id}`}
              aria-controls={`tabpanel-${d.id}`}
              onClick={() => onTabChange(d.id)}
              className={`flex items-center gap-2 rounded-full px-3 py-1.5 text-[12px] font-semibold transition-colors ${
                active ? 'text-white' : 'border border-[var(--hairline)] bg-white text-[var(--ink-2)]'
              }`}
              style={active ? { background: 'var(--ink)' } : undefined}
            >
              <span>{d.label}</span>
              {d.badge && (
                <span className="rounded-full px-1.5 py-0.5 text-[10px] font-bold" style={{ background: 'var(--violet-bg)', color: 'var(--violet)' }}>
                  {d.badge}
                </span>
              )}
            </button>
          );
        })}
      </div>

      {activeTab === 'cross' && (
        <div role="tabpanel" id="tabpanel-cross" aria-labelledby="tab-cross">
          <CrossCustomerPane pane={tabs.cross} />
        </div>
      )}
      {activeTab === 'leak' && (
        <div role="tabpanel" id="tabpanel-leak" aria-labelledby="tab-leak">
          <SkuLeakagePane pane={tabs.leak} />
        </div>
      )}
      {activeTab === 'seg' && (
        <div role="tabpanel" id="tabpanel-seg" aria-labelledby="tab-seg" className="text-sm text-[var(--muted)]">
          Segment pivot — Task 6
        </div>
      )}
      {activeTab === 'erode' && (
        <div role="tabpanel" id="tabpanel-erode" aria-labelledby="tab-erode" className="text-sm text-[var(--muted)]">
          List-price erosion — Task 6
        </div>
      )}
      {activeTab === 'cust' && (
        <div role="tabpanel" id="tabpanel-cust" aria-labelledby="tab-cust" className="text-sm text-[var(--muted)]">
          Customer trend — Task 7
        </div>
      )}
    </div>
  );
}
