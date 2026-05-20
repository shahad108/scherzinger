// Phase 12 — Till MD read-only overview.
import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { apiFetch } from '@/lib/api/client';

interface Kpi {
  key: string;
  label: string;
  value: string | number;
  sub: string;
  tone: 'positive' | 'warning' | 'info' | 'neutral';
}

interface ProposalRow {
  id: string;
  article_id: string;
  current_price: number | null;
  proposed_price: number | null;
  delta_pp: number | null;
  status: string;
  approval_required: boolean;
  created_at: string | null;
}

interface ShareRow {
  id: string;
  external_id: string | null;
  title: string;
  sub: string;
  link: string | null;
  unread: boolean;
  created_at: string | null;
}

interface AuditRow {
  kind: string;
  target_id: string | null;
  audit_hash: string | null;
  actor_persona: string | null;
  created_at: string | null;
}

interface MdOverview {
  header: { title: string; sub: string; for_user: string };
  kpis: Kpi[];
  approvalQueue: { title: string; subtitle: string; rows: ProposalRow[] };
  shares: { title: string; subtitle: string; rows: ShareRow[] };
  recentAudit: AuditRow[];
  crossLinks: { label: string; jumpTo: string }[];
  heuristic: { label: string; rule: string };
}

const toneClass: Record<Kpi['tone'], string> = {
  positive: 'border-[var(--green-border)] bg-[var(--green-bg)]',
  warning:  'border-[var(--amber-border)] bg-[var(--amber-bg)]',
  info:     'border-[var(--hairline)] bg-[var(--surface-soft)]',
  neutral:  'border-[var(--hairline)] bg-white',
};

const toneText: Record<Kpi['tone'], string> = {
  positive: 'text-[var(--green)]',
  warning:  'text-[var(--amber)]',
  info:     'text-[var(--ink-2)]',
  neutral:  'text-[var(--ink)]',
};

function statusBadge(status: string): { label: string; bg: string; fg: string } {
  if (status === 'pending_approval') return { label: 'Pending', bg: 'var(--amber-bg)', fg: 'var(--amber)' };
  if (status === 'draft')            return { label: 'Draft',   bg: 'var(--surface-soft)', fg: 'var(--ink-2)' };
  if (status === 'approved')         return { label: 'Approved',bg: 'var(--green-bg)', fg: 'var(--green)' };
  return { label: status, bg: 'var(--surface-soft)', fg: 'var(--ink-2)' };
}

function fmtPrice(v: number | null): string {
  if (v === null || v === undefined) return '—';
  return `€${v.toFixed(2)}`;
}

