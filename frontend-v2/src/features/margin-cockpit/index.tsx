import { useEffect, useState } from 'react';
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

export function MarginCockpitPage() {
  const { data, isLoading, error } = useMarginCockpit();
  const [briefingOpen, setBriefingOpen] = useState(false);
  const [activeTab, setActiveTab] = useState<string>('cross');
  const [activeSegTab, setActiveSegTab] = useState<string>('family');

  useEffect(() => {
    document.body.classList.add('pz-fullbleed');
    return () => {
      document.body.classList.remove('pz-fullbleed');
    };
  }, []);

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
      <ShiftedStrip title={data.shifted.title} rows={data.shifted.rows} netLine={data.shifted.netLine} onTabJump={handleTabJump} />
      <WaterfallCard data={data.waterfall} onTabJump={handleTabJump} />
      <LostQuoteDifferential data={data.lostQuote} />
      <CostVsPriceCard data={data.costVsPrice} />
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
