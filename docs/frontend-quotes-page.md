# Frontend Quotes Page — Reference

> Last updated: 2026-05-14. Mirrors the state of `demo-phase45` branch at HEAD `b9118b4`.
>
> Source of truth lives in `frontend-v2/src/features/quotes/`. This document indexes every component the page can render, in render order, with data sources and interactions.

## 1. Entry point

| File | Role |
|---|---|
| `frontend-v2/src/features/quotes/index.tsx` | Page shell. Fetches `QuotesShell` via `useQuotes`, owns the briefing-memo open/close and analysis-tab state, then dispatches to the section components in fixed top-to-bottom order. Sets `pz-fullbleed` body class on mount, removes on unmount. |

Route registration: `frontend-v2/src/app/router.tsx:87` — `{ path: 'quotes', element: lazyRoute(QuotesPage) }` (lazy import at line 20).

### Cross-reference — Deal Inbox (Heiko)

`/deal/inbox` → `DealInboxPage` does **not** live under `features/quotes/`. It is `frontend-v2/src/features/persona-overview/DealInboxPage.tsx` (router.tsx:31, route at line 110). It is the Heiko-Sales read-only sibling of the Frank Quotes page — separate hook (`/screens/deal-inbox`), separate shell type (inline `DealInbox` interface, lines 47-60), and separate test suite (`frontend-v2/src/tests/persona-overview/persona-pages.test.tsx`). Frank-side Quotes and Heiko-side Deal Inbox share one upstream signal — the `lostQuote` / `quote_invoice_links` gap data — and that is the only overlap.

### URL parameters

`QuotesPage` itself reads no URL params. The page reads only what `useQuotes()` returns. Filter pills shown in `PageHead` are display-only (header.filters) — they are not yet wired to `setSearchParams`.

The BFF endpoint *accepts* the following query params (defined in `frontend-v2/src/lib/api/queryKeys.ts:36`, `QuotesParams`), and they would be threaded through `useQuotes(params)` if the page were extended to write to URL state:

| Param | Effect |
|---|---|
| `persona` | Persona swap (Frank by default). |
| `lang` | `de` / `en`. |
| `period` | Reporting period selector. |
| `week` | ISO week filter. |
| `rep` | Sales-rep filter (only meaningful for Heiko view; deferred for Frank). |
| `customer_id` | Customer drill-down. |
| `family` | Product-family filter. |
| `tier` | Tier filter (`A`/`B`/`C`/`D`). |

### Page-shell render order

```
PageHead
├─ crumbTrail · title · subPills · subStats · filter pills · briefing button · export button
BriefingMemo                       (open=false by default, toggled by briefing button)
PipelineStrip                      (4 counters)
ChangedStrip                       ("What changed since Monday")
EscalationsSection                 (info + concentration banner + bulk-accept banner + N cards)
FunnelSection                      (funnel chevrons + aging quartet)
QuoteToInvoiceGapCard              (Phase 5 — quote → invoice margin gap)
GuardrailsSection                  (threshold cards + history + edit buttons)
ActiveQuotesTable                  (47 quotes, RAG-filter pills, expandable rows)
AnalysisSection                    (tabs: SKU · Customer; the legacy "rep" tab is deferred)
CrossLinks
```

### Local state owned by `QuotesPage`

| State | Default | Effect |
|---|---|---|
| `briefingOpen` | `false` | Toggles `BriefingMemo` visibility; flipped by `PageHead`'s briefing button. |
| `analysisTab` | `'sku'` | Active tab in `AnalysisSection`. The `'rep'` tab is intentionally hidden (moved to Heiko); `EscalationsSection`'s "See by-rep view →" link redirects Frank to the SKU breakdown and smooth-scrolls into view. |

---

## 2. Data source

