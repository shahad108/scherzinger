import type { InputCostTrajectory as InputCostTrajectoryData } from '@/types/forecast';

interface Props {
  data: InputCostTrajectoryData;
}

const TONE_COLOR: Record<string, string> = {
  red: 'var(--red)',
  green: 'var(--green)',
  amber: 'var(--amber)',
  'ink-3': 'var(--ink-3)',
};

function renderBold(text: string) {
  // Convert **bold** to <b>bold</b>
  const parts = text.split(/(\*\*[^*]+\*\*)/g);
  return parts.map((p, i) =>
    p.startsWith('**') && p.endsWith('**') ? (
      <b key={i} style={{ color: 'var(--ink)', fontWeight: 700 }}>
        {p.slice(2, -2)}
      </b>
    ) : (
      <span key={i}>{p}</span>
    ),
  );
}

export function InputCostTrajectory({ data }: Props) {
  const { tiles, stress } = data;

  return (
    <>
      <div className="section-row">
        <div>
          <h2>Input cost trajectory · next 12 months</h2>
          <div className="sub">
            Your revenue forecasts are net of these inputs. Pass-through % = how much is
            contractually indexed; the rest is absorbed in margin.
          </div>
        </div>
        <span className="tag-chip">LME · VDMA · Bundesnetzagentur</span>
      </div>

      <div className="trust-grid">
        {tiles.map((t) => (
          <div className="trust-tile" key={t.label}>
            <div className="lab">{t.label}</div>
            <div className="big">
              {t.value}
              <span style={{ fontSize: 12, color: 'var(--muted)', fontWeight: 500, letterSpacing: 0 }}>
                {t.unit}
              </span>
            </div>
            <div className="cap">
              <b style={{ color: TONE_COLOR[t.capRich.tone] }}>{t.capRich.arrow}</b> {t.capRich.main}{' '}
              <b>{t.capRich.rest}</b>
            </div>
          </div>
        ))}
      </div>

      <div className="signal-with-trend" style={{ marginTop: 14 }}>
        <div className="signal-pane">
          <div className="ttl">
            {stress.title}
            <span className="ttl-sub">— {stress.sub}</span>
          </div>
          <ul
            style={{
              margin: 0,
              padding: 0,
              listStyle: 'none',
              color: 'var(--ink-3)',
              fontSize: 12.5,
              lineHeight: 1.7,
            }}
          >
            {stress.bullets.map((b, i) => (
              <li key={i}>{renderBold(b)}</li>
            ))}
          </ul>
        </div>
        <div className="trend-pane">
          <div className="lab">{stress.centralLabel}</div>
          <div className="v" style={{ color: 'var(--red)' }}>
            {stress.centralValue}
          </div>
          <div style={{ fontSize: 11, color: 'var(--muted)', marginTop: 6, lineHeight: 1.4 }}>
            {stress.centralCaption}
          </div>
        </div>
      </div>
    </>
  );
}
