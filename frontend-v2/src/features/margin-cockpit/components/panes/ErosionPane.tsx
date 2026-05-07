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
        <p className="text-[12.5px] text-[var(--muted)]">{pane.description}</p>
        {/* Phase 7 will wire toast: "Triggering price-book cycle (24 SKUs)..." */}
        <button
          type="button"
          onClick={() => { /* no-op — Phase 7 wires real action */ }}
          className="rounded-full px-3 py-1.5 text-[12px] font-semibold text-white"
          style={{ background: 'var(--rose)' }}
        >
          {pane.cycleButtonLabel}
        </button>
      </div>

      <div className="overflow-hidden rounded-xl border border-[var(--hairline)]">
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
                    <span className="rounded-full px-2 py-0.5 text-[11px] font-semibold" style={{ background: t.bg, color: t.color }}>
                      {r.cluster.code} {r.cluster.conf}
                    </span>
                  </td>
                  <td className="border-t border-[var(--hairline)] px-3 py-2">
                    <span className="mr-2 inline-block h-1.5 w-20 overflow-hidden rounded-full bg-[var(--surface-soft)] align-middle">
                      <span className="block h-full rounded-full" style={{ width: `${widthPct}%`, background: ageBarColor(r.lastUpdateMonths) }} />
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
                        className={`rounded-full px-3 py-1 text-[11.5px] font-semibold ${r.primary ? 'text-white' : 'border border-[var(--hairline)] text-[var(--ink-2)]'}`}
                        style={r.primary ? { background: 'var(--rose)' } : undefined}
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
      <div className="mt-3 flex flex-wrap items-center gap-2 rounded-xl bg-[var(--surface-soft)] px-3 py-2 text-[12px] text-[var(--ink-2)]">
        <span>⚡</span><span dangerouslySetInnerHTML={{ __html: pane.tabFooterText }} />
      </div>
    </div>
  );
}
