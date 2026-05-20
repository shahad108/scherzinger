# Report Export (Phase 1) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship downloadable PDF / XLSX / DOCX reports from the AI chat, triggered only when the user explicitly asks, with PRYZM branding, cover page, TOC, headings, margins, and page numbers.

**Architecture:** Add a new `report_download` structured-chat block that the AI appends at the end of a reply when it detects report intent. Clicking it runs a client-side generator (`utils/reportExport/{pdf,xlsx,docx}.js`, each dynamic-imported) over either the reply's sibling blocks (`scope: "reply"`) or the whole conversation (`scope: "conversation"`) and triggers a browser download.

**Tech Stack:** React 19, Vite 7, Tailwind 4, `pdfmake` (PDF), `xlsx` / SheetJS CE (XLSX), `docx` (DOCX), `html-to-image` (recharts → PNG for DOCX embedding), vitest.

**Testing strategy:** TDD for pure logic (schema validator extension, `shared.js` mappers, dispatcher Blob types). Generators are validated by (a) a minimal unit test asserting non-zero Blob with correct MIME, (b) manual visual QA on the new `/chat-debug` fixture — unit tests can't meaningfully assert PDF/XLSX/DOCX *quality*, only that bytes came out.

**Reference files (read before starting):**
- `docs/superpowers/specs/2026-04-17-report-export-design.md` — the spec this plan implements
- `docs/superpowers/specs/2026-04-17-structured-chat-replies-design.md` — the structured-chat system this extends
- `frontend/src/utils/structuredReply/schema.js` — where the new block type registers
- `frontend/src/utils/structuredReply/prompt.js` — where the report-intent prompt goes
- `frontend/src/components/chat/StructuredReplyRenderer.jsx` — the dispatcher to extend
- `frontend/src/pages/AIInsights.jsx` and `frontend/src/components/GlobalChatBar.jsx` — pass `conversationBlocks` down
- `frontend/src/pages/ChatDebug.jsx` + `chatDebugFixtures.js` — add fixture

**All work stays on branch `demo-phase45`.** Deploy target after all tasks complete: Avanna EC2 demo (`~/pryzm/frontend/dist-demo/`) via `rsync` — see final task.

---

## Task 1: Install runtime deps

**Files:**
- Modify: `frontend/package.json`
- Modify: `frontend/package-lock.json`

- [ ] **Step 1: Install**

From `/Users/dharmendersingh/Documents/Scherzinger_new/frontend`:

```bash
npm install pdfmake xlsx docx html-to-image
```

Expected: adds four packages; no peer-dep warnings that block.

- [ ] **Step 2: Verify**

```bash
npm test
```

Expected: 27 tests pass (no behavior change from deps alone).

- [ ] **Step 3: Commit**

```bash
git add frontend/package.json frontend/package-lock.json
git commit -m "report-export: install pdfmake + xlsx + docx + html-to-image"
```

---

## Task 2: Extend schema to validate `report_download` (TDD)

**Files:**
- Modify: `frontend/src/utils/structuredReply/schema.js`
- Modify: `frontend/src/utils/structuredReply/__tests__/schema.test.js`

- [ ] **Step 1: Add failing tests**

Append to `frontend/src/utils/structuredReply/__tests__/schema.test.js`, inside the existing `describe('validateBlock', ...)` block:

```js
  it('accepts a minimal report_download', () => {
    const spec = {
      type: 'report_download',
      title: 'Customer 101580 — Weekly Health Report',
      scope: 'reply',
      defaultFormat: 'pdf',
    };
    expect(validateBlock(spec).ok).toBe(true);
  });

  it('rejects report_download without title', () => {
    expect(validateBlock({ type: 'report_download', scope: 'reply', defaultFormat: 'pdf' }).ok).toBe(false);
  });

  it('rejects report_download with invalid scope', () => {
    expect(validateBlock({
      type: 'report_download', title: 'x', scope: 'history', defaultFormat: 'pdf',
    }).ok).toBe(false);
  });

  it('rejects report_download with invalid defaultFormat', () => {
    expect(validateBlock({
      type: 'report_download', title: 'x', scope: 'reply', defaultFormat: 'txt',
    }).ok).toBe(false);
  });

  it('accepts report_download with sections', () => {
    const spec = {
      type: 'report_download',
      title: 'x',
      scope: 'reply',
      defaultFormat: 'pdf',
      sections: [{ label: 'Risks', blockIndex: 0 }, { label: 'Actions', blockIndex: 2 }],
    };
    expect(validateBlock(spec).ok).toBe(true);
  });

  it('rejects report_download with non-integer blockIndex', () => {
    const spec = {
      type: 'report_download',
      title: 'x',
      scope: 'reply',
      defaultFormat: 'pdf',
      sections: [{ label: 'Risks', blockIndex: 'zero' }],
    };
    expect(validateBlock(spec).ok).toBe(false);
  });

  it('includes report_download in BLOCK_TYPES', () => {
    expect(BLOCK_TYPES).toContain('report_download');
  });
```

- [ ] **Step 2: Run — should fail**

```bash
npm test
```

Expected: the 7 new tests fail (unknown type / validator missing).

- [ ] **Step 3: Extend schema.js**

In `frontend/src/utils/structuredReply/schema.js`:

1. Add `'report_download'` to the end of the `BLOCK_TYPES` array.
2. Add this constant near the other top-level enum arrays:

```js
const REPORT_FORMATS = ['pdf', 'xlsx', 'docx'];
const REPORT_SCOPES = ['reply', 'conversation'];
```

3. Add this validator function alongside the others (above the `VALIDATORS` constant):

