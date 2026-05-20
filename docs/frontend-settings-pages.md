# Frontend Settings Pages — Reference

> Last updated: 2026-05-14. Mirrors the state of `demo-phase45` branch at HEAD `5545956`.
>
> Source of truth lives in `frontend-v2/src/features/settings/`. This document indexes every component each of the five settings sub-pages can render, in render order, with data sources and interactions.

## 1. Entry point

| File | Role |
|---|---|
| `frontend-v2/src/app/router.tsx:94` | Route definition for `/settings`. Mounts `SettingsLayout` as the parent route, with `{ index: true }` redirecting to `/settings/profile`. Five child routes (`profile`, `preferences`, `saved-views`, `data-quality`, `model-cards`) are lazy-loaded via `lazyRoute()`. |
| `frontend-v2/src/features/settings/SettingsLayout.tsx:26` | Page shell. Renders the H1 + subtitle, the left-rail nav, and `<Outlet />` inside a bordered card. **No data fetching of its own** — pure layout. |

The settings tree is gated by `RequireAuth` (`router.tsx:79-82`), so every sub-page can assume `useAuthStore().user` is populated on mount.

### Routes mounted under `/settings`

| Path | Component | Lazy import (router.tsx) |
|---|---|---|
| `/settings` (index) | `Navigate to="/settings/profile"` | `router.tsx:97` |
| `/settings/profile` | `ProfilePage` | `router.tsx:25` |
| `/settings/preferences` | `PreferencesPage` | `router.tsx:26` |
| `/settings/saved-views` | `SavedViewsPage` | `router.tsx:27` |
| `/settings/data-quality` | `DataQualityPage` | `router.tsx:28` |
| `/settings/model-cards` | `ModelCardsPage` | `router.tsx:29` |

Two additional surfaces (`/notifications`, `/notes`) are linked from the settings nav but live outside the `/settings/*` subtree (`router.tsx:105-106`). They are documented out of scope here but referenced in §2.

---

## 2. Shared shell — `SettingsLayout`

Source: `frontend-v2/src/features/settings/SettingsLayout.tsx`.

### Layout

```
<div className="w-full px-6 py-6">
  <h1>Settings</h1>                                        ← i18n: settings.title
  <p>Profile, preferences, saved views, and data quality.</p>  ← settings.subtitle
  <div className="grid md:grid-cols-[220px_minmax(0,1fr)]">
    <nav aria-label="Settings sections">                   ← left-rail
      …7 NavLinks…
    </nav>
    <div className="rounded-[14px] border bg-white p-6">
      <Outlet />                                           ← sub-page renders here
    </div>
  </div>
</div>
```

No breadcrumbs. No persistent header beyond the H1+subtitle. Active-link state is a `bg-[var(--surface-soft)]` tint applied via `NavLink`'s `isActive` render-prop (`SettingsLayout.tsx:48-54`). `end` prop is set on every `NavLink`, so only exact-match paths get the active style — children never highlight a parent.

### Left-rail nav (`links` array at `SettingsLayout.tsx:6-14`)

| # | i18n key | Fallback label | Icon (lucide) | Target route |
|---|---|---|---|---|
| 1 | `settings.profile` | Profile | `User` | `/settings/profile` |
| 2 | `settings.preferences` | Preferences | `SlidersHorizontal` | `/settings/preferences` |
| 3 | `settings.savedViews` | Saved views | `BookmarkCheck` | `/settings/saved-views` |
| 4 | `settings.dataQuality` | Data quality | `Database` | `/settings/data-quality` |
| 5 | `settings.modelCards` | Model cards | `BrainCog` | `/settings/model-cards` |
| 6 | `settings.notifications` | Notifications | `BellRing` | `/notifications` *(outside `/settings`)* |
| 7 | `settings.notes` | Notes | `NotebookPen` | `/notes` *(outside `/settings`)* |

i18n keys resolve via `react-i18next`'s `t(key, { defaultValue: fallback[key] })` — see `fallback` map at `SettingsLayout.tsx:16-24`.

---

## 3. `/settings/profile` — ProfilePage

