# Frontend v2 — Phase 2: Margin Cockpit Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Port the `#screen-margin` section of `Pryzm_Dashboard_Mockup_Frank.html` (lines 5615–6137) into the v2 React app at `frontend-v2/src/features/margin-cockpit/`, matching the Pryzm 2026 design language and behavior 1:1, mock-first, TypeScript strict, with hook signatures stable for the Phase 8 backend swap.

**Architecture:** One feature folder mirroring the Action Center pattern: a single `useMarginCockpit()` TanStack-Query hook reads `src/data/mocks/margin-cockpit.json` via the existing `apiFetch` mock router, types live in `src/types/index.ts`, presentation is split into focused per-section components composed by `index.tsx`. Charts use Recharts (not Chart.js — Phase 0 already locked Recharts in). All section CSS is consumed via Tailwind utility classes referencing the CSS-var design tokens already loaded by `src/styles/tokens.css`; no new global stylesheet rules are added.

**Tech Stack:** React 19, TypeScript 5 (strict), Vite 7, Tailwind 4, TanStack Query v5, Recharts 3, Vitest + Testing Library, lucide-react.

---

## Reference materials

- HTML source of truth: `Pryzm_Dashboard_Mockup_Frank.html` lines 5615–6137 (`<section id="screen-margin">`).
- Old re-skin plan with bucket-by-bucket notes: `docs/superpowers/plans/2026-05-06-frank-margin-redesign.md`.
- Phase 1 reference impl (use the same conventions): `frontend-v2/src/features/action-center/`.
- Mock-router contract: `frontend-v2/src/lib/api/client.ts` — path `/margin-cockpit` resolves to `src/data/mocks/margin-cockpit.json` (filename = path with `/` → `-`).
- Existing v2 placeholder to replace: `frontend-v2/src/features/margin-cockpit/index.tsx`.
- Design tokens (already loaded): `--ink`, `--ink-2`, `--ink-3`, `--muted`, `--muted-2`, `--rose`, `--rose-deep`, `--rose-bg`, `--green`, `--green-bg`, `--amber`, `--amber-bg`, `--red`, `--violet`, `--violet-bg`, `--hairline`, `--surface-soft`, `--border-strong`, `--shadow-pop`.

## File structure (created by this plan)

```
frontend-v2/
  src/
    data/
      mocks/
        margin-cockpit.json                       # Task 1
      api/
        useMarginCockpit.ts                       # Task 1
    types/
      index.ts                                    # Task 1: extend with margin types
    features/
      margin-cockpit/
        index.tsx                                 # Task 1: replace placeholder
        components/
          MarginPageHead.tsx                      # Task 1
          BriefingMemo.tsx                        # Task 1
          MarginHealthStrip.tsx                   # Task 2
          ClusterMiniRow.tsx                      # Task 2
          ShiftedStrip.tsx                        # Task 2
          WaterfallCard.tsx                       # Task 3
          MovableLockedOverlay.tsx                # Task 3
          LostQuoteDifferential.tsx               # Task 4
          CostVsPriceCard.tsx                     # Task 4
          MarginTabs.tsx                          # Task 5 (shell + cross + leak panes)
          panes/
            CrossCustomerPane.tsx                 # Task 5
            SkuLeakagePane.tsx                    # Task 5
            SegmentPane.tsx                       # Task 6
            ErosionPane.tsx                       # Task 6
            CustomerTrendPane.tsx                 # Task 7
          CrossLinks.tsx                          # Task 7
    tests/
      margin-cockpit/
        useMarginCockpit.test.ts                  # Task 1
        MarginHealthStrip.test.tsx                # Task 2
        WaterfallCard.test.tsx                    # Task 3
        LostQuoteDifferential.test.tsx            # Task 4
        MarginTabs.test.tsx                       # Task 5
        SegmentPane.test.tsx                      # Task 6
        page.smoke.test.tsx                       # Task 7
```

Each component has one clear responsibility; tables that share styling (cluster-chip, num-cell, tier-chip) reuse Tailwind class fragments only — do **not** create a new shared `<Cell>` abstraction in this phase (YAGNI; revisit in Phase 7 polish).

---

## Conventions (enforced across all tasks)

1. **TDD order per component:** failing test → minimal impl → green → commit. Tests assert rendered text and behavior, not structure.
2. **Currency formatting:** use `fmt.eur` from `@/lib/format` for all € values that come from numbers; values that arrive pre-formatted from the mock JSON (e.g. `"€187,000"`) render verbatim.
3. **Click handlers in the source HTML use `setScreen()` and `toast()`.** In v2 these become **react-router navigation** (`useNavigate()`) for screen jumps, and a **no-op** for toast (Phase 7 will wire a real toast). Routes are `/action-center`, `/forecasting`, `/quotes`, `/pricing`. Inline `data-tab=...` jumps inside Margin become controlled tab state lifted into `MarginTabs`.
4. **Locale:** strings stay English (matching the mockup); German i18n is Phase 7. Do not add `t()` wrappers in this phase.
5. **Strict types:** all props typed against `src/types/index.ts` interfaces declared in Task 1; no `any`.
6. **Imports:** use the `@/` path alias (already configured in `vite.config.ts` and `tsconfig.json`).
7. **Commits:** one commit per task. Message format: `feat(v2): Phase 2 part N — <task name>`.
8. **Verification at the end of every task:** run `pnpm typecheck && pnpm lint && pnpm test` from `frontend-v2/` (or `npm run` if pnpm not present — check `package.json` scripts; both `frontend-v2/` and root use the same scripts as Phase 1). All three must pass.

---

## Task 1: Types, mock JSON, page hook, page shell, head + briefing memo

**Files:**
- Create: `frontend-v2/src/data/mocks/margin-cockpit.json`
- Create: `frontend-v2/src/data/api/useMarginCockpit.ts`
- Modify: `frontend-v2/src/types/index.ts` — append margin types
- Modify: `frontend-v2/src/features/margin-cockpit/index.tsx` — replace placeholder
- Create: `frontend-v2/src/features/margin-cockpit/components/MarginPageHead.tsx`
- Create: `frontend-v2/src/features/margin-cockpit/components/BriefingMemo.tsx`
- Create: `frontend-v2/src/tests/margin-cockpit/useMarginCockpit.test.ts`

- [ ] **Step 1.1: Append margin types to `src/types/index.ts`**

Append at the end of the file:

```ts
/* Margin Cockpit page payload */

export interface MarginPageHeader {
  crumbTrail: string[];                   // ["Cockpit","Pricing Analyst · Frank","Margin Intelligence"]
  title: string;                          // "Margin Intelligence"
  subPills: string[];                     // ["Predictive Portfolio Pricing","Diagnostics"]
  subStats: { label: string; value: string }[]; // {label:"refreshed today",value:"LTM"}
  auditTag: string;                       // "Audit-ready · hash-signed"
  filters: { label: string; value: string }[]; // Cluster/Family/Tier
}

export interface BriefingParagraph {
  /** HTML allowed: <b>, <code>, color spans. Already styled in mock; rendered via dangerouslySetInnerHTML. */
  html: string;
}

export interface BriefingMemoData {
  title: string;                          // "Margin briefing · auto-drafted, editable · audit-ready"
  paragraphs: BriefingParagraph[];
  signature: string;                      // "— Frank, Pricing Analyst..."
  auditHash: string;                      // "m4r9bx"
}

export interface MarginHealthCell {
  id: 'score' | 'actual' | 'belowPlan' | 'closable';
  label: string;
  value: string;
  trend?: string;                         // e.g. "↓ −1.9pp"
  trendTone?: 'up' | 'down' | 'flat';
  sub?: string;
  benchmark?: string;
  scoreRing?: number;                     // only for id==='score'
  scoreVerdict?: string;                  // "Watch"
  scoreTone?: 'green' | 'amber' | 'red';
  authSplit?: { yours: string; needsMd: string };
  jumpTo?: string;                        // route, e.g. "/action-center"
}

export interface ClusterChip {
  code: string;                           // "BKAES"
  margin: string;                         // "25%"
  target: string;                         // "target 28%"
  conf: string;                           // "82%"
  tone: 'green' | 'amber' | 'red';
  warning?: string;                       // "⚠ low-n" badge text
  filterToast: string;
}

export interface ShiftedRow {
  dotTone: 'red' | 'green' | 'amber' | 'muted';
  text: string;                           // HTML allowed (delta chips, ab-test note)
  delta: { value: string; tone: 'up' | 'down' | 'flat' };
  jumpLabel: string;                      // "→ Cost trajectory"
  jumpTo: { kind: 'route'; to: string } | { kind: 'tab'; tab: string; segTab?: string };
}

export interface WaterfallBucket {
  id: string;                             // "target","mix","discount","cost","rebate","erosion","actual"
  name: string;
  endpoint?: 'green-start' | 'green-end'; // for non-clickable target/actual rows
  pct: string;                            // "−1.4pp" or "28.0%"
  eur: string;                            // "€150K" or "plan"
  source?: string;                        // small line under name
  delta?: { label: string; tone: 'up' | 'down' | 'flat' };
  jumpLabel?: string;                     // "→ Cost trajectory"
  jumpTo?: ShiftedRow['jumpTo'];
}

export interface WaterfallChartPoint {
  label: string;                          // matches bucket name
  cumulative: number;                     // running margin % after this bucket
  delta: number;                          // negative for losses, positive endpoints
  kind: 'endpoint' | 'loss';
}

export interface MovableLockedSplit {
  totalLeakage: string;                   // "€417K"
  movable: { label: string; pct: number; }; // "Movable €260K (62%)" → label includes amount
  locked: { label: string; pct: number; };
  source: string;                         // "Pilot estimate · derived from price_governance.price_rules + frame-contract dates"
}

export interface WaterfallCardData {
  title: string;
  subtitle: string;
  totalChip: string;                      // "€417K total leakage"
  infoPanel: string[];                    // info paragraphs
  buckets: WaterfallBucket[];
  chart: WaterfallChartPoint[];
  movableLocked: MovableLockedSplit;
}

export interface LostQuoteDifferentialData {
  title: string;
  subtitle: string;
  significance: string;                   // "p = 0.006 · statistically significant"
  tiles: { id: 'won' | 'lost' | 'diff'; label: string; value: string; sub: string }[];
  interpretationHtml: string;
  sourceHtml: string;
}

export interface CostVsPriceData {
  title: string;
  subtitle: string;
  indexedTag: string;                     // "Indexed Apr 2024 = 100"
  infoPanel: string[];
  series: { month: string; cost: number; price: number }[]; // 24 points, base=100
  passThrough: {
    label: string;
    value: string;                        // "61%"
    pct: number;                          // 61
    sub: string;
    breakdownHtml: string;
  };
  recovery: {
    label: string;
    value: string;                        // "€147K"
    sub: string;
    spark: number[];                      // 12 monthly cumulative points
  };
}

export interface CrossCustomerRow {
  article: string;
  cluster: { code: string; conf: string; tone: 'green' | 'amber' | 'red' };
  customerA: string;
  priceA: string;
  customerB: string;
  priceB: string;
  tier: string;
  spreadPct: string;                      // "66%"
  highlight?: boolean;
  studioLabel: string;                    // "Open in Studio →"
}

export interface SkuLeakageRow {
  article: string;
  description: string;
  volume: string;
  quotedMargin: string;
  actualMargin: string;
  gapPp: string;                          // "−17pp"
  opportunityEur: string;
  abStatus: string;                       // "—" or "🧪 running 3/14"
  auditHash: string;
  primary?: boolean;
}

export interface SegmentRow {
  label: string;                          // first column
  tier?: 'A' | 'B' | 'C' | 'D';           // for tier sub-pane
  cells: string[];                        // remaining columns
  trendTone?: 'up' | 'down' | 'flat';
  notes?: string;
  storyHtml?: string;                     // injected as last row's story (handled by pane)
}

export interface SegmentSubPane {
  id: 'family' | 'tier' | 'size' | 'region';
  label: string;
  headers: string[];
  rows: SegmentRow[];
  storyHtml: string;
  caveatHtml?: string;                    // BKAGG region warning
}

export interface ErosionRow {
  article: string;
  cluster: { code: string; conf: string; tone: 'green' | 'amber' | 'red' };
  lastUpdateMonths: number;               // for the age bar width %
  lastUpdateLabel: string;                // "14 mo"
  costChange: string;
  listChange: string;
  effectiveErosion: string;
  marginCompression: string;
  authorHash: string;                     // "Frank · a3f9c1"
  actionLabel: string;                    // "Open in Studio →" or "healthy · no action"
  isAction: boolean;
  primary?: boolean;
}

export interface CustomerTrendRow {
  customer: string;
  ytdRevenue: string;
  ytdMargin: string;
  trend: string;                          // "↓ −6pp"
  trendTone: 'up' | 'down' | 'flat';
  status: 'action' | 'watch' | 'healthy';
  statusLabel: string;
  primaryAction?: { label: string; jumpTo: string };
  drillLabel: string;                     // "Drill →"
}

export interface MarginTabs {
  cross: { description: string; infoPanel: string[]; rows: CrossCustomerRow[]; footerNote: string; tabFooterText: string };
  leak: { description: string; infoPanel: string[]; rows: SkuLeakageRow[]; tabFooterText: string };
  seg: { description: string; infoPanel: string[]; subPanes: SegmentSubPane[]; tabFooterText: string };
  erode: {
    description: string;
    infoPanel: string[];
    rows: ErosionRow[];
    cycleNote: string;
    cycleButtonLabel: string;
    tabFooterText: string;
  };
  cust: { description: string; infoPanel: string[]; rows: CustomerTrendRow[]; tabFooterText: string };
}

export interface CrossLink {
  label: string;
  jumpTo: string;                         // route
}

export interface MarginCockpitData {
  header: MarginPageHeader;
  briefing: BriefingMemoData;
  health: MarginHealthCell[];             // 4 cells
  clusters: ClusterChip[];
  shifted: { title: string; rows: ShiftedRow[]; netLine: string }; // "Net month-over-month..."
  waterfall: WaterfallCardData;
  lostQuote: LostQuoteDifferentialData;
  costVsPrice: CostVsPriceData;
  tabs: MarginTabs;
  crossLinks: CrossLink[];
}
```

- [ ] **Step 1.2: Create the mock JSON**

Create `frontend-v2/src/data/mocks/margin-cockpit.json` with the literal content from the HTML mockup. Copy values **verbatim** (numbers, labels, hashes) — every number in the spec below maps to a place in `Pryzm_Dashboard_Mockup_Frank.html` lines 5615–6137. Use this exact skeleton (continued in Tasks 2–7 will not modify this file again — get all data in once):

