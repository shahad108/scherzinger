// Phase 14 P14.T6 — Per-user notes journal.
import { useState } from 'react';
import { Pin, Trash2 } from 'lucide-react';
import { useCreateNote, useDeleteNote, useNotes, usePatchNote } from '@/data/api/useSettings';

export default function NotesPage() {
  const [q, setQ] = useState('');
  const [draftTitle, setDraftTitle] = useState('');
  const [draftBody, setDraftBody] = useState('');
  const { data, isLoading } = useNotes(q || undefined);
  const create = useCreateNote();
  const patch = usePatchNote();
  const remove = useDeleteNote();

  const submit = () => {
    if (!draftBody.trim() && !draftTitle.trim()) return;
    create.mutate(
      { title: draftTitle.trim() || null, body: draftBody.trim() },
      {
        onSuccess: () => {
          setDraftTitle('');
          setDraftBody('');
        },
      },
    );
  };

  const items = data?.items ?? [];

  return (
    <div className="flex flex-col gap-5">
      <section>
        <h2 className="mb-2 text-[14px] font-bold text-[var(--ink)]">New note</h2>
        <div className="flex flex-col gap-2 max-w-xl">
          <input
            type="text"
            placeholder="Title (optional)"
            value={draftTitle}
            onChange={(e) => setDraftTitle(e.target.value)}
            className="rounded-[10px] border border-[var(--border)] bg-white px-3 py-2 text-[13px]"
          />
          <textarea
            rows={3}
            placeholder="Note body…"
            value={draftBody}
            onChange={(e) => setDraftBody(e.target.value)}
            className="rounded-[10px] border border-[var(--border)] bg-white px-3 py-2 text-[13px]"
          />
          <button
            type="button"
            onClick={submit}
            disabled={create.isPending || (!draftBody.trim() && !draftTitle.trim())}
            className="self-start rounded-[10px] bg-[var(--rose)] px-4 py-2 text-[13px] font-semibold text-white disabled:opacity-50"
          >
            Save note
          </button>
        </div>
      </section>

      <section>
        <div className="mb-2 flex items-center justify-between gap-2">
          <h2 className="text-[14px] font-bold text-[var(--ink)]">Your notes</h2>
          <input
            type="search"
            placeholder="Search…"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            className="rounded-[10px] border border-[var(--border)] bg-white px-3 py-1.5 text-[13px]"
          />
        </div>
        {isLoading ? (
          <div className="text-[13px] text-[var(--muted)]">Loading…</div>
        ) : items.length === 0 ? (
          <div className="text-[13px] text-[var(--muted)]">No notes.</div>
        ) : (
          <ul className="flex flex-col gap-2">
            {items.map((n) => (
              <li
                key={n.id}
                className="flex items-start gap-3 rounded-[10px] border border-[var(--border)] bg-white p-3"
              >
                <button
                  type="button"
                  aria-label={n.pinned ? 'Unpin' : 'Pin'}
                  onClick={() => patch.mutate({ id: n.id, body: { pinned: !n.pinned } })}
                  className={`grid h-7 w-7 place-items-center rounded-[8px] ${n.pinned ? 'text-[var(--rose-deep)]' : 'text-[var(--muted)] hover:bg-[var(--surface-soft)]'}`}
                >
                  <Pin size={14} />
                </button>
                <div className="flex-1 min-w-0">
                  {n.title && (
                    <div className="text-[13px] font-semibold text-[var(--ink)]">{n.title}</div>
                  )}
                  <div className="text-[12.5px] text-[var(--ink-2)] whitespace-pre-wrap">{n.body}</div>
                  <div className="mt-1 text-[11px] text-[var(--muted-2)]">
                    {n.updated_at ? new Date(n.updated_at).toLocaleString() : ''}
                  </div>
                </div>
                <button
                  type="button"
                  aria-label={`Delete note ${n.title ?? n.id}`}
                  onClick={() => remove.mutate(n.id)}
                  className="grid h-8 w-8 place-items-center rounded-[8px] text-[var(--muted)] hover:bg-[var(--surface-soft)] hover:text-[var(--red)]"
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
