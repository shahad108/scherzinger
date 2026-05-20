// Pricing Studio v3 / Phase 11 — Saved views dropdown for the Studio header.
//
// Lists the user's saved views for `screen=studio`, lets them restore one
// (which writes the saved filters back into the URL), or save the current
// filter quartet as a new view. Delete is exposed inline on each row.

import { useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import {
  useSavedViews,
  useCreateSavedView,
  useDeleteSavedView,
  type SavedView,
} from '@/data/api/useSettings';

const TRACKED_KEYS = [
  'aid',
  'tier',
  'family',
  'cluster',
  'scenario_id',
  'source',
  'reason',
  'mode',
  'batch_aids',
];

function captureCurrentFilters(params: URLSearchParams): Record<string, string> {
  const out: Record<string, string> = {};
  for (const k of TRACKED_KEYS) {
    const v = params.get(k);
    if (v) out[k] = v;
  }
  return out;
}

export function SavedViewsMenu() {
  const [open, setOpen] = useState(false);
  const [params, setParams] = useSearchParams();
  const { data, isLoading } = useSavedViews('studio');
  const createMut = useCreateSavedView();
  const deleteMut = useDeleteSavedView();

  const items = data?.items ?? [];

  const handleRestore = (view: SavedView) => {
    setParams(
      () => {
        const next = new URLSearchParams();
        for (const [k, v] of Object.entries(view.filters)) {
          if (typeof v === 'string' && v) next.set(k, v);
        }
        return next;
      },
      { replace: false },
    );
    setOpen(false);
  };

  const handleSaveCurrent = () => {
    const filters = captureCurrentFilters(params);
    if (Object.keys(filters).length === 0) {
      return;
    }
    // eslint-disable-next-line no-alert
    const label = window.prompt('Name this view:');
    if (!label || !label.trim()) return;
    createMut.mutate(
      { screen: 'studio', label: label.trim(), filters },
      {
        onSuccess: () => setOpen(false),
      },
    );
  };

  const handleDelete = (id: string) => {
    deleteMut.mutate(id);
  };

  return (
    <div className="relative" data-testid="saved-views-menu">
      <button
        type="button"
        className="head-pill"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        aria-haspopup="menu"
        data-testid="saved-views-trigger"
      >
        Saved views
        {items.length > 0 && (
          <span className="ml-1 rounded-full bg-stone-100 px-1.5 text-xs text-stone-600">
            {items.length}
          </span>
        )}
      </button>
      {open && (
        <div
          role="menu"
          className="absolute right-0 z-30 mt-1 w-72 rounded-xl border border-stone-200 bg-white p-2 shadow-lg"
          data-testid="saved-views-popover"
        >
          {isLoading && (
            <div className="px-2 py-1 text-xs text-stone-500">Loading…</div>
          )}
          {!isLoading && items.length === 0 && (
            <div
              className="px-2 py-1 text-xs text-stone-500"
              data-testid="saved-views-empty"
            >
              No saved views yet.
            </div>
          )}
          {items.map((view) => (
            <div
              key={view.id}
              className="flex items-center justify-between gap-2 rounded-md px-2 py-1.5 hover:bg-stone-50"
              data-testid={`saved-view-row-${view.id}`}
            >
              <button
                type="button"
                className="flex-1 text-left text-sm text-stone-800"
                onClick={() => handleRestore(view)}
                data-testid={`saved-view-restore-${view.id}`}
              >
                {view.label}
              </button>
              <button
                type="button"
                className="rounded p-1 text-xs text-stone-400 hover:text-rose-600"
                onClick={() => handleDelete(view.id)}
                aria-label={`Delete saved view ${view.label}`}
                data-testid={`saved-view-delete-${view.id}`}
              >
                ×
              </button>
            </div>
          ))}
          <div className="mt-1 border-t border-stone-100 pt-1">
            <button
              type="button"
              className="w-full rounded-md px-2 py-1.5 text-left text-sm text-rose-700 hover:bg-rose-50"
              onClick={handleSaveCurrent}
              data-testid="saved-views-save-current"
              disabled={createMut.isPending}
            >
              + Save current view…
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
