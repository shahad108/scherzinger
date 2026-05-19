import { Info } from 'lucide-react';
import { useId, useState } from 'react';

/**
 * Pilot heuristic badge. Surfaces inline anywhere a number / signal is
 * computed from a heuristic estimator rather than a trained model, per
 * roadmap §8 ("Pilot — real partial data, heuristic logic"). Visual
 * language is the warm-amber pill used elsewhere in the studio.
 *
 * Tooltip uses native `title` + an `aria-describedby` sr-only fallback so
 * screen readers get the full text without us adding a new dependency.
 * Hover/focus on the badge also reveals a small inline panel for sighted
 * users who don't wait for the OS tooltip delay.
 */
export function PilotBadge({
  tooltip,
  label = 'Pilot',
  testId,
  className,
}: {
  tooltip: string;
  label?: string;
  testId?: string;
  className?: string;
}) {
  const descId = useId();
  const [open, setOpen] = useState(false);

  return (
    <span
      className={className}
      style={{
        position: 'relative',
        display: 'inline-flex',
      }}
      onMouseEnter={() => setOpen(true)}
      onMouseLeave={() => setOpen(false)}
      onFocus={() => setOpen(true)}
      onBlur={() => setOpen(false)}
    >
      <span
        role="note"
        tabIndex={0}
        data-testid={testId ?? 'pilot-badge'}
        aria-describedby={descId}
        title={tooltip}
        style={{
          display: 'inline-flex',
          alignItems: 'center',
          gap: 4,
          padding: '1px 6px',
          borderRadius: 999,
          background: 'color-mix(in oklab, var(--amber) 10%, white)',
          color: 'var(--amber)',
          fontSize: 10.5,
          fontWeight: 700,
          letterSpacing: '0.05em',
          textTransform: 'uppercase',
          border: '1px solid var(--amber-border, color-mix(in oklab, var(--amber) 30%, white))',
          cursor: 'help',
          lineHeight: 1.4,
        }}
      >
        <Info size={10} aria-hidden="true" />
        {label}
      </span>
      {/* Visible inline panel on hover/focus. The element is always in the
          DOM (so tests can assert on `tooltip` text being present) but
          hidden from layout via opacity/visibility when collapsed. */}
      <span
        id={descId}
        role="tooltip"
        data-testid={`${testId ?? 'pilot-badge'}-tooltip`}
        style={{
          position: 'absolute',
          top: 'calc(100% + 6px)',
          left: 0,
          zIndex: 50,
          maxWidth: 280,
          padding: '6px 8px',
          borderRadius: 6,
          background: '#111827',
          color: '#f9fafb',
          fontSize: 11,
          fontWeight: 400,
          letterSpacing: 'normal',
          textTransform: 'none',
          lineHeight: 1.4,
          boxShadow: 'var(--shadow-3, 0 4px 12px rgba(0,0,0,0.12))',
          opacity: open ? 1 : 0,
          visibility: open ? 'visible' : 'hidden',
          transition: 'opacity 120ms ease-out',
          pointerEvents: 'none',
          whiteSpace: 'normal',
        }}
      >
        {tooltip}
      </span>
    </span>
  );
}

/**
 * Canonical tooltip copy strings — kept here so tests can assert against
 * the exact wording from the Phase I plan / roadmap §8.
 */
export const PILOT_TOOLTIPS = {
  movableRevenue:
    'Pilot heuristic — movable revenue estimated from cost delta × historical win rate. Will switch to model-driven estimate once we have ≥3 months of price-elasticity training data.',
  wtpClusterFallback:
    'Pilot heuristic — WTP estimated from cluster-level percentiles (this SKU has <30 won quotes). Will switch to SKU-level once sample size is sufficient.',
} as const;
