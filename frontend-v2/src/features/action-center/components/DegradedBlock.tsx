export function DegradedBlock({
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
      role="alert"
      data-testid="ac-degraded-block"
      data-title={title}
      style={{
        margin: '14px 0',
        padding: '14px 16px',
        borderRadius: 12,
        background: 'color-mix(in oklab, var(--amber-bg) 60%, white)',
        border: '1px solid color-mix(in oklab, var(--amber) 32%, white)',
        color: 'var(--ink-2)',
        fontSize: 12.5,
        lineHeight: 1.45,
      }}
    >
      <div style={{ fontWeight: 700, color: 'var(--ink)', fontSize: 12 }}>{title}</div>
      {hint && <div style={{ marginTop: 4 }}>{hint}</div>}
      {traceId && (
        <div style={{ marginTop: 8, fontSize: 11.5, color: 'var(--muted)' }}>
          Trace ID: <code>{traceId}</code>
        </div>
      )}
    </div>
  );
}
