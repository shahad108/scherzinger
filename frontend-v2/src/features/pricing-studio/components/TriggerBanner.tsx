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
//
// Structurally this is three sibling interactive elements inside a
// non-interactive `<section>`:
//   1. Body button   → opens Cost Trajectory Drawer
//   2. Link button   → navigates to link_target
//   3. LineageButton → opens the lineage drawer
// Keeping them as siblings (rather than nesting buttons) is required
// for valid HTML and avoids double-firing on Enter.

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
    <section
      className="ws-trigger"
      data-testid="trigger-banner"
      data-source={trigger.source}
      data-reason={trigger.reason}
      aria-label={`Opened from ${trigger.source}: ${trigger.headline}`}
    >
      <button
        type="button"
        className="ws-trigger-banner-body"
        data-testid="trigger-banner-body"
        onClick={() => onOpenCostDrawer?.()}
      >
        <span className="ws-trigger-icon" aria-hidden="true">
          <AlertTriangle size={14} />
        </span>
        <span className="ws-trigger-body">
          <span className="ws-trigger-headline">{trigger.headline}</span>
        </span>
      </button>
      <button
        type="button"
        className="ws-trigger-link"
        data-testid="trigger-banner-link"
        onClick={() => navigate(trigger.link_target)}
      >
        {trigger.link_label} →
      </button>
      <span className="ws-trigger-lineage">
        <LineageButton
          lineageRef={trigger.lineage_ref ?? null}
          subjectTitle="Trigger context"
          label="lineage"
        />
      </span>
    </section>
  );
}
