# Frontend v2 Greenfield Rebuild — Design Spec

**Date:** 2026-05-06
**Status:** Approved
**Owner:** ROCAM / Pryzm

## 1. Goal

Build a production-grade React + TypeScript frontend at `frontend-v2/` that realises the Frank dashboard from `Pryzm_Dashboard_Mockup_Frank.html`, end-to-end. Mock-data first; wire Scherzinger backend in the final phase. Old `frontend/` (and its live `/demo/` deploy on Avanna EC2) stays untouched until cutover.

## 2. Non-Goals (this rebuild cycle)

- Till and Heiko personas (only Frank's flow ships)
- Customers / Products / SKU pages outside what Frank uses
- Real authentication (mock current user "Frank" only)
- Mobile / tablet layouts under 1280px
- Full WCAG audit (keep keyboard + contrast basics; no formal audit)
- Touching `frontend/`, `frontend/dist/`, `frontend/dist-demo/`

## 3. Constraints

- Must not break the live demo at `https://3.76.141.43/demo/` (Avanna EC2)
- v2 builds to a separate output (`dist-demo-v2/`) and previews under `/demo-v2/`
- Frank mockup is HTML/CSS only — re-derive layouts from intent, do not copy markup verbatim
- German + English from day one (Scherzinger is a German company)
- Power-user density: Frank wants information density, not whitespace bloat

## 4. Stack

| Concern | Choice | Why |
|---|---|---|
| Build | Vite 7 | Same as v1, fast HMR |
| Framework | React 19 | Latest, concurrent features |
| Language | **TypeScript strict** | Catches bugs early in a multi-month rebuild |
| Routing | React Router v7 | Already in use, file-based not needed |
| Client state | Zustand | Lightweight, no boilerplate, persist middleware |
| Server state | TanStack Query v5 | Caching, refetch, loading/error, background updates |
| Styling | Tailwind 4 + CSS-var tokens | Token layer keeps Pryzm visual language portable |
| UI primitives | Radix + shadcn copy-in | Owned in-repo; no heavy MUI/Chakra runtime |
| Animations | `motion` (framer-motion) | Already in v1 deps |
| Charts | Recharts | Already in v1 deps |
| Forms | react-hook-form + zod | Industry-standard validation |
| i18n | i18next + react-i18next | DE/EN |
| Dates | date-fns | Tree-shakeable |
| Icons | lucide-react | Already in v1 deps |
| Tests | Vitest + RTL | Already in v1 deps |
| Lint/format | ESLint + Prettier | Standard |

## 5. Folder Structure

```
frontend-v2/
├── src/
│   ├── app/                    # router, providers, layout shell
│   │   ├── router.tsx
│   │   ├── providers.tsx       # QueryClient, i18n, theme, density
│   │   └── layout/             # Sidebar, TopBar, PersonaSwitcher, Shell
│   ├── features/               # one folder per Frank screen
│   │   ├── action-center/
│   │   ├── margin-cockpit/
│   │   ├── quotes/
│   │   ├── forecasting/
│   │   ├── pricing-studio/
│   │   └── ai-briefing/
│   ├── components/
│   │   ├── ui/                 # shadcn primitives (Button, Card, Drawer, Tabs, Table, Tooltip, Dialog, Popover, Select)
│   │   ├── fiori/              # ObjectPage, SmartTable, MessageStrip, ObjectStatus, FilterBar, FooterToolbar, SidePanel, KpiTile
│   │   └── charts/             # TrendLine, ParetoBar, Waterfall, GaugeRing
│   ├── lib/                    # api client, query keys, utils, formatters
│   ├── hooks/                  # useDensity, usePersona, useDrawer, useUrlState
│   ├── stores/                 # uiStore, personaStore, filterStore
│   ├── data/
│   │   ├── mocks/              # JSON fixtures
│   │   └── api/                # TanStack Query hooks (mock now → real later)
│   ├── types/                  # Quote, SKU, Customer, Forecast, AlertCard
│   ├── i18n/                   # de.json, en.json
│   ├── styles/                 # tokens.css, globals.css
│   └── tests/
├── public/
├── docs/
│   └── design-system.md
├── package.json
├── tsconfig.json
├── vite.config.ts
└── vite.config.demo.ts         # builds to ../frontend/dist-demo-v2/
```

Feature folders own their own components, hooks, types, and `index.tsx` route entry. Shared work moves up to `components/` only when 2+ features use it.

## 6. Design System

`docs/design-system.md` codifies:

### 6.1 Tokens (Pryzm 2026)
- Colors: warm-gray scale (50–950), rose accent (50–900), semantic (success/warning/error/info), surface layers
- Typography: Manrope (display), Inter (body), tabular-nums variant for KPIs
- Spacing: 4px base
- Radii: sm/md/lg/xl/2xl + pill
- Shadows: 4 levels (subtle to overlay)
- Motion: 150ms ease-out (hover/click), 220ms spring (layout), 320ms (drawer/modal)

### 6.2 Density
`useDensity` hook + `data-density="cozy|compact"` on root. Compact reduces row height, padding, font-size by ~15%. Frank defaults to compact; choice persists in `uiStore`.

### 6.3 Fiori-derived patterns
| Pattern | Use case |
|---|---|
| ObjectPage | Customer detail, SKU detail, Quote detail (header → KPI strip → tabs → sections) |
| SmartTable | Quotes list — column toolbar, sort/filter/group, density, freeze, row actions |
| MessageStrip | Banners (Information/Success/Warning/Error) with consistent icons |
| ObjectStatus | Inline status text (Won/Lost/At Risk/Pending) with semantic color + icon |
| FilterBar | Top of list pages — collapsible, saved variants, "Go" trigger |
| FooterToolbar | Sticky bottom action bar for editors |
| SidePanel | Right drawer for object detail; preserves list context |
| KpiTile | Top-of-page KPI strip (label, value, delta, sparkline) |

Reference: https://www.sap.com/design-system/fiori-design-web/v1-145/ui-elements

### 6.4 Animation grammar
- Page transitions: `AnimatePresence` with fade+slide
- Drawer: spring from right, scrim fades in
- Number tickers: `react-countup` (already in v1 deps)
- Chart entry: stagger bars/lines on mount

## 7. Routing & State

### 7.1 Routes
```
/                         → redirect to /action-center
/action-center            → ActionCenterPage
/margin                   → MarginCockpitPage
/quotes                   → QuotesListPage
/quotes/:id               → QuoteDetailPage (or sidepanel via ?drawer=)
/forecasting              → ForecastingPage
/pricing                  → PricingStudioPage
/pricing/:sku             → SkuDetailPage
/ai                       → AiBriefingPage
```

### 7.2 URL-as-state
Drawers, modals, active tabs, selected rows → URL search params (`?drawer=quote-123&tab=analysis`). Shareable, back-button works, deep-link works.

### 7.3 Zustand stores
- `uiStore` — density, sidebar collapsed, theme (persisted)
- `personaStore` — active persona Frank/Till/Heiko (persisted; v2 supports Frank, switching to Till/Heiko routes back to v1)
- `filterStore` — per-feature filter state (period, segment, customer-group), persisted

### 7.4 Server state
TanStack Query keys are namespaced: `['quotes', { period, segment }]`, `['sku', id]`, `['forecast', { horizon }]`. Phase 1-7 fetchers read from `data/mocks/`; Phase 8 swaps to real fetch — hook signatures unchanged.

## 8. Data Layer

### 8.1 Mock fixtures
Derived from existing `Data/` folder + Frank mockup. Each feature has `data/mocks/<feature>.json` mirroring the eventual backend shape.

### 8.2 Type contracts
`src/types/` defines `Quote`, `SKU`, `Customer`, `ForecastPoint`, `AlertCard`, `MarginRow`, `ScenarioInput`, etc. These types are the contract between mock and real backend; backend wiring (Phase 8) must conform or types update first.

### 8.3 Backend swap (Phase 8)
A single `src/lib/api/client.ts` exposes `apiFetch(path, opts)`. Mock mode reads from `import.meta.glob('../mocks/*.json')`; real mode hits `VITE_SCHERZINGER_API`. Toggle via env var. Per-feature swap is just changing the fetcher import.

## 9. Phasing

| Phase | Deliverable | Definition of Done |
|---|---|---|
| 0 | Foundation | Vite+TS scaffold, tokens, layout shell, sidebar, persona switcher, routing skeleton, mock data layer, base UI primitives, `dist-demo-v2/` build green |
| 1 | Action Center | All cards, drawers, decisions, animations; pixel-parity-ish with Frank mockup |
| 2 | Margin Cockpit | KPI strip, charts, drilldowns, density toggle |
| 3 | Quotes | SmartTable, drawer, analysis tabs, FilterBar |
| 4 | Forecasting | Walkforward, Pareto, scenarios, new product flow |
| 5 | Pricing Studio | SKU cards, simulation, what-if |
| 6 | AI Briefing | Chat + intelligence feed, rule-based reports, collapsible 60/40 |
| 7 | Polish | motion pass, micro-interactions, transitions, empty/loading/error states |
| 8 | Backend wiring | All features hit Scherzinger API; mocks become tests |

Each phase = mergeable PR. Each phase ends green: `pnpm typecheck && pnpm lint && pnpm test && pnpm build`. Visual QA via screenshots against `dist-demo-v2/`.

## 10. Quality Gates

- TS strict mode, no `any` without justification comment
- ESLint blocks merge on errors
- Vitest covers: hooks, stores, formatters, critical components (not pixel snapshots)
- Lighthouse ≥ 90 on each page (perf + best practices) at end of Phase 7
- Bundle budget: < 350KB gz initial route, code-split per feature

## 11. Risks & Mitigations

| Risk | Mitigation |
|---|---|
| Frank mockup HTML not semantically clean | Re-derive from intent, treat as visual reference only |
| Backend contracts unknown for Phase 8 | TS types are the contract; mocks define shape; backend conforms or types update first |
| Live demo regression | v2 lives at separate path & build output; never touches `dist-demo/` |
| Scope creep into Till/Heiko | Persona switcher routes non-Frank → v1 for now; v2 only renders Frank |
| Animation perf on dense screens | Density toggle + virtualised tables; reduced-motion media query honoured |

## 12. Spec → Plan handoff

Implementation plan produced via `superpowers:writing-plans` skill, written to `docs/superpowers/plans/2026-05-06-frontend-v2-phase-0-foundation-plan.md`. Each phase gets its own plan file (Phase 1 plan written when Phase 0 lands, etc.) so the plans stay tight and current.
