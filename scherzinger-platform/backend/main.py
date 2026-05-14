from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from backend.api.v1 import (
    ab_tests,
    actions,
    audit,
    auth,
    benchmarks,
    costs,
    dashboard,
    forecast as forecast_blocks,
    forecast_annotations,
    forecast_overrides,
    forecasts,
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


@app.get("/health")
def health():
    return {"status": "ok"}


@app.on_event("startup")
def startup():
    from sqlalchemy import text

    with engine.connect() as conn:
        conn.execute(text("SELECT 1"))