| Field | Value |
|---|---|
| Route | `/settings/profile` |
| Entry file | `frontend-v2/src/features/settings/ProfilePage.tsx:7` |
| URL query params | *none* |
| Data sources | `useAuthStore` (for `user`), `usePreferences()` (for `language`), `usePatchProfile()` and `usePatchPreferences()` mutations |
| Tag in source | Phase 14 P14.T2 |

### Data hooks (all from `frontend-v2/src/data/api/useSettings.ts`)

| Hook | Method | BFF path | Query key |
|---|---|---|---|
| `usePreferences` | GET | `/me/preferences` | `['me','preferences']` (`useSettings.ts:27`) |
| `usePatchProfile` | PATCH | `/me` | invalidates `['me']` (`useSettings.ts:69-75`) |
| `usePatchPreferences` | PATCH | `/me/preferences` | invalidates `['me','preferences']` (`useSettings.ts:61-67`) |

### Local state

| Hook | Source line | Purpose |
|---|---|---|
| `name` | `ProfilePage.tsx:15` | Controlled text input; lazy-initialised from `user?.name`. No `useEffect`-driven sync — safe because `RequireAuth` guarantees `user` is non-null on mount. |

### Render order (top → bottom)

| # | Section | Source file:line | What it shows | Key interactions |
|---|---|---|---|---|
| 1 | **Profile section** | `ProfilePage.tsx:26-56` | Two fields stacked: `Name` (editable text input) and `Email` (disabled, read from `user.email`). Below them, a **Save name** button. | Save name PATCHes `/me` via `usePatchProfile`. Disabled while pending or when `name === user?.name`. On success the global `['me']` query is invalidated so the shell and sidebar reflect the new name. |
| 2 | **Language section** | `ProfilePage.tsx:58-77` | Two-button segmented control: **Deutsch** / **English**. Active button uses rose background; `aria-pressed` toggled. | Click → `i18n.changeLanguage(l)` first (so the UI flips immediately), then PATCH `/me/preferences { language }`. The cookie write happens inside `i18n/index.ts` on the `languageChanged` event; `apiFetch` then picks it up on subsequent calls via `?lang=` (`client.ts:36-37`). |

### Side panels / drawers / modals

None. The page is a single column of two stacked sections.

### Follow-ups

- No email-change flow — the field is intentionally disabled.
- No avatar upload, password change, or 2FA — out of scope for Phase 14.
- No optimistic update on Save name; the button stays disabled until the mutation resolves.

---

## 4. `/settings/preferences` — PreferencesPage

| Field | Value |
|---|---|
| Route | `/settings/preferences` |
| Entry file | `frontend-v2/src/features/settings/PreferencesPage.tsx:9` |
| URL query params | *none* |
| Data sources | `usePreferences()` (GET), `usePatchPreferences()` (PATCH) — both from `useSettings.ts` |
| Tag in source | Phase 14 P14.T2 |

### `UserPreferences` shape (`useSettings.ts:14-23`)

```ts
{
  language: 'de' | 'en'
  density: 'comfortable' | 'compact'
  default_persona: 'frank' | 'till' | 'heiko'
  briefing_email_cadence: 'daily' | 'weekly' | 'off'
  notify_quotes: boolean
  notify_margin: boolean
  notify_pro: boolean
  updated_at: string | null
}
```

`PreferencesPatch` (`useSettings.ts:25`) is `Partial<Omit<UserPreferences,'updated_at'>>` — server owns the timestamp.

### Loading state

`PreferencesPage.tsx:13-15` — while `isLoading || !p`, the page renders `<div>Loading…</div>`. No skeleton.

### Render order

| # | Section | Source file:line | Options | What it does |
|---|---|---|---|---|
| 1 | **Density** | `PreferencesPage.tsx:19-38` | `comfortable` · `compact` | Segmented buttons; click → PATCH `{ density }`. Active = rose bg. |
| 2 | **Default persona** | `PreferencesPage.tsx:40-59` | `frank` · `till` · `heiko` | Segmented buttons; click → PATCH `{ default_persona }`. Capitalised label. |
| 3 | **Briefing email cadence** | `PreferencesPage.tsx:61-80` | `daily` · `weekly` · `off` | Segmented buttons; click → PATCH `{ briefing_email_cadence }`. |
| 4 | **Notifications** | `PreferencesPage.tsx:82-102` | Checkbox list of 3 toggles | `notify_quotes` ("Quote events"), `notify_margin` ("Margin alerts"), `notify_pro` ("PRO mode + new SKU"). Each change PATCHes a single field. |

