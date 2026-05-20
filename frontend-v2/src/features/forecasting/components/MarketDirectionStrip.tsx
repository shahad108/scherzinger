// Phase 7 — Horizontal strip of curated market tiles.

import { useState } from 'react';
import type { MarketDirection, MarketTile } from '@/types/forecast';
import { MarketTileDrawer } from './MarketTileDrawer';

interface Props {
  data: MarketDirection;
}

export function MarketDirectionStrip({ data }: Props) {
  const [active, setActive] = useState<MarketTile | null>(null);
  return (
    <section className="mb-4" data-testid="market-direction-strip">
      <div className="rounded-[14px] border border-[var(--border)] bg-white p-3">
        <div className="mb-2 flex items-center justify-between">
          <h2 className="text-[13px] font-semibold uppercase tracking-wide text-[var(--muted)]">
            External market direction
          </h2>
          <span className="tag-chip">{data.digest.wow}</span>
        </div>
        <ul className="grid grid-cols-2 gap-2 md:grid-cols-4 lg:grid-cols-8">
          {data.tiles.map((tile) => {
            const tone =
              tile.tone === 'red'
                ? 'border-[var(--red,#9a3232)]'
                : tile.tone === 'amber'
                  ? 'border-[var(--amber,#b59300)]'
                  : tile.tone === 'green'
                    ? 'border-[var(--green,#2e7c5a)]'
                    : 'border-[var(--hairline)]';
            // DATA-AUDIT pass-2 D14 — wowPct may be null when the prior
            // period is below the smoothing threshold (near-zero denominator).
            // Render "n/a" instead of crashing on null.toFixed.
            const wowAvailable =
              typeof tile.wowPct === 'number' && Number.isFinite(tile.wowPct);
            const arrow = !wowAvailable
              ? '–'
              : tile.wowPct! > 0
                ? '↑'
                : tile.wowPct! < 0
                  ? '↓'
                  : '→';
            const period = tile.periodLabel ?? 'WoW';
            const fallbackLabel =
              tile.wowLabel ?? `n/a · insufficient prior period`;
            return (
              <li key={tile.name}>
                <button
                  type="button"
                  data-testid={`market-tile-${tile.name.toLowerCase().replace(/\W+/g, '-')}`}
                  title={tile.context}
                  onClick={() => setActive(tile)}
                  className={`w-full text-left rounded-md border-l-4 ${tone} border border-[var(--hairline)] bg-[var(--surface-soft)] p-2 hover:bg-white hover:shadow-sm focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--rose-deep)]`}
                >
                  <div className="text-[10.5px] font-semibold uppercase tracking-wide text-[var(--muted)] line-clamp-1">
                    {tile.name}
                  </div>
                  <div className="mt-0.5 font-display text-[15px] font-bold tabular-nums text-[var(--ink)]">
                    {tile.value ?? '—'} <span className="text-[10.5px] font-semibold text-[var(--muted)]">{tile.unit}</span>
                  </div>
                  <div className="text-[10.5px] text-[var(--muted)]">
                    {wowAvailable
                      ? `${arrow} ${tile.wowPct! >= 0 ? '+' : ''}${tile.wowPct!.toFixed(1)}% ${period}`
                      : `${arrow} ${fallbackLabel}`}
                  </div>
                  {/* DATA-AUDIT-2026-05-17 defect #11 — surface the
                      synthetic-for-demo (or any indicator) disclosure
                      consistently across ALL tiles, not just the first. */}
                  {tile.indicator ? (
                    <div
                      data-testid={`market-tile-indicator-${tile.name.toLowerCase().replace(/\W+/g, '-')}`}
                      className={`mt-1 inline-flex items-center rounded-full px-1.5 py-0.5 text-[9.5px] font-semibold uppercase tracking-wide ${
                        tile.indicator.startsWith('⚠')
                          ? 'bg-amber-50 text-amber-700'
                          : 'bg-[var(--surface-soft)] text-[var(--ink-3)]'
                      }`}
                      title={tile.indicator}
                    >
                      {tile.indicator}
                    </div>
                  ) : null}
                </button>
              </li>
            );
          })}
        </ul>
      </div>
      <MarketTileDrawer tile={active} open={!!active} onClose={() => setActive(null)} />
    </section>
  );
}
