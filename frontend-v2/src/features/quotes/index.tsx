import { useEffect, useState } from 'react';
import { useQuotes } from '@/data/api/useQuotes';
import { PageHead } from './components/PageHead';
import { BriefingMemo } from './components/BriefingMemo';
import { PipelineStrip } from './components/PipelineStrip';
import { ChangedStrip } from './components/ChangedStrip';
import { EscalationsSection } from './components/EscalationsSection';
import { FunnelSection } from './components/FunnelSection';
import { GuardrailsSection } from './components/GuardrailsSection';
import { QuoteToInvoiceGapCard } from './components/QuoteToInvoiceGapCard';
import { ActiveQuotesTable } from './components/ActiveQuotesTable';
import { AnalysisSection } from './components/AnalysisSection';
import { CrossLinks } from './components/CrossLinks';
import { QuotesSkeleton } from './components/QuotesSkeleton';

export default function QuotesPage() {
  const { data, isLoading, error } = useQuotes();
  const [briefingOpen, setBriefingOpen] = useState(false);
  // Default tab is 'sku' for Frank — the 'rep' tab moved to Heiko's view.
  const [analysisTab, setAnalysisTab] = useState<'rep' | 'sku' | 'cust'>('sku');

  useEffect(() => {
    document.body.classList.add('pz-fullbleed');
    return () => {
      document.body.classList.remove('pz-fullbleed');
    };
  }, []);

  const scrollToEscalation = (rank: number) => {
    document.getElementById(`esc-card-${rank}`)?.scrollIntoView({ behavior: 'smooth', block: 'center' });
  };

  if (isLoading) {
    return <QuotesSkeleton />;
  }
  if (error || !data) {
    return (
      <div className="w-full px-6 py-8 text-sm text-[var(--red)]">
        Fehler: {(error as Error)?.message ?? 'unbekannt'}
      </div>
    );
  }

  return (
    <div id="screen-quotes" className="w-full px-6 py-6">
      <PageHead header={data.header} onGenerateBriefing={() => setBriefingOpen((v) => !v)} />
      <BriefingMemo data={data.briefing} open={briefingOpen} onClose={() => setBriefingOpen(false)} />
      <PipelineStrip counters={data.pipeline} />
      <ChangedStrip data={data.changed} />
      <EscalationsSection
        data={data.escalations}
        onJumpByRep={() => {
          // Per-rep view moved to Heiko (deferred). Land Frank on the SKU
          // breakdown which carries the same pattern signal.
          setAnalysisTab('sku');
          document.getElementById('quote-analysis-block')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
        }}
      />
      <FunnelSection data={data.funnel} />
      <QuoteToInvoiceGapCard data={data.gap} />
      <GuardrailsSection data={data.guardrails} />
      <ActiveQuotesTable data={data.active} onJumpToEscalation={scrollToEscalation} />
      <AnalysisSection data={data.analysis} active={analysisTab} onTabChange={setAnalysisTab} />
      <CrossLinks links={data.crossLinks} />
    </div>
  );
}
