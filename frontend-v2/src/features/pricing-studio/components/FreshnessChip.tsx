// Pricing Studio v3 / Phase 10 — Freshness chip.
//
// Traffic-light data-freshness pill driven by the canonical `dataThrough`
// timestamp the BFF attaches to the studio shell (and forecasting payload).
//
//   • Green (emerald) — `now - dataThrough < 24h`
//   • Amber           — `24h ≤ now - dataThrough < 72h`
//   • Rose            — `now - dataThrough ≥ 72h`
//
// The chip surfaces a short "Data through {date}" label with a colored dot
// prefix and a tooltip explaining the threshold. Renders a muted "Data
// freshness unknown" state when the timestamp is missing/invalid so the
// header slot never collapses.

import type { CSSProperties } from 'react';

interface Props {
  /** Canonical ISO datetime returned by the BFF. */
  dataThrough?: string | null;
  /** Optional override for the rendered short-date label. */
  label?: string;
}

interface Tone {
  /** UI label ("fresh"/"aging"/"stale"/"unknown"). */
  level: 'fresh' | 'aging' | 'stale' | 'unknown';
  /** Tailwind dot color class. */
  dot: string;
  /** Tailwind pill bg class. */
  bg: string;
  /** Tailwind pill fg class. */
  fg: string;
  /** Tooltip explanation. */
  tooltip: string;
}

const TOOLTIPS: Record<Tone['level'], string> = {
  fresh:
    'Fresh — last ingest within the last 24 hours. Cost state, invoice ledger, and competitor signals are all current.',
  aging:
    'Aging — last ingest between 24 and 72 hours old. Acceptable for most decisions; revisit before publishing.',
  stale:
    'Stale — last ingest more than 72 hours old. Treat numbers as indicative only; check the audit log before approving.',
  unknown:
    'Data freshness unknown — the BFF did not return a dataThrough timestamp.',
};

export function freshnessTone(iso: string | null | undefined, now: Date = new Date()): Tone {
  if (!iso) {
    return {
      level: 'unknown',
      dot: 'bg-[var(--muted)]',
      bg: 'bg-[var(--surface-soft)]',
      fg: 'text-[var(--ink-3)]',
      tooltip: TOOLTIPS.unknown,
    };
  }
  const parsed = Date.parse(iso);
  if (!Number.isFinite(parsed)) {
    return {
      level: 'unknown',
      dot: 'bg-[var(--muted)]',
      bg: 'bg-[var(--surface-soft)]',
      fg: 'text-[var(--ink-3)]',
      tooltip: TOOLTIPS.unknown,
    };
  }
  const ageHours = (now.getTime() - parsed) / 3_600_000;
  if (ageHours < 24) {
    return {
      level: 'fresh',
      dot: 'bg-emerald-500',
      bg: 'bg-emerald-50',
      // Phase K5: emerald-800 meets ≥4.5:1 on emerald-50 (small chip text).
      fg: 'text-emerald-800',
      tooltip: TOOLTIPS.fresh,
    };
  }
  if (ageHours < 72) {
    return {
      level: 'aging',
      dot: 'bg-amber-500',
      bg: 'bg-amber-50',
      // Phase K5: amber-900 meets ≥4.5:1 on amber-50.
      fg: 'text-amber-900',
      tooltip: TOOLTIPS.aging,
    };
  }
  return {
    level: 'stale',
    dot: 'bg-rose-500',
    bg: 'bg-rose-50',
    // Phase K5: rose-800 meets ≥4.5:1 on rose-50.
    fg: 'text-rose-800',
    tooltip: TOOLTIPS.stale,
  };
}

function formatShortDate(iso: string | null | undefined): string {
  if (!iso) return 'unknown';
  const t = Date.parse(iso);
  if (!Number.isFinite(t)) return 'unknown';
  const d = new Date(t);
  // Short, locale-independent label: YYYY-MM-DD.
  const yyyy = d.getUTCFullYear();
  const mm = String(d.getUTCMonth() + 1).padStart(2, '0');
  const dd = String(d.getUTCDate()).padStart(2, '0');
  return `${yyyy}-${mm}-${dd}`;
}

export function FreshnessChip({ dataThrough, label }: Props) {
  const tone = freshnessTone(dataThrough ?? null);
  const shortDate = label ?? formatShortDate(dataThrough ?? null);
  const text = tone.level === 'unknown' ? 'Data freshness unknown' : `Data through ${shortDate}`;
  // Inline style keeps the dot color consistent even if tailwind purges the class.
  const dotStyle: CSSProperties = { width: 6, height: 6, borderRadius: 9999 };
  return (
    <span
      data-testid="freshness-chip"
      data-freshness={tone.level}
      title={tone.tooltip}
      role="status"
      aria-label={`${text}. ${tone.tooltip}`}
      className={`inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-[10.5px] font-semibold uppercase tracking-wide ${tone.bg} ${tone.fg}`}
    >
      <span aria-hidden="true" className={tone.dot} style={dotStyle} />
      <span>{text}</span>
    </span>
  );
}
