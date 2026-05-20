// Pricing Studio v3 / Phase 11 — Active filters strip.
//
// Renders a chip per active deep-link / shell filter so the user can see what
// slice of the world the workbench is currently scoped to and clear them
// individually (or all at once). Reads directly from the URL search params
// so it stays in sync with `useStudio(...)`.

import { useMemo } from 'react';
import { useSearchParams } from 'react-router-dom';

interface ChipDef {
  key: string;
  label: string;
  value: string;
}

const QUEUE_LABELS: Record<string, string> = {
  churn: 'Churn risk',
  cost_riser: 'Cost riser',
  margin_erosion: 'Margin erosion',
};

const FILTER_KEYS: Array<{
  key: string;
  label: string;
  format?: (raw: string) => string;
}> = [
  { key: 'tier', label: 'Tier' },
  { key: 'family', label: 'Family' },
  { key: 'cluster', label: 'Cluster' },
  { key: 'scenario_id', label: 'Scenario' },
  { key: 'source', label: 'From' },
  { key: 'reason', label: 'Reason' },
  // Pricing Studio plan B3/B4 — surface the customer scope + queue chip
  // so Frank can see (and clear) the slice he landed on from Action Center.
  { key: 'customer', label: 'Customer' },
  {
    key: 'queue',
    label: 'Queue',
    format: (raw) => QUEUE_LABELS[raw] ?? raw,
  },
];

export function ActiveFiltersStrip() {
  const [params, setParams] = useSearchParams();

  const chips: ChipDef[] = useMemo(() => {
    const out: ChipDef[] = [];
    for (const { key, label, format } of FILTER_KEYS) {
      const value = params.get(key);
      if (value) out.push({ key, label, value: format ? format(value) : value });
    }
    return out;
  }, [params]);

  if (chips.length === 0) return null;

  const removeChip = (key: string) => {
    setParams(
      (prev) => {
        const next = new URLSearchParams(prev);
        next.delete(key);
        return next;
      },
      { replace: true },
    );
  };

  const clearAll = () => {
    setParams(
      (prev) => {
        const next = new URLSearchParams(prev);
        for (const { key } of FILTER_KEYS) next.delete(key);
        return next;
      },
      { replace: true },
    );
  };

  return (
    <div
      className="flex flex-wrap items-center gap-2 pb-2"
      data-testid="active-filters-strip"
      aria-label="Active filters"
    >
      <span className="text-xs uppercase tracking-wider text-stone-500">
        Filters
      </span>
      {chips.map((c) => (
        <span
          key={c.key}
          className="inline-flex items-center gap-1 rounded-full border border-stone-200 bg-rose-50/60 px-2.5 py-0.5 text-xs text-stone-700"
          data-testid={`active-filter-${c.key}`}
        >
          <span className="text-stone-500">{c.label}:</span>
          <b className="text-stone-800">{c.value}</b>
          <button
            type="button"
            onClick={() => removeChip(c.key)}
            aria-label={`Remove ${c.label} filter`}
            className="ml-0.5 rounded-full px-1 leading-none text-stone-500 hover:bg-stone-200 hover:text-stone-800"
            data-testid={`active-filter-${c.key}-remove`}
          >
            ×
          </button>
        </span>
      ))}
      {chips.length > 1 && (
        <button
          type="button"
          onClick={clearAll}
          className="text-xs text-stone-500 underline-offset-2 hover:underline"
          data-testid="active-filters-clear-all"
        >
          Clear all
        </button>
      )}
    </div>
  );
}
