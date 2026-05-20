// NextCycleMovesStrip — 3-5 ranked recommendations tied to the current
// forecast view, each stamped with the source signal that drove the
// recommendation. Click "Open" → routes through useUiAction() so the
// global ActionFeedback drawer host opens with the matching form
// (partial_accept / queue_renewal / …) populated from the move's
// actionIntent.payload.
//
// Closes the diagnostic → action gap the v2 review called out. Without
// this strip, Frank has to leave the page to act.
//
// v2.2 Phase B: replaced the no-op `forecast:action-intent` window event
// with a direct useUiAction() call. The intent shape comes from
// `mapForecastActionIntent()`.

import { ArrowRight } from 'lucide-react';
import type { NextMove } from '@/types/forecast';
import { useUiAction } from '@/hooks/useUiAction';
import { mapForecastActionIntent } from '../lib/mapActionIntent';

interface Props {
  moves: NextMove[] | undefined;
}

function formatEur(value: number): string {
  if (Math.abs(value) >= 1_000_000) return `${(value / 1_000_000).toFixed(1)}M €`;
  if (Math.abs(value) >= 1_000) return `${Math.round(value / 1_000)}k €`;
  return `${Math.round(value)} €`;
}

export function NextCycleMovesStrip({ moves }: Props) {
  const runAction = useUiAction();
  if (!moves || moves.length === 0) return null;
  return (
    <section data-testid="next-cycle-moves-strip" className="mb-4">
      <header className="mb-2 flex items-baseline justify-between">
        <div>
          <div className="text-[10.5px] font-semibold uppercase tracking-wide text-[var(--muted)]">Act this cycle</div>
          <div className="font-display text-[16px] font-bold tracking-tight">Top {moves.length} moves tied to the current forecast</div>
        </div>
      </header>
      <div
        role="region"
        aria-label={`Top ${moves.length} recommended moves — scroll horizontally to view all`}
        tabIndex={0}
        className="flex gap-3 overflow-x-auto pb-2 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--rose-deep)]"
      >
        {moves.map((move) => (
          <article
            key={move.id}
            data-testid="next-cycle-move-card"
            className="flex w-[320px] shrink-0 flex-col justify-between rounded-[12px] border border-[var(--hairline)] bg-white p-4 shadow-[0_1px_2px_rgba(20,20,28,0.04)]"
          >
            <div>
              <div className="flex items-center justify-between">
                <span className="inline-flex h-5 w-5 items-center justify-center rounded-full bg-[var(--rose-bg)] text-[10.5px] font-bold text-[var(--rose-deep)]">
                  {move.rank}
                </span>
                <span className="text-[11px] font-semibold text-[var(--ink)]">{formatEur(move.forecastImpactEur)}</span>
              </div>
              <h3 className="mt-2 font-display text-[14px] font-bold tracking-tight text-[var(--ink)]">{move.headline}</h3>
              <p className="mt-1 text-[11.5px] text-[var(--muted)]">Driven by: {move.sourceSignal}</p>
            </div>
            <button
              type="button"
              onClick={() => runAction(mapForecastActionIntent(move))}
              className="mt-3 inline-flex items-center justify-center gap-1 self-end rounded-md bg-[var(--rose-deep)] px-3 py-1.5 text-[12px] font-semibold text-white hover:opacity-90"
            >
              Open <ArrowRight size={12} />
            </button>
          </article>
        ))}
      </div>
    </section>
  );
}
