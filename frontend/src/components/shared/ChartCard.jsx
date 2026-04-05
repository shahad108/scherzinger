import { motion } from 'motion/react';
import { chartVariants, cardHover, viewportOnce } from '../../utils/animations';
import { colors, shadows, radius } from '../../utils/designTokensV2';
import Tooltip from './Tooltip';
import InfoButton from './InfoButton';
import FormulaPopover from './FormulaPopover';
import DerivedBadge from './DerivedBadge';

export default function ChartCard({ title, subtitle, headerRight, children, tooltip, infoTooltip, formulaId, confidence }) {
  return (
    <motion.div
      variants={chartVariants}
      initial="hidden"
      whileInView="visible"
      viewport={viewportOnce}
      whileHover={cardHover}
      style={{
        background: colors.surface,
        borderRadius: radius.card,
        boxShadow: shadows.card,
        padding: '2rem',
      }}
    >
      <div className="flex justify-between items-center mb-6">
        <div>
          <h3 className="font-bold text-base flex items-center" style={{ fontFamily: "'Manrope', sans-serif", color: colors.darkNavy }}>
            <Tooltip text={tooltip}><span>{title}</span></Tooltip>
            <InfoButton text={infoTooltip} />
            {formulaId && <FormulaPopover metricId={formulaId} />}
          </h3>
          {subtitle && <p className="text-xs mt-0.5" style={{ color: '#737373' }}>{subtitle}</p>}
        </div>
        <div className="flex items-center gap-2">
          {confidence && <DerivedBadge confidence={confidence} />}
          {headerRight && <div>{headerRight}</div>}
        </div>
      </div>
      {children}
    </motion.div>
  );
}
