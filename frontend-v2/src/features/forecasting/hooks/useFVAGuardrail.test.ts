import { describe, it, expect } from 'vitest';
import { computeAdjustmentPct, fvaWarning, FVA_THRESHOLD } from './useFVAGuardrail';

describe('FVA guardrail', () => {
  it('computes adjustment % vs model P50', () => {
    expect(computeAdjustmentPct(110, 100)).toBeCloseTo(0.1);
    expect(computeAdjustmentPct(95, 100)).toBeCloseTo(-0.05);
    expect(computeAdjustmentPct(100, 100)).toBe(0);
  });

  it('returns 0 when modelP50 is 0 or missing (no divide-by-zero)', () => {
    expect(computeAdjustmentPct(100, 0)).toBe(0);
    // @ts-expect-error — undefined is a runtime-possible bad input we want to handle
    expect(computeAdjustmentPct(100, undefined)).toBe(0);
  });

  it('warns when |adjustment| is under the threshold', () => {
    expect(fvaWarning(0.02)).not.toBeNull();
    expect(fvaWarning(-0.03)).not.toBeNull();
    expect(fvaWarning(0.04)).not.toBeNull();
  });

  it('does not warn when |adjustment| meets or exceeds the threshold', () => {
    expect(fvaWarning(0.1)).toBeNull();
    expect(fvaWarning(-0.1)).toBeNull();
    // boundary: exactly the threshold is considered "large enough"
    expect(fvaWarning(FVA_THRESHOLD)).toBeNull();
    expect(fvaWarning(-FVA_THRESHOLD)).toBeNull();
  });
});
