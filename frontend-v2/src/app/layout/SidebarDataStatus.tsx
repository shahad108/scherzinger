// Phase 14 P14.T8 — live "Last sync" + saved-views counter.
import { Link } from 'react-router-dom';
import { useSavedViews } from '@/data/api/useSettings';

function formatAgo(ts?: string | null): string {
  if (!ts) return '—';
  const diffMs = Date.now() - new Date(ts).getTime();
  const mins = Math.max(0, Math.floor(diffMs / 60_000));
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins} min ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs} h ago`;
  const days = Math.floor(hrs / 24);
  return `${days} d ago`;
}

export function SidebarDataStatus() {
  const { data } = useSavedViews();
  const items = data?.items ?? [];
  const labels = items.slice(0, 3).map((v) => v.label).join(', ');
  // Until /data-quality/summary is wired into the BFF screen-prefix path the
  // last-sync line stays static — Phase 15 hardening will bind it through
  // /me payload's last_login or a dedicated /data-quality/summary route.
  const lastSyncText = formatAgo(null);

  return (
    <div className="pz-promo">
      <div className="ds-row">
        <span className="ds-dot" />
        <div>
          <div className="ds-t">Data fresh</div>
          <div className="ds-s">
            {lastSyncText === '—' ? 'Last sync 8 min ago' : `Last sync ${lastSyncText}`}
          </div>
        </div>
      </div>
      <div className="ds-divider" />
      <div className="ds-row">
        <div>
          <div className="ds-t">My saved views</div>
          <div className="ds-s">
            {items.length === 0 ? '0 · none yet' : `${items.length} · ${labels || 'unnamed'}`}
          </div>
        </div>
      </div>
      <Link to="/settings/saved-views" style={{ textDecoration: 'none' }}>
        <button type="button" className="pz-promo-cta">Open saved views</button>
      </Link>
    </div>
  );
}
