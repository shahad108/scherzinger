# Frontend Pricing Studio Page — v3 Reference

> Last updated: 2026-05-17. Mirrors the state of `pricing-studio-v3` branch
> after Phase 12. Source of truth lives in
> `frontend-v2/src/features/pricing-studio/`.

Pricing Studio v3 is the Frank-facing pricing workbench: one SKU at a time,
with recommendation hero on top, then customer reality, cost reality,
audit + approval rail, batch mode, and a tail of trust signals + alerts.

Phases 0–11 are implemented; Phase 12 ships the e2e + visual baselines +
docs + final review.

---

## 0. Page entry point

| File | Role |
|---|---|
| `frontend-v2/src/features/pricing-studio/index.tsx` | Page shell. Reads URL params, fetches `useStudio()` shell, subscribes to live SSE topics, renders the workbench grid + drawer host. Adds `pz-fullbleed` body class on mount. |
| `frontend-v2/src/app/router.tsx` | Mounts `PricingStudioPage` at `/pricing` behind `RequireAuth`. |

### URL contract

All deep-links into the Studio land at `/pricing?…`. The page is the
single source of truth for which sub-experience is shown. Bookmarkable.

| Param | Effect |
|---|---|
| `aid` | Select SKU by article id. Survives user picks until URL aid changes. Unknown aid renders an explicit "SKU not found" banner — no implicit nav. |
| `tier`, `family`, `cluster` | Server-side filter quartet (Phase 21). |
| `scenario_id` | Selects an active scenario for the recommender. |
| `source`, `reason` | Phase 3 trigger banner. BFF returns `trigger_context` when (source, reason) is recognised. |
| `recommendation` | Recommendation source ref (Phase 1). Pre-fills the DeepLinkBanner, threads into `useProposals`. |
| `abTest` | A/B test id (Phase 8). |
| `queue` | `next-move`, `repricing`, `renewals` — drives the banner breadcrumb. |
| `mode` | `single` (default) or `batch` (Phase 6) — drives SkuPicker shape. |
| `aids`, `batch_aids`, `batch_id` | Phase 6 — comma-separated SKU set + active batch id for refresh-stable batch sessions. |
| `audit_open`, `cost_outlook_open`, `compare_open`, `simulation_open`, `customer_drill_in_open`, `alerts_inbox_open`, `approval_inbox_open` | Phase 11 — every drawer's open state lives on the URL so refresh + deep-link can restore it. |
| `lineage_ref` | Phase 10 — opens the Lineage Drawer pre-loaded on the given ref. |

Cross-page wire is in §CROSS-PAGE WIRING of the v3 plan.

### Data source

- Hook: `useStudio(params)` in `frontend-v2/src/data/api/useStudio.ts`.
- Endpoint: BFF `GET /screens/studio`.
- Returns a `StudioShell` (see `frontend-v2/src/types/studio.ts`) — header, filters, SKU list, default workbench, and a set of optional typed Phase 1–8 blocks (`recommendation`, `wtp`, `win_prob_curve`, `customer_fanout`, `option_margins`, `cost_history`, `trigger_context`, `active_ab_test`).
- Each SKU is post-processed by `enrichSkus` so the SKU picker rows carry the right per-SKU `workbench` (default for the defaultAid, patched for others).
- Stale time: 60s. React Query key: `qk.studio(params)`.

### Live wiring (SSE)

The Studio subscribes to four topics via `useLivePricing`, `usePricingStream`, and tile-level subscribers:

| Topic | Reaction |
|---|---|
| `pricing.price_set` | Hero `Live since…` flips; `usePublishPrice` price-book cache invalidated. |
| `pricing.price_rolled_back` | Transient toast in the global ActionFeedback store. |
| `pricing.cost_moved` | Cost Trajectory drawer refreshes; sparkline annotation appears. |
| `audit.appended` | Audit drawer flash + badge counter increments; `useAuditFeed` cache invalidated. |
| `approval.requested`, `.acted`, `.completed` | Approval stepper + inbox cache invalidated. |
| `alerts.triggered` | Alerts inbox bell badge increments. |

Implementation lives in `frontend-v2/src/hooks/usePricingStream.ts` and
the in-process bus in `scherzinger-platform/backend/services/events.py`.
See `docs/architecture/live-wiring.md` for the full reference.

---

## Phase 0 — Foundation (URL params, SSE bus, audit, approval rules)

