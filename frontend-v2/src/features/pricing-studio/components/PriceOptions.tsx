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
  options: PriceOptionsBundle;
  optionsSub: string;
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

  useEffect(() => {
    if (!onActiveChange) return;
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
  }, [active, customPrice, options, onActiveChange]);

  const customDelta = customPrice
    ? `+€${customPrice.padEnd(1)} · custom`
    : 'type a value';
  const customImpact = customPrice ? '€recovery · per-unit' : '€recovery · —';
  const customRisk = customPrice ? 'churn risk · per-unit modelled' : 'churn risk · —';

  return (
    <>
      <div className="ws-options-head">
        <h4>{compact ? 'Alternatives' : 'Pick a target price'}</h4>
        <span className="ws-opts-sub">
          {optionsSub}
          {!compact && (
            <>
              {' · '}
              <button type="button" className="link-btn">
                🔍 Why this price?
              </button>
            </>
          )}
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
        <button
          type="button"
          className={`ws-opt hold${active === 'hold' ? ' active' : ''}`}
          onClick={() => setActive('hold')}
        >
          <span className="ws-opt-lab">Hold</span>
          <span className="ws-opt-price">{options.hold.price}</span>
          <span className="ws-opt-delta">{options.hold.delta}</span>
          <span className={`ws-opt-impact${options.hold.impactTone === 'neg' ? ' neg' : ''}`}>
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
          {onSimulateOption && (
            <SimulateLink
              onClick={() => onSimulateOption(parsePriceLabel(options.hold.price))}
            />
          )}
        </button>

        <button
          type="button"
          className={`ws-opt${active === 'floor' ? ' active' : ''}`}
          onClick={() => setActive('floor')}
        >
          <span className="ws-opt-lab">Cost-floor</span>
          <span className="ws-opt-price">{options.floor.price}</span>
          <span className="ws-opt-delta">{options.floor.delta}</span>
          <span className={`ws-opt-impact${options.floor.impactTone === 'neg' ? ' neg' : ''}`}>
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
          {onSimulateOption && (
            <SimulateLink
              onClick={() => onSimulateOption(parsePriceLabel(options.floor.price))}
            />
          )}
        </button>

        <button
          type="button"
          className={`ws-opt${active === 'market' ? ' active' : ''}`}
          onClick={() => setActive('market')}
        >
          <span className="ws-opt-lab">Market anchor</span>
          <span className="ws-opt-price">{options.market.price}</span>
          <span className="ws-opt-delta">{options.market.delta}</span>
          <span className={`ws-opt-impact${options.market.impactTone === 'neg' ? ' neg' : ''}`}>
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
          {onSimulateOption && (
            <SimulateLink
              onClick={() => onSimulateOption(parsePriceLabel(options.market.price))}
            />
          )}
        </button>

        <div
          role="button"
          tabIndex={0}
          className={`ws-opt custom${active === 'custom' ? ' active' : ''}`}
          onClick={() => setActive('custom')}
          onKeyDown={(e) => {
            if (e.key === 'Enter' || e.key === ' ') setActive('custom');
          }}
        >
          <span className="ws-opt-lab">Custom</span>
          <span className="ws-custom-input">
            <span>€</span>
            <input
              type="number"
              step="0.01"
              placeholder={options.customPlaceholder}
              value={customPrice}
              onChange={(e) => {
                setCustomPrice(e.target.value);
                setActive('custom');
              }}
              onClick={(e) => e.stopPropagation()}
            />
          </span>
          <span className="ws-opt-delta">{customDelta}</span>
          <span className="ws-opt-impact">{customImpact}</span>
          <span className="ws-opt-risk">{customRisk}</span>
          <OptionMarginMicroWaterfall
            optionMargin={findOptionMargin(optionMargins, 'custom')}
            compact={compact}
            label="Custom"
          />
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
      className="ws-opt-sim-link mt-1 text-[10px] uppercase tracking-wide text-rose-600 hover:underline"
      data-testid="simulate-option"
    >
      Simulate this option
    </button>
  );
}
