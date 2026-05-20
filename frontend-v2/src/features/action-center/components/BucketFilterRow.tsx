import type { ActionIntent, BucketFilter } from '@/types';
import { EmptyBlock } from './EmptyBlock';

export interface BucketFilterRowProps {
  filters: BucketFilter[];
  active: string;
  onChange: (id: string) => void;
  onAction: (intent: ActionIntent) => void;
}

/**
 * BucketFilterRow — chip strip above DecisionCards (plan §2.5).
 *
 * Replaces the old SKU-revenue Movable/Locked cards with an honest
 * action-queue filter row. Active chip filled rose, inactive outlined,
 * empty queues (count = 0 and not the pinned "all") rendered disabled.
 * Cmd-click (or right-click) escalates from "filter the list" to
 * "open the full queue in Pricing Studio" — the typed `queueRoute`
 * intent makes that route safe to dispatch.
 *
 * Hard rules: theme tokens only, no fallback intents, no literal
 * numeric domain values. Every chip's queueRoute is shipped by the
 * backend (the pinned "all" chip carries a typed noop).
 */
export function BucketFilterRow({
  filters,
  active,
  onChange,
  onAction,
}: BucketFilterRowProps) {
  if (!filters || filters.length === 0) {
    return (
      <EmptyBlock
        title="Action queues"
        hint="No active decision queues right now — everything is clear."
      />
    );
  }
  return (
    <div
      className="mb-6 flex flex-wrap items-center gap-2"
      data-testid="bucket-filter-row"
      role="group"
      aria-label="Decision queue filters"
    >
      {filters.map((filter) => {
        const isActive = filter.id === active;
        const isDisabled = filter.count === 0 && filter.id !== 'all';
        const handleClick: React.MouseEventHandler<HTMLButtonElement> = (e) => {
          if (isDisabled) return;
          if (e.metaKey || e.ctrlKey) {
            onAction(filter.queueRoute);
            return;
          }
          onChange(filter.id);
        };
        const handleContextMenu: React.MouseEventHandler<HTMLButtonElement> = (e) => {
          if (isDisabled) return;
          e.preventDefault();
          onAction(filter.queueRoute);
        };

        return (
          <button
            key={filter.id}
            type="button"
            data-testid={`bucket-filter-${filter.id}`}
            data-active={isActive ? 'true' : 'false'}
            aria-pressed={isActive}
            disabled={isDisabled}
            onClick={handleClick}
            onContextMenu={handleContextMenu}
            title={
              isDisabled
                ? 'No open items in this queue.'
                : 'Click to filter · Cmd-click or right-click to open the full queue in Pricing Studio.'
            }
            className={[
              'inline-flex items-center gap-2 rounded-full border px-3.5 py-1.5 transition-colors',
              'focus:outline-none focus:ring-2 focus:ring-[var(--rose)]/40',
              isActive
                ? 'border-[var(--rose)] bg-[var(--rose)] text-white shadow-[var(--shadow-card)]'
                : 'border-[var(--hairline)] bg-white text-[var(--ink)] hover:border-[var(--ink-2)]',
              isDisabled ? 'cursor-not-allowed opacity-50' : 'cursor-pointer',
            ].join(' ')}
          >
            <span
              className={[
                'text-[11px] font-semibold uppercase tracking-[0.18em]',
                isActive ? 'text-white/90' : 'text-[var(--muted)]',
              ].join(' ')}
            >
              {filter.label}
            </span>
            <span
              className={[
                'font-display text-[15px] font-bold leading-none tabular-nums',
                isActive ? 'text-white' : 'text-[var(--ink)]',
              ].join(' ')}
            >
              {filter.count}
            </span>
          </button>
        );
      })}
    </div>
  );
}
