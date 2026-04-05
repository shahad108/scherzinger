import { useState, useMemo } from 'react';
import { motion } from 'motion/react';
import { Download } from 'lucide-react';
import { tableVariants, viewportOnce } from '../../utils/animations';
import { colors, shadows, radius, gradients } from '../../utils/designTokensV2';
import Tooltip from './Tooltip';
import FormulaPopover from './FormulaPopover';
import DerivedBadge from './DerivedBadge';
import { track } from '../../utils/tracker';

const PAGE_SIZE = 20;

export default function DataTable({ title, columns, data, headerRight, tooltip, onRowClick, rowKey, selectedRowId, formulaId, confidence }) {
  const [sortKey, setSortKey] = useState(null);
  const [sortDir, setSortDir] = useState('asc');
  const [searchQuery, setSearchQuery] = useState('');
  const [page, setPage] = useState(0);

  const filtered = useMemo(() => {
    if (!searchQuery.trim()) return data;
    const q = searchQuery.toLowerCase();
    return data.filter((row) =>
      columns.some((col) => {
        const val = row[col.key];
        if (val == null) return false;
        return String(val).toLowerCase().includes(q);
      })
    );
  }, [data, searchQuery, columns]);

  const sorted = useMemo(() => {
    if (!sortKey) return filtered;
    return [...filtered].sort((a, b) => {
      let aVal = a[sortKey];
      let bVal = b[sortKey];
      if (aVal == null && bVal == null) return 0;
      if (aVal == null) return 1;
      if (bVal == null) return -1;
      if (typeof aVal === 'number' && typeof bVal === 'number') {
        return sortDir === 'asc' ? aVal - bVal : bVal - aVal;
      }
      aVal = String(aVal).toLowerCase();
      bVal = String(bVal).toLowerCase();
      if (aVal < bVal) return sortDir === 'asc' ? -1 : 1;
      if (aVal > bVal) return sortDir === 'asc' ? 1 : -1;
      return 0;
    });
  }, [filtered, sortKey, sortDir]);

  const totalPages = Math.ceil(sorted.length / PAGE_SIZE);
  const safePage = Math.min(page, Math.max(totalPages - 1, 0));
  const paged = sorted.slice(safePage * PAGE_SIZE, (safePage + 1) * PAGE_SIZE);

  const handleSort = (key) => {
    const newDir = sortKey === key ? (sortDir === 'asc' ? 'desc' : 'asc') : 'asc';
    if (sortKey === key) {
      setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'));
    } else {
      setSortKey(key);
      setSortDir('asc');
    }
    setPage(0);
    track.tableSort(title || 'table', key, newDir);
  };

  const handleSearch = (e) => {
    setSearchQuery(e.target.value);
    setPage(0);
    if (e.target.value.length > 2) track.tableSearch(title || 'table', e.target.value);
  };

  const handleExport = () => {
    const header = columns.map(c => c.label).join(',');
    const rows = sorted.map(row =>
      columns.map(col => {
        let val = row[col.key];
        if (val == null) return '';
        val = String(val);
        if (val.includes(',') || val.includes('"') || val.includes('\n')) {
          val = `"${val.replace(/"/g, '""')}"`;
        }
        return val;
      }).join(',')
    );
    const csv = [header, ...rows].join('\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${(title || 'export').replace(/\s+/g, '_').toLowerCase()}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const start = safePage * PAGE_SIZE + 1;
  const end = Math.min((safePage + 1) * PAGE_SIZE, sorted.length);

  return (
    <motion.div
      variants={tableVariants}
      initial="hidden"
      whileInView="visible"
      viewport={viewportOnce}
      className="overflow-hidden"
      style={{ background: colors.surface, borderRadius: radius.card, boxShadow: shadows.card }}
    >
      {title && (
        <div className="p-6 flex justify-between items-center gap-4" style={{ borderBottom: '1px solid #f8fafc' }}>
          <h3 className="font-bold text-base flex items-center gap-1" style={{ fontFamily: "'Manrope', sans-serif", color: colors.darkNavy }}>
            <Tooltip text={tooltip}><span>{title}</span></Tooltip>
            {formulaId && <FormulaPopover metricId={formulaId} />}
            {confidence && <DerivedBadge confidence={confidence} />}
          </h3>
          <div className="flex items-center gap-3">
            {data.length > PAGE_SIZE && (
              <input
                type="text"
                placeholder="Search…"
                value={searchQuery}
                onChange={handleSearch}
                className="px-3 py-1.5 text-sm rounded-lg focus:outline-none focus:ring-2 w-48"
                style={{ border: '1px solid #edeeef', background: colors.surfaceContainer }}
              />
            )}
            <button
              onClick={handleExport}
              className="px-4 py-1.5 text-xs font-bold rounded-lg transition-colors flex items-center gap-1.5 text-white"
              style={{ background: gradients.primary }}
              title="Export as CSV"
            >
              Export <Download size={14} />
            </button>
            {headerRight && <div>{headerRight}</div>}
          </div>
        </div>
      )}
      <div className="overflow-x-auto">
        <table className="w-full text-left border-collapse">
          <thead>
            <tr className="text-[10px] font-bold uppercase tracking-widest" style={{ background: 'rgba(248,250,252,0.5)', color: '#737373' }}>
              {columns.map((col) => (
                <th
                  key={col.key}
                  className={`px-6 py-4 cursor-pointer select-none transition-colors ${col.align === 'right' ? 'text-right' : ''}`}
                  onClick={() => handleSort(col.key)}
                  style={{ ':hover': { color: colors.darkNavy } }}
                >
                  <span className="inline-flex items-center gap-1">
                    <Tooltip text={col.tooltip} position="bottom">{col.label}</Tooltip>
                    {sortKey === col.key && (
                      <span style={{ color: colors.primary }}>{sortDir === 'asc' ? '▲' : '▼'}</span>
                    )}
                  </span>
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="text-sm">
            {paged.map((row, i) => {
              const isSelected = rowKey && selectedRowId != null && row[rowKey] === selectedRowId;
              return (
              <motion.tr
                key={rowKey ? row[rowKey] : i}
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ duration: 0.25, delay: Math.min(i * 0.02, 0.2) }}
                className={`transition-all duration-150 ${onRowClick ? 'cursor-pointer' : ''}`}
                style={{
                  borderBottom: '1px solid #f8fafc',
                  borderLeft: isSelected ? '3px solid #0393da' : '3px solid transparent',
                  background: isSelected ? '#eef6ff' : 'transparent',
                }}
                onClick={onRowClick ? () => { track.tableRowClick(title || 'table', rowKey ? row[rowKey] : i); onRowClick(row); } : undefined}
                onMouseEnter={(e) => { if (!isSelected) e.currentTarget.style.background = '#f8f9fa'; }}
                onMouseLeave={(e) => { e.currentTarget.style.background = isSelected ? '#eef6ff' : 'transparent'; }}
              >
                {columns.map((col) => (
                  <td key={col.key} className={`px-6 py-4 ${col.align === 'right' ? 'text-right' : ''}`}>
                    {col.render ? col.render(row[col.key], row) : row[col.key]}
                  </td>
                ))}
              </motion.tr>
              );
            })}
          </tbody>
        </table>
      </div>
      {sorted.length > PAGE_SIZE && (
        <div className="px-6 py-4 flex items-center justify-between text-sm" style={{ borderTop: '1px solid #f8fafc' }}>
          <div className="flex items-center gap-4">
            <span style={{ color: '#737373' }}>
              Showing {start}–{end} of {sorted.length}
            </span>
            <span className="text-xs" style={{ color: '#a3a3a3' }}>
              Page {safePage + 1} of {totalPages}
            </span>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => setPage(0)}
              disabled={safePage === 0}
              className="px-2 py-1 rounded-lg text-xs font-medium disabled:opacity-30 transition-colors"
              style={{ background: colors.surfaceContainer }}
            >
              First
            </button>
            <button
              onClick={() => setPage((p) => Math.max(p - 1, 0))}
              disabled={safePage === 0}
              className="px-3 py-1 rounded-lg text-sm font-medium disabled:opacity-30 transition-colors"
              style={{ background: colors.surfaceContainer }}
            >
              Previous
            </button>
            <button
              onClick={() => setPage((p) => Math.min(p + 1, totalPages - 1))}
              disabled={safePage >= totalPages - 1}
              className="px-3 py-1 rounded-lg text-sm font-medium disabled:opacity-30 transition-colors"
              style={{ background: colors.surfaceContainer }}
            >
              Next
            </button>
            <button
              onClick={() => setPage(totalPages - 1)}
              disabled={safePage >= totalPages - 1}
              className="px-2 py-1 rounded-lg text-xs font-medium disabled:opacity-30 transition-colors"
              style={{ background: colors.surfaceContainer }}
            >
              Last
            </button>
          </div>
        </div>
      )}
    </motion.div>
  );
}
