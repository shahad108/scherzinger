import { createContext, useContext, useState, useCallback, useEffect, useMemo } from 'react';
import { translations } from '../i18n/translations';

const LanguageContext = createContext(null);

const STORAGE_KEY = 'scherzinger_lang';
const DEFAULT_LANG = 'de';

function readInitialLang() {
  if (typeof window === 'undefined') return DEFAULT_LANG;
  const stored = window.localStorage.getItem(STORAGE_KEY);
  if (stored === 'en' || stored === 'de') return stored;
  return DEFAULT_LANG;
}

export function LanguageProvider({ children }) {
  const [lang, setLangState] = useState(readInitialLang);

  useEffect(() => {
    if (typeof window !== 'undefined') {
      window.localStorage.setItem(STORAGE_KEY, lang);
      document.documentElement.lang = lang;
    }
  }, [lang]);

  const setLang = useCallback((next) => {
    if (next === 'en' || next === 'de') setLangState(next);
  }, []);

  const toggleLang = useCallback(() => {
    setLangState(prev => (prev === 'en' ? 'de' : 'en'));
  }, []);

  const t = useCallback((key, vars) => {
    const dict = translations[lang] || translations.en;
    let value = dict[key];
    if (value == null) {
      // Fallback: try the other language so we never crash on missing keys
      value = translations.en[key];
    }
    if (value == null) return key;
    if (vars && typeof value === 'string') {
      return value.replace(/\{(\w+)\}/g, (_, k) => (vars[k] != null ? String(vars[k]) : `{${k}}`));
    }
    return value;
  }, [lang]);

  const value = useMemo(() => ({ lang, setLang, toggleLang, t }), [lang, setLang, toggleLang, t]);

  return <LanguageContext.Provider value={value}>{children}</LanguageContext.Provider>;
}

export function useLanguage() {
  const ctx = useContext(LanguageContext);
  if (!ctx) throw new Error('useLanguage must be used within LanguageProvider');
  return ctx;
}

export function useT() {
  return useLanguage().t;
}
