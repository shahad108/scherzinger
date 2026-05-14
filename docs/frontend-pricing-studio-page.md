# Frontend Pricing Studio Page — Reference

> Last updated: 2026-05-14. Mirrors the state of `demo-phase45` branch at HEAD `5545956`.
>
> Source of truth lives in `frontend-v2/src/features/pricing-studio/`. This document indexes every component the page can render, in render order, with data sources and interactions.

## 1. Entry point

| File | Role |
|---|---|
| `frontend-v2/src/features/pricing-studio/index.tsx` | Page shell. Reads `?aid` from URL, fetches data via `useStudio`, resolves the active SKU (URL → local selection → `data.defaultAid`), builds a `HeroView` (default workbench, per-SKU `shortHero`, or fallback "Article {aid}"), and dispatches into the two-column workbench grid. Adds the `pz-fullbleed` body class on mount. |

Route entry: `PricingPage` lazy-imported as `@/features/pricing-studio` in `frontend-v2/src/app/router.tsx`, mounted at `/pricing`.

### URL parameters (read by `PricingStudioPage` + children)

| Param | Read in | Default | Effect |
|---|---|---|---|
| `aid` | `index.tsx:24`, `DeepLinkBanner` | — | Selects the SKU by article id. Survives a `setSelectedAid` user pick until the URL aid changes. If `aid` does not match any SKU in `data.skus`, `DeepLinkBanner` renders an amber "SKU not found in Studio" banner (the page does NOT navigate away). |
| `recommendation` | `index.tsx:139`, `DeepLinkBanner:44`, `DecisionFooter:33` | — | `source_ref` (or UUID) of the originating recommendation. Triggers `useRecommendation` fetch; banner shows title / kind / cluster / status / latest-proposal status. Threads into `useProposals` filter and into the `CreateProposalBody.recommendation_id` for any proposal saved from the footer. |
| `abTest` | `DeepLinkBanner:45` | — | A/B test id (Phase 4+). When set without a `recommendation`, banner title becomes `A/B test {id} · {aid}`. |
| `queue` | `DeepLinkBanner:46` | — | Queue context (`repricing` or `renewals`). Drives the banner breadcrumb (`Queue: Repricing queue` / `Renewal queue`) and falls back as the banner title when no recommendation/abTest is present. |
| `source` | `DeepLinkBanner:47` | — | Origin screen (`action-center`, `margin`, `forecasting`, `quotes`). Renders the "Back" pill on the deep-link banner pointing to `/action-center` or `/{source}`. |

The Studio query itself (`useStudio()`) is called with no params — there are no other shell-level URL filters today.

### Data source

- Hook: `useStudio()` in `frontend-v2/src/data/api/useStudio.ts`.
- Endpoint: BFF `/screens/studio` (FastAPI `screens` router).
- Returns a `StudioShell` (see `frontend-v2/src/types/studio.ts`). Each SKU is post-processed by `enrichSkus` — the `defaultAid` SKU receives the shell's `workbench`; others receive a `workbench` built via `buildWorkbench(sku, workbenchPatch, baseWorkbench)` from `frontend-v2/src/data/api/studio-workbench.ts`.
- Stale time: 60s. React Query key: `qk.studio(params)`.

Companion hooks called from sub-components:

| Hook | File | Endpoint | Used by |
|---|---|---|---|
| `useRecommendation(ref)` | `frontend-v2/src/data/api/useRecommendation.ts` | `GET /recommendations/{ref}` (falls back to a synth mock when offline) | `DeepLinkBanner` to label the contextual banner. Returns `{ recommendation, latest_proposal }`. |
| `useProposals({ article_id, recommendation_id, status_filter? })` | `frontend-v2/src/data/api/useProposals.ts` | `GET /pricing/proposals` (mock fallback reads `sessionStorage.pryzm_v2_synth_proposals`) | `ProposalContextPanel`. Enabled only when `article_id` or `recommendation_id` is present. Stale 30s. |
| `useCreateProposal()` | same file | `POST /pricing/proposals` | `DecisionFooter` Save / Queue / Escalate buttons. Mock fallback writes to the synthetic store. |
| `useSubmitProposal()` | same file | `POST /pricing/proposals/{id}/submit` | `ProposalContextPanel` "Submit for approval" per-row button. |

### Page-shell render order (top → bottom)

