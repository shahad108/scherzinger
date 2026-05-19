# Pricing Studio — Production Hardening Plan

**Date:** 2026-05-18
**Status:** Plan v1 (awaiting approval)
**Scope:** Frank persona only. Till/Heiko handoff endpoints are in scope only where they ride on a Frank action.
**Source of truth:** [`PRODUCT_END_GOAL_AND_ROADMAP.md`](./PRODUCT_END_GOAL_AND_ROADMAP.md) §6.2 + §7 + §8 + §10.

---

## 0. Honest current-state assessment

Pricing Studio is **not** a greenfield. It is the most-built screen in the app, with ~50 React components across 9 historical implementation phases and a full BFF lifecycle (recommendations → proposals → approval routing → publish → audit → A/B test). It already has:

- Live `GET /screens/studio` shell + `GET /screens/studio/workbench/{aid}` per-SKU workbench.
- A full proposal lifecycle table (`pricing_proposals`) with approval routing (`approval_instances`, `approval_actions`, `approval_routes`).
- A real audit table (`pricing_audit`) and immutable lineage table (`lineage_refs`).
- Working publish + rollback (within 72h) via `price_book` + `publish_receipts`.
- Working A/B test lifecycle (`ab_tests` + `ab_test_results` + `ab_test_assignments`).
- SSE-driven invalidation for pricing/audit/proposal/cost streams.
- Batch repricing preview + commit (`pricing_batches` + `pricing_batch_items`).

**What is wrong today** (the honest part):

1. **Silent exception swallowing** in `workbench_service._attach_phase{1,2,3,8}_signals()` — same anti-pattern that hid the `invoice_date`/`date` column bug in Action Center. Phase-1 (recommendation/WTP/curve) failures render as a generic "DataMissingBadge" instead of an actionable error.
2. **Seed/mock pathways still active.** `useProposals` falls back to `sessionStorage.pryzm_v2_synth_proposals`. `studio-workbench.ts` carries hardcoded `CUSTOMER_SETS` (~250 lines of seed customers per cluster). `_seed.py` still feeds `studio.json` into the shell composer.
3. **Action Center → Pricing Studio SKU flow has TWO inconsistent paths.** DecisionCards routes via `/pricing?decision={rank}&source=action-center` (rank is a UI-side ordinal, not a stable ID). SkuTable routes via `/pricing?aids={csv}` for bulk. Pricing Studio reads `?aid=` for single + `?aids=` or `?batch_aids=` for batch. Result: clicking a decision card opens Pricing Studio with **no SKU selected** unless we resolve `decision=rank` → article-id.
4. **Cost outlook contract is loose.** `CostTrajectoryDrawer` calls `GET /screens/studio/cost-outlook` (no aid param? aid in body?) — no typed wire shape. Backend has `/pricing/sku/{aid}/cost-outlook` but no Phase-3 v3 hook on the FE actually targets it.
5. **A/B test slice + cohort assignment unimplemented.** `ab_tests.slice_pct` is stored, `ab_test_assignments` table exists, but no generator wires them on create. Eligibility/criterion JSONB is captured but never enforced at runtime.
6. **Scheduled publish has no trigger.** Rows land in `scheduled_publishes(status='pending')` but nothing polls. Effective-at futures will silently never fire.
7. **Price-book rollback doesn't revert `price_state`.** A rollback marks `publish_receipts.rolled_back_at` but `price_state.current_price` stays at the post-publish value. Downstream consumers (Quotes, Studio queue margin column) keep showing the rolled-back price as current.
8. **Approval rules load file path is hot-read per submit.** Misnamed/missing file → 500 at submit time. No file-watcher, no fallback to the seeded `approval_routes` table.
9. **No `share_decision` deep-link from Studio.** The action dispatcher accepts `share_decision` (writes a Notification + Note), but the Studio DecisionFooter has no "Send to Till / Heiko" button wired to it.
10. **Locked-feature treatment is partial.** SKU-row `locked` chip exists. But the roadmap-§8 lock states (contract, competitor intel, elasticity confidence bands, ERP publish, commodity forecast) are not surfaced as locked blocks in Studio.
11. **Lineage drawer has no live data hook.** `LineageDrawer.tsx` is mounted; `usePricingLineage` is missing.
12. **Chart legibility on small viewports.** WinProbCurve, DriverWaterfall, OptionMarginMicroWaterfall, CostHistory, SimulationDrawer fan-chart — none have responsive tick-density rules or minimum stroke widths. Driver-waterfall labels wrap on <1280px containers.

Treat this plan as: **take a working but fragile screen from 7.5/10 demo-prototype to ~9/10 client-shippable production.**

---

## 1. Iron rules (apply to every task)

These come from the Action Center plan and the no-hardcoded-numbers memory rule. Non-negotiable.

1. **No hardcoded domain numbers in `frontend-v2/`.** Every €, %, count, days, sample size must come from a BFF response. The three remaining hardcoded constants from Action Center (`timeMinutes`, `confLabel` string, recommendation CTA copy) are **out of scope here** — they get fixed when we do the unified recommendation card.
2. **Live first, mock second.** If the backend doesn't yet produce a number, build the backend route first OR mark the FE block `Locked` per Roadmap §8. Never invent a value.
3. **No silent exceptions.** Every `try/except` in studio services must either (a) re-raise as a typed error, (b) propagate metadata into the response payload (`{status: 'degraded', reason: ...}`), or (c) include a `logger.exception` line — never bare `pass`.
4. **Single source of truth for selected SKU.** `GET /screens/studio/workbench/{aid}` is canonical. Composer + FE must merge live workbench data into the page; no static seed merge.
5. **Decimal-as-string discipline preserved.** No client-side number coercion that loses precision.
6. **Cross-screen contract: Action Center and Pricing Studio show the same SKU set.** Same SQL filters, same lifecycle filter, same ordering rule. Any divergence must be deliberate and documented in §2.
7. **Theme parity with Action Center.** Same tokens, spacing, hairlines, rounded-2xl cards, rose/warm-gray palette. No off-theme local CSS overrides.
8. **Every interactive element ships with empty / loading / error states.** Three-state coverage is part of acceptance, not polish.
9. **Every chart must be legible at 1280px container width.** Axis labels, tick density, stroke ≥ 1.5px, no overlapping text.

