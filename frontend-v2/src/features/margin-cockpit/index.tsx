import { useState } from 'react';
import { useMarginCockpit } from '@/data/api/useMarginCockpit';
import { MarginPageHead } from './components/MarginPageHead';
import { BriefingMemo } from './components/BriefingMemo';

export function MarginCockpitPage() {
  const { data, isLoading, error } = useMarginCockpit();
  const [briefingOpen, setBriefingOpen] = useState(false);

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

  return (
    <div className="mx-auto max-w-[1400px] px-8 py-6">
      <MarginPageHead
        header={data.header}
        onGenerateBriefing={() => setBriefingOpen((v) => !v)}
      />
      <BriefingMemo data={data.briefing} open={briefingOpen} onClose={() => setBriefingOpen(false)} />
      {/* Sections added in Tasks 2–7 */}
    </div>
  );
}

export default MarginCockpitPage;
