import type { TrustTile } from '@/types';

export function TrustStrip({
  tiles,
  onTile,
}: {
  tiles: TrustTile[];
  onTile?: (tile: TrustTile) => void;
}) {
  return (
    <>
      <div className="mb-3">
        <h2 className="font-display text-lg font-bold tracking-tight text-[var(--ink)]">
          Model trust · transparency strip
        </h2>
        <p className="mt-0.5 text-xs text-[var(--muted)]">
          Click any tile for feature importance & training history.
        </p>
      </div>
      <div className="mb-6 grid grid-cols-2 gap-3 md:grid-cols-4" data-testid="ac-trust-strip">
        {tiles.map((t, idx) => (
          <button
            key={t.label}
            type="button"
            data-testid={`ac-trust-tile-${idx}`}
            onClick={() => onTile?.(t)}
            className="rounded-xl border border-[var(--hairline)] bg-white p-4 text-left shadow-[var(--shadow)] transition-all hover:-translate-y-0.5 hover:border-[var(--ink-2)] hover:shadow-[var(--shadow-md)]"
          >
            <div className="text-[10.5px] font-semibold uppercase tracking-wider text-[var(--muted)]">
              {t.label}
            </div>
            <div className="mt-1 font-display text-[28px] font-bold leading-none tabular-nums text-[var(--ink)]">
              {t.value}
            </div>
            <div className="mt-2 text-[11.5px] leading-relaxed text-[var(--muted)]">
              {t.caption}
            </div>
          </button>
        ))}
      </div>
    </>
  );
}
