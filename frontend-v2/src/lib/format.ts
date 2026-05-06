const eur = new Intl.NumberFormat('de-DE', {
  style: 'currency',
  currency: 'EUR',
  maximumFractionDigits: 0,
});

const eurPrecise = new Intl.NumberFormat('de-DE', {
  style: 'currency',
  currency: 'EUR',
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

const percent = new Intl.NumberFormat('de-DE', {
  style: 'percent',
  minimumFractionDigits: 1,
  maximumFractionDigits: 1,
});

const number = new Intl.NumberFormat('de-DE');

export const fmt = {
  eur: (n: number) => eur.format(n),
  eurPrecise: (n: number) => eurPrecise.format(n),
  pct: (n: number) => percent.format(n),
  num: (n: number) => number.format(n),
  signedPct: (n: number) => (n >= 0 ? '+' : '') + percent.format(n),
};
