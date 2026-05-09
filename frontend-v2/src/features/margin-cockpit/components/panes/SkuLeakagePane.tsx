import { useNavigate } from 'react-router-dom';
import type { MarginTabs } from '@/types';

interface Props {
  pane: MarginTabs['leak'];
}

export function SkuLeakagePane({ pane }: Props) {
  const nav = useNavigate();
  return (
    <div>
      <p className="mb-3 text-[12px] text-[var(--muted)]">{pane.description}</p>
      <div className="overflow-hidden rounded-[11px] border border-[var(--border)]">
        <table className="w-full text-[12.5px]">
          <thead>
            <tr className="bg-[var(--surface-soft)] text-left text-[11px] uppercase tracking-wider text-[var(--muted)]">
              {['Article','Description','Volume','Quoted','Actual','Gap','Opportunity','A/B','Audit hash','Action'].map((h) => (
                <th key={h} className="px-3 py-2 font-bold">{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {pane.rows.map((r) => (
              <tr key={r.article}>
                <td className="border-t border-[var(--hairline)] px-3 py-2"><b className="font-bold">{r.article}</b></td>
                <td className="border-t border-[var(--hairline)] px-3 py-2">{r.description}</td>
                <td className="border-t border-[var(--hairline)] px-3 py-2 text-right">{r.volume}</td>
                <td className="border-t border-[var(--hairline)] px-3 py-2 text-right">{r.quotedMargin}</td>
                <td className="border-t border-[var(--hairline)] px-3 py-2 text-right">{r.actualMargin}</td>
                <td className="border-t border-[var(--hairline)] px-3 py-2 text-right" style={{ color: 'var(--red)' }}>{r.gapPp}</td>
                <td className="border-t border-[var(--hairline)] px-3 py-2 text-right" style={{ color: 'var(--green)' }}>{r.opportunityEur}</td>
                <td className="border-t border-[var(--hairline)] px-3 py-2 text-[11px]" style={r.abStatus.startsWith('🧪') ? { color: 'var(--violet)', fontWeight: 600 } : { color: 'var(--muted)' }}>
                  {r.abStatus}
                </td>
                <td className="border-t border-[var(--hairline)] px-3 py-2 text-[11px] text-[var(--ink-3)]">
                  {r.auditHash === '—' ? '—' : <code>{r.auditHash}</code>}
                </td>
                <td className="border-t border-[var(--hairline)] px-3 py-2">
                  <button
                    type="button"
                    onClick={() => nav('/pricing')}
                    className={`rounded-[8px] px-2.5 py-1.5 text-[11.5px] font-medium ${r.primary ? 'border border-[var(--ink)] bg-[var(--ink)] text-white' : 'border border-[var(--border)] bg-white text-[var(--ink-2)] hover:bg-[#f7f9fb]'}`}
                  >
                    Open in Studio →
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="mt-3 flex flex-wrap items-center gap-2.5 rounded-[8px] border border-[var(--hairline)] bg-[var(--surface-soft)] px-3.5 py-2.5 text-[12px] text-[var(--ink-3)] [&_b]:font-semibold [&_b]:text-[var(--ink)]">
        <span className="text-[14px]">⚡</span><span className="flex-1" dangerouslySetInnerHTML={{ __html: pane.tabFooterText }} />
      </div>
    </div>
  );
}
