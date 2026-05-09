import type { StudioHeader } from '@/types/studio';

interface Props {
  header: StudioHeader;
}

export function PageHead({ header }: Props) {
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
