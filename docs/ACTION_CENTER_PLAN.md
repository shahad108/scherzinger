# Action Center — Build / Clean-up / Modification Plan

**Date:** 2026-05-18
**Owner:** product + eng
**Anchor docs (read before edits):** [`PRODUCT_END_GOAL_AND_ROADMAP.md`](./PRODUCT_END_GOAL_AND_ROADMAP.md) §6.1, [`README.md`](./README.md), [`frontend-action-center-page.md`](./frontend-action-center-page.md), [`PRICING-STUDIO-DEFECTS.md`](./PRICING-STUDIO-DEFECTS.md).

## 0. Iron rules for this screen

1. **No hardcoded numbers in the frontend.** Every value flows from a BFF endpoint via React Query. If a value cannot be computed today, the block must render an explicit `Locked` or `Data not yet available — backend required` state, not a fake number.
2. **Backend first, then frontend, then wiring.** For each block: build/extend the FastAPI service → expose under `GET /screens/action-center` block payload → consume in the React component.
3. **Single recommendation pattern.** Every card that suggests an action uses the same shape: `headline · why · evidence · confidence · primary action · secondary actions · locked-flags`. Already defined by `DecisionCards`; reuse that contract for new cards, do not invent parallels.
4. **One primary CTA per card** → Pricing Studio (or quote / margin / forecasting). Secondary CTAs: A/B, Share, Snooze, Approval handoff.
5. **Theme: Pryzm 2026.** Warm gray + rose, Manrope display + Inter body, rounded-2xl cards, ≤1.5px borders, soft shadows, chips small + caps for taxonomy, large numbers in display font. Reference impl: `Pryzm_Dashboard_Mockup_Frank.html`. Every new block obeys `frontend-v2/src/components/ui/*` primitives (`Card`, `Drawer`, `Button`, chip variants). No raw Tailwind colours outside the token set.
6. **Per-block status contract.** Every backend block returns `{ data, meta.blocks.<id>.{status, coverage, reason, traceId} }` where `status ∈ {live, empty, degraded, locked}`. Frontend already honours `live/empty/degraded`; we add `locked` (renders the locked-feature card, never the data).
7. **No silent stub.** Any block currently falling back to `_seed.py` must either return a real DB-backed value or surface `status: 'empty'` with a `reason` string. We are removing seed fallback this iteration.
8. **Side-screen rule.** Inline by default. Open a 560-px right drawer ONLY for: trust detail, evidence/lineage, forms (share / snooze / partial-accept / A/B setup / save view), workspace scope, export context. Full-page navigation ONLY for: Pricing Studio (`/pricing?aid=…`), Margin Cockpit (`/margin?focus=…`), Quotes (`/quotes?…`), Forecasting (`/forecasting?cluster=…`), Persona overviews (`/persona/till`, `/persona/heiko`). Never open both at once.

---

## 1. Page hierarchy (Roadmap §6.1)

Final render order, top → bottom. Items in **bold** are new or reordered vs current `index.tsx`.

1. `PageHead` — breadcrumb · greeting · week chip · stats chips · toolbar (Hide-locked, Show-all, Save view, Workspace scope, Export).
2. `DataFreshnessStrip` — invoices through · quotes through · linkage refresh.
3. **`TodaySummaryStrip`** *(NEW — Roadmap §6.1 Hierarchy 1)* — 5 mini-tiles: Movable revenue, Open actions, Recoverable margin, Blocked quotes, Model trust. Lives ABOVE the hero so the answer to "what matters today?" is the first thing on screen.
4. `MovableHero` — keep, but demote subtitle treatment; the strip above carries the headline numbers now.
5. **`DecisionCards`** — moved up to position 5 (currently position 5 in `index.tsx`, but de-facto below the fold because hero+buckets push it down). Trim BucketGrid → either single-row bucket pills or fold into this section's filter chip row.
6. `BucketGrid` — collapse into a single filter row above `DecisionCards` (chips: Repricing · Quote approvals · Renewals · A/B tests · MD approvals). Clicking a chip filters DecisionCards in place. Removes the duplicate landing area the roadmap warns about.
7. `TrustStrip` (+ `TrustDrawer`) — keep, label as "Why you can trust today's queue".
8. `LostQuoteCard` — keep.
9. `SkuTable` — keep, rename section heading to "SKU repricing engine · ranked by movable revenue".
10. `LongTailCoverage` — keep.
11. `NegotiationCockpit` — keep, but render only when `discountGap` is live; otherwise `Locked` card with reason "annual list-price negotiation activates when contract terms + commodity feeds are connected".
12. `AbTestList` — keep.
13. `RejectionList` — keep.
14. `AuditTrail` — keep.
15. `ReportCard` — keep.

