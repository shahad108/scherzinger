import type { CostPane, HistoryRow } from '@/types/studio';
import { renderInline } from './renderInline';

interface Props {
  cost: CostPane;
  history: HistoryRow[];
}

export function CostHistory({ cost, history }: Props) {
  return (
    <div className="ws-pane">
      <h4>
        Cost composition <span className="ws-pane-sub">{renderInline(cost.paneSub)}</span>
      </h4>
      <div className="ws-cost">
        {cost.components.map((c) => (
          <div className="ws-cost-row" key={c.key}>
            <span className="ws-cost-name">{c.name}</span>
            <span className="ws-cost-bar">
              <span className={`ws-cost-fill ${c.key}`} style={{ width: `${c.pct}%` }} />
            </span>
            <span className="ws-cost-pct">{c.pct}%</span>
          </div>
        ))}
      </div>
      <p className="ws-cost-foot">
        {cost.note} For full cost-vs-price 24-mo trajectory see <a href="#">Margin Intelligence</a>.
      </p>

      <div className="ws-cost-traj">
        <div className="ws-cost-traj-head">
          <span>{cost.trajectory.title}</span>
          <span className="delta-bad">{cost.trajectory.delta}</span>
        </div>
        <svg
          viewBox="0 0 240 38"
          width="100%"
          height="38"
          preserveAspectRatio="none"
          style={{ display: 'block' }}
        >
          <polyline
            fill="none"
            stroke="#5a7da3"
            strokeWidth="2"
            points={cost.trajectory.materialPoints}
          />
          <polyline
            fill="none"
            stroke="#101418"
            strokeWidth="2"
            strokeDasharray="3 3"
            points={cost.trajectory.quotedPoints}
          />
          <text x="4" y="36" fontSize="8" fill="#4a5360">
            {cost.trajectory.yearStart}
          </text>
          <text x="220" y="36" fontSize="8" fill="#4a5360">
            {cost.trajectory.yearEnd}
          </text>
        </svg>
        <div className="ws-cost-traj-foot">
          <span className="leg-rose">— Material cost</span> ·{' '}
          <span className="leg-ink">— Quoted price</span> · {cost.trajectory.legend}
        </div>
      </div>

      <h4 className="row2">
        Repricing history <span className="ws-pane-sub">this SKU only · audit-hash signed</span>
      </h4>
      {history.length > 0 ? (
        <div className="ws-history">
          {history.map((h) => (
            <div className="ws-hist-row" key={`${h.date}-${h.hash}`}>
              <span className="ws-hist-date">{h.date}</span>
              <span className="ws-hist-move">{h.move}</span>
              <span className={`ws-hist-vol ${h.volTone}`}>{h.vol}</span>
              <span className="ws-hist-by">
                {h.by} · <code>{h.hash}</code>
              </span>
            </div>
          ))}
        </div>
      ) : (
        <p className="cluster-note" style={{ marginTop: 4 }}>
          <i style={{ fontStyle: 'normal', color: 'var(--ink-2)', fontWeight: 600 }}>
            No prior repricings.
          </i>{' '}
          New SKU — see the <b>Comparable-cluster pricing</b> panel below for the suggested band.
        </p>
      )}
    </div>
  );
}
