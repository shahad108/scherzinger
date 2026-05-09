/**
 * Generic empty-state block. Each Action-Center child component renders this
 * when its slice of the composed payload is null or zero-length, instead of
 * returning ``null`` silently.
 */
export function EmptyBlock({ title, hint }: { title: string; hint?: string }) {
  return (
    <div
      role="status"
      style={{
        margin: '14px 0',
        padding: '14px 16px',
        borderRadius: 12,
        background: 'var(--surface-soft)',
        border: '1px dashed var(--border)',
        color: 'var(--muted)',
        fontSize: 12.5,
        lineHeight: 1.4,
      }}
    >
      <div style={{ fontWeight: 600, color: 'var(--ink-3)', fontSize: 12 }}>{title}</div>
      {hint && <div style={{ marginTop: 4 }}>{hint}</div>}
    </div>
  );
}
