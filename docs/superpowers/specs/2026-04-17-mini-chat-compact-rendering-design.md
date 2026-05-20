---
name: mini-chat-compact-rendering
description: Render structured chat blocks in a compact variant inside GlobalChatBar so the mini-chat drawer stops overflowing, while AI Insights keeps the full dense layout
status: draft
created: 2026-04-17T01:10:00Z
updated: 2026-04-17T01:10:00Z
---

# Mini-Chat Compact Rendering — Design

## Problem

Structured chat replies (the `{blocks: [...]}` contract from `2026-04-17-structured-chat-replies-design.md`) render identically in two very different surfaces: the full-width **AI Insights** page (~1000 px) and the **GlobalChatBar** mini-drawer (~540 px). At drawer width, several blocks overflow or clip:

- `metric_grid` crams 4 columns into the narrow drawer — the first tile's value gets cut (`€680,9…`).
- `comparison_cards` with 2+ subjects exceed drawer width.
- `ranked_list` squeezes header + value + badge into a too-narrow row.
- `factor_breakdown` expanded rows push vertically.
- `chart` forces a 224 px recharts render.
- `report_download` adds a card the user can't usefully act on in a tiny drawer.

The user's mental model for mini-chat is "crisp answer + option to drill in via View detailed". The current rendering violates that — mini-chat is a literal clone of the full page.

## Goal

Teach the structured-reply renderer to produce a compact variant when the consumer says so. The mini-chat opts in; AI Insights does not. Same underlying JSON, same data, different layout. No AI change, no schema change, no change to reports.

Success:

- No block overflows the drawer horizontally.
- Mini-chat reads as a scannable teaser; dense detail (expandable factors, action plans, downloadable reports) lives behind **View detailed**.
- AI Insights looks identical to today.

## Non-goals

- **No AI/prompt change.** Same JSON contract; same few-shots.
- **No schema change.** No new block types or validators.
- **No report generator change.** PDF/XLSX/DOCX output still renders the full reply data.
- **No entity-click / slide-over change.** Clickable chips still open the existing dossier.
- **No mini-chat width change.** Drawer stays at its current size; we adapt to it.
- **No admin knob for "what shows in compact".** Hardcoded in each component.

## Decisions (from brainstorming)

1. **One `compact` boolean prop** on `StructuredReplyRenderer`, defaulting to `false`. `GlobalChatBar` passes `true`. `AIInsights` omits it. No runtime sniffing of width.
2. **Two blocks are hidden outright in compact mode:** `action_plan` and `report_download`. Users reach both via View detailed. The skip is silent — no "hidden in compact view" footer.
3. **All other blocks adapt their layout** to fit drawer width. Data is never dropped from the stored reply — only what's visible is adjusted.
4. **No changes to ChatContext, ChatDebug, or the JSON stored in Supabase.**

## Architecture

### Prop plumbing

```
GlobalChatBar.jsx
  └─ <StructuredReplyRenderer compact={true} ... />
       └─ each block component receives compact={true}

AIInsights.jsx
  └─ <StructuredReplyRenderer ... />    // compact omitted → false
       └─ each block component receives compact={false}
```

### Renderer behaviour

`StructuredReplyRenderer` adds the `compact` prop:

```js
const HIDDEN_IN_COMPACT = new Set(['action_plan', 'report_download']);

export default function StructuredReplyRenderer({
  blocks = [], status = [], onEntityClick, finalized = false,
  conversationMessages = [], compact = false,
}) {
  return blocks.map((spec, i) => {
    if (compact && HIDDEN_IN_COMPACT.has(spec?.type)) return null;
    // ... existing pending / validate / dispatch logic, but passing `compact` into Cmp
  });
}
```

`report_download` is registered but will not render in compact mode — no generators load from the mini-chat path because the dynamic imports live inside the `ReportDownload` component, which never mounts there.

### Block behaviour matrix

