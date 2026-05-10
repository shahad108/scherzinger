import { MessageStrip } from '@/components/fiori/MessageStrip';
import type { ReactNode } from 'react';

/**
 * Shared chrome for every Phase 3 form drawer: title, description,
 * scrollable body slot, error strip, primary submit + cancel buttons,
 * loading + success state hooks. Forms compose this and pass their
 * fields as `children`.
 */
export function FormDrawerShell({
  title,
  description,
  children,
  onSubmit,
  onCancel,
  submitLabel,
  cancelLabel = 'Cancel',
  submitting = false,
  error,
  success,
  disabled = false,
}: {
  title: string;
  description?: string;
  children: ReactNode;
  onSubmit: () => void;
  onCancel: () => void;
  submitLabel: string;
  cancelLabel?: string;
  submitting?: boolean;
  error?: string | null;
  success?: string | null;
  disabled?: boolean;
}) {
  return (
    <form
      className="flex h-full flex-col p-6 pt-14"
      onSubmit={(e) => {
        e.preventDefault();
        if (!submitting && !disabled) onSubmit();
      }}
    >
      <h2 className="font-display text-xl font-bold tracking-tight text-[var(--ink)]">
        {title}
      </h2>
      {description && (
        <p className="mt-2 text-sm leading-relaxed text-[var(--muted)]">
          {description}
        </p>
      )}

      <div className="mt-5 flex-1 overflow-y-auto pr-1">{children}</div>

      {error && (
        <div className="mt-3">
          <MessageStrip severity="error">{error}</MessageStrip>
        </div>
      )}
      {success && (
        <div className="mt-3">
          <MessageStrip severity="success">{success}</MessageStrip>
        </div>
      )}

      <div className="mt-4 flex items-center justify-end gap-2">
        <button
          type="button"
          onClick={onCancel}
          className="rounded-lg border border-[var(--hairline)] bg-white px-4 py-2.5 text-sm font-semibold text-[var(--ink-2)] hover:bg-[var(--surface-soft)]"
        >
          {cancelLabel}
        </button>
        <button
          type="submit"
          disabled={submitting || disabled}
          className="rounded-lg bg-[var(--ink)] px-4 py-2.5 text-sm font-semibold text-white hover:bg-black disabled:opacity-50"
        >
          {submitting ? 'Working…' : submitLabel}
        </button>
      </div>
    </form>
  );
}

export function FieldLabel({ children }: { children: ReactNode }) {
  return (
    <label className="mb-1 block text-[11.5px] font-semibold uppercase tracking-wide text-[var(--muted)]">
      {children}
    </label>
  );
}

export function HelpText({ children }: { children: ReactNode }) {
  return <p className="mt-1 text-[11.5px] text-[var(--muted)]">{children}</p>;
}
