// Pricing Studio v3 / Phase 1 — Data Missing pill.
//
// Rendered in place of a value when the BFF block is undefined/null. Amber
// tone consistent with the design tokens. Tooltip optional — we use the
// native `title` attribute (no extra dep, keyboard-readable).

import type { HTMLAttributes } from 'react';
import { AlertTriangle } from 'lucide-react';
import { cn } from '@/lib/cn';

interface Props extends HTMLAttributes<HTMLSpanElement> {
  /** Short label e.g. "No sample", "Insufficient data". */
  reason?: string;
  /** Native tooltip — long-form explanation. */
  tooltip?: string;
  /** Render the warning glyph (default true). */
  icon?: boolean;
}

export function DataMissingBadge({
  reason = 'Data missing',
  tooltip,
  icon = true,
  className,
  ...rest
}: Props) {
  return (
    <span
      role="status"
      title={tooltip ?? reason}
      data-testid="data-missing-badge"
      className={cn(
        'inline-flex items-center gap-1 rounded-full border px-2 py-[1px] text-[10.5px] font-semibold leading-4 tracking-[0.01em] uppercase',
        /* Phase K5 a11y: --amber-deep meets ≥4.5:1 vs --amber-bg. */
        'border-[var(--amber-border)] bg-[var(--amber-bg)] text-[var(--amber-deep)]',
        className,
      )}
      {...rest}
    >
      {icon && <AlertTriangle size={10} aria-hidden="true" />}
      <span>{reason}</span>
    </span>
  );
}
