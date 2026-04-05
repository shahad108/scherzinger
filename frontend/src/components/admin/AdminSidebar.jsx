import { NavLink, useLocation } from 'react-router-dom';
import { motion, AnimatePresence } from 'motion/react';
import {
  Activity, FileBarChart, MousePointerClick, MessageSquare,
  Clock, Flame, Sparkles, ChevronsLeft, ChevronsRight,
  ExternalLink, LogOut, ShieldCheck,
} from 'lucide-react';

const navItems = [
  { to: '/admin', label: 'Command Center', icon: Activity, end: true },
  { to: '/admin/pages', label: 'Page Analytics', icon: FileBarChart },
  { to: '/admin/interactions', label: 'Interactions', icon: MousePointerClick },
  { to: '/admin/chat', label: 'AI Chat Intel', icon: MessageSquare },
  { to: '/admin/sessions', label: 'Sessions', icon: Clock },
  { to: '/admin/heatmaps', label: 'Heatmaps', icon: Flame },
  { to: '/admin/insights', label: 'AI Insights', icon: Sparkles },
];

export default function AdminSidebar({ collapsed, onToggle }) {
  const location = useLocation();

  return (
    <motion.aside
      animate={{ width: collapsed ? 80 : 256 }}
      transition={{ duration: 0.3, ease: [0.4, 0, 0.2, 1] }}
      className="flex-shrink-0 flex flex-col h-screen"
      style={{ background: '#ffffff', boxShadow: '4px 0 24px rgba(26,26,46,0.03)' }}
    >
      {/* Logo */}
      <div className={`p-6 flex items-center ${collapsed ? 'justify-center' : 'gap-3'}`}>
        <div className="size-10 rounded-lg flex items-center justify-center text-white flex-shrink-0" style={{ background: 'linear-gradient(135deg, #7C3AED, #C4B5FD)' }}>
          <ShieldCheck size={20} />
        </div>
        <AnimatePresence>
          {!collapsed && (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.15 }}
            >
              <h1 className="text-xl font-bold tracking-tight leading-none" style={{ fontFamily: "'Manrope', sans-serif", color: '#1a1a2e' }}>PRYZM</h1>
              <p className="text-[10px] uppercase tracking-widest font-semibold" style={{ color: '#7C3AED' }}>Admin Console</p>
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/* Navigation */}
      <nav className="flex-1 px-3 py-4 space-y-1 overflow-y-auto">
        {navItems.map(({ to, label, icon: Icon, end }) => {
          const isActive = end
            ? location.pathname === to
            : location.pathname.startsWith(to);
          return (
            <NavLink
              key={to}
              to={to}
              end={end}
              title={collapsed ? label : undefined}
              className={`flex items-center gap-3 rounded-lg transition-colors ${
                collapsed ? 'justify-center px-2 py-2.5' : 'px-3 py-2'
              } ${
                isActive ? 'font-semibold' : 'hover:bg-[#f5f3ff]'
              }`}
              style={isActive ? { background: 'rgba(124,58,237,0.08)', color: '#7C3AED' } : { color: '#525252' }}
            >
              <Icon size={20} className="flex-shrink-0" />
              <AnimatePresence>
                {!collapsed && (
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

      {/* View as Vivek */}
      <div className="px-3 pb-1">
        <a
          href="/"
          target="_blank"
          rel="noopener noreferrer"
          className={`flex items-center gap-3 rounded-lg transition-colors px-3 py-2 hover:bg-[#f5f3ff] ${collapsed ? 'justify-center' : ''}`}
          style={{ color: '#7C3AED' }}
          title="View as Vivek"
        >
          <ExternalLink size={18} className="flex-shrink-0" />
          <AnimatePresence>
            {!collapsed && (
              <motion.span initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.15 }} className="text-[11px] font-semibold uppercase tracking-wider">
                View as Vivek
              </motion.span>
            )}
          </AnimatePresence>
        </a>
      </div>

      {/* Collapse toggle */}
      <div className="p-3" style={{ borderTop: '1px solid #f8fafc' }}>
        <button
          onClick={onToggle}
          className="w-full flex items-center justify-center gap-2 px-3 py-2 rounded-lg transition-colors hover:bg-[#f5f3ff]"
          style={{ color: '#a3a3a3' }}
          title={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
        >
          {collapsed ? <ChevronsRight size={18} /> : <ChevronsLeft size={18} />}
          <AnimatePresence>
            {!collapsed && (
              <motion.span initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.15 }} className="text-xs font-medium">Collapse</motion.span>
            )}
          </AnimatePresence>
        </button>
      </div>

      {/* Bottom User Card */}
      <div className="p-4" style={{ borderTop: '1px solid #f8fafc' }}>
        <div className={`flex items-center gap-3 p-3 rounded-2xl ${collapsed ? 'justify-center' : ''}`} style={{ background: '#f5f3ff' }}>
          <div className="size-10 rounded-full flex items-center justify-center flex-shrink-0" style={{ background: 'rgba(124,58,237,0.15)' }}>
            <ShieldCheck size={18} style={{ color: '#7C3AED' }} />
          </div>
          <AnimatePresence>
            {!collapsed && (
              <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.15 }} className="flex-1 min-w-0">
                <p className="text-xs font-bold truncate" style={{ color: '#1a1a2e' }}>Admin</p>
                <p className="text-[10px]" style={{ color: '#737373' }}>Analytics Console</p>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </div>
    </motion.aside>
  );
}
