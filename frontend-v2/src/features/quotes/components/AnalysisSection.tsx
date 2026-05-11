import { useNavigate } from 'react-router-dom';
import type { CustomerRow, QuotesAnalysisTabs, RepRow, SkuRow } from '@/types/quotes';
import { TierChip } from './TierChip';

interface Props {
  data: QuotesAnalysisTabs;
  active: 'rep' | 'sku' | 'cust';
  onTabChange: (id: 'rep' | 'sku' | 'cust') => void;
}

// "By sales rep" was moved to Heiko's view (Phase 11 — deferred for the
// Frank-only demo cut). Frank reads the aggregate rep-pattern footer
// inside this section, not a per-rep watchlist.
const TAB_DEFS: { id: 'rep' | 'sku' | 'cust'; label: string }[] = [
  { id: 'sku',  label: 'By SKU' },
  { id: 'cust', label: 'By customer' },
];

const numToneColor = (tone?: 'pos' | 'neg' | 'neutral' | 'flat'): string | undefined => {
  if (tone === 'pos') return 'var(--green)';
  if (tone === 'neg') return 'var(--red)';
  return undefined;
};

const repStatusColor = (status: RepRow['status']): { bg: string; color: string } => {
  if (status === 'repeat') return { bg: 'var(--rose-bg)', color: 'var(--rose-deep)' };
  if (status === 'coach')  return { bg: 'var(--amber-bg)', color: 'var(--amber)' };
  return { bg: 'var(--green-bg)', color: 'var(--green)' };
};

