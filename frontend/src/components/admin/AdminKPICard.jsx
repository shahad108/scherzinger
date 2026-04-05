import { motion } from 'motion/react';
import { TrendingUp, TrendingDown } from 'lucide-react';
import CountUp from 'react-countup';

function Sparkline({ data, color = '#7C3AED' }) {
  if (!data || data.length < 2) return null;
  const min = Math.min(...data);
  const max = Math.max(...data);
  const range = max - min || 1;
  const w = 80;
  const h = 28;

  const pts = data.map((v, i) => ({
    x: (i / (data.length - 1)) * w,
    y: h - ((v - min) / range) * (h - 4) - 2,
  }));

  let path = `M${pts[0].x},${pts[0].y}`;
  for (let i = 1; i < pts.length; i++) {
    path += ` Q${pts[i - 1].x + (pts[i].x - pts[i - 1].x) * 0.5},${pts[i - 1].y} ${pts[i].x},${pts[i].y}`;
  }
  const fillPath = `${path} L${w},${h} L0,${h} Z`;
  const gradId = `spark-admin-${color.replace('#', '')}`;

  return (
    <svg width={w} height={h} className="flex-shrink-0">
      <defs>
        <linearGradient id={gradId} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={color} stopOpacity={0.3} />
          <stop offset="100%" stopColor={color} stopOpacity={0} />
        </linearGradient>
      </defs>
      <path d={fillPath} fill={`url(#${gradId})`} />
      <path d={path} fill="none" stroke={color} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

export default function AdminKPICard({
  label, value, change, changeType = 'neutral', icon: Icon,
  sparklineData, rawNumber, prefix = '', suffix = '', decimals = 0,
  subtitle,
}) {
  const TrendIcon = changeType === 'negative' ? TrendingDown : TrendingUp;
  const accentMap = {
    positive: 'linear-gradient(90deg, #10b981, #34d399)',
    negative: 'linear-gradient(90deg, #ef4444, #f87171)',
    neutral: 'linear-gradient(90deg, #7C3AED, #C4B5FD)',
  };
  const changeBadgeClasses = {
    positive: 'bg-green-50 text-green-700',
    negative: 'bg-red-50 text-red-700',
    neutral: 'bg-purple-50 text-purple-600',
  };

  return (
    <motion.div
      whileHover={{ y: -2, boxShadow: '0 8px 24px rgba(124,58,237,0.08)' }}
      className="relative overflow-hidden h-full flex flex-col"
      style={{
        background: '#ffffff',
        borderRadius: '1.25rem',
        boxShadow: '0 1px 4px rgba(0,0,0,0.04)',
        padding: '1.5rem',
        minHeight: '140px',
      }}
    >
      {/* Top accent bar */}
      <div className="absolute top-0 left-0 w-full h-1" style={{ background: accentMap[changeType] || accentMap.neutral }} />

      <div className="flex justify-between items-start mb-3">
        <p className="text-[11px] font-semibold uppercase tracking-wider flex items-center gap-2" style={{ color: '#737373' }}>
          {Icon && <Icon size={14} style={{ color: '#7C3AED' }} />}
          {label}
        </p>
        {sparklineData && <Sparkline data={sparklineData} color={changeType === 'positive' ? '#10b981' : changeType === 'negative' ? '#ef4444' : '#7C3AED'} />}
      </div>

      <h3 className="text-3xl font-bold tracking-tight" style={{ color: '#1a1a2e', fontFamily: "'Inter', sans-serif" }}>
        {rawNumber != null ? (
          <CountUp end={rawNumber} prefix={prefix} suffix={suffix} decimals={decimals} duration={1.2} separator="," />
        ) : value}
      </h3>

      {change && (
        <div className="flex items-center gap-1.5 mt-2">
          {changeType !== 'neutral' ? (
            <span className={`inline-flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 rounded-full ${changeBadgeClasses[changeType]}`}>
              <TrendIcon size={12} />
              {change}
            </span>
          ) : (
            <span className="text-[10px] font-medium" style={{ color: '#a3a3a3' }}>{change}</span>
          )}
        </div>
      )}

      {subtitle && <p className="text-[10px] mt-1" style={{ color: '#a3a3a3' }}>{subtitle}</p>}
    </motion.div>
  );
}
