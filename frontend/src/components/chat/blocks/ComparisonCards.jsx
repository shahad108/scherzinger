import { formatValue } from './formatters';
import EntityChip from './EntityChip';

export default function ComparisonCards({ spec, onEntityClick }) {
  const { subjects, metrics, caption } = spec;
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