Right rail (already present in mockup `Pryzm_Dashboard_Mockup_Frank.html`, missing in `frontend-v2`): reviewer chips, saved sections, notification feed. **Add as Phase B**, not Phase A — too easy to over-build, and roadmap puts it in the trust/explanation layer not MVP.

---

## 2. Block-by-block plan

Format per block:
- **Status now** — what currently powers it (`live` / `seed-fallback` / `stub` / `missing`).
- **Backend tasks** — schema, service, endpoint, tests. *Always sequenced before frontend.*
- **Frontend tasks** — component changes, prop wiring, empty/degraded/locked handling, sort/filter, click behaviour, drawer/side screen.
- **Locked-data label** — exact copy to render when data is not yet ingestable.

---

### 2.1 PageHead

**Status now:** `header_block.build()` returns live week + date-range + stats from real invoice/quote counts. Toolbar buttons are wired (`hideLocked`, `showAll`, `saved_view_save`, workspace-scope drawer, export drawer).

**Backend tasks:**
- B1. Extend `header.py` to add a `personaSwitcher` payload (Frank / Till / Heiko availability flags) so the header chip set can show the persona without the frontend hardcoding it.
- B2. Add `meta.featureFlags.actionCenterRightRail` so Phase B can be enabled without a frontend ship.

**Frontend tasks:**
- F1. Replace hardcoded "Cockpit / Pricing Analyst · Frank / Action Center" breadcrumb with payload values; payload key is `header.breadcrumb: string[]`.
- F2. "Workspace scope" and "Export" drawers currently render static items (`PageHead.tsx:151-181`). Wire them to `header.workspaceScope` and `header.exportContext` block fields. (Backend tasks B3, B4.)
- F3. "Save view" — keep; already calls `runUiAction({ formKind: 'saved_view_save', screen: 'action-center', filters: { hide_locked, show_all } })`.

**Locked-data label:** none — header is always live.

**Sorting / click:** read-only block; clicks open drawers listed above.

---

### 2.2 DataFreshnessStrip

**Status now:** live, reads `meta.dataFreshness.{invoicesThrough, quotesThrough, linkageRefresh}`.

**Backend tasks:** none.

**Frontend tasks:** add a click-handler that opens the existing Workspace-scope drawer with a `focus: 'freshness'` filter, so users can see source lineage of these three timestamps.

**Locked label:** none.

---

### 2.3 TodaySummaryStrip *(NEW)*

5 KPI tiles: **Movable revenue · Open actions · Recoverable margin · Blocked quotes · Model trust**.

**Status now:** missing block; roadmap §6.1 calls this out explicitly.

**Backend tasks:**
- B5. New block `summary.py` → returns `{ tiles: TodayTile[] }`. Each tile: `{ id, label, value, delta, deltaDirection, tone, sourceBlockId, action, locked }`.
  - `movable_revenue` derives from `movable_hero.value` (already computed) — copy reference, no new SQL.
  - `open_actions` = count of `decisions[]` after filter (composer can pass through).
  - `recoverable_margin` = sum of `decisions[].financialImpact.recoverableMargin` (new field — see B6).
  - `blocked_quotes` = `GET /screens/quotes` block `quotesNeedingAction.count`; expose via lightweight call in composer or add field to `header` payload. *No cross-service call from frontend.*
  - `model_trust` = headline trust score from existing `trust_block.tiles[0].value`.
- B6. Add `financialImpact.recoverableMargin: { value, currency }` to every decision-candidate row in `decisions.py`. Already have impact_score — convert to € recoverable.
- B7. Contract test: `tests/contract/test_action_center.py` — assert `summary.tiles` always has exactly 5 entries with the IDs above, each with a `status` of `live | empty | locked`.

**Frontend tasks:**
- F4. New `TodaySummaryStrip.tsx` under `features/action-center/components/`. 5-up grid on ≥ lg, 2x3 on md, 1-col on sm. Tile uses existing `TrustTile` shape but with `delta` arrow + tone, tap target → scrolls to source block via `data.tiles[i].sourceBlockId` (smooth-scroll, no navigation).
- F5. Add to `index.tsx` between `DataFreshnessStrip` and `MovableHero`.

**Sorting:** fixed order, never reorderable.

