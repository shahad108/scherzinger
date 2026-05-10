// Phase 14 P14.T4 — Data quality dashboard (read-only).
import { useQuery } from '@tanstack/react-query';
import { apiFetch } from '@/lib/api/client';

interface QualitySummary {
  health?: string;
  last_load_at?: string | null;
  invoice_count?: number;
  quote_count?: number;
  customer_count?: number;
  product_count?: number;
  issues?: { code: string; severity: string; detail: string }[];
}

function useQualitySummary() {
  return useQuery({
    queryKey: ['data-quality', 'summary'],
    // /data-quality/summary lives outside /screens. apiFetch hits the BFF
    // root, so we pass an absolute-ish path that bypasses the screens prefix
    // by relying on the shared base URL.
    queryFn: () => apiFetch<QualitySummary>('/data-quality/summary'),
    staleTime: 60_000,
  });
}

export default function DataQualityPage() {
  const { data, isLoading, error } = useQualitySummary();

  if (isLoading) return <div className="text-[13px] text-[var(--muted)]">Loading…</div>;
  if (error || !data) {
    return (
      <div className="text-[13px] text-[var(--muted)]">
        Data quality summary unavailable.
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-5">
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {[
          { label: 'Invoices', value: data.invoice_count ?? '—' },
          { label: 'Quotes', value: data.quote_count ?? '—' },
          { label: 'Customers', value: data.customer_count ?? '—' },
          { label: 'Products', value: data.product_count ?? '—' },
        ].map((c) => (
          <div
            key={c.label}
            className="rounded-[10px] border border-[var(--border)] bg-[var(--surface-soft)] p-3"
          >
            <div className="text-[11px] font-semibold uppercase tracking-wide text-[var(--muted)]">{c.label}</div>
            <div className="mt-1 font-display text-[22px] font-bold text-[var(--ink)] tabular-nums">{c.value}</div>
          </div>
        ))}
      </div>

      <section>
        <h2 className="mb-2 text-[14px] font-bold text-[var(--ink)]">Last load</h2>
        <div className="text-[13px] text-[var(--ink-2)]">
          {data.last_load_at ? new Date(data.last_load_at).toLocaleString() : '—'}
        </div>
      </section>

      <section>
        <h2 className="mb-2 text-[14px] font-bold text-[var(--ink)]">Issues</h2>
        {!data.issues || data.issues.length === 0 ? (
          <div className="text-[13px] text-[var(--muted)]">No active data-quality issues.</div>
        ) : (
          <ul className="flex flex-col gap-2">
            {data.issues.map((issue, idx) => (
              <li
                key={idx}
                className="rounded-[10px] border border-[var(--border)] bg-white p-3"
              >
                <div className="flex items-center gap-2">
                  <span className={`text-[10.5px] font-bold uppercase ${
                    issue.severity === 'error' ? 'text-[var(--red)]' :
                    issue.severity === 'warn' ? 'text-[var(--amber)]' :
                    'text-[var(--muted)]'
                  }`}>{issue.severity}</span>
                  <code className="text-[11.5px] text-[var(--muted)]">{issue.code}</code>
                </div>
                <div className="mt-1 text-[13px] text-[var(--ink-2)]">{issue.detail}</div>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