function RepTable({ rows }: { rows: RepRow[] }) {
  return (
    <div className="overflow-hidden rounded-[11px] border border-[var(--border)]">
      <table className="w-full text-[12.5px]">
        <thead>
          <tr className="bg-[var(--surface-soft)] text-left text-[10.5px] uppercase tracking-[0.06em] text-[var(--muted)]">
            {['Sales rep', 'Quotes (LTM)', 'Breaches', 'Breach rate', '€ Leakage', 'Trend', 'Status', 'Action'].map((h) => (
              <th key={h} className="px-3 py-2.5 font-bold">{h}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => {
            const s = repStatusColor(r.status);
            return (
              <tr key={r.rep} className="hover:bg-[var(--surface-soft)]">
                <td className="border-t border-[var(--hairline)] px-3 py-2.5"><b className="font-bold">{r.rep}</b></td>
                <td className="border-t border-[var(--hairline)] px-3 py-2.5 text-right tabular-nums">{r.ltmQuotes}</td>
                <td className="border-t border-[var(--hairline)] px-3 py-2.5 text-right">
                  <span className="mr-2 inline-block h-1 w-[60px] overflow-hidden rounded-[2px] bg-[var(--surface-sunken)] align-middle">
                    <span
                      className="block h-full rounded-[2px]"
                      style={{
                        width: `${r.breachBarPct}%`,
                        background: r.breachBarPct >= 60 ? 'var(--red)' : r.breachBarPct >= 30 ? 'var(--amber)' : 'var(--green)',
                      }}
                    />
                  </span>
                  <span className="tabular-nums">{r.breaches}</span>
                </td>
                <td
                  className="border-t border-[var(--hairline)] px-3 py-2.5 text-right tabular-nums font-semibold"
                  style={{ color: numToneColor(r.breachRateTone) }}
                >
                  {r.breachRate}
                </td>
                <td
                  className="border-t border-[var(--hairline)] px-3 py-2.5 text-right tabular-nums font-semibold"
                  style={{ color: numToneColor(r.leakageTone) }}
                >
                  {r.leakageEur}
                </td>
                <td
                  className="border-t border-[var(--hairline)] px-3 py-2.5 text-right"
                  style={{ color: numToneColor(r.trendTone) ?? 'var(--muted)' }}
                >
                  {r.trend}
                </td>
                <td className="border-t border-[var(--hairline)] px-3 py-2.5">
                  <span
                    className="inline-flex items-center rounded-[5px] px-2 py-0.5 text-[10.5px] font-bold"
                    style={{ background: s.bg, color: s.color }}
                  >
                    {r.statusLabel}
                  </span>
                </td>
                <td className="border-t border-[var(--hairline)] px-3 py-2.5">
                  {r.isAction ? (
                    <button
                      type="button"
                      className={`rounded-[8px] px-2.5 py-1.5 text-[11.5px] font-medium ${
                        r.actionPrimary
                          ? 'border border-[var(--ink)] bg-[var(--ink)] text-white'
                          : 'border border-[var(--border)] bg-white text-[var(--ink-2)] hover:bg-[#f7f9fb]'
                      }`}
                    >
                      {r.actionLabel}
                    </button>
                  ) : (
                    <span className="text-[11px] text-[var(--muted)]">no action</span>
                  )}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

function SkuTable({ rows }: { rows: SkuRow[] }) {
  const nav = useNavigate();
  return (
    <div className="overflow-hidden rounded-[11px] border border-[var(--border)]">
      <table className="w-full text-[12.5px]">
        <thead>
          <tr className="bg-[var(--surface-soft)] text-left text-[10.5px] uppercase tracking-[0.06em] text-[var(--muted)]">
            {['Article', 'Family', 'Quotes (LTM)', 'Breaches', 'Avg discount asked', 'Win at guardrail', 'Win below guardrail', 'Insight', 'Action'].map((h) => (
              <th key={h} className="px-3 py-2.5 font-bold">{h}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr
              key={r.article}
              className="hover:bg-[var(--surface-soft)]"
              style={r.highlight ? { background: '#fef2f2' } : undefined}
            >
              <td className="border-t border-[var(--hairline)] px-3 py-2.5"><b className="font-bold">{r.article}</b></td>
              <td className="border-t border-[var(--hairline)] px-3 py-2.5 text-[var(--muted)]">{r.family}</td>
              <td className="border-t border-[var(--hairline)] px-3 py-2.5 text-right tabular-nums">{r.ltmQuotes}</td>
              <td
                className="border-t border-[var(--hairline)] px-3 py-2.5 text-right tabular-nums font-semibold"
                style={{ color: numToneColor(r.breachesTone) }}
              >
                {r.breaches}
              </td>
              <td
                className="border-t border-[var(--hairline)] px-3 py-2.5 text-right tabular-nums font-semibold"
                style={{ color: numToneColor(r.avgDiscountTone) }}
              >
                {r.avgDiscount}
              </td>
              <td className="border-t border-[var(--hairline)] px-3 py-2.5 text-right tabular-nums font-semibold" style={{ color: 'var(--green)' }}>
                {r.winAtGuardrail}
              </td>
              <td className="border-t border-[var(--hairline)] px-3 py-2.5 text-right tabular-nums">{r.winBelowGuardrail}</td>
              <td
                className="border-t border-[var(--hairline)] px-3 py-2.5 text-[12px] [&_b]:font-bold [&_b]:text-[var(--ink)]"
                dangerouslySetInnerHTML={{ __html: r.insightHtml }}
              />
              <td className="border-t border-[var(--hairline)] px-3 py-2.5">
                <div className="flex flex-wrap gap-1.5">
                  {r.actions.map((a) => (
                    <button
                      key={a.id}
                      type="button"
                      onClick={() => { if (a.id === 'studio') nav('/pricing'); }}
                      className={`rounded-[8px] px-2.5 py-1.5 text-[11.5px] font-medium ${
                        a.primary
                          ? 'border border-[var(--ink)] bg-[var(--ink)] text-white'
                          : 'border border-[var(--border)] bg-white text-[var(--ink-2)] hover:bg-[#f7f9fb]'
                      }`}
                    >
                      {a.label}
                    </button>
                  ))}
                </div>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function CustomerTable({ rows }: { rows: CustomerRow[] }) {
  return (
    <div className="overflow-hidden rounded-[11px] border border-[var(--border)]">
      <table className="w-full text-[12.5px]">
        <thead>
          <tr className="bg-[var(--surface-soft)] text-left text-[10.5px] uppercase tracking-[0.06em] text-[var(--muted)]">
            {['Customer', 'Quotes (LTM)', 'Avg discount asked', 'Concession granted', 'Win rate', 'Recommendation'].map((h) => (
              <th key={h} className="px-3 py-2.5 font-bold">{h}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.customer} className="hover:bg-[var(--surface-soft)]">
              <td className="border-t border-[var(--hairline)] px-3 py-2.5">
                <span className="inline-flex items-center"><TierChip tier={r.tier} /><b className="font-bold">{r.customer}</b></span>
              </td>
              <td className="border-t border-[var(--hairline)] px-3 py-2.5 text-right tabular-nums">{r.ltmQuotes}</td>
              <td
                className="border-t border-[var(--hairline)] px-3 py-2.5 text-right tabular-nums font-semibold"
                style={{ color: numToneColor(r.avgDiscountTone) }}
              >
                {r.avgDiscount}
              </td>
              <td
                className="border-t border-[var(--hairline)] px-3 py-2.5 text-right tabular-nums font-semibold"
                style={{ color: numToneColor(r.concessionTone) }}
              >
                {r.concession}
              </td>
              <td
                className="border-t border-[var(--hairline)] px-3 py-2.5 text-right tabular-nums font-semibold"
                style={{ color: numToneColor(r.winRateTone) }}
              >
                {r.winRate}
              </td>
              <td className="border-t border-[var(--hairline)] px-3 py-2.5 text-[12px] text-[var(--ink-3)]">{r.recommendation}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function AnalysisSection({ data, active, onTabChange }: Props) {
  const nav = useNavigate();
  const tab = data[active];
  return (
    <section
      id="quote-analysis-block"
      className="mb-4 rounded-[14px] border border-[var(--border)] bg-white p-[18px_20px] shadow-[var(--shadow-card)]"
    >
      <div className="mb-3.5 flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="font-display text-[18px] font-bold leading-tight tracking-[-0.018em] text-[var(--ink)]">
            Where discounting concentrates
          </h2>
          <div className="mt-1 max-w-[60ch] text-[12px] leading-[1.5] text-[var(--muted)]">
            Slice across reps, SKUs, and customers to find the concentration. Top 3 reps = 78% of breach leakage.
          </div>
        </div>
        <span className="rounded-[7px] bg-[var(--surface-sunken)] px-2.5 py-[3px] text-[11px] font-semibold text-[var(--ink-2)]">
          Last 90d · €117K leakage
        </span>
      </div>

      <div role="tablist" className="mb-3.5 inline-flex flex-wrap gap-0.5 rounded-[10px] bg-[var(--surface-sunken)] p-[3px]">
        {TAB_DEFS.map((d) => {
          const isActive = d.id === active;
          return (
            <button
              key={d.id}
              type="button"
              role="tab"
              aria-selected={isActive}
              onClick={() => onTabChange(d.id)}
              className={`rounded-[8px] px-3 py-[7px] text-[12.5px] transition-all ${
                isActive
                  ? 'bg-white font-semibold text-[var(--ink)] shadow-[var(--shadow-card)]'
                  : 'font-medium text-[var(--ink-3)] hover:text-[var(--ink-2)]'
              }`}
            >
              {d.label}
            </button>
          );
        })}
      </div>

      <p className="mb-3 text-[12px] text-[var(--muted)]">{tab.description}</p>

      {active === 'rep'  && <RepTable rows={data.rep.rows} />}
      {active === 'sku'  && <SkuTable rows={data.sku.rows} />}
      {active === 'cust' && <CustomerTable rows={data.cust.rows} />}

      <div className="mt-3 flex flex-wrap items-center gap-2.5 rounded-[8px] border border-[var(--hairline)] bg-[var(--surface-soft)] px-3.5 py-2.5 text-[12px] text-[var(--ink-3)] [&_b]:font-semibold [&_b]:text-[var(--ink)]">
        <span className="text-[14px]" aria-hidden="true">⚡</span>
        <span className="flex-1" dangerouslySetInnerHTML={{ __html: tab.tabFooterText }} />
        {tab.jumpLink && (
          <button
            type="button"
            onClick={() => nav(tab.jumpLink!.to)}
            className="text-[11.5px] font-semibold text-[var(--rose-deep)] hover:underline"
          >
            {tab.jumpLink.label}
          </button>
        )}
      </div>
    </section>
  );
}
