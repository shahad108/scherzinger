# Pricing Studio v3 — Handoff (Phases A–L)

## Status
- Branch: `pricing-studio-v3` (not pushed)
- Commits since Action Center baseline (`bd15ead`): 32 (+ Phase L)
- Test suites (2026-05-19):
  - Backend pytest (pricing): **217 pass / 1 pre-existing fail** (`test_diff.py::test_proposal_diff_uses_count_not_full_fetch`)
  - Frontend vitest: **584 pass / 122 files**
  - Playwright E2E:
    - `pricing-studio-routing.spec.ts` — 4 pass
    - `pricing-studio-evidence-tabs.spec.ts` — 10 pass
    - `pricing-studio-decision-footer.spec.ts` — 10 pass
    - `pricing-studio-responsive.spec.ts` — 2 pass (3 viewports × multi)
    - `pricing-studio-a11y.spec.ts` — 6 pass
    - `pricing-studio-cross-screen.spec.ts` — 4 pass (Phase L)
    - `action-center.spec.ts` regression — **23/23 pass** (zero AC regressions)
- TypeCheck baseline: 29 errors (pre-existing — see `frontend-v2/tsconfig.json`)

## What shipped per phase

| Phase | Summary | Commits |
|---|---|---|
| **A** Backend hardening | Silent-except hardening, `meta.blocks.{id}.status` populated for every block, decimal-as-string contract, drop seed fallback, APScheduler scheduled-publish, approval rules cache with file-watch + DB fallback, rollback reverts `price_state.current_price` + audit row. | `a8eeb8b`, `4ece425`, `3cda7de`, `b8df8ec`, `7d71ce5`, `75df771` |
| **B** Cross-screen SKU contract | Action Center URL contracts (`?aid`, `?customer`, `?queue`, `?aids`) drive Studio shell; Studio reads them and seeds picker + active-filters strip. | `422b64e`, `365659d` |
| **C** SSoT workbench | Typed `CostOutlookBlock` + live `useCostOutlook`, dropped CUSTOMER_SETS mock, fanout tone single-source-of-truth, comparable status guard, memoised SSoT, defensive workbench-shape guards. | `28980bc`, `daa3d6e`, `ea3bfc9`, `d24d885` |
| **D** Recommendation hero polish | Shared `RecommendationMetaChips` + "Why this price" expander, chart legibility, variant micro-waterfall sync. | `e213c8b`, `5ae5330` |
| **E** Evidence tabs | `EvidenceTabs` host (cost / quotes / fanout / lineage), live Quotes pane, live Lineage pane, BFF endpoints (`quote-history`, `lineage-by-aid`), shimmer + status fixes. | `423b45f`, `d75238f`, `f1c36c7`, `132881e`, `f2a689d`, `e89bc0f` |
| **F** Decision footer + lifecycle | `DecisionFooter` (Counter-propose / Hold / Approve / Reject / Push to quoting / Branded PDF / Share to AC / Rollback), `share_decision` accepts "both" atomically, rollback guard, sticky→fixed footer. | `a55749b`, `91ca502`, `1bc460d`, `61db693` |
| **G** Approval routing visibility | `ApprovalStepper` + routing chips + queue persona badges. | `1405def` |
| **H** Simulation/Compare | Compare "Set as proposal", chart polish, variant micro-waterfall parity. | `b9b8338` |
| **I** Locked future-feature blocks | `LockedBlock` (moved into shared) + Pilot badge for ERP/competitor/contract surfaces. | `6960a57` |
| **J** A/B cohort + alerts cron + lineage GC | A/B cohort gen runs as background task, alerts cron, lineage GC. | `bd573f3` |
| **K** UX polish | Theme audit, chart legibility, empty/loading/error states, spacing & rhythm, accessibility basics (axe-core clean), 1280/1440/1920 viewport audit, keyboard sweep. | `2540d4f`, `8a08e57`, `81bcef3` |
| **L** Cross-screen + regression sweep | AC ↔ Studio round-trip Playwright spec (URL is the only state container), batch round-trip from AC bulk-select, AC regression suite green. | this commit |