---

## 2. Hierarchy diagram + cross-screen SKU flow

### App tree (Frank surfaces)

```
RootLayout
├── TopBar (greeting, persona, language, date)
├── Sidebar (action-center · forecasting · pricing · margin · quotes · ai · settings)
├── Main
│   ├── /action-center            ← Action Center (shipped)
│   ├── /pricing                  ← Pricing Studio  (THIS PLAN)
│   │   ├── SkuPicker             (left rail)
│   │   ├── ws-bench
│   │   │   ├── PageHead          (header + cross-links + approval bell + alert bell)
│   │   │   ├── TriggerContextBanner ← if ?source=action-center, ?reason=…
│   │   │   ├── RecommendationHero ← recommended price + confidence + band
│   │   │   ├── RecommendationKpiTiles
│   │   │   ├── WtpBandStrip
│   │   │   ├── WinProbCurve
│   │   │   ├── DriverWaterfall
│   │   │   ├── OptionMarginMicroWaterfall (per variant)
│   │   │   ├── CustomerFanout    → CustomerDrillInDrawer
│   │   │   ├── CostHistory       → CostTrajectoryDrawer
│   │   │   ├── ComparablePanel   (new-SKU only)
│   │   │   ├── ProposalContextPanel
│   │   │   │   └── ApprovalStepper
│   │   │   ├── DecisionFooter    (Accept · Reject · A/B · Share · Submit · Publish)
│   │   │   ├── WhatChangedStrip  → AuditDrawer
│   │   │   ├── ABTestCard
│   │   │   ├── LineageDrawer     (mounted via LineageDrawerContext)
│   │   │   ├── SimulationDrawer
│   │   │   └── CompareDrawer
│   │   └── BatchWorkbench (when mode=batch)
│   │       └── BatchApprovalDrawer
│   ├── /margin                   ← Margin Cockpit
│   ├── /quotes                   ← Quotes & Guardrails
│   ├── /forecasting              ← Forecasting
│   ├── /ai                       ← AI Briefing
│   └── /settings                 ← Settings
└── RightRail (notifications, reviewers, sections)
```

### Shared state stores

- `useUiStore` — sidebar collapsed, right-rail collapsed, last-persona.
- `useStudio()` — TanStack Query, key `['studio']`, fetches `/screens/studio`, 60s staleTime.
- `useStudioWorkbench(aid)` — key `['studio', 'workbench', aid]`, lazy.
- `useFanoutRescore(aid, price)` — key `['fanout', aid, price]`.
- `useProposals({article_id})` — key `['proposals', article_id]`.
- `useApprovalInbox()` — key `['approvals', 'inbox']`, 30s.
- `useAuditFeed(aid, pills)` — infinite query keyed by `['audit', aid, pills]`.
- SSE: `pricingStream`, `auditStream`, `proposalStream`, `costStream` — invalidate the matching React Query keys.

### Cross-screen SKU flow — Action Center → Pricing Studio

**Current state (broken/inconsistent):**

| From | Route emitted | What Studio receives | Problem |
|---|---|---|---|
| Action Center · DecisionCards · "Open in Pricing Studio" | `/pricing?decision={rank}&source=action-center` | `rank` is a UI ordinal (1–12), not stable | Studio cannot resolve to an `aid`; falls through to default workbench |
| Action Center · SkuTable · "Open in Studio" | `/pricing?aids={csv}&source=action-center` | comma list of article IDs | Works for *batch*; single-SKU click also goes into batch mode |
| Action Center · BucketFilterRow cmd-click | `/pricing?queue=churn` (etc.) | `queue` param ignored by Studio | Studio doesn't filter |
| Right rail "Open repricing queue" link | `/pricing#queue` | hash ignored, no scope | No state delivered |

**Target state:**

| From | Route emitted | Studio behaviour |
|---|---|---|
| DecisionCard primaryAction (single SKU) | `/pricing?aid={article_id}&recommendation={rec_id}&source=action-center&reason=churn|cost_riser|margin_erosion` | Studio opens workbench for that aid, shows TriggerContextBanner, pre-loads the matching recommendation row |
| DecisionCard primaryAction (customer-level churn — no aid) | `/pricing?customer={cid}&recommendation={rec_id}&source=action-center&reason=churn` | Studio opens in "customer scope" mode — SkuPicker filtered to that customer's SKUs |
| SkuTable single row "Open in Studio" | `/pricing?aid={article_id}&source=action-center` | Single mode, that aid selected |
| SkuTable bulk-select "Open N in Studio" | `/pricing?mode=batch&aids={csv}&source=action-center` | Batch mode pre-staged |
| BucketFilterRow cmd-click queue chip | `/pricing?queue=churn` | Studio opens with SkuPicker filtered to queue's SKUs |
| "Show all" Action Center expander → "Open all in Studio" | `/pricing?mode=batch&aids={csv}&source=action-center` | Batch mode |

**SKU set parity guarantee.** The same SKU shown in Action Center MUST appear in Pricing Studio's queue under identical filters. Concretely:

