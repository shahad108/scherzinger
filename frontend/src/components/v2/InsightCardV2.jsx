import { shadows, colors, radius } from '../../utils/designTokensV2';

const badgeColors = {
  green: { bg: '#f0fdf4', text: '#16a34a' },
  red: { bg: '#fef2f2', text: '#dc2626' },
  amber: { bg: '#fffbeb', text: '#d97706' },
  orange: { bg: '#fff7ed', text: '#ea580c' },
  blue: { bg: '#eff6ff', text: '#2563eb' },
};

const cardStyle = {
  background: colors.surface,
  borderRadius: radius.card,
  boxShadow: '0 1px 3px rgba(0,0,0,0.04)',
  border: '1px solid #f8fafc',
  padding: '1.5rem',
};

export default function InsightCardV2({ type, badgeColor, icon: Icon, children, isPlaceholder, onClick }) {
  if (isPlaceholder) {
    return (
      <div
        className="flex flex-col items-center justify-center text-center"
        style={{
          ...cardStyle,
          background: '#f9fafb',
          opacity: 0.6,
        }}
      >
        <Icon size={36} className="mb-2" style={{ color: '#a3a3a3' }} />
        <p className="text-xs font-bold" style={{ color: '#a3a3a3' }}>
          GENERATE CUSTOM ANALYTICAL VIEW
        </p>
      </div>
    );
  }

  const badge = badgeColors[badgeColor] || badgeColors.blue;

  return (
    <div
      style={cardStyle}
      className={`flex flex-col gap-4 transition-all duration-200 ${onClick ? 'cursor-pointer hover:shadow-md hover:-translate-y-0.5' : ''}`}
      onClick={onClick}
    >
      <div className="flex justify-between items-start">
        <span
          className="px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider"
          style={{ background: badge.bg, color: badge.text }}
        >
          {type}
        </span>
        <Icon size={20} style={{ color: '#cbd5e1' }} />
      </div>
      <div className="text-sm leading-relaxed" style={{ color: colors.darkNavy }}>
        {children}
      </div>
      {onClick && (
        <p className="text-[10px] font-semibold uppercase tracking-wider mt-auto" style={{ color: colors.primary }}>
          View Details →
        </p>
      )}
    </div>
  );
}
