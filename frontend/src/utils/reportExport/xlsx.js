import { BRAND, blockSectionLabel } from './shared';

const NUMFMT = { currency: '€#,##0', percent: '0.0%', number: '#,##0' };

function fmtCell(v, format) {
  if (v == null) return { v: '' };
  if (format === 'currency' || format === 'percent' || format === 'number') {
    const n = Number(v);
    if (Number.isFinite(n)) return { v: format === 'percent' && n > 1 ? n / 100 : n, t: 'n', z: NUMFMT[format] };
  }
  return { v };
}

function aoaFromBlock(block) {
  switch (block.type) {
    case 'narrative':
      return [[`Note: ${block.text}`]];
    case 'metric_tile':
      return [['Metric', 'Value'], [block.label, block.value]];
    case 'metric_grid':
      return [['Metric', 'Value', 'Delta', 'Caption'], ...block.tiles.map(t => [t.label, t.value, t.delta || '', t.caption || ''])];
    case 'comparison_cards': {
      const header = ['Metric', ...block.subjects.map(s => s.label)];
      const rows = block.metrics.map(m => [m.label, ...m.values.map(v => fmtCell(v, m.format).v)]);
      return [header, ...rows];
    }
    case 'ranked_list': {
      const header = ['#', 'Name', block.items[0]?.primary?.label || 'Value', 'Badge'];
      const rows = block.items.map((it, i) => [i + 1, it.label, fmtCell(it.primary.value, it.primary.format).v, it.badge?.text || '']);
      return [header, ...rows];
    }
    case 'factor_breakdown': {
      const header = ['Factor', 'Weight %', 'Status', 'Value', 'Detail'];
      const rows = block.factors.map(f => [f.label, f.weight != null ? (f.weight * 100).toFixed(1) : '', f.status, f.value || '', f.detail || '']);
      return [header, ...rows];
    }
    case 'chart': {
      const header = ['X', ...(block.series || []).map(s => s.name)];
      const firstData = block.series?.[0]?.data || [];
      const rows = firstData.map((pt, i) => {
        const x = (pt && typeof pt === 'object' && 'x' in pt) ? pt.x : i;
        return [x, ...(block.series || []).map(s => {
          const p = (s.data || [])[i];
          return (p && typeof p === 'object') ? p.y : p;
        })];
      });
      return [header, ...rows];
    }
    case 'callout':
      return [[`${block.tone?.toUpperCase() || 'NOTE'}: ${block.text}`]];
    case 'action_plan': {
      const header = ['Priority', 'Title', 'Timeline', 'Impact', 'Rationale'];
      const rows = block.actions.map(a => [a.priority, a.title, a.timeline || '', a.impact || '', a.rationale || '']);
      return [header, ...rows];
    }
    case 'data_table': {
      const header = block.columns.map(c => c.label);
      const rows = block.rows.map(row => block.columns.map(c => fmtCell(row[c.key], c.format).v));
      return [header, ...rows];
    }
    default:
      return [];
  }
}

function sheetNameFor(block, i) {
  const base = blockSectionLabel(block);
  return `${String(i + 1).padStart(2, '0')}. ${base}`.slice(0, 31);
}

function autoFit(ws, aoa) {
  if (!aoa[0]) return;
  const widths = aoa[0].map((_, colIdx) => {
    let max = 8;
    for (const row of aoa) {
      const cell = row[colIdx];
      if (cell != null) max = Math.max(max, Math.min(60, String(cell).length + 2));
    }
    return { wch: max };
  });
  ws['!cols'] = widths;
}

export async function generateXlsx(spec, sourceBlocks) {
  const XLSX = await import('xlsx');

  const wb = XLSX.utils.book_new();
  const today = new Date().toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });

  const cover = [
    [BRAND.name],
    [spec.title],
    spec.subtitle ? [spec.subtitle] : [''],
    spec.audience ? [`Audience: ${spec.audience}`] : [''],
    [`Generated: ${today}`],
    [''],
    ['Sections:'],
  ];
  sourceBlocks.forEach((b, i) => cover.push([`${i + 1}. ${blockSectionLabel(b)}`]));
  const ws0 = XLSX.utils.aoa_to_sheet(cover);
  ws0['!cols'] = [{ wch: 60 }];
  ws0['!printHeader'] = null;
  ws0['!headerFooter'] = { oddFooter: `&L"${BRAND.footerText}"&RPage &P of &N` };
  XLSX.utils.book_append_sheet(wb, ws0, 'Report');

  sourceBlocks.forEach((block, i) => {
    const aoa = aoaFromBlock(block);
    if (!aoa.length) return;
    const ws = XLSX.utils.aoa_to_sheet(aoa);
    autoFit(ws, aoa);
    ws['!headerFooter'] = { oddFooter: `&L"${BRAND.footerText}"&RPage &P of &N` };
    XLSX.utils.book_append_sheet(wb, ws, sheetNameFor(block, i));
  });

  const out = XLSX.write(wb, { bookType: 'xlsx', type: 'array' });
  return new Blob([out], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
}
