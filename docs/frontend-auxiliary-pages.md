# Frontend Auxiliary Pages — Reference

> Last updated: 2026-05-14. Mirrors the state of `demo-phase45` branch at HEAD `5545956`.
>
> Bundles the four small Pryzm screens that don't warrant their own reference file: the unauthenticated `/login` shell, plus the three short post-auth utility pages (`/notifications`, `/notes`, `/deal/inbox`). Each gets its own H2; cross-page concerns are pulled out at the bottom.
>
> All four are wired up in `frontend-v2/src/app/router.tsx`. Login lives at the top level outside `RequireAuth`; the other three live inside the authenticated `<Shell>` layout.

## 1. Overview / why these are bundled

| Page | Lines | Components beyond the page file | Why it's small |
|---|---|---|---|
| `/login` | `Login.tsx:98` | none | Single auth form + persona-aware redirect |
| `/notifications` | `NotificationsPage.tsx:90` | none (one inline `ToneIcon`) | Paginated list pulled from `/notifications` BFF |
| `/notes` | `NotesPage.tsx:114` | none | CRUD journal over `/notes` BFF |
| `/deal/inbox` | `DealInboxPage.tsx:228` | none | Read-only Heiko Sales landing, composed entirely from `/screens/deal-inbox` BFF payload |

None of these pages spawn drawers, modals, or charting libraries. They live in 2–3 sibling files (`Login`, `RequireAuth`, `RequirePermission`) under `frontend-v2/src/features/auth/`, `frontend-v2/src/features/settings/` (Notifications + Notes), and `frontend-v2/src/features/persona-overview/` (DealInbox). They share the data hooks in `frontend-v2/src/data/api/useAuth.ts`, `useSettings.ts`, `useShellMutations.ts`, and `useMe.ts`. There are no Playwright specs for any of them.

Mount routes (from `frontend-v2/src/app/router.tsx:71`–`118`):

```
/login                    → LoginPage                       (no auth guard)
/                         → <RequireAuth><Shell/></RequireAuth>
  ├ /notifications        → NotificationsPage   (lazy chunk)
  ├ /notes                → NotesPage           (lazy chunk)
  └ /deal/inbox           → DealInboxPage       (lazy chunk)
```

`RequireAuth` (`frontend-v2/src/features/auth/RequireAuth.tsx:13`) is the single gate. It calls `useMe()`; on error it `Navigate`s to `/login?next=<encoded-path>`, which `Login` reads back.

---

## 2. `/login` — LoginPage

| File | Role |
|---|---|
| `frontend-v2/src/features/auth/Login.tsx` | Page shell. Renders the demo login card, owns the `react-hook-form` + `zod` validation, posts via `useLogin`, dispatches the post-auth redirect. |
| `frontend-v2/src/features/auth/RequireAuth.tsx` | Wraps every authenticated route. Reads `useMe()`; on error redirects here with `?next=`. |
| `frontend-v2/src/features/auth/RequirePermission.tsx` | RBAC wrapper used inside features (not on this page); shipped from the same folder for completeness. |

### URL parameters (read by `LoginPage`)

| Param | Default | Effect |
|---|---|---|
| `next` | — | Path the user was originally headed to before `RequireAuth` bounced them. On successful login the page does `navigate(next ?? defaultLandingFor(persona))`. URL-encoded. |

There are no other params. The page does **not** read persona/cluster/etc. — persona is derived from the authenticated `MeUser`, not from the URL.

### Data source