- Action Center's `decisions[]` list ⊆ Pricing Studio's `studio.shell.skus[]`.
- Pricing Studio SkuPicker's queue **defaults to** "SKUs that appear in today's Action Center decisions" — sort by impact-score descending — so cmd-tabbing between screens shows the same items.
- The shared filter dimension is **article_id** (not rank, not recommendation-id, not name).
- Margin %, recommended price, cluster, confidence on a given aid must match byte-for-byte between Action Center and Pricing Studio (one builder, two consumers).

### Same vs different — Action Center vs Pricing Studio representation of one SKU

| Field | Action Center | Pricing Studio | Should be identical? |
|---|---|---|---|
| `article_id` | yes | yes | yes (canonical) |
| `description` | "Zahnradpumpe MV0666" | "Zahnradpumpe MV0666" | yes |
| `commodity_group` | "BKAES" | "BKAES" | yes |
| `current_margin` | from invoices db2_margin | from `price_state` ÷ `cost_state` | **mismatch risk** — invoice avg vs current-price-vs-current-cost |
| `cluster_confidence` | from cluster sample-size formula | from `model_cluster_metrics` lookup | **mismatch risk** — different sources |
| `revenue_at_risk` | trailing-12mo invoice sum | quote-pipeline sum | mismatch by design (different question) |
| `recommended_price` | not shown | from `pricing.recommendation.build_recommendation()` | n/a |
| `current_price` | not shown | from `price_state` | n/a |
| `last_move_days` | shown ("—" today) | shown in audit drawer | should be identical (single source) |

**Resolution (in Phase 1 of this plan):** unify the margin + cluster-confidence source so the two screens never disagree on the same SKU. If invoice-avg-margin and `price_state`-derived margin diverge, surface both with clear labels ("Trailing margin" vs "Current point margin") — don't pick one silently.

---

## 3. Target screen hierarchy (per roadmap §6.2)

The page must render in this order, top to bottom, on first paint:

1. **PageHead** — breadcrumb, "Open from Action Center" trigger banner (if `?source=action-center`).
2. **SKU queue** (left) + **Selected SKU hero** (right) — the workbench grid is the page's spine; everything else is panels inside the right side.
3. **Recommendation hero** — recommended price + delta + confidence + band + "Why this price?" inline summary.
4. **Recommendation explanation** — top drivers (DriverWaterfall) + WTP band strip + win-prob curve.
5. **Evidence tabs** (tabbed inside the right column) — Cost history · Quote history · Customer fanout · Comparable SKUs · Lineage. Each tab has its own loading/empty/error state.
6. **Simulation + Compare** (drawers, opened from buttons in DecisionFooter).
7. **Decision footer** (always-visible sticky bar) — Accept · Reject · A/B Slice · Share · Submit for approval · Publish · Branded PDF.

Anything else (alerts banner, what-changed strip, audit drawer trigger, approval inbox bell, batch-mode toggle, saved views menu) stays as utility chrome — visible but never dominating the layout.

---

## 4. Locked / Pilot future-feature blocks (per roadmap §8)

These must appear in the page even when the data isn't there, so the product's ambition is visible without faking:

| Block | State today | UI treatment | Unlock requirement |
|---|---|---|---|
| Movable revenue (cluster level) | Pilot | "Pilot heuristic" badge on cluster confidence chip | Reliable `is_movable` flag or contract table |
| Elasticity confidence band | Pilot | Locked overlay on WinProbCurve labelled "Pilot — needs more quote outcomes" if `n_deals < 12` | ≥12 won-vs-lost outcomes per cluster |
| Competitor signal | Locked | Card slot in Evidence-tabs row, locked icon + "Locked — competitor data not connected" | Competitor feed integration |
| Contract status | Locked | Chip slot next to "Movable/Locked" — locked icon + "Locked — contract table not connected" | `contracts` table with start/end + customer-SKU FK |
| ERP push | Locked | "Publish to price book" button replaced by Locked tile + "Awaiting ERP integration" | ERP/CPQ credentials + approval policy |
| Commodity forecast | Pilot | Tooltip on CostHistory chart: "Pilot — based on internal cost ledger, no external commodity feed" | External commodity index feed |
| Customer WTP per-account | Locked | Customer-drill-in WTP row → "Locked — needs customer-SKU history depth" | ≥6 won deals for that customer-SKU |

These are not separate phases — they get added inside the relevant evidence/hero blocks during Phase 7.

---

## 5. Phase plan

Each phase is independently shippable. Tasks within a phase have explicit dependencies. Every task names the files it touches and its acceptance criteria.

---

### Phase A — Backend hardening foundation (1–2 days)

**Goal:** kill silent exceptions, remove seed/mock fallbacks, and make every Studio service emit honest `status: 'live' | 'degraded' | 'locked' | 'empty'` metadata.

**Components touched:** `backend/services/studio/*.py`, `backend/services/pricing/*.py`, `backend/api/v1/screens.py`, `backend/api/v1/pricing.py`.

**Tasks:**

