// Pricing Studio v3 / Phase 8 — Compare options drawer.
//
// 640px right-rail drawer that puts hold / recommended / custom side by
// side. Reads from already-fetched workbench data:
//
//   - price                : from PriceOptionsBundle.{hold,floor,custom}
//   - DB2 at price          : from option_margins[option_id].db2
//   - win probability       : interpolated from win_prob_curve.points
//   - 12mo revenue Δ        : derived from win-prob × (price - hold) × ltm
//   - customers at risk     : count of fanout rows with tone=alert when
//                             that option's price is above customer's
//                             paid band (best-effort approximation)
//   - routing               : TODO — backend doesn't yet expose a
//                             per-option route summary; renders "—" until
//                             v3.1 ships that field.

import { useMemo, useState } from 'react';
import { Drawer } from '@/components/ui/Drawer';
import { fmt } from '@/lib/format';
import { parseDecimal, pctFromFraction } from '@/features/pricing-studio/lib/decimal';
import { useCreateProposal } from '@/data/api/useProposals';
import { useUiAction } from '@/hooks/useUiAction';
import type {
  OptionMarginBlock,
  PriceOptionsBundle,
  WinProbCurveBlock,
  CustomerFanoutBlock,
} from '@/types/studio';

export interface CompareDrawerProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  aid: string;
  options: PriceOptionsBundle;
  optionMargins?: OptionMarginBlock[];
  winProbCurve?: WinProbCurveBlock | null;
  customerFanout?: CustomerFanoutBlock | null;
  /** "€118" or just "118.00" — parsed for the hold baseline. */
  currentPriceLabel: string;
  /** Optional custom-row override (the user's typed price). */
  customPrice?: string | null;
  /** Recommendation id to attribute the draft proposal to (Phase H). */
  recommendationId?: string | null;
}

export function CompareDrawer({
  open,
  onOpenChange,
  aid,
  options,
  optionMargins,
  winProbCurve,
  customerFanout,
  currentPriceLabel,
  customPrice,
  recommendationId,
}: CompareDrawerProps) {
  return (
    <Drawer
      open={open}
      onOpenChange={onOpenChange}
      side="right"
      width={640}
      title={`Compare options · ${aid}`}
    >
      {open && (
        <CompareDrawerBody
          aid={aid}
          options={options}
          optionMargins={optionMargins}
          winProbCurve={winProbCurve}
          customerFanout={customerFanout}
          currentPriceLabel={currentPriceLabel}
          customPrice={customPrice}
          recommendationId={recommendationId ?? null}
          onClose={() => onOpenChange(false)}
        />
      )}
    </Drawer>
  );
}

interface BodyProps extends Omit<CompareDrawerProps, 'open' | 'onOpenChange'> {
  onClose: () => void;
}

interface ColumnSpec {
  key: 'hold' | 'recommended' | 'custom';
  header: string;
  priceLabel: string;
  /** Decimal-as-string parsed from priceLabel. */
  priceValue: number;
  optionMarginId: string; // matches OptionMarginBlock.option_id
}

function priceLabelToNumber(label: string | null | undefined): number {
  if (!label) return Number.NaN;
  const cleaned = label.replace(/[€,\s]/g, '').replace(/−/g, '-');
  return parseDecimal(cleaned);
}

function interpolateWinProb(
  curve: WinProbCurveBlock | null | undefined,
  price: number,
): number | null {
  if (!curve || !curve.points || curve.points.length === 0 || !Number.isFinite(price)) {
    return null;
  }
  const grid = curve.points
    .map((p) => ({ price: parseDecimal(p.price), wp: parseDecimal(p.win_prob) }))
    .filter((p) => Number.isFinite(p.price) && Number.isFinite(p.wp))
    .sort((a, b) => a.price - b.price);
  if (grid.length === 0) return null;
  if (price <= grid[0].price) return grid[0].wp;
  if (price >= grid[grid.length - 1].price) return grid[grid.length - 1].wp;
  for (let i = 0; i < grid.length - 1; i++) {
    const lo = grid[i];
    const hi = grid[i + 1];
    if (price >= lo.price && price <= hi.price) {
      const span = hi.price - lo.price;
      if (span === 0) return lo.wp;
      const t = (price - lo.price) / span;
      return lo.wp + t * (hi.wp - lo.wp);
    }
  }
  return null;
}

