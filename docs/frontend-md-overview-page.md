# Frontend MD Overview Page — Reference

> Last updated: 2026-05-14. Mirrors the state of `forecast-redesign-v2` branch at HEAD `b9118b4`.
>
> Source of truth lives in `frontend-v2/src/features/persona-overview/`. Route `/md/overview` → `MdOverviewPage`. This is the **Till (Managing Director) read-only landing page** shipped in Phase 12.

## 1. Entry point

| File | Role |
|---|---|
| `frontend-v2/src/features/persona-overview/MdOverviewPage.tsx:79` | Page shell. Single React component (no sub-components). Fetches `/screens/md-overview` via TanStack Query, renders header + 4 KPI tiles + Approval Queue table + Shares list + Cross-links strip + Recent Audit chain. |
| `frontend-v2/src/app/router.tsx:30` | Lazy-imports `MdOverviewPage`. |
| `frontend-v2/src/app/router.tsx:109` | Mounts the page under the `Shell` + `RequireAuth` tree at path `md/overview`. |
| `frontend-v2/src/app/router.tsx:69` | Persona landing map: `till.default = '/md/overview'`. |
| `frontend-v2/src/app/layout/PersonaSwitcher.tsx:18` | Persona switcher entry for Till — `requires: 'act.approve_md_authority'`, `landing: '/md/overview'`. |
| `frontend-v2/src/features/auth/Login.tsx:92` | Post-login routing: if `persona === 'till'`, redirect to `/md/overview`. |

### Role / intent

Till (MD/CFO buyer persona). Read-only sign-off cockpit. Shows: what Frank just decided, what needs MD approval, what Frank explicitly shared with Till, and the audit-chain receipt. No state mutates from this screen — the route contract is read-only (composer comment, `composer.py:1`).

---

## 2. URL parameters

`MdOverviewPage` itself reads **no URL params** — no `useSearchParams`, no `useParams`. The page is a static fetch keyed only on the authenticated user.

Cross-link targets (`crossLinks` array, composer-emitted) append a `?persona=till` query to downstream pages so those screens can render the read-only Till variant:

| Outbound link | Where |
|---|---|
| `/action-center?persona=till` | `composer.py:163` |
| `/ai?persona=till` | `composer.py:164` |
| `/settings/model-cards` | `composer.py:165` |

The page's data hook does not pass `params`; `apiFetch` will still attach `?lang=` from the `pryzm_lang` cookie if set (`lib/api/client.ts:32`).

---

## 3. Data sources

### Hook

- TanStack Query, inline in `MdOverviewPage.tsx:80-84`:
  ```
  useQuery({
    queryKey: ['md-overview'],
    queryFn: () => apiFetch<MdOverview>('/screens/md-overview'),
    staleTime: 60_000,
  })
  ```
- Fetcher: `apiFetch` from `frontend-v2/src/lib/api/client.ts:55`. Production hits BFF `${VITE_SCHERZINGER_API || '/api/v1'}/screens/md-overview`. Tests use the bundled-mocks resolver or `mockResolve` injection.

### Endpoint

