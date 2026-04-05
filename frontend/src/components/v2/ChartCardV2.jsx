import { shadows, colors, radius } from '../../utils/designTokensV2';
import FormulaPopover from '../shared/FormulaPopover';
import DerivedBadge from '../shared/DerivedBadge';

const cardStyle = {
  background: colors.surface,
  borderRadius: radius.card,
  boxShadow: shadows.card,
  padding: '2rem',
};

export default function ChartCardV2({ title, subtitle, headerRight, children, formulaId, confidence }) {
  return (
    <div className="h-full min-w-0 flex flex-col" style={cardStyle}>
      <div className="flex justify-between items-center mb-8">
        <div>
          <div className="flex items-center gap-1">
            <h3
              className="text-lg font-semibold"
              style={{ fontFamily: "'Manrope', sans-serif", color: colors.darkNavy }}
            >
              {title}
            </h3>
            {formulaId && <FormulaPopover metricId={formulaId} />}
            {confidence && <DerivedBadge confidence={confidence} />}
          </div>
          {subtitle && (
            <p className="text-xs mt-1" style={{ color: '#737373' }}>
              {subtitle}
            </p>
          )}
        </div>
        {headerRight && <div>{headerRight}</div>}
      </div>
      <div className="flex-1 min-h-0 min-w-0">{children}</div>
    </div>
  );
}