- Hook: `useLogin()` in `frontend-v2/src/data/api/useAuth.ts:7` — TanStack `useMutation`.
- Endpoint: `POST /auth/login` (FastAPI `auth` router, `scherzinger-platform/backend/api/v1/auth.py:106`). Sets three cookies on success: `pryzm_at` (access JWT, http-only), `pryzm_rt` (refresh JWT, http-only), `pryzm_csrf` (double-submit, JS-readable). Login itself is CSRF-exempt; all subsequent POST/PATCH/DELETE require `x-csrf` echoing the cookie.
- Mock-mode fallback (`useAuth.ts:13`–`19`): when `VITE_SCHERZINGER_API` is unset, the hook resolves from `frontend-v2/src/data/mocks/me.json` if and only if the email/password match `frank@scherzinger.de` / `frank-demo-2026`; otherwise it throws `"Ungueltige Demo-Anmeldedaten"`.
- On success: `useAuthStore.setUser(me)`, `qc.setQueryData(qk.me, me)`, `qc.invalidateQueries()`. Page then calls `analytics.identify` + `analytics.track('login', { persona })` (`Login.tsx:37`–`38`) and redirects.

### Component roster

| File | What it shows | Interactions |
|---|---|---|
| `frontend-v2/src/features/auth/Login.tsx:47`–`87` | Single card: `<h1>Pryzm — Anmeldung</h1>` · email input (autofocus, `autoComplete="username"`) · password input (`autoComplete="current-password"`) · `role="alert"` error div (`pz-login-error`) · submit button with `isPending` label `Anmeldung läuft…` · `pz-login-hint` block listing all three demo creds (frank/till/heiko). | Submit → `handleSubmit(onSubmit)`. Validation: `z.object({ email: z.string().email(...), password: z.string().min(1) })`. On error stays open with inline alert; on success redirects. |
| `frontend-v2/src/features/auth/Login.tsx:89`–`98` | `defaultLandingFor(persona)` helper. | `till` → `/md/overview`, `heiko` → `/deal/inbox`, otherwise (frank/default) → `/action-center`. |

### Side panels / drawers / modals

None.

### Auth-redirect behaviour

- Already-authenticated users hitting `/login` directly: `Login.tsx:24` short-circuits with `<Navigate to={defaultLandingFor(user.ui_persona)} replace />` so they bounce to their persona home.
- After mutation success the redirect honours `?next=` first; if absent it falls back to the persona default.

### Tests

| Layer | Location | Count | Notes |
|---|---|---|---|
| Vitest unit | — | 0 | No frontend test covers `LoginPage` directly. |
| Pytest backend | `scherzinger-platform/tests/contract/test_auth.py` | 14 | Includes `test_login_round_trip`, `test_login_personas` (per-persona shape), `test_login_with_bad_credentials_401`, `test_login_with_unknown_user_401`, `test_refresh_rotates_token`, `test_logout_clears_cookies`, `test_csrf_blocks_post_without_header`, `test_login_is_csrf_exempt`, `test_screens_require_auth`, `test_screens_version_is_exempt`. |

### Open follow-ups

- No client-side test for the page (form validation, persona-routing branch, `?next=` round-trip, already-authed redirect).
- Hard-coded demo credentials are baked into the visible hint block — needs a non-demo build-flag.
- Sign-up / password-reset paths do not exist; back-end has no endpoint either.

---

## 3. `/notifications` — NotificationsPage

| File | Role |
|---|---|
| `frontend-v2/src/features/settings/NotificationsPage.tsx` | Full paginated list of every notification for the logged-in user. Renders inside `<Shell>`; the shell's right-rail unread dot deep-links here. |

### URL parameters (read by `NotificationsPage`)

None. Pagination state (`cursor`) is local React state via `useState<string | undefined>`.

### Data source

- Hook: inline `useQuery({ queryKey: ['notifications', 'page', cursor ?? 'first'], queryFn: () => apiFetch<NotificationsResponse>('/notifications', { params: { limit: 50, cursor } }), staleTime: 30_000 })` (`NotificationsPage.tsx:30`).
- Mutation: `useMarkNotificationRead()` in `frontend-v2/src/data/api/useShellMutations.ts:12` — `POST /notifications/{id}/read`; on success invalidates `qk.shell()` so the shell rail's unread badge drops.
- Endpoint: `GET /notifications?limit&cursor` (FastAPI `shell` router, `scherzinger-platform/backend/api/v1/shell.py:41`). Cursor-paginated by `created_at DESC`; default limit 50, cap 200.
- Response shape: `{ notifications: NotificationRow[], next_cursor: string | null }` where each row is `{ id, tone: 'ok'|'warn'|'info', title, sub, unread, created_at }`.

