import { BRAND, MARGINS_PT, blockSectionLabel } from './shared';

let pdfMakePromise = null;
async function loadPdfMake() {
  if (!pdfMakePromise) {
    pdfMakePromise = (async () => {
      const pdfMakeModule = await import('pdfmake/build/pdfmake');
      const pdfMake = pdfMakeModule.default || pdfMakeModule;
      const fontsModule = await import('pdfmake/build/vfs_fonts');
      // pdfmake 0.3.x exports the font map directly at module top level
      // (keys like "Roboto-Regular.ttf"). Older 0.2.x nested it under
      // .pdfMake.vfs. Probe every shape and pick whichever actually has Roboto.
      const candidates = [
        fontsModule.pdfMake?.vfs,
        fontsModule.default?.pdfMake?.vfs,
        fontsModule.default?.vfs,
        fontsModule.vfs,
        fontsModule.default,
        fontsModule,
      ];
      const vfs = candidates.find(c => c && typeof c === 'object' && c['Roboto-Regular.ttf']);
      if (!vfs) {
        throw new Error('pdfmake: could not locate Roboto fonts in vfs_fonts module');
      }
      pdfMake.vfs = vfs;
      return pdfMake;
    })();
  }
  return pdfMakePromise;
}

function formatValue(v, format) {
  if (v == null) return '—';
  if (format === 'currency') return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 }).format(Number(v));
  if (format === 'percent') {
    const n = Number(v);
    const pct = n > 1 ? n : n * 100;
    return `${pct.toFixed(1)}%`;
  }
  if (format === 'number') return new Intl.NumberFormat('en-US').format(Number(v));
  return String(v);
}

const STATUS_COLOR = {
  critical: '#dc2626', weak: '#dc2626',
  moderate: '#d97706',
  stable:   '#16a34a', strong: '#16a34a',
};