- Hook: `useQuotes(params?)` in `frontend-v2/src/data/api/useQuotes.ts:6` — TanStack `useQuery` with `staleTime: 60_000`.
- Cache key: `qk.quotes(params)` from `frontend-v2/src/lib/api/queryKeys.ts:79` → `['quotes']` or `['quotes', params]`.
- Endpoint: BFF `GET /screens/quotes` → `apiFetch<QuotesShell>` (`frontend-v2/src/lib/api/client.ts`).
- Backend route: `scherzinger-platform/backend/api/v1/screens.py:192` — `get_quotes`, accepts `If-None-Match` header for ETag, returns 304 on match; cache header `private, max-age=60`.
- Backend composer: `scherzinger-platform/backend/services/quotes/composer.py:40` — `build_quotes(user_id, persona, week, rep, customer_id, family, tier, lang)`.
- Response schema (pydantic): `scherzinger-platform/backend/schemas/screens/quotes.py` → `QuotesShell`.
- Frontend type mirror: `frontend-v2/src/types/quotes.ts:262` (`QuotesShell`).

### `QuotesShell` shape (frontend type)

| Field | Type | Source line |
|---|---|---|
| `header` | `QuotesPageHeader` | `types/quotes.ts:9` |
| `briefing` | `QuoteBriefingMemo` | `types/quotes.ts:20` |
| `pipeline` | `PipelineCounter[]` (4) | `types/quotes.ts:28` |
| `changed` | `{ title, rows: ChangedRow[] }` | `types/quotes.ts:40` |
| `escalations` | `EscalationsSectionData` | `types/quotes.ts:68` |
| `funnel` | `FunnelSectionData` | `types/quotes.ts:96` |
| `guardrails` | `GuardrailsSectionData` | `types/quotes.ts:114` |
| `active` | `ActiveQuotesSectionData` | `types/quotes.ts:157` |
| `analysis` | `QuotesAnalysisTabs` (rep, sku, cust) | `types/quotes.ts:221` |
| `gap` | `QuoteToInvoiceGapData` (Phase 5) | `types/quotes.ts:248` |
| `crossLinks` | `QuotesCrossLink[]` | `types/quotes.ts:228` |

---

## 3. Top → bottom component roster