| ID | Task | Files | AC |
|---|---|---|---|
| A1 | Audit every `except Exception` in `studio/` and `pricing/` services. Replace each with explicit error class + `logger.exception` + status-metadata propagation. | `studio/workbench_service.py`, `studio/composer.py`, `pricing/approval_workflow.py`, `pricing/customer_fanout.py`, `pricing/recommendation.py` | `grep -nE "except Exception\s*:\s*$" backend/services/studio backend/services/pricing` returns no bare passes. Every studio endpoint response carries `meta.blocks.{block_id}.status` |
| A2 | Add structured status enum + reason field per workbench sub-block (`recommendation`, `wtp`, `win_prob_curve`, `customer_fanout`, `cost_history`, `option_margins`, `comparable`, `lineage`). | `studio/workbench_service.py`, `types/studio.ts` mirror | Workbench JSON gains `meta.blocks.{id}: {status, reason?, lineage_ref_id?}` for each. Contract test asserts it. |
| A3 | Drop the `studio.json` seed fallback for shell + workbench. If `recommendations` table is empty for an aid, the response must say `status: 'empty'`, not return a hardcoded shape. | `studio/_seed.py`, `studio/composer.py`, `studio/workbench_service.py` | `_seed.load_seed()` removed. Contract test: empty-DB returns `status: 'empty'`, not 200 with seed values. |
| A4 | Add db.rollback() in every Studio service `except`. Same fix pattern we used in `decisions.py` to prevent transaction poisoning. | All `pricing/*.py`, `studio/*.py` | Forced schema-drift test passes (drop a column temporarily, verify next request still succeeds). |
| A5 | Verify Decimal-as-string discipline end-to-end. Add Pydantic mode=json check in contract tests. | `tests/contract/test_studio.py` (new) | All price fields serialize as strings. |
| A6 | Wire scheduled-publish trigger. APScheduler job that polls `scheduled_publishes WHERE status='pending' AND effective_at <= now()` every minute. | `backend/services/pricing/publish.py`, `backend/main.py` | New row with future `effective_at` fires within 60s of `effective_at`. |
| A7 | Fix price-book rollback to also revert `price_state.current_price`. | `backend/services/pricing/publish.py` | Publish €10 → rollback → `price_state.current_price` == original price. Audit row written. |
| A8 | Cache approval rules at startup; file-watcher reload. Fall back to seeded `approval_routes` table if file missing. | `backend/services/pricing/approval_rules.py`, `backend/main.py` | Renaming the rules file mid-run does not 500 the proposal-submit endpoint. |

**Dependencies:** none — this phase precedes all others.

**Acceptance:** new `tests/contract/test_studio.py` with ≥15 assertions passes; existing tests still green; Playwright sweep over Studio shows no regression.

---

### Phase B — Action Center ↔ Pricing Studio SKU contract (1 day)

**Goal:** make the SKU set shown in Pricing Studio identical to the SKU set in Action Center, and make every deep link from Action Center resolve correctly in Studio.

**Components touched:** `frontend-v2/src/features/action-center/components/DecisionCards.tsx`, `SkuTable.tsx`, `BucketFilterRow.tsx`; `frontend-v2/src/features/pricing-studio/index.tsx`; `backend/services/studio/composer.py`; `backend/services/action_center/decisions.py`.

**Tasks:**

| ID | Task | Files | AC |
|---|---|---|---|
| B1 | Action Center decisions now embed `aid` (article_id) and `rec_id` (recommendation UUID) in `primaryAction.query`. No more bare `decision=rank`. | `backend/services/action_center/decisions.py`, `_intents.py` | New BFF payload: `primaryAction.query = {aid: '...', recommendation: '...', source: 'action-center', reason: 'churn'}`. |
| B2 | Studio `/pricing?aid=…` reads the param and pre-selects that SKU. If aid is unknown to the SKU picker, append it ad-hoc and show a small "trigger context" banner. | `pricing-studio/index.tsx` lines 63–99 | URL `/pricing?aid=205345-A&source=action-center` opens with 205345-A selected, banner visible. |
| B3 | Studio `/pricing?customer={cid}` for customer-level churn rows → filters SkuPicker to that customer's purchased SKUs. | `pricing-studio/index.tsx`, `studio/composer.py` (add customer filter) | URL `/pricing?customer=101357` shows only 101357's SKUs in queue. |
| B4 | Studio `/pricing?queue=churn` (or `cost_riser`, `margin_erosion`) filters SkuPicker to that queue. | `pricing-studio/index.tsx`, `studio/composer.py` (extend filter parser) | URL `/pricing?queue=cost_riser` shows the 4 cost-riser SKUs from Action Center. |
| B5 | Studio composer accepts a `queue` filter + a `customer` filter and returns the same ordering Action Center uses. Both screens call the same shared sort/filter helper. | `studio/composer.py`, `action_center/decisions.py` extract shared `_action_queue_sql` helper | Contract test: `studio.shell.skus[].article_id` ⊇ `actionCenter.decisions[].article_id` for matching `queue` filter. |
| B6 | Unify margin source: workbench hero shows BOTH "Trailing 12mo margin" (invoice-avg) AND "Current point margin" (`price_state` ÷ `cost_state`) as two separate fields, each with its own label. No more silent picking. | `studio/workbench_service.py`, `RecommendationKpiTiles.tsx` | Hero shows two margin numbers with labels, never one mystery number. Contract test asserts both keys present. |
| B7 | Unify cluster-confidence source: both Action Center and Studio read from `model_cluster_metrics` (already used by Studio). Action Center stops computing its own. | `action_center/decisions.py`, `pricing/recommendation.py` (extract shared `get_cluster_confidence`) | Same aid in both screens shows the same `confidence.score` and `confidence.tone`. |
| B8 | Bulk path `/pricing?mode=batch&aids=…` already works — verify with Playwright + add a regression contract test. | Playwright test only | Click "Open 5 in Studio" from Action Center SkuTable → Studio batch mode pre-staged with 5 items. |

**Dependencies:** A1–A2 (need block status metadata to surface mismatches honestly).

**Acceptance:** Playwright test "open every Action Center decision card and confirm correct SKU appears in Studio" passes; SKU-set parity contract test green.

---

### Phase C — Single-source-of-truth workbench (1–2 days)

**Goal:** kill all FE seed fallbacks for the selected-SKU detail. The workbench endpoint becomes the only thing that feeds the right column.

**Components touched:** `frontend-v2/src/data/api/useStudioWorkbench.ts`, `studio-workbench.ts` (the mock customer-sets file), `frontend-v2/src/features/pricing-studio/index.tsx`, `frontend-v2/src/features/pricing-studio/components/CustomerFanout.tsx`, `CostHistory.tsx`, `ComparablePanel.tsx`, `RationaleMemo.tsx`.

