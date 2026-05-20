// Phase 4 — Shared risk-tier chip.

import type { RiskTier } from '@/types/forecast';

const TONE: Record<RiskTier, { className: string; label: string }> = {
  high: { className: 'status red', label: 'High risk' },
  medium: { className: 'status amber', label: 'Medium risk' },
  low: { className: 'status', label: 'Low risk' },
  unknown: { className: '', label: 'Risk: unknown' },
};

interface Props {
  tier: RiskTier;
  pChurn?: number | null;
  pDecline?: number | null;
}

export function RiskTierChip({ tier, pChurn, pDecline }: Props) {
  const tone = TONE[tier];
  return (
    <span
      data-testid="risk-tier-chip"
      data-tier={tier}
      className={`tag-chip ${tone.className}`}
      title={
        pChurn != null && pDecline != null
          ? `Churn ${(pChurn * 100).toFixed(0)}% · Decline ${(pDecline * 100).toFixed(0)}%`
          : undefined
      }
    >
      {tone.label}
    </span>
  );
}
