import { useState, useMemo } from 'react';
import { motion } from 'motion/react';
import { Filter, Pin, Clock, Zap, Bell, PanelLeftClose } from 'lucide-react';
import IntelligenceReportCard from './IntelligenceReportCard';
import { getSeverityCategory } from '../utils/insightsFeedEngine';
import { containerVariants } from '../utils/animations';
import { useLanguage } from '../context/LanguageContext';

const FILTER_OPTIONS = [
  { key: 'all', tKey: 'feed.filter.all' },
  { key: 'critical', tKey: 'feed.filter.critical', color: '#dc2626' },
  { key: 'action', tKey: 'feed.filter.action', color: '#f97316' },
  { key: 'brief', tKey: 'feed.filter.brief', color: '#eab308' },
  { key: 'positive', tKey: 'feed.filter.positive', color: '#10b981' },
];

export default function IntelligenceFeed({ reports, onAskAbout, onExpandReport, onCollapse }) {
  const { t } = useLanguage();
  const [activeFilter, setActiveFilter] = useState('all');
  const [pinnedIds, setPinnedIds] = useState(() => {
    try {
      return new Set(JSON.parse(localStorage.getItem('pinned-reports') || '[]'));
    } catch {
      return new Set();
    }
  });

  const togglePin = (reportId) => {
    setPinnedIds((prev) => {
      const next = new Set(prev);
      if (next.has(reportId)) {
        next.delete(reportId);
      } else {
        next.add(reportId);
      }
      localStorage.setItem('pinned-reports', JSON.stringify([...next]));
      return next;
    });
  };

  const filteredReports = useMemo(() => {
    let filtered = reports;
    if (activeFilter !== 'all') {
      filtered = reports.filter((r) => getSeverityCategory(r, t).level === activeFilter);
    }

    // Pinned reports always appear first
    return [...filtered].sort((a, b) => {
      const aPinned = pinnedIds.has(a.id) ? 1 : 0;
      const bPinned = pinnedIds.has(b.id) ? 1 : 0;
      if (aPinned !== bPinned) return bPinned - aPinned;
      return b.severity - a.severity;
    });
  }, [reports, activeFilter, pinnedIds]);

  const severityCounts = useMemo(() => {
    const counts = { critical: 0, action: 0, brief: 0, positive: 0 };
    for (const r of reports) {
      const cat = getSeverityCategory(r, t);
      counts[cat.level] = (counts[cat.level] || 0) + 1;
    }
    return counts;
  }, [reports, t]);

  return (
    <div className="flex flex-col h-full">
      {/* Feed Header */}
      <div className="flex-shrink-0 px-5 pt-5 pb-3">
        <div className="flex items-center justify-between mb-3">
          <div>
            <h2 className="text-base font-bold text-slate-800" style={{ fontFamily: "'Manrope', sans-serif" }}>
              {t('feed.title')}
            </h2>
            <p className="text-[11px] text-slate-400 mt-0.5">
              {t('feed.subtitle', { n: reports.length })}
            </p>
          </div>
          <div className="flex items-center gap-1.5">
            <div className="flex items-center gap-1 px-2 py-1 bg-slate-50 rounded-lg">
              <Zap size={10} className="text-red-500" />
              <span className="text-[10px] font-bold text-slate-500">{t('feed.critical', { n: severityCounts.critical })}</span>
            </div>
            {onCollapse && (
              <button
                onClick={onCollapse}
                className="w-7 h-7 rounded-lg flex items-center justify-center text-slate-400 hover:text-slate-600 hover:bg-slate-100 transition-colors"
                title={t('feed.collapse')}
              >
                <PanelLeftClose size={16} />
              </button>
            )}
          </div>
        </div>

        {/* Filter Pills */}
        <div className="flex items-center gap-1.5 overflow-x-auto pb-1 scrollbar-none">
          {FILTER_OPTIONS.map((opt) => {
            const isActive = activeFilter === opt.key;
            const count = opt.key === 'all' ? reports.length : severityCounts[opt.key] ?? 0;
            return (
              <button
                key={opt.key}
                onClick={() => setActiveFilter(opt.key)}
                className={`flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[10px] font-semibold whitespace-nowrap transition-all ${
                  isActive
                    ? 'bg-slate-800 text-white shadow-sm'
                    : 'bg-slate-50 text-slate-500 hover:bg-slate-100'
                }`}
              >
                {opt.color && (
                  <span
                    className="w-1.5 h-1.5 rounded-full flex-shrink-0"
                    style={{ background: isActive ? '#fff' : opt.color }}
                  />
                )}
                {t(opt.tKey)}
                <span className={`text-[9px] ${isActive ? 'text-slate-300' : 'text-slate-400'}`}>
                  {count}
                </span>
              </button>
            );
          })}
        </div>
      </div>

      {/* Report Cards */}
      <motion.div
        className="flex-1 min-h-0 overflow-y-auto px-5 pb-5 space-y-3"
        variants={containerVariants}
        initial="hidden"
        animate="visible"
      >
        {filteredReports.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-12 text-center">
            <Filter size={24} className="text-slate-300 mb-2" />
            <p className="text-sm font-medium text-slate-400">{t('feed.empty')}</p>
            <button
              onClick={() => setActiveFilter('all')}
              className="mt-2 text-xs text-blue-500 hover:underline"
            >
              {t('feed.showAll')}
            </button>
          </div>
        ) : (
          filteredReports.map((report) => (
            <IntelligenceReportCard
              key={report.id}
              report={report}
              onAskAbout={onAskAbout}
              onExpand={onExpandReport}
              isPinned={pinnedIds.has(report.id)}
              onTogglePin={() => togglePin(report.id)}
            />
          ))
        )}
      </motion.div>

      {/* Notification toggle strip (designed now, wired later) */}
      <div className="flex-shrink-0 px-5 py-3 border-t border-slate-100 bg-slate-50/50">
        <div className="flex items-center gap-2 text-[10px] text-slate-400">
          <Bell size={12} />
          <span>{t('feed.notificationsSoon')}</span>
        </div>
      </div>
    </div>
  );
}