| Block | Full (default) | Compact (mini-chat) |
|---|---|---|
| `narrative` | `text-sm leading-relaxed` body | `text-xs leading-snug` body |
| `callout` | `text-sm` box + icon | `text-xs` box + icon |
| `clarification` | Full suggestion chips | Chips present, smaller font |
| `metric_tile` | 2xl value, caption visible | `text-lg` value, no caption |
| `metric_grid` | Up to 4 columns, full tiles | **Always 2 columns**, tighter label, no caption, value `text-base` |
| `comparison_cards` | 2–3 side-by-side cards | **Single table** — rows are metrics, columns are subjects. Subject header row uses EntityChip. Caption hidden. |
| `ranked_list` | # · label · metric_label · value · badge | # · label · value · badge (metric label hidden). Limited to top 5 items; footer reads `+{N} more in detailed view` when truncated. |
| `factor_breakdown` | Expandable rows with detail | Flat rows: status dot · label · weight%. No chevron, no expand, no detail body. |
| `chart` (line/bar) | 224 px recharts | 80 px recharts sparkline, no legend, no axis labels. |
| `chart` (donut) | 224 px donut | Title + top-3 data rows as plain text. No donut drawn. |
| `action_plan` | Full action cards | **Hidden.** |
| `data_table` | All rows | First 3 rows. Footer `+{N} rows in detailed view` when truncated. |
| `report_download` | Card with primary + caret + preview + metadata | **Hidden.** |

### Consequences of hiding `action_plan` and `report_download`

- The existing **"View detailed"** link at the bottom of each assistant bubble in `GlobalChatBar` becomes the only path to reach actions and downloads from the mini-chat. That link already routes into AI Insights with the full conversation context, so no additional wiring is needed.
- If a reply contains *only* an `action_plan` or *only* a `report_download` (rare, but possible — e.g., user says "just make me the report"), the mini-chat shows whatever `narrative`/other blocks precede it. If nothing precedes it, the mini-chat will show an empty assistant bubble. We accept this edge case — the View Detailed button is still clickable.

### No adaptation to width beyond binary

"compact" is a consumer-declared flag, not a media query. The one drawer this affects is GlobalChatBar, which is always narrow. If a future surface needs a third rendering mode (e.g., a tablet-wide panel), we revisit — not now.

## Implementation sketch

### `StructuredReplyRenderer.jsx`

Add the prop and the early-return skip:

```jsx
const HIDDEN_IN_COMPACT = new Set(['action_plan', 'report_download']);

export default function StructuredReplyRenderer({
  blocks = [], status = [], onEntityClick, finalized = false,
  conversationMessages = [], compact = false,
}) {
  return (
    <div className="space-y-0">
      {blocks.map((spec, i) => {
        if (compact && HIDDEN_IN_COMPACT.has(spec?.type)) return null;
        const s = status[i] || (finalized ? 'ready' : 'pending');
        if (s === 'pending') return <BlockSkeleton key={i} kind={spec?.type || 'narrative'} compact={compact} />;
        const v = validateBlock(spec);
        if (!v.ok) return <BlockError key={i} reason={v.reason} />;
        const Cmp = COMPONENTS[spec.type];
        if (spec.type === 'report_download') {
          return <Cmp key={i} spec={spec} messageBlocks={blocks} conversationMessages={conversationMessages} compact={compact} />;
        }
        return <Cmp key={i} spec={spec} onEntityClick={onEntityClick} compact={compact} />;
      })}
    </div>
  );
}
```

(`report_download` path is kept for symmetry but is unreachable when `compact=true` due to the skip-list above.)

### `GlobalChatBar.jsx`

Add `compact={true}` on the one `<StructuredReplyRenderer ... />` usage. No other change.

### Block components

Three patterns, mapped per component:

**Pattern A — class-toggle only** (`Narrative`, `Callout`, `Clarification`):
```jsx
const textCls = compact ? 'text-xs leading-snug' : 'text-sm leading-relaxed';
```

**Pattern B — early-return smaller layout** (`MetricGrid`, `ComparisonCards`, `RankedList`, `FactorBreakdown`, `DataTable`, `MetricTile`):
```jsx
if (compact) return <CompactView spec={spec} />;
return <FullView spec={spec} />;
```

