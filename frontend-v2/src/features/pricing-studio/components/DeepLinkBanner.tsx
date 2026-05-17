import { useNavigate, useSearchParams } from 'react-router-dom';
import { ArrowLeft, X } from 'lucide-react';
import { useRecommendation } from '@/data/api/useRecommendation';

const STATUS_LABEL: Record<string, string> = {
  open: 'Open',
  accepted_as_proposal: 'Accepted — proposal pending',
  partial_proposed: 'Partial proposal',
  rejected: 'Rejected',
  snoozed: 'Snoozed',
  queued_for_renewal: 'Queued for renewal',
  in_ab_test: 'In A/B test',
  implemented: 'Implemented',
  cancelled: 'Cancelled',
};

const KIND_LABEL: Record<string, string> = {
  margin_erosion: 'Margin erosion',
  cost_riser: 'Cost riser',
  churn: 'Churn risk',
};

interface Props {
  /** SKU we're showing the workbench for. */
  effectiveAid: string;
  /** Whether the requested SKU was found in the studio dataset. */
  skuFound: boolean;
}

/**
 * Phase 2 deep-link surface. Renders a contextual banner above the
 * workbench so the user knows _why_ they landed on this SKU. Reads
 * the same URL params the Action Center action intents emit:
 *
 *   ?aid=…             selected article (handled by parent)
 *   ?recommendation=…  recommendation source_ref to fetch + display
 *   ?abTest=…          A/B test id to highlight (Phase 4-onwards)
 *   ?queue=…           queue context (e.g. "repricing")
 *   ?source=…          breadcrumb for the back button
 */
export function DeepLinkBanner({ effectiveAid, skuFound }: Props) {
  const [params, setParams] = useSearchParams();
  const navigate = useNavigate();
  const recommendationRef = params.get('recommendation');
  const abTest = params.get('abTest');
  const queue = params.get('queue');
  const source = params.get('source');

  const { data: recData, isLoading: recLoading } = useRecommendation(recommendationRef);

  // SKU-not-found state — explicit message, do NOT navigate away.
  if (!skuFound && params.get('aid')) {
    return (
      <div className="mb-3 rounded-[12px] border border-[var(--amber)] bg-[color-mix(in_oklab,var(--amber)_8%,white)] p-3 text-[12.5px] text-[var(--ink)]">
        <div className="flex items-start justify-between gap-3">
          <div>
            <strong className="font-semibold">SKU not found in Studio: {params.get('aid')}</strong>
            <div className="mt-0.5 text-[var(--muted)]">
              The article from {source ?? 'the source page'} isn't loaded into Pricing Studio yet.
              You can keep working with the default workbench or pick another SKU above.
            </div>
          </div>
          <BackButton source={source} navigate={navigate} />
        </div>
      </div>
    );
  }

  if (!recommendationRef && !abTest && !queue) return null;

  return (
    <div className="mb-3 rounded-[12px] border border-[var(--border)] bg-[var(--surface-soft)] p-3 text-[12.5px] text-[var(--ink)]">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="text-[10.5px] font-semibold uppercase tracking-wide text-[var(--muted)]">
            {breadcrumbLabel(source, queue, abTest, recommendationRef)}
          </div>
          <div className="mt-1 truncate font-display text-[14px] font-bold tracking-tight">
            {recLoading ? 'Loading recommendation context…' :
             recData?.recommendation?.title ??
             (abTest ? `A/B test ${abTest} · ${effectiveAid}` :
              queue ? `${queueTitle(queue)} · ${effectiveAid}` :
              `Recommendation · ${effectiveAid}`)}
          </div>
          <div className="mt-1 flex flex-wrap gap-x-3 gap-y-1 text-[11.5px] text-[var(--muted)]">
            {recData?.recommendation?.source_kind && (
              <span>{KIND_LABEL[recData.recommendation.source_kind] ?? recData.recommendation.source_kind}</span>
            )}
            {recData?.recommendation?.cluster && <span>cluster {recData.recommendation.cluster}</span>}
            {recData?.recommendation?.status && (
              <span className="font-semibold text-[var(--ink-2)]">
                Status: {STATUS_LABEL[recData.recommendation.status] ?? recData.recommendation.status}
              </span>
            )}
            {recData?.latest_proposal?.status && (
              <span>Latest proposal: {recData.latest_proposal.status}</span>
            )}
            {abTest && <span>A/B {abTest}</span>}
            {queue && !recommendationRef && <span>Queue: {queueTitle(queue)}</span>}
          </div>
        </div>
        <div className="flex items-center gap-1">
          <BackButton source={source} navigate={navigate} />
          <button
            type="button"
            aria-label="Dismiss banner"
            onClick={() => {
              const next = new URLSearchParams(params);
              ['recommendation', 'abTest', 'queue', 'source'].forEach((k) => next.delete(k));
              setParams(next, { replace: true });
            }}
            className="grid h-7 w-7 place-items-center rounded-md text-[var(--muted)] hover:bg-[var(--surface-sunken)] hover:text-[var(--ink-2)]"
          >
            <X size={14} />
          </button>
        </div>
      </div>
    </div>
  );
}

function breadcrumbLabel(
  source: string | null,
  queue: string | null,
  abTest: string | null,
  rec: string | null,
): string {
  // Pricing Studio v3 / Phase 1 — explicit deep-link sources surface a
  // recognisable breadcrumb so Frank knows where he came from.
  if (source === 'action-center' && rec) return 'From Action Center recommendation';
  if (source === 'forecasting' && queue === 'next-move')
    return 'From Forecasting next-move strip';
  if (source === 'margin') return 'From Margin Cockpit leak watcher';
  if (source) return `From ${prettyScreen(source)}`;
  if (queue) return `Queue: ${queueTitle(queue)}`;
  if (abTest) return 'A/B test detail';
  if (rec) return 'Recommendation context';
  return 'Pricing Studio';
}

function prettyScreen(source: string): string {
  switch (source) {
    case 'action-center':
      return 'Action Center';
    case 'margin':
      return 'Margin Cockpit';
    case 'forecasting':
      return 'Forecasting';
    case 'quotes':
      return 'Quotes & Guardrails';
    default:
      return source.replace(/-/g, ' ');
  }
}

function queueTitle(queue: string): string {
  switch (queue) {
    case 'repricing':
      return 'Repricing queue';
    case 'renewals':
      return 'Renewal queue';
    case 'next-move':
      return 'Next-move strip';
    default:
      return queue.replace(/[-_]/g, ' ');
  }
}

function BackButton({
  source,
  navigate,
}: {
  source: string | null;
  navigate: ReturnType<typeof useNavigate>;
}) {
  if (!source) return null;
  const target = source === 'action-center' ? '/action-center' : `/${source}`;
  return (
    <button
      type="button"
      onClick={() => navigate(target)}
      className="inline-flex items-center gap-1.5 rounded-md border border-[var(--hairline)] bg-white px-2.5 py-1 text-[11.5px] font-semibold text-[var(--ink-2)] hover:bg-[var(--surface-soft)]"
    >
      <ArrowLeft size={12} />
      Back to {prettyScreen(source)}
    </button>
  );
}
