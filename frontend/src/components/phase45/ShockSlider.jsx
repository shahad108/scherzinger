import { IS_DEMO } from '../../utils/brand';

export default function ShockSlider({ label, value, onChange, accent = '#0393da' }) {
  if (!IS_DEMO) return null;
  const pct = ((value + 30) / 60) * 100;
  return (
    <div className="space-y-1.5">
      <div className="flex items-center justify-between">
        <span className="text-xs font-semibold uppercase tracking-wider" style={{ color: '#525252' }}>{label}</span>
        <span
          className="text-sm font-bold tabular-nums"
          style={{ color: value === 0 ? '#737373' : value > 0 ? '#dc2626' : '#16a34a' }}
        >
          {value > 0 ? '+' : ''}{value}%
        </span>
      </div>
      <div className="relative h-2 rounded-full" style={{ background: '#f1f5f9' }}>
        <div
          className="absolute top-0 h-full rounded-full"
          style={{
            left: `${Math.min(50, pct)}%`,
            width: `${Math.abs(pct - 50)}%`,
            background: `linear-gradient(90deg, ${accent}, ${accent}aa)`,
          }}
        />
        <input
          type="range"
          min={-30}
          max={30}
          step={1}
          value={value}
          onChange={(e) => onChange(Number(e.target.value))}
          className="absolute inset-0 w-full opacity-0 cursor-pointer"
        />
      </div>
    </div>
  );
}