| # | Component | Source file | What it shows | Key interactions |
|---|---|---|---|---|
| 1 | **PageHead** | `frontend-v2/src/features/quotes/components/PageHead.tsx` | Crumb trail · big title · sub-pills (e.g. "Re-evaluates every 2 min") · sub-stats (e.g. "47 active quotes") · filter chips ("Week 18", "All sales reps") · "Generate briefing" CTA · "Export" button. | **Generate briefing** button calls `onGenerateBriefing` → flips `briefingOpen` in the page. Filter chips render but are display-only (no URL writes yet — follow-up). |
| 2 | **BriefingMemo** | `frontend-v2/src/features/quotes/components/BriefingMemo.tsx` | Side card with rose left border. Header: title + Copy / Email / PDF / X buttons. Body: `contentEditable` `role="textbox"` rendering `data.paragraphs[].html` via `dangerouslySetInnerHTML` + italic signature line. | Open/close controlled by `QuotesPage`. Copy/Email/PDF buttons are present but do not trigger I/O yet (follow-up). Close button (`X`) calls `onClose`. |
| 3 | **PipelineStrip** | `frontend-v2/src/features/quotes/components/PipelineStrip.tsx` | 4-up KPI strip. Per counter: label · large value (mode-colored via `valueTone`) · optional sub-line · optional `miniCounters` (r/a/g dots — used by "Active quotes"). Container tinted by `containerTone` (`warn` → amber, `alert` → rose). Live counters render a pulsing red dot in the corner. | Read-only. |
| 4 | **ChangedStrip** | `frontend-v2/src/features/quotes/components/ChangedStrip.tsx` | "What changed since Monday" list. Per row: tone-colored dot (red / amber / green) + bold num count + inline-HTML text. | Read-only. Renders `r.text` via `dangerouslySetInnerHTML`. |
| 5 | **EscalationsSection** | `frontend-v2/src/features/quotes/components/EscalationsSection.tsx` | Header card (title + subtitle + "Re-ranked by impact" chip) followed by two banners (rose 🎯 concentration banner with "See by-rep view →" + violet ⚡ bulk-recommendation banner with "Accept all (N)" CTA), then N `CardView` cards. Each card: rank badge · "Quote #ID · Tier+Customer · Article · authority chip · ↗ Studio link" · detail HTML · rose-bordered evidence block · meta line · vertical stack of action buttons (floor/counter/approve/decline). Has `id="esc-card-{rank}"` so the active-quotes table can scroll-link into specific cards. | "See by-rep view →" calls `onJumpByRep` (Frank flow: set tab to SKU + smooth-scroll to `#quote-analysis-block`). "↗ Studio" on each card calls `nav('/pricing')`. Action buttons + "Accept all" are visual stubs (toast strings live on the data; no toast renderer wired). |
| 6 | **FunnelSection** | `frontend-v2/src/features/quotes/components/FunnelSection.tsx` | Header card with "Last 30 days" range chip · funnel chevrons (steps tinted by `tone` won/lost) · 4-cell aging grid (cells tinted by `tone` normal/warn/alert). | Read-only. |
| 7 | **QuoteToInvoiceGapCard** | `frontend-v2/src/features/quotes/components/QuoteToInvoiceGapCard.tsx` | Phase 5 card. Header + tone-colored coverage pill. Left tile: median / mean / linked-lines headline trio + interpretation line. Right tile: "By year" table, latest year flagged with `latest` badge. Footer: source table chip + collapsible heuristic disclosure. Empty state when `overall === null`: amber-tinted "No linkage data" notice. | "Real signal" pill toggles the heuristic-rule paragraph. ID `block-quote-invoice-gap` for deep-linking. |
| 8 | **GuardrailsSection** | `frontend-v2/src/features/quotes/components/GuardrailsSection.tsx` | Header (title + subtitle + history chip e.g. "↗ 12 changes in last 90d"). 4-up card grid; each card: category eyebrow · big threshold value · meta line. Hover reveals a pencil edit button per card. Right rail: "Show history" + rose "Edit thresholds" buttons. | Edit buttons are visual stubs (toast strings on the data). |
| 9 | **ActiveQuotesTable** | `frontend-v2/src/features/quotes/components/ActiveQuotesTable.tsx` | "All 47 active quotes". RAG filter segmented control (all / r / a / g) in header. Bulk-action info banner with `bulkActions` button row. 9-column table: Quote # · Customer (with `TierChip`) · Article · Quoted price · Margin (tone-colored) · Floor reference (tone-colored) · Age (badge w/ fresh/warm/stale tone) · Guardrail (RAG pill) · Action. Red rows tinted `#fef2f2`. Footer note rendered via `dangerouslySetInnerHTML`. | **Click any row** → expands inline detail (evidence block + decide-button stack); chevron rotates. RAG filter buttons set `activeFilter` local state. Row action buttons: when `rowActionTarget === 'escalation'` → calls `onJumpToEscalation(rank)` (page scrolls to `#esc-card-{rank}`) using a hard-coded id-to-rank map (`'12848' → 1`, `'12831' → 2`); the secondary "Studio" button next to it navigates to `/pricing`. When `rowActionTarget === 'studio'` → navigates to `/pricing`. `stopPropagation` on action clicks prevents the row from expanding. Bulk action buttons are visual stubs. |
| 10 | **AnalysisSection** | `frontend-v2/src/features/quotes/components/AnalysisSection.tsx` | "Where discounting concentrates". Tablist (currently only `sku` and `cust` — the `rep` tab is deferred to Heiko). Per tab: description, table (`SkuTable` or `CustomerTable`; `RepTable` exists in source but its tab is hidden), footer ⚡ banner with optional jump-link. ID `quote-analysis-block` for the escalations-section deep-link. | Tab buttons call `onTabChange`. SKU-table action buttons with id `studio` navigate to `/pricing`. Footer jump-link uses `useNavigate(tab.jumpLink.to)`. Rep-table action buttons are present in code but unreachable. |
| 11 | **CrossLinks** | `frontend-v2/src/features/quotes/components/CrossLinks.tsx` | Footer pill rail: "Cross-links →" label + list of `Link` chips (react-router). | Each chip is a `<Link to={l.jumpTo}>`. |