**Tasks:**

| ID | Task | Files | AC |
|---|---|---|---|
| C1 | Delete `frontend-v2/src/data/mocks/studio-workbench.ts` and every import of `CUSTOMER_SETS`. Either the BFF returns customer fanout rows or the block renders empty/degraded. | `data/mocks/studio-workbench.ts`, components that import it | grep finds no `CUSTOMER_SETS` reference. |
| C2 | Remove `useProposals` sessionStorage fallback (`sessionStorage.pryzm_v2_synth_proposals`). All proposals come from `/pricing/proposals` live. | `data/api/useProposals.ts` lines 25–50 | grep finds no `pryzm_v2_synth_proposals`. |
| C3 | Cost history: replace the workbench inline mock with calls to `GET /pricing/sku/{aid}/cost-outlook`. Define typed `CostOutlookBlock` in `types/studio.ts`. | `pricing-studio/components/CostHistory.tsx`, `CostTrajectoryDrawer.tsx`, `types/studio.ts`, `api/v1/pricing.py` (verify response shape) | CostTrajectoryDrawer renders live cost trajectory for any aid; degraded state if cost_state missing. |
| C4 | Customer fanout: ensure the FE only reads `customer_fanout: CustomerFanoutBlock` from workbench response; never re-thresholds tone. Stale-data warning shows when `lineage_ref.computed_at` > 7 days old. | `CustomerFanout.tsx` | Fanout tone matches BFF exactly; stale chip appears for old data. |
| C5 | Comparable panel: only show when `selectedSku.isNew && comparable.status === 'live'`. Locked overlay when status is `locked`. | `pricing-studio/index.tsx`, `ComparablePanel.tsx`, `studio/composer.py` build_comparable | New-SKU AID shows comparable panel; existing AID does not. |
| C6 | Rationale memo: must consume the BFF's `decision.memo_md` field rather than constructing prose client-side. If `memo_md` is empty, show "Memo will be generated when Frank accepts/proposes." | `pricing-studio/components/RationaleMemo.tsx`, `studio/workbench_service.py` | Memo content matches BFF byte-for-byte. |

**Dependencies:** Phase A (need block-status metadata).

**Acceptance:** Removing the BFF database does not produce a working Studio with seed data — it produces a fully degraded screen. Contract test `test_studio_no_seed_fallback` covers this.

---

### Phase D — Recommendation hero + driver waterfall (1 day)

**Goal:** make the recommendation block the visual center, matching the unified decision-card pattern used in Action Center.

**Components touched:** `RecommendationHero.tsx`, `RecommendationKpiTiles.tsx`, `DriverWaterfall.tsx`, `WinProbCurve.tsx`, `WtpBandStrip.tsx`, `OptionMarginMicroWaterfall.tsx`.

**Tasks:**

| ID | Task | Files | AC |
|---|---|---|---|
| D1 | Inline summary chips: cluster · confidence · sample size · model version + trained-at — same chip set used on Action Center decision cards. Shared `RecommendationMetaChips` component lifted to `components/shared/`. | `components/shared/RecommendationMetaChips.tsx` (new), import in both screens | Same chip layout on both screens. |
| D2 | Hero: add a "Why this price?" expand button that toggles a 1-paragraph rationale below the price. The paragraph reads from `recommendation.rationale_md`. No prose-construction client-side. | `RecommendationHero.tsx` | Expand/collapse smooth; content matches BFF. |
| D3 | DriverWaterfall: cap label length, fix overlap at 1280px container, add tooltips for full label text. Sort by `|contribution_pct|` desc (already done). Add a "show 5 more" expander if drivers > 5. | `DriverWaterfall.tsx` | Renders cleanly at 1280px, no wrapping; full label visible on hover. |
| D4 | WinProbCurve: enforce stroke ≥ 1.75px, axis labels at 12/8 (start/end) and at the recommended-price point only; CI ribbon at 0.18 opacity; degrade gracefully to "Locked — needs more quote outcomes" when `n_deals < 12`. | `WinProbCurve.tsx` | Locked overlay appears for low-data SKUs; stroke crisp on light bg. |
| D5 | WtpBandStrip: show recommended-price marker explicitly; tooltip the P10/P50/P90 values. | `WtpBandStrip.tsx` | Hover shows three values; recommended marker centered when in band. |
| D6 | OptionMarginMicroWaterfall: align with hero's variant selector; show breakdown only for active variant. | `OptionMarginMicroWaterfall.tsx`, `RecommendationHero.tsx` | Variant switch updates the micro-waterfall live. |

**Dependencies:** Phase C (live workbench data).

**Acceptance:** all visual elements pass at 1280/1440/1920 viewport widths; no text wrapping; charts readable.

---

### Phase E — Evidence tabs (cost · quotes · customers · comparable · lineage) (2 days)

**Goal:** consolidate the right-column evidence panels into a tabbed surface so the recommendation stays on top.

**Components touched:** new `EvidenceTabs.tsx` host; move `CostHistory`, `CustomerFanout`, `ComparablePanel` into tab panes; add Quote-history pane; wire LineageDrawer hook.

**Tasks:**

