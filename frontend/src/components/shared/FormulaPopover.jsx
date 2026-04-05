import { useState, useRef, useEffect, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { X, Info } from 'lucide-react';
import formulaDefinitions from '../../utils/formulaDefinitions';

const confidenceColors = {
  verified: { bg: '#f0fdf4', text: '#16a34a', label: 'Verified', desc: 'Data verified against ERP exports' },
  derived: { bg: '#fffbeb', text: '#d97706', label: 'Derived', desc: 'Calculated from base data — may change in later phases' },
  forecast: { bg: '#eff6ff', text: '#2563eb', label: 'Forecast', desc: 'ML model prediction — will be recalibrated' },
};

function DataSourceLine({ line }) {
  const fileMatch = line.match(/^File:\s*(.+?\.json)\s*→\s*(.+)$/);
  if (fileMatch) {
    return (
      <div className="flex items-start gap-1.5 py-0.5">
        <span className="text-[9px] text-slate-500 mt-0.5 flex-shrink-0">FILE</span>
        <div>
          <code className="text-[10px] font-mono text-cyan-300 bg-slate-700/80 px-1 py-0.5 rounded">{fileMatch[1]}</code>
          <span className="text-slate-500 mx-1">&rarr;</span>
          <code className="text-[10px] font-mono text-amber-300">{fileMatch[2]}</code>
        </div>
      </div>
    );
  }
  const fieldsMatch = line.match(/^Fields:\s*(.+)$/);
  if (fieldsMatch) {
    return (
      <div className="flex items-start gap-1.5 py-0.5">
        <span className="text-[9px] text-slate-500 mt-0.5 flex-shrink-0">COLS</span>
        <code className="text-[10px] font-mono text-emerald-300">{fieldsMatch[1]}</code>
      </div>
    );
  }
  const listMatch = line.match(/^(Segments|Stages|Tiers|Codes|Bands|Models):\s*(.+)$/);
  if (listMatch) {
    return (
      <div className="flex items-start gap-1.5 py-0.5">
        <span className="text-[9px] text-slate-500 mt-0.5 flex-shrink-0">{listMatch[1].toUpperCase().slice(0, 4)}</span>
        <span className="text-[10px] text-slate-300">{listMatch[2]}</span>
      </div>
    );
  }
  return <p className="text-[10px] text-slate-300 py-0.5">{line}</p>;
}

export default function FormulaPopover({ metricId }) {
  const [open, setOpen] = useState(false);
  const [coords, setCoords] = useState({ top: 0, left: 0 });
  const btnRef = useRef(null);
  const popRef = useRef(null);

  const def = formulaDefinitions[metricId];

  const updatePosition = useCallback(() => {
    if (!btnRef.current) return;
    const rect = btnRef.current.getBoundingClientRect();
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    let left = rect.left + rect.width / 2;
    left = Math.min(left, vw - 220);
    left = Math.max(left, 220);
    let top = rect.bottom + 8;
    if (top + 400 > vh) top = Math.max(8, rect.top - 408);
    setCoords({ top, left });
  }, []);

  useEffect(() => {
    if (!open) return;
    updatePosition();
    const handler = (e) => {
      if (
        btnRef.current && !btnRef.current.contains(e.target) &&
        popRef.current && !popRef.current.contains(e.target)
      ) {
        setOpen(false);
      }
    };
    document.addEventListener('mousedown', handler);
    window.addEventListener('scroll', updatePosition, true);
    window.addEventListener('resize', updatePosition);
    return () => {
      document.removeEventListener('mousedown', handler);
      window.removeEventListener('scroll', updatePosition, true);
      window.removeEventListener('resize', updatePosition);
    };
  }, [open, updatePosition]);

  if (!def) return null;

  const conf = confidenceColors[def.confidence] || confidenceColors.verified;
  const sourceLines = def.dataSource.split('\n').filter(Boolean);
  const formulaLines = def.formula.split('\n').filter(Boolean);

  return (
    <>
      <button
        ref={btnRef}
        type="button"
        onClick={(e) => {
          e.stopPropagation();
          e.preventDefault();
          setOpen((v) => !v);
        }}
        className={`inline-flex items-center justify-center rounded-full transition-colors cursor-pointer ml-1 ${
          open ? 'bg-[#0393da] text-white' : 'text-slate-400 hover:text-[#0393da] hover:bg-blue-50'
        }`}
        style={{ width: 18, height: 18 }}
        title="View data source & formula"
      >
        <Info size={12} />
      </button>

      {open && createPortal(
        <div
          ref={popRef}
          style={{
            position: 'fixed',
            top: coords.top,
            left: coords.left,
            transform: 'translateX(-50%)',
            zIndex: 99999,
            width: 420,
            maxHeight: '80vh',
            overflowY: 'auto',
            animation: 'fadeIn 0.15s ease-out',
          }}
          className="bg-slate-800 rounded-xl shadow-2xl text-white"
        >
          <style>{`@keyframes fadeIn { from { opacity: 0; transform: translateX(-50%) scale(0.95); } to { opacity: 1; transform: translateX(-50%) scale(1); } }`}</style>

          {/* Header */}
          <div className="sticky top-0 bg-slate-800 rounded-t-xl flex items-start justify-between px-5 pt-4 pb-2 z-10">
            <div>
              <p className="text-sm font-bold">{def.title}</p>
              <div className="flex items-center gap-2 mt-1.5">
                <span
                  className="px-2 py-0.5 rounded text-[9px] font-bold uppercase tracking-wider"
                  style={{ background: conf.bg, color: conf.text }}
                >
                  {conf.label}
                </span>
                <span className="text-[9px] text-slate-500">{conf.desc}</span>
              </div>
            </div>
            <button
              onClick={(e) => { e.stopPropagation(); setOpen(false); }}
              className="p-1 rounded hover:bg-white/10 transition-colors text-slate-400 hover:text-white flex-shrink-0"
            >
              <X size={14} />
            </button>
          </div>

          {/* Formula */}
          <div className="px-5 py-2.5">
            <p className="text-[9px] font-bold uppercase tracking-wider text-slate-400 mb-1.5">Formel / Formula</p>
            <div className="bg-slate-900/60 rounded-lg px-3.5 py-2.5 border border-slate-700/50">
              {formulaLines.map((line, i) => (
                <code key={i} className="block text-[11px] leading-relaxed font-mono text-emerald-300">
                  {line}
                </code>
              ))}
            </div>
          </div>

          {/* Data Source */}
          <div className="px-5 py-2.5">
            <p className="text-[9px] font-bold uppercase tracking-wider text-slate-400 mb-1.5">Datenquelle / Data Source</p>
            <div className="bg-slate-900/40 rounded-lg px-3.5 py-2 border border-slate-700/50 space-y-0.5">
              {sourceLines.map((line, i) => (
                <DataSourceLine key={i} line={line} />
              ))}
            </div>
          </div>

          {/* Methodology */}
          <div className="px-5 py-2.5">
            <p className="text-[9px] font-bold uppercase tracking-wider text-slate-400 mb-1.5">Methodik / Methodology</p>
            <p className="text-[11px] leading-relaxed text-slate-300">{def.methodology}</p>
          </div>

          {/* Footer */}
          <div className="px-5 py-3 bg-slate-700/30 rounded-b-xl flex items-center justify-between border-t border-slate-700/50">
            <p className="text-[9px] text-slate-500">Stand / Updated: {def.lastUpdated}</p>
            <span
              className="px-2 py-0.5 rounded text-[9px] font-bold uppercase"
              style={{ background: conf.bg, color: conf.text }}
            >
              {conf.label}
            </span>
          </div>
        </div>,
        document.body
      )}
    </>
  );
}