function blockToPdfNodes(block) {
  switch (block.type) {
    case 'narrative':
      return [{ text: block.text, style: 'body', margin: [0, 0, 0, 8] }];
    case 'metric_tile':
      return [{
        table: { widths: ['*'], body: [[{ text: block.label, style: 'kpiLabel' }], [{ text: String(block.value) + (block.unit ? ` ${block.unit}` : ''), style: 'kpiValue' }]] },
        layout: 'lightHorizontalLines', margin: [0, 0, 0, 8],
      }];
    case 'metric_grid': {
      const n = block.tiles.length;
      const cols = Math.min(n, 4);
      const widths = Array(cols).fill('*');
      const rows = [];
      for (let i = 0; i < n; i += cols) {
        rows.push(block.tiles.slice(i, i + cols).map(t => ({
          stack: [
            { text: t.label, style: 'kpiLabel' },
            { text: String(t.value) + (t.unit ? ` ${t.unit}` : ''), style: 'kpiValue' },
            ...(t.caption ? [{ text: t.caption, style: 'caption' }] : []),
          ],
        })));
        while (rows[rows.length - 1].length < cols) rows[rows.length - 1].push({ text: '' });
      }
      return [{ table: { widths, body: rows }, layout: 'lightHorizontalLines', margin: [0, 0, 0, 8] }];
    }
    case 'comparison_cards': {
      const header = [{ text: '', style: 'thHead' }, ...block.subjects.map(s => ({ text: s.label, style: 'thHead' }))];
      const rows = block.metrics.map(m => [
        { text: m.label, style: 'thLeft' },
        ...m.values.map(v => ({ text: formatValue(v, m.format), style: 'td' })),
      ]);
      return [
        { table: { headerRows: 1, widths: ['auto', ...block.subjects.map(() => '*')], body: [header, ...rows] }, layout: 'lightHorizontalLines', margin: [0, 0, 0, 8] },
        ...(block.caption ? [{ text: block.caption, style: 'caption', margin: [0, 0, 0, 8] }] : []),
      ];
    }
    case 'ranked_list': {
      const header = ['#', 'Name', block.items[0]?.primary?.label || 'Value', 'Badge'].map(t => ({ text: t, style: 'thHead' }));
      const rows = block.items.map((it, i) => [
        { text: String(i + 1), style: 'td' },
        { text: it.label, style: 'td' },
        { text: formatValue(it.primary.value, it.primary.format), style: 'td' },
        { text: it.badge?.text || '', style: 'td', fillColor: { critical:'#fee2e2', warning:'#fef3c7', success:'#dcfce7', neutral:'#f1f5f9' }[it.badge?.tone] },
      ]);
      return [
        { table: { headerRows: 1, widths: ['auto', '*', 'auto', 'auto'], body: [header, ...rows] }, layout: 'lightHorizontalLines', margin: [0, 0, 0, 8] },
        ...(block.caption ? [{ text: block.caption, style: 'caption', margin: [0, 0, 0, 8] }] : []),
      ];
    }
    case 'factor_breakdown': {
      const header = ['Factor', 'Weight', 'Status', 'Value'].map(t => ({ text: t, style: 'thHead' }));
      const rows = [];
      for (const f of block.factors) {
        rows.push([
          { text: f.label, style: 'td' },
          { text: f.weight != null ? `${(f.weight * 100).toFixed(1)}%` : '', style: 'td' },
          { text: f.status, color: STATUS_COLOR[f.status] || BRAND.textColor, style: 'td' },
          { text: f.value || '', style: 'td' },
        ]);
        if (f.detail) rows.push([{ text: f.detail, colSpan: 4, style: 'caption', margin: [8, 0, 0, 4] }, {}, {}, {}]);
      }
      return [{ table: { headerRows: 1, widths: ['*', 'auto', 'auto', 'auto'], body: [header, ...rows] }, layout: 'lightHorizontalLines', margin: [0, 0, 0, 8] }];
    }
    case 'chart': {
      const rows = [];
      rows.push(['X', ...(block.series || []).map(s => s.name)].map(t => ({ text: t, style: 'thHead' })));
      const firstData = block.series?.[0]?.data || [];
      for (let i = 0; i < firstData.length; i++) {
        const point = firstData[i];
        const x = (point && typeof point === 'object' && 'x' in point) ? point.x : i;
        rows.push([
          { text: String(x), style: 'td' },
          ...(block.series || []).map(s => {
            const p = (s.data || [])[i];
            const y = (p && typeof p === 'object') ? p.y : p;
            return { text: y == null ? '—' : String(y), style: 'td' };
          }),
        ]);
      }
      return [
        ...(block.title ? [{ text: block.title, style: 'h2', margin: [0, 0, 0, 4] }] : []),
        { table: { headerRows: 1, widths: ['auto', ...(block.series || []).map(() => '*')], body: rows }, layout: 'lightHorizontalLines', margin: [0, 0, 0, 8] },
        ...(block.caption ? [{ text: block.caption, style: 'caption', margin: [0, 0, 0, 8] }] : []),
      ];
    }
    case 'callout':
      return [{
        table: { widths: ['*'], body: [[{ text: block.text, style: 'body' }]] },
        layout: { hLineColor: () => BRAND.ruleColor, vLineColor: () => BRAND.ruleColor, paddingLeft: () => 8, paddingRight: () => 8, paddingTop: () => 6, paddingBottom: () => 6 },
        margin: [0, 0, 0, 8],
      }];
    case 'action_plan': {
      const header = ['Priority', 'Title', 'Timeline', 'Impact', 'Rationale'].map(t => ({ text: t, style: 'thHead' }));
      const rows = block.actions.map(a => [
        { text: a.priority.toUpperCase(), style: 'td' },
        { text: a.title, style: 'td' },
        { text: a.timeline || '', style: 'td' },
        { text: a.impact || '', style: 'td' },
        { text: a.rationale || '', style: 'td' },
      ]);
      return [{ table: { headerRows: 1, widths: ['auto', '*', 'auto', 'auto', '*'], body: [header, ...rows] }, layout: 'lightHorizontalLines', margin: [0, 0, 0, 8] }];
    }
    case 'data_table': {
      const header = block.columns.map(c => ({ text: c.label, style: 'thHead' }));
      const rows = block.rows.map(row => block.columns.map(c => ({ text: formatValue(row[c.key], c.format), style: 'td' })));
      return [{ table: { headerRows: 1, widths: block.columns.map(() => '*'), body: [header, ...rows] }, layout: 'lightHorizontalLines', margin: [0, 0, 0, 8] }];
    }
    default:
      return [];
  }
}

