---
name: report-export
description: Downloadable PDF / XLSX / DOCX reports generated from the AI chat when the user explicitly asks. Adds a new report_download block that the AI emits at the end of report-intent replies; clicking it produces a professional client-side file with PRYZM branding, page numbers, and proper layout.
status: draft
created: 2026-04-17T01:06:47Z
updated: 2026-04-17T01:06:47Z
---

# Report Export (Phase 1) — Design

## Problem

The new structured chat (`docs/superpowers/specs/2026-04-17-structured-chat-replies-design.md`) is great for on-screen consumption but can't leave the browser. Users want to mail the board a weekly customer report, drop a top-20 at-risk list into Excel for the sales team, or archive a pricing review as a Word doc. Today there's no way to do any of that.

## Goal

When the user explicitly asks for a downloadable report, the AI produces a long structured reply with a new `report_download` block at the end. Clicking the block generates a professional client-side file (PDF / XLSX / DOCX) with PRYZM branding, cover page, TOC, headings, margins, page numbers, and a footer reading "PRYZM Analytics — Confidential". No server, no scheduling, no stored history — all of that is out of scope for Phase 1.

Success criteria:

- The AI emits `report_download` **only** on explicit report intent (not on every reply).
- Files open cleanly in Adobe Reader / macOS Preview / Word / Pages / Excel / Numbers.
- PDF cover page has no footer; body pages do; page numbers advance correctly.
- User can override the AI's chosen format via a caret dropdown.
- Reports covering the current reply ("weekly report of customer X") and reports covering the whole conversation ("make a report of this conversation") both work.

## Non-goals (Phase 1)

