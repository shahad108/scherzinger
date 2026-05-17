// Pricing Studio v3 / Phase 1 — Decimal helpers.
//
// Pydantic serialises Decimal as a JSON string (e.g. "127.00"). Treat that
// string as the canonical representation; only convert to `number` at the
// formatter boundary. Parsing failures coerce to NaN so callers can choose
// to render `<DataMissingBadge>`.

/** Parse a Decimal-as-string into a JS number. Returns NaN if unparseable. */
export function parseDecimal(value: string | number | null | undefined): number {
  if (value === null || value === undefined) return Number.NaN;
  if (typeof value === 'number') return value;
  const trimmed = value.trim();
  if (!trimmed) return Number.NaN;
  const n = Number(trimmed);
  return Number.isFinite(n) ? n : Number.NaN;
}

/** True when the value parses to a finite number. Use as a guard. */
export function isFiniteDecimal(value: string | number | null | undefined): boolean {
  return Number.isFinite(parseDecimal(value));
}

/** Fractional 0..1 -> "71%" with rounding. */
export function pctFromFraction(value: string | number | null | undefined, digits = 0): string {
  const n = parseDecimal(value);
  if (!Number.isFinite(n)) return '—';
  return `${(n * 100).toFixed(digits)}%`;
}

/** Signed percent delta, with sign prefix ("+7.6%" or "−4.2%"). */
export function signedPctDelta(from: number, to: number, digits = 1): string {
  if (!Number.isFinite(from) || from === 0 || !Number.isFinite(to)) return '—';
  const pct = ((to - from) / from) * 100;
  const sign = pct >= 0 ? '+' : '−'; // U+2212 minus, not hyphen
  return `${sign}${Math.abs(pct).toFixed(digits)}%`;
}
