import type { ReactNode } from 'react';
import { hasPermission, useAuthStore } from '@/stores/authStore';

interface Props {
  name: string;
  children: ReactNode;
  fallback?: ReactNode;
}

/**
 * Render `children` only when the logged-in user has the named permission.
 * Otherwise render `fallback` (default: nothing).
 *
 * Use this for action buttons, persona tabs, and any UI that gates on the
 * RBAC matrix. Do NOT check `useAuthStore` directly in feature code.
 */
export function RequirePermission({ name, children, fallback = null }: Props) {
  const user = useAuthStore((s) => s.user);
  if (!hasPermission(user, name)) return <>{fallback}</>;
  return <>{children}</>;
}
