from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from backend.api.v1 import (
    ab_tests,
    actions,
    approvals,
    audit,
    auth,
    benchmarks,
    briefing,
    costs,
    dashboard,
    events as pricing_events,
    forecast as forecast_blocks,
    forecast_annotations,
    forecast_overrides,
    forecasts,
    lineage,
    margins,
    models_registry,
    notes,
    preferences,
    pricing,
    quality,
    quotes,
    recommendations,
    reports,
    search,
    risk,
    saved_views,
    scenarios,
    screens,
    shell,
    simulations,
    stats,
    ws_proposal,
)
from backend.auth.middleware import CSRFMiddleware, JWTAuthMiddleware
from backend.config import settings
from backend.database import engine
from backend.observability import TraceIdMiddleware

app = FastAPI(
    title="Scherzinger Margin Intelligence API",
    version="2.0.0",
    description="Margin analytics, forecasting, and risk intelligence for Scherzinger GmbH",
)

# Phase 1: tightened CORS — allow-list, credentials, custom headers used by the
# BFF (CSRF + tracing land in Phase 2).
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origins_list,
    allow_credentials=True,
    allow_methods=["GET", "POST", "PATCH", "DELETE", "OPTIONS"],
    allow_headers=[
        "content-type",
        "x-csrf",
        "x-pryzm-trace-id",
        "x-pryzm-idempotency-key",
        "if-none-match",
    ],
    expose_headers=["etag", "x-pryzm-trace-id"],
)

# Existing analytical primitives.
app.include_router(stats.router, prefix="/api/v1", tags=["stats"])
app.include_router(margins.router, prefix="/api/v1", tags=["margins"])
app.include_router(quotes.router, prefix="/api/v1", tags=["quotes"])
app.include_router(quality.router, prefix="/api/v1", tags=["data-quality"])
app.include_router(forecasts.router, prefix="/api/v1", tags=["forecasts"])
# Phase 1 simulator surface — tornado + per-entity distributions.
app.include_router(forecast_blocks.router, prefix="/api/v1")
# Forecasting redesign Phase 1 — manual override CRUD (click-to-actual + ML feedback).
app.include_router(forecast_overrides.router, prefix="/api/v1", tags=["forecast-overrides"])
app.include_router(risk.router, prefix="/api/v1", tags=["risk"])
app.include_router(costs.router, prefix="/api/v1", tags=["costs"])
app.include_router(benchmarks.router, prefix="/api/v1", tags=["benchmarks"])
app.include_router(simulations.router, prefix="/api/v1", tags=["simulations"])
app.include_router(dashboard.router, prefix="/api/v1", tags=["dashboard"])

# Phase 2 auth gates + CSRF (registered AFTER CORS so preflight passes through).
app.add_middleware(JWTAuthMiddleware)
app.add_middleware(CSRFMiddleware)

# Phase 15 observability — added last so it wraps every other middleware and
# captures the full request duration.
app.add_middleware(TraceIdMiddleware)

# Phase 1 BFF + Phase 2 auth router + Phase 3 shell mutations.
app.include_router(screens.router, prefix="/api/v1")
app.include_router(auth.router, prefix="/api/v1")
app.include_router(shell.router, prefix="/api/v1")

# Phase 12: action persistence + audit + a/b testing.
app.include_router(actions.router, prefix="/api/v1")
app.include_router(audit.router, prefix="/api/v1")
app.include_router(ab_tests.router, prefix="/api/v1")

# Phase 14: settings (saved views, notes, preferences).
app.include_router(saved_views.router, prefix="/api/v1")
app.include_router(notes.router, prefix="/api/v1")
app.include_router(preferences.router, prefix="/api/v1")

# Phase 2 (deep links) + Phase 5 (proposals workflow) + Phase 6 (report MVP)
# + Phase 7 (global search + admin mutations on existing routers).
app.include_router(recommendations.router, prefix="/api/v1")
app.include_router(pricing.router, prefix="/api/v1")
app.include_router(reports.router, prefix="/api/v1")
app.include_router(search.router, prefix="/api/v1")

