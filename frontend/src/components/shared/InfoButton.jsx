import { useState, useRef, useEffect, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { Info } from 'lucide-react';

export default function InfoButton({ text, position = 'top' }) {
  if (!text) return null;

  const [open, setOpen] = useState(false);
  const [coords, setCoords] = useState({ top: 0, left: 0 });
  const btnRef = useRef(null);
  const popRef = useRef(null);

  const updatePosition = useCallback(() => {
    if (!btnRef.current) return;
    const rect = btnRef.current.getBoundingClientRect();
    const cx = rect.left + rect.width / 2;
    const cy = rect.top;

    if (position === 'bottom') {
      setCoords({ top: rect.bottom + 8, left: cx });
    } else {
      // default top
      setCoords({ top: cy - 8, left: cx });
    }
  }, [position]);

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
    return () => {
      document.removeEventListener('mousedown', handler);
      window.removeEventListener('scroll', updatePosition, true);
    };
  }, [open, updatePosition]);

  const transformOrigin = position === 'bottom' ? 'top center' : 'bottom center';
  const popoverStyle = position === 'bottom'
    ? { top: coords.top, left: coords.left, transform: 'translateX(-50%)' }
    : { top: coords.top, left: coords.left, transform: 'translate(-50%, -100%)' };

  return (
    <>
      <button
        ref={btnRef}
        type="button"
        onClick={(e) => { e.stopPropagation(); setOpen((v) => !v); }}
        className={`inline-flex items-center justify-center transition-colors cursor-pointer ml-1 ${open ? 'text-[#0393da]' : 'text-slate-400 hover:text-[#0393da]'}`}
      >
        <Info size={14} />
      </button>
      {open && createPortal(
        <div
          ref={popRef}
          style={{ ...popoverStyle, position: 'fixed', zIndex: 9999, transformOrigin }}
          className="max-w-[260px] px-3 py-2 text-[11px] leading-snug text-white bg-slate-800 rounded-lg shadow-lg whitespace-normal animate-in fade-in duration-150"
        >
          {text}
          <span
            className={`absolute left-1/2 -translate-x-1/2 border-4 ${
              position === 'bottom'
                ? 'bottom-full border-b-slate-800 border-x-transparent border-t-transparent'
                : 'top-full border-t-slate-800 border-x-transparent border-b-transparent'
            }`}
          />
        </div>,
        document.body
      )}
    </>
  );
}
