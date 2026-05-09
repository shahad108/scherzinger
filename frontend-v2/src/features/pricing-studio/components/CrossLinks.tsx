import type { CrossLink } from '@/types/studio';

interface Props {
  links: CrossLink[];
}

export function CrossLinks({ links }: Props) {
  return (
    <div className="studio-xlinks">
      <span className="ftxt">Cross-links →</span>
      <div className="links">
        {links.map((l) => (
          <button key={l.label} type="button" className="head-pill">
            {l.label}
          </button>
        ))}
      </div>
    </div>
  );
}
