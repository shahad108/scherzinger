// Pricing Studio v3 / Phase 9 (§9.3) — Inline alert bell button.
//
// Drops next to a value (cost tile, competitor strip, churn chip, cost
// drawer footer, …). Click → opens AlertSetupDrawer pre-filled with the
// trigger kind + scope this button advertises.
//
// Visual: low-emphasis muted icon by default; warms to amber on hover so
// Frank knows it's actionable. Inline-flex so the parent layout never
// shifts when this slot is empty/full.

import { useState } from 'react';
import { Bell } from 'lucide-react';
import {
  AlertSetupDrawer,
  type AlertInitialSpec,
} from '@/features/pricing-studio/components/AlertSetupDrawer';
import type { AlertKind, AlertScopeInput } from '@/data/api/usePricingAlerts';

export interface AlertButtonProps {
  triggerKind: AlertKind;
  scope?: AlertScopeInput;
  initialSpec?: AlertInitialSpec;
  label?: string;
  /** Optional className appended to the button (positioning, etc). */
  className?: string;
}

export function AlertButton({
  triggerKind,
  scope,
  initialSpec,
  label,
  className,
}: AlertButtonProps) {
  const [open, setOpen] = useState(false);

  return (
    <>
      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation();
          setOpen(true);
        }}
        data-testid={`alert-button-${triggerKind}`}
        title={label ?? 'Notify me'}
        aria-label={label ?? `Set ${triggerKind} alert`}
        className={[
          'inline-flex items-center gap-1 rounded-full border border-[var(--hairline)] bg-white px-1.5 py-0.5 text-[10.5px] font-semibold text-[var(--muted)] transition-colors',
          'hover:border-[var(--amber-border)] hover:bg-[var(--amber-bg)] hover:text-[var(--amber)]',
          className ?? '',
        ]
          .filter(Boolean)
          .join(' ')}
      >
        <Bell size={11} aria-hidden="true" />
        {label && <span className="leading-none">{label}</span>}
      </button>
      {open && (
        <AlertSetupDrawer
          open={open}
          onOpenChange={setOpen}
          triggerKind={triggerKind}
          scope={scope}
          initialSpec={initialSpec}
        />
      )}
    </>
  );
}
