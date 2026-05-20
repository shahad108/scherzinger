import { useNavigate } from 'react-router-dom';
import type { MarginTabs } from '@/types';

interface Props {
  pane: MarginTabs['erode'];
}

const ageBarColor = (months: number): string =>
  months >= 9 ? 'var(--rose)' : months >= 6 ? 'var(--amber)' : 'var(--green)';

const clusterTone = (tone: 'green' | 'amber' | 'red') =>
  tone === 'green' ? { bg: 'var(--green-bg)', color: 'var(--green)' }
  : tone === 'amber' ? { bg: 'var(--amber-bg)', color: 'var(--amber)' }
  : { bg: 'var(--rose-bg)', color: 'var(--rose-deep)' };

export function ErosionPane({ pane }: Props) {
  const nav = useNavigate();
  return (
    <div>
      <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
        <p className="text-[12px] text-[var(--muted)]">{pane.description}</p>
        <button
          type="button"
          onClick={() => { /* no-op — Phase 7 wires real action */ }}
          className="flex h-9 items-center gap-1.5 rounded-[12px] px-4 text-[13px] font-semibold text-white shadow-[0_6px_16px_-8px_rgba(90,125,163,0.55)] transition-colors hover:bg-[var(--rose-deep)]"
          style={{ background: 'var(--rose)' }}
        >
          {pane.cycleButtonLabel}
        </button>
      </div>

      <div className="overflow-hidden rounded-[11px] border border-[var(--border)]">
        <table className="w-full text-[12.5px]">
          <thead>
            <tr className="bg-[var(--surface-soft)] text-left text-[11px] uppercase tracking-wider text-[var(--muted)]">
              {['Article','Cluster · conf','Last list update','Cost change since','List change since','Effective erosion','Margin compression','Last author · hash','Action'].map((h) => (
                <th key={h} className="px-3 py-2 font-bold">{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {pane.rows.map((r) => {
              const t = clusterTone(r.cluster.tone);
              const widthPct = Math.min(100, Math.round((r.lastUpdateMonths / 16) * 100));
              return (
                <tr key={r.article}>
                  <td className="border-t border-[var(--hairline)] px-3 py-2"><b className="font-bold">{r.article}</b></td>
                  <td className="border-t border-[var(--hairline)] px-3 py-2">
                    <span className="rounded-[5px] px-2 py-0.5 text-[10.5px] font-bold" style={{ background: t.bg, color: t.color }}>
                      {r.cluster.code} {r.cluster.conf}
                    </span>
                  </td>
                  <td className="border-t border-[var(--hairline)] px-3 py-2">
                    <span className="mr-2 inline-block h-1 w-[60px] overflow-hidden rounded-[2px] bg-[var(--surface-sunken)] align-middle">
                      <span className="block h-full rounded-[2px]" style={{ width: `${widthPct}%`, background: ageBarColor(r.lastUpdateMonths) }} />
                    </span>
                    <span>{r.lastUpdateLabel}</span>
                  </td>
                  <td className="border-t border-[var(--hairline)] px-3 py-2 text-right" style={{ color:
                    r.costChange.startsWith('+') ? 'var(--red)' :
                    r.costChange.startsWith('-') || r.costChange.startsWith('−') ? 'var(--green)' :
                    undefined
                  }}>{r.costChange}</td>
                  <td className="border-t border-[var(--hairline)] px-3 py-2 text-right">{r.listChange}</td>
                  <td className="border-t border-[var(--hairline)] px-3 py-2 text-right" style={{ color:
                    r.effectiveErosion.startsWith('-') || r.effectiveErosion.startsWith('−') ? 'var(--red)' :
                    r.effectiveErosion.startsWith('+') ? 'var(--green)' :
                    undefined
                  }}>{r.effectiveErosion}</td>
                  <td className="border-t border-[var(--hairline)] px-3 py-2 text-right" style={{ color: r.marginCompression === '0pp' ? undefined : r.marginCompression.startsWith('+') ? 'var(--green)' : 'var(--red)' }}>{r.marginCompression}</td>
                  <td className="border-t border-[var(--hairline)] px-3 py-2 text-[11px] text-[var(--ink-3)]">{r.authorHash}</td>
                  <td className="border-t border-[var(--hairline)] px-3 py-2">
                    {r.isAction ? (
                      <button
                        type="button"
                        onClick={() => nav('/pricing')}
                        className={`rounded-[8px] px-2.5 py-1.5 text-[11.5px] font-medium ${r.primary ? 'border border-[var(--ink)] bg-[var(--ink)] text-white' : 'border border-[var(--border)] bg-white text-[var(--ink-2)] hover:bg-[#f7f9fb]'}`}
                      >
                        {r.actionLabel}
                      </button>
                    ) : (
                      <span className="text-[11px] text-[var(--muted)]">{r.actionLabel}</span>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <p className="mt-3 text-[11.5px] text-[var(--ink-3)]" dangerouslySetInnerHTML={{ __html: pane.cycleNote }} />
      <div className="mt-3 flex flex-wrap items-center gap-2.5 rounded-[8px] border border-[var(--hairline)] bg-[var(--surface-soft)] px-3.5 py-2.5 text-[12px] text-[var(--ink-3)] [&_b]:font-semibold [&_b]:text-[var(--ink)]">
        <span className="text-[14px]">⚡</span><span className="flex-1" dangerouslySetInnerHTML={{ __html: pane.tabFooterText }} />
      </div>
    </div>
  );
}
