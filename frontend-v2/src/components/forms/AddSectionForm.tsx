import { useState } from 'react';
import { useCreateSection } from '@/data/api/useShellAdmin';
import type { ActionDrawerContext } from '@/types/uiActions';
import { FormDrawerShell, FieldLabel, HelpText } from './FormDrawerShell';

interface Props {
  context: ActionDrawerContext;
  onClose: () => void;
  onToast: (message: string, severity?: 'info' | 'success' | 'warning' | 'error') => void;
}

const ROUTE_PRESETS = [
  { label: 'Action Center', href: '/action-center' },
  { label: 'Pricing Studio', href: '/pricing' },
  { label: 'Margin Cockpit', href: '/margin' },
  { label: 'Forecasting', href: '/forecasting' },
  { label: 'Quotes & Guardrails', href: '/quotes' },
  { label: 'AI Briefing', href: '/ai' },
];

export function AddSectionForm({ onClose, onToast }: Props) {
  const create = useCreateSection();
  const [title, setTitle] = useState('');
  const [sub, setSub] = useState('');
  const [href, setHref] = useState(ROUTE_PRESETS[0].href);
  const [error, setError] = useState<string | null>(null);

  const validationError =
    title.trim().length < 2
      ? 'Title is required (≥ 2 characters).'
      : !href.startsWith('/') && !href.startsWith('#')
        ? 'href must be an internal path (/…) or anchor (#…).'
        : null;

  function submit() {
    setError(null);
    create.mutate(
      { title: title.trim(), sub: sub.trim() || undefined, href },
      {
        onSuccess: (row) => {
          onToast(`Section "${row.title}" pinned to your sidebar.`, 'success');
          onClose();
        },
        onError: (err) => setError((err as Error).message),
      },
    );
  }

  return (
    <FormDrawerShell
      title="Pin a section"
      description="Add a quick-access shortcut to the right rail. Sections are scoped to your account."
      submitLabel="Pin section"
      submitting={create.isPending}
      error={error ?? validationError}
      disabled={Boolean(validationError)}
      onSubmit={submit}
      onCancel={onClose}
    >
      <div className="space-y-4">
        <div>
          <FieldLabel>Title</FieldLabel>
          <input
            type="text"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            className="w-full rounded-lg border border-[var(--hairline)] bg-white px-3 py-2 text-sm focus:border-[var(--ink-2)] focus:outline-none"
            placeholder="e.g. Q3 renewal queue"
            autoFocus
          />
        </div>
        <div>
          <FieldLabel>Subtitle (optional)</FieldLabel>
          <input
            type="text"
            value={sub}
            onChange={(e) => setSub(e.target.value)}
            className="w-full rounded-lg border border-[var(--hairline)] bg-white px-3 py-2 text-sm focus:border-[var(--ink-2)] focus:outline-none"
            placeholder="e.g. 14 SKUs awaiting review"
          />
        </div>
        <div>
          <FieldLabel>Destination</FieldLabel>
          <input
            type="text"
            value={href}
            onChange={(e) => setHref(e.target.value)}
            className="w-full rounded-lg border border-[var(--hairline)] bg-white px-3 py-2 text-sm font-mono tabular-nums focus:border-[var(--ink-2)] focus:outline-none"
            placeholder="/forecasting?queue=renewals"
          />
          <HelpText>External URLs are blocked. Use a /path or #anchor.</HelpText>
          <div className="mt-2 flex flex-wrap gap-1.5">
            {ROUTE_PRESETS.map((p) => (
              <button
                key={p.href}
                type="button"
                onClick={() => setHref(p.href)}
                className="rounded-full border border-[var(--hairline)] bg-white px-3 py-1 text-[11.5px] font-semibold text-[var(--ink-2)] hover:bg-[var(--surface-soft)]"
              >
                {p.label}
              </button>
            ))}
          </div>
        </div>
      </div>
    </FormDrawerShell>
  );
}
