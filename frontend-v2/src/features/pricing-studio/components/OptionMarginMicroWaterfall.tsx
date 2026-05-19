// Pricing Studio v3 / Phase 3 — Per-option pocket waterfall.
//
// Renders a 5-row horizontal mini-waterfall (list → quoted → booked →
// invoiced → db2) inside each PriceOption card. Bar widths are computed
// from `value / list * 100%`. Colour: emerald for the db2 "pocket" row,
// warm-gray for upstream rows. Leakage is implied visually by the
// shrinking bar widths (the BFF ships absolute values; we don't recompute
// the leakage percentages on the client).
//
// Decimal-as-string is the contract; we parse once at the formatter
// boundary via `parseDecimal`. Missing data → `<DataMissingBadge>`.

import type { OptionMarginBlock } from '@/types/studio';
import { DataMissingBadge } from '@/components/DataMissingBadge';
import { LineageButton } from '@/components/LineageButton';
import { parseDecimal } from '../lib/decimal';
import { fmt } from '@/lib/format';

interface Props {
  /** Single resolved option-margin block (legacy API). */
  optionMargin?: OptionMarginBlock | null;
  /** Phase D6 — optional array; the component picks the row matching
   *  `activeOptionId` (or the first when null). Takes precedence over
   *  `optionMargin` when both are supplied. */
  optionMargins?: OptionMarginBlock[];
  /** Active variant identifier driven by the hero variant selector. */
  activeOptionId?: string | null;
  /** Compact stripe rendering — used inside compact PriceOptions row. */
  compact?: boolean;
  /** Optional accessible heading for screen readers (e.g. the option label). */
  label?: string;
}

interface Row {
  key: 'list' | 'quoted' | 'booked' | 'invoiced' | 'db2';
  label: string;
  value: number;
}

export function OptionMarginMicroWaterfall({
  optionMargin,
  optionMargins,
  activeOptionId,
  compact = false,
  label,
}: Props) {
  // Phase D6 — variant sync: if the parent passes an `optionMargins` array,
  // resolve the active option via `activeOptionId`. Fallback: first item.
  let resolved: OptionMarginBlock | null = optionMargin ?? null;
  if (optionMargins && optionMargins.length > 0) {
    const match =
      (activeOptionId && optionMargins.find((m) => m.option_id === activeOptionId)) || null;
    resolved = match ?? optionMargins[0] ?? null;
  }

  // When the caller is wiring the variant selector (array form) but the
  // active variant has no corresponding option_margin row, surface a
  // dedicated placeholder rather than the generic "cost data unavailable".
  if (!resolved && optionMargins) {
    return (
      <div className="ws-pocket ws-pocket--missing" data-testid="option-margin-missing">
        <DataMissingBadge reason="Margin breakdown unavailable for this variant" />
      </div>
    );
  }

  if (!resolved) {
    return (
      <div className="ws-pocket ws-pocket--missing" data-testid="option-margin-missing">
        <DataMissingBadge reason="cost data unavailable" />
      </div>
    );
  }

  const activeOptionMargin: OptionMarginBlock = resolved;

  const list = parseDecimal(activeOptionMargin.list);
  const quoted = parseDecimal(activeOptionMargin.quoted);
  const booked = parseDecimal(activeOptionMargin.booked);
  const invoiced = parseDecimal(activeOptionMargin.invoiced);
  const db2 = parseDecimal(activeOptionMargin.db2);

  // If list isn't a positive number we can't draw the waterfall (every
  // bar width is `value / list`). Surface the missing badge instead.
  if (!Number.isFinite(list) || list <= 0) {
    return (
      <div className="ws-pocket ws-pocket--missing" data-testid="option-margin-missing">
        <DataMissingBadge reason="invalid list price" />
      </div>
    );
  }

  const rows: Row[] = [
    { key: 'list', label: 'list', value: list },
    { key: 'quoted', label: 'quoted', value: quoted },
    { key: 'booked', label: 'booked', value: booked },
    { key: 'invoiced', label: 'invoiced', value: invoiced },
    { key: 'db2', label: 'DB2', value: db2 },
  ];

  // Pocket % = db2 / list × 100 (BFF doesn't ship this; it's a deterministic
  // function of the values above so deriving it client-side is safe and
  // keeps the wire payload tight).
  const pocketPct = Number.isFinite(db2) && db2 >= 0 ? (db2 / list) * 100 : null;

  return (
    <div
      className={`ws-pocket${compact ? ' ws-pocket--compact' : ''}`}
      data-testid="option-margin-waterfall"
      aria-label={label ? `Pocket waterfall — ${label}` : 'Pocket waterfall'}
    >
      <div className="ws-pocket-rows">
        {rows.map((row) => {
          const finite = Number.isFinite(row.value);
          const widthPct = finite ? Math.max(0, Math.min(100, (row.value / list) * 100)) : 0;
          const isPocket = row.key === 'db2';
          return (
            <div
              key={row.key}
              className={`ws-pocket-row ws-pocket-row--${row.key}`}
              data-row-key={row.key}
            >
              <span className="ws-pocket-name">{row.label}</span>
              <span className="ws-pocket-bar-wrap">
                <span
                  className={`ws-pocket-bar${isPocket ? ' ws-pocket-bar--pocket' : ''}`}
                  style={{ width: `${widthPct}%` }}
                  aria-hidden="true"
                />
              </span>
              <span className="ws-pocket-val tabular-nums">
                {finite ? fmt.eurPrecise(row.value) : '—'}
              </span>
            </div>
          );
        })}
      </div>
      <div className="ws-pocket-foot">
        {pocketPct !== null ? (
          <span className="ws-pocket-label">
            pocket <b>{pocketPct.toFixed(0)}%</b> of list
          </span>
        ) : (
          <span className="ws-pocket-label">pocket —</span>
        )}
        {/* The compact waterfall is rendered INSIDE the option-card
            <button> in PriceOptions; nesting another <button> here trips
            the React/HTML "<button> cannot contain a nested <button>"
            warning. The lineage CTA is still available from the
            non-compact pocket waterfall surfaces (Compare drawer,
            Simulation drawer). */}
        {!compact && activeOptionMargin.lineage_ref && (
          <LineageButton
            lineageRef={activeOptionMargin.lineage_ref}
            subjectTitle="Option pocket waterfall"
            label="lineage"
          />
        )}
      </div>
    </div>
  );
}
