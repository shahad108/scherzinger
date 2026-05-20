---
name: frank-pricing-studio-v3
status: ready
created: 2026-05-14
branch: pricing-studio-v3 (cut from forecast-redesign-v2)
sister-plan: 2026-05-14-frank-forecasting-v2.2.md
---

# Frank's Pricing Studio v3 — Implementation Plan

> **For agentic workers (Claude Code):** Phases are sequenced backend → frontend.
> Phase 0 is the live-wiring + audit backbone *everything else relies on*; do it
> first or every later phase silently regresses to fake-looking numbers.
> Phases 1–11 map 1:1 to the 11 groups discussed in chat. Each phase contains:
> Why · Research basis · Backend (data + API contract) · Side panels · Frontend
> layout · Live-wiring · Connections to other pages · Acceptance criteria.

## 0. Reading guide

| Term | Meaning |
|---|---|
| **Live-wired** | Every visible number is fetched from a typed BFF field. No hard-coded copy, no client-computed magic numbers. A change in the database is visible in the UI within one SSE tick (≤2 s) or one query-invalidation (≤500 ms). |
| **Source of truth** | The backend service that owns the field. UI renders it; never derives it. If two surfaces need the same number, they read the same field. |
| **Side panel** | A right-rail drawer that opens over the Studio without losing context. Always closeable with ESC. Width: 480 px. Focus-trapped. |
| **Cross-page handoff** | A URL contract — params + their effect — that lets another page deep-link into the Studio at a known state. |

## 1. Audit (current state, very brief)

Already documented in `docs/frontend-pricing-studio-page.md`. The page is
single-surface, two-column. Major holes from a "professional pricing tool"
standard:

| Hole | Why it matters |
|---|---|
| `useStudio()` takes no params; the page has no shell-level filter URL | A deep link from Forecasting can't carry tier/family/cluster context. |
| SKU picker click does **not** update the URL | Refresh loses the working SKU; can't share a link with a colleague. |
| `Push to quoting` is a disabled stub | The whole "decide → publish" loop dead-ends. |
| `RationaleMemo` Copy/Email/PDF, `CrossLinks` pills, `Branded PDF` are stubs | The page is a memo generator, not a workflow. |
| No recommendation, no WTP, no win-probability, no competitor reference | Frank picks from five options with no opinionated answer; competitors all ship a single recommended price with confidence. |
| No approval-workflow visualization | Mittelstand requires it; Pricefx, SAP S/4HANA, DealHub all ship a visible stepper. |
| No live wiring — every value is a static fetch with 60 s stale time | If steel jumps mid-session, Frank doesn't know unless he reloads. |
| No audit trail surface | Every leading tool exposes the who/what/when/why log; we have none. |

## 2. Design principles (non-negotiable)

1. **Backend owns truth, frontend owns rendering.** No formatting strings, no thresholds, no tone logic in the frontend except mapping a tone name (`good`/`bad`/`amber`) to a Tailwind class. Sort keys, currency codes, decimals, rounding rules — all from the BFF.
2. **Live first, polled second.** Every field that can change while the page is open has an SSE channel. TanStack Query is invalidated by the channel, not by a setInterval.
3. **One number per source.** If "DB2 margin at proposed price" appears in three places, all three read the same field. We expose it once in `useStudio`.
4. **Every claim is traceable.** Every visible value carries a `lineage_ref`; clicking it opens the **Lineage Drawer** with sources, SQL, model, and timestamp.
5. **No phantom buttons.** No disabled stubs in v3 — either the button is wired end-to-end or it isn't there.
6. **Graceful degradation.** New BFF fields are optional; the page renders without them, but with a `<DataMissingBadge>` so we can see what's missing in prod.
7. **Mode-aware.** Every number can be rendered in € / % / units / per-unit. Mode is a URL param; the BFF responds in the requested unit.

## 3. Live-wiring architecture (Phase 0 prerequisite — explained here once)

