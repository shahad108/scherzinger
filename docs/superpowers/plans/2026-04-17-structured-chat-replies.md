# Structured Chat Replies Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the freeform markdown AI chat output with a typed block-based JSON contract so the AI picks the right response *shape* per question (single metric, comparison, drill-down, ranked list, etc.) and drops the "always ends with Recommended Actions" formula.

**Architecture:** Claude returns `{blocks: [...]}` JSON. An incremental parser renders each block as it becomes complete. Block components are typed React components (MetricTile, ComparisonCards, RankedList, FactorBreakdown, Chart, Narrative, Callout, ActionPlan, DataTable, Clarification). Entity-tagged subjects (customers, SKUs) are clickable and open the existing `useUI().openCustomerDetail` / `openSKUDetail` slide-overs. Legacy markdown messages still render via the existing `markdownRenderer.jsx`.

**Tech Stack:** React 19, Vite 7, Tailwind 4, recharts (already installed for the Chart block), `partial-json` (new), vitest (new — minimal, used only for parser + schema tests).

**Testing strategy:** The codebase has no test framework today. We add **vitest** and write unit tests only where they pay off the hardest: the schema validator (pure data, edge-heavy) and the streaming JSON parser (token-stream driven, flicker-sensitive). Block components are verified visually through a new dev-only `/chat-debug` route that renders each block type from fixture specs and offers a "replay stream" control to play a captured response token-by-token. Five canonical user questions get captured stream fixtures for regression.

**Reference files (read before starting):**
- `frontend/src/context/ChatContext.jsx` — current streaming wiring (`sendMessage`, `streamChat`)
- `frontend/src/utils/markdownRenderer.jsx` — legacy renderer, kept for old messages
- `frontend/src/pages/AIInsights.jsx` — message list render
- `frontend/src/components/phase45/InsightSlideOver.jsx` — entity drill-down pattern (`useUI().openCustomerDetail(id)` / `openSKUDetail(id)`)
- `frontend/src/utils/openrouter.js` — `streamChat({onChunk, onDone, onError, signal})`
- `frontend/src/utils/systemPromptMini.js` — existing system prompt we extend
- `docs/superpowers/specs/2026-04-17-structured-chat-replies-design.md` — the spec this plan implements

---

## Task 1: Install dependencies and add vitest scaffolding

**Files:**
- Modify: `frontend/package.json`
- Create: `frontend/vitest.config.js`
- Create: `frontend/src/utils/structuredReply/__tests__/.gitkeep`

- [ ] **Step 1: Install runtime + dev deps**

Run from `frontend/`:

```bash
npm install partial-json
npm install -D vitest @vitest/ui jsdom @testing-library/react @testing-library/jest-dom
```

Expected: updates `package.json` and `package-lock.json`, no errors.

- [ ] **Step 2: Add test script**

Edit `frontend/package.json` scripts block:

```json
"scripts": {
  "dev": "vite",
  "build": "vite build",
  "build:demo": "vite build --config vite.config.demo.js",
  "lint": "eslint .",
  "preview": "vite preview",
  "test": "vitest run",
  "test:watch": "vitest"
}
```

- [ ] **Step 3: Create `vitest.config.js`**

`frontend/vitest.config.js`:

```js
import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  test: {
    environment: 'jsdom',
    globals: true,
  },
});
```

- [ ] **Step 4: Sanity-check vitest**

Create `frontend/src/utils/structuredReply/__tests__/sanity.test.js`:

```js
import { describe, it, expect } from 'vitest';
describe('sanity', () => {
  it('runs', () => { expect(1 + 1).toBe(2); });
});
```

Run: `npm test`
Expected: 1 passing test.

- [ ] **Step 5: Commit**

```bash
git add frontend/package.json frontend/package-lock.json frontend/vitest.config.js frontend/src/utils/structuredReply/__tests__/sanity.test.js
git commit -m "structured-chat: add vitest + partial-json deps"
```

---

## Task 2: Block schema + validator (TDD)

**Files:**
- Create: `frontend/src/utils/structuredReply/schema.js`
- Create: `frontend/src/utils/structuredReply/__tests__/schema.test.js`

- [ ] **Step 1: Write failing tests for `validateBlock`**

`frontend/src/utils/structuredReply/__tests__/schema.test.js`:

```js
import { describe, it, expect } from 'vitest';
import { validateBlock, BLOCK_TYPES } from '../schema';

describe('validateBlock', () => {
  it('rejects unknown block type', () => {
    expect(validateBlock({ type: 'wat' }).ok).toBe(false);
  });

  it('accepts a minimal narrative', () => {
    expect(validateBlock({ type: 'narrative', text: 'hi' })).toEqual({ ok: true });
  });

  it('rejects narrative without text', () => {
    const r = validateBlock({ type: 'narrative' });
    expect(r.ok).toBe(false);
    expect(r.reason).toMatch(/text/);
  });

  it('accepts a metric_tile with label+value', () => {
    expect(validateBlock({ type: 'metric_tile', label: 'LTV', value: 1000 }).ok).toBe(true);
  });

  it('rejects metric_grid with zero tiles', () => {
    expect(validateBlock({ type: 'metric_grid', tiles: [] }).ok).toBe(false);
  });

  it('accepts a comparison_cards with aligned subjects/metrics', () => {
    const spec = {
      type: 'comparison_cards',
      subjects: [{ id: '1', label: 'A' }, { id: '2', label: 'B' }],
      metrics: [{ key: 'ltv', label: 'LTV', values: [100, 200] }],
    };
    expect(validateBlock(spec).ok).toBe(true);
  });

  it('rejects comparison_cards with misaligned values', () => {
    const spec = {
      type: 'comparison_cards',
      subjects: [{ id: '1', label: 'A' }, { id: '2', label: 'B' }],
      metrics: [{ key: 'ltv', label: 'LTV', values: [100] }],
    };
    expect(validateBlock(spec).ok).toBe(false);
  });

  it('accepts a ranked_list with items', () => {
    const spec = {
      type: 'ranked_list',
      items: [{ id: 'c1', label: 'A', primary: { label: 'LTV', value: 100 } }],
    };
    expect(validateBlock(spec).ok).toBe(true);
  });

  it('accepts a factor_breakdown with status', () => {
    const spec = {
      type: 'factor_breakdown',
      factors: [{ label: 'Recency', status: 'critical' }],
    };
    expect(validateBlock(spec).ok).toBe(true);
  });

  it('rejects factor_breakdown with bad status', () => {
    const spec = {
      type: 'factor_breakdown',
      factors: [{ label: 'Recency', status: 'broken' }],
    };
    expect(validateBlock(spec).ok).toBe(false);
  });

  it('accepts a chart with variant+series', () => {
    expect(validateBlock({ type: 'chart', variant: 'line', series: [{ name: 'a', data: [1, 2] }] }).ok).toBe(true);
  });

  it('rejects chart with unsupported variant', () => {
    expect(validateBlock({ type: 'chart', variant: 'radar', series: [] }).ok).toBe(false);
  });

  it('accepts a callout', () => {
    expect(validateBlock({ type: 'callout', tone: 'insight', text: 'x' }).ok).toBe(true);
  });

  it('accepts an action_plan', () => {
    const spec = {
      type: 'action_plan',
      actions: [{ title: 'Do the thing', priority: 'high' }],
    };
    expect(validateBlock(spec).ok).toBe(true);
  });

  it('accepts a data_table', () => {
    const spec = {
      type: 'data_table',
      columns: [{ key: 'a', label: 'A' }],
      rows: [{ a: 1 }],
    };
    expect(validateBlock(spec).ok).toBe(true);
  });

  it('accepts a clarification', () => {
    expect(validateBlock({ type: 'clarification', question: 'Which customer?' }).ok).toBe(true);
  });

  it('exposes BLOCK_TYPES constant', () => {
    expect(BLOCK_TYPES).toContain('narrative');
    expect(BLOCK_TYPES).toContain('comparison_cards');
    expect(BLOCK_TYPES).toContain('clarification');
  });
});
```

- [ ] **Step 2: Run tests, confirm all fail**

Run: `npm test`
Expected: all tests fail (module not found).

- [ ] **Step 3: Implement schema**

`frontend/src/utils/structuredReply/schema.js`:

```js
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
```

- [ ] **Step 4: Run tests, confirm all pass**

