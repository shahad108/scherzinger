import { useState, useEffect, useCallback } from 'react';
import { Outlet, useLocation, useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'motion/react';
import { Loader, LayoutDashboard } from 'lucide-react';
import AdminSidebar from './AdminSidebar';
import AdminHeader from './AdminHeader';

const PAGE_TITLES = {
  '/admin': 'Command Center',
  '/admin/pages': 'Page Analytics',
  '/admin/interactions': 'Interaction Analytics',
  '/admin/chat': 'AI Chat Intelligence',
  '/admin/sessions': 'Session Analytics',
  '/admin/heatmaps': 'Heatmap Visualizer',
  '/admin/insights': 'AI Summary & Insights',
};

export default function AdminLayout() {
  const location = useLocation();
  const navigate = useNavigate();
  const [collapsed, setCollapsed] = useState(false);
  const [dateRange, setDateRange] = useState('7d');
  const [isAdmin, setIsAdmin] = useState(null); // null = loading, true = authed, false = denied

  const checkAuth = useCallback(async () => {
    try {
      const res = await fetch('/api/admin/live');
      if (res.status === 403) {
        setIsAdmin(false);
      } else {
        setIsAdmin(true);
      }
    } catch {
      setIsAdmin(false);
    }
  }, []);

  useEffect(() => { checkAuth(); }, [checkAuth]);

  // Loading state
  if (isAdmin === null) {
    return (
      <div className="flex items-center justify-center h-screen" style={{ background: '#f8f9fa' }}>
        <Loader size={24} className="animate-spin text-purple-400" />
      </div>
    );
  }

  // Access denied
  if (isAdmin === false) {
    return (
      <div className="flex flex-col items-center justify-center h-screen gap-4" style={{ background: '#f8f9fa' }}>
        <div className="w-16 h-16 rounded-2xl bg-red-50 flex items-center justify-center">
          <LayoutDashboard size={28} className="text-red-500" />
        </div>
        <h2 className="text-lg font-bold" style={{ color: '#1a1a2e' }}>Admin Access Required</h2>
        <p className="text-sm" style={{ color: '#737373' }}>Sign in as admin to view analytics.</p>
        <button onClick={() => navigate('/login')} className="px-4 py-2 rounded-lg text-sm font-semibold text-white" style={{ background: '#7C3AED' }}>
          Go to Login
        </button>
      </div>
    );
  }

  const title = PAGE_TITLES[location.pathname] || 'Admin';

  return (
    <div className="flex h-screen overflow-hidden" style={{ background: '#f8f9fa' }}>
      <AdminSidebar collapsed={collapsed} onToggle={() => setCollapsed(c => !c)} />
      <main className="flex-1 min-w-0 flex flex-col overflow-hidden">
        <AdminHeader title={title} dateRange={dateRange} onDateRangeChange={setDateRange} />
        <div className="flex-1 min-w-0 overflow-y-auto">
          <AnimatePresence mode="wait">
            <motion.div
              key={location.pathname}
              className="min-w-0"
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.2 }}
            >
              <Outlet context={{ dateRange, setDateRange }} />
            </motion.div>
          </AnimatePresence>
        </div>
      </main>
    </div>
  );
}