### Loading + error states

| State | Source | Behavior |
|---|---|---|
| `isLoading` | `useQuotes` | Renders `QuotesSkeleton` (shimmer skeleton: header bars, 4 KPI cards, escalation+funnel two-col, active-quotes 6-row block) — `frontend-v2/src/features/quotes/components/QuotesSkeleton.tsx`. |
| `error \|\| !data` | `useQuotes` | Renders inline German error: `"Fehler: {message}"` in red. |

### Shared / utility components used by the page

| Component | Source file | Used in | Purpose |
|---|---|---|---|
| **TierChip** | `frontend-v2/src/features/quotes/components/TierChip.tsx` | EscalationsSection, ActiveQuotesTable, AnalysisSection (`CustomerTable`) | 18×18px rounded badge displaying the tier letter, palette: A=rose, B=ink-3, C=amber, D=red. |
| **QuotesSkeleton** | `frontend-v2/src/features/quotes/components/QuotesSkeleton.tsx` | `QuotesPage` loading branch | Page-level shimmer skeleton. Inlines its own `pz-shimmer` keyframes. |

---

## 4. Side panels / drawers / modals

The Quotes page does **not** open any right-side drawers or full-screen modals. Every interactive surface is rendered inline:

| Surface | Pattern |
|---|---|
| `BriefingMemo` | Inline expanding card just under `PageHead`. Toggled by `QuotesPage` state. |
| Escalation card action stack | Inline column inside each card grid (`grid-cols-[40px_minmax(0,1fr)_280px]`). |
| Active-quote row detail | Inline expanded `<tr>` underneath the clicked row — evidence block + decide-button column. Single-row expansion (`expanded` local state holds the row id). |
| Heuristic disclosure on `QuoteToInvoiceGapCard` | Inline expanding `<p>` controlled by `showHeuristic` local state. |
| `EscalationsSection` "↗ Studio" + ActiveQuotes "Studio" + SkuTable "studio" action | All navigate to `/pricing` (no in-page drawer; full page transition). |

There is no `Drawer`, no `Dialog`, no `aria-modal` surface anywhere in this feature.

---

## 5. Tests covering this page

| Layer | Location | Count |
|---|---|---|
| **Vitest unit** | `frontend-v2/src/tests/quotes/QuoteToInvoiceGapCard.test.tsx` | 3 — headline + byYear + source rendering · heuristic toggle expand · empty-state when `overall === null`. |
| **Vitest cross-link** | `frontend-v2/src/tests/action-center-cross-links.test.ts` | Lists `/quotes` among target routes the action-center can deep-link into (not a Quotes-page render test). |
| **Playwright E2E** | — | None. No `.spec.ts` under `frontend-v2/tests/e2e/` references `/quotes`. |
| **Pytest contract** | `scherzinger-platform/tests/contract/test_quotes.py` | 7 — backend `/api/v1/screens/quotes` contract tests. (These guard the *shape* of `QuotesShell` that the page consumes; failures here surface to the page as type-mismatch / runtime errors.) |

Other components on this page (`PageHead`, `BriefingMemo`, `PipelineStrip`, `ChangedStrip`, `EscalationsSection`, `FunnelSection`, `GuardrailsSection`, `ActiveQuotesTable`, `AnalysisSection`, `CrossLinks`, `TierChip`, `QuotesSkeleton`) have **no dedicated unit tests**.

---

## 6. Open follow-ups (visible in source, not yet shipped)

