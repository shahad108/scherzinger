import { Sparkles } from 'lucide-react';
import { IS_DEMO } from '../../utils/brand';
import { useLanguage } from '../../context/LanguageContext';
import { getNLHeader } from '../../utils/mockPhase45';

export default function NLHeaderCard() {
  if (!IS_DEMO) return null;
  const { t, lang } = useLanguage();
  const nl = getNLHeader();
  if (!nl) return null;
  return (
    <div
      className="p-6 rounded-2xl mb-6"
      style={{ background: 'linear-gradient(135deg, #f0f9ff, #ffffff)', border: '1px solid #e0f2fe' }}
    >
      <div className="flex items-start gap-4">
        <div
          className="size-10 rounded-xl flex items-center justify-center flex-shrink-0"
          style={{ background: 'rgba(3,147,218,0.12)', color: '#0393da' }}
        >
          <Sparkles size={18} />
        </div>
        <div>
          <h3 className="text-xs font-bold uppercase tracking-wider" style={{ color: '#0393da' }}>
            {t('phase45.nlHeader.title')}
          </h3>
          <p className="text-sm mt-2" style={{ color: '#1a1a2e', lineHeight: 1.6 }}>
            {nl[lang] || nl.en}
          </p>
        </div>
      </div>
    </div>
  );
}
