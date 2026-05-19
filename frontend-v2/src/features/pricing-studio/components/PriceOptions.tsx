import { useEffect, useState } from 'react';
import type {
  ActiveAbTestSummary,
  OptionMarginBlock,
  PriceOptionsBundle,
} from '@/types/studio';
import { OptionMarginMicroWaterfall } from './OptionMarginMicroWaterfall';
import { ABTestCard } from './ABTestCard';

export type ActiveOpt = 'hold' | 'floor' | 'market' | 'custom' | 'abtest';

export interface ActiveOptionView {
  id: ActiveOpt;
  price: string;
  label: string;
}

interface Props {
  /**
   * The price-options bundle from the workbench. Can be `undefined` while
   * the workbench query is loading or when the BFF reports a non-live
   * status for the `options` block — the component renders an empty-state
   * card in that case rather than crashing on missing nested fields.
   */
  options: PriceOptionsBundle | undefined;
  optionsSub: string | undefined;
  onActiveChange?: (view: ActiveOptionView) => void;
  /**
   * Pricing Studio v3 / Phase 1 — render in the demoted, compact row state
   * below the new RecommendationHero. Hides the "Why this price?" link
   * (the hero owns that CTA now) and tightens the heading copy.
   */
  compact?: boolean;
  /**
   * Pricing Studio v3 / Phase 3 — per-option pocket waterfall data from the
   * BFF. Keyed by `option_id` ("hold" / "floor" / "market" / "custom" /
   * "recommendation"). Missing entries surface a DataMissingBadge inside
   * the option card.
   */
  optionMargins?: OptionMarginBlock[];
  /**
   * Pricing Studio v3 / Phase 8 — backing aid + active A/B summary. When
   * present, the A/B card switches from setup form → scoring strip.
   */
  aid?: string;
  activeAbTest?: ActiveAbTestSummary | null;
  /** Fires when the user clicks "Simulate this option" on a card. */
  onSimulateOption?: (variantPrice: string) => void;
  /** Fires when the user clicks the "Compare options" toggle. */
  onOpenCompare?: () => void;
  /** Fires after a successful A/B test create. */
  onAbTestCreated?: (testId: string) => void;
  /** Pre-filled control price for the A/B card. */
  abTestControlPrice?: string;
  /** Pre-filled variant price for the A/B card. */
  abTestVariantPrice?: string;
}

function findOptionMargin(margins: OptionMarginBlock[] | undefined, optionId: string) {
  if (!margins) return null;
  return margins.find((m) => m.option_id === optionId) ?? null;
}

