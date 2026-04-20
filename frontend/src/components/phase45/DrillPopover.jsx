import { useEffect, useRef } from 'react';

export default function DrillPopover({ anchorRect, title, stats = [], cta, onClose }) {
  const ref = useRef(null);

  useEffect(() => {
    const onKey = (e) => { if (e.key === 'Escape') onClose(); };
    const onClick = (e) => {
      if (ref.current && !ref.current.contains(e.target)) onClose();
    };
    document.addEventListener('keydown', onKey);
    const id = setTimeout(() => document.addEventListener('mousedown', onClick), 0);
    return () => {
      document.removeEventListener('keydown', onKey);
      document.removeEventListener('mousedown', onClick);
      clearTimeout(id);
    };
  }, [onClose]);

  if (!anchorRect) return null;

  const top = Math.min(anchorRect.bottom + 8, window.innerHeight - 240);
  const left = Math.min(anchorRect.left, window.innerWidth - 280);

  return (
    <div
      ref={ref}
      className="fixed z-40 w-64 bg-white rounded-lg shadow-xl border border-slate-200"
      style={{ top, left }}
      role="dialog"
    >
      <div className="px-4 py-3 border-b">
        <div className="font-semibold text-slate-900">{title}</div>
      </div>
      <div className="px-4 py-3 space-y-2">
        {stats.slice(0, 4).map((s, i) => (
          <div key={i} className="flex justify-between text-sm">
            <span className="text-slate-500">{s.label}</span>
            <span className="font-medium">
              {s.value}
              {s.delta != null && (
                <span className={`ml-2 text-xs ${s.delta >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                  {s.delta > 0 ? '+' : ''}{s.delta}%
                </span>
              )}
            </span>
          </div>
        ))}
      </div>
      {cta && (
        <div className="px-4 py-3 border-t">
          <button
            onClick={() => { cta.onClick(); onClose(); }}
            className="w-full bg-blue-600 text-white rounded px-3 py-2 text-sm hover:bg-blue-700"
          >{cta.label}</button>
        </div>
      )}
    </div>
  );
}