# Phase 18: model registry (Trust strip drawer + Settings → Model Cards).
app.include_router(models_registry.router, prefix="/api/v1")

# Forecasting Phase 5: scenario library CRUD + share.
app.include_router(scenarios.router, prefix="/api/v1")

# Forecasting v2.2 Phase H: annotation / comment layer.
app.include_router(
    forecast_annotations.router,
    prefix="/api/v1",
    tags=["forecast-annotations"],
)

# Phase 21 (Pricing Studio v3): SSE event channel.
app.include_router(pricing_events.router, prefix="/api/v1")

# Phase 21 (Pricing Studio v3 / Phase 10): lineage drawer + trust signals.
app.include_router(lineage.router, prefix="/api/v1")
app.include_router(briefing.router, prefix="/api/v1")

# Phase 21 (Pricing Studio v3 / Phase 5): approval workflow + WS collab channel.
app.include_router(approvals.router, prefix="/api/v1")
app.include_router(ws_proposal.router, prefix="/api/v1")


@app.on_event("startup")
def _seed_approval_routes_on_startup() -> None:
    """Phase 5 — refresh ``approval_routes`` from the JSON seed.

    Idempotent. Lets re-runs against an existing DB pick up new rules
    without forcing a migration. Failures are logged but never block
    app boot — the rules engine still reads the JSON directly.
    """
    import logging

    from backend.database import SessionLocal
    from backend.services.pricing.approval_seed import seed_approval_routes

    log = logging.getLogger(__name__)
    try:
        session = SessionLocal()
        try:
            seed_approval_routes(session)
            session.commit()
        finally:
            session.close()
    except Exception:
        log.exception("approval_routes startup seed failed")


@app.on_event("startup")
async def _wire_approval_event_listener() -> None:
    """Phase 5 — invalidate the inbox cache on proposal.* events."""
    import asyncio
    import logging

    from backend.api.v1.approvals import invalidate_inbox_cache
    from backend.services.events import subscribe

    log = logging.getLogger(__name__)

    async def _listen() -> None:
        try:
            async for _event in subscribe("proposal."):
                invalidate_inbox_cache()
        except Exception:
            log.exception("approval inbox event listener crashed")

    asyncio.create_task(_listen())


@app.get("/health")
def health():
    return {"status": "ok"}


@app.on_event("startup")
def startup():
    from sqlalchemy import text

    with engine.connect() as conn:
        conn.execute(text("SELECT 1"))


@app.on_event("startup")
def _start_scheduled_publish_runner() -> None:
    """Phase A6 — APScheduler kicker for the scheduled-publish queue.

    Polls ``scheduled_publishes`` every 60 seconds and fires every
    pending row whose ``effective_at`` is in the past. Skipped under
    pytest so the suite never races with a background thread.
    """
    import logging
    import os

    log = logging.getLogger(__name__)
    if os.getenv("PYTEST_CURRENT_TEST"):
        log.info("scheduled_publish_runner: skipped (pytest)")
        return
    if os.getenv("PRYZM_DISABLE_SCHEDULER", "").lower() in {"1", "true", "yes"}:
        log.info("scheduled_publish_runner: skipped (PRYZM_DISABLE_SCHEDULER)")
        return
    try:
        from backend.services.pricing.scheduled_publish_runner import (
            start_scheduler,
        )

        start_scheduler()
    except Exception:
        log.exception("scheduled_publish_runner failed to start")


@app.on_event("shutdown")
def _stop_scheduled_publish_runner() -> None:
    """Gracefully stop the APScheduler kicker on app shutdown."""
    import logging

    log = logging.getLogger(__name__)
    try:
        from backend.services.pricing.scheduled_publish_runner import (
            stop_scheduler,
        )

        stop_scheduler()
    except Exception:
        log.exception("scheduled_publish_runner failed to stop")


