import type { ActionKind, ActionBody } from '@/data/api/useActions';

export type ActionToastSeverity = 'info' | 'success' | 'warning' | 'error';

/**
 * Phase 3 typed form drawers. When `formKind` is set the dispatcher
 * renders the matching form component (which submits to the backend
 * via runAction); otherwise the static `items` list renders as a
 * read-only context panel. Read-only kinds (`decision_detail`,
 * `trust_explain`) are also explicit so we keep label-style rendering
 * but enforce the typed contract.
 */
export type FormDrawerKind =
  | 'partial_accept'
  | 'snooze'
  | 'queue_renewal'
  | 'ab_setup'
  | 'ab_hold'
  | 'ab_promote'
  | 'decision_detail'
  | 'trust_explain'
  // Phase 7 — admin & shell forms.
  | 'add_section'
  | 'saved_view_save'
  | 'add_reviewer'
  // Phase 11 — share a Frank decision with Till or Heiko.
  | 'share_decision'
  // Plan §2.6 F11 — full lineage drawer dispatched from DecisionCards
  // inline evidence panel. ActionDrawerHost may render a default form
  // until the dedicated lineage component ships in Phase B.
  | 'lineage';

export interface ActionDrawerContext {
  recommendationId?: string;
  articleId?: string;
  customerId?: string;
  cluster?: string;
  abTestId?: string;
  sourceScreen?: string;
  sourceKind?: string;
  /** Headline shown in form previews and used as the audit `after.headline`. */
  headline?: string;
  /** Used by partial_accept + ab_setup to pre-fill the current price. */
  currentPrice?: number;
  /** Used by partial_accept to pre-fill the target. */
  targetPrice?: number;
  /** Phase 7 — saved-view payloads. */
  screen?: string;
  filters?: Record<string, unknown>;
  /** Phase 7 — reviewer panel target. */
  panelId?: string;
  panelLabel?: string;
  /** v2.2 — NextCycleMovesStrip → ActionCenter. Articles referenced by the
   *  move (renewal queue can carry multiple). */
  articles?: string[];
  /** v2.2 — rejection-code provenance for moves driven by win/loss data. */
  rejectionCode?: 'PA' | 'PR';
  rejectionCount?: number;
}

export interface ActionDrawerIntent {
  title: string;
  description?: string;
  items?: { label: string; value: string }[];
  /** Copy to render when ``items`` is empty (e.g. the backend hasn't
   *  yet populated the drawer's source). The dispatcher shows this in
   *  place of the empty list so users understand why the panel is
   *  blank — plan §4 / §2.1 F2. */
  emptyLabel?: string;
  primaryLabel?: string;
  formKind?: FormDrawerKind;
  context?: ActionDrawerContext;
}

export interface ActionIntent {
  kind?: ActionKind;
  targetType?: string;
  targetId?: string;
  body?: ActionBody;
  optimistic?: boolean;
  route?: string;
  hash?: string;
  query?: Record<string, string | number | boolean | undefined | null>;
  toast?: string;
  toastSeverity?: ActionToastSeverity;
  drawer?: ActionDrawerIntent;
  disabledReason?: string;
  requiredPermission?: string;
  permissionDeniedReason?: string;
  // Phase 1 — context fields backend composers attach so deep links and
  // mutations can route to the exact recommendation/article/test/etc.
  recommendationId?: string;
  articleId?: string;
  customerId?: string;
  cluster?: string;
  abTestId?: string;
  sourceScreen?: string;
  traceId?: string;
  returnTo?: string;
  focus?: string;
  /**
   * Smooth in-page scroll target (CSS selector, e.g. ``#sec-decisions``).
   * When set, executeUiAction calls scrollIntoView instead of navigating
   * — additive with ``query`` for filter side-effects.
   */
  scroll?: string;
  /**
   * Typed no-op marker — emitted by the pinned ``"all"`` filter chip in
   * BucketFilterRow (plan §2.5). The dispatcher short-circuits without
   * routing or mutating.
   */
  noop?: boolean;
}
