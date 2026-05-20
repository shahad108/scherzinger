// Pricing Studio v3 — v1.4 engine hooks.
//
// Wraps the new `/pricing/v2/score/{aid}` and `/pricing/v2/score_at_price`
// endpoints (see W1 of the wiring plan). The legacy `/pricing/simulate`
// hook in useSimulation.ts is preserved untouched; v2 lives alongside.
//
// Both hooks come with deterministic mock fallbacks so component tests
// keep working without a backend.

import { useMutation, useQuery } from '@tanstack/react-query';
import { apiFetch, postJson } from '@/lib/api/client';

// ---------------------------------------------------------------------------
// Wire types — mirror backend/services/pricing/engine_v2/orchestrator.py.
// ---------------------------------------------------------------------------

export interface EngineV2Drivers {
  win_prob: number;
  cost: number;
  churn: number;
  [key: string]: number;
}

export interface EngineV2Recommendation {
  engine_version: string;
  article_id: string;
  as_of: string;
  current_price: number;
  unit_cost: number;
  expected_volume_12mo: number;
  n_customers: number;
  p_star: number;
  delta_pct: number;
  score_eur: number;
  score_eur_calibrated: number;
  breakeven_price: number | null;
  mc_ci_low: number;
  mc_ci_high: number;
  mc_p_positive: number;
  drivers: EngineV2Drivers;
  /** Score curve as [price, score] pairs. */
  score_curve: [number, number][];
  constraint_active: string | null;
  wp_locked: boolean;
  wp_n_train: number;
  conformal_scalar: number;
  error?: string;
}

export interface ScoreAtPriceBody {
  aid: string;
  /** Decimal-as-string. */
  candidate_price: string;
  as_of?: string;
}

export interface ScoreAtPriceResponse {
  engine_version: string;
  article_id: string;
  candidate_price: number;
  current_price: number;
  delta_pct: number;
  score_eur: number;
  score_eur_calibrated: number;
  score_eur_at_current: number;
  score_eur_at_current_calibrated: number;
  uplift_pct_vs_current: number;
  p_retain_mean: number;
  p_churn_mean: number;
  conformal_scalar: number;
  error?: string;
}

// ---------------------------------------------------------------------------
// Mock fallbacks — keep component tests / Storybook hits self-contained.
// ---------------------------------------------------------------------------

function mockRecommendation(aid: string): EngineV2Recommendation {
  const p_cur = 1411.38;
  const score = 250;
  const curve: [number, number][] = [];
  for (let i = 0; i < 25; i++) {
    const ratio = 0.7 + (0.6 * i) / 24;
    const p = p_cur * ratio;
    const s = score * (1 - 6 * (ratio - 1) * (ratio - 1));
    curve.push([Math.round(p * 100) / 100, Math.round(s)]);
  }
  return {
    engine_version: 'v1.4',
    article_id: aid,
    as_of: '2024-12-31',
    current_price: p_cur,
    unit_cost: 893.0,
    expected_volume_12mo: 420.0,
    n_customers: 7,
    p_star: p_cur,
    delta_pct: 0,
    score_eur: 212,
    score_eur_calibrated: score,
    breakeven_price: 1340.82,
    mc_ci_low: -3013,
    mc_ci_high: 3483,
    mc_p_positive: 0.548,
    drivers: { win_prob: 0, cost: 93, churn: -12520 },
    score_curve: curve,
    constraint_active: null,
    wp_locked: false,
    wp_n_train: 87,
    conformal_scalar: 1.179,
  };
}

function mockScoreAtPrice(body: ScoreAtPriceBody): ScoreAtPriceResponse {
  const cur = 1411.38;
  const candidate = Number(body.candidate_price);
  const delta = Number.isFinite(candidate) && cur > 0 ? (candidate - cur) / cur : 0;
  const score_at_current = 212;
  const score = score_at_current - 800 * delta * delta;
  return {
    engine_version: 'v1.4',
    article_id: body.aid,
    candidate_price: candidate,
    current_price: cur,
    delta_pct: delta * 100,
    score_eur: score,
    score_eur_calibrated: score * 1.179,
    score_eur_at_current: score_at_current,
    score_eur_at_current_calibrated: score_at_current * 1.179,
    uplift_pct_vs_current:
      ((score - score_at_current) / Math.max(Math.abs(score_at_current), 1e-9)) * 100,
    p_retain_mean: Math.max(0, 1 - 0.1 - 0.6 * Math.max(0, delta)),
    p_churn_mean: Math.min(1, 0.1 + 0.6 * Math.max(0, delta)),
    conformal_scalar: 1.179,
  };
}

// ---------------------------------------------------------------------------
// Hooks
// ---------------------------------------------------------------------------

export function useEngineV2Score(aid: string | null | undefined) {
  return useQuery<EngineV2Recommendation, Error>({
    queryKey: ['engine-v2-score', aid],
    enabled: Boolean(aid),
    staleTime: 60_000,
    queryFn: () =>
      apiFetch<EngineV2Recommendation>(`/pricing/v2/score/${aid}`, {
        mockResolve: () => mockRecommendation(aid as string),
      }),
  });
}

export function useEngineV2ScoreAtPrice() {
  return useMutation<ScoreAtPriceResponse, Error, ScoreAtPriceBody>({
    mutationFn: (body) =>
      postJson<ScoreAtPriceResponse>('/pricing/v2/score_at_price', body, {
        mockResolve: () => mockScoreAtPrice(body),
      }),
  });
}