| ID | Task | Files | AC |
|---|---|---|---|
| E1 | Create `EvidenceTabs.tsx` host with 5 tabs: Cost · Quotes · Customers · Comparable · Lineage. Tab state in URL via `?tab=`. Tabs disabled when block status ≠ live. | `EvidenceTabs.tsx` (new) | URL deep-links to tab; disabled tabs show lock icon. |
| E2 | Move CostHistory into "Cost" pane. | `index.tsx`, `EvidenceTabs.tsx` | Cost tab shows trajectory + cost-state breakdown. |
| E3 | Add new "Quotes" pane: list of recent quotes for this aid (won + lost) with margin column. Backed by new `GET /pricing/sku/{aid}/quote-history` endpoint OR re-uses existing `quote_invoice_links` query. | `EvidenceTabs.tsx`, `api/v1/pricing.py`, `services/pricing/quote_history.py` (new) | Pane shows ≥1 row when SKU has quote_invoice_links. |
| E4 | Move CustomerFanout + CustomerDrillInDrawer into "Customers" pane. | `EvidenceTabs.tsx` | Click customer row opens drill-in drawer. |
| E5 | Move ComparablePanel into "Comparable" pane. Show locked overlay when not a new-SKU. | `EvidenceTabs.tsx` | Locked overlay for existing SKUs. |
| E6 | Implement `usePricingLineage(aid)` hook + render in "Lineage" pane. Reads `lineage_refs` rows for the recommendation/WTP/curve/fanout blocks. | `data/api/usePricingLineage.ts` (new), `api/v1/pricing.py` lineage endpoint, `LineageDrawer.tsx` | Pane shows source_kind · model · computed_at · SQL preview per signal. |

**Dependencies:** Phase A (block status), Phase C (live data).

**Acceptance:** tabs keyboard-navigable, deep-linkable, each pane has loading/empty/error states.

---

### Phase F — Decision footer + lifecycle write paths (1 day)

**Goal:** make every Frank action write real state and update the UI optimistically with proper invalidation.

**Components touched:** `DecisionFooter.tsx`, `pricing-studio/index.tsx`, `actions.py` dispatcher, the `useAcceptRecommendation`, `useDeclineRecommendation`, `useShareDecision`, `usePublishPrice` hooks.

**Tasks:**

| ID | Task | Files | AC |
|---|---|---|---|
| F1 | Sticky DecisionFooter visible at all times. Buttons: Accept · Reject · A/B Slice · Share · Submit for approval · Publish · Branded PDF. | `DecisionFooter.tsx`, `index.tsx` layout | Footer remains pinned bottom on scroll. |
| F2 | Accept → calls `POST /actions` with `accept_recommendation`, optimistically marks card status=accepted; SSE invalidates and confirms. Toast on success. | `useAcceptRecommendation.ts` (new) | Accept updates recommendation state; refresh persists. |
| F3 | Reject + Snooze: typed dispatches; lifecycle chip changes; recommendation stays visible (per Phase A iron rule "don't hide acted-on decisions"). | `useDeclineRecommendation.ts`, `useSnoozeRecommendation.ts` | Acted-on decisions visible with chip badge. |
| F4 | Share with Till/Heiko: opens a small picker drawer (radio: Till · Heiko · Both), submits `POST /actions` with `share_decision`. Writes Notification + Note. Right-rail notification appears on the target persona. | `ShareDecisionDrawer.tsx` (new), `DecisionFooter.tsx` | Till login sees new notification. |
| F5 | Submit for approval: opens proposal creation drawer (existing `ProposalContextPanel`) → `POST /pricing/proposals/{id}/submit`. Routes to `approval_instances`. | `ProposalContextPanel.tsx` (already exists) | Proposal moves draft → pending_approval; Till's `/approvals/inbox` shows it. |
| F6 | A/B Slice: opens `ABTestCard` drawer with control/variant prefilled (control = current_price, variant = recommended_price), slice_pct slider 10–50%. Submit → `POST /pricing/ab-tests`. | `ABTestCard.tsx` (already exists) — wire cohort assignment | Test row created with assigned cohort customers. |
| F7 | Publish: opens confirmation modal showing impact (new price · effective_at = now or scheduled · revenue impact estimate). Submit → `POST /pricing/sku/{aid}/publish`. Updates `price_state`, writes `price_book` row, dispatches SSE. | `PublishConfirmModal.tsx` (new) | Publish writes both `price_state` and `price_book`; rollback within 72h fully reverts both (Phase A7 fix). |
| F8 | Branded PDF: `GET /pricing/proposals/{id}/pdf` (existing). Opens new tab. | `DecisionFooter.tsx` | PDF downloads with trace ID footer. |

**Dependencies:** Phase A6 (scheduled publish trigger), A7 (rollback fix), F5 needs F2/F3.

**Acceptance:** all 7 footer actions write real DB state; Playwright sweep clicks each and verifies via API.

---

### Phase G — Approval routing visibility (Frank → Till handoff) (0.5 day)

**Goal:** make the approval state visible inside the Studio page so Frank knows what's pending.

**Components touched:** `ApprovalStepper.tsx`, `ProposalContextPanel.tsx`, `ApprovalInboxBell.tsx`, `PageHead`.

**Tasks:**

| ID | Task | Files | AC |
|---|---|---|---|
| G1 | ApprovalStepper: render the full chain (Frank submit → Till approve → publish). Current step highlighted. Decision history list below. | `ApprovalStepper.tsx` | All steps + actor + at + comment visible. |
| G2 | When `proposal.status === 'pending_approval'`, banner above hero: "Sent to Till for approval · X hours ago · Recall". | `ProposalContextPanel.tsx` | Banner shows; "Recall" button calls `POST /pricing/proposals/{id}/recall`. |
| G3 | ApprovalInboxBell: existing badge; verify it counts only this user's open instances. | `ApprovalInboxBell.tsx` | Badge accurate. |

**Dependencies:** Phase F.

**Acceptance:** Frank submits → sees banner → Till logs in → sees inbox → approves → Frank sees status flip to approved.

---

### Phase H — Simulation + Compare drawers (0.5 day)

**Goal:** verify Simulation and Compare drawers are fully wired to the live read-only endpoints.

