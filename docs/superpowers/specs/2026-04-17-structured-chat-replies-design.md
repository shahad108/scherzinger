---
name: structured-chat-replies
description: Replace freeform markdown AI chat replies with a typed block-based renderer so the AI picks the right response shape per question instead of always emitting Overview → Deep-Dive → Scoring → Actions
status: draft
created: 2026-04-17T00:05:24Z
updated: 2026-04-17T00:05:24Z
---

# Structured Chat Replies — Design

## Problem

The AI Insights chat currently returns freeform markdown, rendered by `utils/markdownRenderer.jsx`. In practice, Claude falls into a fixed formula regardless of the question: *Overview* → *Deep Dive* → *Scoring Table* → *Recommended Actions* → *Chart*. A single-metric question gets a five-section essay. An action plan shows up even when the user only asked "compare A vs B."

Two problems, one root cause:

1. **Shape formula** — the AI always emits the same structure. Comparison, drill-down, top-N, and trend questions all look the same on screen.
2. **Flat rendering** — even when the content is right, markdown tables + bullets read like a report, not an analyst's answer. No cards, no expandable detail, no clickable entities.

Problem #1 drives #2. Fixing the rendering without fixing the shape choice is cosmetic.

## Goal

Give the AI a fixed menu of **response block types**, let it compose the right sequence of blocks per question (including emitting very few blocks when appropriate), and render those blocks as typed React components with inline expansion for structural detail and slide-over drill-down for entities.

Success means:

- A "what is X's LTV?" answer is a single MetricTile, not a five-section report.
- A comparison answer is two cards side-by-side with an optional factor breakdown, and *no* ActionPlan unless the user asked.
- An "at-risk customers" answer is a ranked list where clicking a customer opens the existing dossier slide-over.
- Adding a new block type is a single file plus a prompt-table row.

## Non-goals

- Rewriting the existing `markdownRenderer.jsx` (it continues to render legacy chat history unchanged).
- Building new SlideOver content — entity drill-downs reuse the existing `InsightSlideOver` / `SKUDeepDiveSlideOver` infrastructure.
- Multi-turn agent-loop or tool-use refactors — this is a response-format + rendering change only.
- Introducing a new chart library — the block uses whatever the dashboard already ships.
- Admin UI to configure shapes — the shape library lives in code.

## Decisions (from brainstorming)

1. **Fully structured output.** The AI returns JSON, not markdown. Every rich answer is card-based; nothing falls back to prose rendering except on error.
2. **Block sequence, not single shape.** A reply is `{ blocks: [...] }`. The AI composes 1–N blocks per answer.
3. **Hybrid drill-down.** Inline expansion for structural detail (factor rows, long captions). SlideOver for entity drill-down (customer, SKU, product).
4. **Progressive streaming.** Incrementally parse JSON tokens; render each block as soon as it is "complete enough." Skeleton placeholders hold layout for pending blocks.

## Architecture

### New modules

```
frontend/src/
  utils/structuredReply/
    schema.js           # block type definitions + validator
    streamParser.js     # incremental JSON parser (wraps partial-json)
    prompt.js           # response-format addendum + few-shot examples
  components/chat/
    StructuredReplyRenderer.jsx   # dispatches block specs to components
    blocks/
      Narrative.jsx
      MetricTile.jsx
      MetricGrid.jsx
      ComparisonCards.jsx
      RankedList.jsx
      FactorBreakdown.jsx
      Chart.jsx
      Callout.jsx
      ActionPlan.jsx
      DataTable.jsx
      Clarification.jsx
      BlockSkeleton.jsx
```

### Edited modules

- `context/ChatContext.jsx` — add `format` discriminator to messages; wire the streaming handler through `streamParser`.
- `pages/AIInsights.jsx` — branch on `message.format` between `markdownRenderer` (legacy) and `StructuredReplyRenderer` (new); provide the `onEntityClick` callback that opens the appropriate SlideOver.

### Backward compatibility

Message objects gain a discriminator:

```js
{
  role: 'assistant',
  format: 'markdown' | 'structured',
  content: string | { blocks: [...] },
  ...
}
```

Old chat history in localStorage has `format: 'markdown'` (implicit — absence treated as markdown) and keeps rendering through the legacy path. New assistant messages are written with `format: 'structured'`.

A session-bound feature flag `STRUCTURED_CHAT` (default on in demo build) gates the new path. If Claude misbehaves in prod, flipping the flag returns the chat to markdown rendering without a deploy.

## The JSON contract

Every assistant reply:

