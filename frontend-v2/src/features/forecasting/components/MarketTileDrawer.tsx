// Wishlist #3 — Drawer with series detail when a market tile is clicked.
//
// Renders the tile's headline value, WoW/MoM/YoY context, and a synthetic
// 12-month series chart (real series come from market_series.parquet — wire
// when the corresponding endpoint ships).

import { X } from 'lucide-react';
import { useEffect, useMemo } from 'react';
import {
  Area,
  AreaChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import type { MarketTile } from '@/types/forecast';

interface Props {
  tile: MarketTile | null;
  open: boolean;
  onClose: () => void;
}

const MONTHS = [
  'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov',
  'Dec', 'Jan', 'Feb', 'Mar', 'Apr', 'May',
];

function syntheticSeries(tile: MarketTile): { month: string; value: number }[] {
  // 12 monthly points anchored at the tile's current value. Use the WoW
  // direction as the slope hint; add a small seasonal wobble.
  const slope = tile.wowPct / 4; // a rough monthly trajectory proxy
  const base = tile.value;
  return MONTHS.map((m, i) => {
    const monthsFromNow = i - (MONTHS.length - 1);
    const seasonalWobble = Math.sin((i / MONTHS.length) * Math.PI * 2) * (Math.abs(base) * 0.02);
    return {
      month: m,
      value: Number(((base * (1 + (slope * monthsFromNow) / 100)) + seasonalWobble).toFixed(4)),
    };
  });
}

export function MarketTileDrawer({ tile, open, onClose }: Props) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  const series = useMemo(() => (tile ? syntheticSeries(tile) : []), [tile]);
  if (!open || !tile) return null;

  const toneClass =
    tile.tone === 'red'
      ? 'border-[var(--red,#9a3232)]'
      : tile.tone === 'amber'
        ? 'border-[var(--amber,#b59300)]'
        : tile.tone === 'green'
          ? 'border-[var(--green,#2e7c5a)]'
          : 'border-[var(--hairline)]';

  return (
    <div
      className="fixed inset-0 z-50 flex justify-end"
      role="dialog"
      aria-modal="true"
      data-testid="market-tile-drawer"
    >
      <button
        type="button"
        aria-label="Dismiss"
        onClick={onClose}
        className="absolute inset-0 bg-black/30"
      />
      <aside
        className={`relative ml-auto h-full w-full max-w-[480px] overflow-y-auto bg-white shadow-2xl border-l-4 ${toneClass}`}
      >
        <header className="sticky top-0 flex items-start justify-between border-b border-[var(--border)] bg-white px-5 py-4">
          <div>
            <div className="text-[10.5px] font-semibold uppercase tracking-wide text-[var(--muted)]">
              Market series
            </div>
            <h2 className="font-display text-[18px] font-bold tracking-tight text-[var(--ink)]">
              {tile.name}
            </h2>
          </div>
          <button
            type="button"
            aria-label="Close"
            onClick={onClose}
            className="grid h-8 w-8 place-items-center rounded-md text-[var(--muted)] hover:bg-[var(--surface-sunken)]"
          >
            <X size={16} />
          </button>
        </header>

        <div className="p-5 space-y-5">
          <section className="flex items-baseline gap-3 tabular-nums">
            <span className="font-display text-[28px] font-bold text-[var(--ink)]">
              {tile.value}
            </span>
            <span className="text-[12px] text-[var(--muted)]">{tile.unit}</span>
            <span className="tag-chip">
              {tile.wowPct >= 0 ? '↑' : '↓'} {tile.wowPct >= 0 ? '+' : ''}
              {tile.wowPct.toFixed(1)}% WoW
            </span>
          </section>

          <section className="text-[12.5px] text-[var(--ink-2)]">{tile.context}</section>

          <section>
            <h3 className="mb-2 text-[12px] font-semibold uppercase tracking-wide text-[var(--muted)]">
              Last 12 months (synthetic)
            </h3>
            <div style={{ height: 180 }}>
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={series} margin={{ top: 8, right: 16, left: 0, bottom: 0 }}>
                  <CartesianGrid stroke="#eaedf1" vertical={false} />
                  <XAxis dataKey="month" stroke="#7d8693" tick={{ fontSize: 11 }} tickLine={false} />
                  <YAxis stroke="#7d8693" tick={{ fontSize: 11 }} tickLine={false} axisLine={false} domain={['auto', 'auto']} width={56} />
                  <Tooltip
                    contentStyle={{
                      background: 'var(--surface)',
                      border: '1px solid var(--border)',
                      borderRadius: 11,
                      fontSize: 12,
                    }}
                  />
                  <Area type="monotone" dataKey="value" stroke="#3e5d80" fill="rgba(62,93,128,0.18)" />
                </AreaChart>
              </ResponsiveContainer>
            </div>
            <div className="mt-1 text-[10.5px] text-[var(--muted)]">
              Anchored at the current value; slope inferred from WoW. Wire to
              <code className="mx-1">market_series.parquet</code> when the dedicated endpoint ships.
            </div>
          </section>
        </div>
      </aside>
    </div>
  );
}