```js
function validateReportDownload(b) {
  if (!isStr(b.title)) return fail('report_download: title required');
  if (!REPORT_SCOPES.includes(b.scope)) return fail('report_download: bad scope');
  if (!REPORT_FORMATS.includes(b.defaultFormat)) return fail('report_download: bad defaultFormat');
  if (b.sections !== undefined) {
    if (!Array.isArray(b.sections)) return fail('report_download: sections must be array');
    for (const s of b.sections) {
      if (!isStr(s.label)) return fail('report_download: section.label required');
      if (!Number.isInteger(s.blockIndex) || s.blockIndex < 0) {
        return fail('report_download: section.blockIndex must be non-negative integer');
      }
    }
  }
  return pass();
}
```

4. Add to the `VALIDATORS` map: `report_download: validateReportDownload,`.

- [ ] **Step 4: Run — should pass**

```bash
npm test
```

Expected: all tests pass (17 existing schema + 7 new = 24 schema tests, plus parser + sanity).

- [ ] **Step 5: Commit**

```bash
git add frontend/src/utils/structuredReply/schema.js frontend/src/utils/structuredReply/__tests__/schema.test.js
git commit -m "report-export: validate report_download block"
```

---

## Task 3: Extend prompt with report-intent rules + few-shots

**Files:**
- Modify: `frontend/src/utils/structuredReply/prompt.js`

- [ ] **Step 1: Append report-request section + examples**

In `frontend/src/utils/structuredReply/prompt.js`, find the backtick template literal `STRUCTURED_RESPONSE_PROMPT = \`...\`.trim();`. Before the final trailing backtick (and before `.trim()`), insert this block of text (keeping the outer backtick-template structure intact):

```
### Report requests

When the user explicitly asks for a report, file, PDF, Excel, Word doc, or other downloadable output, append a \`report_download\` block at the very END of your normal blocks sequence. Trigger phrases include: "make a report", "generate a PDF", "excel file", "export", "download", "weekly report of…", "report for my sales team", "word doc of…".

Rules:

1. Before the \`report_download\` block, produce the full report content as normal structured blocks (narrative, metric_grid, factor_breakdown, chart, data_table, etc.). The file mirrors what the user sees on-screen.
2. Set \`scope: "conversation"\` when the user asks to export what you've already discussed ("report of this conversation", "summarize our chat"). Set \`scope: "reply"\` when generating a fresh report ("weekly report of customer X", "make an excel file of at-risk customers").
3. Set \`defaultFormat\` based on explicit user intent first (they said "excel" → xlsx; "word doc" → docx; "pdf" → pdf). If unspecified, pick by content shape: xlsx when the reply is dominated by tables/ranked lists, docx for formal narrative reports, pdf otherwise (safe default).
4. \`title\` must be concrete and include the subject ("Customer 101580 — Churn Risk Report"), not generic ("Report").
5. Include optional \`sections\` when there are more than 3 non-trivial blocks — this powers the document's table of contents. \`blockIndex\` indexes into the sibling blocks array, counting from 0 for the first block of this reply (the \`report_download\` block itself is NOT indexable).
6. Do NOT emit \`report_download\` when the user did NOT explicitly ask for one. A question like "what's customer 101580's LTV?" must never return a report_download block.

Example — Weekly customer report:
User: "Make a weekly report of customer 101580"
Assistant:
{"blocks":[
  {"type":"narrative","text":"Customer 101580 is a high-value enterprise account at elevated churn risk, driven primarily by low transaction frequency.","tone":"insight"},
  {"type":"metric_grid","tiles":[
    {"label":"LTV","value":"€726,128"},
    {"label":"Active Revenue","value":"€726,128"},
    {"label":"DB2 Margin","value":"67.8%"},
    {"label":"Win Rate","value":"78%"}
  ]},
  {"type":"factor_breakdown","factors":[
    {"label":"Order recency","weight":0.218,"status":"critical","detail":"Only 13 invoices in the full period — the dominant churn signal."},
    {"label":"Quote win rate","weight":0.112,"status":"strong","value":"78%"}
  ]},
  {"type":"action_plan","actions":[
    {"title":"Schedule QBR with account lead","priority":"high","timeline":"30 days","impact":"€150K–300K"}
  ]},
  {"type":"report_download","title":"Customer 101580 — Weekly Health Report","subtitle":"Week of 14 Apr 2026","scope":"reply","defaultFormat":"pdf","sections":[
    {"label":"Summary metrics","blockIndex":1},
    {"label":"Risk factors","blockIndex":2},
    {"label":"Recommended actions","blockIndex":3}
  ]}
]}

Example — Excel export of a ranked list:
User: "Make an excel file of the top 20 at-risk customers"
Assistant:
{"blocks":[
  {"type":"ranked_list","items":[
    {"id":"101580","label":"Customer 101580","entityType":"customer","primary":{"label":"LTV","value":726128,"format":"currency"},"badge":{"text":"0.62","tone":"critical"}},
    {"id":"104053","label":"Customer 104053","entityType":"customer","primary":{"label":"LTV","value":675612,"format":"currency"},"badge":{"text":"0.62","tone":"critical"}}
  ]},
  {"type":"report_download","title":"Top 20 At-Risk Customers","scope":"reply","defaultFormat":"xlsx"}
]}
```

- [ ] **Step 2: Sanity-check tests still pass**

```bash
npm test
```

Expected: no regressions (27+7=34 tests).

- [ ] **Step 3: Commit**

```bash
git add frontend/src/utils/structuredReply/prompt.js
git commit -m "report-export: extend prompt with report-intent rules + 2 few-shots"
```

---

## Task 4: `shared.js` — constants, flatten, block mappers (TDD)

**Files:**
- Create: `frontend/src/utils/reportExport/shared.js`
- Create: `frontend/src/utils/reportExport/__tests__/shared.test.js`

