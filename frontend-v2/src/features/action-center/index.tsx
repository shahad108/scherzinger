import { useState } from 'react';
import { useActionCenter } from '@/data/api/useActionCenter';
import { PageHead } from './components/PageHead';
import { MovableHero } from './components/MovableHero';
import { BucketGrid } from './components/BucketGrid';
import { DecisionCards } from './components/DecisionCards';
import { TrustStrip } from './components/TrustStrip';
import { TrustDrawer } from './components/TrustDrawer';
import { CoverageBadge } from './components/CoverageBadge';
import { DataFreshnessStrip } from './components/DataFreshnessStrip';
import { LostQuoteCard } from './components/LostQuoteCard';
import { SkuTable } from './components/SkuTable';
import { LongTailCoverage } from './components/LongTailCoverage';
import { NegotiationCockpit } from './components/NegotiationCockpit';
import { AbTestList } from './components/AbTestList';
import { RejectionList } from './components/RejectionList';
import { AuditTrail } from './components/AuditTrail';
import { ReportCard } from './components/ReportCard';
import { ActionCenterSkeleton } from './components/ActionCenterSkeleton';
import { DegradedBlock } from './components/DegradedBlock';
import { TodaySummaryStrip } from './components/TodaySummaryStrip';
import { useUiAction } from '@/hooks/useUiAction';
import type { ActionIntent } from '@/types/uiActions';
import { useAuthStore } from '@/stores/authStore';
import type { TrustTile } from '@/types';

// Phase 1 — backend composers attach typed action intents to every block.
// These local fallbacks only fire when the payload is missing an intent
// (defensive — should never happen in production).
const FALLBACK_MOVABLE_HERO: ActionIntent = {
  route: '/pricing',
  query: { queue: 'repricing', source: 'action-center' },
  toast: 'Opening the repricing queue in Pricing Studio.',
};

const PERSONA_LABEL: Record<string, string> = {
  frank: 'Pricing Analyst',
  till: 'Managing Director',
  heiko: 'Sales Lead',
};

function firstNameOf(name: string | undefined): string | null {
  const first = name?.trim().split(/\s+/)[0];
  return first || null;
}

function resolveGreeting(greeting: string, firstName: string | null): string {
  if (!firstName) return greeting;
  if (/^good\s/i.test(greeting)) {
    return greeting.replace(/,\s*[^,.!]+([.!]?)/i, `, ${firstName}$1`);
  }
  return greeting;
}