```
PageHead                            (crumbs + title + subPills + subStats)
DeepLinkBanner                      (only when ?aid is unknown, OR ?recommendation/?abTest/?queue present)

ws-grid
├── SkuPicker                       (left rail)
└── ws-bench                        (right column)
    ├── WorkbenchHero               (eyebrow + chips + current price/margin/target)
    ├── PriceOptions                (Hold / Cost-floor / Market / Custom / A/B vs hold)
    ├── ws-body
    │   ├── CustomerFanout
    │   └── CostHistory
    ├── ComparablePanel             (only when selectedSku.isNew)
    ├── ProposalContextPanel        (hidden when no proposals for this SKU)
    ├── DecisionFooter
    └── RationaleMemo

CrossLinks                          (footer)
```

While `useStudio()` is loading, the page returns `<StudioSkeleton />` instead.

---

## 2. Component roster — top → bottom

Source: `PricingStudioPage` in `index.tsx:107`. Every render in the page in order; shared components called out explicitly.

| # | Component | Source file | What it shows | Key interactions |
|---|---|---|---|---|
| 1 | **PageHead** | `components/PageHead.tsx` | Three-segment breadcrumb (`crumb1 / crumb2 / **crumb3**`), page H1 title, and two strips below: `subPills` (rounded tags) + `subStats` (`<b>value</b> label`). Purely presentational. | Read-only. Data from `data.header` (type `StudioHeader`). |
| 2 | **DeepLinkBanner** | `components/DeepLinkBanner.tsx` | One of two states: (a) **SKU-not-found** — amber border, message "SKU not found in Studio: {aid}" plus an explanation citing the `source` page; (b) **contextual banner** — uppercase breadcrumb (`From Action Center` / `Queue: Repricing queue` / `A/B test detail` / `Recommendation context`), recommendation title (or fallback), kind label (`Margin erosion` / `Cost riser` / `Churn risk`), cluster, current `status` mapped via `STATUS_LABEL`, latest proposal status, plus optional A/B and queue chips. Returns `null` when none of `recommendation`/`abTest`/`queue` are present and the SKU is found. | "Back" pill (only when `?source` set) navigates to `/action-center` or `/{source}`. Close (X) button strips `recommendation`, `abTest`, `queue`, `source` from the URL via `setParams(next, { replace: true })`. Fetches via `useRecommendation(recommendationRef)`; "Loading recommendation context…" placeholder while pending. |
| 3 | **SkuPicker** | `components/SkuPicker.tsx` | Left-rail list of SKUs flagged for repricing. Header shows visible count. Filter chip row from `data.filters` (one of `SkuFlag`: `all` / `floor` / `stale` / `cost` / `frame`) + toggle chips from `data.toggles` (e.g. `hide-locked`, `new-skus`) initialised from each toggle's `defaultActive`. Each list row: AID, margin chip with tone (`lo`/`mid`/`hi`), `productLine · meta`, cluster chip with tone, `🔒 Locked` flag when locked, and a right-side `tag` chip (tone `floor`/`stale`/`cost`/`frame`). | Click filter chip → sets `activeFilter`. Click toggle chip → flips `toggleState[t.id]` (e.g. hide locked / show new SKUs). `hide-locked` tooltip: "Hide contract-locked SKUs (relevance filter — Frank)"; `new-skus` tooltip: "Surface SKUs without history — comparable-cluster pricing". Click row → `onSelect(aid)` → parent sets `selectedAid` (URL `?aid` is **not** updated; it remains the deep-link source of truth). |
| 4 | **WorkbenchHero** | `components/WorkbenchHero.tsx` | Right-column hero card. Renders `eyebrow`, H3 `title`, italic-aware `sub` (via shared `renderInline`), chip row (`HeroChipData[]` with optional `variant` like `movable` / `dashed`), `meta` line, and the price/margin block: `currentPrice` big number, `currentMargin` with tone class (`bad`/`good`), `targetText`. Hero source depends on the selected SKU: default SKU → `data.workbench.hero`; SKUs with `shortHero` → a derived view from `shortHero` + computed chips (cluster + Movable/Locked + "A/B status: not yet tested" + approval chip); other SKUs → fallback hero `Article {aid}` "No detailed workbench data — showing default model." | Read-only. |
| 5 | **PriceOptions** | `components/PriceOptions.tsx` | Five option cards: **Hold** (current price, "no change"), **Cost-floor** (selected by default), **Market anchor**, **Custom** (`<input type="number" step="0.01">` for an arbitrary €/unit), **A/B vs hold** (`AbOption` with `slice` / `meta` / `takeaway` / `criterion`). Each non-custom card shows label, price, delta, impact (with `neg` tone tint), and a `risk` line split by ` · ` (last segment italicised). Header "Pick a target price" + `optionsSub` + "🔍 Why this price?" link-button. | Click any card → `setActive(id)`. Editing the Custom input also flips `active` to `custom`. An `useEffect` propagates the active selection to the parent via `onActiveChange({ id, price, label })`; the parent feeds `activeOption.price` into `CustomerFanout.fanPrice` and into `DecisionFooter`'s "You're proposing …" line and the proposal payload. |
| 6 | **CustomerFanout** | `components/CustomerFanout.tsx` | Inside `ws-body` (left column). "Customer fan-out · this SKU only" pane. Header italicises the active price: `if priced at <b>{fanPrice}</b> ({label})` — label parsed from the data's `paneSub` parenthetical. Cluster note line via `renderInline`. Rows: tier chip (`A`/`B`/`C`/`D`) + customer name + sub + optional rose-deep `customerSubExtra` italic + amount + amountSub + churn% chip (tone `r`/`g`) + recommendation text. Each row tinted by `rowTone` (`alert`/`warn`/`plain`). | Read-only. `fanPrice` recomputes when `PriceOptions` selection changes. |
| 7 | **CostHistory** | `components/CostHistory.tsx` | Inside `ws-body` (right column). "Cost composition" pane with sub from `cost.paneSub` (renderInline). Stacked component bars (material/labor/outsourcing/overhead) with per-component % width. Foot note + permanent cross-link to "Margin Intelligence" for the 24-mo cost-vs-price trajectory. Below that: a small "cost-traj" mini-chart strip (year delta range + materialPoints / quotedPoints + legend). History table of `HistoryRow[]` (date · move · vol with `up`/`down`/`flat` tone · by · hash). | Read-only. |
| 8 | **ComparablePanel** | `components/ComparablePanel.tsx` | **Conditional — only when `selectedSku.isNew === true`.** Comparable-cluster benchmarking for new SKUs without history. Header with `title` + `subtitle`. Grid of tiles (`variant`: `plain` / `bench` / `suggest`): `lab` / `big` number / `cap` (renderInline) / optional `capExtra` / optional confidence chip. Below: "other comparables" list (from `data.comparable.others`). | Read-only. |
| 9 | **ProposalContextPanel** | `components/ProposalContextPanel.tsx` | **Conditional — only renders when there is ≥1 proposal for this SKU/recommendation.** Phase-5 lifecycle card. Header: "Pricing proposals · {articleId}" + count + "Filtered by the recommendation that opened this page." when `recommendationId` set. Per-proposal row: status chip (`draft` / `pending_approval` / `approved` / `implemented` / `rejected`) with icon + tone, `€{current} → €{proposed}` with `Δ +X.Xpp`, created timestamp + " · MD approval required" when applicable. | Per-row **Submit for approval** button on `draft` rows → `useSubmitProposal().mutate(p.id)`. Disables while pending. Cache invalidation handled by the hook (keeps Action Center status chip in sync). |
| 10 | **DecisionFooter** | `components/DecisionFooter.tsx` | Decision strip. Summary line: "You're proposing **{price}** on Article **{aid}** · projected margin **{margin}** · projected recovery **{recovery}** · **{riskLine}**." Active proposed price comes from `activeOption.price` when set, else `data.summary.proposedPrice`. Inline error alert (red) when the proposed price can't be parsed or the mutation fails. Controls row: `effectiveDate` (`<input type="date">` initialised from `data.effectiveDate`) + four `notify` checkboxes (sales / customers / escalate / abTest) labelled via `renderInline`. Buttons: **Save as proposal** (primary, `approval_required=false`), **Add to weekly queue** (`approval_required=true`), **Push to quoting** (dark; disabled stub — `useUiAction` toast "Push-to-quoting flips the live price book — backend endpoint required (Phase 7+)"), **Escalate to Till** (`approval_required=true`, toast "Escalated to Till for approval"), **Branded PDF** (disabled stub — "Branded PDF export ships in Phase 6 (reports MVP)."). | `useCreateProposal()` mutation. `parsePrice` strips €/whitespace and re-parses; `deltaPp` computed from proposed vs `currentPriceLabel`. On success → `useUiAction` toast `"{label} for {aid} (proposal {shortId}, {status})."`. On error → inline alert (panel stays open). `recommendation_id` from `?recommendation` is included on every save. |
| 11 | **RationaleMemo** | `components/RationaleMemo.tsx` | Pre-filled memo card. Header: title + "click to edit" hint + three buttons: **📋 Copy**, **✉ Email to Till**, **⬇ Branded PDF**. Body is a `contentEditable` div (with `suppressContentEditableWarning`) rendering `data.paragraphs[]` — `renderInline` for each paragraph; paragraphs marked `isSig` get the `.sig` class. | Memo body is locally editable in the DOM. Copy / Email / PDF buttons are not wired to handlers in this component (presentational). |
| 12 | **CrossLinks** | `components/CrossLinks.tsx` | Footer strip "Cross-links →" with one pill per entry in `data.crossLinks` (each is a `{ label }`). | Buttons render but have no `onClick` wired — purely visual hand-off. |

