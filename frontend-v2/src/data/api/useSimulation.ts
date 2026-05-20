// Pricing Studio v3 / Phase 8 — pricing simulation hook.
//
// Wraps POST /pricing/simulate. Read-only: no writes happen on the backend.
// Returns three scenarios (low/mid/high) for 12-month revenue / DB2 deltas
// plus a 12-point fan-band chart series. The mutation is fired by the
// Simulation Drawer when the user clicks "Simulate this option".
//
// Decimal-as-string at the boundary; floats inside the scenarios payload
// (matching the backend's `round(..., 2)` quantisation).

import { useMutation } from '@tanstack/react-query';
import { postJson } from '@/lib/api/client';

// ---------------------------------------------------------------------------
// Wire types — mirror `simulator.simulate` in
// `scherzinger-platform/backend/services/pricing/simulator.py`.
// ---------------------------------------------------------------------------

export interface SimulationScenario {
  revenue_delta_12mo: number;
  db2_delta_12mo: number;
  /** Churn risk delta in percentage points. */
  churn_risk_pp: number;
  /** 0..1 fractional. */
  win_prob_control: number;
  /** 0..1 fractional. */
  win_prob_variant: number;
}

export interface SimulationFanBandPoint {
  month: number;
  low: number;
  mid: number;
  high: number;
}

export interface SimulationResponse {
  aid: string;
  /** Decimal-as-string. */
  control_price: string;
  /** Decimal-as-string. */
  variant_price: string;
  eligibility: Record<string, unknown> | null;
  target_sample: number;
  n_eligible: number;
  sample_size: number;
  scenarios: {
    low: SimulationScenario;
    mid: SimulationScenario;
    high: SimulationScenario;
  };
  fan_band_chart_data: SimulationFanBandPoint[];
  lineage_ref: string | null;
  horizon_months: number;
}

export interface SimulationBody {
  aid: string;
  /** Decimal-as-string. */
  control_price: string;
  /** Decimal-as-string. */
  variant_price: string;
  eligibility?: Record<string, unknown> | null;
  target_sample?: number;
  tier?: string | null;
  horizon_months?: number;
}

// ---------------------------------------------------------------------------
// useSimulation — POST /pricing/simulate
// ---------------------------------------------------------------------------

function mockResolve(body: SimulationBody): SimulationResponse {
  // Deterministic, plausible numbers so component tests can render the
  // table + chart without a backend.
  const horizon = body.horizon_months ?? 12;
  const ctrl = Number(body.control_price);
  const variant = Number(body.variant_price);
  const lift = Number.isFinite(ctrl) && Number.isFinite(variant) && ctrl > 0
    ? (variant - ctrl) / ctrl
    : 0;
  const revMid = Math.round(lift * 800_000);
  const revLow = Math.round(revMid * 0.55);
  const revHigh = Math.round(revMid * 1.45);
  const scenarios = {
    low: {
      revenue_delta_12mo: revLow,
      db2_delta_12mo: Math.round(revLow * 0.43),
      churn_risk_pp: Math.round(lift * 60) / 100,
      win_prob_control: 0.82,
      win_prob_variant: 0.72,
    },
    mid: {
      revenue_delta_12mo: revMid,
      db2_delta_12mo: Math.round(revMid * 0.44),
      churn_risk_pp: Math.round(lift * 120) / 100,
      win_prob_control: 0.84,
      win_prob_variant: 0.71,
    },
    high: {
      revenue_delta_12mo: revHigh,
      db2_delta_12mo: Math.round(revHigh * 0.42),
      churn_risk_pp: Math.round(lift * 220) / 100,
      win_prob_control: 0.86,
      win_prob_variant: 0.69,
    },
  };
  const fan_band_chart_data: SimulationFanBandPoint[] = [];
  for (let m = 1; m <= horizon; m++) {
    const frac = m / horizon;
    fan_band_chart_data.push({
      month: m,
      low: Math.round(scenarios.low.revenue_delta_12mo * frac),
      mid: Math.round(scenarios.mid.revenue_delta_12mo * frac),
      high: Math.round(scenarios.high.revenue_delta_12mo * frac),
    });
  }
  return {
    aid: body.aid,
    control_price: body.control_price,
    variant_price: body.variant_price,
    eligibility: body.eligibility ?? null,
    target_sample: body.target_sample ?? 30,
    n_eligible: 24,
    sample_size: body.target_sample ?? 30,
    scenarios,
    fan_band_chart_data,
    lineage_ref: null,
    horizon_months: horizon,
  };
}

export function useSimulation() {
  return useMutation<SimulationResponse, Error, SimulationBody>({
    mutationFn: (body) =>
      postJson<SimulationResponse>('/pricing/simulate', body, {
        mockResolve: () => mockResolve(body),
      }),
  });
}