**Click behaviour:**
- Movable revenue tile → smooth-scroll to `#sec-movable`.
- Open actions tile → smooth-scroll to `#sec-decisions`.
- Recoverable margin tile → smooth-scroll to `#sec-decisions` + applies `?queue=margin` filter chip.
- Blocked quotes tile → full-page navigate to `/quotes?status=blocked&source=action-center`.
- Model trust tile → opens `TrustDrawer` (reuses existing drawer).

**Locked label:** tile renders `—` value and amber dot if `status === 'locked'`, with tooltip "Data source not yet connected".

---

### 2.4 MovableHero

**Status now:** live via `movable_hero_block`. Already shows sparkline, locked vs movable split, CTA.

**Backend tasks:**
- B8. Replace heuristic `is_movable` flag with contract-derived flag when contract table is connected. Roadmap §7 lists this. Until then, return `meta.blocks.movableHero.heuristicLabel: 'Pilot — list-price proxy until contracts connected'` so the badge in the UI is honest.
- B9. Add `meta.blocks.movableHero.coverage` (already exists for some blocks) with sample size n.

**Frontend tasks:**
- F6. Replace static "How we computed this" tooltip copy with `data.hero.heuristic.{label, rule, qualifier}` payload (already supported by the BFF shape but composer must populate it from real cost/quote counts).
- F7. CTA fallback intent `FALLBACK_MOVABLE_HERO` (`index.tsx:29`) — remove. Backend must always attach `action`. Add contract test that fails if `data.hero.action` is null.

**Sorting:** N/A.
**Click:** primary CTA → `/pricing?queue=repricing&source=action-center`; spark hover shows weekly value tooltip.
**Locked label:** when contracts table absent → render `Pilot` badge top-right with tooltip "Movable estimate uses list-price proxy; contract-aware flag activates after contract feed is connected." (Roadmap §8.)

---

### 2.5 BucketGrid → BucketFilterRow (modification)

**Status now:** `buckets_block` returns 4-6 bucket cards. Each card duplicates info from queues already visible elsewhere.

**Decision:** roadmap §6.1 says "reduce duplicate cards". Convert from 2-col grid of cards to a single horizontal scroll chip row above DecisionCards. Each chip: `<label> · <count>`. Chip click filters DecisionCards in place (no navigation).

**Backend tasks:**
- B10. Repurpose `buckets.py` to return `{ filters: [{ id, label, count, queueRoute }] }` instead of card-shape. Bucket IDs map to `decisions[].queue` so frontend filtering is a single field comparison.
- B11. Add `queueRoute` per filter so right-click / cmd-click on the chip can open `/pricing?queue=<id>` if user wants full queue.

**Frontend tasks:**
- F8. New `BucketFilterRow.tsx` replacing `BucketGrid.tsx`. Delete the 2-col grid component. Add `queue` state to `index.tsx`; filter `decisions[]` and `skuTable[]` by `queue` when set.
- F9. Active chip → rose-filled; inactive → outlined warm-gray. Reset chip "All".

**Sorting:** chips ordered by `count` desc, with "All" pinned first.
**Click:** chip → in-place filter. Cmd-click / right-click → open full queue route in Pricing Studio.
**Locked label:** chips with `count: 0` render disabled grey; tooltip "No actions in this queue today".

---

### 2.6 DecisionCards

**Status now:** mostly live. Cards are ranked across churn / cost-riser / margin-erosion candidates. Optimistic accept/reject works. `Share`, `Partial`, `A/B`, `Snooze` open form drawers.

**Backend tasks:**
- B12. Add `decisions[i].evidence: { invoiceCount, quoteCount, lastInvoiceDate, sampleSize, dataFreshness }` — small object, not a full drill. Surfaces inside the card without opening a drawer.
- B13. Add `decisions[i].confidence: { score, sampleSize, tone, model: { id, version, trainedAt } }`. Already partially present; standardise.
- B14. Add `decisions[i].featureImportance: [{ feature, weightPct }]` (top-3). When model registry not yet wired → array empty + `meta.blocks.decisions.featureImportanceStatus: 'locked'`.
- B15. Add `decisions[i].linkedQuoteIds: string[]` and `linkedSkuIds: string[]` so secondary CTAs can deep-link to Quotes / Pricing Studio without a separate lookup.
- B16. Wire `start_ab_test` action to create a real `ab_tests` row (currently goes through `ab_setup` form drawer → POST `/actions` with kind `start_ab_test`; verify end-to-end with `tests/contract/test_actions.py`).
- B17. Accept/reject must remove the recommendation from subsequent BFF payloads — already done via `workflow_service.get_recommendation_status_map`; add a contract test that re-fetch after accept hides the card.

