import { useEffect, useRef, useState, useCallback } from 'react';
import { Sparkles } from 'lucide-react';
import { useAiContext } from '../hooks/useAiContext';
import { useLanguage } from '../context/LanguageContext';

function hasPositiveSize(next, prev) {
  return next.width !== prev.width || next.height !== prev.height;
}

/**
 * Resize-observing chart container that also doubles as the Ask-AI focus target.
 *
 * Back-compat: all existing callers that only pass {className, style, children} still work.
 * Add `elementId` (+ optional `aiLabel`, `aiPayload`, `aiDashboard`) to enable the
 * Phase 0.4 focus behavior: visible ring when focused + "Mit KI analysieren" affordance.
 */
export default function MeasuredChartContainer({
  className = '',
  style,
  children,
  elementId,
  aiLabel,
  aiPayload,
  aiDashboard,
}) {
  const containerRef = useRef(null);
  const [size, setSize] = useState({ width: 0, height: 0 });
  const { focus, setFocus } = useAiContext();
  const { t } = useLanguage();

  useEffect(() => {
    const element = containerRef.current;
    if (!element) return undefined;

    const updateSize = () => {
      const next = {
        width: element.clientWidth,
        height: element.clientHeight,
      };
      setSize((prev) => (hasPositiveSize(next, prev) ? next : prev));
    };

    updateSize();

    const observer = new ResizeObserver(updateSize);
    observer.observe(element);

    return () => observer.disconnect();
  }, []);

  const isReady = size.width > 0 && size.height > 0;
  const isFocused = elementId && focus?.elementId === elementId;

  const handleFocusClick = useCallback((e) => {
    if (!elementId) return;
    e.stopPropagation();
    setFocus(elementId, { label: aiLabel, payload: aiPayload, dashboard: aiDashboard });
  }, [elementId, aiLabel, aiPayload, aiDashboard, setFocus]);

  const focusRingStyle = isFocused
    ? { boxShadow: '0 0 0 2px #0393da, 0 0 0 5px rgba(3,147,218,0.18)' }
    : null;

  return (
    <div
      ref={containerRef}
      className={`relative ${className}`}
      style={{ ...style, ...(focusRingStyle || {}), borderRadius: style?.borderRadius ?? 8 }}
      data-element-id={elementId || undefined}
    >
      {elementId ? (
        <button
          type="button"
          onClick={handleFocusClick}
          title={t('aiContext.analyze')}
          className="absolute top-2 right-2 z-10 flex items-center gap-1 px-2 py-1 rounded-md text-[10px] font-medium bg-white/80 backdrop-blur border border-slate-200 text-slate-500 hover:text-[#0393da] hover:border-[#0393da] transition-colors opacity-0 hover:opacity-100 group-hover:opacity-100"
          style={isFocused ? { opacity: 1, color: '#0393da', borderColor: '#0393da' } : undefined}
        >
          <Sparkles size={11} />
          <span>{t('aiContext.analyze')}</span>
        </button>
      ) : null}
      {isReady ? (typeof children === 'function' ? children(size) : children) : null}
    </div>
  );
}