- [ ] **Step 1: Write failing tests**

Create `frontend/src/utils/reportExport/__tests__/shared.test.js`:

```js
import { describe, it, expect } from 'vitest';
import {
  BRAND, MARGINS_PT, FONTS,
  resolveDefaultFormat,
  flattenConversation,
  blockSectionLabel,
} from '../shared';

describe('BRAND + MARGINS_PT + FONTS', () => {
  it('exposes brand constants', () => {
    expect(BRAND.name).toBe('PRYZM');
    expect(BRAND.footerText).toMatch(/PRYZM/);
    expect(MARGINS_PT).toEqual({ top: 54, right: 54, bottom: 64, left: 54 });
    expect(FONTS.heading).toBeTruthy();
    expect(FONTS.body).toBeTruthy();
  });
});

describe('resolveDefaultFormat', () => {
  it('honors explicit hint "excel"', () => {
    expect(resolveDefaultFormat({ blocks: [] }, 'Make an excel file of stuff')).toBe('xlsx');
  });
  it('honors explicit hint "word"', () => {
    expect(resolveDefaultFormat({ blocks: [] }, 'Export as a word doc')).toBe('docx');
  });
  it('honors explicit hint "pdf"', () => {
    expect(resolveDefaultFormat({ blocks: [] }, 'PDF please')).toBe('pdf');
  });
  it('infers xlsx when blocks are table-heavy', () => {
    const blocks = [
      { type: 'data_table' }, { type: 'ranked_list' }, { type: 'narrative' },
    ];
    expect(resolveDefaultFormat({ blocks }, 'make a report')).toBe('xlsx');
  });
  it('defaults to pdf otherwise', () => {
    const blocks = [{ type: 'narrative' }, { type: 'metric_grid' }];
    expect(resolveDefaultFormat({ blocks }, 'report')).toBe('pdf');
  });
});

describe('flattenConversation', () => {
  it('inlines user questions as synthetic narrative blocks', () => {
    const messages = [
      { role: 'user', content: 'hello?' },
      { role: 'assistant', format: 'structured', blocks: [
        { type: 'narrative', text: 'world' },
      ]},
      { role: 'user', content: 'another?' },
      { role: 'assistant', format: 'structured', blocks: [
        { type: 'callout', tone: 'insight', text: 'ok' },
      ]},
    ];
    const flat = flattenConversation(messages);
    expect(flat.length).toBe(4);
    expect(flat[0]).toMatchObject({ type: 'narrative', tone: 'neutral' });
    expect(flat[0].text).toMatch(/hello\?/);
    expect(flat[1]).toMatchObject({ type: 'narrative', text: 'world' });
    expect(flat[2]).toMatchObject({ type: 'narrative', tone: 'neutral' });
    expect(flat[3]).toMatchObject({ type: 'callout' });
  });

  it('skips empty + non-structured messages gracefully', () => {
    const flat = flattenConversation([
      { role: 'user', content: '' },
      { role: 'assistant', format: 'markdown', content: 'legacy' },
    ]);
    expect(flat).toEqual([]);
  });

  it('strips report_download blocks from output', () => {
    const messages = [
      { role: 'user', content: 'make a report' },
      { role: 'assistant', format: 'structured', blocks: [
        { type: 'narrative', text: 'report' },
        { type: 'report_download', title: 'x', scope: 'reply', defaultFormat: 'pdf' },
      ]},
    ];
    const flat = flattenConversation(messages);
    expect(flat.some(b => b.type === 'report_download')).toBe(false);
  });
});

describe('blockSectionLabel', () => {
  it('returns a human-readable label for each block type', () => {
    expect(blockSectionLabel({ type: 'narrative' })).toBe('Narrative');
    expect(blockSectionLabel({ type: 'metric_grid' })).toBe('Key metrics');
    expect(blockSectionLabel({ type: 'comparison_cards' })).toBe('Comparison');
    expect(blockSectionLabel({ type: 'ranked_list' })).toBe('Ranked list');
    expect(blockSectionLabel({ type: 'factor_breakdown' })).toBe('Factor breakdown');
    expect(blockSectionLabel({ type: 'chart' })).toBe('Chart');
    expect(blockSectionLabel({ type: 'callout' })).toBe('Note');
    expect(blockSectionLabel({ type: 'action_plan' })).toBe('Recommended actions');
    expect(blockSectionLabel({ type: 'data_table' })).toBe('Data');
  });
});
```

- [ ] **Step 2: Run — should fail**

```bash
npm test
```

Expected: failure (module not found).

- [ ] **Step 3: Implement `shared.js`**

Create `frontend/src/utils/reportExport/shared.js`:

```js
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
```

- [ ] **Step 4: Run — should pass**

```bash
npm test
```

Expected: all tests pass.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/utils/reportExport/shared.js frontend/src/utils/reportExport/__tests__/shared.test.js
git commit -m "report-export: add shared constants + flattenConversation + format resolver"
```

---

## Task 5: Dispatcher `index.js` (TDD via mocks)

**Files:**
- Create: `frontend/src/utils/reportExport/index.js`
- Create: `frontend/src/utils/reportExport/__tests__/dispatcher.test.js`

Note: The dispatcher imports `pdf.js`, `xlsx.js`, `docx.js` dynamically. For the TDD test we stub those modules via `vi.mock` so we can verify routing without generating real blobs.

- [ ] **Step 1: Write failing tests**

Create `frontend/src/utils/reportExport/__tests__/dispatcher.test.js`:

```js
import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../pdf', () => ({
  generatePdf: vi.fn(async () => new Blob(['%PDF-1.4'], { type: 'application/pdf' })),
}));
vi.mock('../xlsx', () => ({
  generateXlsx: vi.fn(async () => new Blob(['xlsx'], {
    type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  })),
}));
vi.mock('../docx', () => ({
  generateDocx: vi.fn(async () => new Blob(['docx'], {
    type: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  })),
}));

