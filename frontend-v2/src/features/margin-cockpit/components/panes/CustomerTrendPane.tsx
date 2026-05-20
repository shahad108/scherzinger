import { useNavigate } from 'react-router-dom';
import type { CustomerTrendRow, MarginTabs } from '@/types';

interface Props {
  pane: MarginTabs['cust'];
}

const statusPill = (s: CustomerTrendRow['status']) => {
  const palette = {
    action:  { bg: 'var(--rose-bg)',  dot: 'var(--rose-deep)', color: 'var(--rose-deep)' },
    watch:   { bg: 'var(--amber-bg)', dot: 'var(--amber)',     color: 'var(--amber)' },
    healthy: { bg: 'var(--green-bg)', dot: 'var(--green)',     color: 'var(--green)' },
  } as const;
  return palette[s];
};

const trendColor = (t: CustomerTrendRow['trendTone']) =>
  t === 'up' ? 'var(--green)' : t === 'down' ? 'var(--red)' : 'var(--muted)';

export function CustomerTrendPane({ pane }: Props) {
  const nav = useNavigate();
  return (
    <div>
      <p className="mb-3 text-[12px] text-[var(--muted)]">{pane.description}</p>
      <div className="overflow-hidden rounded-[11px] border border-[var(--border)]">
        <table className="w-full text-[12.5px]">
          <thead>
            <tr className="bg-[var(--surface-soft)] text-left text-[11px] uppercase tracking-wider text-[var(--muted)]">
              {['Customer','YTD Revenue','YTD Margin','Trend (12 mo)','Status','Action'].map((h) => (
                <th key={h} className="px-3 py-2 font-bold">{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {pane.rows.map((r) => {
              const p = statusPill(r.status);
              return (
                <tr key={r.customer}>
                  <td className="border-t border-[var(--hairline)] px-3 py-2"><b className="font-bold">{r.customer}</b></td>
                  <td className="border-t border-[var(--hairline)] px-3 py-2 text-right">{r.ytdRevenue}</td>
                  <td className="border-t border-[var(--hairline)] px-3 py-2 text-right">{r.ytdMargin}</td>
                  <td className="border-t border-[var(--hairline)] px-3 py-2 text-right" style={{ color: trendColor(r.trendTone) }}>{r.trend}</td>
                  <td className="border-t border-[var(--hairline)] px-3 py-2">
                    <span className="inline-flex items-center gap-1.5 rounded-[6px] px-2.5 py-[3px] text-[11px] font-semibold" style={{ background: p.bg, color: p.color }}>
                      <span className="inline-block h-1.5 w-1.5 rounded-full" style={{ background: p.dot }} />{r.statusLabel}
                    </span>
                  </td>
                  <td className="border-t border-[var(--hairline)] px-3 py-2">
                    <div className="flex flex-wrap gap-2">
                      {r.primaryAction && (
                        <button
                          type="button"
                          onClick={() => nav(r.primaryAction!.jumpTo)}
                          className="rounded-[8px] border border-[var(--ink)] bg-[var(--ink)] px-2.5 py-1.5 text-[11.5px] font-medium text-white"
                        >
                          {r.primaryAction.label}
                        </button>
                      )}
                      <button type="button" className="rounded-[8px] border border-[var(--border)] bg-white px-2.5 py-1.5 text-[11.5px] font-medium text-[var(--ink-2)] hover:bg-[#f7f9fb]">
                        {r.drillLabel}
                      </button>
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <div className="mt-3 flex flex-wrap items-center gap-2.5 rounded-[8px] border border-[var(--hairline)] bg-[var(--surface-soft)] px-3.5 py-2.5 text-[12px] text-[var(--ink-3)] [&_b]:font-semibold [&_b]:text-[var(--ink)]">
        <span className="text-[14px]">⚡</span><span className="flex-1" dangerouslySetInnerHTML={{ __html: pane.tabFooterText }} />
      </div>
    </div>
  );
}
