import { Search } from 'lucide-react';

export function TopBarSearch() {
  return (
    <button type="button" className="pz-pill pz-search" aria-label="Search SKUs, customers, clusters">
      <Search size={14} />
      <span>Search SKUs, customers, clusters…</span>
    </button>
  );
}
