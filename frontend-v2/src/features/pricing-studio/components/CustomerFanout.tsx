import type { FanoutPane } from '@/types/studio';
import { renderInline } from './renderInline';

interface Props {
  data: FanoutPane;
  fanPrice: string;
}

export function CustomerFanout({ data, fanPrice }: Props) {
  return (
    <div className="ws-pane">
      <h4>
        Customer fan-out · this SKU only
        <span className="ws-pane-sub">
          if priced at <b>{fanPrice}</b> ({data.paneSub.match(/\(([^)]+)\)/)?.[1] ?? 'cost-floor'})
        </span>
      </h4>
      <p className="cluster-note">{renderInline(data.clusterNote)}</p>
      <div className="ws-fanout">
        {data.rows.map((r) => (
          <div key={r.customer} className={`ws-fan-row${r.rowTone !== 'plain' ? ` ${r.rowTone}` : ''}`}>
            <span className={`tier-chip ${r.tier}`}>{r.tier}</span>
            <span className="ws-fan-cust">
              {r.customer}
              <span className="ws-fan-sub">
                {r.customerSub}
                {r.customerSubExtra && (
                  <>
                    {' · '}
                    <i style={{ color: 'var(--rose-deep)' }}>{r.customerSubExtra}</i>
                  </>
                )}
              </span>
            </span>
            <span className="ws-fan-num">
              {r.amount}
              <span className="ws-fan-sub">{r.amountSub}</span>
            </span>
            <span className="ws-fan-churn">
              <span className={`n ${r.churnTone}`}>{r.churnPct}</span>
              <span className="l">churn risk</span>
            </span>
            <span className="ws-fan-rec">{r.recommendation}</span>
          </div>
        ))}
      </div>
      <p className="ws-fan-note">
        {data.footNote} · <a href="#">show all</a>
      </p>
    </div>
  );
}
