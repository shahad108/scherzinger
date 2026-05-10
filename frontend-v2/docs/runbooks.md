# Operational runbooks — Phase 15

Each section is a one-pager: trigger, diagnostic step, fix. Store on the
on-call wiki; update this file as the canonical source.

---

## R1 — Cold start

**Trigger**: backend just deployed; first request returns 502 / hangs.

**Diagnose**
1. `curl https://<host>/health` — should return `{"status":"ok"}`.
2. Check `pryzm.request` logs in the deploy console for the trace id of
   the first failing request (`x-pryzm-trace-id` header).
3. Verify Postgres reachable from the app pod: `psql $DATABASE_URL -c 'select 1'`.

**Fix**
- App not listening: check Gunicorn / uvicorn logs for boot errors. Most
  common is missing `JWT_SECRET` env or `DATABASE_URL` typo.
- DB unreachable: confirm the security group on the RDS instance allows
  the app's egress. `pool_pre_ping=True` means the first request will
  surface the disconnect — second attempt usually succeeds once routing
  is restored.
- Alembic out of sync: `alembic current` vs `alembic heads`. Run
  `alembic upgrade head` if behind.

---

## R2 — Partial endpoint outage

**Trigger**: one screen returns 5xx, others healthy.

**Diagnose**
1. Look at the failing screen's composer module under
   `backend/services/<screen>/composer.py`.
2. Each composer fans out via `asyncio.gather` — a single block raising
   takes the whole composer down.
3. Grep `pryzm.request` logs for the trace id; the ERROR line names the
   originating block helper.

**Fix**
- Drop the cache: `from backend.services.<screen>.composer import invalidate_cache; invalidate_cache()`.
- If the block depends on a flaky external (LLM provider, statsmodels
  for forecasting), wrap that block helper with a try/except returning
  the seed fallback. Composer cache will pick up the fix on next request.

---

## R3 — Mock fallback toggling

**Trigger**: BFF degraded; want frontend to keep rendering.

**Frontend**
- `VITE_ALLOW_MOCK_FALLBACK=1` in the deploy env enables hybrid mode:
  apiFetch returns the bundled mock for that path on 404 / 503 / network
  error. See `frontend-v2/src/lib/api/client.ts`.
- This is intentionally a build-time flag — flipping it requires a
  redeploy. Until the final mock retirement (P15.T7) we keep it on in
  staging and off in prod.

**Backend**
- The seeds under `backend/seeds/screens/` are the canonical fallback.
  If a composer is failing AND mock fallback is off, retire the failing
  composer to a stub returning `load_seed(...)["..."]` directly.

---

## R4 — Briefing job failure

**Trigger**: AI briefing memo missing on Monday morning.

**Diagnose**
1. `BRIEFING_PROVIDER` env: `template` (deterministic seed) vs `llm` (Anthropic).
2. If `llm`: check `pryzm.request` logs — the LLM helper logs a WARNING
   on `ANTHROPIC_API_KEY` missing or the `anthropic` package missing,
   then falls back to the template provider. The briefing always renders.
3. If neither produces output: check the seed file at
   `backend/seeds/screens/ai.json` exists and is valid JSON.

**Fix**
- Re-export `BRIEFING_PROVIDER=template` in the deploy env to force the
  deterministic path while debugging the LLM provider.
- Drop the AI composer cache: `from backend.services.ai_briefing.composer import invalidate_cache; invalidate_cache()`.

---

## R5 — Audit log gap

**Trigger**: a user expected to see an action they took in the Audit
Trail block but it's missing.

**Diagnose**
1. Confirm the action endpoint actually fired:
   `gh api repos/.../actions` (CI logs) OR check the request trace id.
2. Idempotency replay: an `x-pryzm-idempotency-key` reuse returns
   `{replay: true, audit: <existing row>}` and writes no new row.
3. The Action Center audit feed is composer-cached for 60s. The actions
   endpoint calls `invalidate_cache()` after every write — verify by
   refetching `/api/v1/screens/action-center` directly.

**Fix**
- If the row genuinely didn't write: SQL it.
  `select id, action_kind, target_id, idempotency_key, created_at from audit_log where actor_user_id = '<uuid>' order by created_at desc limit 20;`
- If the row exists but the UI doesn't show it: check the formatter at
  `backend/services/action_center/audit_stub.py` — only the action
  kinds in `_KIND_TO_LABEL` get a friendly label; new kinds need an
  entry there.

---

## R6 — Auth rate limit lockout

**Trigger**: legitimate user reports 429 on `/auth/login`.

**Diagnose**
- `backend/auth/rate_limit.py` ships a per-IP token bucket: 5 attempts /
  60s. Check the trace log for `429` responses on the user's IP.

**Fix**
- Single replica: restart the app pod to clear the in-process bucket.
- Production (multi-replica): swap the in-process bucket for a Redis
  backend per the comment at the top of the rate-limit module. Until
  then, lockouts last at most 60 seconds.
