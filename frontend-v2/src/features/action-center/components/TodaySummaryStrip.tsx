/**
 * TodaySummaryStrip — 5-tile KPI strip above MovableHero.
 *
 * Plan ref: docs/ACTION_CENTER_PLAN.md §2.3.
 *
 * - Every value comes from ``data.summary.tiles[i]`` — no literal domain
 *   numbers and no hardcoded labels.
 * - Every tile carries a typed ``ActionIntent`` so click handling routes
 *   through useUiAction (scroll / drawer / route) without local fallbacks.
 * - Tones map to existing Pryzm 2026 tokens (no raw hex).
 */
import type { SummaryTile } from '@/types';
import type { ActionIntent } from '@/types/uiActions';

interface Props {
  tiles: SummaryTile[];
  onAction: (intent: ActionIntent) => void;
}

const TONE_COLOR: Record<string, string> = {
  positive: 'var(--green, #047857)',
  negative: 'var(--red, #B91C1C)',
  warning: 'var(--amber, #B45309)',
  neutral: 'var(--muted)',
};

const TONE_BG: Record<string, string> = {
  positive: 'var(--green-bg, #ECFDF5)',
  negative: 'var(--red-bg, #FEF2F2)',
  warning: 'var(--amber-bg, #FEF3C7)',
  neutral: 'var(--surface-soft)',
};

function DeltaChip({ delta, direction, tone }: { delta: string; direction: 'up' | 'down' | 'flat'; tone: string }) {
  const color = TONE_COLOR[tone] ?? TONE_COLOR.neutral;
  const bg = TONE_BG[tone] ?? TONE_BG.neutral;
  const arrow = direction === 'down' ? 'M6 2v8M6 10L2.5 6.5M6 10L9.5 6.5' : direction === 'up' ? 'M6 10V2M6 2L2.5 5.5M6 2L9.5 5.5' : 'M2.5 6h7';
  return (
    <span
      className="inline-flex items-center gap-1.5 rounded-md text-[11.5px] font-semibold tabular-nums"
      style={{ background: bg, color, padding: '3px 7px' }}
    >
      <svg viewBox="0 0 12 12" width={10} height={10} fill="none" aria-hidden>
        <path d={arrow} stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
      {delta}
    </span>
  );
}

export function TodaySummaryStrip({ tiles, onAction }: Props) {
  return (
    <div className="mb-6 grid grid-cols-1 gap-4 md:grid-cols-3 lg:grid-cols-5">
      {tiles.map((tile) => {
        const locked = tile.locked || tile.value == null;
        const displayValue = locked ? '—' : tile.value;
        const handleClick = () => {
          if (!tile.action) return;
          onAction(tile.action);
        };

        return (
          <button
            key={tile.id}
            type="button"
            onClick={handleClick}
            disabled={!tile.action}
            aria-label={tile.label}
            data-testid={`summary-tile-${tile.id}`}
            className="group rounded-2xl border border-[var(--hairline)] bg-white p-5 text-left shadow-[var(--shadow-card)] transition-all hover:-translate-y-0.5 hover:border-[var(--ink-2)] hover:shadow-[var(--shadow-md)] focus:outline-none focus:ring-2 focus:ring-[var(--rose)]/40 disabled:cursor-not-allowed disabled:opacity-60"
          >
            <div className="flex items-center justify-between">
              <span className="text-[11px] font-semibold uppercase tracking-[0.18em] text-[var(--muted)]">
                {tile.label}
              </span>
              {locked && (
                <span
                  className="inline-flex items-center gap-1 rounded-full border border-[var(--amber, #F59E0B)] text-[10px] font-semibold uppercase tracking-wider"
                  style={{ background: 'color-mix(in srgb, var(--amber, #F59E0B) 12%, white)', color: 'var(--amber, #B45309)', padding: '2px 6px' }}
                  aria-label="Locked tile"
                  data-testid={`summary-tile-${tile.id}-lock`}
                >
                  <svg viewBox="0 0 10 12" width={9} height={11} fill="none" aria-hidden>
                    <rect x="1.5" y="5" width="7" height="6" rx="1" stroke="currentColor" strokeWidth="1.2" />
                    <path d="M3 5V3.5a2 2 0 1 1 4 0V5" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" />
                  </svg>
                  Locked
                </span>
              )}
            </div>
            <div className="mt-3 font-display text-[30px] font-bold leading-none tabular-nums text-[var(--ink)]">
              {displayValue}
            </div>
            {tile.delta && !locked && (
              <div className="mt-2.5">
                <DeltaChip
                  delta={tile.delta}
                  direction={tile.deltaDirection ?? 'flat'}
                  tone={tile.tone ?? 'neutral'}
                />
              </div>
            )}
          </button>
        );
      })}
    </div>
  );
}