@app.on_event("startup")
def _start_pricing_alerts_cron() -> None:
    """Phase J2 — hourly APScheduler sweep over ``pricing_alerts``.

    Evaluates every enabled alert via ``alerts_runner.run_for_alert``.
    Skipped under pytest so the suite never races with a background
    thread.
    """
    import logging
    import os

    log = logging.getLogger(__name__)
    if os.getenv("PYTEST_CURRENT_TEST"):
        log.info("pricing_alerts_cron: skipped (pytest)")
        return
    if os.getenv("PRYZM_DISABLE_SCHEDULER", "").lower() in {"1", "true", "yes"}:
        log.info("pricing_alerts_cron: skipped (PRYZM_DISABLE_SCHEDULER)")
        return
    try:
        from backend.services.pricing.alerts_cron import start_scheduler

        start_scheduler()
    except Exception:
        log.exception("pricing_alerts_cron failed to start")


@app.on_event("shutdown")
def _stop_pricing_alerts_cron() -> None:
    """Phase J2 — gracefully stop the alerts cron on app shutdown."""
    import logging

    log = logging.getLogger(__name__)
    try:
        from backend.services.pricing.alerts_cron import stop_scheduler

        stop_scheduler()
    except Exception:
        log.exception("pricing_alerts_cron failed to stop")


@app.on_event("startup")
def _start_lineage_gc() -> None:
    """Phase J3 — nightly 03:00 UTC lineage_refs GC.

    Deletes orphaned ``lineage_refs`` older than 365 days that no longer
    appear in any FK column. Skipped under pytest so the suite never
    races with a background thread.
    """
    import logging
    import os

    log = logging.getLogger(__name__)
    if os.getenv("PYTEST_CURRENT_TEST"):
        log.info("lineage_gc: skipped (pytest)")
        return
    if os.getenv("PRYZM_DISABLE_SCHEDULER", "").lower() in {"1", "true", "yes"}:
        log.info("lineage_gc: skipped (PRYZM_DISABLE_SCHEDULER)")
        return
    try:
        from backend.services.pricing.lineage import start_scheduler

        start_scheduler()
    except Exception:
        log.exception("lineage_gc failed to start")


@app.on_event("shutdown")
def _stop_lineage_gc() -> None:
    """Phase J3 — gracefully stop the lineage GC on app shutdown."""
    import logging

    log = logging.getLogger(__name__)
    try:
        from backend.services.pricing.lineage import stop_scheduler

        stop_scheduler()
    except Exception:
        log.exception("lineage_gc failed to stop")


@app.on_event("startup")
def _prime_approval_rules_cache_on_startup() -> None:
    """Phase A8 — warm the rules cache + start the file-watcher.

    Falls back to the seeded ``approval_routes`` table when the JSON file
    is missing or malformed so a typo in the rules file no longer 500s
    every proposal submission. The file watcher hot-reloads the cache on
    save; both this hook and ``start_file_watcher`` short-circuit under
    pytest so test suites never race with a background thread.
    """
    import logging
    import os

    from backend.database import SessionLocal
    from backend.services.pricing.approval_rules import (
        load_rules,
        start_file_watcher,
    )

    log = logging.getLogger(__name__)
    try:
        session = SessionLocal()
        try:
            load_rules(db=session)
        finally:
            session.close()
    except Exception:
        log.exception("approval_rules cache warm-up failed")

    if not os.getenv("PYTEST_CURRENT_TEST"):
        try:
            start_file_watcher()
        except Exception:
            log.exception("approval_rules file watcher failed to start")


@app.on_event("shutdown")
def _stop_approval_rules_watcher_on_shutdown() -> None:
    """Phase A8 — stop the watchdog observer cleanly on shutdown."""
    import logging

    try:
        from backend.services.pricing.approval_rules import stop_file_watcher

        stop_file_watcher()
    except Exception:
        logging.getLogger(__name__).exception(
            "approval_rules watcher failed to stop"
        )
