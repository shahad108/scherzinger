import { useLanguage } from '../context/LanguageContext';

export default function LanguageToggle() {
  const { lang, setLang } = useLanguage();

  const baseBtn =
    'px-2.5 h-7 rounded-full text-[11px] font-bold tracking-wider transition-all duration-200';
  const active = 'text-white shadow-sm';
  const inactive = 'text-slate-500 hover:text-[#0393da]';

  return (
    <div
      className="flex items-center gap-0.5 p-0.5 rounded-full"
      style={{ background: '#f1f5f9', border: '1px solid #e2e8f0' }}
      role="group"
      aria-label="Language selector"
    >
      <button
        type="button"
        onClick={() => setLang('en')}
        aria-pressed={lang === 'en'}
        className={`${baseBtn} ${lang === 'en' ? active : inactive}`}
        style={lang === 'en' ? { background: '#0393da' } : undefined}
        title="English"
      >
        EN
      </button>
      <button
        type="button"
        onClick={() => setLang('de')}
        aria-pressed={lang === 'de'}
        className={`${baseBtn} ${lang === 'de' ? active : inactive}`}
        style={lang === 'de' ? { background: '#0393da' } : undefined}
        title="Deutsch"
      >
        DE
      </button>
    </div>
  );
}