```json
{
  "blocks": [
    { "type": "narrative", "text": "..." },
    { "type": "comparison_cards", "subjects": [...], "metrics": [...] }
  ]
}
```

### Block specs

```ts
// Required fields are unmarked; optional fields are marked `?`.

Narrative {
  text: string
  tone?: "insight" | "neutral" | "warning"
}

MetricTile {
  label: string
  value: string | number
  unit?: string
  delta?: string | number
  deltaDirection?: "up" | "down" | "flat"
  caption?: string    // one-line analyst voice
}

MetricGrid {
  tiles: MetricTile[]    // 2–4, rendered as responsive grid
}

ComparisonCards {
  subjects: [{
    id: string
    label: string
    entityType?: "customer" | "sku" | "product"   // makes it clickable
  }]
  metrics: [{
    key: string
    label: string
    values: (string | number)[]    // aligned to subjects[] by index
    format?: "currency" | "percent" | "number"
  }]
  caption?: string
}

RankedList {
  items: [{
    id: string
    label: string
    entityType?: "customer" | "sku" | "product"
    primary: { label: string, value: string | number, format?: "currency" | "percent" | "number" }
    badge?: { text: string, tone: "critical" | "warning" | "success" | "neutral" }
  }]
  caption?: string
}

FactorBreakdown {
  factors: [{
    label: string
    weight?: number    // 0–1; rendered as % if present
    status: "critical" | "moderate" | "stable" | "strong" | "weak"
    value?: string
    detail?: string    // markdown; shown only on row expand
  }]
  caption?: string
}

Chart {
  variant: "line" | "bar" | "donut"
  title?: string
  series: [...]        // shape delegated to the dashboard's chart component
  xLabel?: string
  yLabel?: string
  caption?: string
}

Callout {
  tone: "insight" | "warning" | "success"
  text: string
}

ActionPlan {
  actions: [{
    title: string
    priority: "high" | "medium" | "low"
    timeline?: string
    impact?: string
    rationale?: string
  }]
}

DataTable {
  columns: [{ key: string, label: string, format?: "currency" | "percent" | "number" }]
  rows: Record<string, string | number>[]
  caption?: string
}

Clarification {
  question: string
  suggestions?: string[]
}
```

### Entity references

Any block containing a subject/item with an `entityType`-tagged `id` renders that subject as a clickable chip. Clicking invokes `onEntityClick({ entityType, id })`, which the chat page wires to the existing SlideOver context. Customer 101580 in a ComparisonCards subject → click → customer dossier slide-over opens. No new drill-down UI.

### Validation

`schema.js` exposes `validateBlock(spec)` returning `{ok: true}` or `{ok: false, reason}`. Unknown `type`, missing required fields, or mistyped values produce `ok: false`. The renderer replaces a failing block with a small inline `<BlockError reason="..." />` card. One bad block does not kill the whole reply.

## Prompt contract

`utils/structuredReply/prompt.js` exports a **Response Format** section appended to the chat system prompt. Three rules, enforced by the prompt, verified by few-shot examples:

### Rule 1 — Pick the right shape per question

The prompt includes this decision table:

