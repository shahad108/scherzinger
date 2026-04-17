import { formatValue } from './formatters';

const COMPACT_ROW_LIMIT = 3;

export default function DataTable({ spec, compact = false }) {
  const { columns, rows, caption } = spec;
  const visibleRows = compact ? rows.slice(0, COMPACT_ROW_LIMIT) : rows;
  const overflowCount = compact ? Math.max(0, rows.length - visibleRows.length) : 0;
  const textCls = compact ? 'text-[11px]' : 'text-xs';
  return (
    <div className="my-2">
      <div className="overflow-x-auto rounded-lg ring-1 ring-slate-200">
        <table className={`w-full ${textCls}`}>
          <thead className="bg-slate-50">
            <tr>
              {columns.map(c => (
                <th key={c.key} className="text-left px-3 py-2 font-semibold text-slate-600 whitespace-nowrap">{c.label}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {visibleRows.map((row, ri) => (
              <tr key={ri} className="border-t border-slate-100 hover:bg-slate-50/50">
                {columns.map(c => (
                  <td key={c.key} className="px-3 py-2 text-slate-700 whitespace-nowrap">
                    {formatValue(row[c.key], c.format)}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {overflowCount > 0 && (
        <div className="mt-1 text-[11px] text-slate-500 italic">+{overflowCount} row{overflowCount === 1 ? '' : 's'} in detailed view</div>
      )}
      {!compact && caption && <div className="mt-2 text-xs text-slate-500">{caption}</div>}
    </div>
  );
}
