import { Lock } from 'lucide-react';

/**
 * Shared locked-state card. Used by Action Center (Plan §7) and Pricing
 * Studio (Plan §4 / Phase I) to communicate that a data source / feature
 * is not yet connected. Distinct from the amber DegradedBlock — locked
 * means "wiring not done yet", not "runtime failure".
 *
 * Roadmap §8 unlock-requirement copy should flow into the `hint` prop so
 * the product's ambition stays visible even when data is missing.
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
        background: 'var(--surface-sunken)',
        border: '1px dashed var(--hairline)',
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