- FastAPI route: `scherzinger-platform/backend/api/v1/screens.py:381` — `GET /api/v1/screens/md-overview`.
- Auth: `Depends(require_auth)`. No persona gate beyond auth (Frank can preview Till's view to validate shares). `screens.py:388-393`.
- Cache: ETag = `sha256(json)[:16]`. `Cache-Control: private, max-age=60`. 304 on `If-None-Match` round-trip. `screens.py:395-403`.
- Composer: `scherzinger-platform/backend/services/persona_overview/composer.py:57` — `build_md_overview(db, user_id, user_name)`.

### Composer reads (live SQL, no cache)

| Source | Filter | Used for |
|---|---|---|
| `PricingProposal` | `status IN ('pending_approval', 'draft')` · `ORDER BY created_at DESC LIMIT 20` | Approval queue rows + `pending_approval` / `drafts` KPIs. `composer.py:58-70`. |
| `AbTest` | `status = 'running'` count | `ab_running` KPI. `composer.py:76-80`. |
| `Notification` | `user_id = ctx.user_id` · `external_id LIKE 'share:%'` · top 25 by `created_at DESC` | Shares list + `shares` KPI. `_share_notifications`, `composer.py:26-50`. The `share:{hash16}` external_id pattern is the contract — set by Frank's `actions._share_decision()`. |
| `AuditLog` | `ORDER BY created_at DESC LIMIT 15` | Recent audit chain. `composer.py:85-90`. The page slices `[:10]` again client-side (`MdOverviewPage.tsx:233`). |

### Response shape (the `MdOverview` TS interface, `MdOverviewPage.tsx:43-51`)

```
{
  header:        { title: string; sub: string; for_user: string },
  kpis:          Kpi[],                  // exactly 4 — see §4
  approvalQueue: { title; subtitle; rows: ProposalRow[] },
  shares:        { title; subtitle; rows: ShareRow[] },
  recentAudit:   AuditRow[],
  crossLinks:    { label; jumpTo }[],
  heuristic:     { label; rule },
}
```

KPI tone is one of `'positive' | 'warning' | 'info' | 'neutral'` (`MdOverviewPage.tsx:6-12`, validated server-side in `tests/contract/test_persona_overview.py:18`).

---

## 4. Top → bottom component roster

The page is a flat composition inside a single `<div className="w-full px-6 py-6">`. No sub-components in the feature folder — all sections are inline in `MdOverviewPage.tsx`.

| # | Section | Source lines | What it shows | Key interactions |
|---|---|---|---|---|
| 0 | Loading state | `MdOverviewPage.tsx:86` | `Loading…` muted line. | None. |
| 0 | Error state | `MdOverviewPage.tsx:87-93` | "MD overview unavailable: {message}" in red. | None. No retry button. |
| 1 | **Header eyebrow + title + sub** | `MdOverviewPage.tsx:97-105` | Eyebrow `MD WORKSPACE · READ-ONLY` (rose-deep, 11px caps). H1 from `data.header.title` (default "Managing Director — Overview"). Sub-paragraph from `data.header.sub`. `for_user` is fetched but **not rendered** on the page. | Read-only. |
| 2 | **KPI grid (4 tiles)** | `MdOverviewPage.tsx:107-117` | 2-col mobile / 4-col ≥sm. Each tile: 10.5px caps label · 26px display value (tabular-nums) · 11px muted sub. Tone drives background/border/text via `toneClass` + `toneText` maps (`:53-65`). Canonical keys (validated by contract test): `pending_approval`, `drafts`, `ab_running`, `shares`. | Read-only. No drill-in. |
| 2a | KPI: Pending approval | composer `:114-119` | Count of proposals where `status='pending_approval'`. Tone `warning` if > 0 else `neutral`. Sub: "proposals awaiting MD sign-off". | — |
| 2b | KPI: Draft proposals | composer `:120-126` | Count of `status='draft'`. Tone `info`. Sub: "Frank's current cycle". | — |
| 2c | KPI: A/B tests live | composer `:127-133` | Count of `AbTest.status='running'`. Tone `info`. Sub: "with pre-launch audit". | — |
| 2d | KPI: Shared with me | composer `:134-140` | Total `share:%` notifications for this user. Tone `warning` if any unread else `neutral`. Sub: "{n} unread". | — |
| 3 | **Approval queue card** | `MdOverviewPage.tsx:119-173` | 14px-radius white card. H2 `data.approvalQueue.title` + 12px subtitle. Empty state: dashed-border "No proposals in the queue." Otherwise a table. | — |
| 3a | Approval queue table | `:127-171` | Columns: Article · Current (right, tabular) · Proposed (right, tabular, bold) · Δ (right, color-coded — green if `delta_pp ≥ 0`, rose-deep else; formatted via `fmtPrice` `:74-77` and pp formatter `:148`) · Status badge + optional "requires MD" pill · Created (locale-date). Status badge style from `statusBadge` `:67-72`: `pending_approval`→Pending (amber), `draft`→Draft (slate), `approved`→Approved (green), else raw status. | Read-only. **No approve/reject actions on this screen** — Till must flip to Frank's view (per `composer.heuristic.rule`). |
| 4 | **Shares list card** | `MdOverviewPage.tsx:175-211` | "Shared with me — from Frank" card. Empty state: "No shared decisions yet." Otherwise a vertical `<ul>` of share rows. | — |
| 4a | Share row | `:184-209` | Unread rows get a rose-bg tint + 1.5px rose-deep dot prefix (aria-label="unread"). Title (13px semibold) + timestamp (10.5px muted, locale-string). 12.5px sub-paragraph. If `link` is set, renders a `react-router-dom` `<Link>` "Open audit trail →" (11px rose-deep). | Click `<Link>` navigates client-side to the share's `link` (typically `/action-center?focus=…`). No "mark read" mutation — read-only. |
| 5 | **Cross-links strip** | `MdOverviewPage.tsx:213-226` | One-row card. Left: "Cross-links →" label. Right: pill-shaped `<Link>`s for each `crossLinks[]` entry (h-9, 11px radius, hairline border). | Each link is a React Router `<Link to={l.jumpTo}>` — client-side navigation. Targets emit `?persona=till` so downstream screens can render the Till variant. |
| 6 | **Recent audit chain card** | `MdOverviewPage.tsx:228-246` | Only renders when `data.recentAudit.length > 0`. H2 "Recent audit chain" + 11px muted `data.heuristic.rule` as caption. `<ul>` of up to 10 rows. | — |
| 6a | Audit row | `:233-243` | 11.5px row, flex layout: 12-char hash prefix (monospace) · `kind` (semibold) · `target_id` · `actor_persona` (right-aligned) · `created_at` locale-string. Hairline divider between rows. | Read-only. No click-through to audit detail. |

---

## 5. Side panels / drawers / modals

**None.** The page mounts no drawers, modals, side panels, or popovers. The only outbound surface is the React Router `<Link>` in share rows + the cross-links strip, both of which navigate away.

There is no command palette, no scenario builder, no override entry flow, no methodology drawer on this page. It is intentionally narrow per the composer doc-string: "a KPI strip, a queue table, and a list of decisions Frank shared with them" (`composer.py:3-6`).

---

## 6. Tests covering this page

| Layer | Location | Count | Coverage |
|---|---|---|---|
| **Vitest unit** | `frontend-v2/src/tests/persona-overview/persona-pages.test.tsx:52-72` | 1 (shared file with `DealInboxPage`) | Mocks `@/lib/api/client.apiFetch`, asserts: H1 "Managing Director — Overview" renders, KPI labels, approval-queue row content (`200832-E`, `€4.10`, `€4.38`, `+6.83pp`, `Pending`, `requires MD`), share row link `href`, audit-hash prefix `deadbeef0102`. |
| **Pytest contract** | `scherzinger-platform/tests/contract/test_persona_overview.py:7-32` | 2 | `test_md_overview_shape`: status 200, required top-level keys, 4 canonical KPI keys + tone enum, `approvalQueue.rows` is list, every `crossLinks.jumpTo` starts with `/`. `test_md_overview_etag_round_trip`: GET returns ETag, second GET with `If-None-Match` returns 304. |
| **Playwright E2E** | none | 0 | No dedicated spec yet for `/md/overview`. |
| **Playwright visual** | none | 0 | No screenshot baselines for this route. |
| **Smoke / nav** | `frontend-v2/src/tests/action-center-cross-links.test.ts:33` | (tangential) | `/md/overview` listed as a known cross-link target — exercised only as a navigation destination. |

---

## 7. Open follow-ups

- **No retry on fetch error.** `MdOverviewPage.tsx:87-93` renders a flat red line if the BFF call fails. No retry button, no refetch hook. Compare with `OverrideLog` on the forecasting page which exposes a Retry.
- **`for_user` is fetched but never rendered.** `data.header.for_user` ("Till" fallback) is parsed into the type (`:46`) and emitted by the composer (`:110`) but no JSX consumes it. Likely intended for the H1 greeting; current H1 is the static composer-emitted title.
- **No persona gate on the endpoint.** `screens.py:388-393` intentionally allows any authenticated user to fetch `/md-overview` so Frank can preview Till's view. Front-end has no role check before mounting — `PersonaSwitcher.tsx:18` gates by `act.approve_md_authority` but anyone with the URL can reach the page.
- **No "mark share read" mutation.** Unread shares stay unread visually; there's no PATCH/POST from this screen. Read-state is owned by whatever Till opens via the share-link target.
- **No empty-state for the audit section.** When `recentAudit.length === 0`, the whole section is omitted (`:228`). No "audit log is empty" prompt.
- **Audit rows are non-interactive.** No click-through to a detailed audit drawer; the 12-char hash prefix is display-only.
- **No locale/i18n keys.** All strings (eyebrow, empty states, "Open audit trail →", "Cross-links →") are hardcoded English literals. The `?lang=` cookie is forwarded but only affects composer-emitted strings (which today are also hardcoded English in `composer.py:107-170`).
- **Approval queue is fixed at 20 rows.** No pagination, no "show more". Cap is server-side (`composer.py:65`).
- **Shares list is fixed at 25 rows.** Same — server cap (`composer.py:32`).
- **No loading skeleton.** `Loading…` is a single muted line, not a layout-preserving skeleton like `ForecastSkeleton` on the forecasting page.

---

## 8. Quick file map

```
frontend-v2/src/features/persona-overview/
├── MdOverviewPage.tsx            ← THIS PAGE — single-file feature (249 LOC)
└── DealInboxPage.tsx             ← Heiko's sibling page (out of scope here)

frontend-v2/src/
├── app/
│   ├── router.tsx                ← :30 lazy import · :69 persona landing · :109 route mount
│   └── layout/PersonaSwitcher.tsx ← :18 Till switcher entry (landing: /md/overview)
├── features/auth/Login.tsx       ← :92 post-login redirect to /md/overview when persona=till
├── lib/api/client.ts             ← apiFetch — used by useQuery in MdOverviewPage
└── tests/persona-overview/
    └── persona-pages.test.tsx    ← :52-72 the MD-overview unit test

scherzinger-platform/backend/
├── api/v1/screens.py             ← :381 GET /api/v1/screens/md-overview (ETag + 304)
└── services/persona_overview/
    ├── __init__.py
    └── composer.py               ← :57 build_md_overview(db, user_id, user_name)

scherzinger-platform/tests/contract/
└── test_persona_overview.py      ← :7 shape · :27 ETag round-trip
```