export function PriceOptions({
  options,
  optionsSub,
  onActiveChange,
  compact = false,
  optionMargins,
  aid,
  activeAbTest,
  onSimulateOption,
  onOpenCompare,
  onAbTestCreated,
  abTestControlPrice,
  abTestVariantPrice,
}: Props) {
  const [active, setActive] = useState<ActiveOpt>('floor');
  const [customPrice, setCustomPrice] = useState('');
  // Track whether the user has actually interacted with an option card.
  // Until then we hold the visual highlight on 'floor' (the recommended
  // anchor) but suppress `onActiveChange` so downstream consumers — most
  // importantly the DecisionFooter — don't render an always-on
  // "You're proposing …" banner before the user has picked anything.
  const [hasInteracted, setHasInteracted] = useState(false);

  // Guard every nested-field access so a non-live `options` block can't
  // crash the page. When the bundle is missing required fields we render
  // an empty-state card below.
  const hasOptions =
    !!options &&
    !!options.hold &&
    !!options.floor &&
    !!options.market;

  useEffect(() => {
    if (!onActiveChange || !hasOptions || !options) return;
    if (!hasInteracted) return;
    if (active === 'hold') {
      onActiveChange({ id: 'hold', price: options.hold.price, label: 'hold' });
    } else if (active === 'floor') {
      onActiveChange({ id: 'floor', price: options.floor.price, label: 'cost-floor' });
    } else if (active === 'market') {
      onActiveChange({ id: 'market', price: options.market.price, label: 'market anchor' });
    } else if (active === 'abtest') {
      onActiveChange({ id: 'abtest', price: options.floor.price, label: 'A/B vs hold' });
    } else if (active === 'custom') {
      const price = customPrice ? `€${customPrice}` : '€—';
      onActiveChange({ id: 'custom', price, label: 'custom' });
    }
  }, [active, customPrice, options, hasOptions, hasInteracted, onActiveChange]);

  const pickOption = (id: ActiveOpt) => {
    setActive(id);
    setHasInteracted(true);
  };

  if (!hasOptions || !options) {
    return (
      <div
        className="ws-options-empty"
        role="note"
        data-testid="price-options-empty"
        style={{
          margin: '14px 0',
          padding: '14px 16px',
          borderRadius: 12,
          background: 'var(--surface-sunken)',
          border: '1px dashed var(--hairline)',
          color: 'var(--ink-2)',
          fontSize: 12.5,
          lineHeight: 1.45,
        }}
      >
        <div
          style={{
            fontWeight: 700,
            color: 'var(--ink)',
            fontSize: 12,
            marginBottom: 4,
          }}
        >
          Price options unavailable
        </div>
        <div>
          {optionsSub
            ? optionsSub
            : 'Workbench hasn’t resolved an option set for this SKU yet — try refreshing or selecting another SKU.'}
        </div>
      </div>
    );
  }

  // Empty-state strings are intentionally terse so the Custom card stays
  // visually balanced with the other three cards. We avoid the stray "·
  // —" pattern that read as broken/missing data in production audits.
  const customDelta = customPrice
    ? `+€${customPrice.padEnd(1)} · custom`
    : 'Type a target price';
  const customImpact = customPrice
    ? '€recovery · per-unit'
    : 'Annual recovery modelled on commit';
  const customRisk = customPrice
    ? 'churn risk · per-unit modelled'
    : 'Churn risk modelled on commit';

  return (
    <>
      <div className="ws-options-head">
        <h4>{compact ? 'Alternatives' : 'Pick a target price'}</h4>
        <span className="ws-opts-sub">
          {optionsSub}
          {/* "Why this price?" link removed in the 2026-05-19 coherence
              pass — the same CTA is already on the RecommendationHero
              (header pill + inline expander). Dropping it here removes
              the third duplicate. */}
          {onOpenCompare && (
            <>
              {' · '}
              <button
                type="button"
                className="link-btn"
                onClick={onOpenCompare}
                data-testid="open-compare"
              >
                ⇄ Compare options
              </button>
            </>
          )}
        </span>
      </div>
      <div className={`ws-options${compact ? ' ws-options--compact' : ''}`}>
        {/* Phase K5 a11y: SimulateLink (a real <button>) must NOT be nested
            inside the option <button>. Each option's button and its optional
            SimulateLink share a `.ws-opt-cell` wrapper so they read as one
            visual unit (the link sits flush under its card) rather than
            floating between cards as red orphan text. */}
        <div className="ws-opt-cell">
          <button
            type="button"
            aria-pressed={active === 'hold'}
            className={`ws-opt hold${active === 'hold' ? ' active' : ''}`}
            onClick={() => pickOption('hold')}
          >
            <span className="ws-opt-lab">Hold</span>
            <span className="ws-opt-price">{options.hold.price}</span>
            <span className="ws-opt-delta">{options.hold.delta}</span>
            <span className={`ws-opt-impact ${options.hold.impactTone ?? ''}`}>
              {options.hold.impact}
            </span>
            <span className="ws-opt-risk">
              {options.hold.risk.split(' · ').map((seg, i, arr) => (
                <span key={i}>
                  {i === arr.length - 1 ? <i>{seg}</i> : seg}
                  {i < arr.length - 1 ? ' · ' : ''}
                </span>
              ))}
            </span>
            <OptionMarginMicroWaterfall
              optionMargin={findOptionMargin(optionMargins, 'hold')}
              compact={compact}
              label="Hold"
            />
          </button>
          {onSimulateOption && (
            <SimulateLink
              onClick={() => onSimulateOption(parsePriceLabel(options.hold.price))}
            />
          )}
        </div>

        <div className="ws-opt-cell">
          <button
            type="button"
            aria-pressed={active === 'floor'}
            className={`ws-opt${active === 'floor' ? ' active' : ''}`}
            onClick={() => pickOption('floor')}
          >
            <span className="ws-opt-lab">Cost-floor</span>
            <span className="ws-opt-price">{options.floor.price}</span>
            <span className="ws-opt-delta">{options.floor.delta}</span>
            <span className={`ws-opt-impact ${options.floor.impactTone ?? ''}`}>
              {options.floor.impact}
            </span>
            <span className="ws-opt-risk">
              {options.floor.risk.split(' · ').map((seg, i, arr) => (
                <span key={i}>
                  {i === arr.length - 1 ? <i>{seg}</i> : seg}
                  {i < arr.length - 1 ? ' · ' : ''}
                </span>
              ))}
            </span>
            <OptionMarginMicroWaterfall
              optionMargin={findOptionMargin(optionMargins, 'floor')}
              compact={compact}
              label="Cost-floor"
            />
          </button>
          {onSimulateOption && (
            <SimulateLink
              onClick={() => onSimulateOption(parsePriceLabel(options.floor.price))}
            />
          )}
        </div>

        <div className="ws-opt-cell">
          <button
            type="button"
            aria-pressed={active === 'market'}
            className={`ws-opt${active === 'market' ? ' active' : ''}`}
            onClick={() => pickOption('market')}
          >
            <span className="ws-opt-lab">Market anchor</span>
            <span className="ws-opt-price">{options.market.price}</span>
            <span className="ws-opt-delta">{options.market.delta}</span>
            <span className={`ws-opt-impact ${options.market.impactTone ?? ''}`}>
              {options.market.impact}
            </span>
            <span className="ws-opt-risk">
              {options.market.risk.split(' · ').map((seg, i, arr) => (
                <span key={i}>
                  {i === arr.length - 1 ? <i>{seg}</i> : seg}
                  {i < arr.length - 1 ? ' · ' : ''}
                </span>
              ))}
            </span>
            <OptionMarginMicroWaterfall
              optionMargin={findOptionMargin(optionMargins, 'market')}
              compact={compact}
              label="Market anchor"
            />
          </button>
          {onSimulateOption && (
            <SimulateLink
              onClick={() => onSimulateOption(parsePriceLabel(options.market.price))}
            />
          )}
        </div>

        {/* Phase K5 a11y: the Custom card holds a real <input>, so it
            cannot itself be an interactive element (would be nested-
            interactive). Activation flows from focus / change on the
            input. SimulateLink sits as a sibling below. */}
        <div className="ws-opt-cell">
          <div
            className={`ws-opt custom${active === 'custom' ? ' active' : ''}`}
          >
            <span className="ws-opt-lab">Custom</span>
            <label className="ws-custom-input">
              <span>€</span>
              <input
                type="number"
                step="0.01"
                aria-label="Custom price"
                placeholder={options.customPlaceholder}
                value={customPrice}
                onFocus={() => pickOption('custom')}
                onChange={(e) => {
                  setCustomPrice(e.target.value);
                  pickOption('custom');
                }}
              />
            </label>
            <span className="ws-opt-delta">{customDelta}</span>
            <span className="ws-opt-impact">{customImpact}</span>
            <span className="ws-opt-risk">{customRisk}</span>
            <OptionMarginMicroWaterfall
              optionMargin={findOptionMargin(optionMargins, 'custom')}
              compact={compact}
              label="Custom"
            />
          </div>
          {onSimulateOption && customPrice && (
            <SimulateLink onClick={() => onSimulateOption(customPrice)} />
          )}
        </div>
      </div>

      {aid && (
        <div className="mt-3">
          <ABTestCard
            aid={aid}
            defaultControlPrice={abTestControlPrice ?? options.hold.price}
            defaultVariantPrice={abTestVariantPrice ?? options.floor.price}
            activeTest={activeAbTest ?? null}
            onCreated={onAbTestCreated}
          />
        </div>
      )}
    </>
  );
}

// Strip "€127.00" / "€ 127" / "127,00" → "127.00" so the simulate callback
// always receives a plain decimal string.
function parsePriceLabel(label: string | null | undefined): string {
  if (!label) return '';
  return label.replace(/[€\s]/g, '').replace(/,/g, '.');
}

interface SimulateLinkProps {
  onClick: () => void;
}

function SimulateLink({ onClick }: SimulateLinkProps) {
  return (
    <button
      type="button"
      onClick={(e) => {
        e.stopPropagation();
        onClick();
      }}
      className="ws-opt-sim-link"
      data-testid="simulate-option"
    >
      <span aria-hidden="true" className="ws-opt-sim-icon">↗</span>
      Simulate
    </button>
  );
}