All four sections share the same pattern: every interaction fires a single-field PATCH; on success the React Query cache for `['me','preferences']` is invalidated, which re-renders the buttons with the new `aria-pressed` state.

### Side panels / drawers / modals

None.

### Follow-ups

- No "Save all" / batching — every click is its own network round-trip.
- No optimistic UI; buttons remain in their previous state until the mutation resolves.
- `language` is **not** controlled from this page — it lives on `/settings/profile`. Surfacing it here too would let users change it from either screen without de-syncing the i18n side effect.

---

## 5. `/settings/saved-views` — SavedViewsPage

| Field | Value |
|---|---|
| Route | `/settings/saved-views` |
| Entry file | `frontend-v2/src/features/settings/SavedViewsPage.tsx:15` |
| URL query params | *none* |
| Data sources | `useSavedViews()`, `useCreateSavedView()`, `useDeleteSavedView()` (all `useSettings.ts:89-128`) |
| Tag in source | Phase 14 P14.T3 |

### `SavedView` shape (`useSettings.ts:79-87`)

```ts
{
  id: string
  screen: string                  // one of the SCREENS constants below
  label: string
  filters: Record<string, unknown>
  is_default: boolean
  created_at: string | null
  updated_at: string | null
}
```

### Allowed screens (`SavedViewsPage.tsx:6-13`)

`action-center` · `margin-cockpit` · `quotes` · `forecast` · `studio` · `ai`

### Local state

| Hook | Source line | Purpose |
|---|---|---|
| `screen` | `SavedViewsPage.tsx:19` | Selected screen for the new view; defaults to `'action-center'`. |
| `label` | `SavedViewsPage.tsx:20` | Controlled text input. |

### Render order

| # | Section | Source file:line | What it shows | Key interactions |
|---|---|---|---|---|
| 1 | **New saved view** form | `SavedViewsPage.tsx:34-68` | Three controls in one row: `Screen` (`<select>`), `Label` (`<input>`, placeholder `"Margin watch — BKAES"`), **Save view** button. | Click Save → `useCreateSavedView.mutate({ screen, label: label.trim(), filters: {} })`. Button disabled while `create.isPending` or label is empty. On success the `label` input clears (`onSuccess: () => setLabel('')`). `filters` is always `{}` from this UI — the *populated* filter set ships from `SavedViewSaveForm` (see §8). |
| 2 | **Your saved views** list | `SavedViewsPage.tsx:70-104` | Loading state (`isLoading`) → "Loading…". Empty state → "No saved views yet." Otherwise a `<ul>` of cards, each card showing `screen` (uppercase mono), `label` (bold), optional `default` chip if `is_default`, and a trash-icon delete button (`lucide-react/Trash2`). | Click trash → `useDeleteSavedView.mutate(v.id)`. `aria-label="Delete {label}"` for screen-reader UX. |

### BFF endpoints

| Hook | Method | Path | Mutation cache invalidation |
|---|---|---|---|
| `useSavedViews(screen?)` | GET | `/saved-views` (`?screen=` optional) | — (`useSettings.ts:89-96`) |
| `useCreateSavedView` | POST (via `postJson`) | `/saved-views` | invalidates `['saved-views']` (`useSettings.ts:98-105`) |
| `useDeleteSavedView` | DELETE (raw `fetch` with CSRF) | `/saved-views/{id}` | invalidates `['saved-views']` (`useSettings.ts:107-128`) |

Delete uses a hand-rolled `fetch` (not `postJson`) because the `client.ts` helpers don't expose a DELETE wrapper. CSRF is read from the `pryzm_csrf` cookie and forwarded as `x-csrf` (`useSettings.ts:113-122`).