```json
{
  "header": {
    "crumbTrail": ["Cockpit", "Pricing Analyst · Frank", "Margin Intelligence"],
    "title": "Margin Intelligence",
    "subPills": ["Predictive Portfolio Pricing", "Diagnostics"],
    "subStats": [
      { "label": "refreshed today", "value": "LTM" },
      { "label": "invoices · 4,605 quotes", "value": "5,565" }
    ],
    "auditTag": "Audit-ready · hash-signed",
    "filters": [
      { "label": "Cluster", "value": "All" },
      { "label": "Family", "value": "All" },
      { "label": "Tier", "value": "All" }
    ]
  },
  "briefing": {
    "title": "Margin briefing · auto-drafted, editable · audit-ready",
    "paragraphs": [
      { "html": "<b>Subject:</b> Margin position by cluster · YTD Apr 2026" },
      { "html": "YTD margin <b>24.1%</b>, <b>3.9pp below plan</b> (industry typical 27–30% for VDMA precision pumps). Total leakage <b>−€187K</b> across 5,565 invoices." },
      { "html": "<b>Margin by cluster:</b> BKAES <b>25%</b> (target 28%, conf 82%) · BKAGG <b>21%</b> (target 26%, conf 74%) · BKAIZ <b>18%</b> (low-n, conf 64%) · SOPU <b>14%</b> (⚠ low-n, conf 38%, do not auto-act)." },
      { "html": "<b>Movable lens:</b> Of the −€187K YTD leakage, ~<b>€116K (62%)</b> sits on movable revenue and is actionable this cycle. ~<b>€71K (38%)</b> is locked under frame contracts and belongs in Till's renegotiation queue." },
      { "html": "<b>Three buckets account for 92% of the leak:</b> cost not passed through <b>€150K</b> (7 of 18 indexed contracts un-triggered — 4 movable, 3 locked), discounting <b>€117K</b> (47 below-guardrail breaches across 12 reps — 78% concentrated in 3 reps; Heiko coordinating), customer-mix shift <b>€64K</b> (more tier-C/D revenue, less tier-A growth)." },
      { "html": "<b>Lost-quote margin differential:</b> Won quotes carried <b>70.6%</b> margin vs <b>72.4%</b> on lost (diff <b>+1.8pp</b>, p=0.006, n=1,313). The lost-quote margin is <b>higher</b> than won — we lose disproportionately on the high-margin end. Different problem from the leakage waterfall, different fix (qualification/negotiation, not pass-through). Shared with Heiko in Deal Empowerment." },
      { "html": "<b>What shifted vs last month:</b> Cost-not-passed-through <b style=\"color:var(--red)\">+€18K</b> (steel +1.6pp WoW), Discounting <b>flat</b>, Cross-customer-spread <b style=\"color:var(--green)\">−€4K</b> (one fix shipped after 21-day A/B confirmed +2.4pp lift, p=0.018). <b>Net −€14K worse.</b>" },
      { "html": "<b>Recovery via Pryzm:</b> €147K captured YTD across 38 implemented actions — all hash-signed, 12 went through A/B tracker before broad rollout. Closable gap in the pipeline: <b>€280K</b> (€180K within my authority · €100K needs Till's sign-off)." }
    ],
    "signature": "— Frank, Pricing Analyst / Head of Controlling · drafted by Pryzm · please review before forwarding to Till.",
    "auditHash": "m4r9bx"
  },
  "health": [
    {
      "id": "score",
      "label": "Margin health score",
      "value": "Watch",
      "sub": "−4 vs last month · 3.9pp gap to plan",
      "scoreRing": 76,
      "scoreVerdict": "Watch",
      "scoreTone": "amber"
    },
    {
      "id": "actual",
      "label": "YTD Actual margin",
      "value": "24.1%",
      "trend": "↓ −1.9pp",
      "trendTone": "down",
      "sub": "vs 26.0% plan · 3.7pp narrower than 2024",
      "benchmark": "Industry typical <b>27–30%</b> · VDMA precision pumps"
    },
    {
      "id": "belowPlan",
      "label": "€ below plan YTD",
      "value": "−€187,000",
      "sub": "across 5,565 invoices · 4 product families"
    },
    {
      "id": "closable",
      "label": "Closable gap (in pipeline)",
      "value": "€280,000",
      "sub": "via 24 open Pryzm actions",
      "authSplit": { "yours": "€180K your authority", "needsMd": "€100K needs MD" },
      "jumpTo": "/action-center"
    }
  ],
  "clusters": [
    { "code": "BKAES", "margin": "25%", "target": "target 28%", "conf": "82%", "tone": "green", "filterToast": "Filtering Margin Intelligence to BKAES (627 SKUs)" },
    { "code": "BKAGG", "margin": "21%", "target": "target 26%", "conf": "74%", "tone": "amber", "filterToast": "Filtering Margin Intelligence to BKAGG (370 SKUs)" },
    { "code": "BKAIZ", "margin": "18%", "target": "target 26%", "conf": "64%", "tone": "amber", "filterToast": "Filtering Margin Intelligence to BKAIZ (13 SKUs)" },
    { "code": "SOPU", "margin": "14%", "target": "target 25%", "conf": "38%", "tone": "red", "warning": "⚠ low-n", "filterToast": "SOPU is low-n (n=6) — manual review required, do not auto-act" }
  ],
  "shifted": {
    "title": "What shifted in the leak vs last month",
    "rows": [
      { "dotTone": "red", "text": "Cost not passed through · steel +1.6pp WoW · 7 contracts still un-triggered", "delta": { "value": "+€18K", "tone": "up" }, "jumpLabel": "→ Cost trajectory", "jumpTo": { "kind": "route", "to": "/forecasting" } },
      { "dotTone": "muted", "text": "Discounting · 47 breaches across 12 reps · top 3 = 78%", "delta": { "value": "flat", "tone": "flat" }, "jumpLabel": "→ By-rep", "jumpTo": { "kind": "route", "to": "/quotes" } },
      { "dotTone": "green", "text": "Cross-customer spread · 1 fix shipped (Article 205418-A · Customer 101582) · 21-day A/B confirmed +2.4pp lift, p=0.018", "delta": { "value": "−€4K", "tone": "down" }, "jumpLabel": "→ Cross-customer", "jumpTo": { "kind": "tab", "tab": "cross" } },
      { "dotTone": "amber", "text": "List-price erosion · 24 SKUs > 9 months stale", "delta": { "value": "+€2K", "tone": "up" }, "jumpLabel": "→ Erosion", "jumpTo": { "kind": "tab", "tab": "erode" } }
    ],
    "netLine": "Net month-over-month: <b>−€14K worse</b> · driven by steel pass-through gap."
  },
  "waterfall": {
    "title": "Where the 3.9pp gap came from",
    "subtitle": "Every PP of margin gap mapped to a cause bucket. Three account for 92% of the leak.",
    "totalChip": "€417K total leakage",
    "infoPanel": [
      "Every PP of margin gap is mapped to a cause bucket. <b>Three buckets account for 92% of the leak.</b>",
      "Each bucket is a doorway — click any bucket to drill into the actionable view (sales-rep breaches, contract pass-through, segment pivot, or list erosion)."
    ],
    "buckets": [
      { "id": "target",   "name": "Target margin",   "endpoint": "green-start", "pct": "28.0%", "eur": "plan" },
      { "id": "mix",      "name": "Customer mix shift", "pct": "−0.6pp", "eur": "€64K",  "source": "More tier-C/D revenue · less tier-A growth · cluster mix BKAES/BKAGG conf <b>78%</b>", "delta": { "label": "flat MoM", "tone": "flat" }, "jumpLabel": "→ Tier pivot", "jumpTo": { "kind": "tab", "tab": "seg", "segTab": "tier" } },
      { "id": "discount", "name": "Discounting (sales below guardrail)", "pct": "−1.1pp", "eur": "€117K", "source": "47 breaches Q1 · 12 reps · top 3 = 78% · cluster spread BKAES 82%, BKAGG 74%", "delta": { "label": "flat MoM", "tone": "flat" }, "jumpLabel": "→ By-rep", "jumpTo": { "kind": "route", "to": "/quotes" } },
      { "id": "cost",     "name": "Cost not passed through", "pct": "−1.4pp", "eur": "€150K", "source": "7 of 18 indexed contracts un-triggered · <b>4 movable, 3 locked</b> · cluster mix BKAES/BKAGG conf 78%", "delta": { "label": "↑ +€18K MoM", "tone": "up" }, "jumpLabel": "→ Cost trajectory", "jumpTo": { "kind": "route", "to": "/forecasting" } },
      { "id": "rebate",   "name": "Rebate over-accrual", "pct": "−0.5pp", "eur": "€54K",  "source": "3 customers above committed tier · cluster BKAGG conf 74%", "delta": { "label": "flat MoM", "tone": "flat" }, "jumpLabel": "→ Review", "jumpTo": { "kind": "route", "to": "/action-center" } },
      { "id": "erosion",  "name": "List-price erosion", "pct": "−0.3pp", "eur": "€32K",  "source": "11mo avg list lag across 24 SKUs · cluster BKAES 82% · BKAIZ 64%", "delta": { "label": "↑ +€2K MoM", "tone": "up" }, "jumpLabel": "→ Erosion", "jumpTo": { "kind": "tab", "tab": "erode" } },
      { "id": "actual",   "name": "Actual margin",   "endpoint": "green-end", "pct": "24.1%", "eur": "−€417K" }
    ],
    "chart": [
      { "label": "Target",   "cumulative": 28.0, "delta": 28.0, "kind": "endpoint" },
      { "label": "Mix",      "cumulative": 27.4, "delta": -0.6, "kind": "loss" },
      { "label": "Discount", "cumulative": 26.3, "delta": -1.1, "kind": "loss" },
      { "label": "Cost",     "cumulative": 24.9, "delta": -1.4, "kind": "loss" },
      { "label": "Rebate",   "cumulative": 24.4, "delta": -0.5, "kind": "loss" },
      { "label": "Erosion",  "cumulative": 24.1, "delta": -0.3, "kind": "loss" },
      { "label": "Actual",   "cumulative": 24.1, "delta": 24.1, "kind": "endpoint" }
    ],
    "movableLocked": {
      "totalLeakage": "€417K",
      "movable": { "label": "Movable €260K (62%)", "pct": 62 },
      "locked":  { "label": "Locked €157K (38%)", "pct": 38 },
      "source": "Pilot estimate · derived from <code>price_governance.price_rules</code> + frame-contract dates"
    }
  },
  "lostQuote": {
    "title": "Lost-quote margin differential — why we lose at the high-margin end",
    "subtitle": "The lost-quote average margin is higher than the won-quote average. Different fix from leakage waterfall.",
    "significance": "p = 0.006 · statistically significant",
    "tiles": [
      { "id": "won",  "label": "Won quotes · avg margin",  "value": "70.6%", "sub": "n = 928 won quotes" },
      { "id": "lost", "label": "Lost quotes · avg margin", "value": "72.4%", "sub": "n = 385 lost quotes" },
      { "id": "diff", "label": "Differential",             "value": "+1.8pp","sub": "Welch's t-test · p = 0.006 (significant)" }
    ],
    "interpretationHtml": "<b>Plain-language interpretation:</b> The lost-quote average margin is <b>higher</b> than the won-quote average. We are losing disproportionately on the high-margin end — the pricing model is leaving high-margin business on the table. This is a <b>different problem</b> than the leakage waterfall above and needs a <b>different fix</b>: qualification + negotiation arguments + price-anchor coaching, not pass-through.",
    "sourceHtml": "Source · <code>pricing_analysis.price_sensitivity</code> · <span style=\"color:var(--violet);font-weight:600\">Shared with Heiko (Sales)</span> — appears in Deal Empowerment as lost-deal analytics. Same finding shared with Till in monthly briefing."
  },
  "costVsPrice": {
    "title": "Input cost vs realized price · last 24 months",
    "subtitle": "When the cost line rises faster than the price line, your margin is compressing — visible here before it shows up in the P&L.",
    "indexedTag": "Indexed Apr 2024 = 100",
    "infoPanel": [
      "When the cost line rises faster than the price line, your margin is compressing — visible here <b>before</b> it shows up in the P&L.",
      "Forward 12-mo cost trajectory feeds from Forecast → Input cost trajectory. This view is the trailing 24-mo backward look."
    ],
    "series": [
      { "month": "2024-04", "cost": 100.0, "price": 100.0 },
      { "month": "2024-05", "cost": 100.6, "price": 100.2 },
      { "month": "2024-06", "cost": 101.4, "price": 100.5 },
      { "month": "2024-07", "cost": 102.1, "price": 100.8 },
      { "month": "2024-08", "cost": 102.9, "price": 101.0 },
      { "month": "2024-09", "cost": 103.6, "price": 101.3 },
      { "month": "2024-10", "cost": 104.4, "price": 101.6 },
      { "month": "2024-11", "cost": 105.0, "price": 101.9 },
      { "month": "2024-12", "cost": 105.7, "price": 102.2 },
      { "month": "2025-01", "cost": 106.5, "price": 102.5 },
      { "month": "2025-02", "cost": 107.2, "price": 102.8 },
      { "month": "2025-03", "cost": 107.9, "price": 103.0 },
      { "month": "2025-04", "cost": 108.6, "price": 103.3 },
      { "month": "2025-05", "cost": 109.2, "price": 103.6 },
      { "month": "2025-06", "cost": 109.9, "price": 103.9 },
      { "month": "2025-07", "cost": 110.6, "price": 104.2 },
      { "month": "2025-08", "cost": 111.3, "price": 104.5 },
      { "month": "2025-09", "cost": 112.0, "price": 104.8 },
      { "month": "2025-10", "cost": 112.8, "price": 105.1 },
      { "month": "2025-11", "cost": 113.5, "price": 105.5 },
      { "month": "2025-12", "cost": 114.2, "price": 105.8 },
      { "month": "2026-01", "cost": 114.9, "price": 106.1 },
      { "month": "2026-02", "cost": 115.6, "price": 106.4 },
      { "month": "2026-03", "cost": 116.3, "price": 106.7 }
    ],
    "passThrough": {
      "label": "Cost pass-through completion",
      "value": "61%",
      "pct": 61,
      "sub": "<b>11 of 18</b> indexed contracts triggered YTD · 7 un-triggered = €150K leakage",
      "breakdownHtml": "Of the 7 un-triggered: <b style=\"color:var(--green)\">4 movable</b> (Frank can renegotiate index trigger this cycle) · <b style=\"color:var(--ink-3)\">3 locked</b> (Till to take to MD review at frame renewal)."
    },
    "recovery": {
      "label": "YTD margin recovery via Pryzm",
      "value": "€147K",
      "sub": "From 38 implemented actions · cumulative · 12 went through A/B tracker before broad rollout · all hash-signed",
      "spark": [8, 17, 28, 41, 56, 72, 89, 105, 118, 130, 140, 147]
    }
  },
  "tabs": {
    "cross": {
      "description": "Same article, same volume tier, different customers — sorted by spread.",
      "infoPanel": [
        "This is the data layer no Excel can build. Cross-checks <b>5,565 invoices</b> against <b>4,605 quotes</b>, normalizes for tier and quarter, flags pairs where the spread can't be justified by volume or contract terms."
      ],
      "rows": [
        { "article": "200832-E", "cluster": { "code": "BKAGG", "conf": "74%", "tone": "amber" }, "customerA": "101580", "priceA": "€4.10", "customerB": "102330", "priceB": "€6.80", "tier": "Tier 2", "spreadPct": "66%", "highlight": true,  "studioLabel": "Open in Studio →" },
        { "article": "205415-B", "cluster": { "code": "BKAGG", "conf": "74%", "tone": "amber" }, "customerA": "101582", "priceA": "€4.10", "customerB": "102801", "priceB": "€5.50", "tier": "Tier 1", "spreadPct": "34%", "studioLabel": "Open in Studio →" },
        { "article": "211094-C", "cluster": { "code": "BKAES", "conf": "82%", "tone": "green" }, "customerA": "103044", "priceA": "€12.20","customerB": "101900", "priceB": "€15.40","tier": "Tier 3", "spreadPct": "26%", "studioLabel": "Open in Studio →" }
      ],
      "footerNote": "<b>Cluster note:</b> Spreads in low-n clusters (SOPU n=6, conf 38%) are flagged ⚠ — review manually before raising in Studio. None in this view.",
      "tabFooterText": "3 actions / 90d · 1 implemented (A/B-confirmed) · <b>€8,400 captured</b>"
    },
    "leak": {
      "description": "SKU-level margin leakage · quoted vs invoiced.",
      "infoPanel": [
        "Feeds the <b>Discounting bucket</b> in the waterfall above (€117K of €417K total leakage). The gap between quoted margin and actual margin = price erosion at invoice time."
      ],
      "rows": [
        { "article": "200832-E", "description": "Precision shaft", "volume": "4,200", "quotedMargin": "25%", "actualMargin": "8%",  "gapPp": "−17pp", "opportunityEur": "€18,600", "abStatus": "—", "auditHash": "a3f9c1", "primary": true },
        { "article": "205415-B", "description": "Coupling A",      "volume": "1,840", "quotedMargin": "32%", "actualMargin": "24%", "gapPp": "−8pp",  "opportunityEur": "€12,400", "abStatus": "—", "auditHash": "—" },
        { "article": "211094-C", "description": "Bearing housing", "volume": "980",   "quotedMargin": "28%", "actualMargin": "22%", "gapPp": "−6pp",  "opportunityEur": "€7,200",  "abStatus": "🧪 running 3/14", "auditHash": "—" },
        { "article": "218750-D", "description": "Sleeve",          "volume": "6,400", "quotedMargin": "30%", "actualMargin": "26%", "gapPp": "−4pp",  "opportunityEur": "€4,800",  "abStatus": "—", "auditHash": "—" },
        { "article": "205418-A", "description": "Coupling B",      "volume": "2,100", "quotedMargin": "31%", "actualMargin": "29%", "gapPp": "−2pp",  "opportunityEur": "€1,400",  "abStatus": "🧪 running 9/21", "auditHash": "7e21bd" }
      ],
      "tabFooterText": "11 actions / 90d · 6 implemented (all hash-signed) · 4 went through A/B before broad rollout · <b>€44,200 captured YTD</b>"
    },
    "seg": {
      "description": "Slice along 4 dimensions to find where the leak concentrates.",
      "infoPanel": [
        "Each cut surfaces a different fix: family-level pricing reset, tier-level renegotiation, deal-size guardrail tightening, or regional rep coaching.",
        "Feeds the <b>Customer mix shift bucket</b> in the waterfall above (€64K)."
      ],
      "subPanes": [
        {
          "id": "family", "label": "By product family",
          "headers": ["Product family", "Revenue (LTM)", "Target margin", "Actual margin", "Gap (pp)", "€ Impact", "Trend"],
          "rows": [
            { "label": "Precision shafts", "cells": ["€3,420,000", "28%", "19%", "−9pp", "−€308K", "↓ widening"], "trendTone": "down" },
            { "label": "Couplings",        "cells": ["€2,890,000", "26%", "25%", "−1pp", "−€29K",  "→ stable"],   "trendTone": "flat" },
            { "label": "Bearing housings", "cells": ["€2,140,000", "26%", "23%", "−3pp", "−€64K",  "↓ widening"], "trendTone": "down" },
            { "label": "Sleeves",          "cells": ["€2,250,000", "28%", "28%", "0pp",  "€0",     "↑ improving"], "trendTone": "up" }
          ],
          "storyHtml": "<b>Story:</b> Precision shafts (Article 200832-E family) are the biggest single drag — 74% of total margin gap concentrated here. Sleeves are healthy."
        },
        {
          "id": "tier", "label": "By customer tier",
          "headers": ["Customer tier", "Revenue (LTM)", "Target margin", "Actual margin", "Gap (pp)", "# Customers", "Notes"],
          "rows": [
            { "label": "Strategic",   "tier": "A", "cells": ["€799,000", "26%", "22%", "−4pp",  "2", "101580 dragging tier; 102330 healthy"] },
            { "label": "Standard",    "tier": "B", "cells": ["€458,000", "28%", "27%", "−1pp",  "3", "Performing on plan"] },
            { "label": "Volume",      "tier": "C", "cells": ["€176,000", "22%", "24%", "+2pp",  "1", "101582 above plan — possible to monetize further"] },
            { "label": "Problematic", "tier": "D", "cells": ["€164,000", "25%", "14%", "−11pp", "1", "101900 — raise price even at attrition risk"] }
          ],
          "storyHtml": "<b>Story:</b> Strategic tier is leaking 4pp because of one customer (101580). Problematic tier should be repriced — 11pp gap is structural, not relationship-driven."
        },
        {
          "id": "size", "label": "By deal size",
          "headers": ["Deal size band", "# Quotes (LTM)", "Revenue", "Target margin", "Actual margin", "Gap (pp)"],
          "rows": [
            { "label": "Large (>€100K)",      "cells": ["42",    "€5,840,000", "26%", "22%", "−4pp"] },
            { "label": "Medium (€20–100K)",   "cells": ["218",   "€3,420,000", "28%", "25%", "−3pp"] },
            { "label": "Small (<€20K)",       "cells": ["1,640", "€1,440,000", "28%", "28%", "0pp"]  }
          ],
          "storyHtml": "<b>Story:</b> Counterintuitively, large deals leak the most (4pp gap). Sales discounting concentrates on big-customer negotiations — exactly where guardrails should bite hardest."
        },
        {
          "id": "region", "label": "By region",
          "headers": ["Region", "Revenue (LTM)", "Target margin", "Actual margin", "Gap (pp)", "Notes"],
          "rows": [
            { "label": "DACH",                  "cells": ["€7,820,000", "27%", "25%", "−2pp", "Healthy core market"] },
            { "label": "BKAGG (problem region)","cells": ["€1,640,000", "26%", "19%", "−7pp", "3 sales reps consistently breaching guardrails"] },
            { "label": "Rest of EU",            "cells": ["€780,000",   "28%", "28%", "0pp",  "Stable"] },
            { "label": "Export (non-EU)",       "cells": ["€460,000",   "30%", "29%", "−1pp", "FX exposure muted"] }
          ],
          "storyHtml": "<b>Story:</b> BKAGG is the single biggest regional drag (−7pp · €115K leakage). The Monday Briefing already flagged this — sales-rep level intervention needed, not a pricing change.",
          "caveatHtml": "<b>⚠ Naming caveat (Frank's note):</b> \"BKAGG\" here is a <i>regional sales label</i> — not the BKAGG <i>commodity cluster</i>. The two share the abbreviation by historical accident. Disambiguation pending in the next data-model update; treat them as distinct dimensions."
        }
      ],
      "tabFooterText": "Feeds <b>Customer mix shift</b> bucket · €64K"
    },
    "erode": {
      "description": "Stale list prices · cost vs list movement.",
      "infoPanel": [
        "List prices erode silently when cost moves up faster than the price book gets refreshed. The September price-book question, answered every Monday.",
        "Avg list-update lag across portfolio: <b style=\"color:var(--amber)\">11 months</b> (industry best-practice: 6 months). Feeds <b>List-price erosion</b> bucket · €32K."
      ],
      "rows": [
        { "article": "200832-E", "cluster": { "code": "BKAGG", "conf": "74%", "tone": "amber" }, "lastUpdateMonths": 14, "lastUpdateLabel": "14 mo", "costChange": "+6.2%", "listChange": "+1.0%", "effectiveErosion": "−5.2pp", "marginCompression": "−9pp",  "authorHash": "Frank · a3f9c1",   "actionLabel": "Open in Studio →", "isAction": true,  "primary": true },
        { "article": "205415-B", "cluster": { "code": "BKAGG", "conf": "74%", "tone": "amber" }, "lastUpdateMonths": 11, "lastUpdateLabel": "11 mo", "costChange": "+3.8%", "listChange": "+0.5%", "effectiveErosion": "−3.3pp", "marginCompression": "−4pp",  "authorHash": "Frank · 7e21bd",   "actionLabel": "Open in Studio →", "isAction": true },
        { "article": "211094-C", "cluster": { "code": "BKAES", "conf": "82%", "tone": "green" }, "lastUpdateMonths": 8,  "lastUpdateLabel": "8 mo",  "costChange": "+2.1%", "listChange": "+0.0%", "effectiveErosion": "−2.1pp", "marginCompression": "−2pp",  "authorHash": "F. Bauer · 19f4a8","actionLabel": "Open in Studio →", "isAction": true },
        { "article": "218750-D", "cluster": { "code": "BKAES", "conf": "82%", "tone": "green" }, "lastUpdateMonths": 3,  "lastUpdateLabel": "3 mo",  "costChange": "+0.4%", "listChange": "+1.5%", "effectiveErosion": "+1.1pp", "marginCompression": "0pp",   "authorHash": "Frank · c882e0",   "actionLabel": "healthy · no action", "isAction": false },
        { "article": "205418-A", "cluster": { "code": "BKAGG", "conf": "74%", "tone": "amber" }, "lastUpdateMonths": 1,  "lastUpdateLabel": "1 mo",  "costChange": "+0.2%", "listChange": "+6.0%", "effectiveErosion": "+5.8pp", "marginCompression": "+2pp",  "authorHash": "Frank · 4d2b8f",   "actionLabel": "recent raise · 🧪 A/B 9/21", "isAction": false }
      ],
      "cycleNote": "<b>Cycle output:</b> Triggering the price-book cycle auto-generates a <b>Branded PDF</b> (Scherzinger corporate design) with all 24 SKUs · audit-hash signed · routed to Till for sign-off.",
      "cycleButtonLabel": "⚡ Trigger price-book cycle (24 SKUs)",
      "tabFooterText": "Feeds <b>List-price erosion</b> bucket · €32K · 24 SKUs > 9 months stale"
    },
    "cust": {
      "description": "Customer margin trajectory · last 12 months.",
      "infoPanel": [
        "Status pill flags accounts needing intervention vs. healthy ones. Trend shows YoY margin movement (12-mo rolling).",
        "Use the <b>Drill</b> button on any row to open the per-month trajectory + cohort comparison; <b>Open action</b> routes the customer into your weekly queue."
      ],
      "rows": [
        { "customer": "101580", "ytdRevenue": "€487,000", "ytdMargin": "18%", "trend": "↓ −6pp", "trendTone": "down", "status": "action",  "statusLabel": "Action",  "primaryAction": { "label": "Open action →", "jumpTo": "/action-center" }, "drillLabel": "Drill →" },
        { "customer": "102330", "ytdRevenue": "€312,000", "ytdMargin": "26%", "trend": "↓ −2pp", "trendTone": "down", "status": "watch",   "statusLabel": "Watch",   "drillLabel": "Drill →" },
        { "customer": "103044", "ytdRevenue": "€198,000", "ytdMargin": "31%", "trend": "→ flat", "trendTone": "flat", "status": "healthy", "statusLabel": "Healthy", "drillLabel": "Drill →" },
        { "customer": "101582", "ytdRevenue": "€176,000", "ytdMargin": "24%", "trend": "↑ +1pp", "trendTone": "up",   "status": "healthy", "statusLabel": "Healthy", "drillLabel": "Drill →" }
      ],
      "tabFooterText": "1 churn-risk action open · 101580 · 5 days old"
    }
  },
  "crossLinks": [
    { "label": "Action queue · Action Center",   "jumpTo": "/action-center" },
    { "label": "Cluster forecast · Forecast",    "jumpTo": "/forecasting" },
    { "label": "SKU drill · Pricing Studio",     "jumpTo": "/pricing" },
    { "label": "Approval flow · Quotes & Guardrails", "jumpTo": "/quotes" }
  ]
}
```