### Shared / internal-only helpers

| Module | File | Purpose |
|---|---|---|
| **renderInline** | `components/renderInline.tsx` | Tiny markdown-lite formatter — splits on a single regex (`**bold**` / `*italic*` / `` `code` ``) and returns React nodes. Used by `WorkbenchHero`, `CustomerFanout`, `CostHistory`, `ComparablePanel`, `RationaleMemo`, and `DecisionFooter`. Pricing-Studio-local (not shared with Forecasting). |
| **StudioSkeleton** | `components/StudioSkeleton.tsx` | Page-level loading state shown by `PricingStudioPage` while `useStudio` is pending or the hero view can't be built yet. Local `Bar` + `Card` helpers driving a `pz-shimmer` animation. |
| **useUiAction** | `frontend-v2/src/hooks/useUiAction.ts` (shared) | Toast / disabled-feedback hub. Used by `DecisionFooter` for success toasts and for the "Push to quoting" / "Branded PDF" disabled stubs. |
| **buildWorkbench** | `frontend-v2/src/data/api/studio-workbench.ts` | Patches a SKU's `workbenchPatch` onto the shell base workbench inside `useStudio.enrichSkus`. Not rendered, but every workbench downstream of the default SKU originates here. |

---

## 3. Side panels / drawers / modals opened from inside the page