**Pattern C — conditional render** (`Chart`):
```jsx
if (compact && spec.variant === 'donut') return <TopThreeList spec={spec} />;
const height = compact ? 80 : 224;
```

`ActionPlan` and `ReportDownload` keep their full-mode implementation as-is; they simply aren't invoked in compact mode.

### BlockSkeleton

Add a `compact` prop — skeleton heights shrink to match the compact layout so the drawer doesn't jump when streaming completes:

```jsx
// BlockSkeleton.jsx — compact tweaks per kind:
metric_grid: compact ? 2-col grid of h-10 tiles : existing
ranked_list: compact ? 3 rows of h-7 : existing
factor_breakdown: compact ? 3 rows of h-5 : existing
chart: compact ? h-20 : h-48
comparison_cards: compact ? h-20 : h-40
```

## Testing

### Unit

- `StructuredReplyRenderer`: new test confirming `compact={true}` with `action_plan` and `report_download` blocks produces empty output for those specs and renders every other block.
- Per-block: one vitest render test per Pattern-B/C component confirming the compact branch renders without throwing for a representative fixture. These are smoke tests, not visual.

### Manual QA

1. Open mini-chat drawer on the demo. Ask: *"Give me a full Q1 health check with metrics, trend, ranked at-risk list, factor breakdown, and recommended actions."* Expect:
   - Narrative + metric grid (2-col) + chart (80 px sparkline) + ranked list (top 5) + factor breakdown (flat rows).
   - No action_plan. No report_download.
   - No horizontal overflow. No clipped numbers.
2. Click **View detailed**. AI Insights shows the full reply including `action_plan` and any `report_download` — visually identical to today.
3. Ask: *"Make a weekly report of customer 101580"* in the mini-chat. Mini-chat shows the narrative + metric_grid + factor_breakdown (compact). No download card, no action plan. Click View detailed → download card and actions appear; PDF generates (verified end-to-end per `2026-04-17-report-export-design.md`).
4. Confirm `/chat-debug` route is unchanged (no compact toggle; it renders full-mode only).

### Regression

Existing 49 vitest tests must still pass. No schema, parser, or generator logic is touched.

## Open questions (to resolve in planning)

- **`MetricTile` as a standalone block** — AI Insights currently renders it at roughly the same size in both contexts; in compact mode we shrink the value font. Confirm the compact `text-lg` reads well in the drawer; if not, go to `text-base`. Trivial to tune during QA.
- **Empty-compact-reply edge case** — if a reply contains only `action_plan` and/or `report_download` and nothing else, the mini-chat assistant bubble is empty. Accept this for Phase 1. If it feels wrong in practice, add a one-line placeholder "Open in detailed view to see full response." Decision deferred to QA.

## Build order (sketch for planning phase)

1. `StructuredReplyRenderer.jsx` — add `compact` prop + skip list. Pass down to components. Update prop forwarding for `report_download`.
2. `GlobalChatBar.jsx` — set `compact={true}`.
3. Block components in order of complexity: Pattern A (Narrative, Callout, Clarification) → Pattern B small (MetricTile, DataTable) → Pattern B medium (RankedList, FactorBreakdown) → Pattern B large (MetricGrid, ComparisonCards) → Pattern C (Chart).
4. `BlockSkeleton.jsx` — compact heights.
5. Vitest: renderer skip-list test + per-component compact render smoke tests.
6. Demo deploy + live QA against the canonical questions.

## Risk notes

- **Drawer width assumption.** If the mini-chat drawer is ever widened past ~800 px, the 2-column grid becomes too sparse. Acceptable for Phase 1; revisit if we change drawer sizing.
- **Hiding action_plan feels aggressive.** If users frequently ask "what should I do" via mini-chat, they'll be one click away from the action list (View detailed). If that friction proves painful, we flip a single line to render a slim inline action list; easy change.
- **No pixel-perfect visual tests.** Manual QA only. Acceptable because each compact layout is simple; regressions would be obvious.