**Frontend tasks:**
- F10. Inline-expand evidence panel: clicking the rank chip or "Why this?" toggles an inline expandable region (NOT a drawer) showing `evidence` + top drivers + `featureImportance`. Roadmap explicitly wants evidence visible without leaving the card.
- F11. Open audit drawer only when user clicks "See full lineage" inside the inline panel; the drawer is the existing `lineage` route, not a new component.
- F12. Add `LockedDrivers` placeholder when `featureImportance` empty → "Feature importance ships with model registry (Phase 2 trust layer).".
- F13. Primary CTA wording: enforce "Open in Pricing Studio" for repricing decisions, "Open quote" for quote decisions, "Open customer" for churn decisions. Drop generic "Open" labels.

**Sorting:** ranked by `impact_score` desc (already). Allow user to re-sort via a small caption-row dropdown: `Impact · Confidence · Revenue at risk · Recency`. Persist last choice in `user_view_state` (table exists at `backend/models/user_view_state.py`).

**Click matrix:**
| Element | Action |
|---|---|
| Card body / rank chip | Toggle inline evidence panel |
| Primary CTA | Full-page navigate to deep-link (Pricing Studio / Quotes / Customer) |
| Accept | Inline optimistic update + audit row; no nav |
| Reject | Inline + audit row |
| Apply partial | Open `partial_accept` form drawer |
| Slice A/B | Open `ab_setup` form drawer |
| Share | Open `share_decision` form drawer |
| Snooze | Open `snooze` form drawer |
| "See full lineage" | Open lineage drawer (560 px) |

**Locked labels:**
- No model registry yet → `featureImportance` block inside the inline panel shows lock icon + "Locked — connects after model_registry table is populated".
- No contract data → if decision's recommendation depends on contract movable flag, show small chip "Heuristic — contract-aware version ships in Phase 2".

---

### 2.7 TrustStrip + TrustDrawer

**Status now:** live. Strip → 4 tiles. Drawer → real `GET /models/trust-drawer`.

**Backend tasks:**
- B18. `model_registry` table currently empty in dev → script `scripts/build_model_registry.py` referenced by drawer. Verify it produces rows for the demo cluster set. (Empty drawer state OK only if registry truly empty in prod.)

**Frontend tasks:**
- F14. None.

**Sorting / click:** tile click → drawer. Drawer is read-only.

**Locked label:** if `model_registry` empty → drawer renders existing empty state with admin hint. Strip tiles still show aggregate numbers from `trust_block` (live counts).

---

### 2.8 LostQuoteCard

**Status now:** live. Reads `lost_quote_block`. Has bar-chart sparkline + p-value.

**Backend tasks:**
- B19. Add `lostQuote.byReason: [{ code, lostCount, lostRevenue }]` for an inline top-3 breakdown (collapsed by default).

**Frontend tasks:**
- F15. Inline expandable under the existing card body listing top 3 rejection codes (lost-revenue desc). Same warm-gray expanded region pattern as DecisionCards.
- F16. CTA "Open margin analysis" — keep, already deep-links to `/margin?focus=lost_quote`.

**Sorting:** reasons by `lostRevenue` desc.
**Click:** card click → expand inline. Bar hover → year tooltip. CTA → full-page navigate.
**Locked label:** if `lost_quote.linkedRecords < 25` → amber badge "Pilot — significance limited by low sample (n=<X>)".

---

### 2.9 SkuTable

**Status now:** live driver list per SKU. Inline driver popover on cell click.

**Backend tasks:**
- B20. Add `skuTable[i].priceBookFloor` and `priceBookCeiling` from `price_state`. Today the popover shows "guardrail-clamped" boolean but not the actual bounds.
- B21. Add `skuTable[i].lastMoveDays` (days since last price change) — drives a stale-price chip.
- B22. Add `skuTable[i].confidence.sampleSize` so the cluster confidence chip can carry its `n`.

**Frontend tasks:**
- F17. Column controls: clickable header to sort by `marginDelta`, `confidence`, `revenueAtRisk`, `lastMoveDays`. Persist via `user_view_state.actionCenter.skuSort`.
- F18. Bulk select: checkbox column, toolbar appears with "Open all in Pricing Studio (n)" — full-page navigate to `/pricing?aids=<csv>&source=action-center`. No bulk-accept here; bulk-accept is a Phase 3 batch flow that belongs in Pricing Studio.
- F19. Stale-price chip when `lastMoveDays >= 365`.

