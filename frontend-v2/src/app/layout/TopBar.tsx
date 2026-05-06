import { Search, Settings2 } from 'lucide-react';
import { useDensity } from '@/hooks/useDensity';
import { PersonaSwitcher } from './PersonaSwitcher';

export function TopBar() {
  const { density, setDensity } = useDensity();
  return (
    <header className="flex h-14 items-center gap-4 border-b border-[var(--border-subtle)] bg-white px-6">
      <div className="relative w-80">
        <Search
          size={14}
          className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-gray-400"
        />
        <input
          type="search"
          placeholder="Suchen…"
          className="w-full rounded-md border border-[var(--border-subtle)] bg-gray-50 py-1.5 pl-8 pr-3 text-sm focus:bg-white focus:outline-none focus:ring-2 focus:ring-rose-500/40"
        />
      </div>
      <div className="ml-auto flex items-center gap-3">
        <button
          onClick={() => setDensity(density === 'cozy' ? 'compact' : 'cozy')}
          className="flex items-center gap-1.5 rounded-md border border-[var(--border-subtle)] px-2.5 py-1 text-xs font-medium text-gray-700 hover:bg-gray-50"
          title="Dichte umschalten"
        >
          <Settings2 size={12} />
          {density === 'cozy' ? 'Cozy' : 'Compact'}
        </button>
        <PersonaSwitcher />
      </div>
    </header>
  );
}
