// PageHead — Phase 4.5 audit fixes:
//  • Title now reflects the active forecast mode (Revenue / Margin / Volume)
//  • Subtitle shows the horizon ("Next 3/6/12 Months")
//  • Header filter pills (Tier / Family / Cluster lens) now read + write URL
//    params so they actually refetch downstream payloads.

import { useMemo, useRef, useState, useEffect } from 'react';
import { useSearchParams } from 'react-router-dom';
import type {
  ForecastHero,
  ForecastHeader,
  ForecastMethodology,
  ForecastMode,
} from '@/types/forecast';

interface Props {
  header: ForecastHeader;
  methodology?: ForecastMethodology;
  hero?: ForecastHero;
}

const TITLE_BY_MODE: Record<ForecastMode, string> = {
  revenue: 'Revenue Forecast',
  margin: 'Margin Forecast',
  volume: 'Volume Forecast',
};

const TIERS: { value: 'A' | 'B' | 'C' | 'D'; label: string }[] = [
  { value: 'A', label: 'A · Strategic' },
  { value: 'B', label: 'B · Standard' },
  { value: 'C', label: 'C · Volume' },
  { value: 'D', label: 'D · Problematic' },
];

// Phase 4.5 audit fix #7: Family ≠ Cluster. The cluster filter shows
// commodity_group taxonomy (BKAES/BKAGG/BKAIZ/MBDIV). Family is product
// family — for now show a placeholder taxonomy until the BFF returns a
// real list via `meta.filterOptions.families`.
// TODO(backend): wire to real product families from products.business_unit
// or a dedicated families taxonomy.
const FAMILIES: { value: string; label: string }[] = [
  { value: 'standard', label: 'Standard' },
  { value: 'specials', label: 'Specials' },
  { value: 'locked', label: 'Locked' },
];

const CLUSTERS: { value: string; label: string }[] = [
  { value: 'BKAES', label: 'BKAES' },
  { value: 'BKAGG', label: 'BKAGG' },
  { value: 'BKAIZ', label: 'BKAIZ' },
  { value: 'MBDIV', label: 'MBDIV' },
];

interface FilterMenuProps {
  label: string;
  paramKey: 'tier' | 'family' | 'cluster';
  options: { value: string; label: string }[];
}

function FilterMenu({ label, paramKey, options }: FilterMenuProps) {
  const [params, setParams] = useSearchParams();
  const [open, setOpen] = useState(false);
  const current = params.get(paramKey);
  const containerRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (!containerRef.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', onDown);
    return () => document.removeEventListener('mousedown', onDown);
  }, [open]);

  const setValue = (v: string | null) => {
    const next = new URLSearchParams(params);
    if (v === null) next.delete(paramKey);
    else next.set(paramKey, v);
    setParams(next, { replace: true });
    setOpen(false);
  };

  return (
    <div ref={containerRef} style={{ position: 'relative' }}>
      <button
        type="button"
        className="head-pill"
        data-testid={`header-filter-${paramKey}`}
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
      >
        {label} · {current ?? 'All'} ▾
      </button>
      {open && (
        <div
          role="menu"
          style={{
            position: 'absolute',
            top: 'calc(100% + 4px)',
            right: 0,
            zIndex: 30,
            minWidth: 180,
            background: 'var(--surface, #fff)',
            border: '1px solid var(--border)',
            borderRadius: 10,
            boxShadow: 'var(--shadow-pop, 0 8px 24px rgba(0,0,0,0.12))',
            padding: 4,
            fontSize: 12,
          }}
        >
          <button
            type="button"
            role="menuitem"
            onClick={() => setValue(null)}
            data-testid={`header-filter-${paramKey}-all`}
            style={{
              display: 'block',
              width: '100%',
              textAlign: 'left',
              padding: '6px 10px',
              borderRadius: 6,
              background: current === null ? 'var(--rose-bg)' : 'transparent',
              border: 'none',
              color: 'var(--ink-2)',
              fontWeight: 600,
              cursor: 'pointer',
            }}
          >
            All
          </button>
          {options.map((o) => {
            const isActive = current === o.value;
            return (
              <button
                key={o.value}
                role="menuitem"
                type="button"
                data-testid={`header-filter-${paramKey}-${o.value}`}
                onClick={() => setValue(o.value)}
                style={{
                  display: 'block',
                  width: '100%',
                  textAlign: 'left',
                  padding: '6px 10px',
                  borderRadius: 6,
                  background: isActive ? 'var(--rose-bg)' : 'transparent',
                  border: 'none',
                  color: isActive ? 'var(--rose-deep)' : 'var(--ink-2)',
                  fontWeight: 600,
                  cursor: 'pointer',
                }}
              >
                {o.label}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}

export function PageHead({ header, methodology, hero }: Props) {
  const [params] = useSearchParams();
  const mode = (params.get('mode') as ForecastMode | null) ?? 'revenue';
  const horizon = Number(params.get('horizon')) || 12;

  const title = useMemo(
    () => `${TITLE_BY_MODE[mode]} — Next ${horizon} Months`,
    [mode, horizon],
  );

  // Phase 4.5 audit fix #1: replace hardcoded backend header.stats values
  // ("Updated Mon 06:14", "Band +€8K WoW") with derived honest values.
  const stats = useMemo(() => {
    const out: { label: string; value: string }[] = [];

    // "Updated" → real MAX(invoices.date) from methodology assumptions.
    const dataThrough = methodology?.assumptions?.find(
      (a) => a.label === 'Data-through',
    )?.value;
    if (dataThrough) {
      out.push({ label: 'Updated', value: dataThrough });
    }

    // "Band" → top mover from hero. Show the value (e.g. "+€38.4K WoW")
    // alongside the customer label. Hide entirely if no movers exist.
    const topMover = hero?.movers?.[0];
    if (topMover) {
      out.push({ label: 'Top mover', value: `${topMover.label} ${topMover.value}` });
    }

    // Fall back to whatever the backend sent if neither override fired.
    if (out.length === 0) return header.stats;
    return out;
  }, [methodology, hero, header.stats]);

  // Header.filters from the backend is now treated as a hint only — we render
  // the canonical (Tier / Family / Cluster) trio so the dropdowns always work
  // regardless of what the BFF labels them.
  return (
    <>
      <div className="crumbs">
        <span>Cockpit</span>
        <span className="sep">/</span>
        <span>Pricing Analyst · Frank</span>
        <span className="sep">/</span>
        <b>Forecast</b>
      </div>

      <div className="page-head">
        <div>
          <h1 data-testid="forecast-title">{title}</h1>
          <div className="page-sub">
            <span className="sub-pill">{header.subPill}</span>
            {stats.map((s) => (
              <span key={s.label} className="sub-stat" data-testid={`page-head-stat-${s.label.toLowerCase().replace(/\s+/g, '-')}`}>
                <b>{s.label}</b> {s.value}
              </span>
            ))}
            <span className="sub-stat">{header.modeLabel}</span>
          </div>
        </div>
        <div className="head-actions">
          <FilterMenu label="Tier" paramKey="tier" options={TIERS} />
          <FilterMenu label="Family" paramKey="family" options={FAMILIES} />
          <FilterMenu label="Cluster lens" paramKey="cluster" options={CLUSTERS} />
          {/* Phase 4.5 audit fix #6: removed duplicate dead "Generate forecast
              briefing →" header pill. The working BriefingButton component is
              rendered just below the MarketDirectionStrip and opens the modal. */}
        </div>
      </div>
    </>
  );
}
