/**
 * Single source of truth for Recharts series color decisions.
 * Resolves CSS variables once at import time so SVG rendering uses real
 * hex values (Recharts cannot consume `var(--rose)` directly).
 *
 * If tokens change, this module re-resolves on next module load (HMR).
 */
function token(name: string, fallback: string): string {
  if (typeof window === 'undefined') return fallback;
  const v = getComputedStyle(document.documentElement).getPropertyValue(name).trim();
  return v || fallback;
}

export const chart = {
  rose: () => token('--rose', '#5a7da3'),
  roseDeep: () => token('--rose-deep', '#3e5d80'),
  roseSoft: () => token('--rose-soft', '#9eb6ce'),
  roseBg: () => token('--rose-bg', '#edf3f9'),
  green: () => token('--green', '#2f7d5b'),
  greenBg: () => token('--green-bg', '#e3efe6'),
  amber: () => token('--amber', '#a5701f'),
  red: () => token('--red', '#9a3232'),
  ink: () => token('--ink', '#101418'),
  ink3: () => token('--ink-3', '#4a5360'),
  muted: () => token('--muted', '#7d8693'),
  hairline: () => token('--hairline', '#eaedf1'),
} as const;
