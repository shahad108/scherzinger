export const BLOCK_TYPES = [
  'narrative',
  'metric_tile',
  'metric_grid',
  'comparison_cards',
  'ranked_list',
  'factor_breakdown',
  'chart',
  'callout',
  'action_plan',
  'data_table',
  'clarification',
];

const FACTOR_STATUSES = ['critical', 'moderate', 'stable', 'strong', 'weak'];
const CALLOUT_TONES = ['insight', 'warning', 'success'];
const CHART_VARIANTS = ['line', 'bar', 'donut'];
const PRIORITIES = ['high', 'medium', 'low'];
const BADGE_TONES = ['critical', 'warning', 'success', 'neutral'];

const fail = (reason) => ({ ok: false, reason });
const pass = () => ({ ok: true });

const isStr = (v) => typeof v === 'string' && v.length > 0;
const isNum = (v) => typeof v === 'number' && Number.isFinite(v);
const isStrOrNum = (v) => isStr(v) || isNum(v);

function validateNarrative(b) {
  if (!isStr(b.text)) return fail('narrative: text required');
  return pass();
}
function validateMetricTile(b) {
  if (!isStr(b.label)) return fail('metric_tile: label required');
  if (!isStrOrNum(b.value)) return fail('metric_tile: value required');
  return pass();
}
function validateMetricGrid(b) {
  if (!Array.isArray(b.tiles) || b.tiles.length === 0) return fail('metric_grid: non-empty tiles required');
  for (const t of b.tiles) {
    const r = validateMetricTile({ ...t, type: 'metric_tile' });
    if (!r.ok) return r;
  }
  return pass();
}
function validateComparisonCards(b) {
  if (!Array.isArray(b.subjects) || b.subjects.length < 2) return fail('comparison_cards: need ≥2 subjects');
  if (!Array.isArray(b.metrics) || b.metrics.length === 0) return fail('comparison_cards: metrics required');
  for (const s of b.subjects) {
    if (!isStr(s.id) || !isStr(s.label)) return fail('comparison_cards: subject needs id+label');
  }
  for (const m of b.metrics) {
    if (!isStr(m.key) || !isStr(m.label)) return fail('comparison_cards: metric needs key+label');
    if (!Array.isArray(m.values) || m.values.length !== b.subjects.length) {
      return fail(`comparison_cards: metric ${m.key} values must align with subjects`);
    }
  }
  return pass();
}
function validateRankedList(b) {
  if (!Array.isArray(b.items) || b.items.length === 0) return fail('ranked_list: items required');
  for (const it of b.items) {
    if (!isStr(it.id) || !isStr(it.label)) return fail('ranked_list: item needs id+label');
    if (!it.primary || !isStr(it.primary.label) || !isStrOrNum(it.primary.value)) {
      return fail('ranked_list: item.primary needs label+value');
    }
    if (it.badge && !BADGE_TONES.includes(it.badge.tone)) return fail('ranked_list: bad badge tone');
  }
  return pass();
}
function validateFactorBreakdown(b) {
  if (!Array.isArray(b.factors) || b.factors.length === 0) return fail('factor_breakdown: factors required');
  for (const f of b.factors) {
    if (!isStr(f.label)) return fail('factor_breakdown: factor.label required');
    if (!FACTOR_STATUSES.includes(f.status)) return fail('factor_breakdown: bad status');
  }
  return pass();
}
function validateChart(b) {
  if (!CHART_VARIANTS.includes(b.variant)) return fail('chart: bad variant');
  if (!Array.isArray(b.series)) return fail('chart: series required');
  return pass();
}
function validateCallout(b) {
  if (!CALLOUT_TONES.includes(b.tone)) return fail('callout: bad tone');
  if (!isStr(b.text)) return fail('callout: text required');
  return pass();
}
function validateActionPlan(b) {
  if (!Array.isArray(b.actions) || b.actions.length === 0) return fail('action_plan: actions required');
  for (const a of b.actions) {
    if (!isStr(a.title)) return fail('action_plan: action.title required');
    if (!PRIORITIES.includes(a.priority)) return fail('action_plan: bad priority');
  }
  return pass();
}
function validateDataTable(b) {
  if (!Array.isArray(b.columns) || b.columns.length === 0) return fail('data_table: columns required');
  if (!Array.isArray(b.rows)) return fail('data_table: rows required');
  for (const c of b.columns) {
    if (!isStr(c.key) || !isStr(c.label)) return fail('data_table: column needs key+label');
  }
  return pass();
}
function validateClarification(b) {
  if (!isStr(b.question)) return fail('clarification: question required');
  return pass();
}

const VALIDATORS = {
  narrative: validateNarrative,
  metric_tile: validateMetricTile,
  metric_grid: validateMetricGrid,
  comparison_cards: validateComparisonCards,
  ranked_list: validateRankedList,
  factor_breakdown: validateFactorBreakdown,
  chart: validateChart,
  callout: validateCallout,
  action_plan: validateActionPlan,
  data_table: validateDataTable,
  clarification: validateClarification,
};

export function validateBlock(block) {
  if (!block || typeof block !== 'object') return fail('not an object');
  if (!BLOCK_TYPES.includes(block.type)) return fail(`unknown type: ${block.type}`);
  return VALIDATORS[block.type](block);
}

export function validateReply(reply) {
  if (!reply || !Array.isArray(reply.blocks)) return fail('reply.blocks must be an array');
  for (let i = 0; i < reply.blocks.length; i++) {
    const r = validateBlock(reply.blocks[i]);
    if (!r.ok) return fail(`blocks[${i}]: ${r.reason}`);
  }
  return pass();
}
