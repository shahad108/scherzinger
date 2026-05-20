// Locale-aware number/currency/percent formatters.
//
// P13.T4: defaults to 'de-DE' to match the German shipped copy. Calling
// `fmt.setLocale('en-GB')` (or `'de-DE'`) reseats every formatter; the
// i18n provider does this on `languageChanged`. Reading directly from the
// `fmt.eur(...)` etc. interfaces stays unchanged.

type Locale = 'de-DE' | 'en-GB';

let currentLocale: Locale = 'de-DE';

function makeEur(loc: Locale) {
  return new Intl.NumberFormat(loc, {
    style: 'currency',
    currency: 'EUR',
    maximumFractionDigits: 0,
  });
}
function makeEurPrecise(loc: Locale) {
  return new Intl.NumberFormat(loc, {
    style: 'currency',
    currency: 'EUR',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}
function makePct(loc: Locale) {
  return new Intl.NumberFormat(loc, {
    style: 'percent',
    minimumFractionDigits: 1,
    maximumFractionDigits: 1,
  });
}

let eur = makeEur(currentLocale);
let eurPrecise = makeEurPrecise(currentLocale);
let percent = makePct(currentLocale);
let number = new Intl.NumberFormat(currentLocale);

function setLocale(loc: Locale) {
  currentLocale = loc;
  eur = makeEur(loc);
  eurPrecise = makeEurPrecise(loc);
  percent = makePct(loc);
  number = new Intl.NumberFormat(loc);
}

export const fmt = {
  eur: (n: number) => eur.format(n),
  eurPrecise: (n: number) => eurPrecise.format(n),
  pct: (n: number) => percent.format(n),
  num: (n: number) => number.format(n),
  signedPct: (n: number) => (n >= 0 ? '+' : '') + percent.format(n),
  /** Resolve the currently active locale (read-only). */
  locale: () => currentLocale,
  /** Switch every shared formatter to a new locale. Called from the i18n hook. */
  setLocale,
};
