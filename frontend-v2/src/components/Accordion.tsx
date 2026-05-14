// Reusable accordion (collapsible section) for the forecast redesign.
//
// Used in Phase 6 to wrap the "Drivers & accuracy" and "Renewals & new
// product" blocks, plus the OverrideLog, so the AggregateViewV2 page reads as
// hero-first with secondary detail hidden by default.
//
// Visual style follows the Pryzm 2026 design language: rounded-[12px] card,
// hairline border, white surface, font-display title.

import { useCallback, useId, useState } from 'react';
import type { KeyboardEvent, ReactNode } from 'react';
import { ChevronDown } from 'lucide-react';

interface Props {
  title: string;
  badge?: ReactNode;
  defaultOpen?: boolean;
  id?: string;
  children: ReactNode;
}

export function Accordion({
  title,
  badge,
  defaultOpen = false,
  id,
  children,
}: Props) {
  const [open, setOpen] = useState<boolean>(defaultOpen);
  const reactId = useId();
  const panelId = `accordion-panel-${id ?? reactId}`;
  const buttonId = `accordion-button-${id ?? reactId}`;

  const toggle = useCallback(() => setOpen((v) => !v), []);

  const onKeyDown = useCallback(
    (e: KeyboardEvent<HTMLButtonElement>) => {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        toggle();
      }
    },
    [toggle],
  );

  return (
    <section
      id={id}
      className="mt-4 rounded-[12px] border border-[var(--hairline)] bg-white shadow-[0_1px_2px_rgba(20,20,28,0.04)]"
    >
      <button
        id={buttonId}
        type="button"
        aria-expanded={open}
        aria-controls={panelId}
        onClick={toggle}
        onKeyDown={onKeyDown}
        className="flex w-full items-center justify-between gap-3 rounded-[12px] px-4 py-3 text-left hover:bg-[var(--surface-soft)] focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--rose-deep)]"
      >
        <div className="flex items-center gap-2">
          <span className="font-display text-[14.5px] font-bold tracking-tight text-[var(--ink)]">
            {title}
          </span>
          {badge && (
            <span
              data-testid="accordion-badge"
              className="inline-flex items-center rounded-full bg-[var(--rose-bg)] px-2 py-0.5 text-[11px] font-semibold text-[var(--rose-deep)]"
            >
              {badge}
            </span>
          )}
        </div>
        <ChevronDown
          size={16}
          aria-hidden="true"
          className={`text-[var(--muted)] transition-transform duration-150 ${
            open ? 'rotate-180' : 'rotate-0'
          }`}
        />
      </button>
      {open && (
        <div
          id={panelId}
          role="region"
          aria-labelledby={buttonId}
          className="border-t border-[var(--hairline)] px-4 py-4"
        >
          {children}
        </div>
      )}
    </section>
  );
}