function CompareDrawerBody({
  aid,
  options,
  optionMargins,
  winProbCurve,
  customerFanout,
  currentPriceLabel,
  customPrice,
  recommendationId,
  onClose,
}: BodyProps) {
  const holdPriceN = priceLabelToNumber(currentPriceLabel || options.hold.price);
  const recPriceN = priceLabelToNumber(options.floor.price);
  const customPriceN = parseDecimal(customPrice ?? '');

  const createProposal = useCreateProposal();
  const runUiAction = useUiAction();
  const [pendingKey, setPendingKey] = useState<ColumnSpec['key'] | null>(null);
  const [errorByKey, setErrorByKey] = useState<Record<string, string | null>>({});

  function handleSetAsProposal(c: ColumnSpec) {
    if (!Number.isFinite(c.priceValue)) return;
    if (!Number.isFinite(holdPriceN)) return;
    // No-op proposals make no sense.
    if (c.priceValue === holdPriceN) return;
    const proposed = c.priceValue.toFixed(2);
    const current = holdPriceN.toFixed(2);
    setPendingKey(c.key);
    setErrorByKey((m) => ({ ...m, [c.key]: null }));
    createProposal.mutate(
      {
        article_id: aid,
        proposed_price: proposed,
        current_price: current,
        recommendation_id: recommendationId ?? null,
        payload: {
          source: 'compare_drawer',
          option_label: c.optionMarginId,
          note: null,
        },
      },
      {
        onSuccess: () => {
          setPendingKey(null);
          runUiAction({ toast: 'Draft proposal created' });
          onClose();
        },
        onError: (err) => {
          setPendingKey(null);
          setErrorByKey((m) => ({
            ...m,
            [c.key]: (err as Error).message || 'Could not create proposal.',
          }));
        },
      },
    );
  }

  const columns: ColumnSpec[] = useMemo(
    () => [
      {
        key: 'hold',
        header: 'Hold',
        priceLabel: `€${Number.isFinite(holdPriceN) ? holdPriceN.toFixed(2) : '—'}`,
        priceValue: holdPriceN,
        optionMarginId: 'hold',
      },
      {
        key: 'recommended',
        header: 'Recommended',
        priceLabel: `€${Number.isFinite(recPriceN) ? recPriceN.toFixed(2) : '—'}`,
        priceValue: recPriceN,
        optionMarginId: 'floor',
      },
      {
        key: 'custom',
        header: 'Custom',
        priceLabel: Number.isFinite(customPriceN) ? `€${customPriceN.toFixed(2)}` : '—',
        priceValue: customPriceN,
        optionMarginId: 'custom',
      },
    ],
    [holdPriceN, recPriceN, customPriceN],
  );

  const annualUnits = useMemo(() => {
    if (!customerFanout) return null;
    return customerFanout.rows.reduce((acc, r) => acc + (r.ltm_units || 0), 0);
  }, [customerFanout]);

  return (
    <div className="flex h-full flex-col" data-testid="compare-drawer-body">
      <header className="border-b border-gray-100 px-6 py-4">
        <p className="text-[11px] uppercase tracking-wide text-gray-500">
          Compare · {aid}
        </p>
        <h3 className="mt-0.5 text-base font-semibold text-gray-900">
          Hold vs Recommended vs Custom
        </h3>
        <p className="mt-1 text-xs text-gray-500">
          Pulled from option-margin and win-probability blocks. No new fetches.
        </p>
      </header>

      <div className="flex-1 overflow-y-auto px-6 py-4">
        <table
          className="w-full text-sm tabular-nums"
          data-testid="compare-table"
        >
          <thead>
            <tr className="text-left text-xs uppercase tracking-wide text-gray-500">
              <th className="w-44 py-2 font-medium">Metric</th>
              {columns.map((c) => (
                <th key={c.key} className="py-2 font-medium text-gray-700">
                  {c.header}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="text-gray-800">
            {/* Price */}
            <tr className="border-t border-gray-100">
              <td className="py-2 text-xs font-medium text-gray-500">Price</td>
              {columns.map((c) => (
                <td key={c.key} className="py-2 font-semibold">
                  {c.priceLabel}
                </td>
              ))}
            </tr>

            {/* DB2 at price */}
            <tr className="border-t border-gray-100">
              <td className="py-2 text-xs font-medium text-gray-500">DB2 at price</td>
              {columns.map((c) => {
                const om = optionMargins?.find((o) => o.option_id === c.optionMarginId);
                const db2 = om ? parseDecimal(om.db2) : Number.NaN;
                return (
                  <td key={c.key} className="py-2">
                    {Number.isFinite(db2) ? pctFromFraction(db2, 1) : '—'}
                  </td>
                );
              })}
            </tr>

            {/* Win prob */}
            <tr className="border-t border-gray-100">
              <td className="py-2 text-xs font-medium text-gray-500">Win prob</td>
              {columns.map((c) => {
                const wp = interpolateWinProb(winProbCurve, c.priceValue);
                return (
                  <td key={c.key} className="py-2">
                    {wp === null ? '—' : `${Math.round(wp * 100)}%`}
                  </td>
                );
              })}
            </tr>

            {/* 12mo revenue delta */}
            <tr className="border-t border-gray-100">
              <td className="py-2 text-xs font-medium text-gray-500">12mo revenue Δ</td>
              {columns.map((c) => {
                if (!Number.isFinite(c.priceValue) || !Number.isFinite(holdPriceN)) {
                  return (
                    <td key={c.key} className="py-2">
                      —
                    </td>
                  );
                }
                if (c.key === 'hold' || annualUnits === null) {
                  return (
                    <td key={c.key} className="py-2">
                      {c.key === 'hold' ? '0' : '—'}
                    </td>
                  );
                }
                const wpHold = interpolateWinProb(winProbCurve, holdPriceN) ?? 0;
                const wpThis = interpolateWinProb(winProbCurve, c.priceValue) ?? 0;
                // Crude: annualised lift = units × (wpThis - wpHold) × price-delta.
                const lift = annualUnits * wpThis * c.priceValue - annualUnits * wpHold * holdPriceN;
                return (
                  <td
                    key={c.key}
                    className={lift >= 0 ? 'py-2 text-emerald-700' : 'py-2 text-rose-700'}
                  >
                    {lift >= 0 ? '+' : '−'}
                    {fmt.eur(Math.abs(Math.round(lift)))}
                  </td>
                );
              })}
            </tr>

            {/* Customers at risk */}
            <tr className="border-t border-gray-100">
              <td className="py-2 text-xs font-medium text-gray-500">Customers at risk</td>
              {columns.map((c) => {
                if (!customerFanout || !Number.isFinite(c.priceValue)) {
                  return (
                    <td key={c.key} className="py-2">
                      —
                    </td>
                  );
                }
                if (c.key === 'hold') {
                  return (
                    <td key={c.key} className="py-2">
                      0
                    </td>
                  );
                }
                const atRisk = customerFanout.rows.filter((r) => {
                  if (!r.paid_band) return false;
                  const p90 = parseDecimal(r.paid_band.p90);
                  return Number.isFinite(p90) && c.priceValue > p90;
                }).length;
                return (
                  <td
                    key={c.key}
                    className={atRisk > 0 ? 'py-2 text-amber-700' : 'py-2'}
                  >
                    {atRisk}
                  </td>
                );
              })}
            </tr>

            {/* Routing — TODO until backend exposes per-option routing summary. */}
            <tr className="border-t border-gray-100" data-testid="compare-routing-row">
              <td className="py-2 text-xs font-medium text-gray-500">Routing</td>
              {columns.map((c) => (
                <td key={c.key} className="py-2 text-gray-400">
                  —
                </td>
              ))}
            </tr>

            {/* Phase H — "Set as proposal" inline CTA per column. */}
            <tr
              className="border-t border-gray-100"
              data-testid="compare-set-as-proposal-row"
            >
              <td className="py-2 text-xs font-medium text-gray-500">Action</td>
              {columns.map((c) => {
                const disabled =
                  !Number.isFinite(c.priceValue) ||
                  !Number.isFinite(holdPriceN) ||
                  c.priceValue === holdPriceN ||
                  pendingKey !== null;
                const isPending = pendingKey === c.key;
                const err = errorByKey[c.key] ?? null;
                return (
                  <td key={c.key} className="py-2 align-top">
                    <button
                      type="button"
                      data-testid={`compare-set-as-proposal-${c.key}`}
                      onClick={() => handleSetAsProposal(c)}
                      disabled={disabled}
                      className="inline-flex items-center gap-1 rounded-md border border-[var(--hairline,#e5e7eb)] bg-white px-2.5 py-1 text-[11px] font-medium text-[var(--ink-2,#374151)] transition-colors hover:border-[var(--rose-deep,#be123c)] hover:text-[var(--rose-deep,#be123c)] disabled:cursor-not-allowed disabled:opacity-50 disabled:hover:border-[var(--hairline,#e5e7eb)] disabled:hover:text-[var(--ink-2,#374151)]"
                    >
                      {isPending ? 'Setting…' : 'Set as proposal'}
                      {!isPending && (
                        <span aria-hidden="true" className="text-[10px] leading-none">
                          ›
                        </span>
                      )}
                    </button>
                    {err && (
                      <div
                        data-testid={`compare-set-as-proposal-${c.key}-error`}
                        className="mt-1 text-[10px] text-rose-700"
                      >
                        {err}
                      </div>
                    )}
                  </td>
                );
              })}
            </tr>
          </tbody>
        </table>

        <p className="mt-4 text-[11px] text-gray-500">
          Routing column is a placeholder. v3.1 will populate it once the
          BFF exposes a per-option approval-rule summary alongside
          {' '}<code>option_margins</code>.
        </p>
      </div>
    </div>
  );
}