**Sorting:** default by `revenueAtRisk` desc; user override persisted.
**Click:**
- Row click anywhere except recommendation cell → row hover shows action arrow.
- Recommendation cell → toggles inline driver popover (existing behaviour).
- Action button → `/pricing?aid=<id>&source=action-center` full-page nav.
- Article column → opens lightweight side drawer with SKU summary (price history sparkline, top customers) for users who don't want to leave Action Center yet.

**Locked label:** SKUs with `confidence.sampleSize < 5` render `Low data` chip; column tooltip explains threshold.

---

### 2.10 LongTailCoverage

**Status now:** live.

**Backend tasks:** none.
**Frontend tasks:** none.
**Sorting / click:** read-only. Optional: click on a mix segment → applies filter to SkuTable above (`?segment=A|B|C`). *Defer to phase B.*
**Locked label:** none.

---

### 2.11 NegotiationCockpit

**Status now:** commodities live from cost_service; discount-gap headline + summary text still seeded.

**Backend tasks:**
- B23. `margin_service.get_gap_analysis` wiring (TODO from `negotiation.py:5-6`). Replace seeded headline.
- B24. Add `negotiation.contracts: { renewalsThisQuarter, lockedRevenue }` if contract table connected; else `status: 'locked'`.

**Frontend tasks:**
- F20. If `discountGap` derives from seed → render locked card with copy "Annual list-price negotiation activates once `margin_service.get_gap_analysis` is wired."
- F21. Keep collapsible (collapsed by default).

**Sorting:** commodity tiles sorted by `|delta|` desc (already done in backend).
**Click:** "Expand" toggles content. Commodity tile click → `/forecasting?cluster=<commodity>&source=action-center` (deep-link to commodity strip in forecasting).
**Locked label:** see above.

---

### 2.12 AbTestList

**Status now:** live from `ab_tests` + `ab_test_results` tables.

**Backend tasks:**
- B25. Ensure `promotion_eligible` and `promotion_blockers` are populated by `ab_simulation_service` for every running test, not just completed.

**Frontend tasks:**
- F22. Today `+` icon in header is a visual placeholder. Wire it: opens the `ab_setup` form drawer with no preset target — for power users to start a test from Action Center without first picking a recommendation.
- F23. Status chip click → opens A/B drawer (new component `AbTestDrawer`, side-screen) with `GET /actions/ab-tests/{id}` detail (lift curve, segment splits, audit). Defer to Phase B if scope tight.

**Sorting:** by start_date desc (already).
**Click:** Hold / Stop / Promote → mutation. `+` → form drawer. Card body → A/B detail drawer (Phase B).
**Locked label:** when no tests exist → existing `EmptyBlock` is fine.

---

### 2.13 RejectionList

**Status now:** live.

**Backend tasks:**
- B26. Add `rejections[i].linkedQuoteCount` and `latestQuoteId` so click → open the latest losing quote.

**Frontend tasks:**
- F24. Row click → `/quotes?reason=<code>&source=action-center`.
- F25. Add column header for owner with sortable chips.

**Sorting:** by `revenueLost` desc (already).
**Click:** row → `/quotes?reason=<code>`.
**Locked label:** when `reasonQuality < 0.6` (i.e. many quotes have generic codes) → strip-level amber "Data quality alert: many rejections lack specific reason — coverage <X>%".

---

### 2.14 AuditTrail

**Status now:** live via `audit_service.recent`. Empty when no user.

**Backend tasks:**
- B27. Drop the `_KIND_TO_LABEL` map fallback into a shared module; expose `GET /audit/kinds` so the frontend can render filter chips.
- B28. Add `auditTrail.filterCounts: { kind, count }` so the user can filter inline.

**Frontend tasks:**
- F26. Add filter chips above the list: All / Decisions / Quotes / Studio / A/B / Briefing. Default "All".
- F27. Row click → opens audit row drawer with full `payload` JSON and links to affected record.

**Sorting:** ts desc (already).
**Click:** row → drawer. Filter chip → in-place filter.
**Locked label:** none.

---

### 2.15 ReportCard

**Status now:** live generate / send / preview / retry / trace.

**Backend tasks:**
- B29. Add `reportCard.coverageScore: { value, label }` so the report card can warn before generating ("Coverage 62% — some sections will say 'data unavailable'").