Run: `npm test`
Expected: all 17 schema tests pass.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/utils/structuredReply/schema.js frontend/src/utils/structuredReply/__tests__/schema.test.js
git commit -m "structured-chat: add block schema + validator"
```

---

## Task 3: Incremental stream parser (TDD)

**Files:**
- Create: `frontend/src/utils/structuredReply/streamParser.js`
- Create: `frontend/src/utils/structuredReply/__tests__/streamParser.test.js`

Behavior: given the accumulated text buffer of a streaming JSON response, return `{blocks, status}` where `status[i]` is `'ready' | 'pending'`. A block is `ready` when the parser has moved past its index (a later block has been seen) OR the stream is closed. Blocks already `ready` never revert to `pending`.

- [ ] **Step 1: Write failing tests**

`frontend/src/utils/structuredReply/__tests__/streamParser.test.js`:

```js
import { describe, it, expect, beforeEach } from 'vitest';
import { createStreamParser } from '../streamParser';

describe('createStreamParser', () => {
  let p;
  beforeEach(() => { p = createStreamParser(); });

  it('returns empty on empty input', () => {
    const r = p.feed('');
    expect(r.blocks).toEqual([]);
    expect(r.status).toEqual([]);
  });

  it('returns empty on pre-array input', () => {
    const r = p.feed('{"blocks":[');
    expect(r.blocks).toEqual([]);
  });

  it('marks an in-flight block as pending', () => {
    const r = p.feed('{"blocks":[{"type":"narrative","text":"hel');
    expect(r.blocks.length).toBe(1);
    expect(r.status[0]).toBe('pending');
  });

  it('marks a completed block as ready when a later block appears', () => {
    p.feed('{"blocks":[{"type":"narrative","text":"hello"}');
    const r = p.feed(',{"type":"callout","tone":"insight","text":"x"');
    expect(r.status[0]).toBe('ready');
    expect(r.status[1]).toBe('pending');
  });

  it('marks the final block as ready when finalize() is called', () => {
    p.feed('{"blocks":[{"type":"narrative","text":"hello"}]}');
    const r = p.finalize();
    expect(r.blocks.length).toBe(1);
    expect(r.status[0]).toBe('ready');
  });

  it('never regresses a ready block back to pending', () => {
    p.feed('{"blocks":[{"type":"narrative","text":"a"}');
    const mid = p.feed(',{"type":"narrative","text":"b');
    expect(mid.status[0]).toBe('ready');
    const later = p.feed('c"}');
    expect(later.status[0]).toBe('ready');
  });

  it('reports ok=false from finalize on malformed JSON', () => {
    p.feed('{"blocks":[{"type":"narrative","text":"oops');
    const r = p.finalize();
    expect(r.ok).toBe(false);
  });

  it('reports ok=true from finalize on clean JSON', () => {
    p.feed('{"blocks":[{"type":"narrative","text":"ok"}]}');
    const r = p.finalize();
    expect(r.ok).toBe(true);
  });

  it('handles a fully chunked stream', () => {
    const full = '{"blocks":[{"type":"narrative","text":"hi"},{"type":"callout","tone":"insight","text":"x"}]}';
    for (const ch of full) p.feed(ch);
    const r = p.finalize();
    expect(r.ok).toBe(true);
    expect(r.blocks.length).toBe(2);
    expect(r.status).toEqual(['ready', 'ready']);
  });
});
```

- [ ] **Step 2: Run tests, confirm all fail**

Run: `npm test`
Expected: failure (module not found).

- [ ] **Step 3: Implement parser**

`frontend/src/utils/structuredReply/streamParser.js`:

```js
import { parse, ALL as PARTIAL_ALL } from 'partial-json';

/**
 * Incremental parser for {blocks: [...]}. Re-parses the accumulated buffer
 * each feed() with partial-json's permissive mode; derives per-block ready/pending
 * status. Once a block is ready it never reverts.
 */
export function createStreamParser() {
  let buf = '';
  let lastBlocksLen = 0;
  let lastReadyIdx = -1; // index of last block known to be complete

  function computeFromBuffer(closed) {
    let parsed;
    try {
      parsed = parse(buf, PARTIAL_ALL);
    } catch {
      parsed = null;
    }
    const blocks = parsed && Array.isArray(parsed.blocks) ? parsed.blocks : [];

    // Promote ready index: if blocks.length grew, all previous blocks are definitely complete.
    if (blocks.length - 1 > lastReadyIdx && blocks.length > 0) {
      // Everything before the last index is fully serialized.
      lastReadyIdx = Math.max(lastReadyIdx, blocks.length - 2);
    }
    // On stream close, the final block is also ready.
    if (closed && blocks.length > 0) {
      lastReadyIdx = blocks.length - 1;
    }
    lastBlocksLen = blocks.length;

    const status = blocks.map((_, i) => (i <= lastReadyIdx ? 'ready' : 'pending'));
    return { blocks, status };
  }

  return {
    feed(chunk) {
      buf += chunk;
      return computeFromBuffer(false);
    },
    finalize() {
      let ok = true;
      try {
        JSON.parse(buf);
      } catch {
        ok = false;
      }
      const result = computeFromBuffer(true);
      return { ...result, ok, raw: buf };
    },
    getBuffer() { return buf; },
  };
}
```

- [ ] **Step 4: Run tests, confirm all pass**

Run: `npm test`
Expected: all parser tests pass (plus schema tests from Task 2).

- [ ] **Step 5: Commit**

```bash
git add frontend/src/utils/structuredReply/streamParser.js frontend/src/utils/structuredReply/__tests__/streamParser.test.js
git commit -m "structured-chat: add incremental stream parser"
```

---

## Task 4: Prompt addendum + few-shot examples

**Files:**
- Create: `frontend/src/utils/structuredReply/prompt.js`

- [ ] **Step 1: Create the prompt module**

`frontend/src/utils/structuredReply/prompt.js`:

```js
/**
 * System-prompt addendum that teaches Claude to emit {blocks: [...]}.
 * Append this to SYSTEM_PROMPT_MINI when STRUCTURED_CHAT is on.
 */
