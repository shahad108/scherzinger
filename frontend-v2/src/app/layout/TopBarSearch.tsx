import { Search } from 'lucide-react';
import { useUiAction } from '@/hooks/useUiAction';

export function TopBarSearch() {
  const runAction = useUiAction();

  return (
    <button
      type="button"
      className="pz-pill pz-search"
      aria-label="Search SKUs, customers, clusters"
      onClick={() =>
        runAction({
          drawer: {
            title: 'Search',
            description: 'Search will span SKUs, customers, clusters, quotes, and saved views. For now, use the direct screen routes below.',
            items: [
              { label: 'SKU lookup', value: 'Open Pricing Studio and pass an article id.' },
              { label: 'Customer view', value: 'Use Quotes or Forecasting customer sections.' },
              { label: 'Backend gap', value: 'Global search endpoint and typeahead results.' },
            ],
          },
          toast: 'Search panel opened',
          toastSeverity: 'info',
        })
      }
    >
      <Search size={14} />
      <span>Search SKUs, customers, clusters…</span>
    </button>
  );
}