There are **no drawers or modal dialogs** mounted by Pricing Studio. The page is intentionally single-surface: the workbench grid is the dialog. Surfaces that look modal-like in the layout are inline panels:

| Surface | Component | Trigger |
|---|---|---|
| Deep-link banner | `DeepLinkBanner` | URL has `?aid` (unknown SKU), `?recommendation`, `?abTest`, or `?queue`. Dismiss strips those four params and the banner unmounts. |
| Proposal lifecycle card | `ProposalContextPanel` | `useProposals({ article_id, recommendation_id }).data.items.length >= 1`. Auto-hides otherwise. |
| Comparable-cluster panel | `ComparablePanel` | `selectedSku.isNew === true`. |

Outbound navigations (no drawer — full route change):

- `DeepLinkBanner` "Back" pill → `navigate('/action-center')` or `navigate('/{source}')`.
- `CrossLinks` pills currently have no handlers attached.

---

## 4. Tests covering this page

| Layer | Location | Count | Coverage |
|---|---|---|---|
| **Vitest unit** | `frontend-v2/src/tests/pricing-studio/deep-link.test.tsx` | 1 file | Renders `<PricingStudioPage>` inside `MemoryRouter` at `/pricing?aid=200832-E&recommendation=margin_erosion%3A200832-E&source=action-center` and asserts the contextual banner appears. Also exercises the SKU-not-found path (Phase 2 acceptance criterion: no redirect). |
| **Vitest unit** | `frontend-v2/src/tests/pricing-studio/proposals.test.tsx` | 1 file | Phase-5 proposal lifecycle. Resets `sessionStorage` between tests, drives `useCreateProposal` + `useSubmitProposal` through `ProposalContextPanel`, asserts a new draft renders and the Submit-for-approval button advances status to `pending_approval`. |
| **Playwright E2E** | `frontend-v2/tests/e2e/` | 0 | No `pricing-studio.spec.ts` exists. Only `forecasting-actual-entry.spec.ts` and `forecasting-visual.spec.ts` are present today. |
| **Playwright visual** | — | 0 | No visual baselines for `/pricing`. |
| **Pytest (proposals API)** | `scherzinger-platform/backend/...` | n/a (not enumerated by this doc) | Lives in the platform repo; out of scope here. |