**Frontend tasks:**
- F28. Show coverage chip next to "Generate". Disabled state messaging stays.
- F29. Add "Preview before send" CTA (already calls `openReportArtifact`); keep.

**Sorting / click:** as today.
**Locked label:** when audit block degraded → existing amber warning fires; keep.

---

## 3. Cross-cutting wiring

### 3.1 Deep-link params consumption

`frontend-action-center-page.md` §8 lists every inbound query param that the page does **not** consume. Wire them now:

| Param | Behaviour |
|---|---|
| `?queue=<id>` | Pre-select that filter chip in `BucketFilterRow`. |
| `?customer=<id>` | Scroll to `DecisionCards`, filter to that customer. |
| `?focus=rec-<id>` | Scroll to the matching decision card, expand its inline evidence panel, flash highlight. |
| `?tab=negotiation` | Scroll to `NegotiationCockpit` and expand it. |
| `?persona=till` / `?persona=heiko` | Show a non-blocking banner: "Viewing Frank's Action Center in <Persona> mode" — actual persona switching stays in `PersonaSwitcher`. |
| `?source=<x>` | Pass-through to all outbound `ActionIntent.source` already done via the existing fallback in `runUiAction`. |

Add a single `useSearchParams` reader at the top of `index.tsx` that maps these into local state. Document each param in a `// @doc` comment block.

### 3.2 Recommendation lifecycle (Roadmap §7 backend)

Every `decisions[i]` card must be a row in a `recommendation_lifecycle` table (Roadmap §7 lists this as missing). Until that table exists, the BFF synthesises lifecycle state from `pricing_proposals` + `actions_audit`. Build the real table in Phase 2; for this iteration:
- B30. Confirm composer always returns `decisions[i].lifecycleState ∈ {open, accepted, rejected, partial, snoozed, ab_running, ab_promoted}`.
- F30. Inline lifecycle chip on every card.

### 3.3 Trust badges everywhere

Roadmap §6.1 Modification list: "every recommendation card uses the same evidence/action structure". Enforce:
- B31. Every card-producing block (`decisions`, `skuTable`, `lostQuote`, `abTests`) carries the same `confidence` shape.
- F31. Single shared `<ConfidenceChip>` and `<EvidenceInline>` component in `features/action-center/components/_shared/`. Replace any one-off badge.

### 3.4 Persona handoff

- B32. `POST /actions { kind: 'share_decision', recipient: 'till'|'heiko', target_id }` already exists; verify the receiving persona's `notifications` block surfaces it.
- F32. After Share submission, toast deep-link "Open <Till|Heiko>'s view" → `/persona/<recipient>?focus=rec-<id>`.

---

## 4. What to delete / clean up

| Code | Action | Reason |
|---|---|---|
| `index.tsx:29` `FALLBACK_MOVABLE_HERO` | Delete | Backend must always attach action; defensive fallback hides bugs. |
| All `runUiAction({ route, query, toast })` inline fallbacks inside `BucketGrid` / `LostQuoteCard` / `SkuTable` branches (`index.tsx:139, 194, 217`) | Delete | Same reason; replace with assert in dev. |
| `backend/services/action_center/_seed.py` + `seeds/screens/action-center.json` | Delete after every block is real | Seed parity is misleading once we promise live data. |
| Seed fallback inside `decisions.py`, `abtests_stub.py`, `audit_stub.py`, `negotiation.py` | Replace with `ActionCenterBlockError("<block>", "<reason>")` → block renders `status: empty` with reason | Roadmap §0 iron rule 2. |
| `BucketGrid.tsx` component file | Delete | Replaced by `BucketFilterRow.tsx`. |
| Static workspace-scope + export drawer items (`PageHead.tsx:151-181`) | Delete static array; consume `header.workspaceScope` / `header.exportContext` | No hardcoded numbers / labels. |
| `frontend-v2/src/data/mocks/action-center.json` (if still referenced) | Keep ONLY behind `VITE_USE_MOCKS=1`. Default flag flips to `0`. | Mock-mode parity stays for dev; never reach prod. |

---

## 5. Backend-required tasks (must ship before frontend wiring)

In strict order so backend can ship independently:

