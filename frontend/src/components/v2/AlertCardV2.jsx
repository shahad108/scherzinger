import { shadows, colors, radius } from '../../utils/designTokensV2';

const cardStyle = {
  background: colors.surface,
  borderRadius: radius.card,
  boxShadow: shadows.card,
  padding: '1.5rem',
};

export default function AlertCardV2({
  label,
  value,
  valueColor,
  borderColor,
  iconBg,
  iconColor,
  icon: Icon,
  helperText,
  helperColor,
  progressPct,
  progressColor,
}) {
  return (
    <div style={{ ...cardStyle, borderLeft: `4px solid ${borderColor}` }}>
      <div className="flex items-start gap-4">
        <div
          className="w-10 h-10 rounded-full flex items-center justify-center flex-shrink-0"
          style={{ background: iconBg }}
        >
          <Icon size={20} style={{ color: iconColor }} />
        </div>
        <div className="flex-1">
          <p
            className="text-[11px] font-bold uppercase tracking-widest mb-1"
            style={{ color: '#a3a3a3' }}
          >
            {label}
          </p>
          <h4 className="text-2xl font-bold" style={{ color: valueColor || colors.darkNavy }}>
            {value}
          </h4>
          {progressPct != null && (
            <div className="w-full h-1.5 rounded-full mt-3 overflow-hidden" style={{ background: '#f1f1f1' }}>
              <div
                className="h-full rounded-full"
                style={{ width: `${Math.min(progressPct, 100)}%`, background: progressColor || borderColor }}
              />
            </div>
          )}
          {helperText && (
            <p className="text-[11px] font-medium mt-2" style={{ color: helperColor || borderColor }}>
              {helperText}
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
