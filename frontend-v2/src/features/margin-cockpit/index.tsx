import { useState } from 'react';
import { useMarginCockpit } from '@/data/api/useMarginCockpit';
import { MarginPageHead } from './components/MarginPageHead';
import { BriefingMemo } from './components/BriefingMemo';
import { MarginHealthStrip } from './components/MarginHealthStrip';
import { ClusterMiniRow } from './components/ClusterMiniRow';
import { ShiftedStrip } from './components/ShiftedStrip';

export function MarginCockpitPage() {
  const { data, isLoading, error } = useMarginCockpit();
  const [briefingOpen, setBriefingOpen] = useState(false);
  const [activeTab, setActiveTab] = useState<string>('cross');
  const [activeSegTab, setActiveSegTab] = useState<string>('family');

  if (isLoading) {
    return <div className="mx-auto max-w-[1400px] p-8 text-sm text-[var(--muted)]">Lade…</div>;
  }
  if (error || !data) {
    return (
      <div className="mx-auto max-w-[1400px] p-8 text-sm text-[var(--red)]">
        Fehler: {(error as Error)?.message ?? 'unbekannt'}
      </div>
    );
  }

  const handleTabJump = (tab: string, segTab?: string) => {
    setActiveTab(tab);
    if (segTab) setActiveSegTab(segTab);
    document.getElementById('marginTabsBlock')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  };

  // activeTab/activeSegTab consumed in Task 5 (MarginTabs); referenced here so noUnusedLocals is satisfied.
  void activeTab;
  void activeSegTab;

  return (
    <div className="mx-auto max-w-[1400px] px-8 py-6">
      <MarginPageHead header={data.header} onGenerateBriefing={() => setBriefingOpen((v) => !v)} />
      <BriefingMemo data={data.briefing} open={briefingOpen} onClose={() => setBriefingOpen(false)} />
      <MarginHealthStrip cells={data.health} />
      <ClusterMiniRow clusters={data.clusters} />
      <ShiftedStrip title={data.shifted.title} rows={data.shifted.rows} netLine={data.shifted.netLine} onTabJump={handleTabJump} />
      {/* Tasks 3–7 add: Waterfall, LostQuote, CostVsPrice, Tabs, CrossLinks */}
    </div>
  );
}

export default MarginCockpitPage;
