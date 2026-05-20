# Frontend Margin Cockpit Page — Reference

> Last updated: 2026-05-14. Mirrors the state of the working tree at HEAD `b9118b4`.
>
> Source of truth lives in `frontend-v2/src/features/margin-cockpit/`. This document indexes every component the page can render, in render order, with data sources and interactions.

## 1. Entry point

| File | Role |
|---|---|
| `frontend-v2/src/features/margin-cockpit/index.tsx` | Page shell. Fetches `MarginCockpitData` via `useMarginCockpit`, reads the `focus` deep-link param, owns the briefing-open state and the active tab/sub-tab state for the bottom `MarginTabs`, and dispatches each payload slice to a sibling section component. Mounted at the `/margin` route via `src/app/router.tsx` (`MarginPage = lazy(() => import('@/features/margin-cockpit'))`). |

### URL parameters (read by `MarginCockpitPage`)

| Param | Default | Effect |
|---|---|---|
| `focus` | — | One of `lost_quote` · `waterfall` · `cost_vs_price` · `shifted` · `cross` (see `FOCUS_TARGETS` set in `index.tsx:20`). When set and `data` has loaded, the matching `#block-{focus}` element is smooth-scrolled into view and tagged with `data-focus-pulse="1"` for ~2.2 s so the user's eye lands on the right card. Any other value is ignored. |

Note — there is **no other URL state**. Cluster/Family/Tier filter pills in the header (`MarginPageHead`) are rendered from `data.header.filters` but the buttons are not wired to the URL or to a state setter; they are display-only at this commit. The active main tab and segment sub-tab are local component state (`activeTab`, `activeSegTab`), not URL-driven.

### Data source

- Hook: `useMarginCockpit(params?)` in `frontend-v2/src/data/api/useMarginCockpit.ts`. The page calls it with **no params** at this commit; the hook type accepts `MarginCockpitParams = ShellParams & { period?, cluster?, family?, tier?, customer_id? }` (`src/lib/api/queryKeys.ts:28`) but nothing on the page populates these yet.
- Endpoint: BFF `GET /screens/margin-cockpit` (FastAPI `screens` router, `scherzinger-platform/backend/api/v1/screens.py:155`, composer at `scherzinger-platform/backend/services/margin_cockpit/composer.py`).
- TanStack Query, `staleTime: 60_000`, query key `qk.marginCockpit(params)`.
- Returns a `MarginCockpitData` (`frontend-v2/src/types/index.ts:581`):

```
MarginCockpitData
├─ header        MarginPageHeader        — crumb, title, sub-pills, sub-stats, audit tag, filter pills
├─ briefing      BriefingMemoData        — title, HTML paragraphs, signature, audit hash
├─ health        MarginHealthCell[4]     — score · actual · belowPlan · closable
├─ clusters      ClusterChip[]           — per-cluster mini-row
├─ shifted       { title, rows, netLine }
├─ waterfall     WaterfallCardData       — buckets + chart + movable/locked + optional movable-only view
├─ lostQuote     LostQuoteDifferentialData
├─ costVsPrice   CostVsPriceData         — 24-pt cost/price series + pass-through + recovery spark
├─ tabs          MarginTabs              — cross · leak · seg · erode · cust
└─ crossLinks    CrossLink[]
```

Loading state: `MarginCockpitSkeleton`. Error state: inline red text with `(error as Error).message ?? 'unbekannt'`.

### Page-shell render order

```
MarginPageHead                          (crumb · title · sub-pills · audit tag · filter pills · briefing CTA · PDF · deck)
BriefingMemo                            (conditional — only when briefingOpen=true)
MarginHealthStrip                       (4 KPI cells)
ClusterMiniRow                          (per-cluster chips)
#block-shifted   → ShiftedStrip         (3–N "shifted" rows + net line)
#block-waterfall → WaterfallCard        (recharts waterfall + bucket table + MovableLockedOverlay)
#block-lost_quote → LostQuoteDifferential
#block-cost_vs_price → CostVsPriceCard
MarginTabs                              (id="marginTabsBlock"; tablist + panel — see §2)
CrossLinks                              (footer cross-links)
```

The whole page sits inside a `<div id="screen-margin" className="w-full px-6 py-6">` and the body picks up a `pz-fullbleed` class on mount (removed on unmount).

---

## 2. Main page body — top → bottom