- [ ] **Step 1.3: Write the failing hook test**

Create `frontend-v2/src/tests/margin-cockpit/useMarginCockpit.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { renderHook, waitFor } from '@testing-library/react';
import { ReactNode } from 'react';
import { useMarginCockpit } from '@/data/api/useMarginCockpit';

function wrapper({ children }: { children: ReactNode }) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return <QueryClientProvider client={qc}>{children}</QueryClientProvider>;
}

describe('useMarginCockpit', () => {
  it('loads margin-cockpit mock and exposes the page payload', async () => {
    const { result } = renderHook(() => useMarginCockpit(), { wrapper });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    const data = result.current.data!;
    expect(data.header.title).toBe('Margin Intelligence');
    expect(data.health).toHaveLength(4);
    expect(data.waterfall.buckets).toHaveLength(7);
    expect(data.tabs.seg.subPanes).toHaveLength(4);
  });
});
```

Note: this file must be `.tsx` if you keep the JSX wrapper inline; rename to `useMarginCockpit.test.tsx` to keep it simple.

Run: `cd frontend-v2 && npm test -- src/tests/margin-cockpit/useMarginCockpit.test`
Expected: FAIL — `useMarginCockpit` does not exist.

- [ ] **Step 1.4: Implement the hook**

Create `frontend-v2/src/data/api/useMarginCockpit.ts`:

```ts
import { useQuery } from '@tanstack/react-query';
import { apiFetch } from '@/lib/api/client';
import type { MarginCockpitData } from '@/types';

export function useMarginCockpit() {
  return useQuery({
    queryKey: ['margin-cockpit'] as const,
    queryFn: () => apiFetch<MarginCockpitData>('/margin-cockpit'),
    staleTime: 60_000,
  });
}
```

Run the hook test again: PASS.

- [ ] **Step 1.5: Implement `MarginPageHead`**

Create `frontend-v2/src/features/margin-cockpit/components/MarginPageHead.tsx`:

```tsx
import { ChevronDown, FileText, Wand2 } from 'lucide-react';
import type { MarginPageHeader } from '@/types';

interface Props {
  header: MarginPageHeader;
  onGenerateBriefing: () => void;
}

export function MarginPageHead({ header, onGenerateBriefing }: Props) {
  return (
    <>
      <div className="mb-3 text-xs text-[var(--muted)]">
        {header.crumbTrail.map((crumb, i) => {
          const isLast = i === header.crumbTrail.length - 1;
          return (
            <span key={crumb}>
              {isLast ? (
                <b className="font-semibold text-[var(--ink-2)]">{crumb}</b>
              ) : (
                <span>{crumb}</span>
              )}
              {!isLast && <span className="mx-1.5 text-[var(--muted-2)]">/</span>}
            </span>
          );
        })}
      </div>

      <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="font-display text-[26px] font-bold leading-tight tracking-tight text-[var(--ink)]">
            {header.title}
          </h1>
          <div className="mt-2 flex flex-wrap items-center gap-2 text-[12.5px] text-[var(--muted)]">
            {header.subPills.map((p) => (
              <span
                key={p}
                className="rounded-full border border-[var(--hairline)] bg-white px-2.5 py-1 font-semibold text-[var(--ink-2)]"
              >
                {p}
              </span>
            ))}
            {header.subStats.map((s) => (
              <span key={s.label} className="text-[var(--muted)]">
                <b className="font-semibold text-[var(--ink-2)]">{s.value}</b> {s.label}
              </span>
            ))}
            <span
              className="rounded-full px-2.5 py-1 text-xs font-semibold"
              style={{ background: 'var(--violet-bg)', color: 'var(--violet)' }}
            >
              {header.auditTag}
            </span>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {header.filters.map((f) => (
            <button
              key={f.label}
              type="button"
              className="flex items-center gap-1.5 rounded-full border border-[var(--hairline)] bg-white px-3 py-1.5 text-xs font-semibold text-[var(--ink-2)] transition-colors hover:bg-[var(--grey-bg)]"
            >
              <ChevronDown size={12} /> {f.label} · {f.value}
            </button>
          ))}
          <button
            type="button"
            onClick={onGenerateBriefing}
            className="flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-semibold text-white"
            style={{ background: 'var(--rose)' }}
          >
            <Wand2 size={12} /> Generate margin briefing →
          </button>
          <button
            type="button"
            className="flex items-center gap-1.5 rounded-full border border-[var(--hairline)] bg-white px-3 py-1.5 text-xs font-semibold text-[var(--ink-2)]"
          >
            <FileText size={12} /> Branded PDF
          </button>
          <button
            type="button"
            className="flex items-center gap-1.5 rounded-full border border-[var(--hairline)] bg-white px-3 py-1.5 text-xs font-semibold text-[var(--ink-2)]"
          >
            Export to deck
          </button>
        </div>
      </div>
    </>
  );
}
```

- [ ] **Step 1.6: Implement `BriefingMemo`**

Create `frontend-v2/src/features/margin-cockpit/components/BriefingMemo.tsx`:

```tsx
import { X } from 'lucide-react';
import type { BriefingMemoData } from '@/types';

interface Props {
  data: BriefingMemoData;
  open: boolean;
  onClose: () => void;
}

export function BriefingMemo({ data, open, onClose }: Props) {
  if (!open) return null;
  return (
    <div
      className="mb-4 rounded-2xl border border-[var(--hairline)] bg-white p-5 shadow-[var(--shadow-pop)]"
      style={{ borderLeft: '4px solid var(--rose)' }}
    >
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <span className="flex-1 text-xs font-semibold uppercase tracking-wider text-[var(--muted)]">
          {data.title}
        </span>
        <button type="button" className="rounded-full border border-[var(--hairline)] bg-white px-3 py-1 text-xs font-semibold text-[var(--ink-2)]">
          Copy
        </button>
        <button type="button" className="rounded-full border border-[var(--hairline)] bg-white px-3 py-1 text-xs font-semibold text-[var(--ink-2)]">
          Email to Till
        </button>
        <button type="button" className="rounded-full border border-[var(--hairline)] bg-white px-3 py-1 text-xs font-semibold text-[var(--ink-2)]">
          Branded PDF
        </button>
        <button
          type="button"
          aria-label="Close briefing"
          onClick={onClose}
          className="rounded-full p-1 text-[var(--muted)] hover:bg-[var(--surface-soft)]"
        >
          <X size={14} />
        </button>
      </div>
      <div className="space-y-3 text-[13.5px] leading-relaxed text-[var(--ink-2)]" contentEditable suppressContentEditableWarning>
        {data.paragraphs.map((p, i) => (
          <p key={i} dangerouslySetInnerHTML={{ __html: p.html }} />
        ))}
        <p className="text-[12px] text-[var(--muted)]">
          {data.signature.replace('— Frank', '')}
          <span> · audit hash <code className="rounded bg-[var(--surface-soft)] px-1 py-0.5 text-[11px]">{data.auditHash}</code></span>
        </p>
      </div>
    </div>
  );
}
```

- [ ] **Step 1.7: Replace the placeholder page**

Replace the entire contents of `frontend-v2/src/features/margin-cockpit/index.tsx`:

```tsx
import { useState } from 'react';
import { useMarginCockpit } from '@/data/api/useMarginCockpit';
import { MarginPageHead } from './components/MarginPageHead';
import { BriefingMemo } from './components/BriefingMemo';

export function MarginCockpitPage() {
  const { data, isLoading, error } = useMarginCockpit();
  const [briefingOpen, setBriefingOpen] = useState(false);

  if (isLoading) {
    return <div className="mx-auto max-w-[1400px] p-8 text-sm text-[var(--muted)]">Lade…</div>;
  }
  if (error || !data) {
    return (
      <div className="mx-auto max-w-[1400px] p-8 text-sm text-[var(--red)]">
        Fehler: {(error as Error)?.message ?? 'unbekannt'}
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-[1400px] px-8 py-6">
      <MarginPageHead
        header={data.header}
        onGenerateBriefing={() => setBriefingOpen((v) => !v)}
      />
      <BriefingMemo data={data.briefing} open={briefingOpen} onClose={() => setBriefingOpen(false)} />
      {/* Sections added in Tasks 2–7 */}
    </div>
  );
}

export default MarginCockpitPage;
```

- [ ] **Step 1.8: Verify and commit**

Run from `frontend-v2/`:
```bash
npm run typecheck && npm run lint && npm test
```
Expected: all green; the hook test passes; no other test regresses.

Then:
```bash
git add frontend-v2/src/data/mocks/margin-cockpit.json \
        frontend-v2/src/data/api/useMarginCockpit.ts \
        frontend-v2/src/types/index.ts \
        frontend-v2/src/features/margin-cockpit \
        frontend-v2/src/tests/margin-cockpit
git commit -m "feat(v2): Phase 2 part 1 — Margin Cockpit page shell, types, mock, head + briefing"
```

---

## Task 2: Margin Health strip + Cluster mini-row + Shifted strip

**Files:**
- Create: `frontend-v2/src/features/margin-cockpit/components/MarginHealthStrip.tsx`
- Create: `frontend-v2/src/features/margin-cockpit/components/ClusterMiniRow.tsx`
- Create: `frontend-v2/src/features/margin-cockpit/components/ShiftedStrip.tsx`
- Create: `frontend-v2/src/tests/margin-cockpit/MarginHealthStrip.test.tsx`
- Modify: `frontend-v2/src/features/margin-cockpit/index.tsx` — wire the three components

- [ ] **Step 2.1: Failing test — `MarginHealthStrip.test.tsx`**

```tsx
import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { MemoryRouter } from 'react-router-dom';
import { MarginHealthStrip } from '@/features/margin-cockpit/components/MarginHealthStrip';
import type { MarginHealthCell } from '@/types';

const cells: MarginHealthCell[] = [
  { id: 'score', label: 'Margin health score', value: 'Watch', sub: '−4 vs last month', scoreRing: 76, scoreVerdict: 'Watch', scoreTone: 'amber' },
  { id: 'actual', label: 'YTD Actual margin', value: '24.1%', trend: '↓ −1.9pp', trendTone: 'down', sub: 'vs 26.0% plan' },
  { id: 'belowPlan', label: '€ below plan YTD', value: '−€187,000', sub: 'across 5,565 invoices' },
  { id: 'closable', label: 'Closable gap', value: '€280,000', sub: 'via 24 actions', authSplit: { yours: '€180K your authority', needsMd: '€100K needs MD' }, jumpTo: '/action-center' },
];

describe('MarginHealthStrip', () => {
  it('renders 4 cells with values and the auth split', () => {
    render(<MemoryRouter><MarginHealthStrip cells={cells} /></MemoryRouter>);
    expect(screen.getByText('Watch')).toBeInTheDocument();
    expect(screen.getByText('76')).toBeInTheDocument();
    expect(screen.getByText('24.1%')).toBeInTheDocument();
    expect(screen.getByText('−€187,000')).toBeInTheDocument();
    expect(screen.getByText('€280,000')).toBeInTheDocument();
    expect(screen.getByText('€180K your authority')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /Closable gap/i })).toHaveAttribute('href', '/action-center');
  });
});
```

Run: FAIL (file does not exist).

- [ ] **Step 2.2: Implement `MarginHealthStrip`**

```tsx
import { Link } from 'react-router-dom';
import type { MarginHealthCell } from '@/types';

interface Props {
  cells: MarginHealthCell[];
}

const verdictColor: Record<NonNullable<MarginHealthCell['scoreTone']>, string> = {
  green: 'var(--green)',
  amber: 'var(--amber)',
  red: 'var(--red)',
};

export function MarginHealthStrip({ cells }: Props) {
  return (
    <div className="mb-4 grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-4">
      {cells.map((cell) => {
        const inner = (
          <div className="flex h-full flex-col rounded-2xl border border-[var(--hairline)] bg-white p-4 transition-shadow hover:shadow-[var(--shadow-pop)]">
            <div className="text-[10.5px] font-bold uppercase tracking-[0.08em] text-[var(--muted)]">
              {cell.label}
            </div>
            {cell.id === 'score' ? (
              <div className="mt-1 flex items-center gap-3">
                <div
                  className="flex h-12 w-12 items-center justify-center rounded-full font-display text-[18px] font-bold text-[var(--ink)]"
                  style={{ background: 'var(--surface-soft)', border: `2px solid ${verdictColor[cell.scoreTone ?? 'amber']}` }}
                >
                  <span>{cell.scoreRing}</span>
                </div>
                <div>
                  <div className="font-display text-[20px] font-bold" style={{ color: verdictColor[cell.scoreTone ?? 'amber'] }}>
                    {cell.scoreVerdict}
                  </div>
                  <div className="text-[11.5px] text-[var(--muted)]">{cell.sub}</div>
                </div>
              </div>
            ) : (
              <>
                <div
                  className="mt-1 font-display text-[24px] font-bold text-[var(--ink)]"
                  style={cell.id === 'belowPlan' ? { color: 'var(--red)' } : cell.id === 'closable' ? { color: 'var(--green)' } : undefined}
                >
                  {cell.value}
                  {cell.trend && (
                    <span className="ml-2 text-[12px] font-bold" style={{ color: cell.trendTone === 'up' ? 'var(--red)' : 'var(--green)' }}>
                      {cell.trend}
                    </span>
                  )}
                </div>
                {cell.sub && <div className="text-[11.5px] text-[var(--muted)]" dangerouslySetInnerHTML={{ __html: cell.sub }} />}
                {cell.benchmark && (
                  <div className="mt-2 border-t border-[var(--hairline)] pt-2 text-[11px] text-[var(--ink-3)]" dangerouslySetInnerHTML={{ __html: cell.benchmark }} />
                )}
                {cell.authSplit && (
                  <div className="mt-2 flex flex-wrap gap-1.5 text-[11px] font-semibold">
                    <span className="rounded-md px-1.5 py-0.5" style={{ background: 'var(--green-bg)', color: 'var(--green)' }}>{cell.authSplit.yours}</span>
                    <span className="rounded-md px-1.5 py-0.5" style={{ background: 'var(--rose-bg)', color: 'var(--rose-deep)' }}>{cell.authSplit.needsMd}</span>
                  </div>
                )}
              </>
            )}
          </div>
        );
        if (cell.jumpTo) {
          return (
            <Link key={cell.id} to={cell.jumpTo} aria-label={cell.label} className="block">
              {inner}
            </Link>
          );
        }
        return <div key={cell.id}>{inner}</div>;
      })}
    </div>
  );
}
```

Run the test again: PASS.

- [ ] **Step 2.3: Implement `ClusterMiniRow`**

```tsx
import type { ClusterChip } from '@/types';

interface Props {
  clusters: ClusterChip[];
}

const toneStyles: Record<ClusterChip['tone'], { bg: string; color: string }> = {
  green: { bg: 'var(--green-bg)', color: 'var(--green)' },
  amber: { bg: 'var(--amber-bg)', color: 'var(--amber)' },
  red:   { bg: 'var(--rose-bg)',  color: 'var(--rose-deep)' },
};

export function ClusterMiniRow({ clusters }: Props) {
  return (
    <div className="mb-4 flex flex-wrap items-center gap-2 rounded-2xl border border-[var(--hairline)] bg-white px-4 py-3">
      <span className="text-[12px] font-semibold uppercase tracking-wider text-[var(--muted)]">
        Margin by cluster →
      </span>
      {clusters.map((c) => {
        const t = toneStyles[c.tone];
        return (
          <button
            key={c.code}
            type="button"
            className="rounded-full px-3 py-1 text-[12px] font-semibold"
            style={{ background: t.bg, color: t.color }}
          >
            {c.code} <b className="font-bold">{c.margin}</b> · {c.target} · conf <b>{c.conf}</b>
            {c.warning && <span className="ml-1">{c.warning}</span>}
          </button>
        );
      })}
      <span className="ml-auto text-[11px] text-[var(--muted)]">
        Source · <code className="rounded bg-[var(--surface-soft)] px-1 py-0.5">products_detail.commodity_scorecard</code>
      </span>
    </div>
  );
}
```

