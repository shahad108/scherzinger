// Pricing Studio v3 / Phase 9 (§9.3) — Alert inbox bell.
//
// Top-bar bell that surfaces the count of triggered alerts the user
// hasn't acted on yet. Mirrors the ApprovalInboxBell shape so the two
// sit side-by-side in the Studio page header.
//
// Badge stays amber on count>0 (alert language ≠ approval rose); count
// >9 collapses to "9+".

import { useState } from 'react';
import { Bell } from 'lucide-react';
import { useAlertInbox } from '@/data/api/usePricingAlerts';
import { AlertsDrawer } from './AlertsDrawer';

export function AlertInboxBell() {
  const [open, setOpen] = useState(false);
  const { data } = useAlertInbox();
  const count = data?.events.length ?? 0;

  return (
    <>
      <button
        type="button"
        data-testid="alert-inbox-bell"
        onClick={() => setOpen(true)}
        className={`relative inline-flex h-9 w-9 items-center justify-center rounded-full border bg-white hover:bg-[var(--surface-soft)] ${
          count > 0
            ? 'border-[var(--amber-border)] text-[var(--amber)]'
            : 'border-[var(--hairline)] text-[var(--ink-2)]'
        }`}
        aria-label={`Alert inbox · ${count} triggered`}
      >
        <Bell size={14} />
        {count > 0 && (
          <span
            data-testid="alert-inbox-badge"
            aria-hidden="true"
            className="absolute -right-1 -top-1 grid h-4 min-w-4 place-items-center rounded-full bg-[var(--amber)] px-1 text-[9px] font-bold text-white"
          >
            {count > 9 ? '9+' : count}
          </span>
        )}
      </button>
      <AlertsDrawer open={open} onOpenChange={setOpen} />
    </>
  );
}