export async function generatePdf(spec, sourceBlocks) {
  const pdfMake = await loadPdfMake();

  const today = new Date().toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });

  const coverNodes = [
    { text: BRAND.name, style: 'brand', margin: [0, 48, 0, 24] },
    { text: spec.title, style: 'title', margin: [0, 0, 0, 6] },
    ...(spec.subtitle ? [{ text: spec.subtitle, style: 'subtitle', margin: [0, 0, 0, 6] }] : []),
    ...(spec.audience ? [{ text: `Audience: ${spec.audience}`, style: 'meta', margin: [0, 0, 0, 6] }] : []),
    { text: `Generated: ${today}`, style: 'meta' },
    { text: '', pageBreak: 'after' },
  ];

  const tocNodes = [];
  if (Array.isArray(spec.sections) && spec.sections.length > 0) {
    tocNodes.push({ text: 'Contents', style: 'h1', margin: [0, 0, 0, 12] });
    tocNodes.push({
      ol: spec.sections.map(s => s.label),
      style: 'body',
      margin: [0, 0, 0, 0],
    });
    tocNodes.push({ text: '', pageBreak: 'after' });
  }

  const bodyNodes = [];
  const sectionByIdx = new Map((spec.sections || []).map(s => [s.blockIndex, s.label]));
  sourceBlocks.forEach((block, i) => {
    if (sectionByIdx.has(i)) {
      bodyNodes.push({ text: sectionByIdx.get(i), style: 'h1', margin: [0, 16, 0, 6] });
    } else {
      bodyNodes.push({ text: blockSectionLabel(block), style: 'h2', margin: [0, 12, 0, 4] });
    }
    bodyNodes.push(...blockToPdfNodes(block));
  });

  const doc = {
    pageMargins: [MARGINS_PT.left, MARGINS_PT.top, MARGINS_PT.right, MARGINS_PT.bottom],
    content: [...coverNodes, ...tocNodes, ...bodyNodes],
    footer: (currentPage, pageCount) => {
      if (currentPage === 1) return null;
      return {
        margin: [MARGINS_PT.left, 10, MARGINS_PT.right, 0],
        stack: [
          { canvas: [{ type: 'line', x1: 0, y1: 0, x2: 515, y2: 0, lineWidth: 0.5, lineColor: BRAND.ruleColor }] },
          {
            columns: [
              { text: BRAND.footerText, style: 'footerText' },
              { text: `Page ${currentPage} of ${pageCount}`, style: 'footerText', alignment: 'right' },
            ],
            margin: [0, 4, 0, 0],
          },
        ],
      };
    },
    styles: {
      brand:      { fontSize: 20, bold: true, color: BRAND.accentColor },
      title:      { fontSize: 28, bold: true, color: BRAND.textColor },
      subtitle:   { fontSize: 14, color: BRAND.mutedColor },
      meta:       { fontSize: 10, color: BRAND.mutedColor },
      h1:         { fontSize: 16, bold: true, color: BRAND.textColor },
      h2:         { fontSize: 12, bold: true, color: BRAND.textColor },
      body:       { fontSize: 10, color: BRAND.textColor, lineHeight: 1.35 },
      kpiLabel:   { fontSize: 9, color: BRAND.mutedColor, characterSpacing: 0.4 },
      kpiValue:   { fontSize: 16, bold: true, color: BRAND.textColor },
      caption:    { fontSize: 9, color: BRAND.mutedColor, italics: true },
      thHead:     { fontSize: 9, bold: true, color: BRAND.mutedColor, fillColor: '#f8fafc' },
      thLeft:     { fontSize: 9, bold: true, color: BRAND.textColor },
      td:         { fontSize: 10, color: BRAND.textColor },
      footerText: { fontSize: 8, color: BRAND.mutedColor },
    },
    defaultStyle: { font: 'Roboto' },
  };

  // pdfmake 0.3.x: getBlob() is Promise-returning (not callback-based as in
  // 0.2.x). Awaiting the returned Promise is the supported pattern.
  const pdfDoc = pdfMake.createPdf(doc);
  return pdfDoc.getBlob();
}