**Tasks:**

| ID | Task | Files | AC |
|---|---|---|---|
| H1 | SimulationDrawer: confirm `POST /pricing/simulate` is the only data source. Fix any sessionStorage local fallback. | `SimulationDrawer.tsx` | Drawer always hits the live endpoint. |
| H2 | CompareDrawer: hold/floor/market/custom options each hit the simulate endpoint. Show "Set as proposal" CTA inline → `POST /pricing/proposals`. | `CompareDrawer.tsx` | "Set as proposal" creates a draft proposal and surfaces it in ProposalContextPanel. |
| H3 | Fan chart in SimulationDrawer: respect Phase D chart legibility rules (stroke, axes, ticks). | `SimulationDrawer.tsx` | Chart readable at 1280px. |

**Dependencies:** Phase D.

**Acceptance:** Both drawers work end-to-end without seed fallback.

---

### Phase I — Locked future-feature blocks (0.5 day)

**Goal:** surface the roadmap-§8 locked features in the page so the ambition is visible.

**Tasks:**

| ID | Task | Files | AC |
|---|---|---|---|
| I1 | Add `LockedBlock` (reuse from Action Center) for: Competitor signal, ERP push, Contract status, Customer WTP per-account. | `index.tsx`, `EvidenceTabs.tsx` | Locked blocks render with unlock-requirement copy. |
| I2 | Add "Pilot heuristic" badge with tooltip explaining the heuristic for movable revenue + WTP. | `RecommendationHero.tsx`, `WtpBandStrip.tsx` | Tooltip text matches Phase 4 wording. |

**Dependencies:** Phase E.

**Acceptance:** every locked feature listed in §4 appears in the page with correct unlock-requirement text.

---

### Phase J — A/B test cohort assignment + alerts cron (1 day)

**Goal:** wire the missing async machinery so A/B tests actually slice customers and alerts actually evaluate.

**Tasks:**

| ID | Task | Files | AC |
|---|---|---|---|
| J1 | On `create_pricing_ab_test`, generate cohort assignments from `eligibility_json` + `slice_pct`. Write to `ab_test_assignments`. | `services/pricing/ab_test.py` | After create, `ab_test_assignments` has rows matching slice_pct × eligible customers. |
| J2 | Add APScheduler cron job: hourly evaluation of enabled `pricing_alerts`. Calls `alerts_runner.run_for_alert` for each; persists events to `pricing_alert_events`. | `services/pricing/alerts_runner.py`, `backend/main.py` | New alert fires on next hour mark when condition met. |
| J3 | Lineage GC: nightly cron that deletes `lineage_refs` rows older than 12 months with no FK reference. | `services/pricing/lineage.py` | Old rows removed; FK-referenced rows preserved. |

**Dependencies:** Phase A6 (APScheduler already wired).

**Acceptance:** create A/B test, see assignments table populate; create an alert, wait 1 hour, see events row.

---

### Phase K — UX polish: theme · responsive · charts · empty/loading/error · a11y (1–2 days)

**Goal:** production-grade visual quality. Use the `frontend-design` skill principles.

**Tasks:**

| ID | Task | Files | AC |
|---|---|---|---|
| K1 | Container shrink test: every component must remain readable at 1280, 1440, 1920px container widths. | All components | Manual + Playwright viewport tests pass. |
| K2 | Theme audit: every color, spacing, radius must reference design tokens (`var(--ink)`, `var(--rose)`, etc.). No hex/raw values in component files. | All `components/*.tsx` | grep for `#[0-9a-f]{3,6}` returns design-system files only. |
| K3 | Chart legibility pass: stroke ≥1.5px, axis ticks no overlap, legend below chart not overlay, tooltip backgrounds opaque. | `WinProbCurve`, `DriverWaterfall`, `CostHistory`, `SimulationDrawer` fan, `OptionMarginMicroWaterfall` | Manual review at each viewport. |
| K4 | Empty/loading/error states for every data-driven block (workbench hero, fanout, cost, comparable, audit, approvals). Use existing `LockedBlock`, `DegradedBlock`, skeleton from Action Center. | All blocks | Playwright simulates each state via mock API and screenshots. |
| K5 | Accessibility: keyboard nav across SkuPicker → hero → tabs → footer; focus ring visible; tab order logical; aria-labels on all icon buttons. | All interactive elements | axe-core scan returns zero serious/critical issues. |
| K6 | Spacing rhythm: 24px between major blocks, 16px within cards, 8px between chip and label. | Layout grid + cards | Visual review against Action Center reference. |
| K7 | Drawer width consistency: all drawers 560px on desktop, full-width on <768px. | All drawer components | Drawers match each other in width and motion. |

**Dependencies:** Phases C–F (need live content to polish).

**Acceptance:** screenshots at 1280/1440/1920 viewports approved; axe-core clean; keyboard sweep clean.

---

### Phase L — Cross-screen state preservation + regression sweep (0.5 day)

**Goal:** verify the integration with Action Center holds up under round-tripping.

**Tasks:**

| ID | Task | Files | AC |
|---|---|---|---|
| L1 | Navigate Action Center → Studio → back. SKU selection and queue filter preserved via URL only (no global store). | Playwright spec | Full round-trip preserves state. |
| L2 | Open 5 SKUs in batch from Action Center → Studio batch mode → submit → return → Action Center decisions updated. | Playwright spec | All 5 proposals visible in approval inbox. |
| L3 | Run the full Action Center Playwright suite (already exists) — verify zero regressions from this plan's changes. | `frontend-v2/tests/e2e/action-center.spec.ts` | All 23 tests pass. |
| L4 | New Playwright suite `pricing-studio.spec.ts` covering every interaction in §5: SKU select, variant switch, tab switch, every footer button, drawer open/close, batch flow, A/B create, publish, rollback. | `frontend-v2/tests/e2e/pricing-studio.spec.ts` (new) | ≥30 assertions, all green. |

