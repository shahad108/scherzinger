import { useEffect, useState } from 'react';
import type { PriceOptionsBundle } from '@/types/studio';

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
}

export function PriceOptions({ options, optionsSub, onActiveChange }: Props) {
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
        <h4>Pick a target price</h4>
        <span className="ws-opts-sub">
          {optionsSub} ·{' '}
          <button type="button" className="link-btn">
            🔍 Why this price?
          </button>
        </span>
      </div>
      <div className="ws-options">
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
        </div>

        <button
          type="button"
          className={`ws-opt abtest${active === 'abtest' ? ' active' : ''}`}
          onClick={() => setActive('abtest')}
        >
          <span className="ws-opt-lab">🧪 Slice as A/B</span>
          <span className="ws-opt-price" style={{ fontSize: 18 }}>
            {options.abtest.slice}
          </span>
          <span className="ws-opt-delta">{options.abtest.meta}</span>
          <span className="ws-opt-impact violet">{options.abtest.takeaway}</span>
          <span className="ws-opt-risk">{options.abtest.criterion}</span>
        </button>
      </div>
    </>
  );
}