1. **B5** — new `summary.py` block + `tiles[5]` schema + contract test.
2. **B6** — add `financialImpact.recoverableMargin` to decision candidates.
3. **B12 / B13 / B14 / B15** — extend `decisions` payload (evidence, confidence, featureImportance placeholder, linked IDs).
4. **B10 / B11** — refactor buckets → filters.
5. **B20 / B21 / B22** — extend SKU rows with price-book floor / ceiling, last-move days, sample size.
6. **B19** — `lostQuote.byReason` breakdown.
7. **B23** — wire `margin_service.get_gap_analysis` into negotiation.
8. **B26** — rejection rows: linkedQuoteCount + latestQuoteId.
9. **B27 / B28** — audit kinds endpoint + filter counts.
10. **B29** — report coverage score.
11. **B30** — lifecycle state on decisions.
12. **B31** — uniform confidence shape across blocks.
13. **B17** — re-fetch test after accept hides card.
14. **B1 / B2** — persona payload + feature flag.

Each task: one focused commit + contract test in `tests/contract/test_action_center.py` or a new sibling file. Pre-existing contract tests already enforce block shapes — extend them, don't replace.

---

## 6. Frontend tasks (after backend lands for that block)

In a sensible build order:

1. **F4 / F5** — `TodaySummaryStrip` component.
2. **F8 / F9** — `BucketFilterRow` replacing `BucketGrid`; thread `queue` state.
3. **F10 / F11 / F12 / F13** — `DecisionCards` inline evidence panel + lifecycle chip + CTA copy.
4. **F17 / F18 / F19** — `SkuTable` sortable columns + bulk select + stale chip + side-drawer summary.
5. **F15 / F16** — `LostQuoteCard` inline reasons.
6. **F20 / F21** — `NegotiationCockpit` locked-card state.
7. **F22 / F23** — `AbTestList` `+` wiring + A/B detail drawer.
8. **F24 / F25** — `RejectionList` row navigation.
9. **F26 / F27** — `AuditTrail` filter chips + row drawer.
10. **F28 / F29** — `ReportCard` coverage chip.
11. **F31** — extract shared `<ConfidenceChip>` and `<EvidenceInline>` and replace per-block one-offs.
12. **F2 / F6 / F7** — payload-driven workspace/export drawers, hero heuristic copy, delete fallback intents.
13. Deep-link param wiring (§3.1).

After each frontend task: run `npm run test`, `npm run lint`, `npm run typecheck`. After each block: visual sanity in browser (commit + push per the existing phase-commits rule).

---

## 7. Locked-feature surfaces on this screen

Render with a small `lock` icon (Pryzm 2026 token: `rose-300` outlined chip) and copy from this table. **No locked card may show a number.** All numbers replaced with `—`.

| Surface | Trigger condition | Copy | Unlock requirement |
|---|---|---|---|
| `MovableHero` "Pilot" chip | `meta.blocks.movableHero.isMovableHeuristic === true` | "Pilot — using list-price proxy for movable flag." | Contracts table populated. |
| `decisions[i].featureImportance` block | array empty | "Feature importance ships with the model registry (Phase 2)." | `model_registry` table seeded. |
| `decisions[i]` cluster confidence chip | `sampleSize < 5` | "Low data — confidence treated as heuristic." | Cluster has ≥5 quote outcomes. |
| `NegotiationCockpit` discount-gap headline | derived from seed | "Annual list-price negotiation activates after gap analysis is wired." | `margin_service.get_gap_analysis` returns live rows. |
| `NegotiationCockpit.contracts` block | contracts table missing | "Contract renewal view unlocks once contract data is connected." | Contract feed connected. |
| `lostQuote.byReason` chip "Data quality alert" | `reasonQuality < 0.6` | "Many rejections lack specific reason codes — coverage <X>%." | Sales-feedback capture flow shipped (Phase 3). |
| `AbTestList` competitor card | always (until competitor intel ships) | Hidden, but `+` action shows tooltip "Competitor-driven A/B unlocks with competitor intelligence (Phase 4)." | Competitor feeds connected. |
| `ReportCard` board-pack template | template not approved | "Board-ready template pending Till approval." | Approved template uploaded. |

---

## 8. Theme adherence checklist

Apply to every new file under `features/action-center/components/`:

- Use `Card`, `Drawer`, `Button`, `Chip` from `frontend-v2/src/components/ui/` — never raw `<div>` styled inline for these primitives.
- Display numerics in `font-display` (Manrope), labels in `font-sans` (Inter caps `text-[11px] tracking-[0.18em] uppercase`).
- Card body padding: `p-6` (lg) / `p-5` (md), border-radius `rounded-2xl`, border `border border-[rgb(var(--warm-300)/0.7)]`.
- Primary action chips: rose-filled (`bg-[var(--rose-600)] text-white`), secondary: warm-gray-outlined.
- Charts: rose (`var(--rose-500)`) on warm-gray axis, no neon.
- Spacing rhythm: 24-32-40 between sections.
- Right-rail drawers: 560 px wide, slide from right, dim backdrop, ESC + backdrop + close button all dismiss.
- Inline expansions: fade + slide-down 200 ms (`motion/AnimatePresence`).
- No emojis in UI strings.

