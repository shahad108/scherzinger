import { useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import {
  ChevronDown, ChevronUp, ExternalLink, MessageSquare,
  ThumbsUp, ThumbsDown, AlertTriangle, AlertCircle,
  TrendingUp, TrendingDown, DollarSign, Users, BarChart3, ShieldAlert,
} from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { colors } from '../utils/designTokensV2';
import { getSeverityCategory } from '../utils/insightsFeedEngine';

const BORDER_COLORS = {
  red: '#dc2626',
  orange: '#f97316',
  amber: '#eab308',
  green: '#10b981',
  blue: '#0393da',
};

const BADGE_STYLES = {
  red: { bg: '#fef2f2', text: '#dc2626' },
  orange: { bg: '#fff7ed', text: '#ea580c' },
  amber: { bg: '#fffbeb', text: '#d97706' },
  green: { bg: '#f0fdf4', text: '#16a34a' },
  blue: { bg: '#eff6ff', text: '#2563eb' },
};

const REPORT_ICONS = {
  margin: TrendingDown,
  pricing: DollarSign,
  churn: Users,
  cost: AlertTriangle,
  winrate: TrendingUp,
  pipeline: BarChart3,
};

export default function IntelligenceReportCard({
  report,
  onAskAbout,
  onExpand,
  isPinned,
  onTogglePin,
}) {
  const [feedback, setFeedback] = useState(null); // 'up' | 'down' | null
  const navigate = useNavigate();

  const borderColor = BORDER_COLORS[report.borderColor] || BORDER_COLORS.blue;
  const badge = BADGE_STYLES[report.borderColor] || BADGE_STYLES.blue;
  const severity = getSeverityCategory(report);
  const Icon = REPORT_ICONS[report.reportType] || AlertCircle;

  const handleAskAbout = (e) => {
    e.stopPropagation();
    onAskAbout?.(report);
  };

  const handleViewPage = (e) => {
    e.stopPropagation();
    if (report.linkPage) {
      navigate(report.linkPage);
    }
  };

  const handleFeedback = (type, e) => {
    e.stopPropagation();
    setFeedback((prev) => (prev === type ? null : type));
  };

  return (
    <motion.div
      layout
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -12 }}
      transition={{ duration: 0.3, ease: [0.25, 0.1, 0.25, 1] }}
      className="group relative bg-white rounded-xl overflow-hidden cursor-pointer transition-all duration-200 hover:shadow-md hover:-translate-y-0.5"
      style={{
        border: '1px solid #f0f0f0',
        borderLeftWidth: 4,
        borderLeftStyle: 'solid',
        borderLeftColor: borderColor,
        boxShadow: '0 1px 3px rgba(0,0,0,0.04)',
      }}
      onClick={() => onExpand?.(report)}
    >
      <div className="p-4">
        {/* Header Row */}
        <div className="flex items-start justify-between gap-3 mb-2">
          <div className="flex items-center gap-2 min-w-0">
            <div
              className="w-7 h-7 rounded-lg flex items-center justify-center flex-shrink-0"
              style={{ background: `${borderColor}10` }}
            >
              <Icon size={14} style={{ color: borderColor }} />
            </div>
            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <span
                  className="px-2 py-0.5 rounded text-[9px] font-bold uppercase tracking-wider whitespace-nowrap"
                  style={{ background: badge.bg, color: badge.text }}
                >
                  {report.type}
                </span>
                {report.frequency === 'triggered' && (
                  <span className="px-1.5 py-0.5 rounded text-[8px] font-bold uppercase tracking-wider bg-red-50 text-red-500">
                    Alert
                  </span>
                )}
                {isPinned && (
                  <span className="text-[9px] text-amber-500 font-bold">Pinned</span>
                )}
              </div>
            </div>
          </div>

          {/* Severity indicator */}
          <div
            className="flex-shrink-0 w-2 h-2 rounded-full mt-1"
            style={{ background: severity.color }}
            title={severity.label}
          />
        </div>

        {/* Title */}
        <h4 className="text-sm font-bold text-slate-800 mb-1.5 leading-snug">
          {report.title}
        </h4>

        {/* Summary */}
        <p className="text-xs text-slate-600 leading-relaxed mb-3">
          {report.summary}
        </p>

        {/* Action Buttons */}
        <div className="flex items-center gap-1 flex-wrap">
          <button
            onClick={() => onExpand?.(report)}
            className="inline-flex items-center gap-1 px-2.5 py-1 rounded-md text-[10px] font-semibold text-slate-600 bg-slate-50 hover:bg-slate-100 transition-colors"
          >
            Expand <ChevronDown size={10} />
          </button>

          {report.linkPage && (
            <button
              onClick={handleViewPage}
              className="inline-flex items-center gap-1 px-2.5 py-1 rounded-md text-[10px] font-semibold hover:bg-blue-50 transition-colors"
              style={{ color: colors.primary }}
            >
              View in {report.linkLabel} <ExternalLink size={10} />
            </button>
          )}

          <button
            onClick={handleAskAbout}
            className="inline-flex items-center gap-1 px-2.5 py-1 rounded-md text-[10px] font-semibold text-purple-600 hover:bg-purple-50 transition-colors"
          >
            Ask about this <MessageSquare size={10} />
          </button>

          <div className="ml-auto flex items-center gap-0.5">
            <button
              onClick={(e) => handleFeedback('up', e)}
              className={`p-1 rounded transition-colors ${
                feedback === 'up' ? 'text-green-600 bg-green-50' : 'text-slate-300 hover:text-slate-500'
              }`}
              title="Useful"
            >
              <ThumbsUp size={12} />
            </button>
            <button
              onClick={(e) => handleFeedback('down', e)}
              className={`p-1 rounded transition-colors ${
                feedback === 'down' ? 'text-red-500 bg-red-50' : 'text-slate-300 hover:text-slate-500'
              }`}
              title="Not relevant"
            >
              <ThumbsDown size={12} />
            </button>
          </div>
        </div>
      </div>
    </motion.div>
  );
}
