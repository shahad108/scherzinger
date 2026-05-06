import { createBrowserRouter, Navigate } from 'react-router-dom';
import { Shell } from './layout/Shell';
import ActionCenterPage from '@/features/action-center';
import MarginPage from '@/features/margin-cockpit';
import QuotesPage from '@/features/quotes';
import ForecastingPage from '@/features/forecasting';
import PricingPage from '@/features/pricing-studio';
import AiPage from '@/features/ai-briefing';

export const router = createBrowserRouter(
  [
    {
      path: '/',
      element: <Shell />,
      children: [
        { index: true, element: <Navigate to="/action-center" replace /> },
        { path: 'action-center', element: <ActionCenterPage /> },
        { path: 'margin', element: <MarginPage /> },
        { path: 'quotes', element: <QuotesPage /> },
        { path: 'forecasting', element: <ForecastingPage /> },
        { path: 'pricing', element: <PricingPage /> },
        { path: 'ai', element: <AiPage /> },
      ],
    },
  ],
  { basename: import.meta.env.BASE_URL },
);
