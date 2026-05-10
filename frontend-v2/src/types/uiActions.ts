import type { ActionKind, ActionBody } from '@/data/api/useActions';

export type ActionToastSeverity = 'info' | 'success' | 'warning' | 'error';

export interface ActionDrawerIntent {
  title: string;
  description?: string;
  items?: { label: string; value: string }[];
  primaryLabel?: string;
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
