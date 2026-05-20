# frontend-v2 environment variables

All variables are read at build time by Vite. Reload the dev server after
changing `.env.local`.

| Variable | Required | Default | Purpose |
|---|---|---|---|
| `VITE_SCHERZINGER_API` | no | _unset_ | Base URL of the Scherzinger BFF (screens layer). When unset, `apiFetch` resolves from bundled mocks. Example: `http://localhost:8000/api/v1/screens`. |
| `VITE_API_VERSION` | yes | `v1` | API contract version pinned by this build. Sent as `X-Pryzm-Api-Version` once the auth phase ships. |
| `VITE_ALLOW_MOCK_FALLBACK` | no | `0` | When `VITE_SCHERZINGER_API` is set, setting this to `1` lets `apiFetch` fall back to the bundled mock for a path that returns `404` / `503` or a network error. **Must be `0` in production.** |
| `VITE_DEFAULT_USER` | no | `frank` | Demo/staging fixture: which persona to auto-log-in until Phase 2 auth ships. One of `frank` / `till` / `heiko`. |
| `VITE_SENTRY_DSN` | no | _unset_ | Sentry DSN for browser error reporting. Leave empty to disable. |
| `VITE_FEATURE_FLAGS_URL` | no | _unset_ | Unleash-compatible flag-service URL. Empty falls back to the static `features[]` returned by `/api/v1/me`. |

## Mode summary

| Scenario | `VITE_SCHERZINGER_API` | `VITE_ALLOW_MOCK_FALLBACK` | Effect |
|---|---|---|---|
| Local UI work, no backend | _unset_ | _ignored_ | Pure mock mode. |
| Backend partially live | set | `1` | Real where implemented, mock where 404/503. |
| Production | set | `0` | Real only; 404 surfaces to user. |

## Adding a new variable

1. Append it to `.env.example` with a comment explaining purpose.
2. Document it in the table above.
3. Read it via `import.meta.env.VITE_*` only inside `src/lib/config.ts`
   (to be created in Phase 2). Do not sprinkle `import.meta.env` reads
   across feature code.