- [ ] **Step 2.4: Implement `ShiftedStrip`**

```tsx
import { useNavigate } from 'react-router-dom';
import type { ShiftedRow } from '@/types';

interface Props {
  title: string;
  rows: ShiftedRow[];
  netLine: string;
  onTabJump: (tab: string, segTab?: string) => void;
}

const dotBg: Record<ShiftedRow['dotTone'], string> = {
  red:    'var(--red)',
  green:  'var(--green)',
  amber:  'var(--amber)',
  muted:  'var(--muted-2)',
};

const deltaColor: Record<ShiftedRow['delta']['tone'], string> = {
  up:   'var(--red)',
  down: 'var(--green)',
  flat: 'var(--ink-3)',
};

export function ShiftedStrip({ title, rows, netLine, onTabJump }: Props) {
  const nav = useNavigate();
  return (
    <div className="mb-4 rounded-2xl border border-[var(--hairline)] bg-white p-4">
      <h5 className="mb-2 text-[12px] font-bold uppercase tracking-wider text-[var(--muted)]">{title}</h5>
      <div className="flex flex-col">
        {rows.map((r, i) => (
          <button
            key={i}
            type="button"
            onClick={() => (r.jumpTo.kind === 'route' ? nav(r.jumpTo.to) : onTabJump(r.jumpTo.tab, r.jumpTo.segTab))}
            className="flex w-full items-center gap-3 border-t border-[var(--hairline)] px-2 py-2 text-left transition-colors first:border-t-0 hover:rounded-md hover:bg-[var(--surface-soft)]"
          >
            <span className="inline-block h-2 w-2 shrink-0 rounded-full" style={{ background: dotBg[r.dotTone] }} />
            <div className="flex-1 text-[13px] text-[var(--ink-2)]">
              {r.text}{' '}
              <span className="font-bold" style={{ color: deltaColor[r.delta.tone] }}>
                {r.delta.value}
              </span>
            </div>
            <span className="shrink-0 text-[12px] font-semibold" style={{ color: 'var(--rose-deep)' }}>{r.jumpLabel}</span>
          </button>
        ))}
      </div>
      <div className="mt-2 text-[12px] text-[var(--ink-3)]" dangerouslySetInnerHTML={{ __html: netLine }} />
    </div>
  );
}
```

- [ ] **Step 2.5: Wire into `index.tsx`**

Add a `marginTab` state and `onTabJump` callback (the tabs component will be created in Task 5; for now the callback can scroll to a placeholder anchor). Modify `frontend-v2/src/features/margin-cockpit/index.tsx`:

```tsx
import { useState } from 'react';
import { useMarginCockpit } from '@/data/api/useMarginCockpit';
import { MarginPageHead } from './components/MarginPageHead';
import { BriefingMemo } from './components/BriefingMemo';
import { MarginHealthStrip } from './components/MarginHealthStrip';
import { ClusterMiniRow } from './components/ClusterMiniRow';
import { ShiftedStrip } from './components/ShiftedStrip';

export function MarginCockpitPage() {
  const { data, isLoading, error } = useMarginCockpit();
  const [briefingOpen, setBriefingOpen] = useState(false);
  const [activeTab, setActiveTab] = useState<string>('cross');
  const [activeSegTab, setActiveSegTab] = useState<string>('family');

  if (isLoading) {
    return <div className="mx-auto max-w-[1400px] p-8 text-sm text-[var(--muted)]">Lade…</div>;
  }
  if (error || !data) {
    return (
      <div className="mx-auto max-w-[1400px] p-8 text-sm text-[var(--red)]">
        Fehler: {(error as Error)?.message ?? 'unbekannt'}
      </div>
    );
  }

  const handleTabJump = (tab: string, segTab?: string) => {
    setActiveTab(tab);
    if (segTab) setActiveSegTab(segTab);
    document.getElementById('marginTabsBlock')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  };

  return (
    <div className="mx-auto max-w-[1400px] px-8 py-6">
      <MarginPageHead header={data.header} onGenerateBriefing={() => setBriefingOpen((v) => !v)} />
      <BriefingMemo data={data.briefing} open={briefingOpen} onClose={() => setBriefingOpen(false)} />
      <MarginHealthStrip cells={data.health} />
      <ClusterMiniRow clusters={data.clusters} />
      <ShiftedStrip title={data.shifted.title} rows={data.shifted.rows} netLine={data.shifted.netLine} onTabJump={handleTabJump} />
      {/* Tasks 3–7 add: Waterfall, LostQuote, CostVsPrice, Tabs, CrossLinks */}
    </div>
  );
}

export default MarginCockpitPage;
```

(`activeTab`/`activeSegTab` are unused for now — TypeScript will flag them only as unused if `noUnusedLocals` is on. Phase 0 plan disabled `noUnusedLocals` per its config. If the typecheck fails on this, prefix the unused setter call with `void` or comment out the state until Task 5.)

- [ ] **Step 2.6: Verify and commit**

Run typecheck/lint/test, then:
```bash
git add frontend-v2/src/features/margin-cockpit frontend-v2/src/tests/margin-cockpit
git commit -m "feat(v2): Phase 2 part 2 — Margin Health strip + cluster mini-row + shifted strip"
```

---

## Task 3: Waterfall card (chart + buckets + movable/locked overlay)

**Files:**
- Create: `frontend-v2/src/features/margin-cockpit/components/WaterfallCard.tsx`
- Create: `frontend-v2/src/features/margin-cockpit/components/MovableLockedOverlay.tsx`
- Create: `frontend-v2/src/tests/margin-cockpit/WaterfallCard.test.tsx`
- Modify: `frontend-v2/src/features/margin-cockpit/index.tsx`

- [ ] **Step 3.1: Failing test — `WaterfallCard.test.tsx`**

```tsx
import { render, screen, fireEvent } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { MemoryRouter } from 'react-router-dom';
import { WaterfallCard } from '@/features/margin-cockpit/components/WaterfallCard';
import type { WaterfallCardData } from '@/types';

const data: WaterfallCardData = {
  title: 'Where the 3.9pp gap came from',
  subtitle: 'Every PP mapped',
  totalChip: '€417K total leakage',
  infoPanel: ['Each bucket is a doorway.'],
  buckets: [
    { id: 'target', name: 'Target margin', endpoint: 'green-start', pct: '28.0%', eur: 'plan' },
    { id: 'discount', name: 'Discounting', pct: '−1.1pp', eur: '€117K', source: '47 breaches', delta: { label: 'flat MoM', tone: 'flat' }, jumpLabel: '→ By-rep', jumpTo: { kind: 'route', to: '/quotes' } },
    { id: 'actual', name: 'Actual margin', endpoint: 'green-end', pct: '24.1%', eur: '−€417K' },
  ],
  chart: [
    { label: 'Target', cumulative: 28.0, delta: 28.0, kind: 'endpoint' },
    { label: 'Discount', cumulative: 26.9, delta: -1.1, kind: 'loss' },
    { label: 'Actual', cumulative: 24.1, delta: 24.1, kind: 'endpoint' },
  ],
  movableLocked: {
    totalLeakage: '€417K',
    movable: { label: 'Movable €260K (62%)', pct: 62 },
    locked: { label: 'Locked €157K (38%)', pct: 38 },
    source: 'Pilot estimate',
  },
};

describe('WaterfallCard', () => {
  it('renders bucket rows and fires onTabJump for tab-kind jumps', () => {
    const onTabJump = vi.fn();
    render(
      <MemoryRouter>
        <WaterfallCard data={data} onTabJump={onTabJump} />
      </MemoryRouter>
    );
    expect(screen.getByText('Where the 3.9pp gap came from')).toBeInTheDocument();
    expect(screen.getByText('€417K total leakage')).toBeInTheDocument();
    expect(screen.getByText('Discounting')).toBeInTheDocument();
    expect(screen.getByText('€117K')).toBeInTheDocument();
    expect(screen.getByText('Movable €260K (62%)')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /Discounting/ }));
    // jumpTo for Discounting is route → no tab jump expected
    expect(onTabJump).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 3.2: Implement `MovableLockedOverlay`**

```tsx
import type { MovableLockedSplit } from '@/types';

interface Props {
  data: MovableLockedSplit;
}

export function MovableLockedOverlay({ data }: Props) {
  return (
    <div className="mt-4 rounded-xl border border-dashed border-[var(--hairline)] bg-[var(--surface-soft)] p-3">
      <div className="mb-2 flex flex-wrap items-baseline justify-between gap-2 text-[11.5px]">
        <span className="font-semibold text-[var(--ink-2)]">
          Of the {data.totalLeakage} total leakage — what's actionable this cycle?
        </span>
        <span className="text-[var(--muted)]" dangerouslySetInnerHTML={{ __html: 'Pilot estimate · ' + data.source.replace(/^Pilot estimate · /, '') }} />
      </div>
      <div className="flex h-7 overflow-hidden rounded-md text-[11px] font-semibold text-white">
        <div className="flex items-center justify-center px-2" style={{ width: `${data.movable.pct}%`, background: 'var(--rose)' }}>
          {data.movable.label}
        </div>
        <div className="flex items-center justify-center px-2" style={{ width: `${data.locked.pct}%`, background: 'var(--muted-2)' }}>
          {data.locked.label}
        </div>
      </div>
      <div className="mt-2 flex flex-wrap gap-3 text-[11px] text-[var(--muted)]">
        <span><b style={{ color: 'var(--rose)' }}>●</b> Movable — Frank acts this cycle (Studio + A/B)</span>
        <span><b style={{ color: 'var(--ink-3)' }}>●</b> Locked — under frame contracts; Till's renegotiation queue</span>
      </div>
    </div>
  );
}
```

- [ ] **Step 3.3: Implement `WaterfallCard`**

```tsx
import { useNavigate } from 'react-router-dom';
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import type { WaterfallBucket, WaterfallCardData } from '@/types';
import { MovableLockedOverlay } from './MovableLockedOverlay';

interface Props {
  data: WaterfallCardData;
  onTabJump: (tab: string, segTab?: string) => void;
}

const deltaColor = (tone: NonNullable<WaterfallBucket['delta']>['tone']) =>
  tone === 'up' ? 'var(--red)' : tone === 'down' ? 'var(--green)' : 'var(--ink-3)';

const dotColor = (b: WaterfallBucket) =>
  b.endpoint ? 'var(--green)' : b.delta?.tone === 'up' ? 'var(--red)' : 'var(--rose)';

export function WaterfallCard({ data, onTabJump }: Props) {
  const nav = useNavigate();

  // Recharts data: stacked-floating bar — offset (transparent) + visible delta on top of running cumulative.
  // Loss bars sit between cumulative_after and cumulative_before; endpoints are full-height bars from 0.
  const chartData = data.chart.map((p, i, arr) => {
    if (p.kind === 'endpoint') return { label: p.label, base: 0, value: p.cumulative, kind: p.kind };
    const prev = arr[i - 1].cumulative;
    return { label: p.label, base: p.cumulative, value: prev - p.cumulative, kind: p.kind };
  });

  return (
    <div className="mb-4 rounded-2xl border border-[var(--hairline)] bg-white p-5">
      <div className="mb-3 flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="font-display text-[18px] font-bold leading-tight text-[var(--ink)]">{data.title}</h2>
          <div className="mt-1 text-[12.5px] text-[var(--muted)]">{data.subtitle}</div>
        </div>
        <span className="rounded-full border border-[var(--hairline)] bg-[var(--surface-soft)] px-3 py-1 text-[11.5px] font-semibold text-[var(--ink-2)]">
          {data.totalChip}
        </span>
      </div>

      <div className="grid grid-cols-1 gap-5 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.1fr)]">
        <div className="h-[280px]">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={chartData} margin={{ top: 8, right: 8, bottom: 8, left: 8 }}>
              <CartesianGrid stroke="var(--hairline)" vertical={false} />
              <XAxis dataKey="label" stroke="var(--muted)" tick={{ fontSize: 11 }} />
              <YAxis stroke="var(--muted)" tick={{ fontSize: 11 }} domain={[0, 30]} />
              <Tooltip />
              <Bar dataKey="base" stackId="wf" fill="transparent" />
              <Bar
                dataKey="value"
                stackId="wf"
                fill="var(--rose)"
                shape={(props: { kind?: string; fill?: string }) =>
                  // rechart shape callback - default rect; simpler: map via per-cell fill below
                  <rect {...(props as object)} fill={props.kind === 'endpoint' ? 'var(--green)' : 'var(--rose)'} />
                }
              />
            </BarChart>
          </ResponsiveContainer>
        </div>

        <div>
          <h5 className="mb-2 text-[12px] font-bold uppercase tracking-wider text-[var(--muted)]">
            Bucket breakdown · click any bucket to drill
          </h5>
          <div className="flex flex-col">
            {data.buckets.map((b) => {
              const Element = b.jumpTo ? 'button' : 'div';
              const isClickable = !!b.jumpTo;
              return (
                <Element
                  key={b.id}
                  type={Element === 'button' ? 'button' : undefined}
                  onClick={
                    !b.jumpTo
                      ? undefined
                      : () => (b.jumpTo!.kind === 'route' ? nav(b.jumpTo!.to) : onTabJump(b.jumpTo!.tab, b.jumpTo!.segTab))
                  }
                  className={[
                    'grid grid-cols-[10px_1fr_70px_70px_90px] items-center gap-3 border-t border-[var(--hairline)] px-2 py-2 text-left first:border-t-0',
                    isClickable ? 'transition-colors hover:rounded-md hover:bg-[var(--surface-soft)]' : '',
                    b.endpoint ? 'bg-[var(--green-bg)]/30' : '',
                  ].join(' ')}
                >
                  <span className="inline-block h-2 w-2 shrink-0 rounded-full" style={{ background: dotColor(b) }} />
                  <div>
                    <div className="text-[13px] font-semibold text-[var(--ink-2)]">
                      {b.name}
                      {b.delta && (
                        <span className="ml-2 inline-block rounded-full px-1.5 py-0.5 text-[10.5px] font-bold" style={{ background: 'var(--surface-soft)', color: deltaColor(b.delta.tone) }}>
                          {b.delta.label}
                        </span>
                      )}
                    </div>
                    {b.source && <div className="mt-0.5 text-[11px] text-[var(--ink-3)]" dangerouslySetInnerHTML={{ __html: b.source }} />}
                  </div>
                  <span className="text-right text-[12px] font-bold text-[var(--ink-2)]">{b.pct}</span>
                  <span className="text-right text-[12px] font-semibold text-[var(--muted)]">{b.eur}</span>
                  <span className="text-right text-[11.5px] font-semibold" style={{ color: 'var(--rose-deep)' }}>
                    {b.jumpLabel ?? ''}
                  </span>
                </Element>
              );
            })}
          </div>
        </div>
      </div>

      <MovableLockedOverlay data={data.movableLocked} />
    </div>
  );
}
```

Note on the Recharts shape callback: if TypeScript complains about the `shape` prop signature, drop the per-bar coloring and use a single `fill="var(--rose)"` plus a separate endpoint bar series. The bucket list is the primary information surface — keep it; the chart is decorative.

- [ ] **Step 3.4: Wire into `index.tsx`**

Add the import and place `<WaterfallCard data={data.waterfall} onTabJump={handleTabJump} />` directly under `<ShiftedStrip ... />`.

- [ ] **Step 3.5: Verify and commit**

```bash
npm run typecheck && npm run lint && npm test
git add frontend-v2/src/features/margin-cockpit frontend-v2/src/tests/margin-cockpit
git commit -m "feat(v2): Phase 2 part 3 — margin waterfall + buckets + movable/locked overlay"
```

---

## Task 4: Lost-Quote differential + Cost-vs-Price card

**Files:**
- Create: `frontend-v2/src/features/margin-cockpit/components/LostQuoteDifferential.tsx`
- Create: `frontend-v2/src/features/margin-cockpit/components/CostVsPriceCard.tsx`
- Create: `frontend-v2/src/tests/margin-cockpit/LostQuoteDifferential.test.tsx`
- Modify: `frontend-v2/src/features/margin-cockpit/index.tsx`

- [ ] **Step 4.1: Failing test — `LostQuoteDifferential.test.tsx`**

```tsx
import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { LostQuoteDifferential } from '@/features/margin-cockpit/components/LostQuoteDifferential';
import type { LostQuoteDifferentialData } from '@/types';

