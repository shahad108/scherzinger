# Forecasting page — Playwright QA, walked through as Frank (Pricing Analyst)

**Date:** 2026-05-14  
**Branch:** `demo-phase45` @ `83e46d4` (Phase 7 of `Forecasting_Remaining_Plan` complete)  
**Tester:** Claude Code, simulating Frank Keller (Scherzinger Pricing Analyst, VPC pillar: power user)  
**Build:** `frontend-v2` dev (Vite :5174) + `scherzinger-platform` FastAPI (:8000), Frank logged in via `/api/v1/auth/login`  
**Viewport:** 1440 × 900  

---

## TL;DR — ship-readiness

| Surface | Ship-ready? | Notes |
|---|---|---|
| Market direction strip | ✅ ready | 8 tiles, WoW tones, hover context. Reads in 2 seconds. |
| Scenario library (Base / Steel / Multi-input / save custom) | ⚠️ half | Save works, URL persists, **but applying a scenario does NOT shift the visible distributions** because `useDistributions` overrides `data.distributions`. Critical bug #3. |
| Mode toggle (Revenue / Margin / Volume × 3 / 6 / 12 mo) | ⚠️ half | URL round-trip works, tornado relabels. **Distribution cards show raw numbers with no unit awareness** (Bug #2/#6) — "0.6median" in Margin mode, "333276.3median" in Revenue mode. |
| Tornado chart + click-to-drawer | ✅ ready | Bars sorted, per-cluster breakdown opens. Two small label bugs (#7, #8). |
| Distribution grid + drawer | ⚠️ half | Cards visible, drawer histogram works. Astronomical P95 (#13) + "Last actual: 0.0" (#10) need fixing before demo. |
| Margin trajectory | ✅ ready | Clear floor reference, "Crosses 60% in Q3 26" chip. Frank's slide for Till. |
| Cost decomposition | ✅✅ **best chart** | Three lines + three data-driven insights. This is the Till-presentation moment. |
| Seasonal overlay | ✅ ready | May actual +3.1% vs expected. Clear deviation chip. |
| Commodity multi-line | ✅ ready | Four-cluster trends + slope chips (-2.2 to -4.3pp/yr). Easy to read. |
| Per-customer tab — table | ✅ ready | 5 customer rows with risk tier chips and Open buttons. |
| Per-customer tab — drill-in drawer | ❌ **broken trust** | Drill-in numbers don't match the table summary (Bug #15). Median €308K → €155 in drawer. Don't demo this until fixed. |
| Quote-to-Revenue bridge (30/60/90d) | ✅ ready | Three clean numbers per horizon. |
| Calibration card | ✅ ready | 4 clusters with red/amber/green tones. |
| Accuracy badges + lineage drawer | ✅✅ **excellent** | 17 badges across the page. Drawer shows Models · Performance · Sources with feature list. Defensible. |
| Methodology panel + assumptions footer | ✅ ready | Renders the notebook's validation_report.md cleanly. Frank's copy-paste defence. |
| Briefing modal | ⚠️ half | Generates a receipt, **but no download link surfaced** (#5), and the active scenario shows as `00000000…` UUID prefix instead of the name (#4). |

**Bottom line:** the page is impressive in scope and has all 7 phases visible. **Three blockers before a real Frank demo:**

1. Distribution medians need units (€ for revenue, % for margin, qty for volume). They render as raw floats today.
2. Scenario click must visibly shift the distributions — right now the URL flips but the cards stay still.
3. The customer drill-in numbers must match the parent table.

Everything else is polish.

---

## Bug log (ordered by Frank-impact)

### 🔴 Critical — blocks demo

#### Bug #3 — Scenario click flips URL but doesn't shift distributions
- **Repro:** click `Steel shock +10%` chip on the scenario library
- **Expected:** distribution medians on the 4 cluster cards shift (steel +10% → BKAES median drops ~5pp)
- **Actual:** URL adds `?scenario_id=00000000-…-000002`, the chip darkens, the page header gets no banner, all distribution medians stay identical (`333276.3 / 61274.7 / 55947.6 / 390637.1`).
- **Root cause:** the page has both `useForecast(forecastParams)` (which forwards `scenario_id` to the BFF) AND `useDistributions(...)` (which does NOT forward `scenario_id`). The dedicated hook resolves first and the page renders `distributionsData ?? data.distributions`, so the perturbed `data.distributions` from the BFF is ignored.
- **Fix sketch:** drop `useTornado` / `useDistributions` on the page (use `data.tornado` / `data.distributions` directly — they already account for the scenario), OR forward `scenario_id` into both hooks.

#### Bug #15 — Customer drill-in numbers don't match the parent table
- **Repro:** Per-customer tab → click `Open` on customer 101487 (`alloys distributor`).
- **Expected:** drawer median revenue ≈ €308K (matches the table).
- **Actual:** drawer median revenue **€155**, P5 €0, P25 €3, P95 €2.15M. Margin shown as `0.3%` (should be `30%`). Quantity P5/P25 both 0.0.
- **Frank-question:** "Wait, the table says €308K median but the drawer says €155? Which one do I trust?" → **trust break.**
- **Root cause:** the table seeds with the curated `_SEED_TOP_AT_RISK` from `customers.py`; the drawer endpoint `/forecast/customers/{id}` reads `monte_carlo_results` for the real customer entity_id which has very sparse per-customer monthly forecasts.
- **Fix sketch:** either populate `monte_carlo_results` for the 5 demo customers with the same curated numbers, or have the drawer fall back to the seed row when DB returns extreme variance.

#### Bug #2 / #6 — Distribution medians render without unit awareness
- **Repro:** flip mode toggle between Revenue / Margin / Volume.
- **Expected:** Revenue mode → `€308K median`; Margin mode → `64.4% median`; Volume mode → `1,240 units median`.
- **Actual:** raw floats — `333276.3median`, `0.6median`, `220.9median`.
- **Frank-question:** "0.6 what? €0.60? 0.6%? 60%?"
- **Fix sketch:** add a `metric → unit/formatter` mapping in `DistributionGrid`; multiply margin × 100, prefix revenue with €, suffix volume with appropriate unit.

#### Bug #13 — P95 value is absurd for one cluster
- **Repro:** Revenue mode, observe MBDIV card P95 = `27271265415510` (≈ 27 trillion €).
- **Root cause:** persisted Monte Carlo P95 in `monte_carlo_results` for entity MBDIV under the revenue metric is unrealistic — likely a bootstrap blow-up on a sparse series.
- **Fix sketch:** cap displayed P95 at 5× P50, with a "wide-band" chip when capped; flag in lineage drawer.

### 🟠 High — fix before demo

#### Bug #1 — button-in-button hydration warning
- **Where:** `DistributionGrid` card (`<button>` wrapping `<AccuracyBadge>` which is itself a `<button>`). Same likely in `ClusterLens`.
- **Console:** "In HTML, `<button>` cannot be a descendant of `<button>`. This will cause a hydration error."
- **Fix sketch:** change the card root to `<div role="button" tabIndex={0} onClick onKeyDown>`, OR change the embedded `AccuracyBadge` button to a `<span role="button">`. The `onClick={(e) => e.stopPropagation()}` wrapper already exists but the DOM structure is still invalid.

#### Bug #4 — Briefing modal shows scenario UUID instead of name
- **Where:** `BriefingButton.tsx` "Scenario" row shows `Active: 00000000…`
- **Fix sketch:** look up the scenario by id from `useScenarios()` and render the name.

#### Bug #5 — Briefing receipt has no download link
- **Where:** `BriefingButton.tsx` receipt panel
- **Actual:** "Job queued: 97224b41… · format pdf · recipient self"
- **Expected:** `Open PDF →` button pointing to `artifactUrl` (returned by the backend).
- **Frank-question:** "OK I clicked Generate, the receipt blob appeared. Now what? Where's my PDF?"
- **Fix sketch:** render `<a href={receipt.artifactUrl}>Open PDF →</a>`.

#### Bug #10 — "Last actual: 0.0" everywhere on distribution cards
- **Where:** every distribution card.
- **Root cause:** seed and persisted rows alike don't populate `lastActual` for the live data.
- **Fix sketch:** fall back to LTM revenue from the screen-level `data.hero.movableLockedSplit` value when the row's `lastActual` is `0` or null.

### 🟡 Medium — polish

#### Bug #7 — Tornado drawer header always says "PP MARGIN" regardless of metric
- **Repro:** open the tornado drawer in Revenue mode.
- **Actual:** "MEDIAN Δ PP MARGIN" — but the metric is revenue.
- **Fix sketch:** use the metric from the bar's `deltaUnit` field (already on the type) instead of hardcoding "pp margin".

#### Bug #8 — "+-4.20 upshock" — weird sign formatting
- **Where:** tornado drawer "MEDIAN Δ" line
- **Actual:** `5.10 downshock + -4.20 upshock` (the `+` is rendered before the negative value).
- **Fix sketch:** never prefix `+` when the value is negative; render upshock as `−4.20` directly.

#### Bug #9 — Tornado per-cluster breakdown shows `SOPU`, distribution grid shows `MBDIV`
- **Repro:** open tornado drawer for any input → cluster list shows BKAES/BKAGG/BKAIZ/**SOPU**. Then look at the distribution grid → entities are BKAES/BKAGG/BKAIZ/**MBDIV**.
- **Root cause:** tornado breakdown is seed-driven (has SOPU); distributions are live from `monte_carlo_results` (has MBDIV instead).
- **Frank-question:** "Is SOPU still a cluster or did it get renamed to MBDIV? Why am I seeing both?"
- **Fix sketch:** decide which set is canonical and align the seed to the persisted DB labels.

#### Bug #11 — Threshold value `0.8` on distribution cards in revenue mode
- The "P(< 0.8)" chip stays at threshold `0.8` regardless of metric. For revenue, 0.8 is meaningless.
- **Fix sketch:** scale threshold with the metric.

#### Bug #12 — Distributions have no € prefix for revenue mode

(Subsumed by Bug #2/#6.)

#### Bug #16 — Customer drill-in historical revenue chart renders nearly empty
- Likely because `lastActual = 0` from the live row → the chart scaler collapses everything to the baseline.

### 🔵 Cosmetic / UX

- **Two right-side panels open by default** (`Alle Benachrichtigungen` + `Zugewiesene Prüfer`) crowd the page width. Frank has to click "Toggle sidebar" before he can read the tornado comfortably.
- **Mixed German/English copy** in the chrome (`Alle Benachrichtigungen`, `Hinzufügen`) vs. content (`Generate forecast briefing`, `Open quotes`). Frank's locale is `De` per the header switch, but the new Phase 7 strings are English-only.
- **No "scenario active" banner.** When a scenario is loaded via URL, only the chip darkens. Frank would benefit from a one-line banner: *"Scenario: Steel shock +10% — estimated Δ on cluster medians ≈ −4.2pp"*.
- **`scenarioApplied.shiftPpMargin`** is already in the BFF payload but the FE doesn't surface it anywhere visible.
- **No keyboard navigation between scenario chips** (Tab works but no arrow keys, no kebab menu for rename/duplicate/share — was in the plan).

---

## Frank-persona walkthrough — minute-by-minute

This is the script for a real Frank doing a Monday morning forecast review.

### Minute 0 — first impression

> Opens `/forecasting`. Sees the header "Revenue Forecast — Next 12 Months", three predictive portfolio pricing pills, and the External Market Direction strip immediately below.

**Frank's eye:** Steel HRC is the only red tile — `1180 €/t · +1.2% WoW`, context tooltip "Trajectory steepening — +6.8% by Q3."

**Frank thinks:** *"Steel is going up. That's the headline. Let me see what the simulator says."*

**What works:** the strip reads in 2 seconds. The 8 tiles are scannable.  
**What's missing:** he can't click a tile to see the underlying series chart — the strip is hover-only. (Future work: open a series detail drawer per tile.)

### Minute 1 — runs Steel shock scenario

> Clicks `Steel shock +10%` chip.

**Frank's eye:** chip darkens, URL gains `?scenario_id=…000002`.

**Frank thinks:** *"Did anything happen? The tornado looks the same and the distribution cards look the same."* — **Bug #3 manifesting.**

**What we ship after fix:** the four cluster cards drop ~4-5pp in margin (or equivalent in revenue / quantity), a banner reads *"Scenario: Steel shock +10% — estimated Δ −4.2pp on BKAES, −3.8pp on BKAGG."*

### Minute 2 — flips Margin mode

> Clicks `Margin %` pill.

**Frank's eye:** tornado relabels to `margin · 12mo`, cards switch to `0.6median`, `0.4median`, `0.6median`, `0.1median`.

**Frank thinks:** *"0.6 what? Per cent? 60? Sixty per cent? Zero point six?"* — **Bug #2/#6.**

**What we ship after fix:** card reads `64.4% median · P5 44.6% · P95 85.5% · P(<50%) 11.8%`.

### Minute 3 — drills into Steel as a tornado input

> Clicks the Steel S355 bar on the tornado.

**Frank's eye:** drawer slides in, shows `MEDIAN Δ PP MARGIN: 5.10 downshock + −4.20 upshock`, per-cluster breakdown BKAES −4.60, BKAGG −3.80, BKAIZ −3.10, SOPU −5.20.

**Frank thinks:** *"SOPU is the most exposed at −5.20pp. But wait — earlier the distribution grid said MBDIV, not SOPU. Are these the same cluster?"* — **Bug #9.**

### Minute 4 — opens BKAES distribution card

> Clicks BKAES card. Drawer shows histogram bars (synthesised from P5/P25/P50/P75/P95) + shock-mode chips.

**Frank thinks:** *"OK n=10,000 simulations, bootstrap. The histogram is right-skewed. P95 is 27 trillion though — that's a bug, ignore it. Median is 333K — for revenue that's reasonable for BKAES."*

### Minute 5 — reads cost decomposition

> Scrolls to the Cost Decomposition card.

**Frank thinks:** *"This is THE slide for Till. Material costs declining 3pp over 3 years — that's the procurement program working. Direct labor + setup rising 4pp — capacity utilisation is the question. Full cost +5pp despite material savings — fixed overhead growing. We absorb the savings in capacity drag."*

**Frank's action:** screenshots this. Adds the data-driven insight verbatim to his memo.

**What works:** the three insights are auto-generated from the trend direction. Defensible.

### Minute 6 — looks at margin trajectory

> Scrolls to Margin Trajectory. Sees the 12-quarter line + 4-quarter projection with the 60% floor reference and the chip "Crosses 60% in Q3 26".

**Frank thinks:** *"Two quarters until margin crosses the contractual floor. I need a list-price uplift action before then. Let me check the per-customer tab — who's pulling the average down."*

### Minute 7 — per-customer tab

> Clicks `Per customer` tab. Sees the top-3 high-risk customers: 101487 (78.4% P(decline)), 104447 (71.2%), 100924 (58.9%).

**Frank thinks:** *"101487 alloys distributor is losing €104K vs LTM at the 12mo median. Let me see what their SKU mix looks like."*

> Clicks `Open` on 101487.

**Frank's eye:** drawer shows distributions but the numbers DON'T match — median revenue is €155 not €308K, margin is 0.3% not 30%, quantity P5 is 0. — **Bug #15.**

**Frank thinks:** *"OK these numbers don't make sense. The table says €308K, the drawer says €155. I'll use the table number and skip the drawer."*

**What we ship after fix:** drawer matches table; historical revenue chart renders a 5-month trend; margin shows 30% not 0.3%; clear "Action: open 12-month renewal proposal" CTA.

### Minute 8 — Quote-to-Revenue bridge

> Switches back to Aggregate, scrolls to the bridge card. Sees `38 open quotes / 62.4% win rate / €82K expected GP` for the 30-day horizon.

**Frank thinks:** *"€82K in expected gross profit from the next 30 days of pipeline. Half of that is BKAES tier-A customers. I should pre-stage three quotes in the negotiation cockpit for those."*

> Clicks 90d. Bridge updates to `104 / 59.1% / €185K`.

**What works:** clean numbers. Fits Heiko's deal-empowerment story as the plan called out.

### Minute 9 — defends a number to Till

> Till joins the call. Asks: "How accurate is the margin forecast, really?"

> Frank clicks the `MAPE 6.9% · n=36 · h=12mo` badge on the WalkForward card.

**Frank's eye:** Lineage drawer opens. Model: `margin_walk_forward_v3 v3.2`. Trained 10/05/2026. Holdout 6mo. Features: `last_actual_db2_margin`, `rolling_residuals`, `steel_index`, `eur_usd`, `ifo`, `seasonal_indices`. Notes: "M3 nested CV + M9 customer-grouped CV." Sources: 6 entries.

**Frank says to Till:** *"6.9% MAPE on 36 backtested months. Nested CV so no leakage. Features include steel and FX, both refreshed daily. Calibration is 81% hit-rate on the P80 band — close to nominal."*

**Till is satisfied.** This is the most powerful moment in the whole page.

### Minute 10 — generates the briefing PDF

> Clicks `Generate forecast briefing →`.

**Frank's eye:** modal opens. Scenario: `Active: 00000000…` — **Bug #4.** Format PDF. Recipient `Just me`.

> Clicks Generate. Receipt appears: "Job queued: 97224b41…".

**Frank thinks:** *"OK… now what? Where do I download it?"* — **Bug #5.**

**What we ship after fix:** receipt includes an `Open PDF →` link, the modal shows "Steel shock +10%" instead of the UUID, and a follow-up notification appears on Frank's bell when the job finishes.

---

## Specifically what's good

- **Lineage drawer is the standout feature.** It exists on 17 different badges. Every number is defensible. This is the demo moment.
- **Cost decomposition is the second standout.** Data-driven insights ("Material savings absorbed by capacity drag") read like a McKinsey slide.
- **Margin trajectory** with the 60% floor reference and "Crosses Q3 26" annotation is exactly what a CFO wants to see.
- **Scenario builder is form-only** — no sliders, as specified. Preset chips for Steel/EUR-USD/Alloys/Copper/Demand/List-price/Pass-through.
- **Per-customer top-table** with risk tier chips reads in 5 seconds.
- **Mode toggle URL round-trips** correctly. The Vite reload from a deep link `?mode=margin&horizon=3&scenario_id=…&tab=customers` would land Frank exactly where he was.
- **External market direction strip** is a fantastic "Where's the world right now?" header.

## What would make the workflow great (Frank's wishlist)

1. **Scenario active banner.** One line under the header: *"Scenario applied: Steel shock +10% · estimated Δ −4.2pp BKAES margin · n=1,000 sims · click to compare against base case."*
2. **Compare two scenarios.** The plan called for `ScenarioCompareView`; not built yet. Frank would multi-select base + Steel and see the hero chart overlay.
3. **"What changed since Monday" chip** on each forecast block. Compared to the prior week's vintage, show the delta.
4. **Clickable market tile.** Click Steel HRC → drawer with the time series + the model's pass-through coefficient.
5. **Cross-link from Per-customer drill-in to Action Center.** A `Stage renewal proposal →` CTA in the drawer.
6. **Threshold alert CTA** on every chart. The backend has the endpoints, the FE is missing the UI.

---

## Console errors observed during the walkthrough

| # | Severity | Message |
|---|---|---|
| 1 | error | `<button>` cannot be a descendant of `<button>` — hydration warning. Repeats once per DistributionGrid card render. |
| 2 | warning (×56 over 10 min) | React-Query refetch warnings from rapid mode-toggle clicks. |

No backend 5xx errors. All `/api/v1/forecast/*` endpoints returned 200.

---

## Next steps

In priority order:

1. **Fix bug #3** (scenario perturbation propagation) — 30 min.
2. **Fix bug #2/#6** (DistributionGrid unit awareness) — 1 hour.
3. **Fix bug #15** (customer drill-in number consistency) — 1 hour. Either seed the live `monte_carlo_results` table for the demo customers OR fall back to the curated values in `customers.py`.
4. **Fix bug #1** (button-in-button DOM) — 15 min.
5. **Fix bug #5** (briefing receipt download link) — 15 min.
6. **Fix bug #13** (P95 cap) — 15 min.
7. **Fix bug #4** (briefing modal scenario name) — 10 min.
8. **Add the scenario-active banner** — 30 min.
9. Polish bugs #7, #8, #9, #10, #11, #16 — 1 hour together.

Total ≈ half a day to make this demo-bullet-proof.
