import type { AuditRow } from '@/types';
import { EmptyBlock } from './EmptyBlock';

export function AuditTrail({ rows }: { rows: AuditRow[] }) {
  if (!rows || rows.length === 0) {
    return <EmptyBlock title="Audit trail" hint="No changes in the last 30 days." />;
  }
  return (
    <>
      <div className="mb-3">
        <h2 className="font-display text-lg font-bold tracking-tight text-[var(--ink)]">
          Audit trail · last 30 days
        </h2>
        <p className="mt-0.5 text-xs text-[var(--muted)]">
          Author · timestamp · change · pre→post. Audit-ready.
        </p>
      </div>
      <div className="mb-6 overflow-hidden rounded-xl border border-[var(--hairline)] bg-white shadow-[var(--shadow)]">
        {rows.map((r, i) => (
          <div
            key={i}
            className="grid grid-cols-1 gap-2 border-b border-[var(--hairline)] p-4 last:border-b-0 md:grid-cols-[160px_1fr] md:gap-4"
          >
            <div className="font-mono text-[11.5px] text-[var(--muted)]">{r.ts}</div>
            <div>
              <div className="text-sm text-[var(--ink-2)]">
                <b className="font-semibold text-[var(--ink)]">{r.actor}</b> — {r.change}
              </div>
              <div className="mt-1 text-[11.5px] text-[var(--muted)]">{r.delta}</div>
            </div>
          </div>
        ))}
      </div>
    </>
  );
}