Backend scaffolding only. Adds `pricing_audit`, `lineage_refs`,
`approval_rules`, `approval_instances`, `pricing_alerts` tables and the
in-process event bus + `events.publish_sync` + `publish` + `subscribe`
contract. The Studio page itself doesn't render anything new for P0; it
just gets the new URL params (`source`, `reason`, etc.) passed through.

Migration: `p21a_pricing_v3_foundation.py`.

---

## Phase 1 — Recommendation (hero card + lineage drawer)

| Component | Responsibility |
|---|---|
| `RecommendationHero` | Big single-price card. Reads `workbench.recommendation` (typed block). Shows recommended price, confidence chip, band, top driver. |
| `RecommendationKpiTiles` | Below-hero tiles for current vs recommended, win-prob delta, projected DB2 (when option_margins lands). |
| `WtpBandStrip` | Visualises p10/p50/p90 from `workbench.wtp`. |
| `WinProbCurve` | Plots `workbench.win_prob_curve.points` with the recommended price annotated. |
| `DriverWaterfall` | Breaks the recommendation into its `RecommendationDriver[]` weights. |
| `LineageDrawer` | 480-wide right drawer; opens via "Why this price?" + every `LineageButton`. Reads `/lineage/{ref}` via `usePricingLineage`. |

Endpoints: `GET /recommendations/{ref}`, `GET /lineage/{ref}`,
`POST /screens/studio/fanout` (re-score at a proposed price).

Visual baseline: `studio-deeplink-forecasting-darwin.png`,
`studio-first-viewport-darwin.png`.

---

## Phase 2 — Customer reality (fanout + drill-in)

| Component | Responsibility |
|---|---|
| `CustomerFanout` | Reads `workbench.customer_fanout`. Per-customer rows with last paid, 12mo revenue, risk_if_moved, accepts_at, margin_if_accepts. |
| `CustomerDrillInDrawer` | 480-wide drawer; opens on row click. Reads `/customers/{id}/drill-in/{aid}`. Sections: this SKU, at proposed price, history, links. |
| `useFanoutRescore(aid, proposed_price)` | POST re-score that updates the fanout in place when the user picks a different price option. |

Endpoints: `POST /screens/studio/fanout`, `GET /customers/{id}/drill-in/{aid}`.

---

## Phase 3 — Cost & margin reality

| Component | Responsibility |
|---|---|
| `TriggerBanner` | Persistent banner above the hero when `workbench.trigger_context` is present (source/reason deep-link from Forecasting or Margin). |
| `OptionMarginMicroWaterfall` | Per-price-option mini-waterfall reading `workbench.option_margins[i]`. |
| `CostHistory` | Sparkline tile with "Open cost outlook" pill. |
| `CostTrajectoryDrawer` | 480-wide drawer reading `/pricing/sku/{aid}/cost-outlook`. Components table + steel sparkline + What-changed accordion. |

Endpoints: `GET /pricing/sku/{aid}/cost-outlook`.

---

## Phase 4 — Audit + what-changed-since

| Component | Responsibility |
|---|---|
| `WhatChangedStrip` | One-line strip above hero summarising diffs since N (URL `since`). Reads `/pricing/sku/{aid}/diff`. |
| `AuditDrawer` | 520-wide drawer; opens via History button in hero. Reads `/audit/recent?target_id={aid}` with paged scroll. Flash highlight on live `audit.appended` events. |

Endpoints: `GET /audit/recent`, `GET /pricing/sku/{aid}/diff`.

Performance: `_diff_proposal` uses `func.count()` + `LIMIT 1` instead
of materialising the whole window (Phase 4 SF3 fix). The
`test_proposal_diff_uses_count_not_full_fetch` regression test has a
known brittleness (tie-breaking when multiple rows share `at`); the
production query is correct.

---

## Phase 5 — Approval workflow

| Component | Responsibility |
|---|---|
| `ApprovalStepper` | In ProposalContextPanel rail — renders one bubble per JSON-logic rule that triggered. Live-updates on `approval.*` SSE. |
| `ApprovalDrawer` | 520-wide drawer for the approver. Sections: summary, rules triggered, lineage, past similar, comment, decision (approve / edit / reject). |
| `ApprovalInboxBell` | Top-of-page bell with a pending count + drawer for cross-SKU inbox. |
| `useProposalCollab` | WebSocket join/leave + per-instance live comment thread (`ws://.../collab/proposal/{id}`). |