| # | Component | Source file | What it shows | Key interactions |
|---|---|---|---|---|
| 1 | **MarginPageHead** | `components/MarginPageHead.tsx` | Breadcrumb (`header.crumbTrail`), H1 (`header.title`), sub-pills (`subPills`), sub-stats (label/value pairs), violet "Audit-ready · hash-signed" tag, three filter dropdown buttons (Cluster · Family · Tier — read-only, no `onClick`), a rose "Generate margin briefing →" CTA, a "Branded PDF" button, and "Export to deck" button. | **Generate margin briefing →** toggles `briefingOpen` on the parent (mounts/unmounts `BriefingMemo`). All three filter buttons and the PDF/deck buttons are static at this commit (no handlers). |
| 2 | **BriefingMemo** | `components/BriefingMemo.tsx` | Auto-drafted memo card with a 4 px rose left border. Header: title + Copy · Email to Till · Branded PDF · close X. Body: editable `contentEditable` region rendering `data.briefing.paragraphs[].html` via `dangerouslySetInnerHTML`, signature footer, and a `code`-wrapped audit hash. Conditional — only mounts when `briefingOpen` is true. | **Close X** sets `briefingOpen=false`. Body is `contentEditable` (no save handler — local-only edits). Copy/Email/PDF buttons are static. |
| 3 | **MarginHealthStrip** | `components/MarginHealthStrip.tsx` | 4 KPI cells in a responsive grid (1 / 2 / 4 cols). One special "score" cell with a conic-gradient ring + verdict tone (green/amber/red). The other three (`actual`, `belowPlan`, `closable`) show value · optional trend chip with up=red/down=green/flat tint · `sub` HTML · optional `benchmark` HTML · optional `authSplit` (yours / needs Till) chips. | If a cell has `jumpTo`, the whole cell is wrapped in a `<Link>` (react-router) — clicking navigates to that route (e.g. `/action-center`). No `jumpTo` → static div. `sub` and `benchmark` are rendered via `dangerouslySetInnerHTML`. |
| 4 | **ClusterMiniRow** | `components/ClusterMiniRow.tsx` | Single horizontal strip: small caps label + per-cluster pills `{code} {margin} · {target} · conf {conf}` colored by tone (green/amber/red). Optional `⚠` `warning` text on low-n clusters. Source caption on the right pointing to `products_detail.commodity_scorecard`. | Hover/click a pill with `warning` → opens a 260 px `role="tooltip"` showing "Low-n cluster" + `filterToast` copy. Pills are **not** wired to filter state — the `filterToast` only renders inside the tooltip. |
| 5 | **ShiftedStrip** | `components/ShiftedStrip.tsx` (wrapped in `#block-shifted`) | "What shifted MoM" card: each row = colored dot (red/green/amber/muted) + HTML body text + delta chip (up=red/down=green/flat) + rose "→ jumpLabel" chip on the right. Footer: `netLine` (HTML). | **Click a row** → if `row.jumpTo.kind==='route'` calls `useNavigate().push(to)`; if `kind==='tab'` calls parent's `handleTabJump(tab, segTab?)` — sets the bottom-tab state and smooth-scrolls `#marginTabsBlock` into view. Row text and netLine are `dangerouslySetInnerHTML`. |
| 6 | **WaterfallCard** | `components/WaterfallCard.tsx` (wrapped in `#block-waterfall`) | "Plan → Actual margin walk" card. Title + subtitle + optional "Movable-only" checkbox + totalChip. Left half: Recharts `BarChart` rendering a stacked-floating waterfall (invisible `base` + visible `value` bar, green for endpoints, rose for losses). Right half: bucket list — dot · name · optional delta chip · optional **Classification pill** (Strategic green / Unintended rose / Mixed slate) · optional **⚠ low-n** badge · `source` HTML sub-line · pct · eur · jumpLabel. Bottom: `MovableLockedOverlay`. Optional heuristic footnote when in movable-only mode. | **Movable-only checkbox** (when `data.movableView` is present): swaps `buckets` + `chart` to the precomputed movable-only view. **Click a bucket** with a `jumpTo` → route nav or tab jump (same dispatcher as ShiftedStrip). **Classification pill** hover/click → tooltip with `classificationNote`. **⚠ low-n badge** hover/click → tooltip listing low-n clusters with n and conf. Bucket `source` rendered via `dangerouslySetInnerHTML`. |
| 6a | MovableLockedOverlay (sub-component) | `components/MovableLockedOverlay.tsx` | Stacked horizontal bar showing the Movable / Locked split of `totalLeakage` (rose · ink-3). Header sentence + source caption (HTML). Two legend rows explain Movable ("Frank acts this cycle (Studio + A/B)") and Locked ("under frame contracts; Till's renegotiation queue"). | Read-only. `source` is `dangerouslySetInnerHTML`. |
| 7 | **LostQuoteDifferential** | `components/LostQuoteDifferential.tsx` (wrapped in `#block-lost_quote`) | "Lost-quote differential" violet-bordered card. Header: title · subtitle · green "p = … · statistically significant" pill. Three tiles (`won` ink, `lost` rose, `diff` violet) with label · big value · sub. Body: HTML `interpretationHtml` quote (rose-violet block) + small `sourceHtml` line. | Read-only. Both HTML blocks are `dangerouslySetInnerHTML`. |
| 8 | **CostVsPriceCard** | `components/CostVsPriceCard.tsx` (wrapped in `#block-cost_vs_price`) | "Input cost vs realized price" card. Header: title · subtitle · "Indexed Apr 2024 = 100" chip. Left: Recharts `LineChart` of `series` (24 points of `cost` rose-line + `price` ink-line). Right: rose pass-through card (label · pct · sub HTML · progress bar `width = pct%` · breakdown HTML) and white recovery card (label · €-value · sub HTML · 80 px `AreaChart` spark of `recovery.spark`). | Read-only. `sub`, `breakdownHtml` are HTML. |
| 9 | **MarginTabs** | `components/MarginTabs.tsx` (id=`marginTabsBlock`) | Tablist with 5 tabs: `cross` ("Cross-Customer Discrepancy" — with violet `★ Proprietary` badge) · `leak` ("SKU Margin Leakage") · `seg` ("Segment pivot") · `erode` ("List-price erosion") · `cust` ("Customer trend"). Initial active tab is `cross`; initial active sub-tab is `family`. Tablist is `role="tablist"` with proper `aria-selected` / `aria-controls`. Renders exactly one pane below the tablist depending on `activeTab`. | **Click a tab** → calls parent's `onTabChange(id)` (local `useState`). The `seg` pane has nested sub-tabs (`family` / `tier` / `size` / `region`). Other components on the page (ShiftedStrip, WaterfallCard) also push the active tab via `handleTabJump`, which additionally smooth-scrolls `#marginTabsBlock`. |
| 9a | CrossCustomerPane | `components/panes/CrossCustomerPane.tsx` | Table of cross-customer price-spread rows: Article · Cluster·conf chip · Customer A / Price A · Customer B / Price B · Volume tier · Spread % (red) · Action. Optional rose-tinted highlighted row. Footer note (HTML) + lightning "tab footer" rationale (HTML). | **Open in Studio →** button on each row → `nav('/pricing')`. |
| 9b | SkuLeakagePane | `components/panes/SkuLeakagePane.tsx` | Table: Article · Description · Volume · Quoted margin · Actual margin · Gap (red) · Opportunity (green) · A/B status (🧪 violet when running, else muted) · audit hash (code) · Action. | **Open in Studio →** on each row → `nav('/pricing')`. |
| 9c | SegmentPane | `components/panes/SegmentPane.tsx` | Inner `role="tablist"` over `subPanes` (`family` / `tier` / `size` / `region`). Active sub-pane renders its `headers[]` + `rows[]` with optional tier badge (A=rose / B=ink-3 / C=amber / D=red). Below the table: `storyHtml` and optional violet `caveatHtml` callout (BKAGG region warning). | **Sub-tab click** → calls parent's `onSegTabChange(id)`. `storyHtml`/`caveatHtml` rendered via `dangerouslySetInnerHTML`. |
| 9d | ErosionPane | `components/panes/ErosionPane.tsx` | Header: description + rose `cycleButtonLabel` CTA (currently a no-op — Phase 7 wires real action). Table: Article · Cluster chip · Last list update (mini horizontal age bar — green ≤6 mo, amber 6–9, rose ≥9, scaled vs 16 mo) · Cost change since (red if +, green if −) · List change · Effective erosion (red if −, green if +) · Margin compression (green if +, red otherwise, except `0pp`) · Last author · hash · Action. Below table: `cycleNote` HTML + lightning footer. | **Open in Studio →** on actionable rows → `nav('/pricing')`. Non-actionable rows render a muted "healthy · no action" label. The header cycle CTA is intentionally a no-op (`Phase 7 wires real action`). |
| 9e | CustomerTrendPane | `components/panes/CustomerTrendPane.tsx` | Table: Customer · YTD Revenue · YTD Margin · Trend chip (green up / red down / muted flat) · Status pill (action=rose / watch=amber / healthy=green) + dot · Action column with optional primary `primaryAction` (dark) + a "Drill →" outline button. | **Primary action** → `nav(row.primaryAction.jumpTo)`. **Drill →** button is static. |
| 10 | **CrossLinks** | `components/CrossLinks.tsx` | Bottom footer card: "Cross-links →" caption + a row of `<Link>` buttons (label · `jumpTo` route). | Each link is a react-router `<Link>` to the route. |

