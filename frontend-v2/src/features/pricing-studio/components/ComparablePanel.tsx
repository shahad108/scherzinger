import type { ComparablePanel as Data } from '@/types/studio';
import { renderInline } from './renderInline';

interface Props {
  data: Data;
}

export function ComparablePanel({ data }: Props) {
  return (
    <div className="ws-comparable">
      <div className="ws-comparable-head">
        <h4>{data.title}</h4>
        <span className="sub">{data.subtitle}</span>
      </div>
      <div className="wsc-grid">
        {data.tiles.map((t, i) => (
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
        {data.others.map((o, i) => (
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