### Side panels / drawers / modals

None. Delete is destructive but has no confirmation modal — single-click commits.

### Follow-ups

- No edit (rename, re-screen, set-as-default) — only create + delete. `is_default` is read-only here.
- No filter editor; this page only creates empty-filter views. Populated views come from the per-screen `SavedViewSaveForm` (`src/components/forms/SavedViewSaveForm.tsx:26`).
- No delete confirmation; an accidental click is permanent.

---

## 6. `/settings/data-quality` — DataQualityPage

| Field | Value |
|---|---|
| Route | `/settings/data-quality` |
| Entry file | `frontend-v2/src/features/settings/DataQualityPage.tsx:30` |
| URL query params | *none* |
| Data sources | `useQualitySummary()` — local hook at `DataQualityPage.tsx:19-28` |
| Tag in source | Phase 14 P14.T4, Phase 8 cross-link added |

### Data hook

Inline in the file (not in `useSettings.ts`):

```ts
useQuery({
  queryKey: ['data-quality', 'summary'],
  queryFn: () => apiFetch<QualitySummary>('/data-quality/summary'),
  staleTime: 60_000,
});
```

The path `/data-quality/summary` is hit at the BFF root (`apiFetch` prefixes `BASE` = `/api/v1` by default — see `client.ts:15`). The comment at `DataQualityPage.tsx:22-25` notes this lives outside `/screens/*`.

### `QualitySummary` shape (`DataQualityPage.tsx:9-17`)

```ts
{
  health?: string                                     // declared but not rendered
  last_load_at?: string | null
  invoice_count?: number
  quote_count?: number
  customer_count?: number
  product_count?: number
  issues?: { code: string; severity: string; detail: string }[]
}
```

### Loading / error states

- `isLoading` → `<div>Loading…</div>` (`DataQualityPage.tsx:33`)
- `error || !data` → `<div>Data quality summary unavailable.</div>` (`DataQualityPage.tsx:34-40`)

### Render order

| # | Section | Source file:line | What it shows | Key interactions |
|---|---|---|---|---|
| 1 | **Cross-link banner** | `DataQualityPage.tsx:44-58` | Pill linking to `/settings/model-cards` with `BrainCog` icon. Copy: "Model cards → sibling trust surface · per-cluster accuracy, last-trained date, feature list." | `<Link>` (react-router); single click navigates. |
| 2 | **Volume tiles** | `DataQualityPage.tsx:59-74` | 4-tile grid (2 cols on mobile, 4 on `sm`): Invoices · Quotes · Customers · Products. Each tile uses `font-display text-[22px] tabular-nums` for the count. Falls back to `—` if missing. | Read-only. |
| 3 | **Last load** | `DataQualityPage.tsx:76-81` | Single line: `new Date(last_load_at).toLocaleString()` or `—`. | Read-only. |
| 4 | **Issues** | `DataQualityPage.tsx:83-107` | Empty state: "No active data-quality issues." Otherwise a `<ul>` of cards, each with a severity chip (`error` red / `warn` amber / else muted), a mono `code` chip, and the issue `detail` body. | Read-only. |

### Side panels / drawers / modals

None.

### Follow-ups

- `health` field is declared in the type but never rendered.
- No drill-in per issue — each row is read-only with no link to the underlying records.
- No refresh button; the user must rely on `staleTime: 60_000` plus React Query's window-focus refetch.

---

## 7. `/settings/model-cards` — ModelCardsPage

| Field | Value |
|---|---|
| Route | `/settings/model-cards` |
| Entry file | `frontend-v2/src/features/settings/ModelCardsPage.tsx:247` |
| URL query params | *none* |
| Data sources | `useModelCards()` — local hook at `ModelCardsPage.tsx:34-40` |
| Tag in source | Phase 8 |

### Data hook

Inline in the file:

```ts
useQuery({
  queryKey: ['models', 'cards'],
  queryFn: () => apiFetch<CardsResponse>('/models/cards'),
  staleTime: 60_000,
});
```

