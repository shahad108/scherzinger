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
  | 'add_reviewer';

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
}

export interface ActionDrawerIntent {
  title: string;
  description?: string;
  items?: { label: string; value: string }[];
  primaryLabel?: string;
  formKind?: FormDrawerKind;
  context?: ActionDrawerContext;
}

export interface ActionIntent {
  kind?: ActionKind;
  targetType?: string;
  targetId?: string;
  body?: ActionBody;
  route?: string;
  hash?: string;
  query?: Record<string, string | number | boolean | undefined | null>;
  toast?: string;
  toastSeverity?: ActionToastSeverity;
  drawer?: ActionDrawerIntent;
  disabledReason?: string;
  // Phase 1 — context fields backend composers attach so deep links and
  // mutations can route to the exact recommendation/article/test/etc.
  recommendationId?: string;
  articleId?: string;
  customerId?: string;
  cluster?: string;
  abTestId?: string;
  sourceScreen?: string;
  returnTo?: string;
  focus?: string;
}
