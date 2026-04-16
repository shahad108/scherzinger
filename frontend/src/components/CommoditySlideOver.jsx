import { useEffect, useState } from 'react';
import { LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer } from 'recharts';
import { useUI } from '../context/UIContext';
import commodities from '../data/commodities.json';

const TABS = [
  { id: 'overview', label: 'Overview' },
  { id: 'history', label: 'Price History' },
  { id: 'skus', label: 'Affected SKUs' },
  { id: 'shock', label: 'Shock Impact' },
];

export default function CommoditySlideOver() {
  const { slideOver, closeSlideOver, panelHistory, goBackPanel, openSKUDetail } = useUI();
  const [tab, setTab] = useState('overview');

  useEffect(() => {
    if (slideOver.type === 'commodity') {
      setTab(slideOver.initialTab || 'overview');
    }
  }, [slideOver.type, slideOver.id, slideOver.initialTab]);

  if (slideOver.type !== 'commodity') return null;
  const data = commodities.find(c => c.id === slideOver.id);
  if (!data) return null;

  return (
    <div className="fixed inset-0 z-50 flex justify-end" onClick={closeSlideOver}>
      <div className="absolute inset-0 bg-black/30" />
      <div
        className="relative w-full max-w-2xl h-full bg-white shadow-2xl overflow-y-auto"
        onClick={e => e.stopPropagation()}
      >
        <div className="sticky top-0 bg-white border-b px-6 py-4 flex items-center justify-between z-10">
          <div className="flex items-center gap-3">
            {panelHistory.length > 0 && (
              <button onClick={goBackPanel} className="text-slate-500 hover:text-slate-900">← Back</button>
            )}
            <div>
              <div className="text-xs uppercase text-slate-500">Commodity</div>
              <div className="text-xl font-semibold">{data.name}</div>
            </div>
          </div>
          <button onClick={closeSlideOver} className="text-slate-500 hover:text-slate-900 text-2xl leading-none">×</button>
        </div>

        <div className="border-b flex gap-6 px-6">
          {TABS.map(t => (
            <button
              key={t.id}
              onClick={() => setTab(t.id)}
              className={`py-3 text-sm border-b-2 ${tab === t.id ? 'border-blue-600 text-blue-600' : 'border-transparent text-slate-600'}`}
            >{t.label}</button>
          ))}
        </div>

        <div className="p-6">
          {tab === 'overview' && (
            <div className="grid grid-cols-2 gap-4">
              <Stat label="Annual spend" value={`€${data.overview.spend_eur_m}M`} />
              <Stat label="SKUs affected" value={data.overview.skus_affected} />
              <Stat label="12-mo trend" value={`${data.overview.price_trend_pct > 0 ? '+' : ''}${data.overview.price_trend_pct}%`} />
              <Stat label="Volatility" value={data.overview.volatility} />
            </div>
          )}
          {tab === 'history' && (
            <div className="h-64">
              <ResponsiveContainer>
                <LineChart data={data.priceHistory}>
                  <XAxis dataKey="month" fontSize={11} />
                  <YAxis fontSize={11} />
                  <Tooltip />
                  <Line type="monotone" dataKey="price" stroke="#2563eb" strokeWidth={2} dot={false} />
                </LineChart>
              </ResponsiveContainer>
            </div>
          )}
          {tab === 'skus' && (
            <ul className="divide-y">
              {data.affectedSkus.map(sku => (
                <li key={sku}>
                  <button
                    className="w-full text-left py-3 px-2 hover:bg-slate-50 flex justify-between"
                    onClick={() => openSKUDetail(sku)}
                  >
                    <span className="font-medium">{sku}</span>
                    <span className="text-slate-400">→</span>
                  </button>
                </li>
              ))}
            </ul>
          )}
          {tab === 'shock' && (
            <div className="space-y-3">
              {Object.entries(data.shockImpact).map(([k, v]) => (
                <div key={k} className="flex justify-between border-b pb-2">
                  <span className="text-slate-600">{k.replace(/_/g, ' ')}</span>
                  <span className={`font-semibold ${v < 0 ? 'text-red-600' : 'text-green-600'}`}>{v}%</span>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function Stat({ label, value }) {
  return (
    <div className="border rounded p-3">
      <div className="text-xs text-slate-500">{label}</div>
      <div className="text-lg font-semibold">{value}</div>
    </div>
  );
}
