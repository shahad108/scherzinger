import type { StudioHeader } from '@/types/studio';
import { FreshnessChip } from './FreshnessChip';

interface Props {
  header: StudioHeader;
  /**
   * Pricing Studio v3 / Phase 10 — canonical freshness timestamp from the BFF
   * studio shell. Renders a traffic-light <FreshnessChip /> next to the
   * existing "Updated" sub-stat.
   */
  dataThrough?: string | null;
}

export function PageHead({ header, dataThrough }: Props) {
  const [c1, c2, c3] = header.crumbs;
  return (
    <>
      <div className="crumbs">
        <span>{c1}</span>
        <span className="sep">/</span>
        <span>{c2}</span>
        <span className="sep">/</span>
        <b>{c3}</b>
      </div>

      <div className="page-head">
        <div>
          <h1>{header.title}</h1>
          <div className="page-sub">
            {header.subPills.map((p) => (
              <span key={p} className="sub-pill">
                {p}
              </span>
            ))}
            {header.subStats.map((s) => (
              <span key={s.label} className="sub-stat">
                <b>{s.value}</b> {s.label}
              </span>
            ))}
            <FreshnessChip dataThrough={dataThrough ?? null} />
          </div>
        </div>
        <div className="head-actions">
          {header.headPills.map((p) => (
            <button key={p.label} type="button" className="head-pill">
              {p.label}
            </button>
          ))}
        </div>
      </div>
    </>
  );
}
