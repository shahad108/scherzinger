import type { ReactNode } from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import { useMe } from '@/data/api/useMe';
import { useAuthStore } from '@/stores/authStore';

/**
 * Wrap protected layouts. Renders children only when /me succeeds; otherwise
 * navigates to /login while remembering where the user was headed.
 *
 * When VITE_DEFAULT_USER fixture is in play (mock mode), /me returns Frank
 * unconditionally so this component is essentially transparent.
 */
export function RequireAuth({ children }: { children: ReactNode }) {
  const location = useLocation();
  const me = useMe();
  const user = useAuthStore((s) => s.user);

  if (me.isLoading) {
    return (
      <div className="pz-page-load" aria-live="polite">
        Lade…
      </div>
    );
  }
  if (me.isError || !user) {
    const next = location.pathname + location.search;
    return <Navigate to={`/login?next=${encodeURIComponent(next)}`} replace />;
  }
  return <>{children}</>;
}
