import { IS_DEMO } from '../../utils/brand';
import { useLanguage } from '../../context/LanguageContext';

export default function RegimeToggle({ value, onChange }) {
  if (!IS_DEMO) return null;
  const { t } = useLanguage();
  const options = [
    { key: 'spike',   label: t('phase45.scenarioLab.regime.spike') },
    { key: 'plateau', label: t('phase45.scenarioLab.regime.plateau') },
  ];
  return (
    <div className="inline-flex items-center gap-1 p-1 bg-slate-100 rounded-lg">
      {options.map((o) => (
        <button
          key={o.key}
          onClick={() => onChange(o.key)}
          className={`px-3 py-1 text-xs font-medium rounded-md transition-all ${
            value === o.key ? 'bg-white shadow-sm font-bold' : 'text-slate-500 hover:text-slate-900'
          }`}
          style={value === o.key ? { color: '#0393da' } : undefined}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}