---

## 3. Deep-link focus flow

| Hook / mechanism | Where |
|---|---|
| `FOCUS_TARGETS = Set(['lost_quote','waterfall','cost_vs_price','shifted','cross'])` | `index.tsx:20` — the allowlist of focusable blocks. |
| `params.get('focus')` | `index.tsx:28`. |
| `useEffect` (depends on `data`, `focus`) | `index.tsx:39–49`. After data lands, `document.getElementById('block-' + focus)?.scrollIntoView({ behavior:'smooth', block:'start' })` and sets `el.dataset.focusPulse = '1'`, cleared after 2200 ms. |
| Block wrappers | `<div id="block-shifted" data-focus-target="shifted">…</div>` etc. — only Shifted/Waterfall/LostQuote/CostVsPrice have wrappers. `cross` is in the allowlist but the `cross` tab inside `MarginTabs` does not have a `#block-cross` wrapper, so a `?focus=cross` deep-link is a no-op (silent miss). |

Tab-jump path (used by ShiftedStrip and WaterfallCard buckets):

```
row.jumpTo = { kind:'tab', tab:'erode' }
  → handleTabJump('erode')
  → setActiveTab('erode')
  → document.getElementById('marginTabsBlock')?.scrollIntoView({ behavior:'smooth', block:'start' })
```

