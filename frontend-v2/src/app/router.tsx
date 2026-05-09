import { createBrowserRouter, Navigate } from 'react-router-dom';
import { Shell } from './layout/Shell';
import { RequireAuth } from '@/features/auth/RequireAuth';
import LoginPage from '@/features/auth/Login';
import ActionCenterPage from '@/features/action-center';
import MarginPage from '@/features/margin-cockpit';
import QuotesPage from '@/features/quotes';
import ForecastingPage from '@/features/forecasting';
import PricingPage from '@/features/pricing-studio';
import AiPage from '@/features/ai-briefing';

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
        { path: 'action-center', element: <ActionCenterPage /> },
        { path: 'margin', element: <MarginPage /> },
        { path: 'quotes', element: <QuotesPage /> },
        { path: 'forecasting', element: <ForecastingPage /> },
        { path: 'pricing', element: <PricingPage /> },
        { path: 'ai', element: <AiPage /> },

        // Phase 10 / 11 placeholders. Till + Heiko screens proper land later;
        // for now redirect into Frank's space so a misclick doesn't 404.
        { path: 'md/overview', element: <Navigate to="/action-center" replace /> },
        { path: 'deal/inbox', element: <Navigate to="/quotes" replace /> },
      ],
    },
  ],
  { basename: import.meta.env.BASE_URL },
);
