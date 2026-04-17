import { useState } from 'react';
import { ChevronDown, ChevronRight } from 'lucide-react';
import renderMarkdown from '../../../utils/markdownRenderer';
import { STATUS_DOT, STATUS_LABEL } from './formatters';

export default function FactorBreakdown({ spec }) {
  const [open, setOpen] = useState({});
  return (
    <div className="my-3 rounded-xl ring-1 ring-slate-200 bg-white overflow-hidden">
      <ul>
        {spec.factors.map((f, i) => {
          const canExpand = !!f.detail;
          const isOpen = !!open[i];
          return (
            <li key={i} className="border-t border-slate-100 first:border-t-0">
              <button
                type="button"
                disabled={!canExpand}
                onClick={() => canExpand && setOpen(o => ({ ...o, [i]: !o[i] }))}
                className={`w-full flex items-center gap-3 px-4 py-2.5 text-left ${canExpand ? 'hover:bg-slate-50' : ''}`}
              >
                {canExpand ? (
                  isOpen ? <ChevronDown className="w-4 h-4 text-slate-400" /> : <ChevronRight className="w-4 h-4 text-slate-400" />
                ) : <span className="w-4" />}
                <span className={`w-2 h-2 rounded-full ${STATUS_DOT[f.status] || 'bg-slate-300'}`} />
                <span className="flex-1 text-sm font-medium text-slate-800">{f.label}</span>
                {f.weight != null && (
                  <span className="text-xs text-slate-500 tabular-nums">{(f.weight * 100).toFixed(1)}%</span>
                )}
                {f.value && <span className="text-xs text-slate-600">{f.value}</span>}
                <span className="text-xs text-slate-500">{STATUS_LABEL[f.status]}</span>
              </button>
              {canExpand && isOpen && (
                <div className="px-11 pb-3 pr-4 text-xs text-slate-600 leading-relaxed">
                  {renderMarkdown(f.detail)}
                </div>
              )}
            </li>
          );
        })}
      </ul>
      {spec.caption && (
        <div className="px-4 py-2 bg-slate-50 text-xs text-slate-500 border-t border-slate-100">{spec.caption}</div>
      )}
    </div>
  );
}
