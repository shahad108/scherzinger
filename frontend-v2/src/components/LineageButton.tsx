// Pricing Studio v3 / Phase 1 — Lineage glyph button.
//
// Small ghost-icon button surfaced in chart legends and tile rows. Clicking
// asks the page-level LineageDrawerProvider to open the drawer for the
// given lineage ref. If no ref is provided the button still renders but is
// disabled — the alternative (don't render) would create layout shift.

import type { LineageRefBlock } from '@/types/studio';
import { Info } from 'lucide-react';
import { cn } from '@/lib/cn';
import { useLineageDrawer } from '@/features/pricing-studio/lineage/LineageDrawerContext';

interface Props {
  lineageRef?: LineageRefBlock | null;
  /** Heading shown inside the opened drawer (e.g. "Win-prob curve"). */
  subjectTitle?: string;
  label?: string;
  className?: string;
}

export function LineageButton({ lineageRef, subjectTitle, label, className }: Props) {
  const { openLineage } = useLineageDrawer();
  const disabled = !lineageRef;
  const a11yLabel = label
    ? `Show lineage: ${label}`
    : 'Show data lineage';

  return (
    <button
      type="button"
      data-testid="lineage-button"
      disabled={disabled}
      aria-label={a11yLabel}
      onClick={() => openLineage(lineageRef, { subjectTitle: subjectTitle ?? label ?? null })}
      className={cn(
        'inline-flex items-center gap-1 rounded-full px-2 py-[2px] text-[10.5px] font-semibold uppercase tracking-[0.04em]',
        'border border-[var(--hairline)] bg-white text-[var(--muted)]',
        'transition-colors hover:text-[var(--rose-deep)] hover:border-[var(--rose-border)] hover:bg-[var(--rose-bg)]',
        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--rose)] focus-visible:ring-offset-1',
        disabled && 'cursor-not-allowed opacity-40 hover:bg-white hover:text-[var(--muted)] hover:border-[var(--hairline)]',
        className,
      )}
    >
      <Info size={11} aria-hidden="true" />
      {label ? <span>{label}</span> : <span className="sr-only">Lineage</span>}
    </button>
  );
}
