import { useState } from 'react';
import { useAddReviewer } from '@/data/api/useShellAdmin';
import type { ActionDrawerContext } from '@/types/uiActions';
import { FormDrawerShell, FieldLabel, HelpText } from './FormDrawerShell';

interface ReviewerContext extends ActionDrawerContext {
  /** Backend Panel UUID — required. */
  panelId?: string;
  panelLabel?: string;
}

interface Props {
  context: ReviewerContext;
  onClose: () => void;
  onToast: (message: string, severity?: 'info' | 'success' | 'warning' | 'error') => void;
}

const PALETTE = [
  { value: '#7c66dc', label: 'Violet' },
  { value: '#d4357a', label: 'Rose' },
  { value: '#3a8a5e', label: 'Green' },
  { value: '#d97757', label: 'Amber' },
  { value: '#6e6e7a', label: 'Slate' },
];

export function AddReviewerForm({ context, onClose, onToast }: Props) {
  const add = useAddReviewer(context.panelId);
  const [initials, setInitials] = useState('');
  const [bg, setBg] = useState(PALETTE[0].value);
  const [error, setError] = useState<string | null>(null);

  const cleaned = initials.trim().toUpperCase();
  const validationError = !context.panelId
    ? 'Reviewer panel id is required — add reviewers from the right-rail panel header.'
    : cleaned.length < 1 || cleaned.length > 4
      ? 'Initials must be 1–4 letters.'
      : !/^[A-Z]{1,4}$/.test(cleaned)
        ? 'Use letters only — no spaces or punctuation.'
        : null;

  function submit() {
    setError(null);
    add.mutate(
      { initials: cleaned, bg },
      {
        onSuccess: (row) => {
          onToast(`Reviewer ${row.initials} added.`, 'success');
          onClose();
        },
        onError: (err) => setError((err as Error).message),
      },
    );
  }

  return (
    <FormDrawerShell
      title={context.panelLabel ? `Add reviewer · ${context.panelLabel}` : 'Add reviewer'}
      description="Reviewers appear on the right-rail panel and can be assigned to recommendations + proposals."
      submitLabel="Add reviewer"
      submitting={add.isPending}
      error={error ?? validationError}
      disabled={Boolean(validationError)}
      onSubmit={submit}
      onCancel={onClose}
    >
      <div className="space-y-4">
        <div>
          <FieldLabel>Initials</FieldLabel>
          <input
            type="text"
            value={initials}
            onChange={(e) => setInitials(e.target.value)}
            className="w-32 rounded-lg border border-[var(--hairline)] bg-white px-3 py-2 text-sm font-mono uppercase tracking-wider focus:border-[var(--ink-2)] focus:outline-none"
            placeholder="FK"
            maxLength={4}
            autoFocus
          />
          <HelpText>Display avatar — full names land when SSO/identity sync ships.</HelpText>
        </div>
        <div>
          <FieldLabel>Avatar color</FieldLabel>
          <div className="flex flex-wrap gap-2">
            {PALETTE.map((c) => (
              <button
                key={c.value}
                type="button"
                onClick={() => setBg(c.value)}
                aria-label={c.label}
                aria-pressed={bg === c.value}
                className="grid h-9 w-9 place-items-center rounded-full text-[11px] font-bold text-white transition-transform"
                style={{
                  background: c.value,
                  outline: bg === c.value ? '2px solid var(--ink)' : '2px solid transparent',
                  outlineOffset: 2,
                }}
              >
                {cleaned.slice(0, 2) || '?'}
              </button>
            ))}
          </div>
        </div>
      </div>
    </FormDrawerShell>
  );
}