Verification: after each frontend change, run an axe/lighthouse pass once Phase A blocks are wired (use `/benchmark` skill).

---

## 9. Side panel / drawer matrix (what opens what)

| Trigger | Opens | Width | Component |
|---|---|---|---|
| `TrustStrip` tile | TrustDrawer | 560 px right | `TrustDrawer.tsx` |
| `PageHead` "Workspace scope" | Workspace drawer (read-only) | 560 px right | dispatched via `ActionDrawerHost` |
| `PageHead` "Export" | Export-context drawer | 560 px right | dispatched via `ActionDrawerHost` |
| `PageHead` "Save view" | `saved_view_save` form drawer | 480 px right | form registry |
| Decision card "Apply partial" | `partial_accept` form drawer | 480 px right | form registry |
| Decision card "Slice A/B" | `ab_setup` form drawer | 520 px right | form registry |
| Decision card "Share" | `share_decision` form drawer | 480 px right | form registry |
| Decision card "Snooze" | `snooze` form drawer | 420 px right | form registry |
| Decision card "See full lineage" | Lineage drawer | 640 px right | new `LineageDrawer.tsx` (Phase B) |
| SkuTable article column | SKU summary side panel | 480 px right | new `SkuSummaryDrawer.tsx` |
| AuditTrail row | Audit row drawer | 480 px right | new `AuditRowDrawer.tsx` |
| AbTestList card body | A/B detail drawer | 560 px right | new `AbTestDrawer.tsx` (Phase B) |
| `TodaySummaryStrip` "Model trust" tile | TrustDrawer (reuse) | 560 px right | `TrustDrawer.tsx` |

Full-page navigations (NOT drawers):
- Decision primary CTA → `/pricing?aid=…&source=action-center`
- Decision quote CTA → `/quotes?quote=…&source=action-center`
- Decision customer CTA → `/persona/heiko?customer=…&source=action-center` (sales handoff) or `/margin?customer=…` (diagnostic)
- SkuTable action button → `/pricing?aid=…`
- BucketFilterRow cmd-click → `/pricing?queue=…`
- LostQuoteCard CTA → `/margin?focus=lost_quote`
- TodaySummaryStrip blocked-quotes tile → `/quotes?status=blocked`
- NegotiationCockpit commodity tile → `/forecasting?cluster=…`
- RejectionList row → `/quotes?reason=…`

---

## 10. Acceptance criteria (per task, paste into PR description)

For backend tasks (B*): contract test passes, response shape documented in `backend/schemas/screens/action_center.py`, no seed fallback, returns `status: empty` with reason when data missing.

For frontend tasks (F*): Vitest snapshot or interaction test under `frontend-v2/src/tests/action-center/`, no literal numbers in JSX, axe pass, visual diff against current screen attached to PR.

For locked-feature surfaces: copy matches §7 table verbatim; lock icon present; underlying number rendered as `—`; tooltip explains unlock condition.

---

## 11. What we are NOT building this iteration

Defer to later phases (Roadmap §9):
- Right-rail reviewers + saved sections panel — Phase B (after main column is clean).
- A/B detail drawer (`AbTestDrawer.tsx`) — Phase B.
- Competitor intelligence cards — Phase 4.
- Commodity planning unlocks — Phase 4.
- ERP price-book publish from Action Center — Phase 5.
- Autonomous email/PDF send — Phase 3+.

These should appear as locked or hidden, never as half-built features.

---

## 12. Open data gaps (record so we don't forget)

These will block full live wiring until the client delivers them. The plan above marks each affected block as `Pilot` or `Locked` rather than waiting.

- Contracts table (start/end dates, locked-vs-movable flag).
- Customer-SKU relationship table (`customer_on_sku` populated).
- `cost_state` populated for all live AIDs.
- `pricing_audit` populated with real history.
- `model_registry` rows for every cluster.
- Sales-feedback / rejection-reason capture flow.
- Competitor reference data.
- Commodity index feed.
- Plan / target data per cluster.

Each gap should appear in `docs/DATA-AUDIT-2026-05-17.md` (already started) with the owning client request.