export const STRUCTURED_RESPONSE_PROMPT = `
## Response Format (REQUIRED)

You MUST return a single JSON object of the form:

{
  "blocks": [ { "type": "...", ... }, ... ]
}

No prose outside JSON. No markdown code fences. No explanation text. JSON only.

### Block types and when to use them

- narrative { text, tone? } — Lead-in insight or explanation. Use sparingly.
- metric_tile { label, value, unit?, delta?, deltaDirection?, caption? } — Single KPI.
- metric_grid { tiles: [metric_tile, ...] } — 2–4 KPIs side by side.
- comparison_cards { subjects: [{id,label,entityType?}], metrics: [{key,label,values[],format?}], caption? } — Side-by-side compare of 2+ subjects. values[] aligns to subjects[] by index.
- ranked_list { items: [{id,label,entityType?,primary:{label,value,format?},badge?:{text,tone}}], caption? } — Top/bottom N.
- factor_breakdown { factors: [{label,weight?,status,value?,detail?}], caption? } — Weighted factor list. status ∈ critical|moderate|stable|strong|weak. detail is markdown, expanded on click.
- chart { variant:"line"|"bar"|"donut", title?, series, xLabel?, yLabel?, caption? } — Visual trend/distribution.
- callout { tone:"insight"|"warning"|"success", text } — One-line highlight.
- action_plan { actions: [{title,priority:"high"|"medium"|"low",timeline?,impact?,rationale?}] } — Emit ONLY when the user explicitly asked what to do.
- data_table { columns: [{key,label,format?}], rows: [object], caption? } — Flat table, last-resort shape.
- clarification { question, suggestions?: [string] } — Emit when the question is ambiguous or you lack data.

### Rules

1. Pick the SHAPE that fits the question. Do NOT always emit the same sequence.
   - "What is X's Y?" → one metric_tile (optionally + narrative).
   - "Compare A vs B" → narrative lead-in + comparison_cards + optional factor_breakdown.
   - "Top/Bottom N…" → ranked_list.
   - "Why is X happening?" → narrative + factor_breakdown or chart.
   - "Show me the trend…" → chart (+ callout if there's a key insight).
   - "What should I do about…" → narrative + action_plan.
   - Ambiguous / missing data → clarification.
2. action_plan is OPT-IN. Emit it only when the user explicitly asks for actions or the question is action-framed. Default answers contain ZERO action_plan blocks.
3. Analyst voice lives in each block's \`caption\` (one line). Do not trail every block with a narrative restating the obvious.
4. Tag entities (customers, SKUs, products) with \`entityType: "customer" | "sku" | "product"\` on their id so the UI can drill in.

### Examples

Example 1 — single fact:
User: "What's customer 101580's LTV?"
Assistant:
{"blocks":[{"type":"metric_tile","label":"Customer 101580 LTV","value":726128,"unit":"EUR","caption":"High-value enterprise account, 13 invoices total."}]}

Example 2 — comparison (NO action_plan):
User: "Compare churn risk for 101580 vs 104053"
Assistant:
{"blocks":[
  {"type":"narrative","text":"Both customers sit at 0.62 churn risk but for very different reasons.","tone":"insight"},
  {"type":"comparison_cards",
    "subjects":[{"id":"101580","label":"Customer 101580","entityType":"customer"},{"id":"104053","label":"Customer 104053","entityType":"customer"}],
    "metrics":[
      {"key":"ltv","label":"LTV","values":[726128,675612],"format":"currency"},
      {"key":"win","label":"Win Rate","values":[0.78,0.33],"format":"percent"},
      {"key":"margin","label":"DB2 Margin","values":[0.678,0.645],"format":"percent"}
    ],
    "caption":"101580 converts well but rarely quotes; 104053 quotes often but loses."
  },
  {"type":"factor_breakdown",
    "factors":[
      {"label":"Order recency","weight":0.218,"status":"critical","detail":"Only 13 invoices in the full period — lowest touchpoint frequency in the segment."},
      {"label":"Quote win rate","weight":0.112,"status":"weak","value":"33%","detail":"Losing 2 of every 3 quotes — price/fit pressure."}
    ]
  }
]}

Example 3 — action-framed (action_plan belongs here):
User: "What should I do about at-risk enterprise customers?"
Assistant:
{"blocks":[
  {"type":"narrative","text":"Three enterprise accounts at ≥0.6 risk account for €1.8M LTV.","tone":"warning"},
  {"type":"ranked_list","items":[
    {"id":"101580","label":"Customer 101580","entityType":"customer","primary":{"label":"LTV","value":726128,"format":"currency"},"badge":{"text":"0.62","tone":"critical"}},
    {"id":"104053","label":"Customer 104053","entityType":"customer","primary":{"label":"LTV","value":675612,"format":"currency"},"badge":{"text":"0.62","tone":"critical"}}
  ]},
  {"type":"action_plan","actions":[
    {"title":"Re-engage 101580","priority":"high","timeline":"30 days","impact":"€150K–300K","rationale":"Low invoice count; a single project unlocks outsized value."},
    {"title":"Audit 104053 lost quotes","priority":"high","timeline":"45 days","impact":"€100K–200K","rationale":"33% win rate suggests pricing or fit mismatch."}
  ]}
]}

Example 4 — ambiguous input:
User: "show me churn"
Assistant:
{"blocks":[{"type":"clarification","question":"Which cut of churn would you like?","suggestions":["Top 10 at-risk customers","Churn trend by segment","A specific customer's risk factors"]}]}
`.trim();
```

- [ ] **Step 2: Commit**

```bash
git add frontend/src/utils/structuredReply/prompt.js
git commit -m "structured-chat: add prompt addendum + few-shot examples"
```

---

## Task 5: Helpers + BlockSkeleton + Callout + Narrative

**Files:**
- Create: `frontend/src/components/chat/blocks/formatters.js`
- Create: `frontend/src/components/chat/blocks/BlockSkeleton.jsx`
- Create: `frontend/src/components/chat/blocks/Narrative.jsx`
- Create: `frontend/src/components/chat/blocks/Callout.jsx`

- [ ] **Step 1: Create formatters helper**

`frontend/src/components/chat/blocks/formatters.js`:

```js
export function formatValue(v, format) {
  if (v == null) return '—';
  if (format === 'currency') {
    const n = Number(v);
    if (!Number.isFinite(n)) return String(v);
    return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 }).format(n);
  }
  if (format === 'percent') {
    const n = Number(v);
    if (!Number.isFinite(n)) return String(v);
    const pct = n > 1 ? n : n * 100;
    return `${pct.toFixed(1)}%`;
  }
  if (format === 'number') {
    const n = Number(v);
    if (!Number.isFinite(n)) return String(v);
    return new Intl.NumberFormat('en-US').format(n);
  }
  return String(v);
}

export const TONE_RING = {
  insight:  'ring-blue-200 bg-blue-50 text-blue-900',
  warning:  'ring-amber-200 bg-amber-50 text-amber-900',
  success:  'ring-emerald-200 bg-emerald-50 text-emerald-900',
  neutral:  'ring-slate-200 bg-slate-50 text-slate-800',
  critical: 'ring-red-200 bg-red-50 text-red-900',
};

export const STATUS_DOT = {
  critical: 'bg-red-500',
  moderate: 'bg-amber-500',
  stable:   'bg-emerald-500',
  strong:   'bg-emerald-500',
  weak:     'bg-red-500',
};

export const STATUS_LABEL = {
  critical: 'Critical',
  moderate: 'Moderate',
  stable:   'Stable',
  strong:   'Strong',
  weak:     'Weak',
};
```

- [ ] **Step 2: Create BlockSkeleton**

`frontend/src/components/chat/blocks/BlockSkeleton.jsx`:

```jsx
export default function BlockSkeleton({ kind }) {
  const shimmer = 'animate-pulse bg-slate-100 rounded';
  switch (kind) {
    case 'narrative':
      return (
        <div className="space-y-2 my-2">
          <div className={`${shimmer} h-3 w-11/12`} />
          <div className={`${shimmer} h-3 w-9/12`} />
        </div>
      );
    case 'metric_tile':
      return <div className={`${shimmer} h-16 w-48 my-2`} />;
    case 'metric_grid':
      return (
        <div className="grid grid-cols-2 gap-3 my-2">
          <div className={`${shimmer} h-16`} /><div className={`${shimmer} h-16`} />
          <div className={`${shimmer} h-16`} /><div className={`${shimmer} h-16`} />
        </div>
      );
    case 'comparison_cards':
      return (
        <div className="grid grid-cols-2 gap-3 my-3">
          <div className={`${shimmer} h-40`} /><div className={`${shimmer} h-40`} />
        </div>
      );
    case 'ranked_list':
      return (
        <div className="space-y-2 my-3">
          {[0,1,2,3].map(i => <div key={i} className={`${shimmer} h-10`} />)}
        </div>
      );
    case 'factor_breakdown':
      return (
        <div className="space-y-2 my-3">
          {[0,1,2].map(i => <div key={i} className={`${shimmer} h-8`} />)}
        </div>
      );
    case 'chart':
      return <div className={`${shimmer} h-48 my-3`} />;
    case 'callout':
      return <div className={`${shimmer} h-10 my-2`} />;
    case 'action_plan':
      return (
        <div className="space-y-2 my-3">
          {[0,1].map(i => <div key={i} className={`${shimmer} h-16`} />)}
        </div>
      );
    case 'data_table':
      return <div className={`${shimmer} h-32 my-3`} />;
    case 'clarification':
      return <div className={`${shimmer} h-16 my-2`} />;
    default:
      return <div className={`${shimmer} h-10 my-2`} />;
  }
}
```

- [ ] **Step 3: Create Narrative**

`frontend/src/components/chat/blocks/Narrative.jsx`:

```jsx
import { TONE_RING } from './formatters';

export default function Narrative({ spec }) {
  const { text, tone } = spec;
  if (!tone || tone === 'neutral') {
    return <p className="text-sm leading-relaxed text-slate-700 my-2">{text}</p>;
  }
  return (
    <div className={`text-sm leading-relaxed ring-1 rounded-lg px-3 py-2 my-2 ${TONE_RING[tone] || TONE_RING.neutral}`}>
      {text}
    </div>
  );
}
```

- [ ] **Step 4: Create Callout**

`frontend/src/components/chat/blocks/Callout.jsx`:

```jsx
import { Info, AlertTriangle, CheckCircle2 } from 'lucide-react';
import { TONE_RING } from './formatters';

const ICON = { insight: Info, warning: AlertTriangle, success: CheckCircle2 };

