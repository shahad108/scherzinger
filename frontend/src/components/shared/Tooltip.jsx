export default function Tooltip({ text, children, position = 'top' }) {
  if (!text) return children;

  const positionClasses = {
    top: 'bottom-full left-1/2 -translate-x-1/2 mb-2',
    bottom: 'top-full left-1/2 -translate-x-1/2 mt-2',
    left: 'right-full top-1/2 -translate-y-1/2 mr-2',
    right: 'left-full top-1/2 -translate-y-1/2 ml-2',
  };

  const arrowClasses = {
    top: 'top-full left-1/2 -translate-x-1/2 border-t-slate-800 border-x-transparent border-b-transparent border-4',
    bottom: 'bottom-full left-1/2 -translate-x-1/2 border-b-slate-800 border-x-transparent border-t-transparent border-4',
    left: 'left-full top-1/2 -translate-y-1/2 border-l-slate-800 border-y-transparent border-r-transparent border-4',
    right: 'right-full top-1/2 -translate-y-1/2 border-r-slate-800 border-y-transparent border-l-transparent border-4',
  };

  return (
    <span className="relative inline-flex items-center group/tip">
      {children}
      <span
        className={`absolute ${positionClasses[position]} z-40 max-w-[240px] px-2.5 py-1.5 text-[11px] leading-snug text-white bg-slate-800 rounded-lg shadow-lg pointer-events-none opacity-0 group-hover/tip:opacity-100 transition-opacity duration-150 whitespace-normal`}
      >
        {text}
        <span className={`absolute ${arrowClasses[position]}`} />
      </span>
    </span>
  );
}
