// Phase 14 P14.T3 — Saved views editor.
import { useState } from 'react';
import { Trash2 } from 'lucide-react';
import { useCreateSavedView, useDeleteSavedView, useSavedViews } from '@/data/api/useSettings';

const SCREENS = [
  'action-center',
  'margin-cockpit',
  'quotes',
  'forecast',
  'studio',
  'ai',
] as const;

export default function SavedViewsPage() {
  const { data, isLoading } = useSavedViews();
  const create = useCreateSavedView();
  const remove = useDeleteSavedView();
  const [screen, setScreen] = useState<typeof SCREENS[number]>('action-center');
  const [label, setLabel] = useState('');

  const submit = () => {
    if (!label.trim()) return;
    create.mutate(
      { screen, label: label.trim(), filters: {} },
      { onSuccess: () => setLabel('') },
    );
  };

  const items = data?.items ?? [];

  return (
    <div className="flex flex-col gap-6">
      <section>
        <h2 className="mb-2 text-[14px] font-bold text-[var(--ink)]">New saved view</h2>
        <div className="flex flex-wrap items-end gap-2">
          <label className="flex flex-col gap-1 text-[12px] text-[var(--muted)]">
            Screen
            <select
              value={screen}
              onChange={(e) => setScreen(e.target.value as typeof SCREENS[number])}
              className="rounded-[10px] border border-[var(--border)] bg-white px-3 py-2 text-[13px]"
            >
              {SCREENS.map((s) => (
                <option key={s} value={s}>{s}</option>
              ))}
            </select>
          </label>
          <label className="flex flex-1 flex-col gap-1 text-[12px] text-[var(--muted)] min-w-[200px]">
            Label
            <input
              type="text"
              value={label}
              onChange={(e) => setLabel(e.target.value)}
              placeholder="Margin watch — BKAES"
              className="rounded-[10px] border border-[var(--border)] bg-white px-3 py-2 text-[13px]"
            />
          </label>
          <button
            type="button"
            onClick={submit}
            disabled={create.isPending || !label.trim()}
            className="rounded-[10px] bg-[var(--rose)] px-4 py-2 text-[13px] font-semibold text-white disabled:opacity-50"
          >
            Save view
          </button>
        </div>
      </section>

      <section>
        <h2 className="mb-2 text-[14px] font-bold text-[var(--ink)]">Your saved views</h2>
        {isLoading ? (
          <div className="text-[13px] text-[var(--muted)]">Loading…</div>
        ) : items.length === 0 ? (
          <div className="text-[13px] text-[var(--muted)]">No saved views yet.</div>
        ) : (
          <ul className="flex flex-col gap-2">
            {items.map((v) => (
              <li
                key={v.id}
                className="flex items-center gap-3 rounded-[10px] border border-[var(--border)] bg-white px-3 py-2"
              >
                <span className="text-[11px] font-semibold uppercase tracking-wide text-[var(--muted)]">
                  {v.screen}
                </span>
                <span className="flex-1 text-[13px] font-semibold text-[var(--ink)]">
                  {v.label}
                  {v.is_default && (
                    <span className="ml-2 text-[11px] font-bold uppercase text-[var(--rose-deep)]">default</span>
                  )}
                </span>
                <button
                  type="button"
                  aria-label={`Delete ${v.label}`}
                  onClick={() => remove.mutate(v.id)}
                  className="grid h-8 w-8 place-items-center rounded-[8px] border border-transparent text-[var(--muted)] hover:bg-[var(--surface-soft)] hover:text-[var(--red)]"
                >
                  <Trash2 size={14} />
                </button>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
