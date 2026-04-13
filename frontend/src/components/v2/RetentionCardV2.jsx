import { shadows, colors, radius, gradients } from '../../utils/designTokensV2';
import { useLanguage } from '../../context/LanguageContext';

const cardStyle = {
  background: colors.surface,
  borderRadius: radius.card,
  boxShadow: shadows.card,
  padding: '2rem',
};

export default function RetentionCardV2({
  title,
  subtitle,
  value,
  yoyChange,
  goal,
  footnote,
}) {
  const { t } = useLanguage();
  const pct = parseInt(value, 10) || 0;

  return (
    <div style={cardStyle} className="flex flex-col justify-center">
      <div className="flex items-center justify-between mb-8">
        <div>
          <h3
            className="text-lg font-semibold"
            style={{ fontFamily: "'Manrope', sans-serif", color: colors.darkNavy }}
          >
            {title}
          </h3>
          {subtitle && (
            <p className="text-sm mt-1" style={{ color: '#737373' }}>{subtitle}</p>
          )}
        </div>
        {yoyChange && (
          <span className="bg-green-100 text-green-700 px-3 py-1 rounded-full text-sm font-bold">
            {yoyChange}
          </span>
        )}
      </div>

      <div className="relative pt-1">
        <div className="flex mb-2 items-center justify-between">
          <span className="text-4xl font-extrabold" style={{ color: colors.primary }}>
            {value}
          </span>
          {goal && (
            <span className="text-xs font-semibold" style={{ color: '#a3a3a3' }}>
              {t('common.goal', { value: goal })}
            </span>
          )}
        </div>
        <div
          className="overflow-hidden h-4 mb-4 flex rounded-full"
          style={{ background: colors.surfaceContainer }}
        >
          <div
            className="flex flex-col text-center whitespace-nowrap text-white justify-center"
            style={{ width: `${pct}%`, background: gradients.primary }}
          />
        </div>
        {footnote && (
          <p className="text-xs text-center italic mt-4" style={{ color: '#737373' }}>
            {footnote}
          </p>
        )}
      </div>
    </div>
  );
}
