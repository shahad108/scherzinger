export const BRAND = {
  name: 'PRYZM',
  footerText: 'PRYZM Analytics — Confidential',
  accentColor: '#2563eb',
  textColor: '#0f172a',
  mutedColor: '#64748b',
  ruleColor: '#e2e8f0',
};

export const MARGINS_PT = { top: 54, right: 54, bottom: 64, left: 54 };

export const FONTS = { heading: 'Helvetica-Bold', body: 'Helvetica' };

const TABLE_LIKE = new Set(['data_table', 'ranked_list', 'comparison_cards']);

export function resolveDefaultFormat(reply, userTextHint = '') {
  const hint = (userTextHint || '').toLowerCase();
  if (/\b(excel|xlsx|spreadsheet)\b/.test(hint)) return 'xlsx';
  if (/\b(word|docx|doc)\b/.test(hint)) return 'docx';
  if (/\bpdf\b/.test(hint)) return 'pdf';
  const blocks = reply?.blocks || [];
  const tableCount = blocks.filter(b => TABLE_LIKE.has(b?.type)).length;
  if (tableCount > 0 && tableCount >= blocks.length / 2) return 'xlsx';
  return 'pdf';
}

export function flattenConversation(messages = []) {
  const out = [];
  for (const m of messages) {
    if (m.role === 'user') {
      if (typeof m.content === 'string' && m.content.trim()) {
        out.push({
          type: 'narrative',
          tone: 'neutral',
          text: `Q: ${m.content.trim()}`,
        });
      }
    } else if (m.role === 'assistant' && m.format === 'structured' && Array.isArray(m.blocks)) {
      for (const b of m.blocks) {
        if (b && b.type !== 'report_download') out.push(b);
      }
    }
  }
  return out;
}

const LABELS = {
  narrative: 'Narrative',
  metric_tile: 'Key metric',
  metric_grid: 'Key metrics',
  comparison_cards: 'Comparison',
  ranked_list: 'Ranked list',
  factor_breakdown: 'Factor breakdown',
  chart: 'Chart',
  callout: 'Note',
  action_plan: 'Recommended actions',
  data_table: 'Data',
  clarification: 'Clarification',
};

export function blockSectionLabel(block) {
  return LABELS[block?.type] || 'Section';
}
