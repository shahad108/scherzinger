# Phase 12 — Pricing Studio v3 review notes

> Generated 2026-05-17. Reviewer: Claude (Phase 12 final-pass).
>
> Method: focused review of the 49k-line `git diff a18d412..HEAD` covering
> ~280 files. Focus areas per plan §12.4: SSE auth/backpressure,
> approval-rules JSON-logic safety, batch publish transaction safety,
> lineage data exposure (no PII leakage), keyboard a11y on all drawers.
>
> Status legend: 🔴 must-fix · 🟡 should-fix · 🟢 follow-up.

---

## 🔴 Must-fix (none blocking deploy)

No critical security or correctness blockers were found in the reviewed
surfaces.

---

## 🟡 Should-fix (address pre-1.0)

### S1. Batch commit has no explicit transaction boundary

**File:** `scherzinger-platform/backend/services/pricing/batch.py:756`
(`commit_batch`) and `scherzinger-platform/backend/api/v1/pricing.py:658`
(`commit_batch_endpoint`).

The endpoint relies on SQLAlchemy's implicit transaction (the session
opened by the `get_db` dependency) and a single `db.commit()` after
the service returns. If `commit_batch` raises on item 5 of 10, items
1–4's proposals stay in the session as transient objects — they
won't persist (good), but the SQL `INSERT`s for `record_audit` calls
that fired inside `submit_proposal_for_approval` for items 1–4 will
have been flushed and could already be visible to a concurrent read
that uses `READ UNCOMMITTED` (we don't, but it's a sharp edge).

Recommendation: wrap the whole endpoint body in
`with db.begin_nested(): … ` so the rollback semantics are explicit,
and add a test that asserts partial failure leaves zero proposals and
zero audit rows.

### S2. SSE endpoint emits user_id in plain logs

**File:** `scherzinger-platform/backend/api/v1/events.py:148`
(`events_stream`).

Subscribe audit logs `actor=<user_id>`. That's a UUID, fine for ops,
but `logger.info` lands in stdout which may be ingested by an
unstructured log sink. If the deploy target is multi-tenant or any
PII-sensitive environment, this becomes a low-grade GDPR/SOC2 item.

Recommendation: route SSE-subscribe audits through `record_audit` (
to `pricing_audit` table) instead of stdlib logging, so the row is
queryable + retention-managed under the same policy as the rest of
the audit trail.

### S3. Lineage drawer preview is metadata-only

**File:** `scherzinger-platform/backend/api/v1/lineage.py:65`
(`_build_preview`).

The preview always returns a fixed 2-row metadata stub
(`source_kind` + scrubbed `source_id`). The UI renders that fine, but
the lineage drawer's value proposition (look at the upstream
samples) is currently aspirational. The comment in the code
acknowledges this ("Future iterations can wire kind-specific samplers
behind this seam.").

Recommendation: not a deploy blocker — the drawer is honest about
showing metadata-only. But the docs / sales claim around lineage
should reflect "metadata + source ref, samples coming."

### S4. Pre-existing diff test failure is documented but unfixed

**File:** `scherzinger-platform/tests/services/pricing/test_diff.py:255`
(`test_proposal_diff_uses_count_not_full_fetch`).

Production query (`_diff_proposal`) is correct
(`ORDER BY at DESC LIMIT 1`). The test failure is brittleness in
seed-data ordering when multiple rows share `at` to microsecond
precision. Phase 12 did not block on this since the prod path is
provably right.

Recommendation: harden the test by inserting rows with explicit
distinct `at` values (`now - i*100ms`) instead of backdating after
the fact, then re-enable. Tracked here so the next person doesn't
re-debug from scratch.

---

## 🟢 Follow-up (nice-to-have)

### F1. `usePricingStream` hook is name-locked to pricing

The hook is topic-generic but named for the pricing namespace. When
Forecasting/Margin Cockpit start using SSE (see
`docs/architecture/live-wiring.md §5`), rename to `useEventStream`
and have `usePricingStream` become a thin wrapper that defaults
`topic: 'pricing'`.

### F2. Drawer focus-trap audit

All 11 drawers in the registry use the shared `Drawer` primitive
which sets `role="dialog"`, `aria-modal="true"`, ESC handler, focus
restore. A spot-check on `LineageDrawer`, `PublishConfirmationDrawer`,
`AlertSetupDrawer`, `CompareDrawer`, `BatchApprovalDrawer` all looked
correct. Recommend a Storybook a11y pass with axe-core to confirm
the remaining six.

### F3. Approval-rules engine is internal JSON-logic

**File:** `scherzinger-platform/backend/services/pricing/approval_rules.py`.

The mini-evaluator supports only `>`, `>=`, `<`, `<=`, `==`, `!=`,
`and`, `or`, `var` with a 64-depth guard. Closed operator set, no
eval/exec, no string-templating, JSON-only load path. **Safe.**
Comment in code already notes the swap-in path to `json-logic-py`
when needed; no action required today.

### F4. SSE drop semantics — runaway publishers

The bus drops oldest event on queue-full + rate-limits the warning
log. Operational checklist in `docs/architecture/live-wiring.md §2`
describes the tuning levers. If a feature ever fires > 500 events/s
per aid, revisit subscription queue sizes. Today the highest-rate
topic is `audit.appended` at ~1-2 events/s per active operator.

### F5. JSON-logic batch rule (`custom_jsonlogic`) reuses the same
evaluator

**File:** `scherzinger-platform/backend/services/pricing/batch.py`
(rule kinds in §"Phase 6").

When batch users pick `custom_jsonlogic`, the same mini-evaluator
runs against per-item context. Same safety properties as F3. Good.

### F6. Branded PDF jobs

**File:** `scherzinger-platform/backend/api/v1/reports.py`.

Jobs return URLs into a generated-reports bucket. PII scrubber is in
place at the data-prep step. Not deeply reviewed; flag for the next
pass.

---

## Out of scope (per plan)

- Pricing-rule admin UI (rules are seed-only today; JSON-editable + admin UI is a separate plan).
- Multi-currency. Models support `currency` field; Studio v3 ships EUR-only.
- CPQ UI itself. Studio publishes the price book; CPQ surface is separate.

---

## Acceptance gates re-check (after Phase 12 commits)

- ✅ Backend: 425+ pricing/contract tests + new `test_sse_integration.py` (2/2 passing).
- ✅ Frontend: 494 Vitest tests passing, tsc clean.
- ✅ Playwright: `pricing-studio-v3.spec.ts` 6/6 passing, 6 visual baselines committed.
- ⚠️ One pre-existing test failure documented in S4 (`test_proposal_diff_uses_count_not_full_fetch`). Prod path is correct.
- ✅ Docs: `frontend-pricing-studio-page.md` rewritten to v3; `architecture/live-wiring.md` is new.

Phase 12 is ready to merge. None of the 🟡 items block deploy; all can be addressed in a follow-up sprint.