**Dependencies:** all prior phases.

**Acceptance:** zero red on either Playwright suite; manual demo run "would I demo this live without flinching?" answer = yes.

---

## 6. UX quality bar (non-negotiable)

(Lifted verbatim from the user brief — these are acceptance gates, not aspirations.)

- **Theme consistency** — colors, typography, spacing, component variants match the Action Center. No off-theme elements. Phase K2 enforces.
- **Responsive layout** — text doesn't wrap into unreadable stacks at 1280px. Tables remain scannable. Cards keep hierarchy. Phase K1.
- **Charts readable** — line graphs especially: axis labels, sensible tick density, default ranges, no overlapping labels, stroke ≥ 1.5px on light backgrounds. Phase K3.
- **Spacing and rhythm** — consistent padding/gutters/vertical rhythm. Phase K6.
- **Empty / loading / error states** — every data block has all three. Phase K4.
- **Accessibility basics** — keyboard nav, focus states, contrast. Phase K5.

---

## 7. Definition of done (whole feature)

- All phases A–L checked off.
- Playwright sweep green: every interactive element verified working in Chrome at 1280px, 1440px, 1920px.
- SKU data flow from Action Center → Pricing Studio documented in this file + enforced by contract test.
- No off-theme UI; grep for hardcoded hex finds only design-system files.
- No charts unreadable at common viewports; manual screenshot review at 3 widths.
- No silent exceptions; `meta.blocks.{id}.status` populated for every data block.
- `docs/PRICING_STUDIO_HANDOFF.md` written with: what's built, known limits, where to look in code.

---

## 8. Forward notes (after this plan ships)

- **Margin Cockpit** is the next screen — it consumes the same `recommendations` table and `lineage_refs` we just hardened, so the iron rules apply 1:1.
- **Quotes & Guardrails** ships after Margin Cockpit — depends on Phase F's proposal lifecycle to reach quote approvals.
- **Till MD Overview** is mostly Phase F outputs framed differently — reuses approval inbox and audit chain.
- **Heiko Deal Inbox** is Phase 3 in the roadmap; requires the `share_decision` action (built in Phase F4 of this plan) to be the inbox population mechanism.
- **What we should leave hooks for now:** (i) ERP publish — `publish_price` already has a `dispatch_mode` field, ERP adapters can plug in here; (ii) competitor feed — `competitor_ref` block already in workbench response, just empty; (iii) contract table — add as a future migration without breaking workbench schema.

---

## 9. Risk register

| Risk | Mitigation |
|---|---|
| Removing seed fallbacks (Phase C) on a sparse demo DB shows empty screens | Phase A2 honest status metadata + Phase I locked-block treatments prevent emptiness from looking like breakage |
| SKU set parity contract test breaks on demo DB | The contract test asserts ⊇, not ==, so Studio queue can have *more* SKUs than Action Center decisions; only the reverse is a violation |
| Approval workflow has hardcoded `route_to: ["till"]` | Phase A8 file-watcher reload + table fallback; rules JSON file is editable without code change |
| A/B cohort generation runs synchronously in `create_pricing_ab_test` and slows the endpoint | Phase J1 wraps in a background task; endpoint returns immediately with cohorts pending |
| Theme audit (Phase K2) reveals dozens of hex literals | Acceptable tech debt for ≤10 hex values inside `LockedBlock`/`DegradedBlock`; everywhere else is design-token-only |

---

## 10. Estimated effort

| Phase | Effort | Critical-path? |
|---|---|---|
| A — Backend hardening | 1–2 d | yes |
| B — Cross-screen SKU contract | 1 d | yes |
| C — SSoT workbench | 1–2 d | yes |
| D — Recommendation hero polish | 1 d | yes |
| E — Evidence tabs | 2 d | yes |
| F — Decision footer + lifecycle | 1 d | yes |
| G — Approval visibility | 0.5 d | yes |
| H — Simulation/Compare | 0.5 d | no — can ship after K |
| I — Locked blocks | 0.5 d | no |
| J — A/B cohort + alerts cron | 1 d | no — independent backend hardening |
| K — UX polish | 1–2 d | yes — gate on every phase |
| L — Regression sweep | 0.5 d | yes (final) |

**Total:** ~11–13 person-days. Phases B/J can run parallel to A/C if a second engineer or agent is available.

---

## 11. Open questions for review

1. **SkuPicker default scope.** Should the queue default to "Action Center decisions" or "all SKUs needing review"? Action Center has 12 right now; the broader `recommendations.status='open'` set is ~50. My recommendation: default to Action Center's 12, with a toggle to "show all" — keeps the two screens aligned for the demo flow.
2. **"Customer scope" mode (Phase B3).** When a churn-row decision (no aid) opens Studio, should the right column show a customer-summary view instead of a SKU workbench? The roadmap doesn't say. My recommendation: if no aid, default to the *highest-margin SKU that customer buys*, and show a small note "Selected because it's customer 101357's largest exposure." — keeps the workbench layout consistent.
3. **Publish confirmation modal scope.** Should Publish require a `comment` field for the audit row? Roadmap §6.2 says decisions should record "who acted, when, what changed, why." My recommendation: require a comment iff `delta_pct ≥ 5%` or `customer_count_affected ≥ 3`; optional otherwise. Avoids friction on small changes.
4. **A/B test slice randomization seed.** Should cohort assignment be deterministic (seeded on `test_id`) so re-running the assignment yields the same cohorts? My recommendation: yes — required for reproducibility and audit defensibility.

I'll default to my recommendations if you don't push back.
