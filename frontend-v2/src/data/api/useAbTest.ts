// Pricing Studio v3 / Phase 8 — A/B test mutation hooks.
//
// Wraps the BFF endpoints:
//   POST /pricing/ab-tests           → create test
//   GET  /pricing/ab-tests/{id}      → test + scoring
//   POST /pricing/ab-tests/{id}/score
//   POST /pricing/ab-tests/{id}/decision
//
// Decimal-as-string is preserved end-to-end. The control/variant prices are
// passed as strings to keep cent precision through the JSON boundary.

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { apiFetch, postJson } from '@/lib/api/client';
import type { AbScoringResult } from '@/types/studio';

// ---------------------------------------------------------------------------
// Wire types — mirror `_serialize_ab_test` / SimulateIn in
// `scherzinger-platform/backend/api/v1/pricing.py`.
// ---------------------------------------------------------------------------

export interface AbTestRecord {
  id: string;
  aid: string;
  /** Decimal-as-string EUR. */
  control_price: string;
  /** Decimal-as-string EUR. */
  variant_price: string;
  status: string;
  decision_state: 'running' | 'held' | 'promoted' | 'rejected' | (string & {});
  target_sample: number;
  eligibility: Record<string, unknown> | null;
  criterion: Record<string, unknown> | null;
  duration_days: number | null;
  success_metric: string | null;
  hypothesis: string | null;
  start_date: string | null;
  end_date: string | null;
  created_at: string | null;
}

export interface AbTestCreateBody {
  aid: string;
  /** Decimal-as-string. */
  control_price: string;
  /** Decimal-as-string. */
  variant_price: string;
  eligibility?: Record<string, unknown> | null;
  criterion?: Record<string, unknown> | null;
  target_sample?: number;
  duration_days?: number | null;
  success_metric?: string | null;
  hypothesis?: string | null;
}

export interface AbTestCreateResponse {
  ab_test: AbTestRecord;
}

export interface AbTestGetResponse {
  ab_test: AbTestRecord;
  scoring: AbScoringResult;
}

export interface AbTestDecisionBody {
  decision: 'promote' | 'hold';
}

export interface AbTestDecisionResponse {
  test_id: string;
  decision: string;
  status: string;
  receipt_id: string | null;
  notes: string[];
}

// ---------------------------------------------------------------------------
// Query keys.
// ---------------------------------------------------------------------------

export const abTestKey = (testId: string | null | undefined) =>
  ['ab-test', testId ?? null] as const;

// ---------------------------------------------------------------------------
// useAbTest — GET /pricing/ab-tests/{id}
// ---------------------------------------------------------------------------

export function useAbTest(testId: string | null | undefined, opts?: { enabled?: boolean }) {
  const enabled = (opts?.enabled ?? true) && Boolean(testId);
  return useQuery<AbTestGetResponse>({
    queryKey: abTestKey(testId),
    enabled,
    queryFn: () =>
      apiFetch<AbTestGetResponse>(
        `/pricing/ab-tests/${encodeURIComponent(testId ?? '')}`,
        {
          mockResolve: () => ({
            ab_test: {
              id: testId ?? 'mock',
              aid: 'mock-aid',
              control_price: '118.00',
              variant_price: '127.00',
              status: 'active',
              decision_state: 'running',
              target_sample: 30,
              eligibility: null,
              criterion: null,
              duration_days: 14,
              success_metric: 'db2_margin',
              hypothesis: null,
              start_date: null,
              end_date: null,
              created_at: null,
            },
            scoring: {
              test_id: testId ?? 'mock',
              control: { n: 0, conv: null, margin: null, revenue: 0 },
              variant: { n: 0, conv: null, margin: null, revenue: 0 },
              z_stat: null,
              p_value: null,
              decision_ready: false,
            },
          }),
        },
      ),
    staleTime: 30_000,
  });
}

// ---------------------------------------------------------------------------
// useCreateAbTest — POST /pricing/ab-tests
// ---------------------------------------------------------------------------

export function useCreateAbTest() {
  const qc = useQueryClient();
  return useMutation<AbTestCreateResponse, Error, AbTestCreateBody>({
    mutationFn: (body) =>
      postJson<AbTestCreateResponse>('/pricing/ab-tests', body, {
        mockResolve: () => ({
          ab_test: {
            id: `mock-${Date.now()}`,
            aid: body.aid,
            control_price: body.control_price,
            variant_price: body.variant_price,
            status: 'active',
            decision_state: 'running',
            target_sample: body.target_sample ?? 30,
            eligibility: body.eligibility ?? null,
            criterion: body.criterion ?? null,
            duration_days: body.duration_days ?? 14,
            success_metric: body.success_metric ?? 'db2_margin',
            hypothesis: body.hypothesis ?? null,
            start_date: null,
            end_date: null,
            created_at: new Date().toISOString(),
          },
        }),
      }),
    onSuccess: () => {
      // Workbench refetches → picks up active_ab_test summary.
      qc.invalidateQueries({ queryKey: ['studio'] });
    },
  });
}

// ---------------------------------------------------------------------------
// useScoreAbTest — POST /pricing/ab-tests/{id}/score
// ---------------------------------------------------------------------------

export interface AbScoreResponse {
  scoring: AbScoringResult;
}

export function useScoreAbTest(testId: string | null | undefined) {
  const qc = useQueryClient();
  return useMutation<AbScoreResponse, Error, void>({
    mutationFn: () =>
      postJson<AbScoreResponse>(
        `/pricing/ab-tests/${encodeURIComponent(testId ?? '')}/score`,
        undefined,
        {
          mockResolve: () => ({
            scoring: {
              test_id: testId ?? 'mock',
              control: { n: 0, conv: null, margin: null, revenue: 0 },
              variant: { n: 0, conv: null, margin: null, revenue: 0 },
              z_stat: null,
              p_value: null,
              decision_ready: false,
            },
          }),
        },
      ),
    onSuccess: () => {
      if (testId) qc.invalidateQueries({ queryKey: abTestKey(testId) });
      qc.invalidateQueries({ queryKey: ['studio'] });
    },
  });
}

// ---------------------------------------------------------------------------
// useDecideAbTest — POST /pricing/ab-tests/{id}/decision
// ---------------------------------------------------------------------------

export function useDecideAbTest(testId: string | null | undefined) {
  const qc = useQueryClient();
  return useMutation<AbTestDecisionResponse, Error, AbTestDecisionBody>({
    mutationFn: (body) =>
      postJson<AbTestDecisionResponse>(
        `/pricing/ab-tests/${encodeURIComponent(testId ?? '')}/decision`,
        body,
        {
          mockResolve: () => ({
            test_id: testId ?? 'mock',
            decision: body.decision,
            status: body.decision === 'promote' ? 'promoted' : 'held',
            receipt_id: null,
            notes: [],
          }),
        },
      ),
    onSuccess: () => {
      if (testId) qc.invalidateQueries({ queryKey: abTestKey(testId) });
      qc.invalidateQueries({ queryKey: ['studio'] });
    },
  });
}
