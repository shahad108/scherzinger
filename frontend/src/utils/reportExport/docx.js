import { BRAND, MARGINS_PT, blockSectionLabel } from './shared';

function pt2twip(pt) { return Math.round(pt * 20); }

function formatValue(v, format) {
  if (v == null) return '—';
  if (format === 'currency') return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 }).format(Number(v));
  if (format === 'percent') {
    const n = Number(v);
    return `${(n > 1 ? n : n * 100).toFixed(1)}%`;
  }
  if (format === 'number') return new Intl.NumberFormat('en-US').format(Number(v));
  return String(v);
}

export async function generateDocx(spec, sourceBlocks) {
  const docx = await import('docx');
  const {
    Document, Packer, Paragraph, TextRun, HeadingLevel, AlignmentType, PageNumber,
    Footer, Header, Table, TableRow, TableCell, WidthType, BorderStyle, PageBreak,
  } = docx;

  const today = new Date().toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });

  const coverChildren = [
    new Paragraph({ children: [new TextRun({ text: BRAND.name, bold: true, size: 40, color: '2563EB' })] }),
    new Paragraph({ children: [new TextRun({ text: spec.title, bold: true, size: 56 })], spacing: { before: 400, after: 100 } }),
    ...(spec.subtitle ? [new Paragraph({ children: [new TextRun({ text: spec.subtitle, size: 28, color: '64748B' })] })] : []),
    ...(spec.audience ? [new Paragraph({ children: [new TextRun({ text: `Audience: ${spec.audience}`, size: 20, color: '64748B' })], spacing: { before: 200 } })] : []),
    new Paragraph({ children: [new TextRun({ text: `Generated: ${today}`, size: 20, color: '64748B' })] }),
    new Paragraph({ children: [new PageBreak()] }),
  ];

  const ctx = { Paragraph, TextRun, Table, TableRow, TableCell, WidthType, BorderStyle };

  const bodyChildren = [];
  const sectionByIdx = new Map((spec.sections || []).map(s => [s.blockIndex, s.label]));
  sourceBlocks.forEach((block, i) => {
    const heading = sectionByIdx.get(i) || blockSectionLabel(block);
    bodyChildren.push(new Paragraph({ heading: sectionByIdx.has(i) ? HeadingLevel.HEADING_1 : HeadingLevel.HEADING_2, children: [new TextRun({ text: heading })] }));
    bodyChildren.push(...blockToDocxChildren(block, ctx));
  });

  const doc = new Document({
    sections: [
      {
        properties: {
          page: { margin: { top: pt2twip(MARGINS_PT.top), right: pt2twip(MARGINS_PT.right), bottom: pt2twip(MARGINS_PT.bottom), left: pt2twip(MARGINS_PT.left) } },
          titlePage: false,
        },
        children: coverChildren,
      },
      {
        properties: {
          page: { margin: { top: pt2twip(MARGINS_PT.top), right: pt2twip(MARGINS_PT.right), bottom: pt2twip(MARGINS_PT.bottom), left: pt2twip(MARGINS_PT.left) } },
        },
        headers: {
          default: new Header({ children: [new Paragraph({ children: [new TextRun({ text: BRAND.name, bold: true, color: '2563EB' })] })] }),
        },
        footers: {
          default: new Footer({
            children: [
              new Paragraph({
                border: { top: { style: BorderStyle.SINGLE, size: 4, color: 'e2e8f0', space: 1 } },
                children: [
                  new TextRun({ text: BRAND.footerText, size: 16, color: '64748B' }),
                  new TextRun({ text: '\tPage ', size: 16, color: '64748B' }),
                  new TextRun({ children: [PageNumber.CURRENT], size: 16, color: '64748B' }),
                  new TextRun({ text: ' of ', size: 16, color: '64748B' }),
                  new TextRun({ children: [PageNumber.TOTAL_PAGES], size: 16, color: '64748B' }),
                ],
                alignment: AlignmentType.JUSTIFIED,
              }),
            ],
          }),
        },
        children: bodyChildren,
      },
    ],
  });

  const blob = await Packer.toBlob(doc);
  if (!blob.type) {
    return new Blob([await blob.arrayBuffer()], { type: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' });
  }
  return blob;
}

function tableFromRows(rows, { Paragraph, TextRun, Table, TableRow, TableCell, WidthType, BorderStyle }) {
  const side = { style: BorderStyle.SINGLE, size: 1, color: 'e2e8f0' };
  return new Table({
    width: { size: 100, type: WidthType.PERCENTAGE },
    rows: rows.map((row, ri) => new TableRow({
      children: row.map(cell => new TableCell({
        borders: { top: side, bottom: side, left: side, right: side },
        children: [new Paragraph({ children: [new TextRun({ text: String(cell ?? ''), bold: ri === 0, size: 18 })] })],
      })),
    })),
  });
}

function blockToDocxChildren(block, ctx) {
  const { Paragraph, TextRun } = ctx;
  switch (block.type) {
    case 'narrative':
      return [new Paragraph({ children: [new TextRun({ text: block.text, size: 22 })], spacing: { after: 120 } })];
    case 'metric_tile':
      return [tableFromRows([['Metric', 'Value'], [block.label, String(block.value) + (block.unit ? ` ${block.unit}` : '')]], ctx)];
    case 'metric_grid':
      return [tableFromRows([
        ['Metric', 'Value', 'Delta', 'Caption'],
        ...block.tiles.map(t => [t.label, `${t.value}${t.unit ? ` ${t.unit}` : ''}`, t.delta || '', t.caption || '']),
      ], ctx)];
    case 'comparison_cards':
      return [tableFromRows([
        ['Metric', ...block.subjects.map(s => s.label)],
        ...block.metrics.map(m => [m.label, ...m.values.map(v => formatValue(v, m.format))]),
      ], ctx)];
    case 'ranked_list':
      return [tableFromRows([
        ['#', 'Name', block.items[0]?.primary?.label || 'Value', 'Badge'],
        ...block.items.map((it, i) => [String(i + 1), it.label, formatValue(it.primary.value, it.primary.format), it.badge?.text || '']),
      ], ctx)];
    case 'factor_breakdown': {
      const rows = [['Factor', 'Weight %', 'Status', 'Value']];
      for (const f of block.factors) {
        rows.push([f.label, f.weight != null ? `${(f.weight * 100).toFixed(1)}%` : '', f.status, f.value || '']);
        if (f.detail) rows.push([f.detail, '', '', '']);
      }
      return [tableFromRows(rows, ctx)];
    }
    case 'chart': {
      const rows = [['X', ...(block.series || []).map(s => s.name)]];
      const firstData = block.series?.[0]?.data || [];
      for (let i = 0; i < firstData.length; i++) {
        const pt = firstData[i];
        const x = (pt && typeof pt === 'object' && 'x' in pt) ? pt.x : i;
        rows.push([String(x), ...(block.series || []).map(s => {
          const p = (s.data || [])[i];
          const y = (p && typeof p === 'object') ? p.y : p;
          return y == null ? '—' : String(y);
        })]);
      }
      return [tableFromRows(rows, ctx)];
    }
    case 'callout':
      return [new Paragraph({ children: [new TextRun({ text: `${(block.tone || 'note').toUpperCase()}: ${block.text}`, italics: true, size: 22 })], spacing: { after: 120 } })];
    case 'action_plan':
      return [tableFromRows([
        ['Priority', 'Title', 'Timeline', 'Impact', 'Rationale'],
        ...block.actions.map(a => [a.priority, a.title, a.timeline || '', a.impact || '', a.rationale || '']),
      ], ctx)];
    case 'data_table':
      return [tableFromRows([
        block.columns.map(c => c.label),
        ...block.rows.map(row => block.columns.map(c => formatValue(row[c.key], c.format))),
      ], ctx)];
    default:
      return [];
  }
}
