---
name: insight-slideover
description: Shared slide-over for WTP / CLV / Cross-sell row clicks so each recommendation explains itself with KPIs, narrative, and actions.
status: approved
created: 2026-04-17T00:00:00Z
updated: 2026-04-17T00:00:00Z
---

# Insight Slide-Over — Design

## Goal
Clicking a row in WTPBands, CLVRanking, or CrossSellPanel currently only updates invisible context. Replace with a shared side panel that explains the recommendation with KPIs, a plain-language "why", supporting chart, and 2-3 recommended actions.

## Components

### `<InsightSlideOver>` — new, ~150 lines
Right-side panel with fixed 6-section layout:
1. Header: badge + title + hero number
2. At-a-glance: 4 KPI tiles
3. Why: 2-3 narrative bullets
4. Supporting chart (optional)
5. Recommended actions
6. Related chips (click to drill into real slide-over when possible)

Controlled via new UIContext state: `activeInsight` + `openInsight(insight)` / `closeInsight()`.

### `insightBuilders.js` — new
Three pure functions returning a uniform `Insight` shape:
- `buildWTPInsight(row)` — pricing headroom analysis
- `buildCLVInsight(row)` — lifetime-value + retention context
- `buildCrossSellInsight(row)` — affinity + action recommendation

### UIContext addition
```js
const [activeInsight, setActiveInsight] = useState(null);
const openInsight = (insight) => setActiveInsight(insight);
const closeInsight = () => setActiveInsight(null);
```

### Layout mount
Add `<InsightSlideOver />` next to the other slide-overs.

## Widget changes
Each widget's `onRowClick` / `onClick` replaces `selectItem(...)` with `openInsight(builder(row))`. Keep `selectItem` call as well so AI chat context remains updated.

## Insight shape
```js
{
  badge: 'WTP' | 'CLV' | 'Cross-sell',
  title: string,
  subtitle?: string,
  hero: { label: string, value: string, delta?: string, tone?: 'positive'|'negative'|'neutral' },
  stats: Array<{ label: string, value: string, tone?: ... }>,          // 4 items
  why: string[],                                                        // 2-3 bullets
  chart?: { type: 'band' | 'bars' | 'spark', data: any },              // optional inline SVG
  actions: Array<{ text: string, emphasis?: 'primary'|'secondary' }>,  // 2-3 items
  related: Array<{ label: string, type: 'sku'|'customer', id: string }> // drill chips
}
```

## Narrative templates
Plain English string interpolation (no LLM). One template per builder, parameterized on row values. Example for WTP:
> "{customer} currently pays €{current}. Their willingness-to-pay band runs €{low}–€{high}. There's €{headroom} headroom to the midpoint, meaning a {pct}% price increase likely clears without losing the account."

## What stays untouched
- `getWTPBands`, `getCLVRanking`, `getCrossSell` data sources
- Existing row styling and chart rendering inside each widget
- AI chat context via `selectItem`

## Done criteria
- Click a row in any of the 3 widgets → side panel opens with all 6 sections populated
- Related SKU chips drill into SKUDeepDiveSlideOver if the SKU exists in real data; otherwise chip is non-interactive
- No regressions: existing in-row chart/band rendering unchanged
- `npm run build:demo` succeeds
