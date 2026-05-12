# Contributing to frontend-v2

This file is the working contract for everyone (humans and agents) committing to
`frontend-v2/`. The full migration roadmap lives in
[`MIGRATION_PLAN.md`](./MIGRATION_PLAN.md); read that first if you are picking
up a multi-step task.

## Scope

frontend-v2 is the new TypeScript / React 19 / Vite / TanStack Query / Zustand /
Tailwind 4 application. Frank's persona is the only one with implemented
screens today. Till and Heiko screens land in Phase 10 / 11.

The legacy `frontend/` tree is untouched and ships separately from `dist-demo/`.
Do not modify it from inside this directory.

## Commit conventions

Use Conventional Commit prefixes scoped to one area:

`<type>(<area>): <imperative summary>`

### Allowed types

- `feat`     — new user-visible behaviour
- `fix`      — bug fix
- `chore`    — non-functional housekeeping (deps, configs, scripts)
- `docs`     — documentation only
- `test`     — tests only
- `refactor` — internal change, no behaviour change
- `perf`     — performance improvement

### Allowed areas

| Area            | Covers                                                      |
|-----------------|-------------------------------------------------------------|
| `shell`         | `src/app/layout/*`, providers, router, top bar, right rail  |
| `action-center` | `/action-center` feature                                    |
| `margin`        | `/margin` feature                                           |
| `quotes`        | `/quotes` feature                                           |
| `forecast`      | `/forecasting` feature                                      |
| `studio`        | `/pricing` (Pricing Studio) feature                         |
| `ai`            | `/ai` feature                                               |
| `auth`          | login, JWT, `/me`, RBAC                                     |
| `bff`           | backend-for-frontend endpoints under `/api/v1/screens/*`    |
| `infra`         | CI, docker, env, scripts, monorepo plumbing                 |
| `i18n`          | translation files and locale plumbing                       |
| `tests`         | shared test fixtures, harnesses                             |

Examples:

- `feat(action-center): wire Accept action to /actions/accept_recommendation`
- `fix(shell): collapse right rail when viewport < 1280px`
- `chore(infra): add husky + lint-staged`

## Branching

Work on focused branches off `main`. Long-running phase work uses
`epic/phase-<n>-<theme>` (e.g. `epic/phase-1-bff`). Atomic feature branches
land via PR with at least one reviewer.

## Test policy

- **Unit / component**: every new component or hook needs a vitest under
  `src/tests/` exercising the happy path plus one failure mode.
- **Mock fidelity**: tests must use `apiFetch` against the bundled mocks under
  `src/data/mocks/*.json`. Do not reach into `fetch` directly.
- **Contract**: backend contract tests under
  `scherzinger-platform/tests/contract/` validate that real endpoints return
  the same shape as the bundled mocks. Adding a new screen field requires
  updating the mock AND the OpenAPI schema in the same PR.
- **Smoke**: `src/tests/smoke.test.tsx` must continue to render the Shell + all
  six routes without throwing.

Tests run on every PR via CI; failing tests block merge.

## Screenshot regression policy

UI work that materially changes layout requires a before/after screenshot in
the PR description. Take screenshots at 1440×900 (desktop) and, for
Heiko-impacting work, 414×844 (mobile). Use the `/Pryzm_Dashboard_Mockup_Frank.html`
mockup as the reference for Frank-only changes.

## Code style

- TypeScript strict; no `any` without an inline `// reason: ...` comment.
- All numeric formatting goes through `src/lib/format.ts` (`fmt.eur`, `fmt.pct`,
  `fmt.num`, `fmt.signedPct`). Do not hand-format numbers inline.
- All API access goes through `src/lib/api/client.ts` (`apiFetch`). No direct
  `fetch()` in feature code.
- Hooks use the typed query-key factory in `src/lib/api/queryKeys.ts`.
- Tailwind 4 utilities only; no inline styles unless dynamic.

ESLint + Prettier run via `npm run lint` and `npm run format`. Pre-commit hooks
(husky + lint-staged) auto-fix touched files.

## Getting started

```bash
cd frontend-v2
cp .env.example .env.local      # configure VITE_SCHERZINGER_API etc.
npm install
npm run dev                     # http://localhost:5173
```

Or boot the full stack from repo root:

```bash
docker compose -f docker-compose.dev.yml up
```

See [`docs/env.md`](./docs/env.md) for the env-variable reference.
