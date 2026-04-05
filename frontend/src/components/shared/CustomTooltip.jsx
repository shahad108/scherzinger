export default function CustomTooltip({ active, payload, label, formatter, descriptions }) {
  if (!active || !payload?.length) return null;

  const dataEntry = payload[0]?.payload;
  const entryName = dataEntry?.name || payload[0]?.name || label;
  const description = descriptions && entryName ? descriptions[entryName] : null;

  return (
    <div className="rounded-xl shadow-xl px-4 py-3 min-w-[160px] max-w-[280px] backdrop-blur-sm" style={{ background: 'rgba(255,255,255,0.95)', border: '1px solid #f8fafc' }}>
      {(label || entryName) && (
        <p className="text-[10px] font-bold uppercase tracking-wider mb-2 pb-2" style={{ color: '#a3a3a3', borderBottom: '1px solid #f8fafc' }}>
          {label || entryName}
        </p>
      )}
      <div className="space-y-1.5">
        {payload.map((entry, i) => (
          <div key={i} className="flex items-center gap-2 text-xs">
            <span
              className="size-2.5 rounded-sm flex-shrink-0"
              style={{ backgroundColor: entry.color || entry.stroke || '#0393da' }}
            />
            <span className="font-medium" style={{ color: '#737373' }}>{entry.name}:</span>
            <span className="font-bold ml-auto" style={{ color: '#1a1a2e' }}>
              {formatter ? formatter(entry.value, entry.name) : entry.value}
            </span>
          </div>
        ))}
      </div>
      {description && (
        <p className="text-[10px] mt-2 pt-2 leading-snug" style={{ color: '#a3a3a3', borderTop: '1px solid #f8fafc' }}>{description}</p>
      )}
    </div>
  );
}
