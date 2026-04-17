const PRIO_CLS = {
  high:   'bg-red-100 text-red-800 ring-red-200',
  medium: 'bg-amber-100 text-amber-800 ring-amber-200',
  low:    'bg-slate-100 text-slate-700 ring-slate-200',
};

export default function ActionPlan({ spec }) {
  return (
    <div className="my-3 space-y-2">
      {spec.actions.map((a, i) => (
        <div key={i} className="rounded-xl ring-1 ring-slate-200 bg-white p-4">
          <div className="flex items-center gap-2">
            <span className={`text-xs font-medium px-2 py-0.5 rounded ring-1 ${PRIO_CLS[a.priority]}`}>{a.priority.toUpperCase()}</span>
            <div className="text-sm font-semibold text-slate-900">{a.title}</div>
          </div>
          <div className="mt-2 flex flex-wrap gap-4 text-xs text-slate-600">
            {a.timeline && <span><span className="text-slate-400">Timeline:</span> {a.timeline}</span>}
            {a.impact   && <span><span className="text-slate-400">Impact:</span> {a.impact}</span>}
          </div>
          {a.rationale && <div className="mt-2 text-xs text-slate-600 leading-relaxed">{a.rationale}</div>}
        </div>
      ))}
    </div>
  );
}
