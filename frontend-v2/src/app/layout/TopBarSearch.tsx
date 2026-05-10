import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Search, X, ArrowRight } from 'lucide-react';
import { useGlobalSearch, type SearchHit } from '@/data/api/useShellAdmin';

const KIND_LABEL: Record<SearchHit['kind'], string> = {
  article: 'SKU',
  customer: 'Customer',
  recommendation: 'Recommendation',
};

export function TopBarSearch() {
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);
  const popoverRef = useRef<HTMLDivElement>(null);

  const { data, isFetching } = useGlobalSearch(query);
  const hits = data?.results ?? [];

  // Open: focus the input. Close on outside click + Esc.
  useEffect(() => {
    if (!open) return;
    inputRef.current?.focus();
    const onClick = (e: MouseEvent) => {
      if (!popoverRef.current?.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false);
    };
    document.addEventListener('mousedown', onClick);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onClick);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  function handlePick(hit: SearchHit) {
    const usp = new URLSearchParams();
    for (const [k, v] of Object.entries(hit.query)) {
      if (v === undefined || v === null || v === '') continue;
      usp.set(k, String(v));
    }
    navigate(`${hit.route}${usp.toString() ? `?${usp}` : ''}`);
    setOpen(false);
    setQuery('');
  }

  return (
    <div className="relative" ref={popoverRef}>
      <button
        type="button"
        className="pz-pill pz-search"
        aria-label="Search SKUs, customers, clusters"
        onClick={() => setOpen((v) => !v)}
      >
        <Search size={14} />
        <span>Search SKUs, customers, clusters…</span>
      </button>

      {open && (
        <div className="absolute left-0 top-full z-50 mt-2 w-[420px] max-w-[calc(100vw-2rem)] rounded-xl border border-[var(--hairline)] bg-white p-3 shadow-[var(--shadow-pop)]">
          <div className="flex items-center gap-2 rounded-lg border border-[var(--hairline)] bg-[var(--surface-soft)] px-3 py-2">
            <Search size={14} className="text-[var(--muted)]" />
            <input
              ref={inputRef}
              type="search"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Article, customer id, recommendation…"
              className="flex-1 bg-transparent text-sm focus:outline-none"
            />
            {query && (
              <button
                type="button"
                aria-label="Clear"
                onClick={() => setQuery('')}
                className="rounded p-1 text-[var(--muted)] hover:bg-white hover:text-[var(--ink-2)]"
              >
                <X size={12} />
              </button>
            )}
          </div>

          <div className="mt-2 max-h-[320px] overflow-y-auto">
            {query.trim().length < 2 ? (
              <div className="px-2 py-3 text-[12px] text-[var(--muted)]">
                Type at least 2 characters to search across SKUs, customers, and recommendations.
              </div>
            ) : isFetching ? (
              <div className="px-2 py-3 text-[12px] text-[var(--muted)]">Searching…</div>
            ) : hits.length === 0 ? (
              <div className="px-2 py-3 text-[12px] text-[var(--muted)]">
                No matches for "{query}".
              </div>
            ) : (
              <ul className="flex flex-col gap-1">
                {hits.map((hit) => (
                  <li key={`${hit.kind}-${hit.id}`}>
                    <button
                      type="button"
                      onClick={() => handlePick(hit)}
                      className="flex w-full items-start gap-3 rounded-lg px-2 py-2 text-left transition-colors hover:bg-[var(--surface-soft)]"
                    >
                      <span className="mt-0.5 inline-flex items-center rounded-full bg-[var(--surface-soft)] px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-[var(--ink-2)]">
                        {KIND_LABEL[hit.kind]}
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-[13px] font-semibold text-[var(--ink)]">
                          {hit.title}
                        </span>
                        {hit.subtitle && (
                          <span className="block truncate text-[11.5px] text-[var(--muted)]">
                            {hit.subtitle}
                          </span>
                        )}
                      </span>
                      <ArrowRight size={12} className="mt-1 text-[var(--muted)]" />
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
