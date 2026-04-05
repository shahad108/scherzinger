import { motion } from 'motion/react';
import { TrendingUp, TrendingDown } from 'lucide-react';
import CountUp from 'react-countup';
import { cardHover } from '../../utils/animations';
import { colors, shadows, radius, gradients } from '../../utils/designTokensV2';
import Tooltip from './Tooltip';
import InfoButton from './InfoButton';
import FormulaPopover from './FormulaPopover';
import DerivedBadge from './DerivedBadge';
import { trackKPIHoverStart, trackKPIHoverEnd } from '../../utils/tracker';

function Sparkline({ data, color = '#0393da' }) {
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
  const gradId = `spark-${color.replace('#', '')}`;

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

const accentMap = {
  positive: gradients.emerald,
  negative: gradients.tertiary,
  warning: gradients.tertiary,
  neutral: gradients.navy,
};

const sparkColorMap = {
  positive: colors.success,
  negative: '#f87171',
  warning: colors.tertiary,
  neutral: colors.primary,
};

const changeBadgeClasses = {
  positive: 'bg-green-50 text-green-700',
  negative: 'bg-red-50 text-red-700',
  warning: 'bg-red-50 text-red-700',
  neutral: 'bg-slate-50 text-slate-500',
};

export default function KPICard({
  label, value, change, changeType = 'neutral', icon: Icon,
  sparklineData, rawNumber, prefix = '', suffix = '', decimals = 0,
  tooltip, infoTooltip, accentGradient, bottomContent, compact = false,
  formulaId, confidence,
}) {
  const TrendIcon = changeType === 'negative' ? TrendingDown : TrendingUp;
  const accent = accentGradient || accentMap[changeType] || gradients.primary;

  return (
    <motion.div
      whileHover={cardHover}
      onMouseEnter={() => trackKPIHoverStart(label)}
      onMouseLeave={() => trackKPIHoverEnd(label)}
      className="relative overflow-hidden h-full flex flex-col"
      style={{
        background: colors.surface,
        borderRadius: compact ? '1rem' : radius.card,
        boxShadow: shadows.card,
        padding: compact ? '1rem' : '1.5rem',
        minHeight: compact ? undefined : '160px',
      }}
    >
      {/* Top accent bar */}
      <div className="absolute top-0 left-0 w-full h-1" style={{ background: accent }} />

      <div className={`flex justify-between items-start ${compact ? 'mb-2' : 'mb-3'}`}>
        <p className="text-[11px] font-semibold uppercase tracking-wider flex items-center" style={{ color: '#737373' }}>
          <Tooltip text={tooltip}><span className="truncate">{label}</span></Tooltip>
          <InfoButton text={infoTooltip} />
          {formulaId && <FormulaPopover metricId={formulaId} />}
        </p>
        {sparklineData ? (
          <Sparkline data={sparklineData} color={sparkColorMap[changeType]} />
        ) : Icon && (
          <div className="size-8 rounded-lg flex items-center justify-center" style={{ background: `${colors.primary}15` }}>
            <Icon size={16} style={{ color: colors.primary }} />
          </div>
        )}
      </div>

      <h3 className={`${compact ? 'text-xl' : 'text-3xl'} font-bold tracking-tight`} style={{ color: colors.darkNavy, fontFamily: "'Inter', sans-serif" }}>
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

      {bottomContent && <div className="mt-auto pt-3">{bottomContent}</div>}
      {confidence && (
        <div className="absolute bottom-2 right-3">
          <DerivedBadge confidence={confidence} />
        </div>
      )}
    </motion.div>
  );
}