export default function MdOverviewPage() {
  const { data, isLoading, error } = useQuery({
    queryKey: ['md-overview'],
    queryFn: () => apiFetch<MdOverview>('/screens/md-overview'),
    staleTime: 60_000,
  });

  if (isLoading) return <div className="w-full px-6 py-8 text-[13px] text-[var(--muted)]">Loading…</div>;
  if (error || !data) {
    return (
      <div className="w-full px-6 py-8 text-[13px] text-[var(--red)]">
        MD overview unavailable: {(error as Error)?.message ?? 'unknown'}
      </div>
    );
  }

  return (
    <div className="w-full px-6 py-6">
      <header className="mb-5">
        <div className="text-[11px] font-bold uppercase tracking-[0.06em] text-[var(--rose-deep)]">
          MD workspace · read-only
        </div>
        <h1 className="mt-1 font-display text-[26px] font-bold leading-tight tracking-tight text-[var(--ink)]">
          {data.header.title}
        </h1>
        <p className="mt-1 text-[13px] text-[var(--muted)]">{data.header.sub}</p>
      </header>

      <div className="mb-5 grid grid-cols-2 gap-3 sm:grid-cols-4">
        {data.kpis.map((k) => (
          <div key={k.key} className={`rounded-[12px] border p-3.5 ${toneClass[k.tone]}`}>
            <div className="text-[10.5px] font-bold uppercase tracking-wide text-[var(--muted)]">{k.label}</div>
            <div className={`mt-1 font-display text-[26px] font-bold leading-none tabular-nums ${toneText[k.tone]}`}>
              {k.value}
            </div>
            <div className="mt-1 text-[11px] text-[var(--muted)]">{k.sub}</div>
          </div>
        ))}
      </div>

      <section className="mb-5 rounded-[14px] border border-[var(--border)] bg-white p-5 shadow-[var(--shadow-card)]">
        <h2 className="font-display text-[16px] font-bold text-[var(--ink)]">{data.approvalQueue.title}</h2>
        <p className="mt-0.5 text-[12px] text-[var(--muted)]">{data.approvalQueue.subtitle}</p>
        {data.approvalQueue.rows.length === 0 ? (
          <div className="mt-3 rounded-[10px] border border-dashed border-[var(--hairline)] p-4 text-[12px] text-[var(--muted)]">
            No proposals in the queue.
          </div>
        ) : (
          <div className="mt-3 overflow-hidden rounded-[10px] border border-[var(--hairline)]">
            <table className="w-full text-[12.5px]">
              <thead>
                <tr className="bg-[var(--surface-soft)] text-left text-[10.5px] font-bold uppercase tracking-wide text-[var(--muted)]">
                  <th className="px-3 py-2">Article</th>
                  <th className="px-3 py-2 text-right">Current</th>
                  <th className="px-3 py-2 text-right">Proposed</th>
                  <th className="px-3 py-2 text-right">Δ</th>
                  <th className="px-3 py-2">Status</th>
                  <th className="px-3 py-2">Created</th>
                </tr>
              </thead>
              <tbody>
                {data.approvalQueue.rows.map((r) => {
                  const b = statusBadge(r.status);
                  return (
                    <tr key={r.id} className="border-t border-[var(--hairline)]">
                      <td className="px-3 py-2 font-display font-bold text-[var(--ink)]">{r.article_id}</td>
                      <td className="px-3 py-2 text-right tabular-nums text-[var(--ink-2)]">{fmtPrice(r.current_price)}</td>
                      <td className="px-3 py-2 text-right tabular-nums font-bold text-[var(--ink-2)]">{fmtPrice(r.proposed_price)}</td>
                      <td className={`px-3 py-2 text-right tabular-nums font-bold ${r.delta_pp != null && r.delta_pp >= 0 ? 'text-[var(--green)]' : 'text-[var(--rose-deep)]'}`}>
                        {r.delta_pp == null ? '—' : `${r.delta_pp >= 0 ? '+' : ''}${r.delta_pp.toFixed(2)}pp`}
                      </td>
                      <td className="px-3 py-2">
                        <span
                          className="inline-flex items-center rounded-[5px] px-2 py-[2px] text-[10px] font-bold"
                          style={{ background: b.bg, color: b.fg }}
                        >
                          {b.label}
                        </span>
                        {r.approval_required && (
                          <span className="ml-1 rounded-[4px] bg-[var(--amber-bg)] px-1 py-[1px] text-[9px] font-bold text-[var(--amber)]">
                            requires MD
                          </span>
                        )}
                      </td>
                      <td className="px-3 py-2 text-[var(--muted)]">
                        {r.created_at ? new Date(r.created_at).toLocaleDateString() : '—'}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <section className="mb-5 rounded-[14px] border border-[var(--border)] bg-white p-5 shadow-[var(--shadow-card)]">
        <h2 className="font-display text-[16px] font-bold text-[var(--ink)]">{data.shares.title}</h2>
        <p className="mt-0.5 text-[12px] text-[var(--muted)]">{data.shares.subtitle}</p>
        {data.shares.rows.length === 0 ? (
          <div className="mt-3 rounded-[10px] border border-dashed border-[var(--hairline)] p-4 text-[12px] text-[var(--muted)]">
            No shared decisions yet.
          </div>
        ) : (
          <ul className="mt-3 flex flex-col gap-2">
            {data.shares.rows.map((s) => (
              <li
                key={s.id}
                className={`rounded-[10px] border p-3 ${s.unread ? 'border-[var(--rose-border, var(--rose-bg))] bg-[var(--rose-bg)]' : 'border-[var(--hairline)] bg-white'}`}
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="text-[13px] font-semibold text-[var(--ink)]">
                    {s.unread && <span className="mr-1 inline-block h-1.5 w-1.5 rounded-full bg-[var(--rose-deep)]" aria-label="unread" />}
                    {s.title}
                  </div>
                  <div className="text-[10.5px] text-[var(--muted)]">
                    {s.created_at ? new Date(s.created_at).toLocaleString() : '—'}
                  </div>
                </div>
                <p className="mt-1 text-[12.5px] text-[var(--ink-2)]">{s.sub}</p>
                {s.link && (
                  <Link
                    to={s.link}
                    className="mt-1 inline-block text-[11px] font-semibold text-[var(--rose-deep)] hover:underline"
                  >
                    Open audit trail →
                  </Link>
                )}
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="mb-5 flex flex-wrap items-center justify-between gap-2.5 rounded-[14px] border border-[var(--border)] bg-white px-4 py-3 shadow-[var(--shadow-card)]">
        <span className="text-[12px] font-semibold text-[var(--muted)]">Cross-links →</span>
        <div className="flex flex-wrap gap-1.5">
          {data.crossLinks.map((l) => (
            <Link
              key={l.label}
              to={l.jumpTo}
              className="flex h-9 items-center gap-1.5 rounded-[11px] border border-[var(--hairline)] bg-white px-3.5 text-[12.5px] font-semibold text-[var(--ink-2)] hover:bg-[var(--surface-soft)]"
            >
              {l.label}
            </Link>
          ))}
        </div>
      </section>

      {data.recentAudit.length > 0 && (
        <section className="rounded-[14px] border border-[var(--border)] bg-white p-5 shadow-[var(--shadow-card)]">
          <h2 className="font-display text-[14px] font-bold text-[var(--ink)]">Recent audit chain</h2>
          <p className="mt-0.5 text-[11px] text-[var(--muted)]">{data.heuristic.rule}</p>
          <ul className="mt-3 space-y-1.5 text-[11.5px]">
            {data.recentAudit.slice(0, 10).map((a, i) => (
              <li key={i} className="flex items-center gap-2 border-b border-[var(--hairline)] pb-1.5 last:border-b-0">
                <span className="font-mono text-[10.5px] text-[var(--muted)]">{a.audit_hash?.slice(0, 12) ?? '—'}</span>
                <span className="font-semibold text-[var(--ink-2)]">{a.kind}</span>
                <span className="text-[var(--muted)]">{a.target_id ?? '—'}</span>
                <span className="ml-auto text-[var(--muted)]">{a.actor_persona ?? '—'}</span>
                <span className="text-[var(--muted)]">
                  {a.created_at ? new Date(a.created_at).toLocaleString() : ''}
                </span>
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}
