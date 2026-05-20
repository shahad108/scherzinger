# Frontend AI Briefing Page — Reference

> Last updated: 2026-05-14. Mirrors the state of `forecast-redesign-v2` branch at HEAD `b9118b4`.
>
> Source of truth lives in `frontend-v2/src/features/ai-briefing/`. This document indexes every component the page can render, in render order, with data sources and interactions.

## 1. Entry point

| File | Role |
|---|---|
| `frontend-v2/src/features/ai-briefing/index.tsx` | Page shell. Fetches the full `AiShell` payload via `useAi()`, toggles `body.pz-fullbleed` on mount, and renders crumbs → page head → memo → 3-card grid → cross-links. Default-exported as `AiBriefingPage`; wired to route `/ai` in `frontend-v2/src/app/router.tsx:90` as `AiPage` (lazy-loaded). |

### URL parameters

The page component itself reads **no** URL params. The `useAi` hook accepts an optional `AiParams` object (`frontend-v2/src/lib/api/queryKeys.ts:67`) but the page calls `useAi()` with no arguments, so the BFF receives nothing from the client.

`AiParams = ShellParams = { persona?: Persona; lang?: 'de' | 'en' }`. The backend route additionally accepts `week?: string` (`scherzinger-platform/backend/api/v1/screens.py:357`) but nothing on this page reads/sets it today.

| Param | Default | Effect |
|---|---|---|
| `persona` | server-derived from `AuthContext.persona` | Picks the persona voice for the memo. Not passed by `AiBriefingPage`. |
| `lang` | none | `de` / `en`. Not passed by `AiBriefingPage`. |
| `week` | none | Backend-only; selects the briefing week. No client UI surfaces this. |

### Page-shell render order

```
crumb trail                    (data.header.crumbTrail)
page head                      (title · subPills · subStats · header.actions)
memo article                   (data.memo — title, fromLine, paragraphs[], signature)
3-card grid                    (data.sideCards[] — exactly 3 cards)
cross-links footer             (data.crossLinks[])
```

A `body.pz-fullbleed` class is applied for the page's lifetime (`useEffect` in `index.tsx:58`) so the global shell hides the right rail (`frontend-v2/src/styles/globals.css:97-101`).

### Data source

- Hook: `useAi(params?: AiParams)` in `frontend-v2/src/data/api/useAi.ts`.
- Endpoint: BFF `GET /screens/ai` (FastAPI `screens` router; route at `scherzinger-platform/backend/api/v1/screens.py:352`).
- Composer: `build_ai_briefing(user_id, persona, week, lang)` in `scherzinger-platform/backend/services/ai_briefing/composer.py:85` (Phase 9 live composition; `draft_memo` siblings).
- ETag / `Cache-Control: private, max-age=60` honored by the BFF; 304 supported.
- Returns `AiShell` (`frontend-v2/src/types/ai.ts:52`).
- TanStack Query: `queryKey = qk.ai(params)`, `staleTime = 60_000` ms.

### `AiShell` payload shape

```ts
AiShell {
  header:    AiHeader        // crumbTrail, title, subPills, subStats, actions
  memo:      AiMemo          // title, fromLine, paragraphs[], signature
  sideCards: AiSideCard[]    // exactly 3
  crossLinks: AiCrossLink[]
}
```

Full type definitions in `frontend-v2/src/types/ai.ts`.

---

## 2. Top → bottom component roster