| Question pattern                | Recommended blocks                                          |
| ------------------------------- | ----------------------------------------------------------- |
| "What is X's Y?" (single fact)  | `MetricTile` (+ optional `Narrative` for context)           |
| "Compare A vs B"                | `Narrative` → `ComparisonCards` → optional `FactorBreakdown`|
| "Top/Bottom N…"                 | `RankedList` (+ optional `Narrative`)                       |
| "Why is X happening?"           | `Narrative` → `FactorBreakdown` or `Chart`                  |
| "Show me the trend…"            | `Chart` (+ `Callout` if there's a key insight)              |
| "What should I do about…"       | `Narrative` → `ActionPlan`                                  |
| Ambiguous / missing data        | `Clarification`                                             |

### Rule 2 — ActionPlan is opt-in

ActionPlan is emitted **only** when the user explicitly asks for actions, or the question is action-framed. Comparison, drill-down, trend, and single-fact answers must contain zero ActionPlan blocks. This directly kills the "always ends in Recommended Actions" formula.

### Rule 3 — Voice lives in captions

Each rich block has an optional one-line `caption` — the analyst insight ("Customer 101580's low invoice count is the dominant signal"). Don't trail every block with a Narrative restating the obvious. Long-form Narrative is reserved for genuine explanation, not filler.

### Few-shot examples

The prompt includes 3–4 worked examples:

1. Single-fact ("What's customer 101580's LTV?") → one `MetricTile`, no ActionPlan.
2. Comparison ("Compare churn risk for 101580 vs 104053") → `Narrative` lead + `ComparisonCards` + `FactorBreakdown`, no ActionPlan.
3. Action-framed ("What should I do about at-risk enterprise customers?") → `Narrative` + `RankedList` + `ActionPlan`.
4. Ambiguous input ("show me churn") → `Clarification` with 3 suggestion chips.

### Output enforcement

The Claude API call uses response-format / JSON-only mode. The prompt ends with: *"Output a single JSON object with a `blocks` array. No prose outside JSON. No markdown code fences."*

If the model breaks format anyway, the parser (see below) falls back to rendering the raw text as markdown with a small "Fallback rendering" tag.

## Streaming + rendering

### Parser flow

1. Start the Claude streaming call with JSON response format.
2. Accumulate tokens into a buffer. On each chunk, run the buffer through `partial-json` (or equivalent permissive parser) to get the best-effort current parse.
3. Walk `parsed.blocks[]`. For each index `i`:
   - **Ready**: the block at `i` has all required fields AND either the array has moved past index `i` OR the stream has closed. Render the real block component.
   - **Pending**: still at the tail of the parse with incomplete fields. Render `<BlockSkeleton kind={spec.type} />`.
4. On stream close, run full `validateBlock` on each spec; any block that fails renders as `<BlockError />`.

The "moved past index `i`" check prevents flicker from re-rendering a half-populated Chart on every token. Blocks only transition `pending → ready` once; they never revert.

### Skeleton states

Each block component exports a matching `<BlockSkeleton kind="..." />`. Skeletons are shimmer placeholders sized roughly right (e.g., ComparisonCards skeleton renders two card-shaped boxes) so layout doesn't jump when the real content lands.

### Rendering layer

- `StructuredReplyRenderer` props: `{ blocks, streamStatus, onEntityClick }`. It maps each block spec to its component.
- Block components are presentational; they receive `spec` and the shared `onEntityClick(entity)` callback.
- `onEntityClick` is provided by `AIInsights.jsx` and calls into the existing SlideOver context used by `InsightSlideOver` and `SKUDeepDiveSlideOver`.
- Inline expansion (FactorBreakdown row detail, long captions) is local component state. No context needed.

### Error handling

- **Malformed JSON at end of stream** → render collected raw text through `markdownRenderer` with a small "Fallback rendering" tag above.
- **Network cut mid-stream** → keep already-rendered blocks, append a retry chip below the reply.
- **Single block fails validation** → replace with `<BlockError reason="..." />`; siblings render normally.

## Testing

### Unit

- **Block components**: each component renders from a fixture spec. Snapshot-ish assertions on structure (number of cards, factor rows, etc.), and a click handler test for entity-tagged items.
- **`schema.js`**: happy + malformed fixtures for every block type; asserts `validateBlock` returns expected `ok` / `reason`.
- **`streamParser.js`**: fed real captured token streams from Claude; asserts `block-ready` events fire at expected offsets and that re-parsing mid-block doesn't emit duplicate ready events.

### Manual / QA

- New `/chat-debug` route (dev-only) with:
  - A block picker that renders all 10 block types from sample specs.
  - A "replay stream" mode that feeds a captured Claude response token-by-token so we can visually verify skeleton → real-block transitions.

### Regression fixtures

Five canonical user questions, each with a captured stream fixture and a golden-render snapshot:

1. "Compare churn risk factors for Customer 101580 vs Customer 104053"
2. "Who are my top 10 at-risk customers?"
3. "Why did margin drop for SKU 123?"
4. "Show me customer 101580's dossier"
5. "What should I do about at-risk enterprise customers?"

## Open questions (to resolve during planning)

- **Chart library** — confirm which chart library the dashboard currently uses before designing the `Chart` block's `series` shape. The block's internal structure mirrors that library's expected input to avoid a translation layer.
- **Partial-JSON library** — pick between `partial-json`, `best-effort-json-parser`, or a small handwritten parser. Decision deferred to planning; affects ~120 lines in `streamParser.js`.

## Build order (sketch for the plan phase)

1. Schema + validator (no UI).
2. Block components + `StructuredReplyRenderer`, driven by static fixtures on `/chat-debug`.
3. Stream parser, still driven by captured fixtures.
4. Prompt module + wiring into `ChatContext.jsx`.
5. Entity-click integration with existing SlideOvers in `AIInsights.jsx`.
6. Feature flag + legacy markdown fallback path.
7. Regression fixtures + QA pass.
