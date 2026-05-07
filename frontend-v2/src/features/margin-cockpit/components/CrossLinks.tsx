import { Link } from 'react-router-dom';
import type { CrossLink } from '@/types';

interface Props {
  links: CrossLink[];
}

export function CrossLinks({ links }: Props) {
  return (
    <div className="mt-4 flex flex-wrap items-center gap-3 rounded-2xl border border-[var(--hairline)] bg-white px-4 py-3">
      <span className="text-[12px] font-semibold uppercase tracking-wider text-[var(--muted)]">Cross-links →</span>
      <div className="flex flex-wrap gap-2">
        {links.map((l) => (
          <Link
            key={l.label}
            to={l.jumpTo}
            className="rounded-full border border-[var(--hairline)] bg-white px-3 py-1 text-[12px] font-semibold text-[var(--ink-2)] hover:bg-[var(--surface-soft)]"
          >
            {l.label}
          </Link>
        ))}
      </div>
    </div>
  );
}