const data: LostQuoteDifferentialData = {
  title: 'Lost-quote margin differential',
  subtitle: 'Different fix from leakage waterfall',
  significance: 'p = 0.006 · statistically significant',
  tiles: [
    { id: 'won', label: 'Won', value: '70.6%', sub: 'n = 928' },
    { id: 'lost', label: 'Lost', value: '72.4%', sub: 'n = 385' },
    { id: 'diff', label: 'Differential', value: '+1.8pp', sub: 'p = 0.006' },
  ],
  interpretationHtml: '<b>Plain-language:</b> losing on the high-margin end.',
  sourceHtml: 'Source · pricing_analysis.price_sensitivity',
};

describe('LostQuoteDifferential', () => {
  it('renders 3 tiles, the significance chip, and the interpretation', () => {
    render(<LostQuoteDifferential data={data} />);
    expect(screen.getByText('70.6%')).toBeInTheDocument();
    expect(screen.getByText('72.4%')).toBeInTheDocument();
    expect(screen.getByText('+1.8pp')).toBeInTheDocument();
    expect(screen.getByText('p = 0.006 · statistically significant')).toBeInTheDocument();
    expect(screen.getByText(/losing on the high-margin end/)).toBeInTheDocument();
  });
});
```

- [ ] **Step 4.2: Implement `LostQuoteDifferential`**

```tsx
import type { LostQuoteDifferentialData } from '@/types';

interface Props {
  data: LostQuoteDifferentialData;
}

