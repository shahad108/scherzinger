// Pricing Studio v3 / Phase 3 — Deep-link trigger banner.
//
// When the user lands on the Studio via `?source=...&reason=...` the BFF
// populates `workbench.trigger_context`. This banner is the persistent
// one-liner above the recommendation hero explaining *why* the SKU is
// open. Clicking the banner body opens the Cost Trajectory Drawer (the
// drawer renders the steel sparkline + components table). Clicking the
// inline link navigates to the origin screen (Forecasting / Margin).
//
// Persistent for the session — there is no dismiss control. The banner
// disappears only when the user navigates away or selects a different
// SKU that doesn't carry a trigger context.

import { AlertTriangle } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import type { TriggerContextBlock } from '@/types/studio';
import { LineageButton } from '@/components/LineageButton';

interface Props {
  trigger?: TriggerContextBlock | null;
  /** Open the Cost Trajectory Drawer scrolled to the steel sparkline. */
  onOpenCostDrawer?: () => void;
}

export function TriggerBanner({ trigger, onOpenCostDrawer }: Props) {
  const navigate = useNavigate();
  if (!trigger) return null;

  return (
    <div
      className="ws-trigger"
      role="button"
      tabIndex={0}
      data-testid="trigger-banner"
      data-source={trigger.source}
      data-reason={trigger.reason}
      aria-label={`Opened from ${trigger.source}: ${trigger.headline}`}
      onClick={() => onOpenCostDrawer?.()}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          onOpenCostDrawer?.();
        }
      }}
    >
      <span className="ws-trigger-icon" aria-hidden="true">
        <AlertTriangle size={14} />
      </span>
      <span className="ws-trigger-body">
        <span className="ws-trigger-headline">{trigger.headline}</span>
        <button
          type="button"
          className="ws-trigger-link"
          data-testid="trigger-banner-link"
          onClick={(e) => {
            e.stopPropagation();
            navigate(trigger.link_target);
          }}
        >
          {trigger.link_label} →
        </button>
      </span>
      <span className="ws-trigger-lineage" onClick={(e) => e.stopPropagation()}>
        <LineageButton
          lineageRef={trigger.lineage_ref ?? null}
          subjectTitle="Trigger context"
          label="lineage"
        />
      </span>
    </div>
  );
}
