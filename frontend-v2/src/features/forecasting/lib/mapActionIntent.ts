// v2.2 Phase B — translate NextMove.actionIntent (emitted by the backend
// composer in `next_moves.py`) into a real ActionIntent the global
// useUiAction()/ActionFeedback drawer host understands.
//
// The backend emits two FormDrawerKind values today: `partial_accept` and
// `queue_renewal`. Anything else falls back to a read-only drawer so Frank
// always sees *some* context, never a silent no-op.

import type {
  ActionDrawerContext,
  ActionIntent,
  FormDrawerKind,
} from '@/types/uiActions';
import type { NextMove } from '@/types/forecast';

const VALID_FORM_KINDS: ReadonlySet<FormDrawerKind> = new Set<FormDrawerKind>([
  'partial_accept',
  'snooze',
  'queue_renewal',
  'ab_setup',
  'ab_hold',
  'ab_promote',
  'decision_detail',
  'trust_explain',
  'add_section',
  'saved_view_save',
  'add_reviewer',
  'share_decision',
]);

function asString(v: unknown): string | undefined {
  return typeof v === 'string' && v.length > 0 ? v : undefined;
}
function asNumber(v: unknown): number | undefined {
  return typeof v === 'number' && Number.isFinite(v) ? v : undefined;
}
function asStringArray(v: unknown): string[] | undefined {
  if (!Array.isArray(v)) return undefined;
  const out = v.filter((x): x is string => typeof x === 'string');
  return out.length ? out : undefined;
}
function asRejectionCode(v: unknown): 'PA' | 'PR' | undefined {
  return v === 'PA' || v === 'PR' ? v : undefined;
}

function buildContext(move: NextMove): ActionDrawerContext {
  const p = move.actionIntent.payload ?? {};
  return {
    cluster: asString(p.cluster) ?? move.cluster ?? undefined,
    articleId: asString(p.articleId),
    articles: asStringArray(p.articles),
    headline: asString(p.headline) ?? move.headline,
    sourceScreen: asString(p.sourceScreen) ?? 'forecasting',
    sourceKind: asString(p.sourceKind) ?? 'next-cycle-move',
    rejectionCode: asRejectionCode(p.rejectionCode),
    rejectionCount: asNumber(p.rejectionCount),
  };
}

/**
 * Map a NextMove (composer output) into an ActionIntent the global drawer host
 * can render. Returns the intent so the caller can `useUiAction()(intent)`.
 */
export function mapForecastActionIntent(move: NextMove): ActionIntent {
  const rawKind = move.actionIntent.kind;
  const context = buildContext(move);

  if (VALID_FORM_KINDS.has(rawKind as FormDrawerKind)) {
    const formKind = rawKind as FormDrawerKind;
    const title =
      formKind === 'partial_accept'
        ? 'Partial acceptance'
        : formKind === 'queue_renewal'
          ? 'Queue renewal'
          : move.headline;
    return {
      drawer: {
        title,
        description: move.headline,
        formKind,
        context,
      },
    };
  }

  // Unknown kind — surface the move details in a read-only drawer so the
  // click is never a silent no-op. The composer should be the one to add a
  // new kind here when it starts emitting it.
  return {
    drawer: {
      title: move.headline,
      description: `Driven by: ${move.sourceSignal}`,
      items: [
        { label: 'Cluster', value: move.cluster ?? '—' },
        {
          label: 'Forecast impact',
          value: `€${Math.round(move.forecastImpactEur).toLocaleString()}`,
        },
        { label: 'Signal', value: move.sourceSignal },
      ],
      context,
    },
  };
}