### Component roster

| File | What it shows | Interactions |
|---|---|---|
| `NotificationsPage.tsx:22`–`26` (`ToneIcon`) | One of `CheckCircle2` (green, `ok`), `AlertTriangle` (amber, `warn`), `Activity` (violet, `info`) — all 14px lucide icons. | Read-only. |
| `NotificationsPage.tsx:44`–`88` (page body) | Heading "All notifications" · empty-state "No notifications." · list of rounded cards, unread rows get `border-[var(--rose)]`. Each card: icon · title (semibold) · sub · localized `created_at`. Unread rows render a `Mark read` button. Footer: `Load more` button (only when `next_cursor`). | **Mark read** → `markRead.mutate(n.id)` (invalidates shell). **Load more** → `setCursor(data.next_cursor)`. |

### Side panels / drawers / modals

None.

### Tests

| Layer | Location | Count | Notes |
|---|---|---|---|
| Vitest unit | — | 0 | No dedicated test. `frontend-v2/src/tests/shell/RightRail.test.tsx` exercises `useMarkNotificationRead` indirectly via the rail. |
| Pytest backend | (inherited shell tests) | — | List + mark-read flow lives in `scherzinger-platform/tests/contract/test_shell_mutations.py` and the shell endpoint tests. |

### Open follow-ups

- No filter chips by tone (ok/warn/info) and no "Mark all read".
- Loading state is a flat `"Loading…"` string with no skeleton.
- Page does not consume `next_cursor` URL state — refresh loses pagination position.

---

## 4. `/notes` — NotesPage

| File | Role |
|---|---|
| `frontend-v2/src/features/settings/NotesPage.tsx` | Per-user notes journal. Compose form on top, searchable list below, pin/unpin and delete per row. |

### URL parameters (read by `NotesPage`)

None. Search query (`q`) and the in-progress draft (`draftTitle`, `draftBody`) are all local React state.

### Data source

Hooks all in `frontend-v2/src/data/api/useSettings.ts`:

- `useNotes(q?)` — `useSettings.ts:141` — `GET /notes?q=…` (TanStack query, `staleTime: 30_000`). Returns `{ items: Note[] }` where `Note = { id, title: string|null, body, pinned, created_at, updated_at }`.
- `useCreateNote()` — `useSettings.ts:150` — `POST /notes` with `{ title?, body, pinned? }`. Invalidates `['notes']`.
- `usePatchNote()` — `useSettings.ts:159` — `PATCH /notes/{id}` with any subset of `{ title, body, pinned }`. CSRF-aware via `patchJson` helper (`useSettings.ts:37`).
- `useDeleteNote()` — `useSettings.ts:168` — `DELETE /notes/{id}`, raw `fetch` (since `postJson` is POST-only); reads `pryzm_csrf` cookie and echoes it in `x-csrf`. Invalidates `['notes']`.
- Endpoint: FastAPI `notes` router (`scherzinger-platform/backend/api/v1/notes.py:17`) — `prefix=/notes`. Routes: `GET ""`, `POST ""` (201), `PATCH /{note_id}`, `DELETE /{note_id}`.

### Component roster

| File | What it shows | Interactions |
|---|---|---|
| `NotesPage.tsx:32`–`58` ("New note" section) | Title input (optional) · 3-row textarea · "Save note" rose button. | **Submit** → `create.mutate({ title, body }, { onSuccess: () => clear both drafts })`. Button disabled while `create.isPending` or both drafts empty. |
| `NotesPage.tsx:60`–`111` ("Your notes" section) | Section header with right-aligned `type="search"` input bound to `q`. Loading / empty / list states. Each row: pin toggle (lucide `Pin`, rose-deep when pinned) · title (if any, semibold) · body (`whitespace-pre-wrap`) · `updated_at` localized · delete button (lucide `Trash2`). | **Pin/Unpin** → `patch.mutate({ id, body: { pinned: !n.pinned } })`. **Delete** → `remove.mutate(n.id)`. **Search** is debounced via TanStack staleTime + the `q` queryKey rather than explicit debounce. |