Underlying BFF route: `/api/v1/models/cards`, fed by the `model_registry` table (built by `scripts/build_model_registry.py`). Same source feeds the Action Center Trust drawer.

### Response shape (`ModelCardsPage.tsx:11-32`)

```ts
interface CardsResponse { models: ModelCard[]; count: number }

interface ModelCard {
  model_name: string
  version: string | null
  last_trained_at: string | null
  holdout_months: number | null
  notes: string | null
  features: string[] | null
  clusters: ClusterRow[]
}

interface ClusterRow {
  entity_type: string
  entity_id: string | null
  entity_label: string
  n: number | null
  metrics: Record<string, number | null>
}
```

### States

- `isLoading` → "Loading model registry…" (`ModelCardsPage.tsx:250`)
- `error || !data` → "Model registry unavailable." (`ModelCardsPage.tsx:251-257`)
- `data.count === 0` → dashed amber banner: "Model registry is empty. Run `scripts/build_model_registry.py` to backfill from `backtest_results`." (`ModelCardsPage.tsx:259-265`)

### Render order — page-level

| # | Section | Source file:line | What it shows | Key interactions |
|---|---|---|---|---|
| 1 | **Header** | `ModelCardsPage.tsx:269-281` | H2 "Model cards" + tagline. Right-side meta pill: `"{count} model(s) · source model_registry"`. | Read-only. |
| 2 | **Model card list** | `ModelCardsPage.tsx:283-287` | One `<ModelCardView>` per entry in `data.models`. | See per-card breakdown below. |

### Per-card render — `ModelCardView` (`ModelCardsPage.tsx:149-245`)

| # | Sub-block | Source file:line | Detail |
|---|---|---|---|
| 1 | **Header row** | `:179-200` | `model_name` (font-display, 18px). Meta: `v{version}` · `trained {date}` · `<FreshnessPill>` · `{holdout_months}mo holdout` · `{clusters.length} clusters`. |
| 2 | **`FreshnessPill`** | `:71-88` | Tinted chip based on `daysSince(last_trained_at)`: ≤14d "Fresh" green · ≤45d "Aging" amber · else "Stale" rose. Null iso → grey "Untrained". |
| 3 | **Notes** | `:202-206` | Optional grey-tinted paragraph if `card.notes` is non-empty. |
| 4 | **Features chips** | `:208-224` | Optional. Mono chips for each `card.features[]` entry. |
| 5 | **Per-cluster accuracy** | `:226-242` | Section header + (when `clusters.length > 5`) a "Show all N" / "Show top 5" toggle. The table is `<ClusterMetricsTable>`. |
| 6 | **`ClusterMetricsTable`** | `:90-147` | Columns: Cluster · n · {dynamic metric columns}. Metric columns are derived from the union of metric keys across clusters (`:151-160`), sorted with `directional_accuracy` first then alphabetical. Headers show `↑` for higher-better metrics, `↓` for lower-better (per `METRIC_TONE` at `:50-55`). Each cluster row shows `entity_id` (bold) + `entity_label` (muted). `n < 3` rows display a `low-n` amber badge with title "Low-n: fewer than 3 walk-forward steps. Manual review before auto-act." (`:126-133`). |

### Sort & formatting

- Clusters within a card sort by `n` descending, then `entity_id` alphabetical (`ModelCardsPage.tsx:165-174`).
- Default slice is top-5; toggle exposes the full list (`:175`).
- `formatMetric` (`:42-48`):
  - `directional_accuracy` → `(v*100).toFixed(0)%`
  - `mape` → `(v*100).toFixed(2)%`
  - `mae` / `rmse` → `(v*100).toFixed(2)pp`
- `METRIC_LABELS` (`:57-62`): friendly names — "Directional acc.", "MAE", "MAPE", "RMSE".

### Side panels / drawers / modals

None on this page. Click-through to the Action Center Trust drawer is *implied* by the cross-link from `DataQualityPage`, not wired here.

### Follow-ups

- No filter / search across cards.
- No links from a cluster row out to the forecasting page filtered by that cluster.
- No model-version diff view; a new training simply replaces the visible card.
- "Untrained" pill state can collide with "Stale" if a model is registered but never trained — currently only the `iso==null` branch shows Untrained.

