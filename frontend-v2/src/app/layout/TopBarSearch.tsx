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
  const [query, setQuery] = useState('');
  const [focused, setFocused] = useState(false);
  const wrapRef = useRef<HTMLDivElement>(null);

  const { data, isFetching } = useGlobalSearch(query);
  const hits = data?.results ?? [];
  const showDropdown = focused && query.trim().length > 0;

  useEffect(() => {
    if (!focused) return;
    const onClick = (e: MouseEvent) => {
      if (!wrapRef.current?.contains(e.target as Node)) setFocused(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setFocused(false);
    };
    document.addEventListener('mousedown', onClick);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onClick);
      document.removeEventListener('keydown', onKey);
    };
  }, [focused]);

  function handlePick(hit: SearchHit) {
    const usp = new URLSearchParams();
    for (const [k, v] of Object.entries(hit.query)) {
      if (v === undefined || v === null || v === '') continue;
      usp.set(k, String(v));
    }
    navigate(`${hit.route}${usp.toString() ? `?${usp}` : ''}`);
    setFocused(false);
    setQuery('');
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === 'Enter' && hits.length > 0) {
      e.preventDefault();
      handlePick(hits[0]);
    }
  }

  return (
    <div className="relative" ref={wrapRef}>
      <label
        className="pz-pill pz-search inline-flex items-center gap-2"
        htmlFor="topbar-search-input"
      >
        <Search size={14} />
        <input
          id="topbar-search-input"
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onFocus={() => setFocused(true)}
          onKeyDown={handleKeyDown}
          placeholder="Search SKUs, customers, clusters…"
          aria-label="Search SKUs, customers, clusters"
          autoComplete="off"
          className="flex-1 border-0 bg-transparent text-[13px] text-[var(--ink-2)] placeholder:text-[var(--muted-2)] focus:outline-none"
          style={{ minWidth: 220 }}
        />
        {query && (
          <button
            type="button"
            aria-label="Clear"
            onMouseDown={(e) => e.preventDefault()}
            onClick={() => {
              setQuery('');
              document.getElementById('topbar-search-input')?.focus();
            }}
            className="rounded p-0.5 text-[var(--muted)] hover:bg-black/5 hover:text-[var(--ink-2)]"
          >
            <X size={12} />
          </button>
        )}
      </label>

      {showDropdown && (
        <div className="absolute left-0 top-full z-50 mt-2 w-[420px] max-w-[calc(100vw-2rem)] overflow-hidden rounded-xl border border-[var(--hairline)] bg-white shadow-[var(--shadow-pop)]">
          <div className="max-h-[320px] overflow-y-auto p-2">
            {query.trim().length < 2 ? (
              <div className="px-2 py-3 text-[12px] text-[var(--muted)]">
                Keep typing — at least 2 characters to search SKUs, customers, and recommendations.
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
                      onMouseDown={(e) => e.preventDefault()}
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
          {hits.length > 0 && (
            <div className="border-t border-[var(--hairline)] bg-[var(--surface-soft)] px-3 py-1.5 text-[10.5px] text-[var(--muted)]">
              ↵ Enter to open · Esc to close
            </div>
          )}
        </div>
      )}
    </div>
  );
}