Sub-tab path: `jumpTo.segTab` (when present) is forwarded to `setActiveSegTab` before scrolling.

---

## 4. Side panels / drawers / modals

There are **no side drawers, modals, or right-side panels** on this page.

The only conditionally-mounted overlay-style element is **`BriefingMemo`**, which is an inline card (not a modal — not `role="dialog"`, no focus trap, no scrim). It mounts above `MarginHealthStrip` when `briefingOpen=true`, controlled by the rose CTA in `MarginPageHead`.

Tooltips inside `ClusterMiniRow` (low-n cluster) and `WaterfallCard` (Classification pill, ⚠ low-n badge) are inline `role="tooltip"` spans, not portal'd drawers.

---

## 5. Tests covering this page

| Layer | Location | Count |
|---|---|---|
| **Vitest unit** | `frontend-v2/src/tests/margin-cockpit/*.test.tsx` | 14 tests across 7 files: `LostQuoteDifferential.test.tsx` (1), `MarginHealthStrip.test.tsx` (3), `MarginTabs.test.tsx` (2), `SegmentPane.test.tsx` (1), `WaterfallCard.test.tsx` (3), `page.smoke.test.tsx` (3 — including focus-pulse deep-link), `useMarginCockpit.test.tsx` (1 hook contract test). |
| **Playwright E2E** | `frontend-v2/tests/e2e/` | **None.** The only specs at this commit are `forecasting-actual-entry.spec.ts` and `forecasting-visual.spec.ts`. The margin cockpit has no E2E or visual baselines yet. |
| **Pytest (BFF contract)** | `scherzinger-platform/tests/contract/test_margin_cockpit.py`, `tests/contract/test_screen_schemas.py`, `tests/contract/test_screen_endpoints.py` | BFF-side contract tests for `/screens/margin-cockpit` payload schema. |

---

## 6. Open follow-ups (documented but not yet shipped)

