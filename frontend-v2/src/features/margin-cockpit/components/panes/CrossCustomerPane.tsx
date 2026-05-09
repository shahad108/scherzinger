import { useNavigate } from 'react-router-dom';
import type { CrossCustomerRow, MarginTabs } from '@/types';

interface Props {
  pane: MarginTabs['cross'];
}

const chipTone = (tone: CrossCustomerRow['cluster']['tone']) =>
  tone === 'green' ? { bg: 'var(--green-bg)', color: 'var(--green)' }
  : tone === 'amber' ? { bg: 'var(--amber-bg)', color: 'var(--amber)' }
  : { bg: 'var(--rose-bg)', color: 'var(--rose-deep)' };

export function CrossCustomerPane({ pane }: Props) {
  const nav = useNavigate();
  return (
    <div>
      <p className="mb-3 text-[12px] text-[var(--muted)]">{pane.description}</p>
      <div className="overflow-hidden rounded-[11px] border border-[var(--border)]">
        <table className="w-full text-[12.5px]">
          <thead>
            <tr className="bg-[var(--surface-soft)] text-left text-[11px] uppercase tracking-wider text-[var(--muted)]">
              {['Article','Cluster · conf','Customer A','Price A','Customer B','Price B','Volume tier','Spread %','Action'].map((h) => (
                <th key={h} className="px-3 py-2 font-bold">{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {pane.rows.map((r) => {
              const t = chipTone(r.cluster.tone);
              return (
                <tr key={r.article} className={r.highlight ? 'bg-[var(--rose-bg)]' : ''}>
                  <td className="border-t border-[var(--hairline)] px-3 py-2"><b className="font-bold">{r.article}</b></td>
                  <td className="border-t border-[var(--hairline)] px-3 py-2">
                    <span className="rounded-[5px] px-2 py-0.5 text-[10.5px] font-bold" style={{ background: t.bg, color: t.color }}>
                      {r.cluster.code} {r.cluster.conf}
                    </span>
                  </td>
                  <td className="border-t border-[var(--hairline)] px-3 py-2">{r.customerA}</td>
                  <td className="border-t border-[var(--hairline)] px-3 py-2 text-right">{r.priceA}</td>
                  <td className="border-t border-[var(--hairline)] px-3 py-2">{r.customerB}</td>
                  <td className="border-t border-[var(--hairline)] px-3 py-2 text-right">{r.priceB}</td>
                  <td className="border-t border-[var(--hairline)] px-3 py-2">{r.tier}</td>
                  <td className="border-t border-[var(--hairline)] px-3 py-2 text-right" style={{ color: 'var(--red)' }}>{r.spreadPct}</td>
                  <td className="border-t border-[var(--hairline)] px-3 py-2">
                    <button
                      type="button"
                      onClick={() => nav('/pricing')}
                      className={`rounded-[8px] px-2.5 py-1.5 text-[11.5px] font-medium ${r.highlight ? 'border border-[var(--ink)] bg-[var(--ink)] text-white' : 'border border-[var(--border)] bg-white text-[var(--ink-2)] hover:bg-[#f7f9fb]'}`}
                    >
                      {r.studioLabel}
                    </button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <p className="mt-3 text-[11.5px] text-[var(--ink-3)]" dangerouslySetInnerHTML={{ __html: pane.footerNote }} />
      <div className="mt-3 flex flex-wrap items-center gap-2.5 rounded-[8px] border border-[var(--hairline)] bg-[var(--surface-soft)] px-3.5 py-2.5 text-[12px] text-[var(--ink-3)] [&_b]:font-semibold [&_b]:text-[var(--ink)]">
        <span className="text-[14px]">⚡</span><span className="flex-1" dangerouslySetInnerHTML={{ __html: pane.tabFooterText }} />
      </div>
    </div>
  );
}