---

## 8. Cross-page shared components

| Component / hook | File | Used by | Purpose |
|---|---|---|---|
| **`apiFetch`** | `frontend-v2/src/lib/api/client.ts:55` | DataQualityPage, ModelCardsPage, all `useSettings` query hooks | BFF GET wrapper. Adds `?lang=` from `pryzm_lang` cookie, trace-id header, JSON parsing. Switches to mock-resolver in `MODE === 'test'`. |
| **`postJson`** | `frontend-v2/src/lib/api/client.ts:98` | `useCreateSavedView`, `useCreateNote` | BFF POST wrapper with CSRF double-submit (`x-csrf` from `pryzm_csrf` cookie). |
| **`patchJson` (local)** | `frontend-v2/src/data/api/useSettings.ts:37-59` | `usePatchProfile`, `usePatchPreferences`, `usePatchNote` | PATCH helper with the same CSRF pattern. Not exported. |
| **`useSettings.ts` exports** | `frontend-v2/src/data/api/useSettings.ts` | Profile, Preferences, SavedViews pages + `SidebarDataStatus`, `SavedViewSaveForm` | One module bundles every settings-side query/mutation. See table below. |
| **`useAuthStore`** | `frontend-v2/src/stores/authStore.ts` | ProfilePage | Zustand store; provides `user: MeUser \| null`. Populated by `RequireAuth`. |
| **`react-i18next` / `useTranslation`** | (NPM) | SettingsLayout, ProfilePage | Drives the nav labels and language pills. The `t()` calls all pass `defaultValue` so missing keys never blank the UI. |
| **`SavedViewSaveForm`** | `frontend-v2/src/components/forms/SavedViewSaveForm.tsx` | Per-screen "Save current view" CTAs (Action Center, Margin, etc.) | Creates `SavedView` records with the *current* filter state. Companion to SavedViewsPage's empty-filter creation flow. |
| **`SidebarDataStatus`** | `frontend-v2/src/app/layout/SidebarDataStatus.tsx:18` | App shell sidebar | Calls `useSavedViews()` so saved views can surface in the persistent sidebar. |

### Full `useSettings.ts` export surface

| Export | Kind | Endpoint | Source line |
|---|---|---|---|
| `UserPreferences` | type | — | `:14-23` |
| `PreferencesPatch` | type | — | `:25` |
| `usePreferences` | query | GET `/me/preferences` | `:29-35` |
| `usePatchPreferences` | mutation | PATCH `/me/preferences` | `:61-67` |
| `usePatchProfile` | mutation | PATCH `/me` | `:69-75` |
| `SavedView` | type | — | `:79-87` |
| `useSavedViews` | query | GET `/saved-views` | `:89-96` |
| `useCreateSavedView` | mutation | POST `/saved-views` | `:98-105` |
| `useDeleteSavedView` | mutation | DELETE `/saved-views/{id}` | `:107-128` |
| `Note` | type | — | `:132-139` |
| `useNotes` | query | GET `/notes` | `:141-148` |
| `useCreateNote` | mutation | POST `/notes` | `:150-157` |
| `usePatchNote` | mutation | PATCH `/notes/{id}` | `:159-166` |
| `useDeleteNote` | mutation | DELETE `/notes/{id}` | `:168-189` |

Note: `useNotes` / `useCreateNote` / `usePatchNote` / `useDeleteNote` are exported here but consumed by `NotesPage` (`/notes`, outside the `/settings` tree).

---

## 9. Tests covering these pages