export function ActionCenterPage() {
  const [hideLocked, setHideLocked] = useState(false);
  const [showAll, setShowAll] = useState(false);
  const [trustTile, setTrustTile] = useState<TrustTile | null>(null);
  const runUiAction = useUiAction();
  const user = useAuthStore((s) => s.user);
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

  const traceId = data.meta?.traceId;
  const blocks = data.meta?.blocks;
  const firstName = firstNameOf(user?.name);
  const personaLabel = PERSONA_LABEL[user?.ui_persona ?? 'frank'] ?? 'Workspace';
  const breadcrumbLabel = `${personaLabel} · ${firstName ?? 'Operator'}`;
  const greeting = resolveGreeting(data.header.greeting, firstName);
  const reportDisabledReason =
    blocks?.audit.status === 'degraded'
      ? blocks.audit.reason ?? 'Report export is unavailable because the audit trail is currently degraded.'
      : undefined;
  const reportReady = Boolean(traceId) && blocks?.audit.status !== 'degraded';

  return (
    <div className="mx-auto max-w-[1400px] px-8 py-6">
      <PageHead
        header={data.header}
        breadcrumbLabel={breadcrumbLabel}
        greeting={greeting}
        hideLocked={hideLocked}
        onToggleHideLocked={setHideLocked}
        showAll={showAll}
        onToggleShowAll={setShowAll}
        onAction={runUiAction}
        reportReady={reportReady}
        exportDisabledReason={reportDisabledReason}
        traceId={traceId}
      />
      <DataFreshnessStrip freshness={data.meta?.dataFreshness} />
      {blocks?.summary?.status === 'degraded' ? (
        <DegradedBlock
          title="Today summary unavailable"
          hint={
            blocks.summary.reason ??
            "Today's summary tiles could not be composed for the current review window."
          }
          traceId={traceId}
        />
      ) : data.summary?.tiles ? (
        <TodaySummaryStrip
          tiles={data.summary.tiles}
          onAction={runUiAction}
          trustHeadline={data.trust?.[0] ?? null}
          onModelTrustTile={(tile) => setTrustTile(tile)}
        />
      ) : null}
      {blocks?.movableHero.status === 'degraded' ? (
        <DegradedBlock
          title="Movable revenue unavailable"
          hint={blocks.movableHero.reason ?? 'Movable revenue could not be calculated for the current review window.'}
          traceId={traceId}
        />
      ) : (
        <>
          {blocks?.movableHero.coverage && (
            <div className="mb-1.5 flex justify-end">
              <CoverageBadge coverage={blocks.movableHero.coverage} />
            </div>
          )}
          <MovableHero
            hero={data.movableHero}
            onAction={() => runUiAction(data.movableHero.action ?? FALLBACK_MOVABLE_HERO)}
          />
        </>
      )}
      {blocks?.buckets.status === 'degraded' ? (
        <DegradedBlock
          title="Bucket overview unavailable"
          hint={blocks.buckets.reason ?? 'Bucket metrics are currently unavailable.'}
          traceId={traceId}
        />
      ) : (
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
      )}
      <div id="sec-decisions" className="scroll-mt-20" aria-hidden />
      {blocks?.decisions.status === 'degraded' ? (
        <DegradedBlock
          title="Today's analyst decisions unavailable"
          hint={blocks.decisions.reason ?? 'Decision ranking is currently unavailable.'}
          traceId={traceId}
        />
      ) : (
        <DecisionCards decisions={data.decisions} onAction={runUiAction} />
      )}
      {blocks?.trust.status === 'degraded' ? (
        <DegradedBlock
          title="Trust indicators unavailable"
          hint={blocks.trust.reason ?? 'Trust indicators could not be calculated for the current review window.'}
          traceId={traceId}
        />
      ) : (
        <>
          {blocks?.trust.coverage && (
            <div className="mb-1.5 flex justify-end">
              <CoverageBadge coverage={blocks.trust.coverage} />
            </div>
          )}
          <TrustStrip
            tiles={data.trust}
            onTile={(tile) => setTrustTile(tile)}
          />
        </>
      )}
      <TrustDrawer open={!!trustTile} onClose={() => setTrustTile(null)} focusedTile={trustTile} />
      {blocks?.lostQuote.status === 'degraded' ? (
        <DegradedBlock
          title="Lost-quote analysis unavailable"
          hint={blocks.lostQuote.reason ?? 'Lost-quote analysis is temporarily unavailable.'}
          traceId={traceId}
        />
      ) : (
        <>
          {blocks?.lostQuote.coverage && (
            <div className="mb-1.5 flex justify-end">
              <CoverageBadge coverage={blocks.lostQuote.coverage} />
            </div>
          )}
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
        </>
      )}
      {blocks?.skuTable.status === 'degraded' ? (
        <DegradedBlock
          title="SKU pricing engine unavailable"
          hint={blocks.skuTable.reason ?? 'SKU-level pricing rows are temporarily unavailable.'}
          traceId={traceId}
        />
      ) : (
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
      )}
      {blocks?.longTail.status === 'degraded' ? (
        <DegradedBlock
          title="Long-tail coverage unavailable"
          hint={blocks.longTail.reason ?? 'Long-tail coverage is temporarily unavailable.'}
          traceId={traceId}
        />
      ) : (
        <LongTailCoverage data={data.longTail} />
      )}
      {blocks?.negotiation.status === 'degraded' ? (
        <DegradedBlock
          title="Negotiation cockpit unavailable"
          hint={blocks.negotiation.reason ?? 'Negotiation metrics are temporarily unavailable.'}
          traceId={traceId}
        />
      ) : (
        <NegotiationCockpit data={data.negotiation} />
      )}
      {blocks?.abTests.status === 'degraded' ? (
        <DegradedBlock
          title="A/B test tracker unavailable"
          hint={blocks.abTests.reason ?? 'A/B test state is temporarily unavailable.'}
          traceId={traceId}
        />
      ) : (
        <AbTestList tests={data.abTests} onAction={runUiAction} />
      )}
      {blocks?.rejections.status === 'degraded' ? (
        <DegradedBlock
          title="Rejection analysis unavailable"
          hint={blocks.rejections.reason ?? 'Rejection-code reporting is temporarily unavailable.'}
          traceId={traceId}
        />
      ) : (
        <RejectionList rows={data.rejections} />
      )}
      {blocks?.audit.status === 'degraded' ? (
        <DegradedBlock
          title="Audit trail unavailable"
          hint={blocks.audit.reason ?? 'Audit history is temporarily unavailable.'}
          traceId={traceId}
        />
      ) : (
        <AuditTrail rows={data.audit} />
      )}
      <ReportCard
        onAction={runUiAction}
        enabled={reportReady}
        disabledReason={reportDisabledReason}
        traceId={traceId}
      />
    </div>
  );
}

export default ActionCenterPage;
