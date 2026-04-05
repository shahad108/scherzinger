import { motion } from 'motion/react';
import { shadows, colors, radius } from '../../utils/designTokensV2';
import FormulaPopover from '../shared/FormulaPopover';
import DerivedBadge from '../shared/DerivedBadge';

const cardStyle = {
  background: colors.surface,
  borderRadius: radius.card,
  boxShadow: shadows.card,
  position: 'relative',
  overflow: 'hidden',
  padding: '1.5rem',
};

export default function KPICardV2({
  label,
  value,
  suffix,
  change,
  changeType = 'positive',
  accentGradient,
  bottomContent,
  formulaId,
  confidence,
}) {
  const changeBg = changeType === 'positive'
    ? 'bg-green-50 text-green-700'
    : changeType === 'negative'
      ? 'bg-red-50 text-red-700'
      : changeType === 'warning'
        ? 'bg-red-50 text-red-700'
        : 'bg-slate-50 text-slate-500';

  return (
    <motion.div
      className="h-full flex flex-col"
      style={cardStyle}
      whileHover={{ y: -2, boxShadow: shadows.cardHover }}
      transition={{ duration: 0.2, ease: 'easeInOut' }}
    >
      {/* Accent bar */}
      <div
        className="absolute top-0 left-0 w-full h-1"
        style={{ background: accentGradient || 'linear-gradient(to right, #0393da, #c1e8ff)' }}
      />

      <div className="flex justify-between items-start mb-4">
        <div className="flex items-center gap-0.5">
          <p
            className="text-[11px] font-semibold uppercase tracking-wider"
            style={{ color: '#737373' }}
          >
            {label}
          </p>
          {formulaId && <FormulaPopover metricId={formulaId} />}
        </div>
        {change && (
          <span className={`flex items-center text-[10px] font-bold px-2 py-1 rounded-full ${changeBg}`}>
            {change}
          </span>
        )}
      </div>

      <div className="flex items-baseline gap-1">
        <span
          className="text-3xl font-bold"
          style={{ fontFamily: "'Inter', sans-serif", color: colors.darkNavy }}
        >
          {value}
        </span>
        {suffix && (
          <span className="text-sm font-medium" style={{ color: '#a3a3a3' }}>
            {suffix}
          </span>
        )}
      </div>

      {bottomContent && <div className="mt-auto pt-4">{bottomContent}</div>}
      {confidence && (
        <div className="absolute bottom-2 right-3">
          <DerivedBadge confidence={confidence} />
        </div>
      )}
    </motion.div>
  );
}