### Side panels / drawers / modals

None.

### Tests

| Layer | Location | Count | Notes |
|---|---|---|---|
| Vitest unit | — | 0 | No dedicated test for the page or any of the four note hooks. |
| Pytest backend | `scherzinger-platform/tests/contract/test_p14_settings.py` | 1 (`test_notes_crud` at line 91) | Full CRUD round-trip (create → list → patch pinned → delete). |

### Open follow-ups

- No edit-in-place for title/body — patch only flips `pinned`. Editing requires backend `PATCH` plumbing but no UI for it.
- No optimistic update on pin/delete; UI waits for the round-trip and invalidate.
- No keyboard shortcuts (Cmd-Enter to save, etc.).
- Pinned notes do not float to the top — list order follows BFF (`updated_at DESC`).

---

## 5. `/deal/inbox` — DealInboxPage

| File | Role |
|---|---|
| `frontend-v2/src/features/persona-overview/DealInboxPage.tsx` | Heiko Sales's persona landing. Read-only header + KPI grid + shares list + lost-quote gap card + cross-link strip + recent-recommendations list. Entire page hydrates from one BFF call. |

This is the default route for the `heiko` persona (`personaRoutes.heiko.default = '/deal/inbox'` in `router.tsx:78`). Frank/Till users *can* reach it via direct nav (no per-route RBAC) but the data is scoped to the caller via `require_auth`.

### URL parameters (read by `DealInboxPage`)

None. No `?focus`, `?cluster`, `?persona` etc. The page is intentionally a read-only summary; deep-links into individual recs go through `crossLinks` and the per-share `link` field.

### Data source

- Hook: inline `useQuery({ queryKey: ['deal-inbox'], queryFn: () => apiFetch<DealInbox>('/screens/deal-inbox'), staleTime: 60_000 })` (`DealInboxPage.tsx:77`).
- Endpoint: `GET /screens/deal-inbox` (FastAPI `screens` router, `scherzinger-platform/backend/api/v1/screens.py:407`). Composer: `build_deal_inbox` in `scherzinger-platform/backend/services/persona_overview/composer.py`. Supports ETag (304) — see backend tests `test_deal_inbox_etag_round_trip`.
- Response shape — declared inline as `interface DealInbox` (`DealInboxPage.tsx:47`–`60`):

```
header:     { title, sub, for_user }
kpis:       Kpi[]               // { key, label, value, sub, tone: 'positive'|'warning'|'info'|'neutral' }
shares:     { title, subtitle, rows: ShareRow[] }
lostQuote:  { title, subtitle, overall: GapOverall|null, byYear: GapByYear[] }
recentRecs: RecRow[]
crossLinks: { label, jumpTo }[]
heuristic:  { label, rule }
```

### Component roster

All UI is inline. Sections in render order:

