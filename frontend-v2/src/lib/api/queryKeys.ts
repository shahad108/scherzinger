// Typed query-key factory.
//
// Every screen / cross-cutting hook MUST use this factory so cache keys are
// uniform and invalidations stay predictable. Each entry exposes:
//   - a base key (no params) for invalidation roots
//   - an optional callable that mixes in params for fine-grained keys
//
// Param objects are intentionally narrow: only fields the BFF reads as query
// strings. Adding a new param requires updating the factory AND the hook AND
// the OpenAPI param list.

import type { Persona } from '@/types';

export type ShellParams = { persona?: Persona; lang?: 'de' | 'en' };

export type ActionCenterParams = ShellParams & {
  week?: string;
  cluster?: string;
  hide_locked?: boolean;
  /**
   * Max row count for the paginated list blocks (rejections; extended to
   * decisions/sku_table in follow-up phases). Default 5 / max 200 — the
   * "Show all" pill bumps it to 200 on demand.
   */
  limit?: number;
};

export type MarginCockpitParams = ShellParams & {
  period?: string;
  cluster?: string;
  family?: string;
  tier?: string;
  customer_id?: string;
};

export type QuotesParams = ShellParams & {
  period?: string;
  week?: string;
  rep?: string;
  customer_id?: string;
  family?: string;
  tier?: string;
};

export type ForecastParams = ShellParams & {
  cluster?: string;
  family?: string;
  tier?: 'A' | 'B' | 'C';
  mode?: 'revenue' | 'margin' | 'volume';
  horizon?: number;
};

export type StudioParams = ShellParams & {
  aid?: string;
  filter?: string;
  hide_locked?: boolean;
};

export type AiParams = ShellParams;

export const qk = {
  shell: (params?: ShellParams) =>
    params ? (['shell', params] as const) : (['shell'] as const),

  actionCenter: (params?: ActionCenterParams) =>
    params ? (['action-center', params] as const) : (['action-center'] as const),

  marginCockpit: (params?: MarginCockpitParams) =>
    params ? (['margin-cockpit', params] as const) : (['margin-cockpit'] as const),

  quotes: (params?: QuotesParams) =>
    params ? (['quotes', params] as const) : (['quotes'] as const),

  forecast: (params?: ForecastParams) =>
    params ? (['forecast', params] as const) : (['forecast'] as const),

  studio: (params?: StudioParams) =>
    params ? (['studio', params] as const) : (['studio'] as const),
  studioWorkbench: (aid: string) => ['studio-workbench', aid] as const,
  studioComparable: (aid: string) => ['studio-comparable', aid] as const,

  ai: (params?: AiParams) => (params ? (['ai', params] as const) : (['ai'] as const)),

  // Cross-cutting.
  me: ['me'] as const,
  version: ['screens-version'] as const,
  auditTrail: (since: string) => ['audit-trail', since] as const,

  // Phase 2 — recommendation lookup for deep-link banners.
  recommendation: (ref: string) => ['recommendation', ref] as const,
} as const;
