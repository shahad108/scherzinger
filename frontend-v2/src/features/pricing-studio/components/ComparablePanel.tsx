import type { ComparablePanel as Data } from '@/types/studio';
import { renderInline } from './renderInline';

interface Props {
  data: Data;
}

export function ComparablePanel({ data }: Props) {
  // Phase K4 — explicit empty handling so a sparse BFF response renders a
  // locked-style placeholder rather than a silently broken grid.
  const tiles = data?.tiles ?? [];
  const others = data?.others ?? [];
  if (tiles.length === 0) {
    return (
      <div
        className="ws-comparable"
        data-testid="comparable-panel-empty"
        style={{
          padding: 16,
          borderRadius: 'var(--r-md)',
          background: 'var(--surface-sunken)',
          color: 'var(--ink-3)',
          fontSize: 12,
        }}
      >
        <div className="ws-comparable-head">
          <h4>{data?.title ?? 'Comparable cluster pricing'}</h4>
          <span className="sub">{data?.subtitle ?? ''}</span>
        </div>
        <p style={{ margin: '8px 0 0' }}>
          No comparable cluster data yet for this SKU.
        </p>
      </div>
    );
  }
  return (
    <div className="ws-comparable">
      <div className="ws-comparable-head">
        <h4>{data.title}</h4>
        <span className="sub">{data.subtitle}</span>
      </div>
      <div className="wsc-grid">
        {tiles.map((t, i) => (
          <div key={i} className={`wsc-tile${t.variant !== 'plain' ? ` ${t.variant}` : ''}`}>
            <div className="lab">{t.lab}</div>
            <div className="big">{t.big}</div>
            <div className="cap">{renderInline(t.cap)}</div>
            {t.capExtra && (
              <div className="cap" style={{ color: 'var(--muted)', marginTop: 4 }}>
                {t.capExtra}
              </div>
            )}
            {t.conf && <div className="conf">{t.conf}</div>}
          </div>
        ))}
      </div>
      <div className="ws-comparable-others">
        <span className="lab">Other new SKUs:</span>
        {others.map((o, i) => (
          <span key={i} className={`tag-chip${o.warn ? ' status amber' : ''}`}>
            {o.text}
          </span>
        ))}
      </div>
      <p className="ws-comparable-foot">
        {renderInline(data.source)}
        <a href="#" style={{ color: 'var(--rose-deep)', fontWeight: 600 }}>
          {data.jumpLink.text}
        </a>
        .
      </p>
    </div>
  );
}