| # | File:line | What it shows | Interactions |
|---|---|---|---|
| 1 | `DealInboxPage.tsx:94`–`102` (header) | Eyebrow "Sales workspace · read-only" (violet) · `data.header.title` (26px display) · `data.header.sub`. | Read-only. |
| 2 | `DealInboxPage.tsx:104`–`114` (KPI grid) | 2-col / sm:3-col grid of tiles. Each tile colour-coded via `toneClass` / `toneText` maps (`DealInboxPage.tsx:62`–`74`): positive=green, warning=amber, info=soft, neutral=white. Shows label · 26px value · sub. | Read-only. |
| 3 | `DealInboxPage.tsx:116`–`149` (shares card) | "Shared with me" / similar title. Per-row: violet unread dot + title · timestamp · sub line · optional `Open audit trail →` `<Link>` to `s.link` (typically `/action-center?focus=rec-…`). Empty state: dashed "No shared decisions yet. Frank's outbound shares land here." | **Click "Open audit trail"** → react-router `<Link>` navigation. |
| 4 | `DealInboxPage.tsx:151`–`193` (lost-quote gap card) | Title + sub. If `overall` present: 3-tile sub-grid `Median gap` (amber, `…pp`) · `Mean gap` (ink, `…pp`) · `Linked lines` (n). If absent: amber dashed "Linkage data unavailable." Below: 4-col per-year tiles (`year`, median `…pp`, `n=…`). | Read-only. |
| 5 | `DealInboxPage.tsx:195`–`208` (cross-link strip) | "Cross-links →" label + chip row of `<Link>`s built from `data.crossLinks`. Typical link: `Quotes → /quotes?persona=heiko`. | Click chip → react-router nav. |
| 6 | `DealInboxPage.tsx:210`–`225` (recent recs) | Only renders when `data.recentRecs.length > 0`. Title + `heuristic.rule` sub. List (max 10): truncated id (`r.id.slice(0,8)`, mono) · title · optional cluster chip (amber) · status (right-aligned). | Read-only. |

### Loading / error states

- Loading: `"Loading…"` (`DealInboxPage.tsx:83`).
- Error: `Deal inbox unavailable: <message>` in red (`DealInboxPage.tsx:84`–`90`).

### Side panels / drawers / modals

None.

### Tests

| Layer | Location | Count | Notes |
|---|---|---|---|
| Vitest unit | `frontend-v2/src/tests/persona-overview/persona-pages.test.tsx` | 1 (page-level, in a 2-test suite shared with `MdOverviewPage`) | `describe('DealInboxPage (Phase 12)') · it('renders KPIs, shares, lost-quote gap headline + by-year, and recent recs')` — mocks `apiFetch`, asserts KPI tile copy, lost-quote median/mean/n, by-year tiles, share row link, recent-rec cluster chip. |
| Pytest backend | `scherzinger-platform/tests/contract/test_persona_overview.py` | 2 (deal-inbox specific): `test_deal_inbox_shape` (line 35), `test_deal_inbox_etag_round_trip` (line 49). |

### Open follow-ups

- No write actions for Heiko at all — page is intentionally read-only by mandate, but the BFF exposes share-acknowledge etc. that has no UI.
- The recent-recs list has no pagination or filter; capped at first 10 client-side.
- Loading skeleton is plain text; should mirror the visual structure.
- No `?focus=` param to scroll to a particular share when arriving from a notification.

---

## 6. Cross-page shared components

There are no cross-page components specific to these four screens — they are otherwise independent. Indirect dependencies:

| Component | File | Used by |
|---|---|---|
| `RequireAuth` | `frontend-v2/src/features/auth/RequireAuth.tsx:13` | Wraps the entire authenticated tree, so it gates Notifications, Notes, and DealInbox (but **not** Login itself). Redirects to `/login?next=…`. |
| `RequirePermission` | `frontend-v2/src/features/auth/RequirePermission.tsx:17` | Same folder as Login; not actually used on any of these four pages. Listed here because it's a sibling of `RequireAuth` and shares `useAuthStore` / `hasPermission`. |
| `useMe` | `frontend-v2/src/data/api/useMe.ts:7` | Read by `RequireAuth` to decide whether to render the Shell. Also hydrates `useAuthStore` on mount. |
| `useAuthStore` | `frontend-v2/src/stores/authStore.ts:13` | Holds `MeUser { id, name, email, ui_persona, roles[], permissions[] }`. Login writes it; the other three pages read it transitively (via the shell, not directly). |
| `apiFetch` / `postJson` / inline `patchJson` | `frontend-v2/src/lib/api/client.ts` + `useSettings.ts:37` | All four pages route every request through these helpers. CSRF token (`pryzm_csrf` cookie) is read and echoed in `x-csrf` for non-GET. |