export default function Callout({ spec }) {
  const Icon = ICON[spec.tone] || Info;
  return (
    <div className={`flex items-start gap-2 text-sm ring-1 rounded-lg px-3 py-2 my-2 ${TONE_RING[spec.tone] || TONE_RING.insight}`}>
      <Icon className="w-4 h-4 mt-0.5 shrink-0" />
      <span className="leading-relaxed">{spec.text}</span>
    </div>
  );
}
```

- [ ] **Step 5: Commit**

```bash
git add frontend/src/components/chat/blocks/formatters.js frontend/src/components/chat/blocks/BlockSkeleton.jsx frontend/src/components/chat/blocks/Narrative.jsx frontend/src/components/chat/blocks/Callout.jsx
git commit -m "structured-chat: add formatters, BlockSkeleton, Narrative, Callout"
```

---

## Task 6: MetricTile + MetricGrid + DataTable

**Files:**
- Create: `frontend/src/components/chat/blocks/MetricTile.jsx`
- Create: `frontend/src/components/chat/blocks/MetricGrid.jsx`
- Create: `frontend/src/components/chat/blocks/DataTable.jsx`

- [ ] **Step 1: Create MetricTile**

`frontend/src/components/chat/blocks/MetricTile.jsx`:

```jsx
import { ArrowUpRight, ArrowDownRight, Minus } from 'lucide-react';

const DIR_ICON = { up: ArrowUpRight, down: ArrowDownRight, flat: Minus };
const DIR_COLOR = { up: 'text-emerald-600', down: 'text-red-600', flat: 'text-slate-400' };

export default function MetricTile({ spec }) {
  const { label, value, unit, delta, deltaDirection, caption } = spec;
  const Icon = DIR_ICON[deltaDirection] || null;
  return (
    <div className="rounded-xl ring-1 ring-slate-200 bg-white px-4 py-3 my-2">
      <div className="text-xs font-medium text-slate-500 uppercase tracking-wide">{label}</div>
      <div className="mt-1 flex items-baseline gap-2">
        <div className="text-2xl font-bold text-slate-900">{value}</div>
        {unit && <div className="text-sm text-slate-500">{unit}</div>}
      </div>
      {delta != null && (
        <div className={`mt-1 flex items-center gap-1 text-xs ${DIR_COLOR[deltaDirection] || 'text-slate-600'}`}>
          {Icon && <Icon className="w-3 h-3" />}
          <span>{delta}</span>
        </div>
      )}
      {caption && <div className="mt-2 text-xs text-slate-500 leading-relaxed">{caption}</div>}
    </div>
  );
}
```

- [ ] **Step 2: Create MetricGrid**

`frontend/src/components/chat/blocks/MetricGrid.jsx`:

```jsx
import MetricTile from './MetricTile';

export default function MetricGrid({ spec }) {
  const n = spec.tiles.length;
  const cols = n >= 4 ? 'grid-cols-2 md:grid-cols-4' : n === 3 ? 'grid-cols-3' : 'grid-cols-2';
  return (
    <div className={`grid ${cols} gap-3 my-3`}>
      {spec.tiles.map((t, i) => <MetricTile key={i} spec={t} />)}
    </div>
  );
}
```

- [ ] **Step 3: Create DataTable**

`frontend/src/components/chat/blocks/DataTable.jsx`:

```jsx
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
```

- [ ] **Step 4: Commit**

```bash
git add frontend/src/components/chat/blocks/MetricTile.jsx frontend/src/components/chat/blocks/MetricGrid.jsx frontend/src/components/chat/blocks/DataTable.jsx
git commit -m "structured-chat: add MetricTile, MetricGrid, DataTable blocks"
```

---

## Task 7: ComparisonCards + RankedList (with entity click)

**Files:**
- Create: `frontend/src/components/chat/blocks/EntityChip.jsx`
- Create: `frontend/src/components/chat/blocks/ComparisonCards.jsx`
- Create: `frontend/src/components/chat/blocks/RankedList.jsx`

- [ ] **Step 1: Create EntityChip**

`frontend/src/components/chat/blocks/EntityChip.jsx`:

```jsx
import { ExternalLink } from 'lucide-react';

export default function EntityChip({ id, label, entityType, onEntityClick }) {
  if (!entityType || !onEntityClick) {
    return <span className="font-semibold text-slate-900">{label}</span>;
  }
  return (
    <button
      type="button"
      onClick={() => onEntityClick({ entityType, id })}
      className="inline-flex items-center gap-1 font-semibold text-blue-700 hover:text-blue-900 hover:underline"
    >
      {label}
      <ExternalLink className="w-3 h-3 opacity-60" />
    </button>
  );
}
```

- [ ] **Step 2: Create ComparisonCards**

`frontend/src/components/chat/blocks/ComparisonCards.jsx`:

```jsx
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
```

- [ ] **Step 3: Create RankedList**

`frontend/src/components/chat/blocks/RankedList.jsx`:

```jsx
import { formatValue } from './formatters';
import EntityChip from './EntityChip';

const BADGE_CLS = {
  critical: 'bg-red-100 text-red-800 ring-red-200',
  warning:  'bg-amber-100 text-amber-800 ring-amber-200',
  success:  'bg-emerald-100 text-emerald-800 ring-emerald-200',
  neutral:  'bg-slate-100 text-slate-700 ring-slate-200',
};

export default function RankedList({ spec, onEntityClick }) {
  const { items, caption } = spec;
  return (
    <div className="my-3 rounded-xl ring-1 ring-slate-200 bg-white overflow-hidden">
      <ol>
        {items.map((it, i) => (
          <li key={it.id} className="flex items-center gap-3 px-4 py-2.5 border-t border-slate-100 first:border-t-0">
            <span className="text-xs font-mono text-slate-400 w-5">{i + 1}</span>
            <span className="flex-1 text-sm">
              <EntityChip {...it} onEntityClick={onEntityClick} />
            </span>
            <span className="text-xs text-slate-500">{it.primary.label}</span>
            <span className="text-sm font-semibold text-slate-900 tabular-nums">
              {formatValue(it.primary.value, it.primary.format)}
            </span>
            {it.badge && (
              <span className={`text-xs font-medium px-2 py-0.5 rounded ring-1 ${BADGE_CLS[it.badge.tone] || BADGE_CLS.neutral}`}>
                {it.badge.text}
              </span>
            )}
          </li>
        ))}
      </ol>
      {caption && <div className="px-4 py-2 bg-slate-50 text-xs text-slate-500 border-t border-slate-100">{caption}</div>}
    </div>
  );
}
```

- [ ] **Step 4: Commit**

```bash
git add frontend/src/components/chat/blocks/EntityChip.jsx frontend/src/components/chat/blocks/ComparisonCards.jsx frontend/src/components/chat/blocks/RankedList.jsx
git commit -m "structured-chat: add ComparisonCards, RankedList, EntityChip"
```

---

## Task 8: FactorBreakdown (with inline expand) + Chart + ActionPlan + Clarification

**Files:**
- Create: `frontend/src/components/chat/blocks/FactorBreakdown.jsx`
- Create: `frontend/src/components/chat/blocks/Chart.jsx`
- Create: `frontend/src/components/chat/blocks/ActionPlan.jsx`
- Create: `frontend/src/components/chat/blocks/Clarification.jsx`

- [ ] **Step 1: Create FactorBreakdown with expand**

`frontend/src/components/chat/blocks/FactorBreakdown.jsx`:

```jsx
import { useState } from 'react';
import { ChevronDown, ChevronRight } from 'lucide-react';
import renderMarkdown from '../../../utils/markdownRenderer';
import { STATUS_DOT, STATUS_LABEL } from './formatters';

export default function FactorBreakdown({ spec }) {
  const [open, setOpen] = useState({});
  return (
    <div className="my-3 rounded-xl ring-1 ring-slate-200 bg-white overflow-hidden">
      <ul>
        {spec.factors.map((f, i) => {
          const canExpand = !!f.detail;
          const isOpen = !!open[i];
          return (
            <li key={i} className="border-t border-slate-100 first:border-t-0">
              <button
                type="button"
                disabled={!canExpand}
                onClick={() => canExpand && setOpen(o => ({ ...o, [i]: !o[i] }))}
                className={`w-full flex items-center gap-3 px-4 py-2.5 text-left ${canExpand ? 'hover:bg-slate-50' : ''}`}
              >
                {canExpand ? (
                  isOpen ? <ChevronDown className="w-4 h-4 text-slate-400" /> : <ChevronRight className="w-4 h-4 text-slate-400" />
                ) : <span className="w-4" />}
                <span className={`w-2 h-2 rounded-full ${STATUS_DOT[f.status] || 'bg-slate-300'}`} />
                <span className="flex-1 text-sm font-medium text-slate-800">{f.label}</span>
                {f.weight != null && (
                  <span className="text-xs text-slate-500 tabular-nums">{(f.weight * 100).toFixed(1)}%</span>
                )}
                {f.value && <span className="text-xs text-slate-600">{f.value}</span>}
                <span className="text-xs text-slate-500">{STATUS_LABEL[f.status]}</span>
              </button>
              {canExpand && isOpen && (
                <div className="px-11 pb-3 pr-4 text-xs text-slate-600 leading-relaxed">
                  {renderMarkdown(f.detail)}
                </div>
              )}
            </li>
          );
        })}
      </ul>
      {spec.caption && (
        <div className="px-4 py-2 bg-slate-50 text-xs text-slate-500 border-t border-slate-100">{spec.caption}</div>
      )}
    </div>
  );
}
```

- [ ] **Step 2: Create Chart (recharts)**

`frontend/src/components/chat/blocks/Chart.jsx`:

```jsx
import {
  LineChart, Line, BarChart, Bar, PieChart, Pie, Cell,
  XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer,
} from 'recharts';

