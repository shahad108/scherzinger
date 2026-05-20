import type { MarginTabs as MarginTabsType } from '@/types';
import { CrossCustomerPane } from './panes/CrossCustomerPane';
import { SkuLeakagePane } from './panes/SkuLeakagePane';
import { SegmentPane } from './panes/SegmentPane';
import { ErosionPane } from './panes/ErosionPane';
import { CustomerTrendPane } from './panes/CustomerTrendPane';

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

export function MarginTabs({ tabs, activeTab, onTabChange, activeSegTab, onSegTabChange }: Props) {
  return (
    <div id="marginTabsBlock" className="mb-4 rounded-[14px] border border-[var(--border)] bg-white p-[18px_20px] shadow-[var(--shadow-card)]">
      <div role="tablist" className="mb-3.5 inline-flex flex-wrap gap-0.5 rounded-[10px] bg-[var(--surface-sunken)] p-[3px]">
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
              className={`flex items-center gap-1.5 rounded-[8px] px-3 py-[7px] text-[12.5px] transition-all ${
                active
                  ? 'bg-white font-semibold text-[var(--ink)] shadow-[var(--shadow-card)]'
                  : 'font-medium text-[var(--ink-3)] hover:text-[var(--ink-2)]'
              }`}
            >
              <span>{d.label}</span>
              {d.badge && (
                <span className="rounded-[5px] px-1.5 py-[1px] text-[10px] font-bold" style={{ background: 'var(--violet-bg)', color: 'var(--violet)' }}>
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
        <div role="tabpanel" id="tabpanel-seg" aria-labelledby="tab-seg">
          <SegmentPane pane={tabs.seg} activeSegTab={activeSegTab} onSegTabChange={onSegTabChange} />
        </div>
      )}
      {activeTab === 'erode' && (
        <div role="tabpanel" id="tabpanel-erode" aria-labelledby="tab-erode">
          <ErosionPane pane={tabs.erode} />
        </div>
      )}
      {activeTab === 'cust' && (
        <div role="tabpanel" id="tabpanel-cust" aria-labelledby="tab-cust">
          <CustomerTrendPane pane={tabs.cust} />
        </div>
      )}
    </div>
  );
}
