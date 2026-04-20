import { formatValue } from './formatters';
import EntityChip from './EntityChip';

export default function ComparisonCards({ spec, onEntityClick, compact = false }) {
  const { subjects, metrics, caption } = spec;

  if (compact) {
    return (
      <div className="my-2 rounded-xl ring-1 ring-slate-200 bg-white overflow-hidden">
        <table className="w-full text-[11px]">
          <thead className="bg-slate-50">
            <tr>
              <th className="text-left px-3 py-1.5 font-semibold text-slate-600">Metric</th>
              {subjects.map(s => (
                <th key={s.id} className="text-right px-3 py-1.5 font-semibold text-slate-800 whitespace-nowrap">
                  <EntityChip {...s} onEntityClick={onEntityClick} />
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {metrics.map(m => (
              <tr key={m.key} className="border-t border-slate-100">
                <td className="px-3 py-1.5 text-slate-500">{m.label}</td>
                {m.values.map((v, si) => (
                  <td key={si} className="px-3 py-1.5 text-right font-semibold text-slate-900 tabular-nums whitespace-nowrap">
                    {formatValue(v, m.format)}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    );
  }

  const cols = subjects.length >= 3 ? 'grid-cols-1 md:grid-cols-3' : 'grid-cols-1 md:grid-cols-2';
  return (
    <div className="my-3">
      <div className={`grid ${cols} gap-3`}>
        {subjects.map((s, si) => (
          <div key={s.id} className="rounded-xl ring-1 ring-slate-200 bg-white p-4">
            <div className="text-sm mb-3">
              <EntityChip {...s} onEntityClick={onEntityClick} />
            </div>
            <dl className="space-y-2">
              {metrics.map(m => (
                <div key={m.key} className="flex items-baseline justify-between gap-3">
                  <dt className="text-xs text-slate-500">{m.label}</dt>
                  <dd className="text-sm font-semibold text-slate-900">{formatValue(m.values[si], m.format)}</dd>
                </div>
              ))}
            </dl>
          </div>
        ))}
      </div>
      {caption && <div className="mt-2 text-xs text-slate-500">{caption}</div>}
    </div>
  );
}
