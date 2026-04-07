import { NavLink, useLocation } from 'react-router-dom';
import { motion, AnimatePresence } from 'motion/react';
import {
  LayoutDashboard, TrendingUp, Package, Users, LineChart,
  DollarSign, Brain, Sparkles, ChevronsLeft, ChevronsRight, LogOut,
} from 'lucide-react';
import { useUI } from '../context/UIContext';
import { useUser } from '../context/UserContext';
import { track } from '../utils/tracker';
import { logout } from '../utils/auth';

const navItems = [
  { to: '/', label: 'Dashboard Overview', icon: LayoutDashboard },
  { to: '/revenue', label: 'Revenue & Margins', icon: TrendingUp },
  { to: '/products', label: 'Products & SKUs', icon: Package },
  { to: '/customers', label: 'Customers', icon: Users },
  { to: '/forecasting', label: 'Forecasting', icon: LineChart },
  { to: '/pricing', label: 'Pricing & Quotes', icon: DollarSign },
  { to: '/ml-analytics', label: 'ML Analytics', icon: Brain },
  { to: '/ai-insights', label: 'AI Insights', icon: Sparkles },
];

export default function Sidebar() {
  const location = useLocation();
  const { sidebarCollapsed, toggleSidebar } = useUI();
  const user = useUser();

  return (
    <motion.aside
      animate={{ width: sidebarCollapsed ? 80 : 256 }}
      transition={{ duration: 0.3, ease: [0.4, 0, 0.2, 1] }}
      className="flex-shrink-0 flex flex-col h-screen"
      style={{ background: '#ffffff', boxShadow: '4px 0 24px rgba(26,26,46,0.03)' }}
    >
      {/* Logo */}
      <div className={`p-6 flex items-center ${sidebarCollapsed ? 'justify-center' : 'gap-3'}`}>
        <div className="size-10 rounded-lg flex items-center justify-center text-white flex-shrink-0" style={{ background: 'linear-gradient(135deg, #0393da, #c1e8ff)' }}>
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="text-white">
            <polygon points="12 2 22 8.5 22 15.5 12 22 2 15.5 2 8.5 12 2" />
            <line x1="12" y1="22" x2="12" y2="15.5" />
            <polyline points="22 8.5 12 15.5 2 8.5" />
          </svg>
        </div>
        <AnimatePresence>
          {!sidebarCollapsed && (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.15 }}
            >
              <h1 className="text-xl font-bold tracking-tight leading-none" style={{ fontFamily: "'Manrope', sans-serif", color: '#1a1a2e' }}>PRYZM</h1>
              <p className="text-[10px] uppercase tracking-widest font-semibold" style={{ color: '#0393da' }}>Solutions GmbH</p>
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/* Navigation */}
      <nav className="flex-1 px-3 py-4 space-y-1 overflow-y-auto">
        {navItems.map(({ to, label, icon: Icon }) => {
          const isActive = to === '/' ? location.pathname === '/' : location.pathname.startsWith(to);
          return (
            <NavLink
              key={to}
              to={to}
              onClick={() => track.sidebarNavigate(label)}
              title={sidebarCollapsed ? label : undefined}
              className={`flex items-center gap-3 rounded-lg transition-colors ${
                sidebarCollapsed ? 'justify-center px-2 py-2.5' : 'px-3 py-2'
              } ${
                isActive
                  ? 'font-semibold'
                  : 'hover:bg-[#f8f9fa]'
              }`}
              style={isActive ? { background: 'rgba(3,147,218,0.08)', color: '#0393da' } : { color: '#525252' }}
            >
              <Icon size={20} className="flex-shrink-0" />
              <AnimatePresence>
                {!sidebarCollapsed && (
                  <motion.span
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                    transition={{ duration: 0.15 }}
                    className="text-[11px] font-semibold uppercase tracking-wider"
                  >
                    {label}
                  </motion.span>
                )}
              </AnimatePresence>
            </NavLink>
          );
        })}
      </nav>

      {/* Collapse toggle */}
      <div className="p-3" style={{ borderTop: '1px solid #f8fafc' }}>
        <button
          onClick={() => { toggleSidebar(); sidebarCollapsed ? track.sidebarExpand() : track.sidebarCollapse(); }}
          className="w-full flex items-center justify-center gap-2 px-3 py-2 rounded-lg transition-colors hover:bg-[#f8f9fa]"
          style={{ color: '#a3a3a3' }}
          title={sidebarCollapsed ? 'Expand sidebar' : 'Collapse sidebar'}
        >
          {sidebarCollapsed ? <ChevronsRight size={18} /> : <ChevronsLeft size={18} />}
          <AnimatePresence>
            {!sidebarCollapsed && (
              <motion.span initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.15 }} className="text-xs font-medium">Collapse</motion.span>
            )}
          </AnimatePresence>
        </button>
      </div>

      {/* Bottom User Card + Logout */}
      <div className="p-4" style={{ borderTop: '1px solid #f8fafc' }}>
        <div className={`flex items-center gap-3 p-3 rounded-2xl ${sidebarCollapsed ? 'justify-center' : ''}`} style={{ background: '#f8f9fa' }}>
          <div className="size-10 rounded-full flex items-center justify-center flex-shrink-0" style={{ background: 'rgba(3,147,218,0.1)' }}>
            <Users size={18} style={{ color: '#0393da' }} />
          </div>
          <AnimatePresence>
            {!sidebarCollapsed && (
              <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.15 }} className="flex-1 min-w-0">
                <p className="text-xs font-bold truncate" style={{ color: '#1a1a2e' }}>Scherzinger</p>
                <p className="text-[10px]" style={{ color: '#737373' }}>MD</p>
              </motion.div>
            )}
          </AnimatePresence>
          <button
            onClick={logout}
            title="Log Out"
            className="flex-shrink-0 p-2 rounded-lg transition-colors hover:bg-white"
            style={{ color: '#a3a3a3' }}
          >
            <LogOut size={16} />
          </button>
        </div>
      </div>
    </motion.aside>
  );
}