---

## 5. Open follow-ups (documented inline or by behaviour)

- **`Push to quoting`** button in `DecisionFooter` is a disabled stub — calls `useUiAction({ disabledReason: 'Push-to-quoting flips the live price book — backend endpoint required (Phase 7+).' })`. The quoting BFF endpoint is the unblocker.
- **`Branded PDF`** button in `DecisionFooter` is a disabled stub — `disabledReason: 'Branded PDF export ships in Phase 6 (reports MVP).'`
- **`RationaleMemo` Copy / Email / PDF buttons** are not wired to handlers — the body is `contentEditable` but nothing persists the edits or triggers a real export.
- **`CrossLinks` footer pills** have no `onClick`. Labels render but the destinations aren't routed yet.
- **`useStudio` cannot be parameterised today** — the hook accepts `StudioParams` (see `qk.studio`) but `PricingStudioPage` calls it with no args; there are no shell-level filter URL params (`tier`, `family`, `cluster`) like Forecasting has.
- **URL ↔ local-state divergence** — clicking a SKU in `SkuPicker` updates `selectedAid` in component state but does **not** push the new `aid` into the URL. The Phase-2 comment (`index.tsx:21–25`) calls this out: URL aid wins on (re)navigation; local picks are session-only.
- **Synthetic proposal store** (`sessionStorage.pryzm_v2_synth_proposals`) — `useProposals`/`useCreateProposal`/`useSubmitProposal` fall back to a session-scoped synthetic store when offline / pure-mock. Real backend usage drops this code path.
- **`useRecommendation` mock synth** — when the BFF is unreachable, `synthesizeMock(ref)` fabricates a recommendation row from the `ref` string (`kind:articleId`). Banner copy degrades gracefully but the lifecycle status chip will always read `Open`.

---

## 6. Quick file map

```
frontend-v2/src/features/pricing-studio/
├── index.tsx                              ← page shell, ?aid + hero resolution + grid
└── components/
    ├── PageHead.tsx                       ← crumbs + title + subPills + subStats
    ├── DeepLinkBanner.tsx                 ← ?aid-unknown banner + ?recommendation/?abTest/?queue context
    ├── SkuPicker.tsx                      ← left rail (filters, toggles, list)
    ├── WorkbenchHero.tsx                  ← hero card (eyebrow, chips, price/margin/target)
    ├── PriceOptions.tsx                   ← Hold / Floor / Market / Custom / A/B vs hold
    ├── CustomerFanout.tsx                 ← per-customer fan-out at active price
    ├── CostHistory.tsx                    ← cost composition + history table
    ├── ComparablePanel.tsx                ← new-SKU comparable-cluster grid
    ├── ProposalContextPanel.tsx           ← Phase-5 proposal lifecycle list
    ├── DecisionFooter.tsx                 ← effective date + notify + Save/Queue/Escalate
    ├── RationaleMemo.tsx                  ← editable memo card + Copy/Email/PDF
    ├── CrossLinks.tsx                     ← footer cross-link pills (no handlers yet)
    ├── StudioSkeleton.tsx                 ← page-level loading state
    └── renderInline.tsx                   ← shared markdown-lite (**bold** / *italic* / `code`)

frontend-v2/src/data/api/
├── useStudio.ts                           ← page data fetch (/screens/studio) + enrichSkus
├── studio-workbench.ts                    ← buildWorkbench(patch, base) used by enrichSkus
├── useRecommendation.ts                   ← banner context (/recommendations/{ref})
└── useProposals.ts                        ← list/create/submit proposals (/pricing/proposals…)

frontend-v2/src/types/
└── studio.ts                              ← StudioShell, SkuListEntry, WorkbenchData, PriceOption,
                                            FanoutPane, CostPane, HistoryRow, MemoData, ComparablePanel, …

frontend-v2/src/tests/pricing-studio/
├── deep-link.test.tsx                     ← Phase-2 deep-link contract + SKU-not-found
└── proposals.test.tsx                     ← Phase-5 proposal lifecycle round-trip
```