| # | Component / block | Source | What it shows | Key interactions |
|---|---|---|---|---|
| 1 | **Crumb trail** | inline (`index.tsx:79-89`) | `data.header.crumbTrail[]` slash-joined. Final crumb is bolded `var(--ink-2)`; preceding crumbs are `var(--muted)`. | Read-only text. No links. |
| 2 | **Page head** | inline (`index.tsx:92-139`) | Display-font H1 (`data.header.title`). Sub-row of `subPills[]` (white pill chips) and `subStats[]` (soft-surface chips, `{value, label}` pair). Right side: action buttons. | Action buttons are **non-functional** (no `onClick`); each row renders `actionIcon(a.id)` + `a.label`. Icon picks: `id==='forward'` → `Forward`, `'pdf'` → `FileText`, `'email'` → `Send`. `a.primary` styles in rose; otherwise white outline. `a.toast` field exists in payload but is unused. |
| 3 | **Memo article** | inline (`index.tsx:142-163`) | White card, 4px rose left-border, `var(--shadow-card)`. Header: `data.memo.title` (display 20px) + thin-rule `fromLine`. Body: each `paragraph.html` rendered via `dangerouslySetInnerHTML` (allows `<b>` etc.), followed by a `SourcesRow` of citation chips. Footer: italic `data.memo.signature` above a thin rule. | Citation chips link via `<Link to={c.jumpTo}>` (React Router). Read-only otherwise. |
| 4 | **SourcesRow** | inline (`index.tsx:17-40`) | Renders only when `citations.length > 0`. Label "SOURCES →" then one chip per citation. Chip tone keyed by `c.kind` (5 kinds — see Citation palette below). | `<Link>` to `c.jumpTo`. `data-citation-kind={c.kind}` attribute set for testing. |
| 5 | **Side-card grid** | inline (`index.tsx:166-213`) | `grid-cols-1 lg:grid-cols-3`. One card per `data.sideCards[]` item. Card header: title (display 13.5px) + optional `tag` chip (amber/green/violet — see tag palette). Body alternatives: `bullets[]` (rose-bullet list, each bullet's `html` + per-bullet `SourcesRow`) **or** `body` plain prose (`bodyItalic` flag) + a single `SourcesRow` from `c.citations`. | Citations inside bullets / body link out via React Router. |
| 6 | **Cross-links footer** | inline (`index.tsx:216-229`) | White card, label "Cross-links →" plus one outline pill per `data.crossLinks[]` entry (label + jumpTo). | `<Link>` per entry. |

### Citation palette (chip tones by `AiCitation.kind`)

| Kind | Background | Foreground | Border |
|---|---|---|---|
| `article` | `--rose-bg` | `--rose-deep` | `--rose-border` (fallback `--rose-bg`) |
| `customer` | `--surface-soft` | `--ink-2` | `--hairline` |
| `cluster` | `--amber-bg` | `--amber` | `--amber-border` |
| `recommendation` | `--green-bg` | `--green` | `--green-border` |
| `ab_test` | `--violet-bg` | `--violet` | `--violet-bg` |

Defined in `index.tsx:9-15`.

### Side-card `tag.tone` palette

| Tone | Background | Foreground |
|---|---|---|
| `amber` | `--amber-bg` | `--amber` |
| `green` | `--green-bg` | `--green` |
| `violet` | `--violet-bg` | `--violet` |

Defined in `index.tsx:42-46`.

### Side-card kinds (`AiSideCard.kind`)

Backend-tagged identifiers — the UI does not branch on `kind`, but the contract uses these three values: `changed`, `selfCorrection`, `voice` (`frontend-v2/src/types/ai.ts:34`).

---

## 3. Side panels / drawers / modals

**None.** The AI Briefing page renders no drawers, no modals, and no side panels.

- Header `actions` (e.g. "Forward", "PDF", "Email") are stubs: buttons render but have no click handlers; `action.toast` strings in the payload are never displayed.
- All citation chips and cross-link pills navigate via `<Link>` to other routes (`/margin?cluster=...`, `/pricing?aid=...`, `/action-center?focus=rec-...`, etc.) rather than opening in-page surfaces.
- Loading state replaces the entire page with `AiBriefingSkeleton` (`components/AiBriefingSkeleton.tsx`); error state shows a single red text line in place of the page body (`index.tsx:68-74`).

---

## 4. Tests

| Layer | Location | Count | Coverage |
|---|---|---|---|
| **Vitest unit** | `frontend-v2/src/tests/ai-briefing/citations.test.tsx` | 1 file, 2 tests | (a) `Sources →` rows render under each memo paragraph; chip `<Link>` `href` matches `jumpTo`; `data-citation-kind` attribute set per chip. (b) Citation chips render on side-card `bullets[]` **and** on side-card `body` prose. Mocks `useAi` via `vi.hoisted`; wraps in `MemoryRouter` + `QueryClientProvider`. |
| **Playwright E2E** | — | 0 | No E2E coverage for `/ai`. |
| **Playwright visual** | — | 0 | No visual baselines. |
| **Pytest (backend)** | `scherzinger-platform/tests/contract/test_ai_briefing.py` | (backend contract) | Out of scope for this doc; covers `/screens/ai` payload shape. |

---

## 5. Open follow-ups

- **Header actions are wired in payload only** — `header.actions[].toast` and the `onClick` for Forward / PDF / Email are unimplemented. The buttons render but do nothing.
- **`week` / `persona` / `lang` query params** — accepted by `useAi()` and the BFF but no in-page UI exists to set them. The page calls `useAi()` with no args, so the only switching point is `AuthContext.persona` server-side.
- **`dangerouslySetInnerHTML`** — used for memo paragraphs (`index.tsx:155`) and side-card bullets (`index.tsx:194`). Trust boundary: BFF-controlled HTML only; no user input. Compare the forecasting page's Phase 9 cleanup (`HeroForecast` movers were migrated off `dangerouslySetInnerHTML` in commit `38a8144`); the AI Briefing memo body has not had the same treatment.
- **No deep-link banner / `source` back-pill** — unlike the forecasting page, AI Briefing has no inbound-deep-link affordance even though citation chips leave the page constantly.
- **No E2E or visual test coverage** — only the citations-chip unit test exists.
- **Crumb trail is text-only** — preceding crumbs are not links; there is no way to navigate from the crumb segments.

---

## 6. File map

```
frontend-v2/src/features/ai-briefing/
├── index.tsx                              ← page shell (crumbs · head · memo · cards · cross-links)
└── components/
    └── AiBriefingSkeleton.tsx             ← loading skeleton (memo + 3 side cards)

frontend-v2/src/data/api/
└── useAi.ts                               ← TanStack Query hook, GET /screens/ai

frontend-v2/src/types/
└── ai.ts                                  ← AiShell · AiHeader · AiMemo · AiSideCard · AiCitation

frontend-v2/src/lib/api/
└── queryKeys.ts                           ← qk.ai(params) · AiParams (= ShellParams)

frontend-v2/src/app/
└── router.tsx                             ← lazy-import AiPage; routes /ai

frontend-v2/src/styles/
└── globals.css                            ← body.pz-fullbleed rules (right rail hidden on /ai)

frontend-v2/src/tests/ai-briefing/
└── citations.test.tsx                     ← Vitest, 2 tests, mocks useAi

scherzinger-platform/backend/
├── api/v1/screens.py                      ← GET /screens/ai (lines 352-378)
├── schemas/screens/ai.py                  ← AiShell pydantic schema
└── services/ai_briefing/
    ├── __init__.py                        ← exports build_ai_briefing, draft_memo
    └── composer.py                        ← build_ai_briefing(user_id, persona, week, lang)
```
