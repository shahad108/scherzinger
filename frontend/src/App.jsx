import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { UserProvider } from './context/UserContext';
import { UIProvider } from './context/UIContext';
import { ChatProvider } from './context/ChatContext';
import { LanguageProvider } from './context/LanguageContext';
import { AiContextProvider } from './hooks/useAiContext';
import { MeasuresProvider } from './hooks/useMeasures';
import { isAuthenticated } from './utils/auth';
import Layout from './components/Layout';
import DashboardOverviewV2 from './pages/DashboardOverviewV2';
import RevenueMargins from './pages/RevenueMargins';
import ProductsSKUs from './pages/ProductsSKUs';
import Customers from './pages/Customers';
import Forecasting from './pages/Forecasting';
import PricingFX from './pages/PricingFX';
import MLAnalytics from './pages/MLAnalytics';
import AIInsights from './pages/AIInsights';
import Measures from './pages/Measures';
import Login from './pages/Login';
import AdminLayout from './components/admin/AdminLayout';
import AdminCommandCenter from './pages/admin/AdminCommandCenter';
import AdminPageAnalytics from './pages/admin/AdminPageAnalytics';
import AdminInteractions from './pages/admin/AdminInteractions';
import AdminChatIntel from './pages/admin/AdminChatIntel';
import AdminSessions from './pages/admin/AdminSessions';
import AdminHeatmaps from './pages/admin/AdminHeatmaps';
import AdminAIInsights from './pages/admin/AdminAIInsights';

function ProtectedRoute({ children }) {
  if (!isAuthenticated()) {
    return <Navigate to="/login" replace />;
  }
  return children;
}

export default function App() {
  return (
    <LanguageProvider>
    <UserProvider>
      <UIProvider>
        <ChatProvider>
          <AiContextProvider>
          <MeasuresProvider>
          <BrowserRouter basename={import.meta.env.BASE_URL}>
            <Routes>
              <Route path="/login" element={<Login />} />
              <Route path="/admin" element={<ProtectedRoute><AdminLayout /></ProtectedRoute>}>
                <Route index element={<AdminCommandCenter />} />
                <Route path="pages" element={<AdminPageAnalytics />} />
                <Route path="interactions" element={<AdminInteractions />} />
                <Route path="chat" element={<AdminChatIntel />} />
                <Route path="sessions" element={<AdminSessions />} />
                <Route path="heatmaps" element={<AdminHeatmaps />} />
                <Route path="insights" element={<AdminAIInsights />} />
              </Route>
              <Route element={<ProtectedRoute><Layout /></ProtectedRoute>}>
                <Route path="/" element={<DashboardOverviewV2 />} />
                <Route path="/revenue" element={<RevenueMargins />} />
                <Route path="/products" element={<ProductsSKUs />} />
                <Route path="/customers" element={<Customers />} />
                <Route path="/forecasting" element={<Forecasting />} />
                <Route path="/pricing" element={<PricingFX />} />
                <Route path="/pricing-fx" element={<Navigate to="/pricing" replace />} />
                <Route path="/ml-analytics" element={<MLAnalytics />} />
                <Route path="/ai-insights" element={<AIInsights />} />
                <Route path="/measures" element={<Measures />} />
              </Route>
            </Routes>
          </BrowserRouter>
          </MeasuresProvider>
          </AiContextProvider>
        </ChatProvider>
      </UIProvider>
    </UserProvider>
    </LanguageProvider>
  );
}