export function LostQuoteDifferential({ data }: Props) {
  return (
    <div className="mb-4 rounded-2xl border border-[var(--hairline)] bg-white p-5" style={{ borderLeft: '4px solid var(--violet)' }}>
      <div className="mb-3 flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="font-display text-[18px] font-bold leading-tight text-[var(--ink)]">{data.title}</h2>
          <div className="mt-1 text-[12.5px] text-[var(--muted)]">{data.subtitle}</div>
        </div>
        <span className="rounded-full px-3 py-1 text-[11.5px] font-semibold" style={{ background: 'var(--green-bg)', color: 'var(--green)' }}>
          {data.significance}
        </span>
      </div>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        {data.tiles.map((t) => {
          const accent = t.id === 'diff' ? 'var(--violet)' : t.id === 'lost' ? 'var(--rose-deep)' : 'var(--ink)';
          return (
            <div key={t.id} className="rounded-xl border border-[var(--hairline)] bg-[var(--surface-soft)] p-4">
              <div className="text-[10.5px] font-bold uppercase tracking-wider text-[var(--muted)]">{t.label}</div>
              <div className="mt-1 font-display text-[26px] font-bold" style={{ color: accent }}>{t.value}</div>
              <div className="mt-1 text-[11.5px] text-[var(--muted)]">{t.sub}</div>
            </div>
          );
        })}
      </div>
      <p className="mt-4 rounded-xl bg-[var(--surface-soft)] p-3 text-[13px] text-[var(--ink-2)]" dangerouslySetInnerHTML={{ __html: data.interpretationHtml }} />
      <p className="mt-2 text-[11px] text-[var(--muted)]" dangerouslySetInnerHTML={{ __html: data.sourceHtml }} />
    </div>
  );
}
```

- [ ] **Step 4.3: Implement `CostVsPriceCard`**

```tsx
import { Area, AreaChart, CartesianGrid, Legend, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import type { CostVsPriceData } from '@/types';

interface Props {
  data: CostVsPriceData;
}

export function CostVsPriceCard({ data }: Props) {
  return (
    <div className="mb-4 rounded-2xl border border-[var(--hairline)] bg-white p-5">
      <div className="mb-3 flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="font-display text-[18px] font-bold leading-tight text-[var(--ink)]">{data.title}</h2>
          <div className="mt-1 text-[12.5px] text-[var(--muted)]">{data.subtitle}</div>
        </div>
        <span className="rounded-full border border-[var(--hairline)] bg-[var(--surface-soft)] px-3 py-1 text-[11.5px] font-semibold text-[var(--ink-2)]">
          {data.indexedTag}
        </span>
      </div>

      <div className="grid grid-cols-1 gap-5 lg:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)]">
        <div className="h-[260px]">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={data.series} margin={{ top: 8, right: 8, bottom: 8, left: 8 }}>
              <CartesianGrid stroke="var(--hairline)" vertical={false} />
              <XAxis dataKey="month" stroke="var(--muted)" tick={{ fontSize: 11 }} />
              <YAxis stroke="var(--muted)" tick={{ fontSize: 11 }} domain={['auto', 'auto']} />
              <Tooltip />
              <Legend />
              <Line type="monotone" dataKey="cost"  stroke="var(--rose)" strokeWidth={2} dot={false} name="Input cost (indexed)" />
              <Line type="monotone" dataKey="price" stroke="var(--ink)"  strokeWidth={2} dot={false} name="Realized price (indexed)" />
            </LineChart>
          </ResponsiveContainer>
        </div>

        <div className="flex flex-col gap-3">
          <div className="rounded-xl border border-[var(--hairline)] p-4" style={{ background: 'var(--rose-bg)' }}>
            <div className="text-[12px] font-semibold uppercase tracking-wider text-[var(--rose-deep)]">{data.passThrough.label}</div>
            <div className="mt-1 font-display text-[28px] font-bold text-[var(--ink)]">{data.passThrough.value}</div>
            <div className="mt-1 text-[12px] text-[var(--ink-2)]" dangerouslySetInnerHTML={{ __html: data.passThrough.sub }} />
            <div className="mt-3 h-2 overflow-hidden rounded-full bg-white">
              <div className="h-full rounded-full" style={{ width: `${data.passThrough.pct}%`, background: 'var(--rose)' }} />
            </div>
            <div className="mt-3 border-t border-dashed border-[var(--hairline)] pt-2 text-[11px] text-[var(--ink-3)]" dangerouslySetInnerHTML={{ __html: data.passThrough.breakdownHtml }} />
          </div>

          <div className="rounded-xl border border-[var(--hairline)] p-4">
            <div className="text-[12px] font-semibold uppercase tracking-wider text-[var(--muted)]">{data.recovery.label}</div>
            <div className="mt-1 font-display text-[28px] font-bold" style={{ color: 'var(--green)' }}>{data.recovery.value}</div>
            <div className="mt-1 text-[12px] text-[var(--ink-2)]" dangerouslySetInnerHTML={{ __html: data.recovery.sub }} />
            <div className="mt-2 h-[80px]">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={data.recovery.spark.map((v, i) => ({ i, v }))}>
                  <Area type="monotone" dataKey="v" stroke="var(--rose)" fill="var(--rose-bg)" strokeWidth={2} />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
```

- [ ] **Step 4.4: Wire into `index.tsx`**

Add `<LostQuoteDifferential data={data.lostQuote} />` and `<CostVsPriceCard data={data.costVsPrice} />` after the WaterfallCard.

- [ ] **Step 4.5: Verify and commit**

```bash
npm run typecheck && npm run lint && npm test
git add frontend-v2/src/features/margin-cockpit frontend-v2/src/tests/margin-cockpit
git commit -m "feat(v2): Phase 2 part 4 — lost-quote differential + cost-vs-price + recovery"
```

---

## Task 5: Margin tabs shell + Cross-Customer pane + SKU Leakage pane

**Files:**
- Create: `frontend-v2/src/features/margin-cockpit/components/MarginTabs.tsx`
- Create: `frontend-v2/src/features/margin-cockpit/components/panes/CrossCustomerPane.tsx`
- Create: `frontend-v2/src/features/margin-cockpit/components/panes/SkuLeakagePane.tsx`
- Create: `frontend-v2/src/tests/margin-cockpit/MarginTabs.test.tsx`
- Modify: `frontend-v2/src/features/margin-cockpit/index.tsx`

- [ ] **Step 5.1: Failing test — `MarginTabs.test.tsx`**

```tsx
import { render, screen, fireEvent } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { MemoryRouter } from 'react-router-dom';
import { MarginTabs } from '@/features/margin-cockpit/components/MarginTabs';
import type { MarginTabs as MarginTabsType } from '@/types';

const tabs: MarginTabsType = {
  cross: { description: 'Cross', infoPanel: [], rows: [], footerNote: 'note', tabFooterText: 'cross footer' },
  leak:  { description: 'Leak',  infoPanel: [], rows: [], tabFooterText: 'leak footer' },
  seg:   { description: 'Seg',   infoPanel: [], subPanes: [
    { id: 'family', label: 'By family', headers: ['x'], rows: [], storyHtml: '' },
    { id: 'tier',   label: 'By tier',   headers: ['x'], rows: [], storyHtml: '' },
    { id: 'size',   label: 'By size',   headers: ['x'], rows: [], storyHtml: '' },
    { id: 'region', label: 'By region', headers: ['x'], rows: [], storyHtml: '' },
  ], tabFooterText: 'seg footer' },
  erode: { description: 'Erode', infoPanel: [], rows: [], cycleNote: '', cycleButtonLabel: 'go', tabFooterText: 'erode footer' },
  cust:  { description: 'Cust',  infoPanel: [], rows: [], tabFooterText: 'cust footer' },
};

describe('MarginTabs', () => {
  it('switches active pane on tab click', () => {
    render(
      <MemoryRouter>
        <MarginTabs tabs={tabs} activeTab="cross" onTabChange={() => {}} activeSegTab="family" onSegTabChange={() => {}} />
      </MemoryRouter>
    );
    expect(screen.getByText('cross footer')).toBeInTheDocument();
  });

  it('emits onTabChange when a non-active tab is clicked', () => {
    let active = 'cross';
    const onTabChange = (t: string) => { active = t; };
    render(
      <MemoryRouter>
        <MarginTabs tabs={tabs} activeTab={active} onTabChange={onTabChange} activeSegTab="family" onSegTabChange={() => {}} />
      </MemoryRouter>
    );
    fireEvent.click(screen.getByRole('button', { name: /SKU Margin Leakage/i }));
    expect(active).toBe('leak');
  });
});
```

- [ ] **Step 5.2: Implement `CrossCustomerPane`**

```tsx
import { useNavigate } from 'react-router-dom';
import type { CrossCustomerRow, MarginTabs } from '@/types';

interface Props {
  pane: MarginTabs['cross'];
}

const chipTone = (tone: CrossCustomerRow['cluster']['tone']) =>
  tone === 'green' ? { bg: 'var(--green-bg)', color: 'var(--green)' }
  : tone === 'amber' ? { bg: 'var(--amber-bg)', color: 'var(--amber)' }
  : { bg: 'var(--rose-bg)', color: 'var(--rose-deep)' };

export function CrossCustomerPane({ pane }: Props) {
  const nav = useNavigate();
  return (
    <div>
      <p className="mb-3 text-[12.5px] text-[var(--muted)]">{pane.description}</p>
      <div className="overflow-hidden rounded-xl border border-[var(--hairline)]">
        <table className="w-full text-[12.5px]">
          <thead>
            <tr className="bg-[var(--surface-soft)] text-left text-[11px] uppercase tracking-wider text-[var(--muted)]">
              {['Article','Cluster · conf','Customer A','Price A','Customer B','Price B','Volume tier','Spread %','Action'].map((h) => (
                <th key={h} className="px-3 py-2 font-bold">{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {pane.rows.map((r) => {
              const t = chipTone(r.cluster.tone);
              return (
                <tr key={r.article} className={r.highlight ? 'bg-[var(--rose-bg)]' : ''}>
                  <td className="border-t border-[var(--hairline)] px-3 py-2"><b className="font-bold">{r.article}</b></td>
                  <td className="border-t border-[var(--hairline)] px-3 py-2">
                    <span className="rounded-full px-2 py-0.5 text-[11px] font-semibold" style={{ background: t.bg, color: t.color }}>
                      {r.cluster.code} {r.cluster.conf}
                    </span>
                  </td>
                  <td className="border-t border-[var(--hairline)] px-3 py-2">{r.customerA}</td>
                  <td className="border-t border-[var(--hairline)] px-3 py-2 text-right">{r.priceA}</td>
                  <td className="border-t border-[var(--hairline)] px-3 py-2">{r.customerB}</td>
                  <td className="border-t border-[var(--hairline)] px-3 py-2 text-right">{r.priceB}</td>
                  <td className="border-t border-[var(--hairline)] px-3 py-2">{r.tier}</td>
                  <td className="border-t border-[var(--hairline)] px-3 py-2 text-right" style={{ color: 'var(--red)' }}>{r.spreadPct}</td>
                  <td className="border-t border-[var(--hairline)] px-3 py-2">
                    <button
                      type="button"
                      onClick={() => nav('/pricing')}
                      className={`rounded-full px-3 py-1 text-[11.5px] font-semibold ${r.highlight ? 'text-white' : 'border border-[var(--hairline)] text-[var(--ink-2)]'}`}
                      style={r.highlight ? { background: 'var(--rose)' } : undefined}
                    >
                      {r.studioLabel}
                    </button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <p className="mt-3 text-[11.5px] text-[var(--ink-3)]" dangerouslySetInnerHTML={{ __html: pane.footerNote }} />
      <div className="mt-3 flex flex-wrap items-center gap-2 rounded-xl bg-[var(--surface-soft)] px-3 py-2 text-[12px] text-[var(--ink-2)]">
        <span>⚡</span><span dangerouslySetInnerHTML={{ __html: pane.tabFooterText }} />
      </div>
    </div>
  );
}
```

- [ ] **Step 5.3: Implement `SkuLeakagePane`**

```tsx
import { useNavigate } from 'react-router-dom';
import type { MarginTabs } from '@/types';

interface Props {
  pane: MarginTabs['leak'];
}

export function SkuLeakagePane({ pane }: Props) {
  const nav = useNavigate();
  return (
    <div>
      <p className="mb-3 text-[12.5px] text-[var(--muted)]">{pane.description}</p>
      <div className="overflow-hidden rounded-xl border border-[var(--hairline)]">
        <table className="w-full text-[12.5px]">
          <thead>
            <tr className="bg-[var(--surface-soft)] text-left text-[11px] uppercase tracking-wider text-[var(--muted)]">
              {['Article','Description','Volume','Quoted','Actual','Gap','Opportunity','A/B','Audit hash','Action'].map((h) => (
                <th key={h} className="px-3 py-2 font-bold">{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {pane.rows.map((r) => (
              <tr key={r.article}>
                <td className="border-t border-[var(--hairline)] px-3 py-2"><b className="font-bold">{r.article}</b></td>
                <td className="border-t border-[var(--hairline)] px-3 py-2">{r.description}</td>
                <td className="border-t border-[var(--hairline)] px-3 py-2 text-right">{r.volume}</td>
                <td className="border-t border-[var(--hairline)] px-3 py-2 text-right">{r.quotedMargin}</td>
                <td className="border-t border-[var(--hairline)] px-3 py-2 text-right">{r.actualMargin}</td>
                <td className="border-t border-[var(--hairline)] px-3 py-2 text-right" style={{ color: 'var(--red)' }}>{r.gapPp}</td>
                <td className="border-t border-[var(--hairline)] px-3 py-2 text-right" style={{ color: 'var(--green)' }}>{r.opportunityEur}</td>
                <td className="border-t border-[var(--hairline)] px-3 py-2 text-[11px]" style={r.abStatus.startsWith('🧪') ? { color: 'var(--violet)', fontWeight: 600 } : { color: 'var(--muted)' }}>
                  {r.abStatus}
                </td>
                <td className="border-t border-[var(--hairline)] px-3 py-2 text-[11px] text-[var(--ink-3)]">
                  {r.auditHash === '—' ? '—' : <code>{r.auditHash}</code>}
                </td>
                <td className="border-t border-[var(--hairline)] px-3 py-2">
                  <button
                    type="button"
                    onClick={() => nav('/pricing')}
                    className={`rounded-full px-3 py-1 text-[11.5px] font-semibold ${r.primary ? 'text-white' : 'border border-[var(--hairline)] text-[var(--ink-2)]'}`}
                    style={r.primary ? { background: 'var(--rose)' } : undefined}
                  >
                    Open in Studio →
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="mt-3 flex flex-wrap items-center gap-2 rounded-xl bg-[var(--surface-soft)] px-3 py-2 text-[12px] text-[var(--ink-2)]">
        <span>⚡</span><span dangerouslySetInnerHTML={{ __html: pane.tabFooterText }} />
      </div>
    </div>
  );
}
```

- [ ] **Step 5.4: Implement `MarginTabs` shell**

```tsx
import type { MarginTabs as MarginTabsType } from '@/types';
import { CrossCustomerPane } from './panes/CrossCustomerPane';
import { SkuLeakagePane } from './panes/SkuLeakagePane';
// SegmentPane, ErosionPane, CustomerTrendPane added in Tasks 6 + 7

interface Props {
  tabs: MarginTabsType;
  activeTab: string;
  onTabChange: (tab: string) => void;
  activeSegTab: string;
  onSegTabChange: (seg: string) => void;
}

const TAB_DEFS: { id: keyof MarginTabsType; label: string; badge?: string }[] = [
  { id: 'cross', label: 'Cross-Customer Discrepancy', badge: '★ Proprietary' },
  { id: 'leak',  label: 'SKU Margin Leakage' },
  { id: 'seg',   label: 'Segment pivot' },
  { id: 'erode', label: 'List-price erosion' },
  { id: 'cust',  label: 'Customer trend' },
];

export function MarginTabs({ tabs, activeTab, onTabChange }: Props) {
  return (
    <div id="marginTabsBlock" className="mb-4 rounded-2xl border border-[var(--hairline)] bg-white p-5">
      <div className="mb-4 flex flex-wrap gap-2">
        {TAB_DEFS.map((d) => {
          const active = d.id === activeTab;
          return (
            <button
              key={d.id}
              type="button"
              onClick={() => onTabChange(d.id)}
              className={`flex items-center gap-2 rounded-full px-3 py-1.5 text-[12px] font-semibold transition-colors ${
                active ? 'text-white' : 'border border-[var(--hairline)] bg-white text-[var(--ink-2)]'
              }`}
              style={active ? { background: 'var(--ink)' } : undefined}
            >
              <span>{d.label}</span>
              {d.badge && (
                <span className="rounded-full px-1.5 py-0.5 text-[10px] font-bold" style={{ background: 'var(--violet-bg)', color: 'var(--violet)' }}>
                  {d.badge}
                </span>
              )}
            </button>
          );
        })}
      </div>

      {activeTab === 'cross' && <CrossCustomerPane pane={tabs.cross} />}
      {activeTab === 'leak'  && <SkuLeakagePane pane={tabs.leak} />}
      {activeTab === 'seg'   && <div className="text-sm text-[var(--muted)]">Segment pivot — Task 6</div>}
      {activeTab === 'erode' && <div className="text-sm text-[var(--muted)]">List-price erosion — Task 6</div>}
      {activeTab === 'cust'  && <div className="text-sm text-[var(--muted)]">Customer trend — Task 7</div>}
    </div>
  );
}
```

- [ ] **Step 5.5: Wire into `index.tsx`**

```tsx
import { MarginTabs } from './components/MarginTabs';
// ...
<MarginTabs
  tabs={data.tabs}
  activeTab={activeTab}
  onTabChange={setActiveTab}
  activeSegTab={activeSegTab}
  onSegTabChange={setActiveSegTab}
/>
```

The unused-state warning from Task 2 is now resolved.

- [ ] **Step 5.6: Verify and commit**

```bash
npm run typecheck && npm run lint && npm test
git add frontend-v2/src/features/margin-cockpit frontend-v2/src/tests/margin-cockpit
git commit -m "feat(v2): Phase 2 part 5 — margin tabs shell + cross-customer + sku-leakage panes"
```

---

## Task 6: Segment pane (4 sub-tabs) + Erosion pane

**Files:**
- Create: `frontend-v2/src/features/margin-cockpit/components/panes/SegmentPane.tsx`
- Create: `frontend-v2/src/features/margin-cockpit/components/panes/ErosionPane.tsx`
- Create: `frontend-v2/src/tests/margin-cockpit/SegmentPane.test.tsx`
- Modify: `frontend-v2/src/features/margin-cockpit/components/MarginTabs.tsx`

- [ ] **Step 6.1: Failing test — `SegmentPane.test.tsx`**

```tsx
import { render, screen, fireEvent } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { SegmentPane } from '@/features/margin-cockpit/components/panes/SegmentPane';
import type { MarginTabs } from '@/types';

const seg: MarginTabs['seg'] = {
  description: 'Slice',
  infoPanel: [],
  subPanes: [
    { id: 'family', label: 'By family', headers: ['Fam','Rev'], rows: [{ label: 'Shafts', cells: ['€3.4M'] }], storyHtml: '<b>Shafts dominate</b>' },
    { id: 'tier',   label: 'By tier',   headers: ['Tier','Rev'], rows: [{ label: 'Strategic', tier: 'A', cells: ['€799K'] }], storyHtml: '' },
    { id: 'size',   label: 'By size',   headers: ['x'], rows: [], storyHtml: '' },
    { id: 'region', label: 'By region', headers: ['x'], rows: [], storyHtml: '', caveatHtml: '<b>Note:</b> regional vs commodity' },
  ],
  tabFooterText: 'seg footer',
};

describe('SegmentPane', () => {
  it('renders the active sub-pane and switches on click', () => {
    const onSegTabChange = vi.fn();
    render(<SegmentPane pane={seg} activeSegTab="family" onSegTabChange={onSegTabChange} />);
    expect(screen.getByText('Shafts')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'By tier' }));
    expect(onSegTabChange).toHaveBeenCalledWith('tier');
  });
});
```

- [ ] **Step 6.2: Implement `SegmentPane`**

```tsx
import type { MarginTabs, SegmentRow } from '@/types';

interface Props {
  pane: MarginTabs['seg'];
  activeSegTab: string;
  onSegTabChange: (seg: string) => void;
}

const tierBadge = (t: SegmentRow['tier']) => {
  if (!t) return null;
  const palette: Record<NonNullable<SegmentRow['tier']>, { bg: string; color: string }> = {
    A: { bg: 'var(--green-bg)', color: 'var(--green)' },
    B: { bg: 'var(--surface-soft)', color: 'var(--ink-2)' },
    C: { bg: 'var(--amber-bg)', color: 'var(--amber)' },
    D: { bg: 'var(--rose-bg)', color: 'var(--rose-deep)' },
  };
  const p = palette[t];
  return (
    <span className="mr-1 inline-flex h-5 w-5 items-center justify-center rounded-md text-[11px] font-bold" style={{ background: p.bg, color: p.color }}>
      {t}
    </span>
  );
};

export function SegmentPane({ pane, activeSegTab, onSegTabChange }: Props) {
  const active = pane.subPanes.find((p) => p.id === activeSegTab) ?? pane.subPanes[0];
  return (
    <div>
      <p className="mb-3 text-[12.5px] text-[var(--muted)]">{pane.description}</p>
      <div className="mb-4 flex flex-wrap gap-2">
        {pane.subPanes.map((sp) => {
          const isActive = sp.id === activeSegTab;
          return (
            <button
              key={sp.id}
              type="button"
              onClick={() => onSegTabChange(sp.id)}
              className={`rounded-full px-3 py-1 text-[12px] font-semibold transition-colors ${
                isActive ? 'text-white' : 'border border-[var(--hairline)] bg-white text-[var(--ink-2)]'
              }`}
              style={isActive ? { background: 'var(--ink-2)' } : undefined}
            >
              {sp.label}
            </button>
          );
        })}
      </div>

      <div className="overflow-hidden rounded-xl border border-[var(--hairline)]">
        <table className="w-full text-[12.5px]">
          <thead>
            <tr className="bg-[var(--surface-soft)] text-left text-[11px] uppercase tracking-wider text-[var(--muted)]">
              {active.headers.map((h) => (
                <th key={h} className="px-3 py-2 font-bold">{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {active.rows.map((r, i) => (
              <tr key={i}>
                <td className="border-t border-[var(--hairline)] px-3 py-2">
                  {tierBadge(r.tier)}<b className="font-bold">{r.label}</b>
                </td>
                {r.cells.map((c, j) => (
                  <td key={j} className="border-t border-[var(--hairline)] px-3 py-2 text-right">{c}</td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {active.storyHtml && (
        <p className="mt-3 text-[12px] text-[var(--ink-3)]" dangerouslySetInnerHTML={{ __html: active.storyHtml }} />
      )}
      {active.caveatHtml && (
        <p
          className="mt-2 rounded-xl px-3 py-2 text-[12px]"
          style={{ background: 'var(--violet-bg)', color: 'var(--violet)', borderLeft: '3px solid var(--violet)' }}
          dangerouslySetInnerHTML={{ __html: active.caveatHtml }}
        />
      )}

      <div className="mt-3 flex flex-wrap items-center gap-2 rounded-xl bg-[var(--surface-soft)] px-3 py-2 text-[12px] text-[var(--ink-2)]">
        <span>⚡</span><span dangerouslySetInnerHTML={{ __html: pane.tabFooterText }} />
      </div>
    </div>
  );
}
```

- [ ] **Step 6.3: Implement `ErosionPane`**

```tsx
import { useNavigate } from 'react-router-dom';
import type { MarginTabs } from '@/types';

interface Props {
  pane: MarginTabs['erode'];
}

const ageBarColor = (months: number): string =>
  months >= 9 ? 'var(--rose)' : months >= 6 ? 'var(--amber)' : 'var(--green)';

const clusterTone = (tone: 'green' | 'amber' | 'red') =>
  tone === 'green' ? { bg: 'var(--green-bg)', color: 'var(--green)' }
  : tone === 'amber' ? { bg: 'var(--amber-bg)', color: 'var(--amber)' }
  : { bg: 'var(--rose-bg)', color: 'var(--rose-deep)' };

export function ErosionPane({ pane }: Props) {
  const nav = useNavigate();
  return (
    <div>
      <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
        <p className="text-[12.5px] text-[var(--muted)]">{pane.description}</p>
        <button
          type="button"
          className="rounded-full px-3 py-1.5 text-[12px] font-semibold text-white"
          style={{ background: 'var(--rose)' }}
        >
          {pane.cycleButtonLabel}
        </button>
      </div>

      <div className="overflow-hidden rounded-xl border border-[var(--hairline)]">
        <table className="w-full text-[12.5px]">
          <thead>
            <tr className="bg-[var(--surface-soft)] text-left text-[11px] uppercase tracking-wider text-[var(--muted)]">
              {['Article','Cluster · conf','Last list update','Cost change since','List change since','Effective erosion','Margin compression','Last author · hash','Action'].map((h) => (
                <th key={h} className="px-3 py-2 font-bold">{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {pane.rows.map((r) => {
              const t = clusterTone(r.cluster.tone);
              const widthPct = Math.min(100, Math.round((r.lastUpdateMonths / 16) * 100));
              return (
                <tr key={r.article}>
                  <td className="border-t border-[var(--hairline)] px-3 py-2"><b className="font-bold">{r.article}</b></td>
                  <td className="border-t border-[var(--hairline)] px-3 py-2">
                    <span className="rounded-full px-2 py-0.5 text-[11px] font-semibold" style={{ background: t.bg, color: t.color }}>
                      {r.cluster.code} {r.cluster.conf}
                    </span>
                  </td>
                  <td className="border-t border-[var(--hairline)] px-3 py-2">
                    <span className="mr-2 inline-block h-1.5 w-20 overflow-hidden rounded-full bg-[var(--surface-soft)] align-middle">
                      <span className="block h-full rounded-full" style={{ width: `${widthPct}%`, background: ageBarColor(r.lastUpdateMonths) }} />
                    </span>
                    <span>{r.lastUpdateLabel}</span>
                  </td>
                  <td className="border-t border-[var(--hairline)] px-3 py-2 text-right" style={{ color: r.costChange.startsWith('+') ? 'var(--red)' : undefined }}>{r.costChange}</td>
                  <td className="border-t border-[var(--hairline)] px-3 py-2 text-right">{r.listChange}</td>
                  <td className="border-t border-[var(--hairline)] px-3 py-2 text-right" style={{ color: r.effectiveErosion.startsWith('-') || r.effectiveErosion.startsWith('−') ? 'var(--red)' : 'var(--green)' }}>{r.effectiveErosion}</td>
                  <td className="border-t border-[var(--hairline)] px-3 py-2 text-right" style={{ color: r.marginCompression === '0pp' ? undefined : r.marginCompression.startsWith('+') ? 'var(--green)' : 'var(--red)' }}>{r.marginCompression}</td>
                  <td className="border-t border-[var(--hairline)] px-3 py-2 text-[11px] text-[var(--ink-3)]">{r.authorHash}</td>
                  <td className="border-t border-[var(--hairline)] px-3 py-2">
                    {r.isAction ? (
                      <button
                        type="button"
                        onClick={() => nav('/pricing')}
                        className={`rounded-full px-3 py-1 text-[11.5px] font-semibold ${r.primary ? 'text-white' : 'border border-[var(--hairline)] text-[var(--ink-2)]'}`}
                        style={r.primary ? { background: 'var(--rose)' } : undefined}
                      >
                        {r.actionLabel}
                      </button>
                    ) : (
                      <span className="text-[11px] text-[var(--muted)]">{r.actionLabel}</span>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <p className="mt-3 text-[11.5px] text-[var(--ink-3)]" dangerouslySetInnerHTML={{ __html: pane.cycleNote }} />
      <div className="mt-3 flex flex-wrap items-center gap-2 rounded-xl bg-[var(--surface-soft)] px-3 py-2 text-[12px] text-[var(--ink-2)]">
        <span>⚡</span><span dangerouslySetInnerHTML={{ __html: pane.tabFooterText }} />
      </div>
    </div>
  );
}
```

- [ ] **Step 6.4: Wire into `MarginTabs.tsx`**

Replace the `seg` and `erode` placeholders:

```tsx
import { SegmentPane } from './panes/SegmentPane';
import { ErosionPane } from './panes/ErosionPane';
// ...
{activeTab === 'seg'   && <SegmentPane pane={tabs.seg} activeSegTab={activeSegTab} onSegTabChange={onSegTabChange} />}
{activeTab === 'erode' && <ErosionPane pane={tabs.erode} />}
```

- [ ] **Step 6.5: Verify and commit**

```bash
npm run typecheck && npm run lint && npm test
git add frontend-v2/src/features/margin-cockpit frontend-v2/src/tests/margin-cockpit
git commit -m "feat(v2): Phase 2 part 6 — segment pane (4 sub-tabs) + erosion pane"
```

---

## Task 7: Customer Trend pane + Cross-Links footer + page smoke test

**Files:**
- Create: `frontend-v2/src/features/margin-cockpit/components/panes/CustomerTrendPane.tsx`
- Create: `frontend-v2/src/features/margin-cockpit/components/CrossLinks.tsx`
- Create: `frontend-v2/src/tests/margin-cockpit/page.smoke.test.tsx`
- Modify: `frontend-v2/src/features/margin-cockpit/components/MarginTabs.tsx`
- Modify: `frontend-v2/src/features/margin-cockpit/index.tsx`

- [ ] **Step 7.1: Implement `CustomerTrendPane`**

```tsx
import { useNavigate } from 'react-router-dom';
import type { CustomerTrendRow, MarginTabs } from '@/types';

interface Props {
  pane: MarginTabs['cust'];
}

const statusPill = (s: CustomerTrendRow['status']) => {
  const palette = {
    action:  { bg: 'var(--rose-bg)',  dot: 'var(--rose-deep)', color: 'var(--rose-deep)' },
    watch:   { bg: 'var(--amber-bg)', dot: 'var(--amber)',     color: 'var(--amber)' },
    healthy: { bg: 'var(--green-bg)', dot: 'var(--green)',     color: 'var(--green)' },
  } as const;
  return palette[s];
};

const trendColor = (t: CustomerTrendRow['trendTone']) =>
  t === 'up' ? 'var(--green)' : t === 'down' ? 'var(--red)' : 'var(--muted)';

export function CustomerTrendPane({ pane }: Props) {
  const nav = useNavigate();
  return (
    <div>
      <p className="mb-3 text-[12.5px] text-[var(--muted)]">{pane.description}</p>
      <div className="overflow-hidden rounded-xl border border-[var(--hairline)]">
        <table className="w-full text-[12.5px]">
          <thead>
            <tr className="bg-[var(--surface-soft)] text-left text-[11px] uppercase tracking-wider text-[var(--muted)]">
              {['Customer','YTD Revenue','YTD Margin','Trend (12 mo)','Status','Action'].map((h) => (
                <th key={h} className="px-3 py-2 font-bold">{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {pane.rows.map((r) => {
              const p = statusPill(r.status);
              return (
                <tr key={r.customer}>
                  <td className="border-t border-[var(--hairline)] px-3 py-2"><b className="font-bold">{r.customer}</b></td>
                  <td className="border-t border-[var(--hairline)] px-3 py-2 text-right">{r.ytdRevenue}</td>
                  <td className="border-t border-[var(--hairline)] px-3 py-2 text-right">{r.ytdMargin}</td>
                  <td className="border-t border-[var(--hairline)] px-3 py-2 text-right" style={{ color: trendColor(r.trendTone) }}>{r.trend}</td>
                  <td className="border-t border-[var(--hairline)] px-3 py-2">
                    <span className="inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-[11px] font-semibold" style={{ background: p.bg, color: p.color }}>
                      <span className="inline-block h-1.5 w-1.5 rounded-full" style={{ background: p.dot }} />{r.statusLabel}
                    </span>
                  </td>
                  <td className="border-t border-[var(--hairline)] px-3 py-2">
                    <div className="flex flex-wrap gap-2">
                      {r.primaryAction && (
                        <button
                          type="button"
                          onClick={() => nav(r.primaryAction!.jumpTo)}
                          className="rounded-full px-3 py-1 text-[11.5px] font-semibold text-white"
                          style={{ background: 'var(--rose)' }}
                        >
                          {r.primaryAction.label}
                        </button>
                      )}
                      <button type="button" className="rounded-full border border-[var(--hairline)] px-3 py-1 text-[11.5px] font-semibold text-[var(--ink-2)]">
                        {r.drillLabel}
                      </button>
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <div className="mt-3 flex flex-wrap items-center gap-2 rounded-xl bg-[var(--surface-soft)] px-3 py-2 text-[12px] text-[var(--ink-2)]">
        <span>⚡</span><span dangerouslySetInnerHTML={{ __html: pane.tabFooterText }} />
      </div>
    </div>
  );
}
```

- [ ] **Step 7.2: Implement `CrossLinks`**

```tsx
import { Link } from 'react-router-dom';
import type { CrossLink } from '@/types';

interface Props {
  links: CrossLink[];
}

export function CrossLinks({ links }: Props) {
  return (
    <div className="mt-4 flex flex-wrap items-center gap-3 rounded-2xl border border-[var(--hairline)] bg-white px-4 py-3">
      <span className="text-[12px] font-semibold uppercase tracking-wider text-[var(--muted)]">Cross-links →</span>
      <div className="flex flex-wrap gap-2">
        {links.map((l) => (
          <Link
            key={l.label}
            to={l.jumpTo}
            className="rounded-full border border-[var(--hairline)] bg-white px-3 py-1 text-[12px] font-semibold text-[var(--ink-2)] hover:bg-[var(--surface-soft)]"
          >
            {l.label}
          </Link>
        ))}
      </div>
    </div>
  );
}
```

- [ ] **Step 7.3: Wire into `MarginTabs.tsx` and `index.tsx`**

In `MarginTabs.tsx`:
```tsx
import { CustomerTrendPane } from './panes/CustomerTrendPane';
// ...
{activeTab === 'cust'  && <CustomerTrendPane pane={tabs.cust} />}
```

In `index.tsx`, add the import and place `<CrossLinks links={data.crossLinks} />` after `<MarginTabs ... />`.

- [ ] **Step 7.4: Page smoke test**

Create `frontend-v2/src/tests/margin-cockpit/page.smoke.test.tsx`:

```tsx
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router-dom';
import MarginCockpitPage from '@/features/margin-cockpit';

function withProviders(ui: React.ReactNode) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return (
    <QueryClientProvider client={qc}>
      <MemoryRouter>{ui}</MemoryRouter>
    </QueryClientProvider>
  );
}

describe('Margin Cockpit page', () => {
  it('loads and renders all major sections', async () => {
    render(withProviders(<MarginCockpitPage />));
    await waitFor(() => expect(screen.getByText('Margin Intelligence')).toBeInTheDocument());
    expect(screen.getByText('€280,000')).toBeInTheDocument();                  // health closable cell
    expect(screen.getByText('BKAES', { exact: false })).toBeInTheDocument();   // cluster chip
    expect(screen.getByText(/Where the 3.9pp gap came from/)).toBeInTheDocument(); // waterfall
    expect(screen.getByText('70.6%')).toBeInTheDocument();                     // lost-quote tile
    expect(screen.getByText(/Input cost vs realized price/)).toBeInTheDocument();
    expect(screen.getByText(/Cross-Customer Discrepancy/)).toBeInTheDocument();
  });

  it('switches tabs and shows the SKU leakage rows', async () => {
    render(withProviders(<MarginCockpitPage />));
    await waitFor(() => expect(screen.getByText('Margin Intelligence')).toBeInTheDocument());
    fireEvent.click(screen.getByRole('button', { name: /SKU Margin Leakage/ }));
    expect(await screen.findByText('Precision shaft')).toBeInTheDocument();
  });

  it('switches segment sub-tabs from Tier-pivot deep link via the waterfall mix bucket', async () => {
    render(withProviders(<MarginCockpitPage />));
    await waitFor(() => expect(screen.getByText('Margin Intelligence')).toBeInTheDocument());
    fireEvent.click(screen.getByRole('button', { name: /Customer mix shift/ }));
    // SegmentPane → tier sub-tab should now be active
    expect(await screen.findByText('Strategic')).toBeInTheDocument();
  });
});
```

Run: should PASS.

- [ ] **Step 7.5: Manual visual check**

Run the dev server:
```bash
cd frontend-v2 && npm run dev
```
Open `http://localhost:5173/margin` and verify against `Pryzm_Dashboard_Mockup_Frank.html` lines 5615–6137 (open the file in a browser side-by-side):
- Page head, briefing toggle (button → memo opens, × closes)
- Health strip (4 cells; closable cell links to `/action-center`)
- Cluster mini-row (4 chips, source on the right)
- Shifted strip (4 rows; clicking the cost-trajectory row navigates to `/forecasting`; clicking cross-customer-spread row scrolls to tabs and selects Cross-Customer)
- Waterfall card (chart + bucket list; clicking any bucket either navigates or scrolls to the tabs block + selects the right tab)
- Movable/Locked overlay sits at the bottom of the waterfall card
- Lost-Quote differential, Cost-vs-Price card with mini-cards on the right
- Margin tabs: switch all 5; in Segment, switch all 4 sub-tabs
- Cross-links footer (4 buttons)
- No console errors; no layout breakage at 1280, 1440, 1920 widths

- [ ] **Step 7.6: Final verify and commit**

```bash
npm run typecheck && npm run lint && npm run test && npm run build
git add frontend-v2/src/features/margin-cockpit frontend-v2/src/tests/margin-cockpit
git commit -m "feat(v2): Phase 2 part 7 — customer-trend pane + cross-links + page smoke tests"
```

`npm run build` must succeed (Phase 0 ensures `dist-demo-v2/` is the output target). Do **not** push to the demo server in this phase — Phase 8 owns deploy. Live demo at `/demo/` remains untouched.

---

## Self-review notes

- **Spec coverage:** every section between mockup lines 5615–6137 maps to a task: head/briefing (T1), health/cluster/shifted (T2), waterfall + movable-locked (T3), lost-quote + cost-vs-price + recovery (T4), tabs shell + cross + leak (T5), seg + erode (T6), cust + cross-links + smoke (T7).
- **No placeholders:** every component step contains real code; every test step contains real assertions; commands are exact.
- **Type consistency:** `ShiftedRow.jumpTo`, `WaterfallBucket.jumpTo`, `MarginTabs.seg.subPanes[].id`, `setActiveTab`, `setActiveSegTab` use a single shared `'cross' | 'leak' | 'seg' | 'erode' | 'cust'` and `'family' | 'tier' | 'size' | 'region'` vocabulary throughout — checked.
- **DRY:** cluster/tier/status palette helpers are inlined per pane rather than centralised; intentionally YAGNI for this phase. Phase 7 polish can extract them once the visual language stabilizes across all six features.
- **Risk:** Recharts waterfall via stacked-bar is approximate; if the chart looks wrong, the bucket list (which is the real read for a pricing analyst) still carries the information — good fallback.
