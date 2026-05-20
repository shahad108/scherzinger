// Phase 12 — Heiko Sales read-only deal inbox.
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

interface ShareRow {
  id: string;
  external_id: string | null;
  title: string;
  sub: string;
  link: string | null;
  unread: boolean;
  created_at: string | null;
}

interface GapOverall {
  n: number;
  mean_gap_pp: number | null;
  median_gap_pp: number | null;
  std_gap_pp: number | null;
}

interface GapByYear {
  year: number;
  n: number;
  median_gap_pp: number | null;
  mean_gap_pp: number | null;
}

interface RecRow {
  id: string;
  title: string;
  article_id: string | null;
  cluster: string | null;
  status: string;
  source_kind: string | null;
}

interface DealInbox {
  header: { title: string; sub: string; for_user: string };
  kpis: Kpi[];
  shares: { title: string; subtitle: string; rows: ShareRow[] };
  lostQuote: {
    title: string;
    subtitle: string;
    overall: GapOverall | null;
    byYear: GapByYear[];
  };
  recentRecs: RecRow[];
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

export default function DealInboxPage() {
  const { data, isLoading, error } = useQuery({
    queryKey: ['deal-inbox'],
    queryFn: () => apiFetch<DealInbox>('/screens/deal-inbox'),
    staleTime: 60_000,
  });

  if (isLoading) return <div className="w-full px-6 py-8 text-[13px] text-[var(--muted)]">Loading…</div>;
  if (error || !data) {
    return (
      <div className="w-full px-6 py-8 text-[13px] text-[var(--red)]">
        Deal inbox unavailable: {(error as Error)?.message ?? 'unknown'}
      </div>
    );
  }

  return (
    <div className="w-full px-6 py-6">
      <header className="mb-5">
        <div className="text-[11px] font-bold uppercase tracking-[0.06em] text-[var(--violet)]">
          Sales workspace · read-only
        </div>
        <h1 className="mt-1 font-display text-[26px] font-bold leading-tight tracking-tight text-[var(--ink)]">
          {data.header.title}
        </h1>
        <p className="mt-1 text-[13px] text-[var(--muted)]">{data.header.sub}</p>
      </header>

      <div className="mb-5 grid grid-cols-2 gap-3 sm:grid-cols-3">
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
        <h2 className="font-display text-[16px] font-bold text-[var(--ink)]">{data.shares.title}</h2>
        <p className="mt-0.5 text-[12px] text-[var(--muted)]">{data.shares.subtitle}</p>
        {data.shares.rows.length === 0 ? (
          <div className="mt-3 rounded-[10px] border border-dashed border-[var(--hairline)] p-4 text-[12px] text-[var(--muted)]">
            No shared decisions yet. Frank's outbound shares land here.
          </div>
        ) : (
          <ul className="mt-3 flex flex-col gap-2">
            {data.shares.rows.map((s) => (
              <li
                key={s.id}
                className={`rounded-[10px] border p-3 ${s.unread ? 'border-[var(--violet-bg)] bg-[var(--violet-bg)]' : 'border-[var(--hairline)] bg-white'}`}
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="text-[13px] font-semibold text-[var(--ink)]">
                    {s.unread && <span className="mr-1 inline-block h-1.5 w-1.5 rounded-full bg-[var(--violet)]" aria-label="unread" />}
                    {s.title}
                  </div>
                  <div className="text-[10.5px] text-[var(--muted)]">
                    {s.created_at ? new Date(s.created_at).toLocaleString() : '—'}
                  </div>
                </div>
                <p className="mt-1 text-[12.5px] text-[var(--ink-2)]">{s.sub}</p>
                {s.link && (
                  <Link to={s.link} className="mt-1 inline-block text-[11px] font-semibold text-[var(--violet)] hover:underline">
                    Open audit trail →
                  </Link>
                )}
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="mb-5 rounded-[14px] border border-[var(--border)] bg-white p-5 shadow-[var(--shadow-card)]">
        <h2 className="font-display text-[16px] font-bold text-[var(--ink)]">{data.lostQuote.title}</h2>
        <p className="mt-0.5 text-[12px] text-[var(--muted)]">{data.lostQuote.subtitle}</p>
        {data.lostQuote.overall ? (
          <div className="mt-3 grid grid-cols-3 gap-3">
            <div className="rounded-[10px] border border-[var(--hairline)] bg-[var(--surface-soft)] p-3 text-center">
              <div className="text-[10px] font-bold uppercase tracking-wide text-[var(--muted)]">Median gap</div>
              <div className="mt-1 font-display text-[24px] font-bold tabular-nums text-[var(--amber)]">
                {data.lostQuote.overall.median_gap_pp != null ? `${data.lostQuote.overall.median_gap_pp.toFixed(1)}pp` : '—'}
              </div>
            </div>
            <div className="rounded-[10px] border border-[var(--hairline)] bg-[var(--surface-soft)] p-3 text-center">
              <div className="text-[10px] font-bold uppercase tracking-wide text-[var(--muted)]">Mean gap</div>
              <div className="mt-1 font-display text-[24px] font-bold tabular-nums text-[var(--ink)]">
                {data.lostQuote.overall.mean_gap_pp != null ? `${data.lostQuote.overall.mean_gap_pp.toFixed(1)}pp` : '—'}
              </div>
            </div>
            <div className="rounded-[10px] border border-[var(--hairline)] bg-[var(--surface-soft)] p-3 text-center">
              <div className="text-[10px] font-bold uppercase tracking-wide text-[var(--muted)]">Linked lines</div>
              <div className="mt-1 font-display text-[24px] font-bold tabular-nums text-[var(--ink)]">
                {data.lostQuote.overall.n.toLocaleString()}
              </div>
            </div>
          </div>
        ) : (
          <div className="mt-3 rounded-[10px] border border-dashed border-[var(--amber-border)] bg-[var(--amber-bg)] p-3 text-[12px] text-[var(--ink-2)]">
            Linkage data unavailable.
          </div>
        )}
        {data.lostQuote.byYear.length > 0 && (
          <div className="mt-3 grid grid-cols-4 gap-2 text-[11.5px]">
            {data.lostQuote.byYear.map((y) => (
              <div key={y.year} className="rounded-[8px] border border-[var(--hairline)] p-2">
                <div className="text-[10px] font-bold uppercase tracking-wide text-[var(--muted)]">{y.year}</div>
                <div className="font-display text-[16px] font-bold tabular-nums text-[var(--ink-2)]">
                  {y.median_gap_pp != null ? `${y.median_gap_pp.toFixed(2)}pp` : '—'}
                </div>
                <div className="text-[10px] text-[var(--muted)]">n={y.n.toLocaleString()}</div>
              </div>
            ))}
          </div>
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

      {data.recentRecs.length > 0 && (
        <section className="rounded-[14px] border border-[var(--border)] bg-white p-5 shadow-[var(--shadow-card)]">
          <h2 className="font-display text-[14px] font-bold text-[var(--ink)]">Recent recommendations (read-only)</h2>
          <p className="mt-0.5 text-[11px] text-[var(--muted)]">{data.heuristic.rule}</p>
          <ul className="mt-3 space-y-1.5 text-[12px]">
            {data.recentRecs.slice(0, 10).map((r) => (
              <li key={r.id} className="flex items-center gap-2 border-b border-[var(--hairline)] pb-1.5 last:border-b-0">
                <span className="font-mono text-[10.5px] text-[var(--muted)]">{r.id.slice(0, 8)}</span>
                <span className="font-semibold text-[var(--ink-2)]">{r.title}</span>
                {r.cluster && <span className="rounded-[4px] bg-[var(--amber-bg)] px-1 py-[1px] text-[10px] font-bold text-[var(--amber)]">{r.cluster}</span>}
                <span className="ml-auto text-[var(--muted)]">{r.status}</span>
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}