- **Header filter chips are display-only.** `PageHead` renders `header.filters` as buttons with a chevron, but they do not `setSearchParams` or refetch. `QuotesParams` (`week`, `rep`, `customer_id`, `family`, `tier`) is accepted by the BFF and typed on the hook, but never passed by the page.
- **Briefing memo Copy / Email / PDF buttons are inert.** No clipboard / mailto / export handler wired.
- **`onJumpToEscalation` uses a hard-coded id→rank map** in `ActiveQuotesTable.tsx:175` (`{ '12848': 1, '12831': 2 }`). Any real rank lookup against `data.escalations.cards` is pending.
- **Bulk-action buttons render `toast` strings on data but no toast renderer is wired** (EscalationsSection bulk-accept, ActiveQuotesTable bulk-actions, GuardrailsSection edit/history, per-row decide buttons). Same pattern as Forecasting before action-center wiring.
- **`RepTable` exists in `AnalysisSection.tsx` but is unreachable.** The `'rep'` tab definition was removed from `TAB_DEFS` ("By sales rep" moved to Heiko per Phase 11). `QuotesPage` defaults `analysisTab='sku'` and the "See by-rep view →" link in `EscalationsSection` falls back to the SKU tab. The dead `'rep'` branch in the `active === 'rep'` switch and the entire `RepTable` component are kept for the eventual Heiko view but are dead code on the Frank page.
- **`crumbTrail`, `subPills`, `subStats` mixed inline-HTML risk.** `BriefingMemo`, `ChangedStrip`, `EscalationsSection` (concentration, bulk, detail, evidence), `GuardrailsSection` (history chip), `ActiveQuotesTable` (bulk info + evidence + footer), `AnalysisSection` (SKU insight + tab footer), `QuoteToInvoiceGapCard` (interpretation is plain text, but no other field is) all use `dangerouslySetInnerHTML`. BFF is the trust boundary; if non-Pryzm content ever lands in these fields the page is XSS-exposed.
- **No Playwright coverage for the Quotes page.** Forecasting has 4 specs + visual snapshots; Quotes has 0.

---

## 7. Quick file map

```
frontend-v2/src/features/quotes/
├── index.tsx                                ← page shell, dispatch
├── components/
│   ├── PageHead.tsx                         ← crumbs + title + filter chips + briefing CTA
│   ├── BriefingMemo.tsx                     ← editable briefing card
│   ├── PipelineStrip.tsx                    ← 4 KPI counters
│   ├── ChangedStrip.tsx                     ← "What changed since Monday"
│   ├── EscalationsSection.tsx               ← header + banners + escalation cards
│   ├── FunnelSection.tsx                    ← funnel chevrons + aging quartet
│   ├── QuoteToInvoiceGapCard.tsx            ← Phase 5 quote→invoice margin gap
│   ├── GuardrailsSection.tsx                ← threshold cards + edit CTA
│   ├── ActiveQuotesTable.tsx                ← 47 quotes, RAG filter, expandable rows
│   ├── AnalysisSection.tsx                  ← SKU / Customer tables (rep tab deferred)
│   ├── CrossLinks.tsx                       ← footer cross-links rail
│   ├── TierChip.tsx                         ← shared tier letter chip
│   └── QuotesSkeleton.tsx                   ← page-level loading skeleton

(data hook lives one level up)
frontend-v2/src/data/api/
└── useQuotes.ts                             ← TanStack hook → /screens/quotes

(types)
frontend-v2/src/types/quotes.ts              ← QuotesShell + every sub-type

(cache keys)
frontend-v2/src/lib/api/queryKeys.ts:36      ← QuotesParams
frontend-v2/src/lib/api/queryKeys.ts:79      ← qk.quotes()

(routing)
frontend-v2/src/app/router.tsx:20            ← lazy import QuotesPage
frontend-v2/src/app/router.tsx:87            ← /quotes route

(cross-reference — Heiko sibling page, NOT in this feature folder)
frontend-v2/src/features/persona-overview/DealInboxPage.tsx     ← /deal/inbox

(backend)
scherzinger-platform/backend/api/v1/screens.py:192               ← GET /screens/quotes
scherzinger-platform/backend/services/quotes/composer.py:40      ← build_quotes()
scherzinger-platform/backend/schemas/screens/quotes.py           ← QuotesShell (pydantic)

(tests)
frontend-v2/src/tests/quotes/QuoteToInvoiceGapCard.test.tsx      ← 3 vitest cases
scherzinger-platform/tests/contract/test_quotes.py               ← 7 pytest contract cases
```
