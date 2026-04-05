import { useState, useMemo } from 'react';
import { Filter, Download, ChevronUp, ChevronDown } from 'lucide-react';
import { shadows, colors, radius, gradients } from '../../utils/designTokensV2';

const statusStyles = {
  'In Stock': { bg: '#f0fdf4', text: '#15803d' },
  'Low Stock': { bg: '#fff7ed', text: '#c2410c' },
  'Out of Stock': { bg: '#fef2f2', text: '#b91c1c' },
  Critical: { bg: '#fef2f2', text: '#b91c1c' },
  Adequate: { bg: '#f0fdf4', text: '#15803d' },
  Low: { bg: '#fff7ed', text: '#c2410c' },
  Overstock: { bg: '#eff6ff', text: '#1d4ed8' },
  Excess: { bg: '#f5f3ff', text: '#6d28d9' },
};

export default function InventoryTableV2({ title, subtitle, data, columns }) {
  const [sortKey, setSortKey] = useState(null);
  const [sortDir, setSortDir] = useState('asc');
  const [page, setPage] = useState(0);
  const perPage = 10;

  const handleSort = (key) => {
    if (sortKey === key) {
      setSortDir(sortDir === 'asc' ? 'desc' : 'asc');
    } else {
      setSortKey(key);
      setSortDir('asc');
    }
  };

  const sorted = useMemo(() => {
    if (!sortKey) return data;
    return [...data].sort((a, b) => {
      const av = a[sortKey], bv = b[sortKey];
      if (typeof av === 'number' && typeof bv === 'number') {
        return sortDir === 'asc' ? av - bv : bv - av;
      }
      return sortDir === 'asc'
        ? String(av).localeCompare(String(bv))
        : String(bv).localeCompare(String(av));
    });
  }, [data, sortKey, sortDir]);

  const paged = sorted.slice(page * perPage, (page + 1) * perPage);
  const totalPages = Math.ceil(sorted.length / perPage);

  const handleExport = () => {
    const header = columns.map((c) => c.label).join(',');
    const rows = sorted.map((row) =>
      columns.map((c) => {
        const v = row[c.key];
        return typeof v === 'string' && v.includes(',') ? `"${v}"` : v;
      }).join(',')
    );
    const csv = [header, ...rows].join('\n');
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'inventory_export.csv';
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div
      className="overflow-hidden"
      style={{
        background: colors.surface,
        borderRadius: radius.card,
        boxShadow: shadows.card,
      }}
    >
      {/* Header */}
      <div className="px-8 py-6 flex items-center justify-between" style={{ borderBottom: '1px solid #f8fafc' }}>
        <div>
          <h3
            className="text-lg font-semibold"
            style={{ fontFamily: "'Manrope', sans-serif", color: colors.darkNavy }}
          >
            {title}
          </h3>
          {subtitle && <p className="text-xs mt-0.5" style={{ color: '#737373' }}>{subtitle}</p>}
        </div>
        <div className="flex gap-3">
          <button
            className="p-2 rounded-lg transition-colors hover:bg-slate-100"
            style={{ color: '#737373' }}
          >
            <Filter size={18} />
          </button>
          <button
            onClick={handleExport}
            className="px-4 py-2 rounded-lg text-xs font-bold flex items-center gap-2 text-white"
            style={{ background: gradients.primary }}
          >
            Export Data <Download size={14} />
          </button>
        </div>
      </div>

      {/* Table */}
      <div className="overflow-x-auto">
        <table className="w-full text-left">
          <thead>
            <tr style={{ background: 'rgba(248,250,252,0.5)' }}>
              {columns.map((col) => (
                <th
                  key={col.key}
                  className="px-8 py-4 text-[10px] font-bold uppercase tracking-widest cursor-pointer select-none"
                  style={{ color: '#737373' }}
                  onClick={() => handleSort(col.key)}
                >
                  <span className="flex items-center gap-1">
                    {col.label}
                    {sortKey === col.key && (
                      sortDir === 'asc' ? <ChevronUp size={12} /> : <ChevronDown size={12} />
                    )}
                  </span>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {paged.map((row, i) => (
              <tr
                key={i}
                className="transition-colors"
                style={{ borderBottom: '1px solid #f8fafc' }}
                onMouseEnter={(e) => (e.currentTarget.style.background = 'rgba(248,250,252,0.3)')}
                onMouseLeave={(e) => (e.currentTarget.style.background = 'transparent')}
              >
                {columns.map((col) => (
                  <td key={col.key} className="px-8 py-5 text-sm">
                    {col.render ? col.render(row[col.key], row) : row[col.key]}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="px-8 py-4 flex items-center justify-between text-xs" style={{ color: '#737373' }}>
          <span>
            Showing {page * perPage + 1}–{Math.min((page + 1) * perPage, sorted.length)} of {sorted.length}
          </span>
          <div className="flex gap-2">
            <button
              disabled={page === 0}
              onClick={() => setPage(page - 1)}
              className="px-3 py-1 rounded-lg disabled:opacity-30"
              style={{ background: colors.surfaceContainer }}
            >
              Prev
            </button>
            <button
              disabled={page >= totalPages - 1}
              onClick={() => setPage(page + 1)}
              className="px-3 py-1 rounded-lg disabled:opacity-30"
              style={{ background: colors.surfaceContainer }}
            >
              Next
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
