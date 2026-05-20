import { useUI } from '../../context/UIContext';
import quotes from '../../data/quotes.json';

export default function QuoteDetailSlideOver() {
  const { slideOver, closeSlideOver, panelHistory, goBackPanel, openCustomerDetail, openSKUDetail } = useUI();
  if (slideOver.type !== 'quote') return null;

  const quote = quotes.find(q => q.id === slideOver.id) || quotes.find(q => q.quote_id === slideOver.id);
  if (!quote) return null;

  return (
    <div className="fixed inset-0 z-50 flex justify-end" onClick={closeSlideOver}>
      <div className="absolute inset-0 bg-black/30" />
      <div className="relative w-full max-w-xl h-full bg-white shadow-2xl overflow-y-auto" onClick={e => e.stopPropagation()}>
        <div className="sticky top-0 bg-white border-b px-6 py-4 flex items-center justify-between z-10">
          <div className="flex items-center gap-3">
            {panelHistory.length > 0 && (
              <button onClick={goBackPanel} className="text-slate-500 hover:text-slate-900">← Back</button>
            )}
            <div>
              <div className="text-xs uppercase text-slate-500">Quote</div>
              <div className="text-xl font-semibold">{quote.id || quote.quote_id}</div>
            </div>
          </div>
          <button onClick={closeSlideOver} className="text-slate-500 hover:text-slate-900 text-2xl leading-none">×</button>
        </div>

        <div className="p-6 space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <Stat label="Value" value={`€${(quote.value ?? quote.amount ?? 0).toLocaleString()}`} />
            <Stat label="Win probability" value={`${Math.round(((quote.winProbability ?? quote.win_prob ?? 0)) * 100)}%`} />
            <Stat label="Customer" value={quote.customerName || quote.customer || '—'}
              onClick={quote.customerId ? () => openCustomerDetail(quote.customerId) : undefined} />
            <Stat label="Status" value={quote.status || '—'} />
          </div>

          {quote.lineItems?.length > 0 && (
            <div>
              <div className="text-sm font-semibold mb-2">Line items</div>
              <ul className="divide-y border rounded">
                {quote.lineItems.map((li, i) => (
                  <li key={i}>
                    <button
                      className="w-full text-left px-3 py-2 hover:bg-slate-50 flex justify-between"
                      onClick={() => li.skuCode && openSKUDetail(li.skuCode)}
                    >
                      <span>{li.skuCode || li.sku || `Line ${i+1}`}</span>
                      <span className="text-slate-500">×{li.qty ?? 1}</span>
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {quote.winReasons && (
            <div>
              <div className="text-sm font-semibold mb-2">Why this win probability</div>
              <ul className="list-disc pl-5 text-sm text-slate-700 space-y-1">
                {quote.winReasons.map((r, i) => <li key={i}>{r}</li>)}
              </ul>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function Stat({ label, value, onClick }) {
  const base = "border rounded p-3";
  if (onClick) {
    return (
      <button onClick={onClick} className={`${base} text-left hover:bg-slate-50`}>
        <div className="text-xs text-slate-500">{label}</div>
        <div className="text-lg font-semibold">{value}</div>
      </button>
    );
  }
  return (
    <div className={base}>
      <div className="text-xs text-slate-500">{label}</div>
      <div className="text-lg font-semibold">{value}</div>
    </div>
  );
}
