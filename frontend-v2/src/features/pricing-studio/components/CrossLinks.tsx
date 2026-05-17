// Pricing Studio v3 / Phase 11 — Cross-link pills.
//
// Each pill navigates to the canonical destination for the current SKU /
// cluster, attaching ?source=studio so the destination surface can render a
// "back to Studio" affordance.

import { useNavigate, useSearchParams } from 'react-router-dom';
import type { CrossLink } from '@/types/studio';

interface Props {
  links: CrossLink[];
  /** Active SKU; passed through as `?aid=` on destinations that scope to one. */
  aid?: string | null;
  /** Active cluster; passed through to forecasting deep links. */
  cluster?: string | null;
}

const ROUTE_FOR_LABEL: Record<string, string> = {
  // Canonical labels coming from the BFF.
  'Margin Cockpit': '/margin',
  'Forecasting': '/forecasting',
  'Action Center': '/action-center',
  'Quotes': '/quotes',
};

// Short-key aliases the BFF uses on `target` (e.g. crossLinks[].target).
// Keeps the seed terse while still resolving to canonical app routes.
const ROUTE_FOR_TARGET_KEY: Record<string, string> = {
  action: '/action-center',
  'action-center': '/action-center',
  forecast: '/forecasting',
  forecasting: '/forecasting',
  quotes: '/quotes',
  margin: '/margin',
  'margin-cockpit': '/margin',
};

function destinationFor(
  link: CrossLink,
  aid: string | null | undefined,
  cluster: string | null | undefined,
): string | null {
  // Explicit `target` from the BFF wins if it's a relative app path.
  if (link.target && link.target.startsWith('/')) {
    const url = new URL(link.target, 'http://x');
    url.searchParams.set('source', 'studio');
    return `${url.pathname}${url.search}`;
  }
  // Or a short-key on `target` ("action" / "forecast" / "quotes" / "margin").
  const base =
    (link.target && ROUTE_FOR_TARGET_KEY[link.target.toLowerCase()]) ||
    ROUTE_FOR_LABEL[link.label];
  if (!base) return null;
  const sp = new URLSearchParams();
  if (base === '/forecasting') {
    if (cluster) sp.set('cluster', cluster);
  } else if (aid) {
    sp.set('aid', aid);
  }
  sp.set('source', 'studio');
  return `${base}?${sp.toString()}`;
}

export function CrossLinks({ links, aid, cluster }: Props) {
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const fallbackAid = aid ?? params.get('aid');
  const fallbackCluster = cluster ?? params.get('cluster');

  return (
    <div className="studio-xlinks" data-testid="cross-links">
      <span className="ftxt">Cross-links →</span>
      <div className="links">
        {links.map((l) => {
          const href = destinationFor(l, fallbackAid, fallbackCluster);
          const disabled = href === null;
          return (
            <button
              key={l.label}
              type="button"
              className="head-pill"
              data-testid={`cross-link-${l.label.toLowerCase().replace(/\s+/g, '-')}`}
              aria-disabled={disabled}
              disabled={disabled}
              onClick={() => {
                if (href) navigate(href);
              }}
              title={
                disabled
                  ? `${l.label} — destination not yet implemented`
                  : `Go to ${l.label}`
              }
            >
              {l.label}
              {disabled && (
                <span
                  className="ml-1 text-[10px] uppercase tracking-wider text-stone-400"
                  data-testid="cross-link-todo"
                >
                  TODO
                </span>
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
}
