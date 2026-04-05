import { shadows, colors, radius } from '../../utils/designTokensV2';

const cardStyle = {
  background: colors.surface,
  borderRadius: radius.card,
  boxShadow: shadows.card,
  padding: '2rem',
};

export default function ActivityGridV2({ title, items }) {
  return (
    <div style={cardStyle}>
      <h3
        className="text-lg font-semibold mb-6"
        style={{ fontFamily: "'Manrope', sans-serif", color: colors.darkNavy }}
      >
        {title}
      </h3>
      <div className="grid grid-cols-2 gap-6">
        {items.map((item, i) => (
          <div
            key={i}
            className="flex items-center gap-4 p-6 rounded-2xl"
            style={{
              background: colors.background,
              ...(item.highlight ? { border: `2px solid rgba(3, 147, 218, 0.1)` } : {}),
            }}
          >
            <div
              className="w-12 h-12 rounded-xl flex items-center justify-center flex-shrink-0"
              style={{ background: item.iconBg }}
            >
              <item.icon size={22} style={{ color: item.iconColor }} />
            </div>
            <div>
              <div className="flex items-baseline gap-1">
                <p className="text-2xl font-bold" style={{ color: colors.darkNavy }}>
                  {item.value}
                </p>
                {item.valueSuffix && (
                  <span className="text-[10px] font-bold" style={{ color: colors.darkNavy }}>
                    {item.valueSuffix}
                  </span>
                )}
              </div>
              <p className="text-xs font-medium" style={{ color: '#737373' }}>
                {item.label}
              </p>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
