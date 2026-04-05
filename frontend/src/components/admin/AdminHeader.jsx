import { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'motion/react';
import { Wifi, WifiOff, LogOut, Calendar, ChevronDown } from 'lucide-react';

const DATE_RANGES = [
  { label: 'Today', value: 'today', days: 0 },
  { label: '7 Days', value: '7d', days: 7 },
  { label: '30 Days', value: '30d', days: 30 },
  { label: '90 Days', value: '90d', days: 90 },
];

export default function AdminHeader({ title, dateRange, onDateRangeChange }) {
  const navigate = useNavigate();
  const [live, setLive] = useState({ online: false, current_page: null, is_active: false, last_seen: null });
  const [showDatePicker, setShowDatePicker] = useState(false);
  const dateRef = useRef(null);

  // Poll live status every 10 seconds
  useEffect(() => {
    const fetchLive = () => {
      fetch('/api/admin/live').then(r => r.json()).then(setLive).catch(() => {});
    };
    fetchLive();
    const interval = setInterval(fetchLive, 10000);
    return () => clearInterval(interval);
  }, []);

  // Close date picker on outside click
  useEffect(() => {
    const handler = (e) => { if (dateRef.current && !dateRef.current.contains(e.target)) setShowDatePicker(false); };
    if (showDatePicker) {
      document.addEventListener('mousedown', handler);
      return () => document.removeEventListener('mousedown', handler);
    }
  }, [showDatePicker]);

  const timeSince = live.last_seen ? Math.round((Date.now() - new Date(live.last_seen).getTime()) / 1000) : null;
  const timeLabel = timeSince != null
    ? timeSince < 60 ? `${timeSince}s ago`
    : timeSince < 3600 ? `${Math.round(timeSince / 60)}m ago`
    : `${Math.round(timeSince / 3600)}h ago`
    : '';

  const PAGE_NAMES = {
    '/': 'Dashboard', '/revenue': 'Revenue', '/products': 'Products',
    '/customers': 'Customers', '/forecasting': 'Forecasting',
    '/pricing': 'Pricing', '/inventory': 'Inventory',
    '/ml-analytics': 'ML Analytics', '/ai-insights': 'AI Insights',
  };

  const currentRangeLabel = DATE_RANGES.find(r => r.value === dateRange)?.label || '7 Days';

  return (
    <header className="h-16 flex items-center justify-between px-8 flex-shrink-0 relative z-30" style={{ background: 'rgba(255,255,255,0.85)', backdropFilter: 'blur(12px)', boxShadow: '0 1px 0 rgba(26,26,46,0.04)' }}>
      {/* Left: Title */}
      <h2 className="text-lg font-bold" style={{ fontFamily: "'Manrope', sans-serif", color: '#1a1a2e' }}>{title}</h2>

      {/* Center: Date Range Picker */}
      <div className="relative" ref={dateRef}>
        <button
          onClick={() => setShowDatePicker(p => !p)}
          className="flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-colors hover:bg-purple-50"
          style={{ border: '1px solid #e5e7eb', color: '#525252' }}
        >
          <Calendar size={14} style={{ color: '#7C3AED' }} />
          {currentRangeLabel}
          <ChevronDown size={14} />
        </button>
        <AnimatePresence>
          {showDatePicker && (
            <motion.div
              initial={{ opacity: 0, y: -4 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -4 }}
              className="absolute top-full left-0 mt-1 bg-white rounded-xl shadow-lg border border-slate-200 py-1 z-50 w-36"
            >
              {DATE_RANGES.map(r => (
                <button
                  key={r.value}
                  onClick={() => { onDateRangeChange(r.value); setShowDatePicker(false); }}
                  className={`w-full text-left px-4 py-2 text-sm transition-colors ${
                    dateRange === r.value ? 'bg-purple-50 text-purple-700 font-semibold' : 'hover:bg-slate-50 text-slate-600'
                  }`}
                >
                  {r.label}
                </button>
              ))}
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/* Right: Live Status + Logout */}
      <div className="flex items-center gap-5">
        {/* Live Status Badge */}
        <div className="flex items-center gap-2.5 px-3 py-1.5 rounded-full" style={{ background: live.online ? '#f0fdf4' : '#f8fafc' }}>
          {live.online ? (
            <>
              <span className="w-2.5 h-2.5 rounded-full bg-green-500 animate-pulse" />
              <span className="text-xs font-semibold text-green-700">
                Vivek on {PAGE_NAMES[live.current_page] || live.current_page}
              </span>
              {live.is_active && <span className="text-[10px] text-green-500">active</span>}
            </>
          ) : (
            <>
              <WifiOff size={14} className="text-slate-400" />
              <span className="text-xs font-medium text-slate-500">
                Offline {timeLabel && `- ${timeLabel}`}
              </span>
            </>
          )}
        </div>

        {/* Logout */}
        <button
          onClick={async () => {
            await fetch('/api/logout', { method: 'POST' });
            window.location.href = '/login';
          }}
          className="w-8 h-8 rounded-lg flex items-center justify-center text-slate-400 hover:text-red-500 hover:bg-red-50 transition-colors"
          title="Log Out"
        >
          <LogOut size={16} />
        </button>
      </div>
    </header>
  );
}