const COLORS = ['#2563eb', '#16a34a', '#dc2626', '#d97706', '#7c3aed', '#0891b2'];

function toRows(series) {
  // series: [{name, data: [{x, y}] | [number]}, ...]
  // Transpose to recharts row format: [{x, seriesA, seriesB, ...}, ...]
  if (!series || series.length === 0) return [];
  const firstData = series[0].data || [];
  const rows = firstData.map((d, i) => {
    const x = (d && typeof d === 'object' && 'x' in d) ? d.x : i;
    const row = { x };
    series.forEach(s => {
      const point = (s.data || [])[i];
      const y = (point && typeof point === 'object') ? point.y : point;
      row[s.name] = y;
    });
    return row;
  });
  return rows;
}

export default function Chart({ spec }) {
  const { variant, title, series = [], xLabel, yLabel, caption } = spec;
  return (
    <div className="my-3 rounded-xl ring-1 ring-slate-200 bg-white p-4">
      {title && <div className="text-sm font-semibold text-slate-800 mb-2">{title}</div>}
      <div className="h-56">
        <ResponsiveContainer width="100%" height="100%">
          {variant === 'donut' ? (
            <PieChart>
              <Pie
                data={(series[0]?.data || []).map((d, i) => ({
                  name: (d && d.x) ?? `Slice ${i+1}`,
                  value: (d && d.y) ?? d,
                }))}
                dataKey="value"
                nameKey="name"
                innerRadius={50}
                outerRadius={80}
                paddingAngle={2}
              >
                {(series[0]?.data || []).map((_, i) => (
                  <Cell key={i} fill={COLORS[i % COLORS.length]} />
                ))}
              </Pie>
              <Tooltip />
              <Legend />
            </PieChart>
          ) : variant === 'bar' ? (
            <BarChart data={toRows(series)}>
              <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
              <XAxis dataKey="x" label={xLabel ? { value: xLabel, position: 'insideBottom', offset: -4 } : undefined} tick={{ fontSize: 11 }} />
              <YAxis label={yLabel ? { value: yLabel, angle: -90, position: 'insideLeft' } : undefined} tick={{ fontSize: 11 }} />
              <Tooltip />
              <Legend />
              {series.map((s, i) => <Bar key={s.name} dataKey={s.name} fill={COLORS[i % COLORS.length]} />)}
            </BarChart>
          ) : (
            <LineChart data={toRows(series)}>
              <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
              <XAxis dataKey="x" label={xLabel ? { value: xLabel, position: 'insideBottom', offset: -4 } : undefined} tick={{ fontSize: 11 }} />
              <YAxis label={yLabel ? { value: yLabel, angle: -90, position: 'insideLeft' } : undefined} tick={{ fontSize: 11 }} />
              <Tooltip />
              <Legend />
              {series.map((s, i) => <Line key={s.name} type="monotone" dataKey={s.name} stroke={COLORS[i % COLORS.length]} strokeWidth={2} dot={false} />)}
            </LineChart>
          )}
        </ResponsiveContainer>
      </div>
      {caption && <div className="mt-2 text-xs text-slate-500">{caption}</div>}
    </div>
  );
}
```

- [ ] **Step 3: Create ActionPlan**

`frontend/src/components/chat/blocks/ActionPlan.jsx`:

```jsx
const PRIO_CLS = {
  high:   'bg-red-100 text-red-800 ring-red-200',
  medium: 'bg-amber-100 text-amber-800 ring-amber-200',
  low:    'bg-slate-100 text-slate-700 ring-slate-200',
};

export default function ActionPlan({ spec }) {
  return (
    <div className="my-3 space-y-2">
      {spec.actions.map((a, i) => (
        <div key={i} className="rounded-xl ring-1 ring-slate-200 bg-white p-4">
          <div className="flex items-center gap-2">
            <span className={`text-xs font-medium px-2 py-0.5 rounded ring-1 ${PRIO_CLS[a.priority]}`}>{a.priority.toUpperCase()}</span>
            <div className="text-sm font-semibold text-slate-900">{a.title}</div>
          </div>
          <div className="mt-2 flex flex-wrap gap-4 text-xs text-slate-600">
            {a.timeline && <span><span className="text-slate-400">Timeline:</span> {a.timeline}</span>}
            {a.impact   && <span><span className="text-slate-400">Impact:</span> {a.impact}</span>}
          </div>
          {a.rationale && <div className="mt-2 text-xs text-slate-600 leading-relaxed">{a.rationale}</div>}
        </div>
      ))}
    </div>
  );
}
```

- [ ] **Step 4: Create Clarification**

`frontend/src/components/chat/blocks/Clarification.jsx`:

```jsx
import { useChat } from '../../../context/ChatContext';