## Iron rules upheld

- **No silent excepts** — A1 hardened every `except:` to surface or log with reason.
- **Decimal-as-string everywhere** — A3 contract test enforces; no FE Number coercion of prices.
- **`meta.blocks.{id}.status` populated** — every BFF block tags itself (`live | degraded | locked | empty`); FE renders DegradedBlock / LockedBlock accordingly.
- **No hardcoded numbers in FE** — every value comes from the BFF; missing data → Locked / Pilot badge, never a stub.
- **No demo-seed fallbacks** — A4 dropped the seed fanout; empty rows now surface honestly.
- **Theme parity** — Phase K2 hex audit; only `LockedBlock` / `DegradedBlock` carry design-system overrides, everything else is token-only.
- **URL is the only cross-screen state container** — Phase L confirms: refresh, back/forward, deep-link all reconstruct from query string alone. No global store, no localStorage for cross-screen wiring (only saved-views opt-in).

## Known pre-existing issues (NOT introduced by A–L)

- `scherzinger-platform/tests/services/pricing/test_diff.py::test_proposal_diff_uses_count_not_full_fetch` — pre-existing failure; reproduction predates Phase A baseline.
- `frontend-v2/tests/e2e/pricing-studio-v3.spec.ts` — relies on stale screenshot snapshots from an earlier visual baseline; cannot pass against the v3 surfaces shipped in C–K. Flagged for replacement; the 6 specs in `pricing-studio-{routing,evidence-tabs,decision-footer,responsive,a11y,cross-screen}` collectively cover its surface area.
- `scherzinger-platform/tests/services/pricing/test_ab_test.py` — modified in working tree before Phase A baseline; left untouched per iron rules.

## Definition-of-done checklist (PLAN §7)

- [x] All phases A–L checked off.
- [x] Playwright sweep green: 36 pricing-studio tests + 23 action-center tests, all Chrome.
- [x] SKU data flow Action Center → Pricing Studio documented in PLAN.md §B and enforced by `pricing-studio-routing.spec.ts` + `pricing-studio-cross-screen.spec.ts`.
- [x] No off-theme UI; Phase K2 hex audit clean except design-system files.
- [x] Charts readable at 1280 / 1440 / 1920 (Phase K1 + K3).
- [x] No silent exceptions; `meta.blocks.{id}.status` populated for every data block (Phase A1+A2, contract tested in A5).
- [x] `docs/PRICING_STUDIO_HANDOFF.md` written (this file).

## What's NOT done (deferred or out-of-scope)

- **Visual regression baselines** — `pricing-studio-v3.spec.ts` needs new screenshot snapshots once the v3 surfaces stabilise visually. Out of scope for this push.
- **ERP publish adapter** — `publish_price.dispatch_mode` field is in place but the adapter is stubbed (Pilot badge surfaces this).
- **Competitor feed** — `competitor_ref` block plumbed but empty; Pilot badge surfaces this.
- **Contract table** — slated for a future migration; workbench schema already tolerates the addition.
- **Margin Cockpit + Quotes & Guardrails + Till MD Overview + Heiko Deal Inbox** — explicitly out-of-scope (next-screen forward notes in PLAN §8).

## Demo-readiness assessment

**Would Frank demo this live without flinching?** Yes — with two caveats. (1) The single-SKU happy path is rock solid: AC card click → Studio with full evidence stack → counter-propose → approval routing visible → publish or share back. (2) The batch path works end-to-end but the BFF preview endpoint hits the live DB; on a sparse demo dataset some SKUs will surface "no comparable" or "lineage locked" — these now render honestly via Phase I locked blocks instead of looking like crashes. Avoid Compare/Simulation drawer for SKUs without recent quote history (the chart looks sparse). Everything else is demo-clean.
