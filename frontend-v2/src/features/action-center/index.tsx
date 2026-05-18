import { useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useActionCenter } from '@/data/api/useActionCenter';
import { PageHead } from './components/PageHead';
import { MovableHero } from './components/MovableHero';
import { BucketFilterRow } from './components/BucketFilterRow';
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
import { LockedBlock } from './components/LockedBlock';
import { TodaySummaryStrip } from './components/TodaySummaryStrip';
import { useUiAction } from '@/hooks/useUiAction';
import { useAuthStore } from '@/stores/authStore';
import type { TrustTile } from '@/types';

// Task 2 cleanup (docs/ACTION_CENTER_PLAN.md §4): the backend composer
// attaches a typed ``action`` intent to every block that emits a clickable
// element. We do NOT carry frontend fallbacks anymore — a missing intent
// is a backend bug, surfaced in dev via a console warning and a no-op
// click, so we never silently fabricate a route the user thinks is real.
function warnMissingAction(scope: string): void {
  if (import.meta.env.DEV) {
    // eslint-disable-next-line no-console
    console.warn(
      `[action-center] ${scope} click ignored — backend payload is missing a typed action intent.`,
    );
  }
}

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
  // Plan §2.5 — BucketFilterRow chips filter the decision list in-place.
  // Initial filter id is seeded from ?queue= so deep links from Pricing
  // Studio (or any cross-screen jump) land on the right chip.
  const [searchParams] = useSearchParams();
  const [queueFilter, setQueueFilter] = useState<string>(
    searchParams.get('queue') ?? 'all',
  );
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
  // Plan §7 — both ``degraded`` (runtime failure) and ``locked`` (data
  // source not yet connected) prevent a viable report export. The
  // disabled reason copy distinguishes the two.
  const auditStatus = blocks?.audit.status;
  const reportDisabledReason =
    auditStatus === 'degraded'
      ? blocks?.audit.reason ?? 'Report export is unavailable because the audit trail is currently degraded.'
      : auditStatus === 'locked'
        ? blocks?.audit.reason ?? 'Report export is unavailable because the audit trail data source is not yet connected.'
        : undefined;
  const reportReady =
    Boolean(traceId) && auditStatus !== 'degraded' && auditStatus !== 'locked';

  // Plan §2.5 — BucketFilterRow filters the decision list in-place.
  // ``all`` clears the filter; every other id matches the queue field
  // the backend ranker attaches to each decision row. Plain expression
  // (not useMemo) so the hook order stays stable across the early-return
  // paths above.
  const visibleDecisions =
    queueFilter === 'all'
      ? data.decisions
      : data.decisions.filter((d) => d.queue === queueFilter);

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
      {blocks?.summary?.status === 'locked' ? (
        <LockedBlock
          title="Today summary"
          hint={blocks.summary.reason ?? undefined}
          traceId={traceId}
        />
      ) : blocks?.summary?.status === 'degraded' ? (
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
      {blocks?.movableHero.status === 'locked' ? (
        <LockedBlock
          title="Movable revenue"
          hint={blocks.movableHero.reason ?? undefined}
          traceId={traceId}
        />
      ) : blocks?.movableHero.status === 'degraded' ? (
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
            onAction={() => {
              if (data.movableHero.action) {
                runUiAction(data.movableHero.action);
              } else {
                warnMissingAction('movableHero');
              }
            }}
          />
        </>
      )}
      <div id="sec-decisions" className="scroll-mt-20" aria-hidden />
      {blocks?.buckets.status === 'locked' ? (
        <LockedBlock
          title="Action queues"
          hint={blocks.buckets.reason ?? undefined}
          traceId={traceId}
        />
      ) : blocks?.buckets.status === 'degraded' ? (
        <DegradedBlock
          title="Action queues unavailable"
          hint={blocks.buckets.reason ?? 'Action queue filters are currently unavailable.'}
          traceId={traceId}
        />
      ) : (
        <BucketFilterRow
          filters={data.buckets.filters}
          active={queueFilter}
          onChange={setQueueFilter}
          onAction={runUiAction}
        />
      )}
      {blocks?.decisions.status === 'locked' ? (
        <LockedBlock
          title="Today's analyst decisions"
          hint={blocks.decisions.reason ?? undefined}
          traceId={traceId}
        />
      ) : blocks?.decisions.status === 'degraded' ? (
        <DegradedBlock
          title="Today's analyst decisions unavailable"
          hint={blocks.decisions.reason ?? 'Decision ranking is currently unavailable.'}
          traceId={traceId}
        />
      ) : (
        <DecisionCards decisions={visibleDecisions} onAction={runUiAction} />
      )}
      {blocks?.trust.status === 'locked' ? (
        <LockedBlock
          title="Trust indicators"
          hint={blocks.trust.reason ?? undefined}
          traceId={traceId}
        />
      ) : blocks?.trust.status === 'degraded' ? (
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
      {blocks?.lostQuote.status === 'locked' ? (
        <LockedBlock
          title="Lost-quote analysis"
          hint={blocks.lostQuote.reason ?? undefined}
          traceId={traceId}
        />
      ) : blocks?.lostQuote.status === 'degraded' ? (
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
            onOpen={() => {
              if (data.lostQuote.action) {
                runUiAction(data.lostQuote.action);
              } else {
                warnMissingAction('lostQuote');
              }
            }}
          />
        </>
      )}
      {blocks?.skuTable.status === 'locked' ? (
        <LockedBlock
          title="SKU pricing engine"
          hint={blocks.skuTable.reason ?? undefined}
          traceId={traceId}
        />
      ) : blocks?.skuTable.status === 'degraded' ? (
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
            } else {
              warnMissingAction(`skuTable:${row.article}`);
            }
          }}
        />
      )}
      {blocks?.longTail.status === 'locked' ? (
        <LockedBlock
          title="Long-tail coverage"
          hint={blocks.longTail.reason ?? undefined}
          traceId={traceId}
        />
      ) : blocks?.longTail.status === 'degraded' ? (
        <DegradedBlock
          title="Long-tail coverage unavailable"
          hint={blocks.longTail.reason ?? 'Long-tail coverage is temporarily unavailable.'}
          traceId={traceId}
        />
      ) : (
        <LongTailCoverage data={data.longTail} />
      )}
      {blocks?.negotiation.status === 'locked' ? (
        <LockedBlock
          title="Negotiation cockpit"
          hint={blocks.negotiation.reason ?? undefined}
          traceId={traceId}
        />
      ) : blocks?.negotiation.status === 'degraded' ? (
        <DegradedBlock
          title="Negotiation cockpit unavailable"
          hint={blocks.negotiation.reason ?? 'Negotiation metrics are temporarily unavailable.'}
          traceId={traceId}
        />
      ) : (
        <NegotiationCockpit data={data.negotiation} />
      )}
      {blocks?.abTests.status === 'locked' ? (
        <LockedBlock
          title="A/B test tracker"
          hint={blocks.abTests.reason ?? undefined}
          traceId={traceId}
        />
      ) : blocks?.abTests.status === 'degraded' ? (
        <DegradedBlock
          title="A/B test tracker unavailable"
          hint={blocks.abTests.reason ?? 'A/B test state is temporarily unavailable.'}
          traceId={traceId}
        />
      ) : (
        <AbTestList tests={data.abTests} onAction={runUiAction} />
      )}
      {blocks?.rejections.status === 'locked' ? (
        <LockedBlock
          title="Rejection analysis"
          hint={blocks.rejections.reason ?? undefined}
          traceId={traceId}
        />
      ) : blocks?.rejections.status === 'degraded' ? (
        <DegradedBlock
          title="Rejection analysis unavailable"
          hint={blocks.rejections.reason ?? 'Rejection-code reporting is temporarily unavailable.'}
          traceId={traceId}
        />
      ) : (
        <RejectionList rows={data.rejections} />
      )}
      {blocks?.audit.status === 'locked' ? (
        <LockedBlock
          title="Audit trail"
          hint={blocks.audit.reason ?? undefined}
          traceId={traceId}
        />
      ) : blocks?.audit.status === 'degraded' ? (
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
