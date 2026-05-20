// Pricing Studio v3 / Phase 1 — test fixtures for the Phase 1 BFF blocks.
//
// Decimal arrives from the BFF as JSON strings; fixtures match that wire
// shape so each component's parser path is exercised end-to-end.

import type {
  RecommendationBlock,
  WtpBlock,
  WinProbCurveBlock,
  CompetitorRefBlock,
  LineageRefBlock,
} from '@/types/studio';

export const lineageRef = (id = 'a1d4e3f0-0000-4000-8000-000000000001'): LineageRefBlock => ({
  id,
  source_kind: 'elasticity_model',
  source_id: `model:logit:${id.slice(0, 8)}`,
  sql: null,
  model: 'logit-v1.2',
  computed_at: '2026-05-15T10:00:00Z',
  computed_by: 'recommendation-composer',
});

export const recommendation = (
  overrides: Partial<RecommendationBlock> = {},
): RecommendationBlock => ({
  aid: '200832-E',
  recommended_price: '127.00',
  confidence: '0.62',
  confidence_level: 'med',
  band: { min: '112.00', target: '127.00', max: '138.00' },
  drivers: [
    {
      kind: 'cost_trajectory',
      label: 'Steel index +2.4%',
      contribution_pct: '0.35',
      lineage_ref: lineageRef('a1d4e3f0-0000-4000-8000-000000000002'),
    },
    {
      kind: 'win_prob_optimum',
      label: 'Win-prob curve peak',
      contribution_pct: '0.30',
      lineage_ref: lineageRef('a1d4e3f0-0000-4000-8000-000000000003'),
    },
    {
      kind: 'competitor_signal',
      label: 'Competitor at €121',
      contribution_pct: '0.15',
      lineage_ref: lineageRef('a1d4e3f0-0000-4000-8000-000000000004'),
    },
    {
      kind: 'customer_mix',
      label: 'Tier A weight',
      contribution_pct: '0.12',
      lineage_ref: lineageRef('a1d4e3f0-0000-4000-8000-000000000005'),
    },
    {
      kind: 'floor_protection',
      label: 'Above floor',
      contribution_pct: '0.08',
      lineage_ref: lineageRef('a1d4e3f0-0000-4000-8000-000000000006'),
    },
  ],
  rationale_md:
    'Steel index moved **+2.4%** in the last 30 days; win-probability curve peaks near `€127`.',
  lineage_ref: lineageRef('a1d4e3f0-0000-4000-8000-000000000001'),
  ...overrides,
});

export const wtp = (overrides: Partial<WtpBlock> = {}): WtpBlock => ({
  aid: '200832-E',
  tier: 'A',
  p10: '116.00',
  p50: '124.00',
  p90: '132.00',
  n_deals: 14,
  window_days: 90,
  confidence: 'med',
  anchored_from_cluster: false,
  lineage_ref: lineageRef('a1d4e3f0-0000-4000-8000-000000000010'),
  ...overrides,
});

export const winProbCurve = (
  overrides: Partial<WinProbCurveBlock> = {},
): WinProbCurveBlock => {
  const points = Array.from({ length: 20 }, (_, i) => {
    const price = 110 + i * 1.5;
    // Sigmoid-ish for sanity
    const x = (price - 125) / 6;
    const w = 1 / (1 + Math.exp(x));
    return {
      price: price.toFixed(2),
      win_prob: w.toFixed(4),
      lower_ci: Math.max(0, w - 0.05).toFixed(4),
      upper_ci: Math.min(1, w + 0.05).toFixed(4),
    };
  });
  return {
    aid: '200832-E',
    tier: 'A',
    points,
    n_deals: 22,
    confidence_band: 'asymptotic',
    lineage_ref: lineageRef('a1d4e3f0-0000-4000-8000-000000000020'),
    ...overrides,
  };
};

export const winProbCurveFlat = (): WinProbCurveBlock => {
  const points = Array.from({ length: 20 }, (_, i) => {
    const price = 110 + i * 1.5;
    return {
      price: price.toFixed(2),
      win_prob: '0.5',
      // Flat fallback — lower == upper == prob, so the CI ribbon is hidden.
      lower_ci: '0.5',
      upper_ci: '0.5',
    };
  });
  return {
    aid: '200832-E',
    tier: 'A',
    points,
    n_deals: 0,
    confidence_band: null,
    lineage_ref: lineageRef('a1d4e3f0-0000-4000-8000-000000000021'),
  };
};

export const competitorRef = (
  overrides: Partial<CompetitorRefBlock> = {},
): CompetitorRefBlock => ({
  aid: '200832-E',
  median_price: '121.00',
  sample_count: 7,
  last_seen: '2026-05-12T10:00:00Z',
  window_days: 90,
  lineage_ref: lineageRef('a1d4e3f0-0000-4000-8000-000000000030'),
  ...overrides,
});
