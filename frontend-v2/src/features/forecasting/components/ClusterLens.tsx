import { useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import type { ClusterCard } from '@/types/forecast';
import { useForecastAnnotations } from '@/data/api/useForecastAnnotations';
import { AccuracyBadge } from './AccuracyBadge';
import { AnnotationPopover } from './AnnotationPopover';

interface Props {
  clusters: ClusterCard[];
}

export function ClusterLens({ clusters }: Props) {
  const [params, setParams] = useSearchParams();
  const activeCluster = params.get('cluster');

  // Phase H — annotation popover state, scoped to a single cluster card. The
  // accessible fallback (an "Add note" button) sits inside each card so the
  // feature is reachable without a mouse.
  const [annotation, setAnnotation] = useState<
    | { cluster: string; anchor: { x: number; y: number } }
    | null
  >(null);

  const { data: annotationsData } = useForecastAnnotations({});
  const annotationCountByCluster = useMemo(() => {
    const items = annotationsData?.items ?? [];
    const counts = new Map<string, number>();
    for (const a of items) {
      if (a.target.kind !== 'cluster') continue;
      counts.set(a.target.value, (counts.get(a.target.value) ?? 0) + 1);
    }
    return counts;
  }, [annotationsData]);

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
          const noteCount = annotationCountByCluster.get(c.id) ?? 0;
          return (
            <div
              className="round-card"
              key={c.id}
              role="button"
              tabIndex={0}
              data-testid={`cluster-card-${c.id}`}
              aria-pressed={isActive}
              onClick={() => onSelect(c.id)}
              onContextMenu={(e) => {
                // Phase H — right-click opens the annotation popover for this
                // cluster. preventDefault hides the OS context menu so the
                // popover replaces it cleanly.
                e.preventDefault();
                setAnnotation({ cluster: c.id, anchor: { x: e.clientX, y: e.clientY } });
              }}
              onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                  e.preventDefault();
                  onSelect(c.id);
                }
              }}
              style={isActive ? { outline: '2px solid var(--rose-deep)', cursor: 'pointer' } : { cursor: 'pointer' }}
            >
              <div className="rc-title" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 6 }}>
                <div>
                  <h3>{c.id}</h3>
                  <div className="sub">{c.ltm}</div>
                </div>
                {noteCount > 0 && (
                  <span
                    data-testid={`cluster-annotation-count-${c.id}`}
                    aria-label={`${noteCount} note${noteCount === 1 ? '' : 's'}`}
                    title={`${noteCount} note${noteCount === 1 ? '' : 's'}`}
                    style={{
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: 3,
                      padding: '1px 6px',
                      borderRadius: 10,
                      fontSize: 10,
                      fontWeight: 700,
                      color: 'var(--rose-deep, #a04055)',
                      background: 'var(--rose-soft, #fde6ea)',
                      border: '1px solid var(--rose-deep, #a04055)',
                      lineHeight: 1.4,
                    }}
                  >
                    ◷ {noteCount}
                  </span>
                )}
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
                  {/* Phase 4.5 audit fix #4: read real per-cluster MAPE from
                      c.mape (backend now ships it). Falls back to "—" when
                      missing (e.g. small/low-n clusters like MBDIV). */}
                  <AccuracyBadge
                    data={{
                      metric: 'mape',
                      value: c.mape ?? null,
                      n: 36,
                      horizonMonths: 12,
                      clusterId: c.id,
                      modelId: c.model ?? 'margin_walk_forward_v3',
                    }}
                    entityType="commodity_group"
                    entityId={c.id}
                    drawerTitle={`${c.id} — lineage`}
                  />
                </span>
              </div>
              {/* Phase H — accessible "Add note" button so the annotation
                  popover is reachable without a right-click. preventDefault
                  on click bubble stops the card's onClick (which toggles the
                  cluster filter) from firing. */}
              <button
                type="button"
                data-testid={`cluster-add-annotation-${c.id}`}
                onClick={(e) => {
                  e.stopPropagation();
                  setAnnotation({ cluster: c.id, anchor: { x: e.clientX, y: e.clientY } });
                }}
                aria-label={`Add note for ${c.id}`}
                style={{
                  marginTop: 8,
                  alignSelf: 'flex-end',
                  background: 'transparent',
                  border: '1px solid var(--hairline)',
                  borderRadius: 5,
                  padding: '2px 7px',
                  fontSize: 10,
                  fontWeight: 600,
                  color: 'var(--muted)',
                  cursor: 'pointer',
                  letterSpacing: '0.02em',
                  fontFamily: 'inherit',
                }}
              >
                + Add note
              </button>
            </div>
          );
        })}
      </div>

      {annotation && (
        <AnnotationPopover
          anchor={annotation.anchor}
          target={{ kind: 'cluster', value: annotation.cluster }}
          onClose={() => setAnnotation(null)}
        />
      )}
    </>
  );
}
