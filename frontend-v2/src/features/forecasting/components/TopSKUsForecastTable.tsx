import { useMemo } from 'react';
import type { SkuRow } from '@/types/forecast';

interface Props {
  rows: SkuRow[];
  /** Max rows to show. Defaults to 10. */
  limit?: number;
  footnote?: string;
}

/**
 * Parses a formatted numeric string like "1.234.567 €", "€ 1,234.56", "12,3k"
 * into a plain number. Returns null when no digit is present.
 *
 * Exported for unit tests so we can pin the locale handling behaviour.
 */
export function parseNumeric(s: string | null | undefined): number | null {
  if (s == null) return null;
  const trimmed = String(s).trim();
  if (!trimmed) return null;
  // Strip currency + unit chars first.
  let cleaned = trimmed.replace(/[€$£¥\s]/g, '').replace(/u(nits)?$/i, '');
  // Handle k/M/B suffix (German "Mio." too).
  const mult = (() => {
    if (/mio\.?$/i.test(cleaned)) {
      cleaned = cleaned.replace(/mio\.?$/i, '');
      return 1_000_000;
    }
    const last = cleaned.slice(-1);
    if (last === 'k' || last === 'K') {
      cleaned = cleaned.slice(0, -1);
      return 1_000;
    }
    if (last === 'M') {
      cleaned = cleaned.slice(0, -1);
      return 1_000_000;
    }
    if (last === 'B') {
      cleaned = cleaned.slice(0, -1);
      return 1_000_000_000;
    }
    return 1;
  })();
  // Now cleaned should be digits + maybe one decimal sep + thousands seps.
  // We can't always tell whether `,` or `.` is decimal, so use a heuristic:
  //   - if both appear, the last one is the decimal sep
  //   - else treat the only one as decimal sep ONLY if it has 1-2 trailing digits
  const lastComma = cleaned.lastIndexOf(',');
  const lastDot = cleaned.lastIndexOf('.');
  let normalized = cleaned;
  if (lastComma >= 0 && lastDot >= 0) {
    const decIdx = Math.max(lastComma, lastDot);
    const decSep = cleaned[decIdx];
    const thouSep = decSep === ',' ? '.' : ',';
    normalized = cleaned.split(thouSep).join('').replace(decSep, '.');
  } else if (lastComma >= 0) {
    const tail = cleaned.length - lastComma - 1;
    normalized = tail <= 2 ? cleaned.replace(',', '.') : cleaned.replace(/,/g, '');
  } else if (lastDot >= 0) {
    const tail = cleaned.length - lastDot - 1;
    // Heuristic: dot followed by exactly 3 digits → German thousands separator
    // (e.g. "1.000" = 1000, "1.234.567" = 1234567). Anything else (1.5, 0.42,
    // 1.5M already stripped) → English decimal.
    if (tail === 3) {
      normalized = cleaned.replace(/\./g, '');
    } else {
      normalized = cleaned;
    }
  }
  const n = Number(normalized);
  if (Number.isNaN(n)) return null;
  return n * mult;
}

export function variancePct(ltm: string, forecast: string): number | null {
  const a = parseNumeric(ltm);
  const b = parseNumeric(forecast);
  if (a == null || b == null || a === 0) return null;
  return ((b - a) / a) * 100;
}

function fmtVar(pct: number | null): string {
  if (pct == null) return '—';
  const sign = pct > 0 ? '+' : '';
  return `${sign}${pct.toFixed(1)}%`;
}

export function TopSKUsForecastTable({ rows, limit = 10, footnote }: Props) {
  const top = useMemo(() => {
    // Order: rank by forecastVolume desc when parsable, then primary flag.
    const withScore = rows.map((r) => ({
      r,
      score: parseNumeric(r.forecastVolume) ?? -1,
    }));
    withScore.sort((a, b) => {
      if (a.r.primary && !b.r.primary) return -1;
      if (!a.r.primary && b.r.primary) return 1;
      return b.score - a.score;
    });
    return withScore.slice(0, limit).map((x) => x.r);
  }, [rows, limit]);

  if (!top.length) return null;

  return (
    <section
      data-testid="top-skus-forecast"
      className="mb-4 rounded-[12px] border border-[var(--hairline)] bg-white shadow-[0_1px_2px_rgba(20,20,28,0.04)]"
    >
      <header className="border-b border-[var(--hairline)] px-4 py-3">
        <h3 className="font-display text-[15px] font-bold tracking-tight text-[var(--ink)]">
          Top SKUs by forecast
        </h3>
        <p className="text-[11.5px] text-[var(--muted)]">
          Ranked by forecast volume · top {Math.min(limit, top.length)} of {rows.length}
        </p>
      </header>
      <div className="overflow-x-auto">
        <table className="w-full text-[12.5px]" data-testid="top-skus-table">
          <thead>
            <tr className="border-b border-[var(--hairline)] text-left text-[10.5px] font-semibold uppercase tracking-wide text-[var(--muted)]">
              <th className="px-4 py-2">Article</th>
              <th className="px-4 py-2">Description</th>
              <th className="px-4 py-2 text-right">LTM volume</th>
              <th className="px-4 py-2 text-right">Forecast (next 12mo)</th>
              <th className="px-4 py-2 text-right">Variance</th>
              <th className="px-4 py-2">Margin</th>
              <th className="px-4 py-2">Confidence</th>
              <th className="px-4 py-2">Last override</th>
            </tr>
          </thead>
          <tbody>
            {top.map((r) => {
              const vPct = variancePct(r.ltmVolume, r.forecastVolume);
              const vTone =
                vPct == null
                  ? 'text-[var(--muted)]'
                  : vPct > 0
                    ? 'text-emerald-700'
                    : vPct < 0
                      ? 'text-rose-700'
                      : 'text-[var(--ink-2)]';
              return (
                <tr
                  key={r.aid}
                  className="border-b border-[var(--hairline)] last:border-0 hover:bg-[var(--surface-soft)]"
                  data-testid={`top-skus-row-${r.aid}`}
                >
                  <td className="px-4 py-2 font-mono text-[12px] font-semibold text-[var(--ink-2)]">
                    {r.aid}
                  </td>
                  <td className="px-4 py-2 text-[var(--ink-2)]">{r.desc}</td>
                  <td className="px-4 py-2 text-right font-mono text-[var(--ink-2)]">
                    {r.ltmVolume}
                  </td>
                  <td className="px-4 py-2 text-right font-mono font-semibold text-[var(--ink)]">
                    {r.forecastVolume}
                    <div className="text-[10.5px] font-normal text-[var(--muted)]">{r.band}</div>
                  </td>
                  <td className={`px-4 py-2 text-right font-mono font-semibold ${vTone}`}>
                    {fmtVar(vPct)}
                  </td>
                  <td className={`px-4 py-2 ${r.marginPos ? 'text-emerald-700' : 'text-[var(--ink-2)]'}`}>
                    {r.margin}
                  </td>
                  <td className="px-4 py-2 text-[var(--ink-2)]">{r.confLabel}</td>
                  <td className="px-4 py-2 text-[var(--muted)]">—</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      {footnote && (
        <footer className="border-t border-[var(--hairline)] px-4 py-2 text-[11px] text-[var(--muted)]">
          {footnote}
        </footer>
      )}
    </section>
  );
}
