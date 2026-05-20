// DiagnosticsAccordionToggle — small disclosure used inside the Drivers
// accordion. Hides deep-diagnostic cards (seasonal, commodity, cost-decomp,
// input cost) behind a single toggle so Frank doesn't scroll past nine
// secondary cards to reach the one he needs.

import { useState, type ReactNode } from 'react';
import { ChevronDown } from 'lucide-react';

interface Props {
  count: number;
  children: ReactNode;
  label?: string;
}

export function DiagnosticsAccordionToggle({ count, children, label = 'Show diagnostics' }: Props) {
  const [open, setOpen] = useState(false);
  return (
    <div data-testid="diagnostics-accordion-toggle" className="mt-3">
      <button
        type="button"
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
        className="inline-flex items-center gap-1.5 text-[11.5px] font-semibold uppercase tracking-wide text-[var(--muted)] hover:text-[var(--ink-2)]"
      >
        <ChevronDown size={14} className={open ? 'rotate-180 text-[var(--ink-2)]' : ''} />
        {open ? 'Hide diagnostics' : `${label} (${count})`}
      </button>
      {open && <div className="mt-3 space-y-4">{children}</div>}
    </div>
  );
}