import { generateReport } from '../index';
import { generatePdf } from '../pdf';
import { generateXlsx } from '../xlsx';
import { generateDocx } from '../docx';

const baseSpec = { title: 't', scope: 'reply', defaultFormat: 'pdf' };
const blocks = [{ type: 'narrative', text: 'hello' }];

describe('generateReport', () => {
  beforeEach(() => {
    generatePdf.mockClear(); generateXlsx.mockClear(); generateDocx.mockClear();
  });

  it('routes pdf to generatePdf', async () => {
    const blob = await generateReport('pdf', baseSpec, blocks);
    expect(blob.type).toBe('application/pdf');
    expect(generatePdf).toHaveBeenCalledTimes(1);
  });

  it('routes xlsx to generateXlsx', async () => {
    const blob = await generateReport('xlsx', baseSpec, blocks);
    expect(blob.type).toBe('application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    expect(generateXlsx).toHaveBeenCalledTimes(1);
  });

  it('routes docx to generateDocx', async () => {
    const blob = await generateReport('docx', baseSpec, blocks);
    expect(blob.type).toBe('application/vnd.openxmlformats-officedocument.wordprocessingml.document');
    expect(generateDocx).toHaveBeenCalledTimes(1);
  });

  it('throws on unknown format', async () => {
    await expect(generateReport('rtf', baseSpec, blocks)).rejects.toThrow(/unknown/i);
  });

  it('passes sourceBlocks through untouched', async () => {
    await generateReport('pdf', baseSpec, blocks);
    expect(generatePdf).toHaveBeenCalledWith(baseSpec, blocks);
  });
});
```

- [ ] **Step 2: Run — should fail (module missing)**

```bash
npm test
```

Expected: failure.

- [ ] **Step 3: Implement dispatcher**

Create `frontend/src/utils/reportExport/index.js`:

```js
/**
 * Dispatches to the right format-specific generator. Each generator is imported
 * statically here but the generators themselves dynamic-import their heavy
 * third-party libs (pdfmake / xlsx / docx) so the initial chat bundle stays light.
 */
import { generatePdf } from './pdf';
import { generateXlsx } from './xlsx';
import { generateDocx } from './docx';

export async function generateReport(format, spec, sourceBlocks) {
  switch (format) {
    case 'pdf':  return generatePdf(spec, sourceBlocks);
    case 'xlsx': return generateXlsx(spec, sourceBlocks);
    case 'docx': return generateDocx(spec, sourceBlocks);
    default: throw new Error(`unknown format: ${format}`);
  }
}

export function downloadBlob(blob, filename) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 60_000);
}

export function filenameFor(spec, format) {
  const safe = (spec.title || 'report').replace(/[^\w\s\-]+/g, '').trim().replace(/\s+/g, '_').slice(0, 80);
  return `${safe}.${format}`;
}
```

Tests will fail to import if `pdf.js`, `xlsx.js`, `docx.js` don't exist — but `vi.mock` intercepts before resolution, so they pass. Create empty stubs so production imports don't break:

Create `frontend/src/utils/reportExport/pdf.js`:

```js
export async function generatePdf() {
  throw new Error('generatePdf not implemented');
}
```

Create `frontend/src/utils/reportExport/xlsx.js`:

```js
export async function generateXlsx() {
  throw new Error('generateXlsx not implemented');
}
```

Create `frontend/src/utils/reportExport/docx.js`:

```js
export async function generateDocx() {
  throw new Error('generateDocx not implemented');
}
```

These are replaced fully in Tasks 6–8.

- [ ] **Step 4: Run — should pass**

```bash
npm test
```

Expected: dispatcher tests pass.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/utils/reportExport/index.js frontend/src/utils/reportExport/pdf.js frontend/src/utils/reportExport/xlsx.js frontend/src/utils/reportExport/docx.js frontend/src/utils/reportExport/__tests__/dispatcher.test.js
git commit -m "report-export: add format dispatcher + downloadBlob helper"
```

---

## Task 6: PDF generator (`pdf.js`)

**Files:**
- Modify: `frontend/src/utils/reportExport/pdf.js`

No new unit tests for the PDF contents themselves — we rely on (a) the dispatcher test from Task 5 still passing (Blob type correct), and (b) manual QA in Task 11. A meaningful test of PDF visual quality isn't cheap enough for Phase 1.

- [ ] **Step 1: Implement pdf.js**

Replace `frontend/src/utils/reportExport/pdf.js` with:

```js
import { BRAND, MARGINS_PT, blockSectionLabel } from './shared';

let pdfMakePromise = null;
async function loadPdfMake() {
  if (!pdfMakePromise) {
    pdfMakePromise = (async () => {
      const pdfMake = (await import('pdfmake/build/pdfmake')).default;
      const pdfFonts = await import('pdfmake/build/vfs_fonts');
      pdfMake.vfs = pdfFonts.pdfMake?.vfs || pdfFonts.default?.pdfMake?.vfs || pdfFonts.vfs;
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
      // Minimal vector rendering: bar-like representation from series[0].data for line/bar; for donut, table-only.
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
        columns: [
          { canvas: [{ type: 'line', x1: 0, y1: 0, x2: 515, y2: 0, lineWidth: 0.5, lineColor: BRAND.ruleColor }], width: '*' },
        ],
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

  return new Promise((resolve) => {
    pdfMake.createPdf(doc).getBlob(blob => resolve(blob));
  });
}
```