`Shell` (`frontend-v2/src/app/layout/Shell.tsx`) renders the persistent nav, the right-rail (which carries the unread notifications badge), and `<Outlet>` for the three authenticated pages. Login is a leaf route — no Shell, no `<Outlet>`.

---

## 7. Tests roundup

| Page | Vitest unit | Pytest contract | Playwright |
|---|---|---|---|
| `/login` | 0 | 14 (`test_auth.py`) | 0 |
| `/notifications` | 0 | covered by `test_shell_mutations.py` + the shell endpoint tests (not a dedicated file) | 0 |
| `/notes` | 0 | 1 (`test_notes_crud` in `test_p14_settings.py:91`) | 0 |
| `/deal/inbox` | 1 (in `persona-pages.test.tsx`) | 2 (`test_persona_overview.py:35`, `:49`) | 0 |

No Playwright spec exists for any of these screens. The shell-level unit tests (`Shell.test.tsx`, `RightRail.test.tsx`) exercise the notification mark-read mutation indirectly.

---

## 8. Open follow-ups (page-spanning)

- **Add Playwright E2E** for at least the login → persona-redirect → /me round-trip; today only the backend contract is tested.
- **Add a Vitest unit test for `LoginPage`** covering form validation, error rendering, `?next=` redirect, already-authed short-circuit, and analytics calls.
- **Add Vitest unit for `NotesPage`** — the only data-mutating page with zero frontend tests. Pin/delete are easy mistakes to regress.
- **Add Vitest unit for `NotificationsPage`** — empty-state, mark-read invalidation, cursor pagination.
- **Persist Notifications pagination in URL** (`?cursor=`) so refresh doesn't drop position.
- **Edit-in-place for Notes** — backend already supports `PATCH /notes/{id}` with title/body, no UI surfaces it.
- **DealInbox `?focus=` deep-link** mirroring Action Center's pattern so notifications can land on a specific share.
- **Pinned-notes sort** — surface pinned first; today the BFF only orders by `updated_at DESC`.

---

## 9. Quick file map

```
frontend-v2/src/app/
└── router.tsx                                ← /login, /notifications, /notes, /deal/inbox mount points

frontend-v2/src/features/auth/
├── Login.tsx                                 ← /login page (98 lines)
├── RequireAuth.tsx                           ← guard for the authenticated tree
└── RequirePermission.tsx                     ← sibling RBAC gate (used elsewhere)

frontend-v2/src/features/settings/
├── NotificationsPage.tsx                     ← /notifications (90 lines)
└── NotesPage.tsx                             ← /notes (114 lines)

frontend-v2/src/features/persona-overview/
└── DealInboxPage.tsx                         ← /deal/inbox (228 lines)

frontend-v2/src/data/api/
├── useAuth.ts                                ← useLogin / useLogout (mock + real)
├── useMe.ts                                  ← /me hydration for RequireAuth
├── useSettings.ts                            ← useNotes / useCreateNote / usePatchNote / useDeleteNote
└── useShellMutations.ts                      ← useMarkNotificationRead

frontend-v2/src/stores/
└── authStore.ts                              ← MeUser, setUser, hasPermission

frontend-v2/src/tests/
└── persona-overview/persona-pages.test.tsx   ← only frontend test (DealInbox + MdOverview)

scherzinger-platform/backend/api/v1/
├── auth.py                                   ← /auth/login, /auth/logout, /auth/refresh, /me
├── shell.py                                  ← GET /notifications, POST /notifications/{id}/read
├── notes.py                                  ← /notes CRUD
└── screens.py                                ← GET /screens/deal-inbox (composer in services/persona_overview/composer.py)

scherzinger-platform/tests/contract/
├── test_auth.py                              ← 14 tests
├── test_persona_overview.py                  ← 7 tests total (4 md, 2 deal-inbox, 1 shared)
└── test_p14_settings.py                      ← 12 tests (1 is test_notes_crud)
```
