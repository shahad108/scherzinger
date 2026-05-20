import { Link } from 'react-router-dom';
import type { QuotesCrossLink } from '@/types/quotes';

interface Props {
  links: QuotesCrossLink[];
}

export function CrossLinks({ links }: Props) {
  return (
    <div className="mt-4 flex flex-wrap items-center justify-between gap-2.5 rounded-[14px] border border-[var(--border)] bg-white px-4.5 py-3.5 shadow-[var(--shadow-card)]">
      <span className="text-[12px] font-semibold text-[var(--muted)]">Cross-links →</span>
      <div className="flex flex-wrap gap-1.5">
        {links.map((l) => (
          <Link
            key={l.label}
            to={l.jumpTo}
            className="flex h-9 items-center gap-1.5 rounded-[11px] border border-[var(--hairline)] bg-white px-3.5 text-[12.5px] font-semibold text-[var(--ink-2)] transition-colors hover:bg-[#f7f9fb]"
          >
            {l.label}
          </Link>
        ))}
      </div>
    </div>
  );
}
