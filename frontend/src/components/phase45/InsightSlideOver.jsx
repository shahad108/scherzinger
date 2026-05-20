import { useEffect } from 'react';
import { useUI } from '../../context/UIContext';

const TONE_CLS = {
  positive: 'text-green-600',
  negative: 'text-red-600',
  neutral:  'text-slate-700',
};

const BADGE_BG = {
  WTP:          '#eff6ff',
  CLV:          '#f0fdf4',
  'Cross-sell': '#fef3c7',
};
const BADGE_FG = {
  WTP:          '#1d4ed8',
  CLV:          '#166534',
  'Cross-sell': '#92400e',
};

export default function InsightSlideOver() {
  const { activeInsight, closeInsight, openSKUDetail, openCustomerDetail } = useUI();

  useEffect(() => {
    if (!activeInsight) return;
    const handler = (e) => { if (e.key === 'Escape') closeInsight(); };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [activeInsight, closeInsight]);

  if (!activeInsight) return null;
  const ins = activeInsight;

  const drillRelated = (rel) => {
    if (rel.type === 'sku') openSKUDetail(rel.id);
    else if (rel.type === 'customer') openCustomerDetail(rel.id);
    closeInsight();
  };

  return (
    <div className="fixed inset-0 z-50 flex justify-end" onClick={closeInsight}>
      <div className="absolute inset-0 bg-black/30" />
      <div
        className="relative w-full max-w-xl h-full bg-white shadow-2xl overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="sticky top-0 z-10 bg-white border-b px-6 py-4 flex items-start justify-between">
          <div className="flex-1">
            <span
              className="inline-block px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider"
              style={{ background: BADGE_BG[ins.badge] || '#f1f5f9', color: BADGE_FG[ins.badge] || '#334155' }}
            >
              {ins.badge}
            </span>
            <h2 className="text-lg font-bold mt-2 text-slate-900">{ins.title}</h2>
            {ins.subtitle && <p className="text-xs text-slate-500 mt-0.5">{ins.subtitle}</p>}
          </div>
          <button onClick={closeInsight} className="text-slate-400 hover:text-slate-700 text-2xl leading-none -mt-1">×</button>
        </div>

        <div className="p-6 space-y-6">
          {/* Hero */}
          <div className="border rounded-lg p-4" style={{ background: '#fafbfc' }}>
            <div className="text-[11px] uppercase tracking-wider text-slate-500">{ins.hero.label}</div>
            <div className={`text-2xl font-bold mt-1 ${TONE_CLS[ins.hero.tone] || 'text-slate-900'}`}>
              {ins.hero.value}
            </div>
            {ins.hero.delta && <div className="text-xs text-slate-500 mt-1">{ins.hero.delta}</div>}
          </div>

          {/* Stats grid */}
          {ins.stats?.length > 0 && (
            <div className="grid grid-cols-2 gap-3">
              {ins.stats.map((s, i) => (
                <div key={i} className="border rounded-lg p-3">
                  <div className="text-[10px] uppercase tracking-wider text-slate-500">{s.label}</div>
                  <div className={`text-base font-semibold mt-0.5 ${TONE_CLS[s.tone] || 'text-slate-900'}`}>{s.value}</div>
                </div>
              ))}
            </div>
          )}

          {/* Why */}
          {ins.why?.length > 0 && (
            <div>
              <div className="text-xs font-bold uppercase tracking-wider text-slate-700 mb-2">Why this matters</div>
              <ul className="space-y-2 text-sm text-slate-700">
                {ins.why.map((w, i) => (
                  <li key={i} className="flex gap-2">
                    <span className="text-slate-400 mt-[2px]">•</span>
                    <span>{w}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {/* Chart */}
          {ins.chart && <InsightChart chart={ins.chart} />}

          {/* Actions */}
          {ins.actions?.length > 0 && (
            <div>
              <div className="text-xs font-bold uppercase tracking-wider text-slate-700 mb-2">Recommended actions</div>
              <ol className="space-y-2">
                {ins.actions.map((a, i) => (
                  <li
                    key={i}
                    className={`flex gap-3 p-3 rounded-md border ${a.emphasis === 'primary' ? 'border-blue-200 bg-blue-50' : 'border-slate-200 bg-white'}`}
                  >
                    <span className={`font-bold text-xs mt-[3px] ${a.emphasis === 'primary' ? 'text-blue-700' : 'text-slate-500'}`}>
                      {i + 1}.
                    </span>
                    <span className="text-sm text-slate-800">{a.text}</span>
                  </li>
                ))}
              </ol>
            </div>
          )}

          {/* Related */}
          {ins.related?.length > 0 && (
            <div>
              <div className="text-xs font-bold uppercase tracking-wider text-slate-700 mb-2">Related</div>
              <div className="flex flex-wrap gap-2">
                {ins.related.map((r, i) => (
                  <button
                    key={i}
                    onClick={() => drillRelated(r)}
                    className="px-3 py-1.5 rounded-full text-xs font-medium bg-slate-100 hover:bg-blue-100 border border-slate-200 hover:border-blue-300 transition"
                  >
                    {r.label} →
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function InsightChart({ chart }) {
  if (chart.type === 'band') return <BandChart data={chart.data} />;
  if (chart.type === 'clvDecomp') return <CLVDecompChart data={chart.data} />;
  return null;
}

function BandChart({ data }) {
  const { low, mid, high, current } = data;
  const pad = (high - low) * 0.1;
  const min = low - pad;
  const max = high + pad;
  const span = max - min || 1;
  const pct = (v) => ((v - min) / span) * 100;

  return (
    <div>
      <div className="text-xs font-bold uppercase tracking-wider text-slate-700 mb-2">Price band</div>
      <div className="relative h-10">
        <div className="absolute left-0 right-0 top-1/2 -translate-y-1/2 h-3 rounded bg-slate-100" />
        <div
          className="absolute top-1/2 -translate-y-1/2 h-3 rounded-l"
          style={{ background: '#cfe7f5', left: `${pct(low)}%`, width: `${pct(mid) - pct(low)}%` }}
        />
        <div
          className="absolute top-1/2 -translate-y-1/2 h-3"
          style={{ background: '#6bbee3', left: `${pct(mid)}%`, width: `${pct(high) - pct(mid)}%` }}
        />
        <div
          className="absolute top-0 bottom-0 w-[3px] bg-slate-900 rounded"
          style={{ left: `calc(${pct(current)}% - 1.5px)` }}
          title={`Current €${current}`}
        />
      </div>
      <div className="flex justify-between text-[10px] text-slate-500 mt-1 tabular-nums">
        <span>€{low}</span>
        <span>€{mid}</span>
        <span>€{high}</span>
      </div>
    </div>
  );
}

function CLVDecompChart({ data }) {
  const { clv, monthlyValue, monthsActive, retention } = data;
  const year1Expected = Math.round(monthlyValue * 12 * retention);
  const year3Expected = Math.round(year1Expected * (1 + retention + retention * retention));
  const bars = [
    { label: 'Realized LTV', value: clv, color: '#0f172a' },
    { label: 'Next 12mo (expected)', value: year1Expected, color: '#0393da' },
    { label: '3-year trajectory', value: year3Expected, color: '#6bbee3' },
  ];
  const max = Math.max(...bars.map((b) => b.value));

  return (
    <div>
      <div className="text-xs font-bold uppercase tracking-wider text-slate-700 mb-2">Value trajectory</div>
      <div className="space-y-2">
        {bars.map((b, i) => (
          <div key={i} className="flex items-center gap-3">
            <div className="w-32 text-[11px] text-slate-600">{b.label}</div>
            <div className="flex-1 relative h-5 bg-slate-100 rounded">
              <div
                className="absolute top-0 left-0 h-full rounded"
                style={{ width: `${(b.value / max) * 100}%`, background: b.color }}
              />
            </div>
            <div className="w-24 text-right text-xs font-semibold tabular-nums">€{b.value.toLocaleString()}</div>
          </div>
        ))}
      </div>
      <p className="text-[10px] text-slate-500 mt-2">Based on {monthsActive} months of history and {Math.round(retention * 100)}% retention probability.</p>
    </div>
  );
}