export default function Clarification({ spec }) {
  const { sendMessage } = useChat();
  return (
    <div className="my-3 rounded-xl ring-1 ring-blue-200 bg-blue-50 p-4">
      <div className="text-sm font-medium text-blue-900">{spec.question}</div>
      {Array.isArray(spec.suggestions) && spec.suggestions.length > 0 && (
        <div className="mt-3 flex flex-wrap gap-2">
          {spec.suggestions.map((s, i) => (
            <button
              key={i}
              type="button"
              onClick={() => sendMessage(s)}
              className="text-xs px-3 py-1.5 rounded-full bg-white ring-1 ring-blue-200 text-blue-800 hover:bg-blue-100"
            >
              {s}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 5: Commit**

```bash
git add frontend/src/components/chat/blocks/FactorBreakdown.jsx frontend/src/components/chat/blocks/Chart.jsx frontend/src/components/chat/blocks/ActionPlan.jsx frontend/src/components/chat/blocks/Clarification.jsx
git commit -m "structured-chat: add FactorBreakdown, Chart, ActionPlan, Clarification blocks"
```

---

## Task 9: StructuredReplyRenderer dispatcher

**Files:**
- Create: `frontend/src/components/chat/StructuredReplyRenderer.jsx`

- [ ] **Step 1: Create renderer**

`frontend/src/components/chat/StructuredReplyRenderer.jsx`:

```jsx
import { validateBlock } from '../../utils/structuredReply/schema';
import BlockSkeleton from './blocks/BlockSkeleton';
import Narrative from './blocks/Narrative';
import MetricTile from './blocks/MetricTile';
import MetricGrid from './blocks/MetricGrid';
import ComparisonCards from './blocks/ComparisonCards';
import RankedList from './blocks/RankedList';
import FactorBreakdown from './blocks/FactorBreakdown';
import Chart from './blocks/Chart';
import Callout from './blocks/Callout';
import ActionPlan from './blocks/ActionPlan';
import DataTable from './blocks/DataTable';
import Clarification from './blocks/Clarification';

const COMPONENTS = {
  narrative: Narrative,
  metric_tile: MetricTile,
  metric_grid: MetricGrid,
  comparison_cards: ComparisonCards,
  ranked_list: RankedList,
  factor_breakdown: FactorBreakdown,
  chart: Chart,
  callout: Callout,
  action_plan: ActionPlan,
  data_table: DataTable,
  clarification: Clarification,
};

function BlockError({ reason }) {
  return (
    <div className="my-2 text-xs text-red-700 bg-red-50 ring-1 ring-red-200 rounded px-3 py-2">
      Couldn't render this block: {reason}
    </div>
  );
}

export default function StructuredReplyRenderer({ blocks = [], status = [], onEntityClick, finalized = false }) {
  return (
    <div className="space-y-0">
      {blocks.map((spec, i) => {
        const s = status[i] || (finalized ? 'ready' : 'pending');
        if (s === 'pending') {
          return <BlockSkeleton key={i} kind={spec?.type || 'narrative'} />;
        }
        const v = validateBlock(spec);
        if (!v.ok) return <BlockError key={i} reason={v.reason} />;
        const Cmp = COMPONENTS[spec.type];
        return <Cmp key={i} spec={spec} onEntityClick={onEntityClick} />;
      })}
    </div>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add frontend/src/components/chat/StructuredReplyRenderer.jsx
git commit -m "structured-chat: add StructuredReplyRenderer dispatcher"
```

---

## Task 10: /chat-debug route with fixtures + stream replay

**Files:**
- Create: `frontend/src/pages/ChatDebug.jsx`
- Create: `frontend/src/pages/chatDebugFixtures.js`
- Modify: `frontend/src/App.jsx` (add route)

- [ ] **Step 1: Create fixtures**

`frontend/src/pages/chatDebugFixtures.js`:

```js
export const FIXTURES = {
  narrative: { blocks: [
    { type: 'narrative', text: 'Neutral lead-in.' },
    { type: 'narrative', text: 'An insightful framing.', tone: 'insight' },
    { type: 'narrative', text: 'Something worth flagging.', tone: 'warning' },
  ]},
  metric_tile: { blocks: [
    { type: 'metric_tile', label: 'Customer 101580 LTV', value: '€726,128', delta: '+12%', deltaDirection: 'up', caption: 'High-value enterprise account.' },
  ]},
  metric_grid: { blocks: [
    { type: 'metric_grid', tiles: [
      { label: 'Revenue', value: '€4.2M' },
      { label: 'Orders', value: 183, delta: '+8%', deltaDirection: 'up' },
      { label: 'Win Rate', value: '62%', delta: '-3pp', deltaDirection: 'down' },
      { label: 'DB2 Margin', value: '65.1%' },
    ]},
  ]},
  comparison_cards: { blocks: [
    { type: 'narrative', text: 'Both customers sit at 0.62 churn risk but for very different reasons.', tone: 'insight' },
    { type: 'comparison_cards',
      subjects: [
        { id: '101580', label: 'Customer 101580', entityType: 'customer' },
        { id: '104053', label: 'Customer 104053', entityType: 'customer' },
      ],
      metrics: [
        { key: 'ltv', label: 'LTV', values: [726128, 675612], format: 'currency' },
        { key: 'win', label: 'Win Rate', values: [0.78, 0.33], format: 'percent' },
        { key: 'margin', label: 'DB2 Margin', values: [0.678, 0.645], format: 'percent' },
      ],
      caption: '101580 converts well but rarely quotes; 104053 quotes often but loses.'
    },
  ]},
  ranked_list: { blocks: [
    { type: 'ranked_list', items: [
      { id: '101580', label: 'Customer 101580', entityType: 'customer', primary: { label: 'LTV', value: 726128, format: 'currency' }, badge: { text: '0.62', tone: 'critical' } },
      { id: '104053', label: 'Customer 104053', entityType: 'customer', primary: { label: 'LTV', value: 675612, format: 'currency' }, badge: { text: '0.62', tone: 'critical' } },
      { id: '109221', label: 'Customer 109221', entityType: 'customer', primary: { label: 'LTV', value: 412000, format: 'currency' }, badge: { text: '0.48', tone: 'warning' } },
    ], caption: 'Sorted by churn probability.' },
  ]},
  factor_breakdown: { blocks: [
    { type: 'factor_breakdown',
      factors: [
        { label: 'Order recency', weight: 0.218, status: 'critical', detail: 'Only 13 invoices in the full period — extremely low touchpoint frequency for a €726K customer.' },
        { label: 'Quote win rate', weight: 0.112, status: 'weak', value: '33%', detail: 'Losing 2 of every 3 quotes — **price or fit mismatch**.' },
        { label: 'Margin trend', weight: 0.175, status: 'stable' },
        { label: 'Product breadth', weight: 0.142, status: 'moderate' },
      ]},
  ]},
  chart: { blocks: [
    { type: 'chart', variant: 'line', title: 'Monthly revenue', series: [
      { name: 'Revenue', data: [{x:'Jan',y:80},{x:'Feb',y:72},{x:'Mar',y:91},{x:'Apr',y:88},{x:'May',y:105}] },
    ], caption: 'Up 31% YoY.' },
    { type: 'chart', variant: 'bar', title: 'Top segments', series: [
      { name: 'Revenue', data: [{x:'Enterprise',y:2.1},{x:'SMB',y:1.4},{x:'Public',y:0.7}] },
    ]},
    { type: 'chart', variant: 'donut', title: 'Revenue mix', series: [
      { name: 'Mix', data: [{x:'Widgets',y:42},{x:'Services',y:31},{x:'Parts',y:18},{x:'Other',y:9}] },
    ]},
  ]},
  callout: { blocks: [
    { type: 'callout', tone: 'insight', text: 'Three enterprise accounts account for 46% of total LTV.' },
    { type: 'callout', tone: 'warning', text: 'Customer 101580 hasn\'t invoiced in 6 months.' },
    { type: 'callout', tone: 'success', text: 'Margin recovered to 65% this quarter.' },
  ]},
  action_plan: { blocks: [
    { type: 'action_plan', actions: [
      { title: 'Re-engage 101580', priority: 'high', timeline: '30 days', impact: '€150K–300K', rationale: 'Low invoice count; a single project unlocks outsized value.' },
      { title: 'Audit 104053 lost quotes', priority: 'high', timeline: '45 days', impact: '€100K–200K' },
      { title: 'Assign dedicated AM', priority: 'medium', timeline: '60 days' },
    ]},
  ]},
  data_table: { blocks: [
    { type: 'data_table',
      columns: [
        { key: 'id', label: 'Customer' },
        { key: 'ltv', label: 'LTV', format: 'currency' },
        { key: 'risk', label: 'Risk' },
      ],
      rows: [
        { id: '101580', ltv: 726128, risk: 0.62 },
        { id: '104053', ltv: 675612, risk: 0.62 },
      ]},
  ]},
  clarification: { blocks: [
    { type: 'clarification', question: 'Which cut of churn would you like?', suggestions: ['Top 10 at-risk customers', 'Churn trend by segment', 'A specific customer\'s risk factors'] },
  ]},
};

export const REPLAY_STREAM = JSON.stringify(FIXTURES.comparison_cards);
```

- [ ] **Step 2: Create ChatDebug page**

`frontend/src/pages/ChatDebug.jsx`:

```jsx
import { useState, useEffect, useRef } from 'react';
import StructuredReplyRenderer from '../components/chat/StructuredReplyRenderer';
import { createStreamParser } from '../utils/structuredReply/streamParser';
import { FIXTURES, REPLAY_STREAM } from './chatDebugFixtures';

export default function ChatDebug() {
  const [pick, setPick] = useState('comparison_cards');
  const [replay, setReplay] = useState({ blocks: [], status: [], finalized: false });
  const parserRef = useRef(null);
  const timerRef = useRef(null);

  useEffect(() => () => { if (timerRef.current) clearInterval(timerRef.current); }, []);

  const startReplay = () => {
    if (timerRef.current) clearInterval(timerRef.current);
    parserRef.current = createStreamParser();
    setReplay({ blocks: [], status: [], finalized: false });
    let i = 0;
    const str = REPLAY_STREAM;
    timerRef.current = setInterval(() => {
      if (i >= str.length) {
        clearInterval(timerRef.current);
        const r = parserRef.current.finalize();
        setReplay({ blocks: r.blocks, status: r.status, finalized: true });
        return;
      }
      const chunk = str.slice(i, i + 3);
      i += 3;
      const r = parserRef.current.feed(chunk);
      setReplay({ blocks: r.blocks, status: r.status, finalized: false });
    }, 30);
  };

  const onEntityClick = ({ entityType, id }) => {
    alert(`Entity click: ${entityType} ${id}`);
  };

  const fixture = FIXTURES[pick];

  return (
    <div className="max-w-4xl mx-auto p-6 space-y-6">
      <h1 className="text-2xl font-bold">Chat Debug</h1>

      <section>
        <h2 className="text-sm font-semibold mb-2">Block picker</h2>
        <select
          value={pick}
          onChange={e => setPick(e.target.value)}
          className="text-sm border rounded px-2 py-1"
        >
          {Object.keys(FIXTURES).map(k => <option key={k} value={k}>{k}</option>)}
        </select>
        <div className="mt-4 rounded-xl bg-slate-50 ring-1 ring-slate-200 p-4">
          <StructuredReplyRenderer blocks={fixture.blocks} finalized onEntityClick={onEntityClick} />
        </div>
      </section>

      <section>
        <h2 className="text-sm font-semibold mb-2">Stream replay</h2>
        <button
          onClick={startReplay}
          className="text-sm px-3 py-1.5 rounded bg-blue-600 text-white hover:bg-blue-700"
        >
          Replay ComparisonCards stream
        </button>
        <div className="mt-4 rounded-xl bg-slate-50 ring-1 ring-slate-200 p-4">
          <StructuredReplyRenderer
            blocks={replay.blocks}
            status={replay.status}
            finalized={replay.finalized}
            onEntityClick={onEntityClick}
          />
        </div>
      </section>
    </div>
  );
}
```

- [ ] **Step 3: Wire route**

Find where routes are defined (likely `frontend/src/App.jsx`). Add:

```jsx
import ChatDebug from './pages/ChatDebug';
// ...inside <Routes>
<Route path="/chat-debug" element={<ChatDebug />} />
```

- [ ] **Step 4: Verify visually**

Run: `npm run dev`
Open: `http://localhost:5173/chat-debug`
Expected:
- Dropdown cycles through all 11 block types; each renders cleanly.
- Entity chips in `comparison_cards` and `ranked_list` alert when clicked.
- "Replay ComparisonCards stream" button shows skeleton → narrative → comparison_cards progressively over ~1–2 seconds.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/pages/ChatDebug.jsx frontend/src/pages/chatDebugFixtures.js frontend/src/App.jsx
git commit -m "structured-chat: add /chat-debug route with fixtures + replay"
```

---

## Task 11: Wire ChatContext to structured streaming (behind flag)

**Files:**
- Modify: `frontend/src/context/ChatContext.jsx`

Behavior: when `STRUCTURED_CHAT` is on, append `STRUCTURED_RESPONSE_PROMPT` to the system prompt, run the accumulated stream through `createStreamParser()`, and store the result on the message as `{ format: 'structured', blocks, status, finalized, raw }`. Legacy markdown path is preserved as fallback and for old messages.

- [ ] **Step 1: Import the new deps at the top of ChatContext.jsx**

Add to `frontend/src/context/ChatContext.jsx` imports (after line 15):

```jsx
import { createStreamParser } from '../utils/structuredReply/streamParser';
import { STRUCTURED_RESPONSE_PROMPT } from '../utils/structuredReply/prompt';

export const STRUCTURED_CHAT = true; // feature flag
```

- [ ] **Step 2: Replace the `sendMessage` body to branch on the flag**

Replace the existing `sendMessage` callback (ChatContext.jsx lines 95–182) with:

```jsx
const sendMessage = useCallback(async (text) => {
  const msg = text.trim();
  if (!msg) return;

  const session = getSession();
  const username = session?.username || 'anonymous';
  const contextLabel = pageContextLabelRef.current || null;

  let activeConvoId = conversationId;
  if (!activeConvoId) {
    const convo = await createConversation(
      username,
      msg.slice(0, 80),
      pageContextRef.current?.slice(0, 200)
    );
    if (convo) {
      activeConvoId = convo.id;
      setConversationId(convo.id);
      setConversationHistory(prev => [convo, ...prev]);
    }
  }

  const userMsg = { role: 'user', content: msg, contextLabel };
  const assistantMsg = STRUCTURED_CHAT
    ? { role: 'assistant', format: 'structured', blocks: [], status: [], finalized: false, raw: '' }
    : { role: 'assistant', format: 'markdown', content: '' };

  setMessages(prev => [...prev, userMsg, assistantMsg]);
  setIsStreaming(true);

  if (activeConvoId) {
    saveMessage(activeConvoId, 'user', msg, contextLabel).catch(() => {});
  }

  const controller = new AbortController();
  abortRef.current = controller;

  const history = [...messagesRef.current, userMsg]
    .filter(m => (m.content && m.content.trim()) || m.format === 'structured')
    .map(m => {
      if (m.format === 'structured') {
        return { role: m.role, content: JSON.stringify({ blocks: m.blocks }) };
      }
      return { role: m.role, content: m.content };
    });

  const currentContext = pageContextRef.current;
  const currentLang = langRef.current;
  const langDirective = currentLang === 'de' ? translations.de['ai.directive.de'] : null;
  const systemPrompt = STRUCTURED_CHAT
    ? `${SYSTEM_PROMPT_MINI}\n\n${STRUCTURED_RESPONSE_PROMPT}`
    : SYSTEM_PROMPT_MINI;
  const apiMessages = [
    { role: 'system', content: systemPrompt },
    ...(langDirective ? [{ role: 'system', content: langDirective }] : []),
    ...(currentContext ? [{ role: 'system', content: currentContext }] : []),
    ...history,
  ];

  let fullResponse = '';
  const parser = STRUCTURED_CHAT ? createStreamParser() : null;

  await streamChat(apiMessages, {
    onChunk(chunk) {
      fullResponse += chunk;
      if (STRUCTURED_CHAT) {
        const r = parser.feed(chunk);
        setMessages(prev => {
          const updated = [...prev];
          const last = updated[updated.length - 1];
          updated[updated.length - 1] = {
            ...last,
            blocks: r.blocks,
            status: r.status,
            raw: fullResponse,
          };
          return updated;
        });
      } else {
        setMessages(prev => {
          const updated = [...prev];
          const last = updated[updated.length - 1];
          updated[updated.length - 1] = { ...last, content: last.content + chunk };
          return updated;
        });
      }
    },
    onDone() {
      setIsStreaming(false);
      abortRef.current = null;
      if (STRUCTURED_CHAT) {
        const r = parser.finalize();
        setMessages(prev => {
          const updated = [...prev];
          const last = updated[updated.length - 1];
          if (r.ok) {
            updated[updated.length - 1] = {
              ...last,
              blocks: r.blocks,
              status: r.status,
              finalized: true,
              raw: r.raw,
            };
          } else {
            // Fallback: render raw text as markdown
            updated[updated.length - 1] = {
              role: 'assistant',
              format: 'markdown',
              content: r.raw || fullResponse,
              fallback: true,
            };
          }
          return updated;
        });
      }
      if (activeConvoId && fullResponse) {
        saveMessage(activeConvoId, 'assistant', fullResponse).catch(() => {});
      }
    },
    onError(err) {
      setIsStreaming(false);
      abortRef.current = null;
      if (err.name === 'AbortError') return;
      const errorText = fullResponse || '_Something went wrong. Please try again._';
      setMessages(prev => {
        const updated = [...prev];
        updated[updated.length - 1] = {
          role: 'assistant', format: 'markdown', content: errorText, fallback: true,
        };
        return updated;
      });
      if (activeConvoId && errorText) {
        saveMessage(activeConvoId, 'assistant', errorText).catch(() => {});
      }
    },
    signal: controller.signal,
  });
}, [conversationId]);
```

- [ ] **Step 3: Normalize `loadConversation` for legacy + new messages**

Replace the existing `loadConversation` callback (ChatContext.jsx lines 73–83) with:

```jsx
const loadConversation = useCallback(async (convoId) => {
  const msgs = await getConversationMessages(convoId);
  setConversationId(convoId);
  setMessages(msgs.map(m => {
    // Try to detect structured JSON payload; fall back to markdown.
    if (m.role === 'assistant' && typeof m.content === 'string' && m.content.trim().startsWith('{')) {
      try {
        const parsed = JSON.parse(m.content);
        if (parsed && Array.isArray(parsed.blocks)) {
          return {
            role: 'assistant',
            format: 'structured',
            blocks: parsed.blocks,
            status: parsed.blocks.map(() => 'ready'),
            finalized: true,
            raw: m.content,
            contextLabel: m.context_label,
            dbId: m.id,
          };
        }
      } catch { /* fall through */ }
    }
    return {
      role: m.role,
      format: 'markdown',
      content: m.content,
      contextLabel: m.context_label,
      dbId: m.id,
    };
  }));
  setIsOpen(true);
}, []);
```

- [ ] **Step 4: Export flag in context value (for consumers to show a badge)**

Change the provider value (ChatContext.jsx lines 184–196) to add `structuredMode: STRUCTURED_CHAT`:

```jsx
<ChatContext.Provider value={{
  messages, isOpen, isStreaming, detailedAnalysisHandoff,
  toggleOpen, sendMessage, stopStreaming,
  setDetailedAnalysisHandoff, clearDetailedAnalysisHandoff,
  setIsOpen, newChat, pageContext, setPageContext, setPageContextLabel,
  conversationId, conversationHistory, historyLoaded,
  loadConversation, deleteConversation,
  structuredMode: STRUCTURED_CHAT,
}}>
```

- [ ] **Step 5: Commit**

```bash
git add frontend/src/context/ChatContext.jsx
git commit -m "structured-chat: wire ChatContext streaming through block parser behind flag"
```

---

## Task 12: Render structured assistant messages in AIInsights (with entity click)

**Files:**
- Modify: `frontend/src/pages/AIInsights.jsx`

- [ ] **Step 1: Find the message-rendering block**

Grep `frontend/src/pages/AIInsights.jsx` for the line where assistant message content is passed to `renderMarkdown`. Example shape today:

```jsx
// Before (approximate):
<div className="chat-bubble">{renderMarkdown(message.content)}</div>
```

- [ ] **Step 2: Branch on `message.format`**

Add imports at top of the file:

```jsx
import StructuredReplyRenderer from '../components/chat/StructuredReplyRenderer';
import { useUI } from '../context/UIContext';
```

Inside the component, add the entity-click handler:

```jsx
const { openCustomerDetail, openSKUDetail } = useUI();

const handleEntityClick = ({ entityType, id }) => {
  if (entityType === 'customer') openCustomerDetail(id);
  else if (entityType === 'sku' || entityType === 'product') openSKUDetail(id);
};
```

Replace the single `renderMarkdown(message.content)` call with the branch:

```jsx
{message.role === 'assistant' && message.format === 'structured'
  ? (
    <StructuredReplyRenderer
      blocks={message.blocks || []}
      status={message.status || []}
      finalized={!!message.finalized}
      onEntityClick={handleEntityClick}
    />
  )
  : renderMarkdown(message.content)
}
```

- [ ] **Step 3: Verify `useUI` exposes the right handlers**

Run:

```bash
grep -n "openCustomerDetail\|openSKUDetail" frontend/src/context/UIContext.jsx
```

Expected: both handlers exist. If not, inspect `InsightSlideOver.jsx` (line 22) which destructures them from `useUI()` — they do exist in UIContext. If a handler is missing for a given entityType, it silently no-ops; that's acceptable for this increment.

- [ ] **Step 4: Smoke-test end-to-end**

Run: `npm run dev`
Open the AI Insights page, ask: *"Compare churn risk factors for Customer 101580 vs Customer 104053"*
Expected:
- Streaming shows skeletons, then fills in with a narrative block followed by comparison cards + factor breakdown.
- No ActionPlan appears (since the user didn't ask for actions).
- Clicking a customer chip opens the existing customer slide-over.

If Claude returns unparseable output, you should see the raw text in a markdown fallback with `fallback: true`. That's the expected failure mode; proceed.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/pages/AIInsights.jsx
git commit -m "structured-chat: render structured assistant replies + entity click in AIInsights"
```

---

## Task 13: Canonical regression fixtures + visual QA

**Files:**
- Create: `frontend/src/pages/chatDebugFixtures.js` (extend with canonical set)

- [ ] **Step 1: Add canonical fixtures**

Append to `frontend/src/pages/chatDebugFixtures.js`:

```js
export const CANONICAL = {
  'compare-churn': {
    prompt: 'Compare churn risk factors for Customer 101580 vs Customer 104053',
    reply: FIXTURES.comparison_cards,
  },
  'top-at-risk': {
    prompt: 'Who are my top 10 at-risk customers?',
    reply: FIXTURES.ranked_list,
  },
  'why-margin-dropped': {
    prompt: 'Why did margin drop for SKU 123?',
    reply: { blocks: [
      { type: 'narrative', text: 'SKU 123 margin fell 4.2pp in Q1 driven mostly by input cost.', tone: 'warning' },
      FIXTURES.factor_breakdown.blocks[0],
    ]},
  },
  'single-fact': {
    prompt: "What's customer 101580's LTV?",
    reply: FIXTURES.metric_tile,
  },
  'what-should-i-do': {
    prompt: 'What should I do about at-risk enterprise customers?',
    reply: { blocks: [
      ...FIXTURES.ranked_list.blocks,
      ...FIXTURES.action_plan.blocks,
    ]},
  },
};
```

- [ ] **Step 2: Extend ChatDebug to render the canonical set**

Append below the existing `<section>` in `frontend/src/pages/ChatDebug.jsx`:

```jsx
{/* Add at top: import { CANONICAL } from './chatDebugFixtures'; */}
<section>
  <h2 className="text-sm font-semibold mb-2">Canonical regressions</h2>
  <div className="space-y-6">
    {Object.entries(CANONICAL).map(([key, fx]) => (
      <div key={key}>
        <div className="text-xs font-mono text-slate-500 mb-1">{key}</div>
        <div className="text-sm italic text-slate-700 mb-2">"{fx.prompt}"</div>
        <div className="rounded-xl bg-slate-50 ring-1 ring-slate-200 p-4">
          <StructuredReplyRenderer blocks={fx.reply.blocks} finalized onEntityClick={onEntityClick} />
        </div>
      </div>
    ))}
  </div>
</section>
```

- [ ] **Step 3: Visual QA checklist**

Run: `npm run dev` and open `/chat-debug`. Verify each canonical:

| Case | Must be true |
|---|---|
| compare-churn | 2 cards; entities clickable; **NO** action_plan block appears |
| top-at-risk | ranked list; entities clickable; **NO** action_plan block appears |
| why-margin-dropped | narrative + factor rows that expand on click |
| single-fact | exactly one metric_tile; no narrative trailer |
| what-should-i-do | ranked list + action_plan (action_plan *is* expected here) |

- [ ] **Step 4: Commit**

```bash
git add frontend/src/pages/chatDebugFixtures.js frontend/src/pages/ChatDebug.jsx
git commit -m "structured-chat: add canonical regression fixtures to /chat-debug"
```

---

## Task 14: Lint + final verification + PR-ready commit

- [ ] **Step 1: Lint**

Run: `cd frontend && npm run lint`
Expected: no new errors from any new file. Fix any that appear before proceeding.

- [ ] **Step 2: Full test run**

Run: `cd frontend && npm test`
Expected: schema tests + parser tests + sanity test all pass.

- [ ] **Step 3: Build**

Run: `cd frontend && npm run build`
Expected: clean build, no warnings from new code.

- [ ] **Step 4: Live end-to-end smoke**

Run: `npm run dev`, open AI Insights, ask each canonical question verbatim. Confirm:
- Streaming feels responsive (skeletons appear fast, blocks fill in).
- No `action_plan` on non-action questions.
- Entity chips open the customer/SKU slide-over.
- Reloading a past conversation restores structured rendering (Task 11 Step 3 path).

If Claude occasionally returns prose instead of JSON, the fallback rendering appears with a small tag — document one occurrence, don't tune the prompt yet.

- [ ] **Step 5: Final verification commit (if any lint fixes)**

```bash
git add -A
git commit -m "structured-chat: lint + final verification" --allow-empty
```

---

## Self-review notes

**Spec coverage check:**
- Architecture modules (schema.js, streamParser.js, prompt.js, 11 block components, StructuredReplyRenderer) → Tasks 2, 3, 4, 5, 6, 7, 8, 9.
- Feature flag `STRUCTURED_CHAT` → Task 11 Step 1.
- Legacy markdown fallback → Task 11 Step 3 + Task 12 Step 2 branch.
- Entity click → `useUI().openCustomerDetail / openSKUDetail` → Task 12 Step 2.
- Inline expansion on FactorBreakdown → Task 8 Step 1.
- Progressive streaming w/ skeleton → Tasks 3, 5, 9, 11.
- Error handling (malformed JSON, single bad block, network cut) → Task 9 (`BlockError`), Task 11 (finalize ok=false fallback, onError).
- `/chat-debug` route with fixtures + replay → Task 10.
- Five canonical regressions → Task 13.
- Persistence discriminator → chose content-inference over a DB column change (Task 11 Step 3). This is a deliberate simplification noted here rather than a schema migration; legacy rows continue to look like markdown strings, new rows look like JSON strings.

**Open questions from the spec, resolved in the plan:**
- Chart library: **recharts** (already in `package.json`).
- Partial-JSON library: **`partial-json`** (small, permissive, well-maintained).

**Explicit non-goals still honored:**
- `markdownRenderer.jsx` is not rewritten; it's imported by `FactorBreakdown` for `detail` fields.
- No new SlideOver component.
- No admin UI.
- No multi-turn / tool-use changes.

**Type consistency check:** block `type` strings are used identically across schema, prompt, fixtures, dispatcher, and skeleton map. Entity click signature `{entityType, id}` is consistent between EntityChip, ComparisonCards, RankedList, StructuredReplyRenderer, and AIInsights handler.
