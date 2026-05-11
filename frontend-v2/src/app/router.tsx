/* eslint-disable react-refresh/only-export-components -- router file
   intentionally co-locates lazy component definitions and the (non-component)
   `router` + `personaRoutes` exports. */
import { lazy, Suspense } from 'react';
import { createBrowserRouter, Navigate } from 'react-router-dom';
import { Shell } from './layout/Shell';
import { RequireAuth } from '@/features/auth/RequireAuth';
import LoginPage from '@/features/auth/Login';

/**
 * P15.T2 — bundle splitting. Each route's screen lives in its own chunk
 * loaded on demand; this drops the shipped initial bundle far below the
 * Action Center 220 KB gz budget.
 *
 * Login + the Shell layout stay in the main bundle so the first paint
 * after auth has no Suspense flicker.
 */
const ActionCenterPage = lazy(() => import('@/features/action-center'));
const MarginPage = lazy(() => import('@/features/margin-cockpit'));
const QuotesPage = lazy(() => import('@/features/quotes'));
const ForecastingPage = lazy(() => import('@/features/forecasting'));
const PricingPage = lazy(() => import('@/features/pricing-studio'));
const AiPage = lazy(() => import('@/features/ai-briefing'));
const SettingsLayout = lazy(() => import('@/features/settings/SettingsLayout'));
const ProfilePage = lazy(() => import('@/features/settings/ProfilePage'));
const PreferencesPage = lazy(() => import('@/features/settings/PreferencesPage'));
const SavedViewsPage = lazy(() => import('@/features/settings/SavedViewsPage'));
const DataQualityPage = lazy(() => import('@/features/settings/DataQualityPage'));
const ModelCardsPage = lazy(() => import('@/features/settings/ModelCardsPage'));
const MdOverviewPage = lazy(() => import('@/features/persona-overview/MdOverviewPage'));
const DealInboxPage = lazy(() => import('@/features/persona-overview/DealInboxPage'));
const NotificationsPage = lazy(() => import('@/features/settings/NotificationsPage'));
const NotesPage = lazy(() => import('@/features/settings/NotesPage'));

function RouteFallback() {
  return (
    <div className="w-full px-6 py-6 text-[13px] text-[var(--muted)]" aria-busy="true">
      …
    </div>
  );
}

function PersonaRouteUnavailable({ title, detail }: { title: string; detail: string }) {
  return (
    <div className="w-full px-6 py-8">
      <div className="max-w-3xl rounded-xl border border-[var(--hairline)] bg-white p-5 shadow-[var(--shadow)]">
        <h1 className="font-display text-xl font-bold text-[var(--ink)]">{title}</h1>
        <p className="mt-2 text-sm leading-relaxed text-[var(--muted)]">{detail}</p>
      </div>
    </div>
  );
}

const lazyRoute = (Component: React.ComponentType) => (
  <Suspense fallback={<RouteFallback />}>
    <Component />
  </Suspense>
);

/**
 * Per-persona default landing (Phase 2 P2.T9).
 *
 * Frank's screens are implemented today. Till and Heiko's persona routes
 * are scaffolded in Phase 10 / 11 and currently fall back to Frank-shaped
 * placeholders that won't be reachable for those users in production.
 */
export const personaRoutes = {
  frank: { default: '/action-center', prefix: '' },
  till: { default: '/md/overview', prefix: '/md' },
  heiko: { default: '/deal/inbox', prefix: '/deal' },
} as const;

export const router = createBrowserRouter(
  [
    { path: '/login', element: <LoginPage /> },
    {
      path: '/',
      element: (
        <RequireAuth>
          <Shell />
        </RequireAuth>
      ),
      children: [
        { index: true, element: <Navigate to="/action-center" replace /> },
        { path: 'action-center', element: lazyRoute(ActionCenterPage) },
        { path: 'margin', element: lazyRoute(MarginPage) },
        { path: 'quotes', element: lazyRoute(QuotesPage) },
        { path: 'forecasting', element: lazyRoute(ForecastingPage) },
        { path: 'pricing', element: lazyRoute(PricingPage) },
        { path: 'ai', element: lazyRoute(AiPage) },

        // Phase 14 — Settings + adjacent routes.
        {
          path: 'settings',
          element: lazyRoute(SettingsLayout),
          children: [
            { index: true, element: <Navigate to="/settings/profile" replace /> },
            { path: 'profile', element: lazyRoute(ProfilePage) },
            { path: 'preferences', element: lazyRoute(PreferencesPage) },
            { path: 'saved-views', element: lazyRoute(SavedViewsPage) },
            { path: 'data-quality', element: lazyRoute(DataQualityPage) },
            { path: 'model-cards', element: lazyRoute(ModelCardsPage) },
          ],
        },
        { path: 'notifications', element: lazyRoute(NotificationsPage) },
        { path: 'notes', element: lazyRoute(NotesPage) },

        // Phase 12 — Till MD + Heiko Sales read-only landing pages.
        { path: 'md/overview', element: lazyRoute(MdOverviewPage) },
        { path: 'deal/inbox', element: lazyRoute(DealInboxPage) },
      ],
    },
  ],
  { basename: import.meta.env.BASE_URL },
);
