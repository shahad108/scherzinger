import { useState } from 'react';
import { useCreateSavedView } from '@/data/api/useShellAdmin';
import type { ActionDrawerContext } from '@/types/uiActions';
import { FormDrawerShell, FieldLabel, HelpText } from './FormDrawerShell';

/**
 * Phase 7 — save the current screen filters as a named view. The
 * filters payload is opaque on the server; today we serialize the
 * Action Center's `hide_locked` + `cluster` + `limit` shape, but
 * any screen can drop its own dict in via the drawer context.
 */
interface SavedViewContext extends ActionDrawerContext {
  /** Screen the view belongs to (one of the backend allow-list). */
  screen?: string;
  /** Filters to persist; serialized verbatim. */
  filters?: Record<string, unknown>;
}

interface Props {
  context: SavedViewContext;
  onClose: () => void;
  onToast: (message: string, severity?: 'info' | 'success' | 'warning' | 'error') => void;
}

export function SavedViewSaveForm({ context, onClose, onToast }: Props) {
  const create = useCreateSavedView();
  const [label, setLabel] = useState('');
  const [makeDefault, setMakeDefault] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const screen = context.screen ?? 'action-center';
  const filters = context.filters ?? {};

  const validationError = label.trim().length < 2 ? 'Name the view (≥ 2 characters).' : null;

  function submit() {
    setError(null);
    create.mutate(
      {
        screen,
        label: label.trim(),
        filters,
        is_default: makeDefault,
      },
      {
        onSuccess: (row) => {
          onToast(`Saved view "${row.label}".`, 'success');
          onClose();
        },
        onError: (err) => setError((err as Error).message),
      },
    );
  }

  const filterEntries = Object.entries(filters).filter(([, v]) => v !== undefined && v !== null && v !== '');

  return (
    <FormDrawerShell
      title="Save current view"
      description={`Persist the active filters on the ${screen} screen so you can return to this lens later.`}
      submitLabel="Save view"
      submitting={create.isPending}
      error={error ?? validationError}
      disabled={Boolean(validationError)}
      onSubmit={submit}
      onCancel={onClose}
    >
      <div className="space-y-4">
        <div>
          <FieldLabel>View name</FieldLabel>
          <input
            type="text"
            value={label}
            onChange={(e) => setLabel(e.target.value)}
            className="w-full rounded-lg border border-[var(--hairline)] bg-white px-3 py-2 text-sm focus:border-[var(--ink-2)] focus:outline-none"
            placeholder="e.g. Movable BKAES this week"
            autoFocus
          />
        </div>
        <label className="flex items-start gap-2 text-[12.5px] text-[var(--ink-2)]">
          <input
            type="checkbox"
            checked={makeDefault}
            onChange={(e) => setMakeDefault(e.target.checked)}
            className="mt-0.5"
          />
          <span>Make this my default view for {screen}.</span>
        </label>
        <div>
          <FieldLabel>Filters captured</FieldLabel>
          {filterEntries.length === 0 ? (
            <HelpText>No active filters — view captures the default screen state.</HelpText>
          ) : (
            <div className="rounded-lg border border-[var(--hairline)] bg-[var(--surface-soft)] p-3 text-[12.5px]">
              <ul className="space-y-1 font-mono tabular-nums">
                {filterEntries.map(([k, v]) => (
                  <li key={k}>
                    <span className="text-[var(--muted)]">{k}=</span>
                    <span className="text-[var(--ink-2)]">{String(v)}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      </div>
    </FormDrawerShell>
  );
}
