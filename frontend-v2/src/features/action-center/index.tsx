import { useActionCenter } from '@/data/api/useActionCenter';
import { PageHead } from './components/PageHead';
import { MovableHero } from './components/MovableHero';
import { BucketGrid } from './components/BucketGrid';
import { DecisionCards } from './components/DecisionCards';
import { TrustStrip } from './components/TrustStrip';
import { LostQuoteCard } from './components/LostQuoteCard';
import { SkuTable } from './components/SkuTable';
import { LongTailCoverage } from './components/LongTailCoverage';
import { NegotiationCockpit } from './components/NegotiationCockpit';
import { AbTestList } from './components/AbTestList';
import { RejectionList } from './components/RejectionList';
import { AuditTrail } from './components/AuditTrail';
import { ReportCard } from './components/ReportCard';

export function ActionCenterPage() {
  const { data, isLoading, error } = useActionCenter();

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
      <PageHead header={data.header} />
      <MovableHero hero={data.movableHero} />
      <BucketGrid buckets={data.buckets} />
      <DecisionCards decisions={data.decisions} />
      <TrustStrip tiles={data.trust} />
      <LostQuoteCard data={data.lostQuote} />
      <SkuTable rows={data.skuTable} />
      <LongTailCoverage data={data.longTail} />
      <NegotiationCockpit data={data.negotiation} />
      <AbTestList tests={data.abTests} />
      <RejectionList rows={data.rejections} />
      <AuditTrail rows={data.audit} />
      <ReportCard />
    </div>
  );
}

export default ActionCenterPage;