Endpoints: `GET/POST /approvals/inbox`, `POST /approvals/{id}/decide`,
`GET /pricing/approvals/{id}`, `WS /collab/proposal/{id}`.

Visual baseline: `approval-stepper-darwin.png`.

---

## Phase 6 — Batch repricing

| Component | Responsibility |
|---|---|
| `SkuPicker` (batch mode) | Multi-select checkboxes, "Build batch" CTA. URL: `?mode=batch&aids=…`. |
| `BatchWorkbench` | Rule selector (floor+pp / pct_move / match_competitor / target_db2 / custom_jsonlogic) → "Preview batch" → preview table + KPI strip + per-row routing chip. |
| `BatchApprovalDrawer` | 480-wide drawer summarising routing buckets at commit time. |

Endpoints: `POST /pricing/batches`, `GET /pricing/batches/{id}`,
`POST /pricing/batches/{id}/commit`. Commit is transactional —
all-or-nothing per batch.

Visual baseline: `batch-workbench-darwin.png`.

---

## Phase 7 — Push to quoting + comms + branded PDF + rollback

| Component | Responsibility |
|---|---|
| `DecisionFooter` | Bottom-of-workbench bar with Push to quoting + Branded PDF + View stepper buttons. |
| `PublishConfirmationDrawer` | 480-wide drawer with effective_at picker, per-customer notify toggles, warnings preview, confirm + scheduled + published + rollback states. |
| `useReportJob` | Branded PDF job poller; opens result in new tab. |

Endpoints: `POST /pricing/publish`, `POST /pricing/publish/{id}/rollback`,
`POST /reports/proposal/{id}` + `GET /reports/jobs/{id}`.

SSE: `pricing.price_set` and `pricing.price_rolled_back` drive the
hero "Live since…" flip and the rollback toast.

Visual baseline: `publish-confirmation-drawer-darwin.png`.

---

## Phase 8 — A/B test + simulation + compare

| Component | Responsibility |
|---|---|
| `ABTestCard` | Reads `workbench.active_ab_test`. Pause / promote / reject buttons. |
| `SimulationDrawer` | 520-wide drawer; runs `POST /simulations` for a single option price. URL keyed on the price so refresh re-runs the same scenario. |
| `CompareDrawer` | 640-wide drawer comparing 2+ price options head-to-head. |

Endpoints: `POST /simulations`, `GET /pricing/sku/{aid}/ab-test`.

---

## Phase 9 — Alerts engine + inbox

| Component | Responsibility |
|---|---|
| `AlertButton` | Bell glyph on every tile value (cost, margin, win-prob, list-price). Click opens AlertSetupDrawer with `triggerKind` pre-set. |
| `AlertSetupDrawer` | 420-wide drawer. Kind / scope / params / channels form. Validates JSON-logic for `custom_jsonlogic`. |
| `AlertInboxBell` | Top-bar amber bell with count of triggered+unread alert events. |
| `AlertsDrawer` | 480-wide drawer listing pending alert events, ack/snooze controls. |

Endpoints: `GET/POST /pricing/alerts`, `DELETE /pricing/alerts/{id}`,
`GET /pricing/alerts/inbox`, `POST /pricing/alerts/{id}/ack`.

Daily digest: `scherzinger-platform/scripts/daily_alert_digest.py`.

Visual baseline: `alert-setup-drawer-darwin.png`.

---

## Phase 10 — Trust signals

| Component | Responsibility |
|---|---|
| `FreshnessChip` | Top-right of hero. Reads `useLivePricing.lastTickAt` to show "Live since…" or "Stale (X min)". |
| `LineageButton` | Surfaces on every numeric tile + chart. Opens LineageDrawer with the right ref. |
| Top-bar language toggle (EN/DE) | `users/me/language` persistence + recoil-style provider routes German strings. DE flagged Beta. |

Endpoints: `GET/POST /users/me/language`, `GET /lineage/{ref}`.

---

## Phase 11 — Workflow polish

| Component | Responsibility |
|---|---|
| `ActiveFiltersStrip` | Pill row of active URL filters with one-click remove. |
| `KeyboardCheatSheet` | `?`-keyed modal listing shortcuts (n/p/f/c/b/v/s/a/Esc). |
| `SavedViewsMenu` | Save the current URL filter quartet as a named view; restore via dropdown. |
| `useStudioKeyboardShortcuts` | Studio-only shortcut handler. |

Empty / loading / error states: `StudioSkeleton` + per-block
`DataMissingBadge` (`fanout-empty`, `cost-empty`, etc.).

