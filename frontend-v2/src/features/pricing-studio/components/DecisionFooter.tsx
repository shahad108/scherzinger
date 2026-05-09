import { useState } from 'react';
import type { DecisionData } from '@/types/studio';
import { renderInline } from './renderInline';
import type { ActiveOptionView } from './PriceOptions';

interface Props {
  data: DecisionData;
  activeOption: ActiveOptionView | null;
}

export function DecisionFooter({ data, activeOption }: Props) {
  const [effectiveDate, setEffectiveDate] = useState(data.effectiveDate);
  const [notify, setNotify] = useState(data.notifyDefaults);

  const proposed = activeOption ? activeOption.price : data.summary.proposedPrice;

  return (
    <div className="ws-decision">
      <div className="ws-decision-summary">
        You're proposing <b>{proposed}</b> on Article <b>{data.summary.aid}</b> · projected margin{' '}
        <b>{data.summary.margin}</b> · projected recovery <b>{data.summary.recovery}</b> ·{' '}
        <b>{data.summary.riskLine}</b>.
      </div>
      <div className="ws-decision-controls">
        <label>
          Effective date{' '}
          <input
            type="date"
            value={effectiveDate}
            onChange={(e) => setEffectiveDate(e.target.value)}
          />
        </label>
        <label>
          <input
            type="checkbox"
            checked={notify.sales}
            onChange={(e) => setNotify((prev) => ({ ...prev, sales: e.target.checked }))}
          />
          {renderInline(data.notifyLabels.sales)}
        </label>
        <label>
          <input
            type="checkbox"
            checked={notify.customers}
            onChange={(e) => setNotify((prev) => ({ ...prev, customers: e.target.checked }))}
          />
          {renderInline(data.notifyLabels.customers)}
        </label>
        <label>
          <input
            type="checkbox"
            checked={notify.escalate}
            onChange={(e) => setNotify((prev) => ({ ...prev, escalate: e.target.checked }))}
          />
          {renderInline(data.notifyLabels.escalate)}
        </label>
        <label>
          <input
            type="checkbox"
            checked={notify.abTest}
            onChange={(e) => setNotify((prev) => ({ ...prev, abTest: e.target.checked }))}
          />
          {renderInline(data.notifyLabels.abTest)}
        </label>
      </div>
      <div className="ws-decision-buttons">
        <button type="button" className="btn primary">
          📌 Save as proposal
        </button>
        <button type="button" className="btn dark">
          ⚡ Push to quoting
        </button>
        <button type="button" className="btn">
          🗂 Add to weekly queue
        </button>
        <button type="button" className="btn">
          ↗ Escalate to Till
        </button>
        <button type="button" className="btn">
          📄 Branded PDF
        </button>
      </div>
    </div>
  );
}
