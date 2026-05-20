// Filter scope: does NOT honor tier/family/cluster — composer returns global
// internal cost-component averages (material/fertigung/fixed/full mfg).
// Renders an unfiltered FilterScopeBadge when any page-level filter is active.
// (v2.2 Phase C audit, 2026-05-14)

import { useEffect, useMemo, useState } from 'react';
import { X } from 'lucide-react';
import {
  Area,
  AreaChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import type { FilterScope, InputCostTile, InputCostTrajectory as InputCostTrajectoryData } from '@/types/forecast';
import { FilterScopeBadge } from './FilterScopeBadge';

interface Props {
  data: InputCostTrajectoryData;
  filterScope?: FilterScope;
}

const MONTHS = [
  'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov',
  'Dec', 'Jan', 'Feb', 'Mar', 'Apr', 'May',
];

// Phase 4.5 audit fix: input cost tiles previously had `cursor=pointer` but no
// onClick. We now open a drawer with the synthesized 12-month trajectory.
// Real series live in the `commodity_benchmarks` / `market_series` parquet —
// wire that as a future improvement; the WoW direction here is anchored on
// the tile's reported value so the shape is at least honest about direction.
function tileSeries(tile: InputCostTile): { month: string; value: number }[] {
  const raw = String(tile.value).replace(/[^\d.,-]/g, '').replace(',', '.');
  const base = Number(raw) || 1;
  const arrow = tile.capRich.arrow;
  const slope = arrow.includes('↑') ? 0.012 : arrow.includes('↓') ? -0.012 : 0.0;
  return MONTHS.map((m, i) => {
    const months = i - (MONTHS.length - 1);
    const wobble = Math.sin((i / MONTHS.length) * Math.PI * 2) * base * 0.015;
    return {
      month: m,
      value: Number((base * (1 + slope * months) + wobble).toFixed(4)),
    };
  });
}

const TONE_COLOR: Record<string, string> = {
  red: 'var(--red)',
  green: 'var(--green)',
  amber: 'var(--amber)',
  'ink-3': 'var(--ink-3)',
};

function renderBold(text: string) {
  // Convert **bold** to <b>bold</b>
  const parts = text.split(/(\*\*[^*]+\*\*)/g);
  return parts.map((p, i) =>
    p.startsWith('**') && p.endsWith('**') ? (
      <b key={i} style={{ color: 'var(--ink)', fontWeight: 700 }}>
        {p.slice(2, -2)}
      </b>
    ) : (
      <span key={i}>{p}</span>
    ),
  );
}

export function InputCostTrajectory({ data, filterScope }: Props) {
  const { tiles, stress } = data;
  const [active, setActive] = useState<InputCostTile | null>(null);

  return (
    <>
      <div className="section-row">
        <div>
          <h2 className="flex items-center gap-2">
            Input cost trajectory · next 12 months
            <FilterScopeBadge unfiltered scope={filterScope} />
          </h2>
          <div className="sub">
            Your revenue forecasts are net of these inputs. Pass-through % = how much is
            contractually indexed; the rest is absorbed in margin.
          </div>
        </div>
        <span className="tag-chip">LME · VDMA · Bundesnetzagentur</span>
      </div>

      <div className="trust-grid">
        {tiles.map((t) => (
          <button
            type="button"
            className="trust-tile"
            key={t.label}
            data-testid={`input-cost-tile-${t.label}`}
            onClick={() => setActive(t)}
            style={{
              cursor: 'pointer',
              textAlign: 'left',
              background: 'transparent',
              border: 0,
              padding: 0,
              font: 'inherit',
              color: 'inherit',
            }}
          >
            <div className="lab">{t.label}</div>
            <div className="big">
              {t.value}
              <span style={{ fontSize: 12, color: 'var(--muted)', fontWeight: 500, letterSpacing: 0 }}>
                {t.unit}
              </span>
            </div>
            <div className="cap">
              <b style={{ color: TONE_COLOR[t.capRich.tone] }}>{t.capRich.arrow}</b> {t.capRich.main}{' '}
              <b>{t.capRich.rest}</b>
            </div>
          </button>
        ))}
      </div>

      <InputCostDrawer tile={active} onClose={() => setActive(null)} />

      <div className="signal-with-trend" style={{ marginTop: 14 }}>
        <div className="signal-pane">
          <div className="ttl">
            {stress.title}
            <span className="ttl-sub">— {stress.sub}</span>
          </div>
          <ul
            style={{
              margin: 0,
              padding: 0,
              listStyle: 'none',
              color: 'var(--ink-3)',
              fontSize: 12.5,
              lineHeight: 1.7,
            }}
          >
            {stress.bullets.map((b, i) => (
              <li key={i}>{renderBold(b)}</li>
            ))}
          </ul>
        </div>
        <div className="trend-pane">
          <div className="lab">{stress.centralLabel}</div>
          <div className="v" style={{ color: 'var(--red)' }}>
            {stress.centralValue}
          </div>
          <div style={{ fontSize: 11, color: 'var(--muted)', marginTop: 6, lineHeight: 1.4 }}>
            {stress.centralCaption}
          </div>
        </div>
      </div>
    </>
  );
}

interface DrawerProps {
  tile: InputCostTile | null;
  onClose: () => void;
}

function InputCostDrawer({ tile, onClose }: DrawerProps) {
  useEffect(() => {
    if (!tile) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [tile, onClose]);

  const series = useMemo(() => (tile ? tileSeries(tile) : []), [tile]);
  if (!tile) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex justify-end"
      role="dialog"
      aria-modal="true"
      data-testid="input-cost-drawer"
    >
      <button
        type="button"
        aria-label="Dismiss"
        onClick={onClose}
        className="absolute inset-0 bg-black/30"
      />
      <aside
        className="relative ml-auto h-full w-full max-w-[480px] overflow-y-auto bg-white shadow-2xl border-l-4 border-[var(--hairline)]"
      >
        <header className="sticky top-0 flex items-start justify-between border-b border-[var(--border)] bg-white px-5 py-4">
          <div>
            <div className="text-[10.5px] font-semibold uppercase tracking-wide text-[var(--muted)]">
              Input cost · 12 months
            </div>
            <h2 className="font-display text-[18px] font-bold tracking-tight text-[var(--ink)]">
              {tile.label}
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
              <b style={{ color: TONE_COLOR[tile.capRich.tone] }}>{tile.capRich.arrow}</b>{' '}
              {tile.capRich.main} {tile.capRich.rest}
            </span>
          </section>

          <section>
            <h3 className="mb-2 text-[12px] font-semibold uppercase tracking-wide text-[var(--muted)]">
              Last 12 months (synthetic anchor)
            </h3>
            <div style={{ height: 180 }}>
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={series} margin={{ top: 8, right: 16, left: 0, bottom: 0 }}>
                  <CartesianGrid stroke="#eaedf1" vertical={false} />
                  <XAxis dataKey="month" stroke="#7d8693" tick={{ fontSize: 11 }} tickLine={false} />
                  <YAxis
                    stroke="#7d8693"
                    tick={{ fontSize: 11 }}
                    tickLine={false}
                    axisLine={false}
                    domain={['auto', 'auto']}
                    width={56}
                  />
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
              Anchored at the current value with the WoW direction; wire to
              <code className="mx-1">commodity_benchmarks</code> when the dedicated per-tile
              series endpoint ships.
            </div>
          </section>
        </div>
      </aside>
    </div>
  );
}