---

## Phase 12 — Tests, baselines, review, docs (this phase)

| Surface | File |
|---|---|
| Playwright e2e | `frontend-v2/tests/e2e/pricing-studio-v3.spec.ts` (6 scenarios) |
| Playwright mocks | `frontend-v2/tests/e2e/_helpers/mock-studio.ts` (BFF-free) |
| Visual baselines | `frontend-v2/tests/e2e/pricing-studio-v3.spec.ts-snapshots/` |
| SSE integration test | `scherzinger-platform/tests/api/test_sse_integration.py` |
| Live-wiring doc | `docs/architecture/live-wiring.md` |
| Review notes | `docs/PHASE12-REVIEW-NOTES.md` |

---

## Page-shell render order

```
PageHead                            (crumbs + title + subPills + subStats)
DeepLinkBanner                      (only when ?aid is unknown OR ?recommendation/?abTest/?queue/?source)

ws-grid
├── SkuPicker (single | batch mode)
└── workbench
    ├── ActiveFiltersStrip
    ├── WhatChangedStrip
    ├── TriggerBanner               (when trigger_context present)
    ├── RecommendationHero          (default SKU) OR WorkbenchHero (other SKUs)
    ├── RecommendationKpiTiles
    ├── WtpBandStrip + WinProbCurve + DriverWaterfall
    ├── PriceOptions                (compact alternatives row)
    ├── CustomerFanout
    ├── CostHistory + cost outlook pill
    ├── ComparablePanel
    ├── ABTestCard                  (when active_ab_test present)
    ├── ProposalContextPanel        (right rail — proposals + ApprovalStepper)
    ├── DecisionFooter
    ├── RationaleMemo
    └── CrossLinks

Drawer host (right side panel; one open at a time)
  Lineage · Customer Drill-in · Cost Trajectory · Audit · Approval · Batch Approval ·
  Publish Confirmation · Simulation · Compare · Alert Setup · Alerts
```

---

## Endpoint index

| Path | Phase | Source |
|---|---|---|
| `GET /screens/studio` | 0/1 | `backend/api/v1/screens.py` |
| `GET /recommendations/{ref}` | 1 | `backend/api/v1/recommendations.py` |
| `GET /lineage/{ref}` | 1/10 | `backend/api/v1/lineage.py` |
| `POST /screens/studio/fanout` | 2 | `backend/api/v1/studio.py` |
| `GET /customers/{id}/drill-in/{aid}` | 2 | `backend/api/v1/customers.py` |
| `GET /pricing/sku/{aid}/cost-outlook` | 3 | `backend/api/v1/pricing.py` |
| `GET /pricing/sku/{aid}/diff` | 4 | `backend/api/v1/pricing.py` |
| `GET /audit/recent` | 4 | `backend/api/v1/audit.py` |
| `GET/POST /approvals/inbox`, `POST /approvals/{id}/decide` | 5 | `backend/api/v1/approvals.py` |
| `WS /collab/proposal/{id}` | 5 | `backend/api/v1/collab.py` |
| `POST /pricing/batches`, `GET /pricing/batches/{id}`, `POST /pricing/batches/{id}/commit` | 6 | `backend/api/v1/batches.py` |
| `POST /pricing/publish`, `POST /pricing/publish/{id}/rollback` | 7 | `backend/api/v1/publish.py` |
| `POST /reports/proposal/{id}`, `GET /reports/jobs/{id}` | 7 | `backend/api/v1/reports.py` |
| `POST /simulations`, `GET /pricing/sku/{aid}/ab-test` | 8 | `backend/api/v1/simulations.py`, `ab_test.py` |
| `GET/POST/DELETE /pricing/alerts*`, `GET /pricing/alerts/inbox` | 9 | `backend/api/v1/alerts.py` |
| `GET/POST /users/me/language` | 10 | `backend/api/v1/users.py` |
| `GET /events/stream` (SSE) | 0+ | `backend/api/v1/events.py` |

---

## Acceptance gates

- Backend: `pytest tests/services/pricing/* tests/api/pricing/* tests/api/test_sse_integration.py tests/contract/*` — 425+ pricing/contract tests passing.
- Frontend: `npm run typecheck && npm test` — 494 Vitest tests passing, tsc clean.
- Playwright: `npm run test:e2e -- pricing-studio-v3.spec.ts` — 6/6 passing.
- Visual baselines: 6 PNG snapshots committed; CI re-renders and fails on diff > 3%.