- [ ] **Step 2: Verify dispatcher test still passes**

```bash
npm test
```

Expected: all tests pass. (The dispatcher test mocks `./pdf`, so this code isn't exercised there.)

- [ ] **Step 3: Build to check for dep/import issues**

```bash
npm run build
```

Expected: clean build; bundle grows by ~300 KB gz (pdfmake dynamically imported).

- [ ] **Step 4: Commit**

```bash
git add frontend/src/utils/reportExport/pdf.js
git commit -m "report-export: implement PDF generator with cover + TOC + footer page numbers"
```

---

## Task 7: XLSX generator (`xlsx.js`)

**Files:**
- Modify: `frontend/src/utils/reportExport/xlsx.js`

- [ ] **Step 1: Implement xlsx.js**

Replace `frontend/src/utils/reportExport/xlsx.js` with:

```js
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

  // Cover sheet
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
```

- [ ] **Step 2: Verify build + tests**

```bash
npm test && npm run build
```

Expected: 34+ tests pass; build clean.

- [ ] **Step 3: Commit**

```bash
git add frontend/src/utils/reportExport/xlsx.js
git commit -m "report-export: implement XLSX generator with per-block sheets + printed footer"
```

---

## Task 8: DOCX generator (`docx.js`)

**Files:**
- Modify: `frontend/src/utils/reportExport/docx.js`

- [ ] **Step 1: Implement docx.js**

Replace `frontend/src/utils/reportExport/docx.js` with:

```js
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

  const bodyChildren = [];
  const sectionByIdx = new Map((spec.sections || []).map(s => [s.blockIndex, s.label]));
  sourceBlocks.forEach((block, i) => {
    const heading = sectionByIdx.get(i) || blockSectionLabel(block);
    bodyChildren.push(new Paragraph({ heading: sectionByIdx.has(i) ? HeadingLevel.HEADING_1 : HeadingLevel.HEADING_2, children: [new TextRun({ text: heading })] }));
    bodyChildren.push(...blockToDocxChildren(block, { Paragraph, TextRun, Table, TableRow, TableCell, WidthType, BorderStyle }));
  });

  const borderSide = { style: BorderStyle.SINGLE, size: 1, color: 'e2e8f0' };

  const doc = new Document({
    sections: [
      { // Cover (no header/footer)
        properties: {
          page: { margin: { top: pt2twip(MARGINS_PT.top), right: pt2twip(MARGINS_PT.right), bottom: pt2twip(MARGINS_PT.bottom), left: pt2twip(MARGINS_PT.left) } },
          titlePage: false,
        },
        children: coverChildren,
      },
      { // Body
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
  // docx lib may return a Blob with no MIME; stamp it so dispatcher test assertions hold.
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
```

Note: This implementation omits chart-as-PNG embedding — it emits the chart's underlying `series` as a data table. This is the spec's explicit fallback when `html-to-image` capture isn't available (and it's simpler, more reliable). If charts-as-images become a must, add `html-to-image` capture in a later phase.

- [ ] **Step 2: Verify tests + build**

```bash
npm test && npm run build
```

Expected: pass; bundle grows ~90 KB gz (docx dynamically imported).

- [ ] **Step 3: Commit**

```bash
git add frontend/src/utils/reportExport/docx.js
git commit -m "report-export: implement DOCX generator with heading styles + page-number footer"
```

---

## Task 9: `ReportDownload` component

**Files:**
- Create: `frontend/src/components/chat/blocks/ReportDownload.jsx`

- [ ] **Step 1: Implement component**

Create `frontend/src/components/chat/blocks/ReportDownload.jsx`:

```jsx
import { useState, useMemo } from 'react';
import { Download, ChevronDown, FileText, FileSpreadsheet, FileType, Loader, ExternalLink } from 'lucide-react';
import { generateReport, downloadBlob, filenameFor } from '../../../utils/reportExport';
import { flattenConversation } from '../../../utils/reportExport/shared';

const FORMAT_META = {
  pdf:  { label: 'PDF',  icon: FileText },
  xlsx: { label: 'Excel', icon: FileSpreadsheet },
  docx: { label: 'Word', icon: FileType },
};

export default function ReportDownload({ spec, messageBlocks = [], conversationMessages = [] }) {
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [previewUrl, setPreviewUrl] = useState(null);
  const [error, setError] = useState(null);

  const sourceBlocks = useMemo(() => {
    if (spec.scope === 'conversation') return flattenConversation(conversationMessages);
    return messageBlocks.filter(b => b?.type !== 'report_download');
  }, [spec.scope, messageBlocks, conversationMessages]);

  const doDownload = async (format) => {
    setBusy(true); setError(null); setOpen(false);
    try {
      const blob = await generateReport(format, spec, sourceBlocks);
      downloadBlob(blob, filenameFor(spec, format));
    } catch (e) {
      setError(e.message || 'Report generation failed.');
    } finally {
      setBusy(false);
    }
  };

  const doPreview = async () => {
    setBusy(true); setError(null);
    try {
      const blob = await generateReport('pdf', spec, sourceBlocks);
      if (previewUrl) URL.revokeObjectURL(previewUrl);
      setPreviewUrl(URL.createObjectURL(blob));
    } catch (e) {
      setError(e.message || 'Preview failed.');
    } finally {
      setBusy(false);
    }
  };

  const PrimaryIcon = FORMAT_META[spec.defaultFormat]?.icon || FileText;
  const altFormats = ['pdf', 'xlsx', 'docx'].filter(f => f !== spec.defaultFormat);

  return (
    <div className="my-3 rounded-xl ring-1 ring-slate-200 bg-white p-4">
      <div className="flex items-start gap-3">
        <div className="w-9 h-9 rounded-lg bg-blue-50 flex items-center justify-center flex-shrink-0">
          <PrimaryIcon className="w-5 h-5 text-blue-700" />
        </div>
        <div className="flex-1 min-w-0">
          <div className="text-sm font-semibold text-slate-900 truncate">{spec.title}</div>
          {spec.subtitle && <div className="text-xs text-slate-500 truncate">{spec.subtitle}</div>}
          {spec.audience && <div className="text-xs text-slate-400">Audience: {spec.audience}</div>}
          {error && <div className="mt-2 text-xs text-red-600">{error}</div>}
        </div>
        <div className="relative flex items-center gap-2">
          <button
            type="button"
            disabled={busy}
            onClick={() => doDownload(spec.defaultFormat)}
            className="inline-flex items-center gap-1.5 text-xs font-medium px-3 py-1.5 rounded-lg bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-50"
          >
            {busy ? <Loader className="w-3.5 h-3.5 animate-spin" /> : <Download className="w-3.5 h-3.5" />}
            Download {FORMAT_META[spec.defaultFormat]?.label}
          </button>
          <button
            type="button"
            disabled={busy}
            onClick={() => setOpen(o => !o)}
            className="inline-flex items-center text-xs px-1.5 py-1.5 rounded-lg ring-1 ring-slate-200 text-slate-600 hover:bg-slate-50 disabled:opacity-50"
            aria-label="More formats"
          >
            <ChevronDown className="w-3.5 h-3.5" />
          </button>
          {spec.defaultFormat === 'pdf' && (
            <button
              type="button"
              disabled={busy}
              onClick={doPreview}
              className="inline-flex items-center gap-1 text-xs text-slate-500 hover:text-slate-700 px-1"
              aria-label="Preview PDF"
            >
              <ExternalLink className="w-3.5 h-3.5" /> preview
            </button>
          )}
          {open && (
            <div className="absolute right-0 top-full mt-1 bg-white ring-1 ring-slate-200 rounded-lg shadow-md overflow-hidden z-10">
              {altFormats.map(f => {
                const Icon = FORMAT_META[f].icon;
                return (
                  <button
                    key={f}
                    type="button"
                    onClick={() => doDownload(f)}
                    className="flex items-center gap-2 w-full px-3 py-2 text-xs text-slate-700 hover:bg-slate-50"
                  >
                    <Icon className="w-3.5 h-3.5" /> Download {FORMAT_META[f].label}
                  </button>
                );
              })}
            </div>
          )}
        </div>
      </div>
      {previewUrl && (
        <div className="mt-3 fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4" onClick={() => { URL.revokeObjectURL(previewUrl); setPreviewUrl(null); }}>
          <div className="bg-white rounded-xl w-full max-w-4xl h-[85vh] flex flex-col overflow-hidden" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between px-4 py-2 border-b border-slate-200">
              <div className="text-sm font-semibold text-slate-900">{spec.title} — preview</div>
              <button onClick={() => { URL.revokeObjectURL(previewUrl); setPreviewUrl(null); }} className="text-xs text-slate-500 hover:text-slate-700">Close</button>
            </div>
            <iframe src={previewUrl} title="PDF preview" className="flex-1 w-full" />
          </div>
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 2: Tests + build**

```bash
npm test && npm run build
```

Expected: pass.

- [ ] **Step 3: Commit**

```bash
git add frontend/src/components/chat/blocks/ReportDownload.jsx
git commit -m "report-export: add ReportDownload block with primary+caret+preview UI"
```

---

## Task 10: Register `report_download` in the dispatcher + pass sibling collections

**Files:**
- Modify: `frontend/src/components/chat/StructuredReplyRenderer.jsx`

- [ ] **Step 1: Add ReportDownload to the dispatcher map + thread sibling props**

Replace the entire contents of `frontend/src/components/chat/StructuredReplyRenderer.jsx` with:

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
import ReportDownload from './blocks/ReportDownload';

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
  report_download: ReportDownload,
};

function BlockError({ reason }) {
  return (
    <div className="my-2 text-xs text-red-700 bg-red-50 ring-1 ring-red-200 rounded px-3 py-2">
      Couldn't render this block: {reason}
    </div>
  );
}

export default function StructuredReplyRenderer({ blocks = [], status = [], onEntityClick, finalized = false, conversationMessages = [] }) {
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
        if (spec.type === 'report_download') {
          return <Cmp key={i} spec={spec} messageBlocks={blocks} conversationMessages={conversationMessages} />;
        }
        return <Cmp key={i} spec={spec} onEntityClick={onEntityClick} />;
      })}
    </div>
  );
}
```

- [ ] **Step 2: Verify**

```bash
npm test && npm run build
```

Expected: pass.

- [ ] **Step 3: Commit**

```bash
git add frontend/src/components/chat/StructuredReplyRenderer.jsx
git commit -m "report-export: register report_download + thread sibling collections"
```

---

## Task 11: Pass `conversationMessages` from `AIInsights.jsx` and `GlobalChatBar.jsx`

**Files:**
- Modify: `frontend/src/pages/AIInsights.jsx`
- Modify: `frontend/src/components/GlobalChatBar.jsx`

- [ ] **Step 1: AIInsights.jsx**

Open `frontend/src/pages/AIInsights.jsx`. Find the `<StructuredReplyRenderer ... />` usage (added in Task 12 of the structured-chat plan). It currently reads:

```jsx
<StructuredReplyRenderer
  blocks={msg.blocks || []}
  status={msg.status || []}
  finalized={!!msg.finalized}
  onEntityClick={handleEntityClick}
/>
```

Add a new prop `conversationMessages={activeConv?.messages || []}`:

```jsx
<StructuredReplyRenderer
  blocks={msg.blocks || []}
  status={msg.status || []}
  finalized={!!msg.finalized}
  onEntityClick={handleEntityClick}
  conversationMessages={activeConv?.messages || []}
/>
```

- [ ] **Step 2: GlobalChatBar.jsx**

Open `frontend/src/components/GlobalChatBar.jsx`. Find the `<StructuredReplyRenderer ... />` usage. Add:

```jsx
<StructuredReplyRenderer
  blocks={msg.blocks || []}
  status={msg.status || []}
  finalized={!!msg.finalized}
  onEntityClick={handleEntityClick}
  conversationMessages={messages}
/>
```

The variable `messages` is already destructured from `useChat()`.

- [ ] **Step 3: Verify**

```bash
npm test && npm run build
```

Expected: pass.

- [ ] **Step 4: Commit**

```bash
git add frontend/src/pages/AIInsights.jsx frontend/src/components/GlobalChatBar.jsx
git commit -m "report-export: pass conversationMessages to StructuredReplyRenderer"
```

---

## Task 12: `/chat-debug` fixture + visual QA

**Files:**
- Modify: `frontend/src/pages/chatDebugFixtures.js`

- [ ] **Step 1: Add report_download fixture**

Edit `frontend/src/pages/chatDebugFixtures.js`. Inside the `FIXTURES` object, add a new entry (before the closing `};`):

```js
  report_download: { blocks: [
    { type: 'narrative', text: 'Customer 101580 is a high-value enterprise account at elevated churn risk, driven by low transaction frequency.', tone: 'insight' },
    { type: 'metric_grid', tiles: [
      { label: 'LTV', value: '€726,128' },
      { label: 'Active Revenue', value: '€726,128' },
      { label: 'DB2 Margin', value: '67.8%' },
      { label: 'Win Rate', value: '78%' },
    ]},
    { type: 'factor_breakdown', factors: [
      { label: 'Order recency', weight: 0.218, status: 'critical', detail: 'Only 13 invoices in the full period — extremely low touchpoint frequency for a €726K customer.' },
      { label: 'Margin trend', weight: 0.175, status: 'stable' },
      { label: 'Quote win rate', weight: 0.112, status: 'strong', value: '78%' },
    ]},
    { type: 'action_plan', actions: [
      { title: 'Schedule QBR with account lead', priority: 'high', timeline: '30 days', impact: '€150K–300K', rationale: 'Low invoice count; a single project unlocks outsized value.' },
      { title: 'Identify upcoming capex cycles', priority: 'medium', timeline: '60 days' },
    ]},
    { type: 'report_download',
      title: 'Customer 101580 — Weekly Health Report',
      subtitle: 'Week of 14 Apr 2026',
      audience: 'Account management team',
      scope: 'reply',
      defaultFormat: 'pdf',
      sections: [
        { label: 'Summary metrics', blockIndex: 1 },
        { label: 'Risk factors', blockIndex: 2 },
        { label: 'Recommended actions', blockIndex: 3 },
      ],
    },
  ]},
```

- [ ] **Step 2: Verify in the browser**

Run:

```bash
cd /Users/dharmendersingh/Documents/Scherzinger_new/frontend && npm run dev
```

Open `http://localhost:5173/chat-debug` and from the dropdown pick `report_download`. Confirm:

- The narrative, metric grid, factor breakdown, action plan, and ReportDownload card all render.
- Click **Download PDF**: a file downloads. Open it. Verify:
  - Page 1 is the cover — PRYZM wordmark top, title, subtitle, audience, "Generated: …". No footer.
  - Page 2 is the TOC (3 numbered entries).
  - Pages 3+ are the body. Every body page shows the thin rule + "PRYZM Analytics — Confidential" left + "Page N of M" right.
- Click the caret, pick **Download Excel**: open the xlsx. Verify:
  - First sheet `"Report"` has the cover content (PRYZM, title, subtitle, audience, generated date, section list).
  - One sheet per body block, each with the data represented as rows.
  - Print preview (File → Print) shows the PRYZM footer and page numbers.
- Click the caret, pick **Download Word**: open the docx. Verify:
  - Cover page with PRYZM wordmark + title + subtitle + audience + generated.
  - Header on subsequent pages shows "PRYZM".
  - Footer shows PRYZM + "Page N of M".
  - Headings are styled as Word Heading 1 / Heading 2 (visible under Styles in the Home ribbon).
- Click **preview** next to the PDF button: a modal opens with the rendered PDF in an iframe.

If anything fails visually, stop and fix the corresponding generator — don't ship.

- [ ] **Step 3: Stop dev server + commit**

```bash
# Ctrl-C the dev server, then:
git add frontend/src/pages/chatDebugFixtures.js
git commit -m "report-export: add /chat-debug fixture for report_download"
```

---

## Task 13: Build, verify real build clean, deploy to demo, verify INR untouched

This task deploys the demo bundle only. It uses the procedure pinned in memory — **do not** push to the real Scherzinger server.

- [ ] **Step 1: Build demo bundle**

```bash
cd /Users/dharmendersingh/Documents/Scherzinger_new/frontend
rm -rf dist dist-demo
npm run build -- --base=/demo/
mv dist dist-demo
```

Expected: build succeeds. Bundle size around 2.85 MB uncompressed / ~730 KB gz (plus an incremental few hundred KB of dynamically-imported report libs that show up only on first download click).

- [ ] **Step 2: Verify real build clean**

```bash
./scripts/verify-real-build.sh
```

Expected: `✅ Real build clean (no phase 4/5 artifacts found). Bundle hash: <hex>`.

If this fails, STOP — a phase45 string leaked into the real build. Do not deploy.

