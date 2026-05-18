import { Lock } from 'lucide-react';

/**
 * Plan §7 — block with ``status === 'locked'`` means a data source is not
 * yet connected (typically Phase 2 / Phase 10 / Phase 11 unlocks). The card
 * communicates that this is wiring, not a runtime failure (which would be
 * the amber DegradedBlock).
 */
export function LockedBlock({
  title,
  hint,
  traceId,
}: {
  title: string;
  hint?: string;
  traceId?: string;
}) {
  return (
    <div
      role="note"
      data-testid="ac-locked-block"
      data-title={title}
      aria-label="Locked — data source not yet connected"
      style={{
        margin: '14px 0',
        padding: '14px 16px',
        borderRadius: 12,
        background: 'var(--surface-sunken, #F4F4F5)',
        border: '1px dashed var(--hairline, #E4E4E7)',
        color: 'var(--ink-2)',
        fontSize: 12.5,
        lineHeight: 1.45,
      }}
    >
      <div
        style={{
          fontWeight: 700,
          color: 'var(--ink)',
          fontSize: 12,
          display: 'inline-flex',
          alignItems: 'center',
          gap: 6,
        }}
      >
        <Lock size={12} aria-hidden />
        {title}
      </div>
      <div style={{ marginTop: 4 }}>
        Locked — data source not yet connected.
      </div>
      {hint && (
        <div style={{ marginTop: 4, color: 'var(--muted)' }}>{hint}</div>
      )}
      {traceId && (
        <div style={{ marginTop: 8, fontSize: 11.5, color: 'var(--muted)' }}>
          Trace ID: <code>{traceId}</code>
        </div>
      )}
    </div>
  );
}
