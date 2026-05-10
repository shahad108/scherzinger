import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import LanguageDetector from 'i18next-browser-languagedetector';
import { fmt } from '@/lib/format';
import de from './de.json';
import en from './en.json';

void i18n
  .use(LanguageDetector)
  .use(initReactI18next)
  .init({
    resources: { de: { translation: de }, en: { translation: en } },
    fallbackLng: 'de',
    supportedLngs: ['de', 'en'],
    interpolation: { escapeValue: false },
    detection: {
      // i18next-browser-languagedetector reads/writes 'i18nextLng'; we mirror
      // it into 'pryzm_lang' below so apiFetch can append ?lang= without
      // pulling i18next into lib/api/.
      order: ['cookie', 'localStorage', 'navigator'],
      caches: ['cookie', 'localStorage'],
      lookupCookie: 'pryzm_lang',
    },
  });

// Keep the pryzm_lang cookie in sync on every language change so the BFF
// receives the right ?lang= param. Done via a tiny side-effect listener; the
// initial value is set by LanguageDetector during init().
function writeLangCookie(lang: string) {
  if (typeof document === 'undefined') return;
  const oneYear = 60 * 60 * 24 * 365;
  document.cookie = `pryzm_lang=${encodeURIComponent(lang)}; path=/; max-age=${oneYear}; samesite=lax`;
}
function syncFmtLocale(lang: string) {
  fmt.setLocale(lang.toLowerCase().startsWith('en') ? 'en-GB' : 'de-DE');
}

i18n.on('languageChanged', (lng) => {
  writeLangCookie(lng);
  syncFmtLocale(lng);
});

// Ensure the initial language lands in the cookie + fmt locale even when the
// detector resolved from navigator/localStorage rather than the cookie.
if (typeof i18n.language === 'string' && i18n.language) {
  writeLangCookie(i18n.language);
  syncFmtLocale(i18n.language);
}

export default i18n;
