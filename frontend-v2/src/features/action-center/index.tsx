import { useState } from 'react';
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
import { ActionCenterSkeleton } from './components/ActionCenterSkeleton';
import { useUiAction } from '@/hooks/useUiAction';
import type { ActionIntent } from '@/types/uiActions';

// Phase 1 — backend composers attach typed action intents to every block.
// These local fallbacks only fire when the payload is missing an intent
// (defensive — should never happen in production).
const FALLBACK_MOVABLE_HERO: ActionIntent = {
  route: '/pricing',
  query: { queue: 'repricing', source: 'action-center' },
  toast: 'Opening the repricing queue in Pricing Studio.',
};

export function ActionCenterPage() {
  const [hideLocked, setHideLocked] = useState(false);
  const [showAll, setShowAll] = useState(false);
  const runUiAction = useUiAction();
  // Page-level "Show all" toggle bumps ?limit= so every list block (decisions,
  // SKU table, rejections) widens together. The composer applies per-block
  // floors (decisions ≥ 3, sku_table ≥ 50) so collapsing back to default
  // never truncates below the canonical view.
  const limit = showAll ? 200 : 5;
  const { data, isLoading, error } = useActionCenter({ hide_locked: hideLocked, limit });

  if (error) {
    return (
      <div className="mx-auto max-w-[1400px] p-8 text-sm text-[var(--red)]">
        Fehler: {(error as Error)?.message ?? 'unbekannt'}
      </div>
    );
  }
  if (isLoading || !data) {
    return <ActionCenterSkeleton />;
  }

  return (
    <div className="mx-auto max-w-[1400px] px-8 py-6">
      <PageHead
        header={data.header}
        hideLocked={hideLocked}
        onToggleHideLocked={setHideLocked}
        showAll={showAll}
        onToggleShowAll={setShowAll}
        onAction={runUiAction}
      />
      <MovableHero
        hero={data.movableHero}
        onAction={() => runUiAction(data.movableHero.action ?? FALLBACK_MOVABLE_HERO)}
      />
      <BucketGrid
        buckets={data.buckets}
        onAction={(bucket) => {
          if (bucket.action) {
            runUiAction(bucket.action);
            return;
          }
          runUiAction({
            route: '/pricing',
            query: { filter: bucket.id, source: 'action-center' },
            toast: `Opening ${bucket.title.toLowerCase()} in Pricing Studio.`,
          });
        }}
      />
      <DecisionCards decisions={data.decisions} onAction={runUiAction} />
      <TrustStrip
        tiles={data.trust}
        onTile={(tile) => runUiAction(tile.action ?? { toast: `${tile.label}: ${tile.value}`, toastSeverity: 'info' })}
      />
      <LostQuoteCard
        data={data.lostQuote}
        onOpen={() =>
          runUiAction(
            data.lostQuote.action ?? {
              route: '/margin',
              query: { focus: 'lost_quote', source: 'action-center' },
              toast: 'Opening lost-quote margin analysis.',
            },
          )
        }
      />
      <SkuTable
        rows={data.skuTable}
        onAction={(row) => {
          if (row.action) {
            runUiAction(row.action);
            return;
          }
          runUiAction({
            route: '/pricing',
            query: { aid: row.article, source: 'action-center' },
            toast: `Opening ${row.article} in Pricing Studio.`,
          });
        }}
      />
      <LongTailCoverage data={data.longTail} />
      <NegotiationCockpit data={data.negotiation} />
      <AbTestList tests={data.abTests} onAction={runUiAction} />
      <RejectionList rows={data.rejections} />
      <AuditTrail rows={data.audit} />
      <ReportCard onAction={runUiAction} />
    </div>
  );
}

export default ActionCenterPage;