- [ ] **Step 3: Backup existing demo bundle on server**

```bash
ssh -i /Users/dharmendersingh/Documents/Scherzinger_new/pryzm_avana_demo.pem ec2-user@3.76.141.43 \
  "cd ~/pryzm/frontend && cp -r dist-demo dist-demo.bak.$(date +%s)"
```

Expected: prints the new backup directory name.

- [ ] **Step 4: Rsync**

```bash
rsync -avz --delete \
  -e "ssh -i /Users/dharmendersingh/Documents/Scherzinger_new/pryzm_avana_demo.pem" \
  dist-demo/ \
  ec2-user@3.76.141.43:~/pryzm/frontend/dist-demo/
```

Expected: files uploaded; old hashed assets deleted.

- [ ] **Step 5: Verify INR build byte-identical**

```bash
ssh -i /Users/dharmendersingh/Documents/Scherzinger_new/pryzm_avana_demo.pem ec2-user@3.76.141.43 \
  "md5sum ~/pryzm/frontend/dist/assets/*.js ~/pryzm/frontend/dist/index.html"
```

Expected output (must match exactly — if not, STOP and ask):
```
06934b36f1c4747629e2733d4483568d  /home/ec2-user/pryzm/frontend/dist/assets/index-BBf5ejbC.js
403800309985c88dac7dd947f9ea0604  /home/ec2-user/pryzm/frontend/dist/index.html
```

- [ ] **Step 6: Smoke-test live demo**

```bash
# Find the new hashed JS in dist-demo/assets/
ls dist-demo/assets/index-*.js
# Expected: e.g. index-<hash>.js. Use that hash in:
curl -sI https://demo.pryzm-solutions.com/demo/assets/index-<hash>.js | head -2
```

Expected: `HTTP/1.1 200 OK`.

- [ ] **Step 7: Live canonical-question QA**

Go to `https://demo.pryzm-solutions.com/demo/ai-insights` (log in through Avanna cookie gate first if needed).

Ask the following four questions and verify:

1. **"What's customer 101580's LTV?"**
   - Expect: single `metric_tile`. **NO** `report_download` block. If a download card appears, the prompt is misfiring — tighten the "Report requests" prompt and redeploy.

2. **"Make a weekly report of customer 101580"**
   - Expect: long structured reply ending in a `report_download` card titled "Customer 101580 — …" with PDF as default.
   - Click Download PDF → verify cover + TOC + body + PRYZM footer with page numbers.
   - Click the caret and try Excel + Word too.

3. **"Make an excel file of the top 20 at-risk customers"**
   - Expect: `ranked_list` + `report_download` with **XLSX** as the primary button.
   - Download → one sheet per block, print preview shows PRYZM footer.

4. **"Make a report of this conversation"**
   - Expect: `report_download` with `scope: "conversation"` and likely `defaultFormat: "pdf"`.
   - Download → the PDF body should contain your earlier questions (prefixed with `Q: …`) followed by the AI's previous blocks.

- [ ] **Step 8: Final commit (if any prompt tweaks were needed during live QA)**

If the prompt misbehaved during Step 7 Question 1, adjust `frontend/src/utils/structuredReply/prompt.js` (strengthen the negative rule) and repeat Steps 1–6.

If everything is clean, nothing to commit.

---

## Self-review notes

**Spec coverage check:**

- `report_download` spec + validation → Task 2.
- Prompt contract + 2 few-shots → Task 3.
- BRAND / MARGINS_PT / FONTS / `resolveDefaultFormat` / `flattenConversation` / `blockSectionLabel` → Task 4.
- Dispatcher + `downloadBlob` / `filenameFor` → Task 5.
- PDF generator (cover, TOC, body, footer with page numbers, block mapping) → Task 6.
- XLSX generator (cover sheet, per-block sheets, printed footer with page numbers, numeric formats) → Task 7.
- DOCX generator (cover section with no footer, body section with header + footer + page numbers, HEADING_1/HEADING_2, table rendering per block) → Task 8.
- `ReportDownload` component with primary + caret + PDF preview + spinner + error surface → Task 9.
- Register block type in dispatcher; thread `messageBlocks` + `conversationMessages` down → Task 10.
- `AIInsights` + `GlobalChatBar` pass `conversationMessages` → Task 11.
- `/chat-debug` fixture + visual QA → Task 12.
- Demo deploy + canonical-question QA → Task 13.

**Explicit choices that simplify the spec:**

- DOCX chart rendering emits a data table (spec's documented fallback) rather than using `html-to-image`. The `html-to-image` dep is still installed per the spec but unused in Phase 1; a future phase can swap the chart renderer without new deps.
- PDF chart rendering is also a data table (pdfmake's native SVG support is workable but fiddly; Phase 2 can upgrade to real vector plots).
- PDF preview modal is PDF-only. XLSX/DOCX previews would require third-party viewers — out of scope.

**Naming consistency verified:**

- `generateReport(format, spec, sourceBlocks)` — consistent signature across dispatcher + all three generators.
- `spec.scope` values `'reply' | 'conversation'` — consistent across schema, prompt, component, generators.
- `spec.defaultFormat` values `'pdf' | 'xlsx' | 'docx'` — consistent across schema, prompt, component, dispatcher.
- `messageBlocks` (sibling blocks of the current reply minus the report_download itself) and `conversationMessages` (full chat history) — consistent prop names on `ReportDownload` and through the renderer.

**Risk notes (from the spec) are respected:**

- Dynamic imports keep initial bundle weight clean.
- Prompt explicitly forbids emitting `report_download` without user intent. Task 13 live QA tests this directly.
- Large-report memory pressure is not addressed; Phase 1 expects <30 page outputs.
