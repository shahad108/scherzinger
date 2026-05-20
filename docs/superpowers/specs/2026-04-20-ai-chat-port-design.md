---
name: ai-chat-port-design
description: Port structured-reply AI chat and AI Insights page from demo repo to main repo, preserving Manuel fixes; add full DE translations
status: approved
created: 2026-04-20T19:06:20Z
updated: 2026-04-20T19:06:20Z
---

# AI Chat + Insights Port — Design

## Goal
Make `/Users/dharmendersingh/Downloads/Scherzinger_new` (target) produce the same AI chat replies, AI Insights page output, and Supabase-backed conversation memory as `/Users/dharmendersingh/Documents/Scherzinger_new` (reference / demo repo), in both English and German, while preserving Downloads-only features (Measures page, QuotedActualDecompositionPanel, useMeasures/useAiContext hooks, LastUpdated component, Manuel-feedback fixes across pages).

## Context summary
- Both repos share identical `utils/openrouter.js`, `utils/supabaseService.js`, `utils/supabase.js`, and `.env` — so the Supabase memory layer already works in target; replacing `ChatContext.jsx` is enough to activate it.
- Reference repo has a structured JSON-streaming reply engine (`utils/structuredReply/`), a block renderer (`components/chat/` — 14 block components incl. MetricGrid, ComparisonCards, ActionPlan, FactorBreakdown, ReportDownload, Chart), and companion utilities (`insightBuilders.js`, `reportExport/*`, `demoFlags.js`, `mockPhase45.js`).
- Target repo has Manuel-feedback fixes committed across page files (Customers, Forecasting, MLAnalytics, PricingFX, ProductsSKUs, RevenueMargins, DashboardOverviewV2) that must be preserved.
- Translation gap: reference is English-heavy; target needs DE keys added for every new string the port introduces.

## Merge strategy (user-chosen: Option B — replace)
- **Wholesale replace** for chat core: `context/ChatContext.jsx`, `components/GlobalChatBar.jsx`, `pages/AIInsights.jsx`.
- **Pure copy** (files don't exist in target): all of `components/chat/`, `utils/structuredReply/`, `utils/reportExport/`, `insightBuilders.js`, `demoFlags.js`, `mockPhase45.js`, `commodities.json`, `quotes.json`, `mock_phase45.json`, `CommoditySlideOver.jsx`, `components/phase45/`, `pages/ChatDebug.jsx`, `pages/ScenarioLab.jsx`, `pages/chatDebugFixtures.js`, `hooks/useUrlFilters.js`.
- **Three-way merge** for pages with both AI-wiring changes and Manuel fixes: Customers, Forecasting, MLAnalytics, PricingFX, ProductsSKUs, RevenueMargins, DashboardOverviewV2, Sidebar, Layout, App, customerDetailEngine, forecasting.json. Pause for user review at each conflict.
- **Keep untouched** (target-only): Measures page + data, QuotedActualDecompositionPanel, useMeasures, useAiContext, LastUpdated, dataFreshness.js.

## Phased plan

### Phase 0 — Baseline capture
Run reference repo locally. Playwright-snapshot AI Insights + 5 canonical chat prompts (revenue query, margin query, customer compare, forecast, commodity drill). Save screenshots + response JSON as goldens under `tests/fixtures/golden/`.

### Phase 1 — Port structured-reply engine (pure JS)
Copy `utils/structuredReply/*`, `insightBuilders.js`, `demoFlags.js`, `reportExport/*`, updated `customerDetailEngine.js`. Run unit tests. Exit: tests pass, `npm run build` succeeds.

### Phase 2 — Port chat block renderer
Copy `components/chat/` + `components/CommoditySlideOver.jsx` + `components/phase45/` + data JSONs + `mockPhase45.js`. Exit: build passes; blocks render in Storybook-style debug page.

### Phase 3 — Replace chat core
Overwrite `ChatContext.jsx`, `GlobalChatBar.jsx`, `AIInsights.jsx`. Add `ChatDebug.jsx`, `ScenarioLab.jsx`, `chatDebugFixtures.js`, `useUrlFilters.js`. Targeted merges into `App.jsx`, `Layout.jsx`, `Sidebar.jsx` (preserve Measures route). Exit: chat produces structured replies visually matching reference.

### Phase 4 — Page integrations with Manuel-fix preservation
For each of: Customers, Forecasting, MLAnalytics, PricingFX, ProductsSKUs, RevenueMargins, DashboardOverviewV2 — three-way merge (base=common ancestor if findable, else reference vs target). Pause at each page; present the merged diff for approval before writing. Exit: every page has both the new AI hookups and existing Manuel fixes.

### Phase 5 — German translations
Diff `i18n/translations.js` between repos. For every new EN key introduced in phases 1–4 (including chat block labels, report export strings, clarification prompts, action-plan verbs), add the DE equivalent. Audit by toggling language and scanning for untranslated fallbacks. Exit: no English leakage in DE mode on AI Insights or chat.

### Phase 6 — Playwright parity verification
Replay the 5 canonical prompts against target. Compare screenshots + response block structure to Phase-0 goldens. Fix deltas. Exit: visual + structural parity on AI Insights + chat in both EN and DE.

### Phase 7 — Supabase memory verification
Create conversation in target, reload, confirm persistence. Confirm same Supabase project visible from both repos (identical `.env`). Exit: conversation history/memory works identically.

## Risks
- **Phase 4** is highest risk — any Manuel fix also touching AI-wiring code will need hand merging. Policy: always pause at each page diff and ask before overwriting.
- **Chat-core Manuel fixes**: if Manuel fixes exist in `ChatContext`/`GlobalChatBar`/`AIInsights` they will be discarded by Option B. Will be explicitly listed before Phase 3 executes.
- **Supabase schema drift**: if reference introduced new columns, target Supabase project must match. Will be verified at start of Phase 7.

## Success criteria
1. AI Insights page in target produces KPI cards, ranked lists, factor breakdowns identical to reference for the 5 canonical prompts.
2. Global chat bar streams structured blocks (not plain text) identical to reference.
3. Conversation history persists across reloads via Supabase.
4. Language toggle (EN/DE) works with no English leakage in DE mode.
5. All Downloads-only features (Measures page, Manuel fixes) still function.
