import { useSearchParams } from 'react-router-dom';
import type { ClusterCard } from '@/types/forecast';
import { AccuracyBadge } from './AccuracyBadge';

interface Props {
  clusters: ClusterCard[];
}

export function ClusterLens({ clusters }: Props) {
  const [params, setParams] = useSearchParams();
  const activeCluster = params.get('cluster');

  const onSelect = (id: string) => {
    const next = new URLSearchParams(params);
    if (activeCluster === id) {
      next.delete('cluster');
    } else {
      next.set('cluster', id);
    }
    setParams(next, { replace: true });
  };

  return (
    <>
      <div className="section-row">
        <div>
          <h2>Per-cluster forecast lens</h2>
          <div className="sub">
            Heterogeneous portfolio diagnostics — cluster-level forecast bands &amp; confidence.
            Click to filter the main chart.
          </div>
        </div>
        <span className="tag-chip">Heterogeneous portfolio</span>
      </div>

      <div className="round-grid" style={{ gridTemplateColumns: 'repeat(4, 1fr)' }}>
        {clusters.map((c) => {
          const toneCls = c.tone === 'status' ? 'status' : `status ${c.tone}`;
          const isActive = activeCluster === c.id;
          return (
            <div
              className="round-card"
              key={c.id}
              role="button"
              tabIndex={0}
              data-testid={`cluster-card-${c.id}`}
              aria-pressed={isActive}
              onClick={() => onSelect(c.id)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                  e.preventDefault();
                  onSelect(c.id);
                }
              }}
              style={isActive ? { outline: '2px solid var(--rose-deep)', cursor: 'pointer' } : { cursor: 'pointer' }}
            >
              <div className="rc-title">
                <h3>{c.id}</h3>
                <div className="sub">{c.ltm}</div>
              </div>
              <div
                style={{
                  fontFamily: "'Manrope', sans-serif",
                  fontSize: 24,
                  fontWeight: 700,
                  color: 'var(--ink)',
                  letterSpacing: '-0.02em',
                }}
              >
                {c.forecast}
              </div>
              <div style={{ fontSize: 11.5, color: 'var(--muted)' }}>{c.bandText}</div>
              <div className="round-tags">
                <span className={`tag-chip ${toneCls}`}>{c.confidence}</span>
                <span onClick={(e) => e.stopPropagation()} role="presentation">
                  <AccuracyBadge
                    data={{
                      metric: 'mape',
                      value: 0.0688,
                      n: 36,
                      horizonMonths: 12,
                      clusterId: c.id,
                      modelId: 'margin_walk_forward_v3',
                    }}
                    entityType="commodity_group"
                    entityId={c.id}
                    drawerTitle={`${c.id} — lineage`}
                  />
                </span>
              </div>
            </div>
          );
        })}
      </div>
    </>
  );
}