- No scheduling of reports (Phase 3).
- No email delivery (Phase 3).
- No persistent history of generated reports in Supabase (Phase 2).
- No server-side PDF rendering — pure client-side.
- No visual-regression snapshots of rendered files — manual QA only.
- No i18n of the PDF chrome (cover/footer are English; body text follows the AI's language).

## Decisions (from brainstorming)

1. **Full Phase 1 scope** — report engine + download block + named-template recognition now; scheduling + storage in later phases.
2. **Opt-in, not always-on** — report_download appears only when user asks; not on every structured reply.
3. **Both scopes — AI picks** — reply-scope ("weekly report of customer X") and conversation-scope ("report of this chat") are both supported; AI sets `scope: 'reply' | 'conversation'` based on the ask.
4. **Default format + override** — a single primary button with a caret revealing the other two formats. Default chosen by the AI from explicit user intent first, then content shape.

## Architecture

### New modules

```
frontend/src/
  utils/
    reportExport/
      shared.js           # BRAND, MARGINS_PT, block-to-section mappers, flattenConversation()
      pdf.js              # async generatePdf(spec, sourceBlocks) → Blob
      xlsx.js             # async generateXlsx(spec, sourceBlocks) → Blob
      docx.js             # async generateDocx(spec, sourceBlocks) → Blob
      index.js            # dispatcher: generateReport(format, spec, sourceBlocks)
      __tests__/
        shared.test.js
        dispatcher.test.js
  components/chat/blocks/
    ReportDownload.jsx    # the card component with primary + caret + preview
```

### Edited modules

- `utils/structuredReply/schema.js` — add `validateReportDownload`; register type in `BLOCK_TYPES` and `VALIDATORS`.
- `utils/structuredReply/prompt.js` — add "Report requests" section + two few-shot examples.
- `components/chat/StructuredReplyRenderer.jsx` — register `report_download`, thread `messageBlocks` + `conversationBlocks` props down to it.
- `pages/AIInsights.jsx` and `components/GlobalChatBar.jsx` — pass the sibling collections into the renderer.
- `pages/ChatDebug.jsx` + `pages/chatDebugFixtures.js` — add a `report_download` fixture exercising all three formats.

### New runtime dependencies

- `pdfmake` (~300 KB gz) — PDF generation. Dynamic-imported inside `pdf.js`.
- `xlsx` (SheetJS CE, ~200 KB gz) — XLSX generation. Dynamic-imported inside `xlsx.js`.
- `docx` (~90 KB gz) — DOCX generation. Dynamic-imported inside `docx.js`.
- `html-to-image` (~20 KB gz) — Capture recharts containers as PNG for DOCX embedding. Dynamic-imported inside `docx.js` only.

Total ~610 KB gz, but all four are dynamic-imported — no initial-page-load impact.

## The `report_download` block

### Spec

```ts
ReportDownload {
  title: string                              // cover-page title, required
  subtitle?: string                          // cover-page subtitle ("Week of 14 Apr 2026")
  scope: "reply" | "conversation"            // required
  defaultFormat: "pdf" | "xlsx" | "docx"     // required
  sections?: [{
    label: string
    blockIndex: number                       // index into the sibling reply's blocks[]
  }]
  audience?: string                          // "Sales team" — printed under title on cover
}
```

### Validation rules (added to `schema.js`)

- `title` must be a non-empty string.
- `scope` must be `'reply'` or `'conversation'`.
- `defaultFormat` must be `'pdf'`, `'xlsx'`, or `'docx'`.
- If `sections` is present, every `blockIndex` must be a non-negative integer. Out-of-range indices are validated at render time (the renderer knows how many sibling blocks exist) and produce a non-fatal warning — they're silently dropped from the TOC, never fail the whole reply.

### Prompt contract

Appended to `STRUCTURED_RESPONSE_PROMPT` in `utils/structuredReply/prompt.js`:

> **Report requests.** When the user explicitly asks for a report, file, PDF, Excel, Word doc, or other downloadable output, append a `report_download` block at the very END of your normal blocks sequence. Trigger phrases include: "make a report", "generate a PDF", "excel file", "export", "download", "weekly report of…", "report for my sales team", "word doc of…".
>
> Rules:
>
> 1. Before the `report_download` block, produce the full report content as normal structured blocks (narrative, metric_grid, factor_breakdown, chart, data_table, etc.). The file mirrors what the user sees on-screen.
> 2. Set `scope: "conversation"` when the user asks to export what you've already discussed ("report of this conversation", "summarize our chat"). Set `scope: "reply"` when generating a fresh report ("weekly report of customer X", "make an excel file of at-risk customers").
> 3. Set `defaultFormat` based on explicit user intent first (they said "excel" → `xlsx`; "word doc" → `docx`; "pdf" → `pdf`). If unspecified, pick by content shape: `xlsx` when the reply is dominated by tables/ranked lists, `docx` for formal narrative reports, `pdf` otherwise (safe default).
> 4. `title` must be concrete and include the subject ("Customer 101580 — Churn Risk Report"), not generic ("Report").
> 5. Include optional `sections` when there are more than 3 non-trivial blocks — this powers the document's table of contents.
> 6. Do NOT emit `report_download` when the user did not explicitly ask for one. A question like "what's customer 101580's LTV?" must never return a report_download block.

Two new few-shot examples:

- **Weekly customer report** — "Make a weekly report of customer 101580": narrative + metric_grid + chart + factor_breakdown + action_plan + `report_download` with `defaultFormat: "pdf"`, `scope: "reply"`, `sections: [...]`, `title: "Customer 101580 — Weekly Health Report"`, `subtitle: "Week of 14 Apr 2026"`.
- **Excel export** — "Make an excel file of the top 20 at-risk customers": ranked_list + `report_download` with `defaultFormat: "xlsx"`, `scope: "reply"`, `title: "Top 20 At-Risk Customers"`.

## Professional layout template

All three formats share `utils/reportExport/shared.js`:

```js
export const BRAND = {
  name: "PRYZM",
  footerText: "PRYZM Analytics — Confidential",
  accentColor: "#2563eb",
  textColor: "#0f172a",
  mutedColor: "#64748b",
  ruleColor: "#e2e8f0",
};
export const MARGINS_PT = { top: 54, right: 54, bottom: 64, left: 54 };
export const FONTS = { heading: "Helvetica-Bold", body: "Helvetica" };
```

### Page structure (PDF and DOCX)

- **Cover page** (no footer): PRYZM wordmark top-left, title (large bold), subtitle (medium muted), audience line if set, "Generated: <date> · <user>" line.
- **Table of contents** (only if `sections` present): numbered list with dot leaders and page numbers.
- **Body**: one heading per section, followed by the rendered block(s). Footer at bottom of every body page shows a thin rule, `"PRYZM Analytics — Confidential"` left, `"Page N of M"` right.

### Block → section mapping

| Block type | PDF/DOCX | XLSX |
|---|---|---|
| `narrative` | Paragraph (body font) | Prepended as comment above the next data section |
| `metric_tile` / `metric_grid` | 2–4 column bordered cards: label above big value | Sheet with two columns (Metric, Value) |
| `comparison_cards` | Horizontal table with subjects as columns | Sheet "Comparison" with subjects as columns |
| `ranked_list` | Numbered table with colored badge cells | Sheet "Ranked list" with one row per item, badge column |
| `factor_breakdown` | Table with status-colored dot, weight, expanded detail below each row | Sheet "Factors", detail column is plain text |
| `chart` | PDF: vector-drawn via pdfmake; DOCX: captured as PNG (`html-to-image` at 2× DPR) | XLSX: data table of underlying `series`; no chart object generated (SheetJS charts are flaky) |
| `callout` | Bordered tone-colored box | Single cell with colored background in "Notes" sheet |
| `action_plan` | Table: Priority · Title · Timeline · Impact · Rationale | Sheet "Actions" with same columns |
| `data_table` | Table (verbatim) | Sheet matching its columns |
| `clarification` | Skipped | Skipped |
| `report_download` | Skipped (it's the trigger, not content) | Skipped |

### Footer + page numbers

- **PDF**: pdfmake's footer function renders the rule + left text + `Page {N} of {M}` on every page after the cover.
- **DOCX**: footer section with `"PRYZM Analytics — Confidential"` left and `Page { PAGE } of { NUMPAGES }` field right; a separate page has no footer on the cover.
- **XLSX**: `sheet.headerFooter.oddFooter = '&L"PRYZM Analytics — Confidential"&RPage &P of &N'` so printed copies carry the branding and pagination.

### DOCX specifics

- Page size Letter, margins from `MARGINS_PT` converted to twips.
- Headings use Word's built-in Heading 1 / Heading 2 styles so the TOC auto-builds on Word open.
- PRYZM wordmark in header from page 2 onward.

### XLSX specifics

- First sheet `"Report"` with merged-cell title row, subtitle row, audience row, generated-on row, and a list of the other sheets.
- Each section becomes its own sheet. Sheet tabs colored with `BRAND.accentColor`.
- Column widths auto-sized from content (capped at 60 chars).
- Numeric formats applied from each metric's `format` field (currency uses `€#,##0`, percent uses `0.0%`, number uses `#,##0`).

## Download UI

### The `ReportDownload` component

Renders below the reply's other blocks:

```
┌─────────────────────────────────────────────────────────────┐
│  📄  Customer 101580 — Weekly Health Report                 │
│     Week of 14 Apr 2026                                      │
│                                                              │
│                              [ ⬇ Download PDF ▾ ] [preview]  │
└─────────────────────────────────────────────────────────────┘
```

- Primary button uses the AI's `defaultFormat`.
- Caret opens a small menu with the other two formats.
- `[preview]` link opens a modal with `<iframe src={blobUrl}>` so the user sanity-checks the PDF before downloading. Preview is PDF-only (browsers don't render XLSX/DOCX inline); the link is hidden for those formats.
- A spinner replaces the button while the blob generates (typically 300 ms – 1 s).
- After generation: `URL.createObjectURL(blob)` → trigger anchor download → revoke after 60 s.

### Data flow

```
click Download PDF
  ↓
ReportDownload reads {spec, messageBlocks, conversationBlocks} from props
  ↓
sourceBlocks = spec.scope === 'reply' ? messageBlocks.filter(b => b.type !== 'report_download')
                                      : flattenConversation(conversationBlocks)
  ↓
generateReport(format, spec, sourceBlocks) → Blob
  ↓
createObjectURL + anchor click → download
  ↓
revokeObjectURL after 60 s
```

### How sibling collections reach the component

`StructuredReplyRenderer` already receives `blocks`. We extend it to also accept `conversationBlocks` (optional) and, when rendering a `report_download` block, pass both the surrounding message's `blocks` (minus the report_download itself) and the full `conversationBlocks` into the `ReportDownload` component via props. `AIInsights.jsx` and `GlobalChatBar.jsx` are updated to supply `conversationBlocks` (derived from their respective message-list states).

## Testing

### Unit (vitest)

- `shared.test.js`:
  - `blockToSection(block)` returns expected section spec for each of the 11 block types.
  - `flattenConversation(messages)` produces a flat blocks array with user questions inlined as synthetic `narrative` blocks with `tone: 'neutral'` and bold prefix "Q:".
  - `resolveDefaultFormat(spec, userTextHint)` honors explicit hint before falling back to content-based inference (covered by a handful of cases).
- `dispatcher.test.js`:
  - `generateReport('pdf', spec, blocks)` returns a `Blob` with `type === 'application/pdf'` and non-zero size.
  - Same for `xlsx` (`application/vnd.openxmlformats-officedocument.spreadsheetml.sheet`) and `docx` (`application/vnd.openxmlformats-officedocument.wordprocessingml.document`).
  - `scope: 'reply'` uses the passed `messageBlocks`; `scope: 'conversation'` uses the passed `conversationBlocks`.
- `schema.test.js` gains cases for `report_download`: valid minimal spec passes, missing `title` fails, invalid `defaultFormat` fails, `scope: 'history'` fails.

### Manual QA

- On `/chat-debug`, select a new `report_download` fixture; click each of the three formats; confirm each downloads a non-empty file; open each and visually verify:
  - **PDF**: cover page has no footer; body pages all have the rule + "PRYZM Analytics — Confidential" + page number; TOC (if fixture includes sections) lists correct page numbers.
  - **DOCX**: opens in Word/Pages without complaints; headings use Heading 1 / Heading 2; footer and header render; TOC auto-populates on "Update Field".
  - **XLSX**: opens in Excel/Numbers; each section has its own sheet; print preview shows PRYZM footer and page numbers; numeric formats applied.
- On the live demo after deploy, ask:
  - "Make a weekly report of customer 101580" → expect long reply + `report_download` with `defaultFormat: "pdf"`.
  - "Make an excel file of the top 20 at-risk customers" → expect `ranked_list` + `report_download` with `defaultFormat: "xlsx"`.
  - "What's customer 101580's LTV?" → expect single `metric_tile`, **no** `report_download`. This is the formula-breaker test; if a report_download appears, tighten the prompt.

## Open questions (to resolve in planning)

- **Chart embedding in DOCX** — `html-to-image` requires the chart's container to be mounted in the DOM when captured. We'll need either (a) a hidden offscreen render pass before generating the DOCX, or (b) a fallback that emits the chart's raw `series` as a DOCX table when the rendered container is unavailable. Decision deferred to planning.
- **pdfmake font embedding** — Helvetica is a standard PDF font; no embedding required. If we later want a custom PRYZM typography, we'll need to embed a webfont, adding ~200 KB to the PDF. Not for Phase 1.

## Build order (sketch for the plan phase)

1. Schema change + validator test for `report_download`.
2. `utils/reportExport/shared.js` with `BRAND`, mappers, `flattenConversation`, and unit tests.
3. `pdf.js` (probably the biggest) + unit test returning a Blob; manually open output to eyeball.
4. `xlsx.js` + unit test + open output.
5. `docx.js` + unit test + open output.
6. `utils/reportExport/index.js` dispatcher.
7. `ReportDownload.jsx` component with button + caret + preview modal.
8. Wire `StructuredReplyRenderer` to pass sibling collections; wire `AIInsights.jsx` and `GlobalChatBar.jsx` to supply `conversationBlocks`.
9. Extend `prompt.js` with report-requests section + two few-shots.
10. `ChatDebug` fixture.
11. Build + demo deploy + live canonical-question QA.

## Risk notes

- **Bundle weight**: ~610 KB gz added. Dynamic-imported, so invisible until the first download click. Measure first-click latency on the demo after ship.
- **Model drift on report intent**: the prompt is explicit, but Claude may emit `report_download` on borderline questions. First live test will tell; if noisy, strengthen with a negative few-shot.
- **Chart fidelity in DOCX**: PNG screenshots of recharts can look fuzzy. If DOCX charts are unacceptable, fall back to the data-table representation.
- **Client memory**: generating a large PDF (50+ pages, many charts) in the browser can hit memory pressure on weak machines. Phase 1 assumes reports stay under 30 pages; if users generate larger ones regularly, server-side rendering becomes a real consideration for Phase 2/3.