| Layer | Location | Coverage |
|---|---|---|
| **Vitest unit** | `frontend-v2/src/tests/settings/SettingsLayout.test.tsx` (32 lines, 1 test) | Renders the layout under `MemoryRouter` and asserts all 7 nav links exist by accessible name (`Profile`, `Preferences`, `Saved views`, `Data quality`, `Model cards`, `Notifications`, `Notes`) plus the `nav[aria-label="Settings sections"]` landmark. i18n is forced to `en` in `beforeAll`. |
| **Vitest unit** | `frontend-v2/src/tests/settings/ModelCardsPage.test.tsx` (78 lines, 3 tests) | (1) Renders one model with version, freshness pill, features (`lag_1`, `lag_2`), per-cluster table with top cluster `BKAES` at 82% directional accuracy. Asserts `SOPU` (n=2) is *hidden* in default top-5 view, appears with `low-n` badge after clicking "Show all 6". (2) Toggles between top-5 and full list. (3) Empty-registry hint includes the backfill script path. Mocks `@/lib/api/client.apiFetch`. |
| **Sidebar tests touching settings nav** | `frontend-v2/src/tests/shell/Sidebar.test.tsx` | Asserts the global sidebar surfaces a settings entry. (Not a deep settings test.) |
| **Forms tests touching saved views** | `frontend-v2/src/tests/forms/admin-forms.test.tsx` | Covers `SavedViewSaveForm` (the companion to SavedViewsPage). |
| **Playwright E2E** | — | **No dedicated settings spec** under `frontend-v2/tests/e2e/`. The only e2e files (`forecasting-actual-entry.spec.ts`, `forecasting-visual.spec.ts`) target the forecasting page. |

**Coverage gap**: no unit tests exist for `ProfilePage`, `PreferencesPage`, `SavedViewsPage`, or `DataQualityPage`. All four are wired to React Query mutations that are exercised only via `useSettings.ts`'s shared `patchJson` helper. No backend pytest is in scope for this doc.

---

## 10. Open follow-ups

- **No E2E coverage** for the settings tree — every interaction (language flip, density toggle, saved-view create/delete, model card expansion) is unit-only.
- **No optimistic UI** anywhere in settings — every click waits a round-trip before reflecting state.
- **No edit / set-default flow** for saved views; `is_default` is rendered but cannot be toggled from the page.
- **No delete confirmation** on saved views.
- **`health` field** in `QualitySummary` is declared but unrendered.
- **No refresh button** on DataQualityPage or ModelCardsPage — both rely on `staleTime: 60_000` plus React Query's automatic refetch on window focus.
- **No filter / search** on ModelCardsPage; large registries will scroll forever.
- **No password / 2FA / avatar flows** on ProfilePage; email is intentionally disabled.
- **Notifications & Notes** are linked from the settings nav but live at `/notifications` and `/notes` — they should arguably be siblings under `/settings/*` for URL consistency.

---

## 11. Quick file map

```
frontend-v2/src/features/settings/
├── SettingsLayout.tsx                   ← shell + left-rail nav, mounts <Outlet/>
├── ProfilePage.tsx                      ← /settings/profile
├── PreferencesPage.tsx                  ← /settings/preferences
├── SavedViewsPage.tsx                   ← /settings/saved-views
├── DataQualityPage.tsx                  ← /settings/data-quality  (inline useQualitySummary)
├── ModelCardsPage.tsx                   ← /settings/model-cards   (inline useModelCards + sub-components)
├── NotesPage.tsx                        ← /notes (linked from nav, out of scope)
└── NotificationsPage.tsx                ← /notifications (linked from nav, out of scope)

frontend-v2/src/data/api/
└── useSettings.ts                       ← all settings query/mutation hooks
                                              (preferences, profile, saved views, notes)

frontend-v2/src/lib/api/
└── client.ts                            ← apiFetch / postJson (CSRF, ?lang=, trace-id)

frontend-v2/src/app/
└── router.tsx                           ← /settings + 5 children, NotificationsPage, NotesPage

frontend-v2/src/app/layout/
└── SidebarDataStatus.tsx                ← consumes useSavedViews()

frontend-v2/src/components/forms/
└── SavedViewSaveForm.tsx                ← companion form that calls useCreateSavedView with real filters

frontend-v2/src/stores/
└── authStore.ts                         ← Zustand store, provides MeUser for ProfilePage

frontend-v2/src/tests/settings/
├── SettingsLayout.test.tsx              ← nav-links smoke test
└── ModelCardsPage.test.tsx              ← 3 tests covering card render + top-5 toggle + empty state
```
