// FVA (Forecast Value Added) guardrail — Phase 4 (forecast redesign v2).
//
// Research (Fildes/Goodwin 2007; Fildes/De Baets 2024) shows that small manual
// adjustments to statistical forecasts (under ~5%) systematically degrade
// accuracy: they introduce noise without adding real information. We surface a
// soft warning when the user's actual lands within ±5% of the model P50 so
// Frank pauses before overriding for cosmetic reasons.
//
// The threshold is configurable in one place so backend audits and frontend
// copy stay in sync.

export const FVA_THRESHOLD = 0.05; // 5% per Fildes/De Baets 2024

/**
 * Compute the signed adjustment % of `actual` vs the model's P50.
 * Returns 0 when the model P50 is 0/missing to avoid divide-by-zero.
 */
export function computeAdjustmentPct(actual: number, modelP50: number): number {
  if (!modelP50) return 0;
  return (actual - modelP50) / modelP50;
}

/**
 * Returns a warning string when `|adjustmentPct| < FVA_THRESHOLD`, else null.
 * Caller renders the string in a soft amber callout next to the save CTA.
 */
export function fvaWarning(adjustmentPct: number): string | null {
  if (Math.abs(adjustmentPct) < FVA_THRESHOLD) {
    return 'Small overrides (<5%) typically harm accuracy (Fildes & Goodwin, 2007). Continue only if you have specific information the model lacks.';
  }
  return null;
}
