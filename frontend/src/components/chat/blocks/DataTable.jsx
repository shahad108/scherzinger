import { formatValue } from './formatters';

export default function DataTable({ spec }) {
  const { columns, rows, caption } = spec;
  return (
    <div className="my-3">
      <div className="overflow-x-auto rounded-lg ring-1 ring-slate-200">
        <table className="w-full text-xs">
          <thead className="bg-slate-50">
            <tr>
              {columns.map(c => (
                <th key={c.key} className="text-left px-3 py-2 font-semibold text-slate-600 whitespace-nowrap">{c.label}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((row, ri) => (
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
      {caption && <div className="mt-2 text-xs text-slate-500">{caption}</div>}
    </div>
  );
}
