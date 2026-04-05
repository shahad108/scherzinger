// Mini visual elements for KPI card bottom content
// Provides premium micro-visualizations: bars, sparkline curves, avatars, range text

import { colors } from '../../utils/designTokensV2';

/** Mini bar chart — shows relative heights from an array of numbers */
export function MiniBars({ data, color = colors.primary }) {
  if (!data || data.length < 2) return null;
  const max = Math.max(...data);
  return (
    <div className="h-8 w-full flex items-end gap-1 opacity-60">
      {data.map((v, i) => (
        <div
          key={i}
          className="w-full rounded-sm"
          style={{
            height: `${(v / max) * 32}px`,
            background: i === data.length - 1
              ? color
              : `${color}${Math.round(25 + (i / data.length) * 40).toString(16).padStart(2, '0')}`,
          }}
        />
      ))}
    </div>
  );
}

/** SVG sparkline wave — decorative trend curve */
export function MiniWave({ color = colors.tertiary }) {
  return (
    <div className="h-8 w-full flex items-center justify-center">
      <svg className="w-full h-full" viewBox="0 0 100 20" preserveAspectRatio="none" style={{ opacity: 0.3 }}>
        <path d="M0 10 Q 25 2, 50 10 T 100 8" fill="none" stroke={color} strokeWidth="2" />
      </svg>
    </div>
  );
}

/** Customer avatar circles with +N overflow */
export function MiniAvatars({ count = 29, shown = 3 }) {
  return (
    <div className="flex -space-x-2 overflow-hidden">
      {[...Array(shown)].map((_, i) => (
        <div
          key={i}
          className="inline-block h-6 w-6 rounded-full ring-2 ring-white"
          style={{ background: `hsl(${200 + i * 30}, 60%, 70%)` }}
        />
      ))}
      <div
        className="inline-flex h-6 w-6 rounded-full ring-2 ring-white items-center justify-center text-[8px] font-bold"
        style={{ background: '#f1f5f9', color: '#737373' }}
      >
        +{count - shown}
      </div>
    </div>
  );
}

/** Range text — italic small text for P10/P90 etc. */
export function MiniRange({ text }) {
  return (
    <p className="text-[11px] italic" style={{ color: '#737373' }}>{text}</p>
  );
}

/** Horizontal progress bar */
export function MiniProgress({ value, max = 100, color = colors.primary }) {
  const pct = Math.min((value / max) * 100, 100);
  return (
    <div className="w-full h-1.5 rounded-full overflow-hidden" style={{ background: '#edeeef' }}>
      <div className="h-full rounded-full" style={{ width: `${pct}%`, background: color }} />
    </div>
  );
}

/** Dot cluster — shows colored dots for segment distribution */
export function MiniDots({ counts, colorMap }) {
  return (
    <div className="flex gap-1 flex-wrap">
      {Object.entries(counts).map(([key, count]) => (
        Array.from({ length: Math.min(count, 8) }).map((_, i) => (
          <div
            key={`${key}-${i}`}
            className="w-1.5 h-1.5 rounded-full"
            style={{ background: colorMap[key] || '#a3a3a3' }}
          />
        ))
      ))}
    </div>
  );
}