- **Filter pills in `MarginPageHead` are not wired.** They render `data.header.filters` but have no `onClick` and no URL bridge. They should write to `?cluster=` / `?family=` / `?tier=` and re-query `useMarginCockpit` (the hook already accepts those params).
- **Cluster pills in `ClusterMiniRow` are not wired to filter state.** `filterToast` copy is present but only surfaces inside the low-n tooltip; clicking a pill does nothing.
- **Erosion pane cycle CTA is a stub.** `panes/ErosionPane.tsx:24` — `/* no-op — Phase 7 wires real action */`. The button still renders the rose primary style, so visually it looks active.
- **`?focus=cross` deep-link is silently inert.** `cross` is in `FOCUS_TARGETS` but no `#block-cross` wrapper exists; the `cross` tab lives inside `MarginTabs` (`#marginTabsBlock`). Either drop `cross` from the allowlist or wire it to also activate the cross tab + scroll to `#marginTabsBlock`.
- **MarginCockpitSkeleton is page-level only.** `MarginCockpitSkeleton.tsx:6` — "Per-block skeletons (briefing memo, tabs) are a Phase 14 enhancement tied to streaming SSR."
- **`MarginPageHead` CTAs ("Branded PDF", "Export to deck") have no handlers.** Same for `BriefingMemo`'s Copy / Email to Till / Branded PDF row.
- **`BriefingMemo` body is `contentEditable` with no persistence.** Edits live in the DOM until the next render and are lost on close.
- **Heavy reliance on `dangerouslySetInnerHTML` for trust-bearing copy** (briefing paragraphs, shifted rows, health-strip sub/benchmark, waterfall source, lost-quote interpretation/source, cost-vs-price sub/breakdown, segment story/caveat, erosion cycleNote, all tab footer text). BFF payload must be the only writer; any LLM-facing surface needs sanitization.
- **No tab/sub-tab persistence.** `activeTab` and `activeSegTab` are `useState` — refreshing the page or deep-linking from another screen always lands on `cross` + `family`.
- **No E2E / Playwright visual baseline** for this page yet (forecasting has both).

---

## 7. Quick file map

```
frontend-v2/src/features/margin-cockpit/
├── index.tsx                              ← page shell, deep-link focus, tab state
└── components/
    ├── MarginPageHead.tsx                 ← crumb · title · sub-pills · filters · briefing/PDF/deck CTAs
    ├── BriefingMemo.tsx                   ← conditional editable memo card
    ├── MarginHealthStrip.tsx              ← 4-cell KPI strip (score ring + 3 stat cells)
    ├── ClusterMiniRow.tsx                 ← per-cluster pills with low-n tooltip
    ├── ShiftedStrip.tsx                   ← "what shifted MoM" rows with tab/route jumps
    ├── WaterfallCard.tsx                  ← recharts waterfall + bucket list + classification/low-n pills
    ├── MovableLockedOverlay.tsx           ← sub-component of WaterfallCard — movable/locked split bar
    ├── LostQuoteDifferential.tsx          ← won/lost/diff tiles + interpretation
    ├── CostVsPriceCard.tsx                ← 24-pt cost/price line + pass-through + recovery spark
    ├── MarginTabs.tsx                     ← 5-tab container (cross/leak/seg/erode/cust)
    ├── CrossLinks.tsx                     ← footer cross-link row
    ├── MarginCockpitSkeleton.tsx          ← page-level loading skeleton
    └── panes/
        ├── CrossCustomerPane.tsx          ← cross-customer spread table
        ├── SkuLeakagePane.tsx             ← SKU leakage table with A/B status
        ├── SegmentPane.tsx                ← family/tier/size/region sub-tabs + table
        ├── ErosionPane.tsx                ← list-price erosion table (cycle CTA is stub)
        └── CustomerTrendPane.tsx          ← customer YTD trend + status pills

frontend-v2/src/data/api/
└── useMarginCockpit.ts                    ← GET /screens/margin-cockpit (staleTime 60s)

frontend-v2/src/types/index.ts             ← MarginCockpitData & every sub-type (lines 347–592)
frontend-v2/src/lib/api/queryKeys.ts       ← MarginCockpitParams + qk.marginCockpit (lines 28–34, 76–78)
frontend-v2/src/app/router.tsx             ← lazy import + /margin route binding

frontend-v2/src/tests/margin-cockpit/
├── LostQuoteDifferential.test.tsx
├── MarginHealthStrip.test.tsx
├── MarginTabs.test.tsx
├── SegmentPane.test.tsx
├── WaterfallCard.test.tsx
├── page.smoke.test.tsx
└── useMarginCockpit.test.tsx

scherzinger-platform/backend/
├── api/v1/screens.py:155                  ← @router.get("/margin-cockpit")
├── schemas/screens/margin_cockpit.py      ← pydantic response model
└── services/margin_cockpit/composer.py    ← payload composer
```