Three event channels. All three are server-pushed via Server-Sent Events
([SSE is the right pattern for one-way push of pricing data](https://www.twocents.software/blog/real-time-features-in-saas/);
WebSocket reserved for collaborative edit, see Group 5).

| Channel | Topic prefix | What pushes | Who listens |
|---|---|---|---|
| `pricing.*` | e.g. `pricing.cost_moved`, `pricing.competitor_moved`, `pricing.recommendation_updated` | Backend services on data refresh (cost ingest, competitor feed, recompute) | Studio page, Forecasting page, Margin Cockpit |
| `proposal.*` | e.g. `proposal.created`, `proposal.approved`, `proposal.implemented` | Pricing service on every CRUD | Studio, Action Center, Approval inbox |
| `collab.*` | e.g. `collab.cursor`, `collab.comment.added`, `collab.proposal.locked` | WebSocket (bi-directional) | Studio page only |

Each event carries `{ aid?, cluster?, ts, payload }`. The `useStudio` hook
subscribes to `pricing.*` filtered by the active `aid` and invalidates the
matching query key. Every later phase assumes this exists.

---

# PHASE 0 — Foundation (BACKEND ONLY, ship before any UI work)

> **Why first:** Every later phase asks "and the value updates live, right?"
> If this isn't in, all 11 phases ship fake-looking software.

## 0.1 — Unify the pricing data model

**Goal:** one canonical Pydantic model per concept. Today the Studio shell, the
Action Center recommendation, the Forecasting `priceFloor`, and the Margin
Cockpit per-customer pane each carry their own `current_price` / `floor` /
`db2` shapes. Pick one.

**Models to canonicalize (Pydantic, in `scherzinger-platform/backend/models/pricing/`):**

| Model | Fields | Owner service |
|---|---|---|
| `PriceState(aid)` | current_price, currency, floor, ceiling, list_price, last_set_by, last_set_at, lineage_ref | `pricing_state.py` (new) |
| `CostState(aid)` | unit_cost, breakdown {material, labor, outsourcing, overhead}, last_ingested_at, trajectory_30d, lineage_ref | `cost_state.py` (new) |
| `MarginState(aid, price)` | db1, db2, db3, pocket_pct_of_list, lineage_ref | `margin_state.py` (new) |
| `CustomerOnSku(aid, customer_id)` | last_paid, last_paid_at, ltm_units, churn_p, wallet_share_pct, tier, lineage_ref | `customer_on_sku.py` (new) |
| `Recommendation(aid)` | recommended_price, confidence, band {min, target, max}, drivers[], rationale_md, lineage_ref | `recommendation.py` (new) |
| `LineageRef(id)` | source_kind, source_id, sql?, model?, computed_at, computed_by | `lineage.py` (new) |

**Deliverable:** every Studio sub-page reads from these models, never recomputes.

## 0.2 — SSE channel

**Endpoint:** `GET /api/v1/events/stream?topic=pricing&aid=…&cluster=…`
returns `text/event-stream`. Auth-gated. Backpressure-safe.

**Publisher:** every write path (`pricing_state.set_price`, `cost_state.ingest`,
`recommendation.recompute`, etc.) calls `events.publish(topic, payload)`.
Implementation: in-process pub/sub for single-worker dev; Redis pub/sub for
multi-worker prod.

**Consumer (frontend):** `hooks/usePricingStream.ts` (new) — opens an
`EventSource`, dispatches `queryClient.invalidateQueries({ queryKey: ['studio', aid] })`
on matching events.

## 0.3 — Audit & lineage backbone

**Table `pricing_audit`:** one row per state change.

| Column | Type | Note |
|---|---|---|
| id | uuid | |
| at | timestamptz | |
| actor | str | "frank@…" or "system" |
| action | enum | price_set, proposal_created, proposal_approved, override_added, alert_triggered, push_to_quoting, etc. |
| target_kind | enum | sku, customer, cluster, family |
| target_id | str | |
| before | jsonb | snapshot |
| after | jsonb | snapshot |
| reason | str | required for human actions |
| lineage_ref | uuid → `lineage_refs` | |

Every API mutation writes one row. The **Audit Drawer** (Phase 4) reads from
this table. The **Lineage Drawer** (Phase 1) reads from `lineage_refs`.

## 0.4 — Approval-rules engine

**Service `pricing/approval_rules.py`:** evaluates `should_route_for_approval(proposal) → ApprovalDecision`
where `ApprovalDecision = { needs: [approver], thresholds_hit: [], auto_approve: bool }`.

Rules stored in `pricing_approval_rules.json` (seed) — pattern from Pricefx
Workflow Logics: each rule is `{ condition: jsonlogic-expr, route_to: [actor], note: str }`.
Inspired by [Pricefx Approval Workflow Logic](https://knowledge.pricefx.com/space/KB/3808559109)
and [SAP S/4HANA Sales Price Approval Workflow](https://community.sap.com/t5/enterprise-resource-planning-blog-posts-by-members/sales-price-approval-workflow-in-s-4-hana/ba-p/13563241).

Used by Phase 5 (visual stepper) and Phase 6 (batch repricing) and Phase 7
(push-to-quoting gate).

## 0.5 — Frontend live-wiring hook

`hooks/useLivePricing.ts` (new):
- Wraps `useStudio` with SSE-driven invalidation.
- Exposes `{ data, isLive, lastTickAt, stalenessSec }`.
- Triggers a soft toast "Cost updated for 200832-E (steel +1.2%)" when an event arrives while the SKU is open.

## 0.6 — Shell-level filter URL

Add `tier`, `family`, `cluster`, `scenario_id` as URL params on `/pricing`.
Make `useStudio({ aid, tier, family, cluster, scenario_id })` real (today it's
no-arg). Fix the SKU-picker → URL sync (current bug noted in the doc).

## 0.7 — Acceptance for Phase 0

- [ ] `GET /events/stream` returns an SSE stream, survives an integration test that asserts a published event reaches the consumer.
- [ ] Writing a price via `pricing_state.set_price()` creates a `pricing_audit` row AND emits `pricing.price_set`.
- [ ] `useLivePricing()` re-renders within 2 s of a backend write, without manual reload.
- [ ] `?aid=200832-E&tier=A&family=BKAGG` deep-link round-trips correctly; SKU picker click updates URL.

---

# PHASE 1 — Recommend & defend the price

**Frank's question:** *"What should I set, and why?"*

## 1.1 Research basis

[Pricefx PricingAI](https://www.pricefx.com/software/pricingai) and
[Vendavo Deal Price Optimizer](https://www.vendavo.com/our-products/deal-price-optimizer/)
both ship a single **recommended price** with a confidence band and an
explanation. Zilliant Deal Manager uses
[start / target / floor guidance values per line item](https://zilliant.com/products/deal-manager).
The pattern is: one opinionated number, not five options, with a "Why this
price?" drilldown.

## 1.2 Backend (build first)

### 1.2.1 `services/pricing/recommendation.py`

Function: `build_recommendation(aid, cluster?, customer_id?) → Recommendation`

Inputs:
- `CostState` (Phase 0.1)
- `cost_floor + safety_margin` from `pricing_floor` table
- `competitor_signal` from `services/competitor/index.py` (new — see 1.2.2)
- `wtp_band` from `services/pricing/wtp.py` (new — see 1.2.3)
- `win_prob_curve` from `services/pricing/elasticity.py` (new — see 1.2.4)

Output (subset of `ForecastShell.recommendation`):

| Field | Type | Source |
|---|---|---|
| recommended_price | money | optimization result that maximizes expected DB2 across win-prob curve |
| confidence | enum (low/med/high) | from sample size + WTP band width |
| band.min | money | win-prob ≥ 80% lower bound |
| band.target | money | recommended_price |
| band.max | money | win-prob ≥ 50% upper bound |
| drivers[] | list of `{kind, label, contribution_pct, lineage_ref}` | SHAP-style attribution: cost +X%, competitor -Y%, mix +Z% |
| rationale_md | markdown | server-side LLM-rendered, NOT client-side, so it's deterministic |
| lineage_ref | uuid | links to `lineage_refs` |

### 1.2.2 `services/competitor/index.py`

Source: existing `services/action_center/rejections.py` (PA = competitor cheaper,
PR = price-too-high). Output per SKU: median competitor price observed in lost
quotes in last N days, sample count, last-seen date. Field name: `competitor_ref`.

### 1.2.3 `services/pricing/wtp.py`

Per [Zilliant's transaction-level WTP measurement](https://zilliant.com/blog/customers-willingness-to-pay)
— 12–24 months of won-deal price distribution per SKU × tier. Output:

| Field | Type |
|---|---|
| p10 | money |
| p50 | money |
| p90 | money |
| n_deals | int |
| window_days | int |

If `n_deals < 5`, return `confidence: 'low'` and fall back to cluster-anchor
prices (the same pattern `ComparablePanel` already uses for new SKUs).

### 1.2.4 `services/pricing/elasticity.py`

Win-probability curve: logistic regression over historical quote outcomes
(`won` / `lost`) regressed on `(price - cost) / cost`. Output: 20 points across
[floor, ceiling] of `{ price, win_prob, lower_ci, upper_ci }`. Per
[Vendavo's price-curve approach](https://www.vendavo.com/all/price-curve-optimization/)
and [Zilliant on B2B elasticity](https://zilliant.com/blog/price-elasticity-in-b2b-the-real-meaning-of-optimization).

### 1.2.5 Composer wiring

Attach to `StudioShell`:

| BFF field | Source |
|---|---|
| `workbench.recommendation` | `build_recommendation(aid, …)` |
| `workbench.wtp` | `build_wtp(aid, tier)` |
| `workbench.win_prob_curve` | `build_win_prob_curve(aid)` |
| `workbench.competitor_ref` | `build_competitor_ref(aid)` |

All optional; missing → render `<DataMissingBadge reason="No sample">`.

## 1.3 Side panel — "Why this price?" Lineage Drawer

**Trigger:** click any number on the recommendation card, or the "🔍 Why this price?" button already in `PriceOptions`.

**Width:** 480 px. **Header:** `Why €127 for 200832-E?`. **Body:**

```
┌─────────────────────────────────────────────────────────────┐
│  Recommended €127        [confidence: medium · n=14 deals]  │
├─────────────────────────────────────────────────────────────┤
│  Drivers (waterfall, descending |contribution|)             │
│                                                             │
│   Cost trajectory        +€8   ████████░░░░░░░░             │
│   Competitor signal      −€4   ████░░░░░░░░░░░░             │
│   Customer mix (tier A)  +€3   ███░░░░░░░░░░░░░             │
│   Win-prob optimum       +€2   ██░░░░░░░░░░░░░░             │
│   Floor protection       +€1   █░░░░░░░░░░░░░░░             │
├─────────────────────────────────────────────────────────────┤
│  WTP band (last 12 mo, tier A · 14 deals)                   │
│   p10 €112 ─── p50 €124 ─── p90 €138                        │
│   recommended €127 ───────────^                             │
├─────────────────────────────────────────────────────────────┤
│  Sources (click any to view raw)                            │
│   • Cost: invoice ledger ingest 2026-05-14T03:12Z   →       │
│   • Competitor: 9 lost quotes (PA code) last 90d    →       │
│   • Elasticity model v2026-05-09                    →       │
│   • Won-deal sample: 14 quotes, see Audit           →       │
└─────────────────────────────────────────────────────────────┘
```

**Live-wired:** subscribes to `pricing.recommendation_updated` for this aid.
If recommendation recomputes while drawer is open, a banner shows
"Recomputed 8 s ago — view new".

## 1.4 Frontend layout (no raw numbers — every value is a typed field)

Replace today's `PriceOptions` with a hero **Recommendation Card** at the top
of the workbench column; demote Hold/Cost-floor/Market/Custom to a compact row
below it.

```
┌─ Recommendation ─────────────────────────────────────────────┐
│  RECOMMEND       €127.00  [HIGH MARGIN]                      │
│  Today  €118.00            Δ +7.6%                           │
│                                                              │
│  Confidence: medium  (n=14 won deals, 90d)  · Why this price?│
│                                                              │
│  Band:   €112 ────●────●────●──── €138                       │
│          floor    p10  rec   p90                             │
│                                                              │
│  Win prob at this price: 71% ████████████░░░░                │
│                                                              │
│  Competitor (last seen 2026-05-12): €121  ── ⚠ below ours    │
└──────────────────────────────────────────────────────────────┘
```

### KPI tiles row (below the card)

| Tile | Field | Tone |
|---|---|---|
| Current price | `workbench.current_price` | neutral |
| Recommended | `recommendation.recommended_price` | rose-deep |
| Δ to current | computed by BFF, not client | up=good if margin↑, bad if margin↓ |
| Projected DB2 at recommended | `margin.db2_at_recommended` | tone from BFF |
| Win prob at recommended | `win_prob_curve.point_at(recommended)` | tone from BFF |
| Confidence | `recommendation.confidence` | enum tone |

### Charts in this section

| Chart | Library | Data field |
|---|---|---|
| WTP band strip (1D) | Recharts BarChart horizontal with reference dots | `wtp.{p10,p50,p90}` + `recommendation.recommended_price` |
| Win-prob curve | Recharts AreaChart with confidence interval ribbon | `win_prob_curve[]` |
| Driver waterfall | Recharts BarChart stacked-range (re-use `computeWaterfall` from PVMWaterfall) | `recommendation.drivers[]` |

## 1.5 Live-wiring

- `pricing.cost_moved(aid)` → recompute recommendation server-side → push `pricing.recommendation_updated(aid)` → `useLivePricing` invalidates `studio` query → card re-renders with new value and a "Updated 3 s ago" badge.
- `pricing.competitor_moved(aid)` → same.

## 1.6 Connections

| From | URL contract | Effect |
|---|---|---|
| Action Center recommendation card | `/pricing?aid={aid}&recommendation={ref}&source=action-center` | Already wired (DeepLinkBanner). Phase 1 adds: recommendation card pre-fills with the Action Center's recommended price + matching driver attribution. |
| Forecasting NextCycleMovesStrip | `/pricing?aid={aid}&queue=next-move&source=forecasting` | New deep link; banner shows "From Forecasting next-move strip". |
| Margin Cockpit leaky-SKU click | `/pricing?aid={aid}&source=margin&reason=leakage` | New deep link; recommendation prioritises floor protection driver. |

## 1.7 Acceptance

- [ ] Hero Recommendation card shows a price that came from the BFF, not from any client-side calc.
- [ ] Clicking the price or "Why this price?" opens the Lineage Drawer with at least 3 driver rows and 3 sources.
- [ ] Recomputing the recommendation on the backend (manual `recommendation.recompute(aid)`) causes the card to update within 2 s.
- [ ] When `n_deals < 5`, confidence chip reads `low` and the WTP band visual switches to "anchored from cluster comparables".
- [ ] Deep link from Action Center prefills correctly; deep link from Forecasting prefills correctly.

---

# PHASE 2 — Customer reality

**Frank's question:** *"Who pays this today, and what's the risk of moving them?"*

## 2.1 Research basis

Zilliant Deal Manager surfaces per-customer guidance with start/target/floor and
last-paid history; Vendavo guides quotes against customer wallet share. Modern
CPQs ([Salesforce CPQ Price Waterfall](https://help.salesforce.com/s/articleView?id=000380701&language=en_US&type=1))
show per-customer pocket margin so the rep can see who's underpaying.

## 2.2 Backend

### 2.2.1 Extend `services/pricing/customer_on_sku.py`

Per (aid, customer_id):

| Field | Source |
|---|---|
| last_paid | invoice ledger |
| last_paid_at | invoice ledger |
| ltm_units | invoice ledger |
| ltm_eur | invoice ledger |
| churn_p | reuse `pChurn4Q` from forecasting customer service |
| decline_p | reuse `pDecline4Q` |
| wallet_share_pct | this customer's spend on this SKU / total customer spend |
| risk_if_moved | model: `f(churn_p, wallet_share_pct, Δprice)` returns probability of losing the account in 4Q |
| paid_band | { p10, p50, p90 } across customer's history for this SKU |
| lineage_ref | … |

### 2.2.2 Cluster-level fanout enrichment

Currently `CustomerFanout` shows a list. Extend the row to carry these extra
fields so the frontend has everything it needs without a second fetch.

### 2.2.3 Reactive recomputation

When the user changes the active price option, **the BFF re-emits the customer
fanout** keyed by proposed price. Implementation: `POST /screens/studio/fanout`
with `{ aid, proposed_price }` returns the re-scored rows. Cache key includes
proposed price.

## 2.3 Side panel — Customer Drill-in

**Trigger:** click any customer row in the fanout.

**Body:**

```
┌─ Linde Group · Tier A · BKAGG ───────────────────────────────┐
│  This SKU                                                    │
│   Last paid:  €121.00  (2026-04-03)                          │
│   LTM units:  240    LTM €: €29,040                          │
│   Paid band:  ●─────●─────●   €112 / €121 / €128             │
│                                                              │
│  At proposed €127.00                                         │
│   Δ vs last paid:  +€6.00  (+5.0%)                           │
│   Risk if moved:   18% churn 4Q  · ⚠ wallet share 34%        │
│                                                              │
│  Wallet across all SKUs (top 5)                              │
│   ▒▒▒▒▒▒▒▒  200832-E   34%   €29k                            │
│   ▒▒▒▒▒    400119-S   18%   €15k                             │
│   ▒▒▒      550210-P    8%    €7k                             │
│   …                                                          │
│                                                              │
│  History on this SKU (mini timeline, 24mo)                   │
│   [sparkline of paid prices, dots at every transaction]      │
│                                                              │
│  Actions                                                     │
│   [Queue customer-specific proposal]  [Open in Margin Cockpit]│
└──────────────────────────────────────────────────────────────┘
```

## 2.4 Frontend changes to CustomerFanout

| Element | Source | Live |
|---|---|---|
| Row tone (alert/warn/plain) | `customer_on_sku.risk_if_moved` thresholded **by BFF** | yes |
| Right-side chip "churn 14%" | `churn_p` | yes |
| New column "wallet share" | `wallet_share_pct` | yes |
| New micro-bar inside row "Paid band p10/p50/p90 + proposed marker" | `paid_band` + `proposed_price` | yes |
| Row click → Customer Drill-in side panel | n/a | n/a |

## 2.5 Live-wiring

- Active price change in `PriceOptions` → re-fetch `/screens/studio/fanout` → rows animate to new tone.
- `proposal.created` for any customer in the fanout → row gains a small "proposal queued" badge.

## 2.6 Connections

| From / To | Contract |
|---|---|
| Customer Drill-in → Customer detail in Margin Cockpit | `/margin?customer_id={id}&source=studio&aid={aid}` |
| Customer Drill-in → Forecasting per-customer view (after Phase J fold-in) | `/forecasting?customer_id={id}&source=studio` |
| Forecasting At-Risk Revenue bar (v2.2 Phase F) → Studio for the top at-risk SKU of that tier | `/pricing?aid={aid}&tier={t}&source=forecasting&reason=at-risk` |

## 2.7 Acceptance

- [ ] Each row's tone, chip, and paid-band are typed BFF fields — no client thresholds.
- [ ] Changing the active price option re-scores all rows within 500 ms.
- [ ] Drill-in shows wallet share with at least three SKUs when the customer is a top account.
- [ ] An external `customer_state.update(customer_id)` event live-updates the row.

---

# PHASE 3 — Cost & margin reality

**Frank's question:** *"What's my cost doing, and what's the actual pocket margin at each option?"*

## 3.1 Research basis

[Salesforce CPQ Price Waterfall](https://help.salesforce.com/s/articleView?id=000380701&language=en_US&type=1)
and [DealHub's price waterfall guide](https://dealhub.io/glossary/price-waterfall/)
both show a step-by-step list → quoted → invoiced → pocket breakdown. McKinsey's
pocket-margin lens is the canonical visual (already adopted for Forecasting
v2.1). For cost trajectory, Vistaar and Vendavo both ingest raw-material
indices and show forward projections per commodity.

## 3.2 Backend

### 3.2.1 Reuse Forecasting composers

| Composer | Used here |
|---|---|
| `forecast/cost_decomposition.py` | Material/labor/outsourcing/overhead structure |
| `forecast/commodity_trajectories.py` | Forward commodity slopes (next 6 mo) |
| `forecast/pocket_waterfall.py` | List → Quoted → Booked → Invoiced → DB2 |
| `forecast/erosion_projection.py` (v2.2 Phase E) | When does cost cross floor |

These exist; expose them at SKU granularity (today most are cluster-level).
Add `aid` parameter to each.

### 3.2.2 New `services/pricing/option_margin.py`

For each `PriceOption` (Hold / Floor / Market / Custom / Recommendation), compute
the full pocket waterfall **at that price**. Output:

| Field per option | Type |
|---|---|
| list | money |
| quoted | money |
| booked | money |
| invoiced | money |
| db2 | money |
| leakage_per_step_pct | list[float] |
| lineage_ref | … |

This lets the frontend show a mini-waterfall *inside each option card* — no
client-side math.

### 3.2.3 Trigger context

`services/pricing/trigger_context.py` — when the user landed on this SKU via
`?recommendation=…`, return the originating signal: "Steel S355 +8% last 30
days · cost crossed your safety margin on 2026-05-09". Reuses the existing
`marketDirection` source.

## 3.3 Side panel — Cost Trajectory Drawer

**Trigger:** click the cost-history sparkline or the "View 6mo cost outlook" pill.

**Body:**

```
┌─ Cost outlook · 200832-E · BKAGG ────────────────────────────┐
│  Today  €78.40 / unit                                        │
│  6mo forecast band (p20-p80)                                 │
│                                                              │
│  [line chart: solid history, dashed forecast, ribbon p20-p80]│
│                                                              │
│  Components today  →  in 6 mo                                │
│   Material        €42  →  €46   (+9% · Steel S355 trend)     │
│   Labor           €18  →  €19   (+5%)                        │
│   Outsourcing     €11  →  €11   (flat)                       │
│   Overhead        €7   →  €7    (flat)                       │
│                                                              │
│  Floor crosses today's list price on 2026-09 (≈ 4 mo)        │
│                                                              │
│  [Set cost alert ≥ €X]   [Open Margin Cockpit cost lens]     │
└──────────────────────────────────────────────────────────────┘
```

## 3.4 Frontend changes

### 3.4.1 PriceOptions cards — embed mini-waterfall

Each option card today shows label / price / delta / impact / risk. Add a
horizontal mini-waterfall under the price:

```
Recommended €127.00         Δ +7.6%
list 100 ▓▓▓▓▓▓▓▓▓▓
quoted   88 ▓▓▓▓▓▓▓▓░░
booked   80 ▓▓▓▓▓▓▓▓░░
invoiced 76 ▓▓▓▓▓▓▓▓░░
DB2      18 ▓▓░░░░░░░░    pocket 18% of list
```

Renders from `option_margin.{option_id}` typed payload. No client math.

### 3.4.2 Trigger banner on top of workbench

When `trigger_context` is non-null, render a one-liner above the
recommendation card: *"Opened because Steel S355 cost rose 8% in the last 30
days, crossing your 18% safety margin."* Click → opens the Cost Trajectory
Drawer scrolled to the steel sparkline.

### 3.4.3 CostHistory panel — keep, but the bottom mini-trajectory now
**live-renders** from `commodity_trajectories.py`, not hardcoded points.

## 3.5 Live-wiring

`pricing.cost_moved(aid)` → invalidate `option_margin` and `cost_history` →
the mini-waterfalls inside each option card animate, and the cost-history
sparkline grows a new point.

## 3.6 Connections

| From / To | Contract |
|---|---|
| Forecasting CostDecompositionCard | Click a cost-tile → opens Studio for the top-impact SKU in that cluster: `/pricing?aid={top}&source=forecasting&reason=cost-spike` |
| Margin Cockpit erosion lens | Same SKU drill-down handoff: `/pricing?aid={aid}&source=margin&reason=erosion` |
| Cost Trajectory Drawer → Forecasting commodity card | `/forecasting?cluster={c}#commodities` |

## 3.7 Acceptance

- [ ] Every option card shows a mini-waterfall with values from `option_margin`.
- [ ] The Cost Trajectory Drawer's forecast ribbon comes from `commodity_trajectories`, not a static fixture.
- [ ] A simulated steel-cost ingest fires `pricing.cost_moved` and the drawer updates within 2 s.
- [ ] Trigger banner appears when `?recommendation=…&reason=cost-spike`.

---

# PHASE 4 — Decision history (the audit Frank can defend)

**Frank's question:** *"What did I or anyone else decide on this SKU, and why?"*

## 4.1 Research basis

[DealHub on automated audit trails for pricing](https://dealhub.io/blog/quote-to-revenue/automated-audit-trails-for-pricing-precision/)
emphasises who/what/when/where/why with full snapshots. Pricefx and Vendavo
both ship a per-record audit panel with diff view. Salesforce CPQ tracks
"What changed since last view".

## 4.2 Backend

Already laid in Phase 0.3 (`pricing_audit` table). Two read endpoints:

| Endpoint | Returns |
|---|---|
| `GET /pricing/sku/{aid}/audit?limit=50&action_in=…` | Paginated audit rows for this SKU |
| `GET /pricing/sku/{aid}/diff?since={ts}` | "What changed since {ts}" — collapsed diff over price, cost, recommendation, competitor, customer_state |

A user's "last visit" is tracked in `user_view_state` table (`user_id, surface, target_id, last_seen_at`). On page open, the BFF computes the diff against `last_seen_at` and stamps `last_seen_at = now()`.

## 4.3 Side panel — Audit Drawer

**Trigger:** "History" button in the WorkbenchHero header.

**Body:**

```
┌─ Audit · 200832-E (last 90 days) ────────────────────────────┐
│  Filter:  [Price] [Proposal] [Approval] [Cost] [Override]    │
│                                                              │
│  ─────────── 2026-05-14 09:12 — frank ───────────────────────│
│  Proposal created · draft                                    │
│   from €118.00  →  €127.00  (Δ +7.6%)                        │
│   reason: "steel +8%, competitor PA flag"                    │
│   linked rec: margin_erosion:200832-E                        │
│   [Open proposal]   [View lineage]                           │
│                                                              │
│  ─────────── 2026-05-09 04:00 — system ──────────────────────│
│  Cost ingested · steel S355 +1.2%                            │
│   unit_cost  €77.45  →  €78.40                               │
│   [View source: ingest job #3412]                            │
│                                                              │
│  ─────────── 2026-05-02 14:08 — manuel ──────────────────────│
│  Proposal approved · #p_88a3 → implemented                   │
│   from €112.00  →  €118.00                                   │
│   …                                                          │
└──────────────────────────────────────────────────────────────┘
```

## 4.4 Side panel — "What changed since you last looked"

**Trigger:** auto-appears as a top-of-page strip on page load if the diff is
non-empty; can be reopened from a small `Δ` badge in the hero.

```
┌─ Since your last visit (2026-05-09, 5 days ago) ─────────────┐
│   • Cost +1.2%       €77.45 → €78.40                         │
│   • Competitor moved €123 → €121 (PA flag count: 5 → 9)      │
│   • New proposal     none → #p_88a3 (draft, frank)           │
│   • Churn risk       Linde 12% → 18% (now ⚠)                 │
│  [Dismiss]   [Audit]                                         │
└──────────────────────────────────────────────────────────────┘
```

Each line is a discrete typed field; the BFF computes which fields moved.

## 4.5 Live-wiring

- `pricing_audit.insert` publishes `audit.appended(target_id)` → if the Audit Drawer is open for the same `aid`, prepend the row.
- The diff strip is **not** live (it's a "since you last looked" surface) — but its "since {ts}" stamp updates if the user clicks Dismiss.

## 4.6 Connections

| Surface | Connects to |
|---|---|
| Audit row "linked rec" pill | `/action-center?ref={rec_ref}` |
| Audit row "Open proposal" | scrolls the page to the matching row in `ProposalContextPanel` |
| "What changed" strip → Forecasting | Each line has a "Open in Forecasting" link when the source signal lives there (cost, competitor) |

## 4.7 Acceptance

- [ ] Every state-change in Studio creates exactly one `pricing_audit` row.
- [ ] The Audit Drawer renders the last 50 events with action-type filters.
- [ ] "What changed since {ts}" surface appears on page load when the diff is non-empty AND disappears within 500 ms of Dismiss.
- [ ] Filter pills (Price, Proposal, Approval, Cost, Override) narrow the list correctly.

---

# PHASE 5 — Approval workflow

**Frank's question:** *"Will this get approved, and where is it right now?"*

## 5.1 Research basis

[Pricefx Workflow Designer + Approval Workflow Logic](https://knowledge.pricefx.com/space/KB/3808559109)
ship a visual stepper with triggers, approver routing, and watcher steps.
[SAP S/4HANA's Flexible Workflow of Sales Prices](https://community.sap.com/t5/enterprise-resource-planning-blog-posts-by-members/sales-price-approval-workflow-in-s-4-hana/ba-p/13563241)
is the canonical pattern for Mittelstand. [DealHub's pricing-approval guide](https://dealhub.io/glossary/pricing-approval/)
lays out the policy → routing → audit chain.

## 5.2 Backend

### 5.2.1 Already in Phase 0.4 — `approval_rules.py`

Recall: `should_route_for_approval(proposal) → ApprovalDecision`.

### 5.2.2 New tables

| Table | Purpose |
|---|---|
| `approval_routes` | The static rules library (seed). Editable by admins in a follow-up. |
| `approval_instances` | One per proposal that needs approval. `{ id, proposal_id, current_step, steps[] }`. |
| `approval_actions` | Each approver action. `{ approval_id, actor, decision, comment, at }`. Mirrored into `pricing_audit`. |

### 5.2.3 New endpoints

| Endpoint | Effect |
|---|---|
| `POST /pricing/proposals/{id}/submit` | Existing — extend to create `approval_instance` via `approval_rules`. |
| `POST /approvals/{id}/decision` | `{ decision: approve\|reject\|request_changes, comment }` |
| `GET /approvals/inbox?user=…` | The approver's queue (used by Manuel's view). |
| `GET /pricing/proposals/{id}/approval` | Returns the stepper state for display. |

## 5.3 Frontend — Approval Stepper component

Sits at the top of `ProposalContextPanel`. Per proposal:

```
┌─ Approval · #p_88a3 ─────────────────────────────────────────┐
│                                                              │
│  ●─────●─────○─────○─────○                                   │
│  Draft  Frank  Manuel  MD    Live                            │
│  ✓      ✓      ⏱ now  · · ·                                  │
│                                                              │
│  Triggered by rules:                                         │
│   • Δ > 5%       (route to Manuel)                           │
│   • Tier-A cust  (route to MD)                               │
│                                                              │
│  Latest comment (manuel · 14:02):                            │
│  "Steel context confirmed, fine to proceed to MD."           │
│                                                              │
│  [Recall]   [Add comment]                                    │
└──────────────────────────────────────────────────────────────┘
```

## 5.4 Side panel — Approval Drawer (for the approver)

When opened from the approver's inbox or from a clicked stepper bubble:

| Section | Content |
|---|---|
| Proposal summary | aid, current → proposed, Δ, projected DB2, win prob |
| Rule trace | Which rule routed it to me + the threshold values |
| Lineage | Embedded mini-version of the Lineage Drawer from Phase 1 |
| Past similar | Last 5 approved proposals on this SKU/cluster, with outcomes |
| Comment | Markdown textarea, mentions resolve to users |
| Decision | Approve · Approve with changes (re-open the price field) · Reject (require reason) |

## 5.5 Live-wiring

- WebSocket channel `collab.proposal.{id}` carries cursor presence + comment events when more than one user is viewing a proposal.
- SSE `proposal.{event}` carries state transitions to all watchers (e.g. when Manuel approves, Frank's stepper turns green within 1 s).
- Auto-`recall` is allowed only while in Draft.

## 5.6 Connections

| Surface | Connects to |
|---|---|
| Manuel's Approval inbox | New top-bar bell with count; route `/approvals` |
| Audit Drawer (Phase 4) | Each approval action appears as one audit row |
| Forecasting BriefingButton (Manuel mode) | When Manuel opens an approval, a sub-tab offers "Brief me on this SKU" → reuses BriefingButton pre-filled with `aid` |

## 5.7 Acceptance

- [ ] Submitting a draft proposal calls the rules engine; the returned `ApprovalDecision` populates the stepper.
- [ ] The stepper updates live in Frank's browser when Manuel decides in another browser.
- [ ] Audit rows exist for `proposal_submitted`, `approved`, `rejected`, `request_changes`.
- [ ] An auto-approve rule (Δ ≤ 2pp on tier C/D) skips Manuel and routes straight to Live; the stepper renders the skipped node greyed.

---

# PHASE 6 — Batch repricing

**Frank's question:** *"Let me do many SKUs at once, not 12 separate visits."*

## 6.1 Research basis

Vendavo and Pricefx both ship batch / mass-update workflows with rule-based
moves (`if margin < floor → set to floor + 8%`). Vistaar emphasises this for
manufacturers with thousands of SKUs. The pattern is:
**select set → preview impact → batch-approve → publish**.

## 6.2 Backend

### 6.2.1 New `services/pricing/batch.py`

| Function | Purpose |
|---|---|
| `build_batch_preview(aids: list, rule: BatchRule, scope_filter) → BatchPreview` | Apply a rule to each AID, return per-SKU `before/after/delta/projected_db2/win_prob_at_new/risk_score`. |
| `commit_batch(batch_id, dry_run=False) → list[Proposal]` | Creates one proposal per AID; each goes through normal approval flow. |

`BatchRule` types (start with five, all JSON-logic-validated):

| Rule kind | Args | Example |
|---|---|---|
| `floor_plus` | margin_pp | every SKU below cost floor → set to floor + 8pp |
| `pct_move` | pct, floor_cap | uniform +3% capped at WTP p90 |
| `match_competitor` | undershoot_pct | set to competitor median − 2% |
| `target_db2` | target_pp | solve for price that hits target DB2 |
| `custom_jsonlogic` | expression | escape hatch for complex moves |

### 6.2.2 New tables

| Table | Purpose |
|---|---|
| `pricing_batches` | `{ id, created_by, created_at, rule_json, status, scope_filter }` |
| `pricing_batch_items` | `{ batch_id, aid, before, after, status, proposal_id? }` |

### 6.2.3 Endpoints

`POST /pricing/batches` · `GET /pricing/batches/{id}` · `POST /pricing/batches/{id}/commit`.

## 6.3 Frontend — Batch mode

A toggle at the top of `SkuPicker`: **[Single | Batch]**. Batch mode:

- Multi-select checkboxes on SKU rows.
- A new right-column "Batch Workbench" replaces the single-SKU workbench.
- Top header: rule selector + parameter fields (live form, no save until preview).
- Body: **Preview table** of all selected SKUs.

### Preview table

| Column | Source |
|---|---|
| AID | `aid` |
| Cluster | `cluster` |
| Current | `before.price` |
| After (this rule) | `after.price` |
| Δ% | computed by BFF |
| Projected DB2 | `after.db2` |
| Win-prob at after | `after.win_prob` |
| Risk | `after.risk_score` (tone enum from BFF) |
| Per-SKU lock | toggle to exclude one SKU |

### KPI strip above the table

| Tile | Source |
|---|---|
| SKUs in batch | count |
| Total revenue impact (12mo) | sum of per-SKU forecast Δ |
| Total margin impact (12mo) | sum of DB2 Δ |
| Avg win-prob change | mean |
| Approval routing summary | "10 auto · 6 to Manuel · 2 to MD" |

## 6.4 Side panel — Batch Approval Drawer

When the user commits, the right-side drawer shows the **approval routing
breakdown** before publishing:

```
┌─ Approval routing ───────────────────────────────────────────┐
│  Auto-approve (Δ ≤ 2pp, tier C/D)     10 SKUs   €18k impact  │
│  Route to Manuel (Δ > 5%)              6 SKUs   €120k impact │
│  Route to MD (tier A or Δ > 10%)       2 SKUs   €88k impact  │
│                                                              │
│  [Confirm and submit all]   [Edit selection]   [Cancel]      │
└──────────────────────────────────────────────────────────────┘
```

## 6.5 Live-wiring

- Cost-move events for any AID in the batch live-update its row tone.
- An approval decision on any contained proposal updates the batch progress strip.

## 6.6 Connections

| From | Contract |
|---|---|
| Forecasting renewals queue → Studio | `/pricing?queue=renewals&cluster={c}&mode=batch` — Studio opens directly in Batch mode with the queue's SKUs pre-selected. |
| Forecasting NextCycleMovesStrip → Studio when impact ≥ €100k | `/pricing?queue=next-move&aids={a,b,c}&mode=batch` |
| Action Center bulk recommendation card | Same `mode=batch` deep link. |

## 6.7 Acceptance

- [ ] Selecting ≥ 2 SKUs in the picker switches the right column to Batch Workbench.
- [ ] Choosing a rule + parameters renders a preview within 1 s.
- [ ] Commit creates N proposals (N = unlocked rows), each routed through `approval_rules`.
- [ ] The forecasting renewals deep link opens Studio already in Batch mode with the cluster's SKUs selected.

---

# PHASE 7 — Push-to-quoting & comms

**Frank's question:** *"Make this live, and tell the right people."*

## 7.1 Research basis

[Vendavo's CPQ-to-pricing integration pattern](https://www.vendavo.com/business-needs/pricing-technology/)
keeps the price book authoritative; CPQ pulls latest. [SAP S/4HANA price-list publishing](https://community.sap.com/t5/enterprise-resource-planning-blog-posts-by-members/sales-price-approval-workflow-in-s-4-hana/ba-p/13563241)
uses an effective-date pattern with rollback. DealHub and Pricefx wire
post-publish notifications (Slack, email, CRM) automatically.

## 7.2 Backend

### 7.2.1 Real `services/pricing/publish.py`

| Function | Effect |
|---|---|
| `publish_price(aid, price, effective_at, source_proposal_id) → PublishReceipt` | Atomic: writes new row to `price_book` with `valid_from = effective_at, valid_to = null`; closes prior row's `valid_to = effective_at`. |
| `schedule_publish(aid, price, effective_at, source_proposal_id) → ScheduledPublish` | If `effective_at > now()`, write to `scheduled_publishes` and let the existing scheduler kick it. |
| `rollback_publish(receipt_id, reason) → PriceState` | Re-opens prior row, audits. |

Endpoints: `POST /pricing/sku/{aid}/publish`, `POST /pricing/sku/{aid}/rollback`.

Every publish:
- Writes `pricing_audit` row (action = `price_set`).
- Emits `pricing.price_set(aid)`.
- Triggers notification fan-out (7.2.2).

### 7.2.2 New `services/pricing/notifications.py`

Per the proposal's `notify` flags (Sales / Customers / Escalate / A/B), trigger:

| Channel | Backend |
|---|---|
| Slack DM to assigned sales rep | existing MCP-style Slack connector |
| Email to customer list | SES / SMTP fallback |
| Internal escalation note | adds an audit row + tags the BU lead |
| A/B test setup | calls Action Center's existing `ab_setup` |

All channels go through one dispatcher; per-channel result is logged.

### 7.2.3 Branded PDF export

Real implementation via Anthropic Skills `pdf` (already installed). Service:
`services/reports/proposal_pdf.py` renders the RationaleMemo body, the
recommendation card, the customer fanout, and the audit history into a
branded PDF.

## 7.3 Side panel — Publish Confirmation Drawer

**Trigger:** clicking the (now real) **Push to quoting** button.

```
┌─ Publish €127.00 on 200832-E ────────────────────────────────┐
│  Effective:  2026-05-15 00:00 (UTC)                          │
│  Old price book row:  €118.00 (valid 2026-03-01 → 2026-05-15)│
│  New row:             €127.00 (valid 2026-05-15 → ∞)         │
│                                                              │
│  Will notify:                                                │
│   ☑ Heiko (sales lead) — Slack                               │
│   ☑ Tier-A customers (3) — email                             │
│   ☐ Internal escalation                                      │
│                                                              │
│  ⚠ This price will appear in CPQ quotes from 00:00 UTC.      │
│  Rollback available for 72 h.                                │
│                                                              │
│  [Confirm publish]   [Cancel]                                │
└──────────────────────────────────────────────────────────────┘
```

After confirm:

```
┌─ Published ──────────────────────────────────────────────────┐
│  ✓ Price book updated                                        │
│  ✓ Slack sent to Heiko                                       │
│  ✓ 3 customer emails queued                                  │
│  Receipt id: pub_8e1c…                                       │
│                                                              │
│  [Open PDF]   [View audit]   [Rollback (within 72 h)]        │
└──────────────────────────────────────────────────────────────┘
```

## 7.4 Frontend changes to DecisionFooter

| Element | New behavior |
|---|---|
| **Push to quoting** | No longer disabled. Click → opens Publish Confirmation Drawer (7.3). |
| **Branded PDF** | No longer disabled. Click → calls `proposal_pdf` service, opens result in new tab and writes audit row. |
| **Escalate to Till** | Replaced by: routes through approval_rules to whoever the rule says (Manuel/Till/MD) and shows the stepper appearing in `ProposalContextPanel`. |
| **Effective date** | Defaults from approval_rules (some rules require ≥ 24 h lead time). |

## 7.5 Live-wiring

- After publish, `pricing.price_set(aid)` triggers: Studio hero current-price tile flips to the new value with a "Live since 14:02 UTC" stamp; the Forecasting page (if open in another tab) re-fetches.

## 7.6 Connections

| Surface | Contract |
|---|---|
| Quotes page (if/when exists) | `price_book` is the single source; CPQ reads it. |
| Action Center | `recommendation.status` flips to `Implemented` on publish; the card on Action Center retires. |
| Slack | Direct message via Slack MCP; deep-link back to `/pricing?aid={aid}&source=slack-publish`. |
| Reports | Branded PDF is also stored under `/reports/{id}` so it can be re-downloaded. |

## 7.7 Acceptance

- [ ] `Push to quoting` opens the confirmation drawer (not a toast).
- [ ] Confirming publishes the price atomically and writes a `price_book` row + an audit row.
- [ ] Slack & email side effects are visible in the post-publish receipt.
- [ ] Rollback restores the prior `price_book` row and creates a `rollback` audit row.
- [ ] An open Forecasting tab shows the new price within 2 s via SSE.

---

# PHASE 8 — A/B test & simulation

**Frank's question:** *"Let me try it on half the customers, or run two scenarios side-by-side, before I commit."*

## 8.1 Research basis

[Vendavo's price-curve optimization](https://www.vendavo.com/all/price-curve-optimization/)
runs simulated scenarios across the win-rate curve before publishing.
[Zilliant's price-elasticity podcast](https://zilliant.com/podcasts/yes-you-can-measure-price-elasticity-in-b2b)
emphasises holdouts as the credible measurement method in B2B (controlled
exposure: a subset of similar customers sees the new price, others stay).
Existing Action Center already has `ab_setup`/`ab_hold`/`ab_promote` types
(see `types/uiActions.ts`).

## 8.2 Backend

### 8.2.1 `services/pricing/ab_test.py`

| Function | Purpose |
|---|---|
| `create_ab_test(aid, control_price, variant_price, eligibility, criterion, target_sample) → AbTest` | Splits eligible customers via deterministic hash; writes `ab_tests` and `ab_assignments`. |
| `score_ab_test(test_id) → AbResult` | Returns conversion + margin per arm with confidence intervals. |
| `promote_or_hold(test_id, decision) → ActionResult` | Closes the test and either rolls out the variant via `publish_price` or restores control. |

### 8.2.2 Eligibility rules

JSON-logic: by tier, by family, by cluster, exclude tier-A "must-not-touch"
customers. Re-uses the same primitives as `approval_rules`.

### 8.2.3 Simulator

`POST /pricing/simulate` — same input as `create_ab_test`, but no writes; returns
projected margin / volume / churn impact under three scenarios (low/mid/high)
based on the elasticity model. Used by the Simulate-before-commit panel.

## 8.3 Frontend — A/B card inside `PriceOptions`

The fifth card today says "A/B vs hold". Make it a real flow:

```
┌─ A/B vs hold ────────────────────────────────────────────────┐
│  Variant:  €127  (recommended)                               │
│  Control:  €118  (hold)                                      │
│                                                              │
│  Eligibility:  Tier B,C — 24 customers (54% of LTM revenue)  │
│  Target sample: 30 quotes per arm                            │
│  Decision criterion:                                         │
│   variant DB2 ≥ control DB2 + 2pp  (one-sided test, p<0.10)  │
│                                                              │
│  [Set up A/B test]   [Open eligibility]                      │
└──────────────────────────────────────────────────────────────┘
```

## 8.4 Side panel — Simulation Drawer

**Trigger:** "Simulate this option" button on any non-A/B option.

```
┌─ Simulate €127 vs hold · 200832-E ───────────────────────────┐
│                                                              │
│  Scenario     12mo Δ revenue   12mo Δ DB2   Churn risk       │
│  Low          +€42k            +€18k        +0.3pp           │
│  Mid          +€78k            +€34k        +0.9pp           │
│  High         +€115k           +€48k        +1.8pp           │
│                                                              │
│  [chart: 3 scenario fan-bands over 12 mo]                    │
│                                                              │
│  [Set as proposal]   [Run as A/B]                            │
└──────────────────────────────────────────────────────────────┘
```

## 8.5 Side panel — Compare Drawer (replaces ScenarioCompareView removed in v2.2 Phase J for forecasting; here it's per-SKU and price-level)

Open from a "Compare options" toggle. Shows three options side-by-side:

| | Hold | Recommended | Custom |
|---|---|---|---|
| Price | €118 | €127 | €130 |
| DB2 at price | 14% | 18% | 19% |
| Win prob | 84% | 71% | 64% |
| 12mo revenue Δ | 0 | +€78k | +€90k |
| Customers at risk | 0 | 3 | 6 |
| Routing | Auto | Manuel | MD |

## 8.6 Live-wiring

- `ab_test.scored` (cron job result) pushes the latest conversion + margin numbers; the A/B card animates to the new sample-size bar.
- Simulation is on-demand; not live.

## 8.7 Connections

| Surface | Contract |
|---|---|
| Action Center | A/B test card mirrors here when created; promote/hold flips status both places. |
| Margin Cockpit | A/B test running on a cluster shows a banner on cluster row. |

## 8.8 Acceptance

- [ ] Creating an A/B test from the card actually writes `ab_tests` + assignments and shows the result back on the card.
- [ ] Promotion writes through to `publish_price` (Phase 7).
- [ ] The Simulation Drawer shows three scenario rows whose numbers come from the elasticity model, not constants.
- [ ] The Compare Drawer reads the same `option_margin` fields as the per-option mini-waterfalls (single source).

---

# PHASE 9 — Alerts & triggers

**Frank's question:** *"Tell me when to come look — don't make me poll."*

## 9.1 Research basis

[Pricefx Agents](https://www.pricefx.com/software/pricingai/agents) — "125+
ready-made AI agents always-on to detect risks and turn detections into
recommended actions." Same idea: server-side watchers that fire when a
threshold is crossed and push to the user's inbox.

## 9.2 Backend

### 9.2.1 `services/pricing/alerts.py`

| Function | Purpose |
|---|---|
| `create_alert(spec) → Alert` | spec carries trigger (cost moves > X%, churn rises, etc.), aid|cluster|family, channels, cadence |
| `evaluate_alerts(loop=every 1h)` | Iterates active alerts, checks triggers, fires via SSE + email + Slack |

### 9.2.2 Alert kinds (start with seven)

| Kind | Trigger |
|---|---|
| `cost_threshold` | `Δ unit_cost ≥ X% over Y days` |
| `competitor_undercut` | `competitor_ref` drops below ours by X% |
| `churn_spike` | per-customer churn rises by ≥ X pp |
| `floor_cross` | recommended price ≤ floor |
| `proposal_stuck` | proposal in `pending_approval` for > N days |
| `pa_pr_surge` | PA/PR rejection count per SKU > X in 30d |
| `cluster_db2_drop` | weekly cluster DB2 falls ≥ X pp |

### 9.2.3 Endpoints

`GET /pricing/alerts` · `POST /pricing/alerts` · `DELETE /pricing/alerts/{id}` ·
`GET /pricing/alerts/inbox`.

## 9.3 Frontend — Alerts UI

Three surfaces:

| Surface | Where |
|---|---|
| **Alert button** | Inline on every relevant value (cost tile, competitor strip, churn chip). Click → opens Alert Setup Drawer with the trigger pre-filled. |
| **Alert inbox** | Top-bar bell next to the Approval bell. Count badge. Click → opens Alerts Drawer (right rail). |
| **Daily digest** | Server-generated 1-pager pushed via SSE + email at user's preferred time (default 08:00 local). |

### Side panel — Alert Setup Drawer

```
┌─ New alert · cost_threshold ─────────────────────────────────┐
│  When                                                        │
│   ▼  cost moves           [≥] [5] [%]                        │
│   ▼  over                 [30] days                          │
│                                                              │
│  Scope                                                       │
│   ●  this SKU (200832-E)                                     │
│   ○  cluster BKAGG                                           │
│   ○  custom rule (JSON)                                      │
│                                                              │
│  Notify                                                      │
│   ☑ In-app  ☐ Email  ☐ Slack                                 │
│                                                              │
│  [Create]   [Cancel]                                         │
└──────────────────────────────────────────────────────────────┘
```

### Side panel — Alerts Drawer

```
┌─ Alerts ──────────────────────────────────────────────────  ──┐
│  Today (3)                                                   │
│   ● cost spike  200832-E   +5.8% in 30d        12:04         │
│   ● competitor  400119-S   €121 → €116 (PA)    09:33         │
│   ● proposal stuck  #p_77a1   8 days           08:00         │
│                                                              │
│  This week (6)                                               │
│   …                                                          │
│                                                              │
│  [Manage alerts]                                             │
└──────────────────────────────────────────────────────────────┘
```

## 9.4 Live-wiring

Alert events ride the SSE `pricing.alerts.*` channel. Inbox count badge
updates without reload. When an alert fires on the open SKU, a top-of-page
banner (dismissible) makes the trigger obvious.

## 9.5 Connections

| Surface | Contract |
|---|---|
| Forecasting (any card showing a value) | Each card gets a small bell icon → Alert Setup Drawer prefilled with that field. Already an existing `ThresholdAlertButton` component — wire it. |
| Action Center | Triggered alerts auto-create recommendation cards with `?source=alert&alert_id=…` |
| Scheduled-tasks MCP | Daily digest scheduled via the existing schedule MCP. |

## 9.6 Acceptance

- [ ] Setting a cost-threshold alert from a price tile creates the alert row.
- [ ] Simulating a cost ingest that crosses the threshold fires the alert and updates the inbox badge within 2 s.
- [ ] Daily digest sends at the user's chosen hour and contains all triggered alerts of the prior day.

---

# PHASE 10 — Trust signals

**Frank's question:** *"Can I show finance / Manuel where this number came from?"*

## 10.1 Research basis

Same Mittelstand / Manuel-feedback context as Forecasting v2.2. Pricefx and SAP
both expose lineage at the per-value level; DealHub's audit-trail piece argues
this is the #1 compliance feature.

## 10.2 Backend

Already laid in Phase 0 (`lineage_refs`, `pricing_audit`, `dataThrough` on every
shell). What this phase adds:

- **Canonical `dataThrough`** on `StudioShell` (mirror Forecasting `dataThrough` field).
- **Lineage drawer endpoint** `GET /lineage/{ref_id}` returns the full source: SQL, model version, ingest job id, computed_at, computed_by, raw rows preview.
- **Persona toggle in `briefing.py`** — already planned for Forecasting v2.2 Phase I; reuse from Studio.

## 10.3 Frontend additions

| Element | Where | Source |
|---|---|---|
| **Traffic-light freshness chip** | `PageHead` (next to "Updated") | `dataThrough` |
| **`<DataMissingBadge>`** | Anywhere a typed field is null | per-field |
| **`<LineageButton>`** | Every numeric KPI tile and chart legend | per-field `lineage_ref` |
| **German-language toggle** | Top-bar (account menu) | persisted in user prefs |
| **Persona toggle in proposal/PDF export** | DecisionFooter and Approval Drawer | reuses Forecasting v2.2 Phase I |

## 10.4 Side panel — Lineage Drawer (reusable)

Already specced in Phase 1.3 for the recommendation. Add a small wrapper:
`<LineageDrawer for={lineage_ref} />` so it can open for *any* field.

## 10.5 Live-wiring

`dataThrough` is part of the SSE-invalidated shell — freshness chip is always
current.

## 10.6 Connections

The freshness chip + Lineage Drawer + persona toggle are shared with
Forecasting and Margin Cockpit. Single React primitive (`FreshnessChip`,
`LineageDrawer`, `PersonaSelect`) lives in `frontend-v2/src/components/`.

## 10.7 Acceptance

- [ ] Freshness chip turns amber after 72 h without a refresh; rose after that.
- [ ] Every KPI tile has a clickable Lineage button.
- [ ] Setting the language to German renders the persona-toggled PDF and the proposal labels in German.

---

# PHASE 11 — Workflow polish

**Frank's question:** *"Stop slowing me down with small things."*

## 11.1 Items + acceptance

| # | Item | Detail | Acceptance |
|---|---|---|---|
| 11.1 | SKU picker writes URL | clicking a SKU sets `?aid={aid}`; back button works | round-trip after reload |
| 11.2 | Shell filter URL params | `tier`, `family`, `cluster`, `scenario_id` recognised | `useStudio({...})` is real |
| 11.3 | Working `CrossLinks` pills | each pill links to the canonical destination on other pages | every pill navigates |
| 11.4 | Keyboard shortcuts | `j/k` next/prev SKU, `cmd+s` save proposal, `cmd+enter` confirm publish, `a` open Action Center, `?` cheat sheet | shortcuts page lists them |
| 11.5 | Bulk selection in picker | shift-click range, cmd-click multi | flips to Batch (Phase 6) |
| 11.6 | Saved views | persisted `{ filters, sort, batch_mode }` named lists | "My Monday list" reopens identical |
| 11.7 | URL ↔ local-state | every visible state (filters, picker, drawer) is in URL | refresh restores the page byte-for-byte |
| 11.8 | Soft toasts only for non-blocking | success → toast, error → inline alert | no error toasts ever |
| 11.9 | Empty / loading / error states | every panel has all three; `<DataMissingBadge>` for partial | visual baseline coverage |

## 11.2 Connections

These touch nothing outside Studio, except saved views which write to the same
`saved_views` table that other pages can also consume in the future.

---

# PHASE 12 — Integration, tests, baselines, review

## 12.1 Backend gates

- [ ] `pytest tests/services/pricing/* tests/api/pricing/* tests/contract/test_studio_shell.py` green.
- [ ] Contract test for `StudioShell` asserts every new field is present and typed.
- [ ] SSE integration test: publish an event, assert consumer receives within 2 s.

## 12.2 Frontend gates

- [ ] `npx tsc --noEmit && npm test` green.
- [ ] Vitest unit tests for every new component (Recommendation card, Customer Drill-in, Audit Drawer, Approval Stepper, Batch preview table, Publish Confirmation Drawer, Simulation Drawer, Compare Drawer, Alert Setup Drawer, Alerts Drawer, Lineage Drawer wrapper).
- [ ] Playwright `pricing-studio-v3.spec.ts` covering: deep link from Forecasting, recommendation → publish round-trip, batch flow, approval flow, alert firing.

## 12.3 Visual baselines

- [ ] First-viewport baseline for `/pricing?aid=200832-E`.
- [ ] Each side panel's open state baselined.

## 12.4 Review

- [ ] Code-review pass over `git diff base..HEAD` focused on: SSE auth/backpressure, approval-rules JSON-logic safety, batch publish transaction safety, lineage data exposure (no PII leakage), keyboard a11y on all drawers.
- [ ] Triage 🔴 must-fix → 🟡 should-fix → 🟢 follow-up; one commit per fix.
- [ ] Re-run all gates green.

## 12.5 Docs

- [ ] Rewrite `docs/frontend-pricing-studio-page.md` to v3 layout.
- [ ] Add `docs/architecture/live-wiring.md` documenting the SSE pattern (reused by Forecasting and Margin Cockpit going forward).

---

# CROSS-PAGE WIRING (single reference)

| From | To | URL contract | Notes |
|---|---|---|---|
| Action Center recommendation | Studio | `/pricing?aid=…&recommendation=…&source=action-center` | Phase 1 prefills card |
| Forecasting NextCycleMovesStrip | Studio | `/pricing?aid=…&queue=next-move&source=forecasting` | Phase 1 |
| Forecasting renewals queue | Studio (batch) | `/pricing?queue=renewals&cluster=…&mode=batch` | Phase 6 |
| Forecasting At-Risk bar | Studio | `/pricing?aid=…&tier=…&source=forecasting&reason=at-risk` | Phase 2 |
| Forecasting CostDecomposition tile | Studio | `/pricing?aid=…&source=forecasting&reason=cost-spike` | Phase 3 |
| Margin Cockpit leaky SKU | Studio | `/pricing?aid=…&source=margin&reason=leakage\|erosion` | Phase 1/3 |
| Slack publish DM | Studio | `/pricing?aid=…&source=slack-publish` | Phase 7 |
| Studio → Margin Cockpit cost lens | Margin | `/margin?aid=…&source=studio#cost` | Phase 3 drawer |
| Studio → Forecasting commodity card | Forecasting | `/forecasting?cluster=…#commodities` | Phase 3 drawer |
| Studio → Customer in Margin Cockpit | Margin | `/margin?customer_id=…&source=studio&aid=…` | Phase 2 drawer |
| Studio → Quotes (CPQ) | Quotes (when exists) | reads `price_book` natively | Phase 7 |

# DRAWER REGISTRY (side panels — every one in this plan)

| Drawer | Width | Phase | Trigger | Closeable by |
|---|---|---|---|---|
| Lineage Drawer | 480 | 1, 10 | Any number, Lineage button | ESC, X, overlay |
| Customer Drill-in | 480 | 2 | Click fanout row | ESC, X |
| Cost Trajectory | 480 | 3 | Cost sparkline or pill | ESC, X |
| Audit | 520 | 4 | "History" button in hero | ESC, X |
| Approval (approver) | 520 | 5 | Inbox row or stepper bubble | ESC, X |
| Batch Approval | 480 | 6 | "Commit" in Batch Workbench | ESC, X |
| Publish Confirmation | 480 | 7 | "Push to quoting" | ESC, X |
| Simulation | 520 | 8 | "Simulate this option" | ESC, X |
| Compare | 640 | 8 | "Compare options" | ESC, X |
| Alert Setup | 420 | 9 | Bell on any value | ESC, X |
| Alerts (inbox) | 480 | 9 | Top-bar alerts bell | ESC, X |

All drawers obey the same a11y contract: `role="dialog"`, `aria-modal="true"`,
focus-trap, ESC closes, focus restored on close.

---

# OUT OF SCOPE (explicit follow-ups)

- Pricing-rule **admin UI** (today, rules are seed-only). Rules will be JSON-editable; admin UI is a separate plan.
- **Multi-currency** beyond €. Models support `currency` but Studio v3 ships EUR-only.
- **CPQ UI** itself — Studio v3 publishes the price book; the CPQ surface is a separate product.
- **AI-generated rationale** (LLM-rendered `rationale_md`) ships as deterministic templated text first; LLM is a follow-up once the determinism + audit pattern is settled.
- **Mobile layout.** Studio is desktop-only in v3.
- Migration of `forecast-overrides.json`, `plan.json`, `forecast-annotations.json`, `pricing_audit`, `price_book` from JSON-file / dev-DB to the warehouse — same follow-up as Forecasting v2.2.

---

# SOURCES (research basis for the design choices above)

- [Pricefx — PricingAI](https://www.pricefx.com/software/pricingai)
- [Pricefx — Agents (always-on monitoring)](https://www.pricefx.com/software/pricingai/agents)
- [Pricefx — Workflow Designer / Approval Workflow Logic](https://knowledge.pricefx.com/space/KB/3808559109)
- [Pricefx — Approval Workflow Handbook](https://knowledge.pricefx.com/space/KB/3499328345)
- [Pricefx — Price Setting](https://www.pricefx.com/software/price-management/price-setting)
- [Pricefx — Visual Configuration](https://www.pricefx.com/learning-center/pricefx-visual-configuration-uses-and-benefits-to-expect)
- [Vendavo — Deal Price Optimizer (guided pricing)](https://www.vendavo.com/our-products/deal-price-optimizer/)
- [Vendavo — Price Curve Optimization](https://www.vendavo.com/all/price-curve-optimization/)
- [Vendavo — Willingness to Pay](https://www.vendavo.com/all/willingness-to-pay/)
- [Vendavo — Pricing Technology overview](https://www.vendavo.com/business-needs/pricing-technology/)
- [Zilliant — Deal Manager product page](https://zilliant.com/products/deal-manager)
- [Zilliant — Customer's Willingness to Pay](https://zilliant.com/blog/customers-willingness-to-pay)
- [Zilliant — Leveraging Competitor Pricing in B2B](https://zilliant.com/blog/leveraging-competitor-pricing-in-b2b-strategies-for-smarter-decision-making-part-2)
- [Zilliant — Price Elasticity in B2B podcast](https://zilliant.com/podcasts/yes-you-can-measure-price-elasticity-in-b2b)
- [Zilliant — Price Elasticity: The Real Meaning of Optimization](https://zilliant.com/blog/price-elasticity-in-b2b-the-real-meaning-of-optimization)
- [Salesforce CPQ — Price Waterfall](https://help.salesforce.com/s/articleView?id=000380701&language=en_US&type=1)
- [DealHub — Pricing Approval](https://dealhub.io/glossary/pricing-approval/)
- [DealHub — Price Waterfall](https://dealhub.io/glossary/price-waterfall/)
- [DealHub — Automated audit trails for pricing precision](https://dealhub.io/blog/quote-to-revenue/automated-audit-trails-for-pricing-precision/)
- [SAP Community — Flexible Workflow of Sales Prices in S/4HANA](https://community.sap.com/t5/enterprise-resource-planning-blog-posts-by-members/sales-price-approval-workflow-in-s-4-hana/ba-p/13563241)
- [Vistaar — Manufacturing pricing & quoting software](https://www.vistaar.com/industries/b2b-pricing-software-for-manufacturing/)
- [McKinsey Periscope — B2B price optimization](https://www.mckinsey.com/capabilities/growth-marketing-and-sales/solutions/periscope/analyst-reports/periscope-by-mckinsey-recognized-as-a-leader-in-b2b-revenue-and-profit-optimization)
- [Swallow — Pricing pain point #1: data issues](https://www.swallow.app/post/data-challenges)
- [Two Cents — Real-time features in SaaS: WebSockets, SSE, or polling?](https://www.twocents.software/blog/real-time-features-in-saas/)
- [Solid Web — SSE vs WebSockets: why half of you picked wrong](https://solid-web.com/server-sent-events-vs-websockets/)
- [Render — Building real-time applications with WebSockets](https://render.com/articles/building-real-time-applications-with-websockets)
- [Pricefx — Paper Plane Release notes (Studio updates)](https://www.pricefx.com/software/latest-updates/paperplane)
