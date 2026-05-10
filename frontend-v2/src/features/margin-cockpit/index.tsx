import { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useMarginCockpit } from '@/data/api/useMarginCockpit';
import { MarginPageHead } from './components/MarginPageHead';
import { BriefingMemo } from './components/BriefingMemo';
import { MarginHealthStrip } from './components/MarginHealthStrip';
import { ClusterMiniRow } from './components/ClusterMiniRow';
import { ShiftedStrip } from './components/ShiftedStrip';
import { WaterfallCard } from './components/WaterfallCard';
import { LostQuoteDifferential } from './components/LostQuoteDifferential';
import { CostVsPriceCard } from './components/CostVsPriceCard';
import { MarginTabs } from './components/MarginTabs';
import { CrossLinks } from './components/CrossLinks';
import { MarginCockpitSkeleton } from './components/MarginCockpitSkeleton';

// Phase 2 — focus targets the deep-link CTAs are allowed to scroll to.
// Adding a value here means a feature surface attaches the matching DOM
// id (e.g. `block-lost_quote`) and the focus-on-mount effect scrolls
// + briefly highlights it.
const FOCUS_TARGETS = new Set(['lost_quote', 'waterfall', 'cost_vs_price', 'shifted', 'cross']);

export function MarginCockpitPage() {
  const { data, isLoading, error } = useMarginCockpit();
  const [params] = useSearchParams();
  const [briefingOpen, setBriefingOpen] = useState(false);
  const [activeTab, setActiveTab] = useState<string>('cross');
  const [activeSegTab, setActiveSegTab] = useState<string>('family');
  const focus = params.get('focus');

  useEffect(() => {
    document.body.classList.add('pz-fullbleed');
    return () => {
      document.body.classList.remove('pz-fullbleed');
    };
  }, []);

  // Phase 2 deep-link focus. Scroll to the requested block and pulse a
  // ring outline so the user's eye lands on the right card.
  useEffect(() => {
    if (!data || !focus || !FOCUS_TARGETS.has(focus)) return;
    const el = document.getElementById(`block-${focus}`);
    if (!el) return;
    el.scrollIntoView({ behavior: 'smooth', block: 'start' });
    el.dataset.focusPulse = '1';
    const t = window.setTimeout(() => {
      delete el.dataset.focusPulse;
    }, 2200);
    return () => window.clearTimeout(t);
  }, [data, focus]);

  if (isLoading) {
    return <MarginCockpitSkeleton />;
  }
  if (error || !data) {
    return (
      <div className="w-full px-6 py-8 text-sm text-[var(--red)]">
        Fehler: {(error as Error)?.message ?? 'unbekannt'}
      </div>
    );
  }

  const handleTabJump = (tab: string, segTab?: string) => {
    setActiveTab(tab);
    if (segTab) setActiveSegTab(segTab);
    document.getElementById('marginTabsBlock')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  };

  return (
    <div id="screen-margin" className="w-full px-6 py-6">
      <MarginPageHead header={data.header} onGenerateBriefing={() => setBriefingOpen((v) => !v)} />
      <BriefingMemo data={data.briefing} open={briefingOpen} onClose={() => setBriefingOpen(false)} />
      <MarginHealthStrip cells={data.health} />
      <ClusterMiniRow clusters={data.clusters} />
      <div id="block-shifted" data-focus-target="shifted">
        <ShiftedStrip title={data.shifted.title} rows={data.shifted.rows} netLine={data.shifted.netLine} onTabJump={handleTabJump} />
      </div>
      <div id="block-waterfall" data-focus-target="waterfall">
        <WaterfallCard data={data.waterfall} onTabJump={handleTabJump} />
      </div>
      <div id="block-lost_quote" data-focus-target="lost_quote">
        <LostQuoteDifferential data={data.lostQuote} />
      </div>
      <div id="block-cost_vs_price" data-focus-target="cost_vs_price">
        <CostVsPriceCard data={data.costVsPrice} />
      </div>
      <MarginTabs
        tabs={data.tabs}
        activeTab={activeTab}
        onTabChange={setActiveTab}
        activeSegTab={activeSegTab}
        onSegTabChange={setActiveSegTab}
      />
      <CrossLinks links={data.crossLinks} />
    </div>
  );
}

export default MarginCockpitPage;
