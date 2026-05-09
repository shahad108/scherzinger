import type { ForecastHeader } from '@/types/forecast';

interface Props {
  header: ForecastHeader;
}

export function PageHead({ header }: Props) {
  return (
    <>
      <div className="crumbs">
        <span>Cockpit</span>
        <span className="sep">/</span>
        <span>Pricing Analyst · Frank</span>
        <span className="sep">/</span>
        <b>Forecast</b>
      </div>

      <div className="page-head">
        <div>
          <h1>{header.greeting}</h1>
          <div className="page-sub">
            <span className="sub-pill">{header.subPill}</span>
            {header.stats.map((s) => (
              <span key={s.label} className="sub-stat">
                <b>{s.label}</b> {s.value}
              </span>
            ))}
            <span className="sub-stat">{header.modeLabel}</span>
          </div>
        </div>
        <div className="head-actions">
          {header.filters.map((f) => (
            <button key={f.label} type="button" className="head-pill">
              {f.label}
            </button>
          ))}
          <button type="button" className="btn-primary-rose">
            Generate forecast briefing →
          </button>
        </div>
      </div>
    </>
  );
}
