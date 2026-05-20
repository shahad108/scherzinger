"""Pricing Studio v3 / Phase J2 — periodic alerts cron.

Sweeps every enabled ``pricing_alerts`` row once per tick, evaluating
each via ``alerts_runner.run_for_alert``. Per-alert exceptions are
captured so a single misconfigured alert can't take down the whole
batch.

Wired by ``backend/main.py`` as an APScheduler ``BackgroundScheduler``
job (id ``pricing_alerts_cron``, interval 60 minutes, ``coalesce=True``,
``max_instances=1``). The scheduler is NOT started under pytest — tests
must call ``run_due_alerts`` directly so they don't race with a
background thread.

The ``pricing_alerts`` table does NOT yet carry a
``last_evaluated_at`` column (Phase J ships the cron, not a migration).
We therefore detect the column at runtime via SQLAlchemy introspection
and only stamp the timestamp when it's present. That keeps this module
forward-compatible with a future migration without forcing one now.
"""
from __future__ import annotations

import logging
import os
from datetime import datetime, timezone
from typing import Optional

from sqlalchemy import inspect, select
from sqlalchemy.orm import Session

from backend.models.pricing.alerts import PricingAlert

logger = logging.getLogger(__name__)


_HAS_LAST_EVALUATED_AT: Optional[bool] = None


def _has_last_evaluated_at_column() -> bool:
    """Cached check: does ``pricing_alerts`` carry ``last_evaluated_at``?"""
    global _HAS_LAST_EVALUATED_AT
    if _HAS_LAST_EVALUATED_AT is None:
        try:
            mapper = inspect(PricingAlert)
            cols = {c.key for c in mapper.column_attrs}
            _HAS_LAST_EVALUATED_AT = "last_evaluated_at" in cols
        except Exception:
            logger.exception(
                "alerts_cron: failed to probe pricing_alerts columns"
            )
            _HAS_LAST_EVALUATED_AT = False
    return bool(_HAS_LAST_EVALUATED_AT)


def _now() -> datetime:
    return datetime.now(timezone.utc)


def run_due_alerts(db: Session) -> int:
    """Evaluate every enabled ``pricing_alerts`` row. Returns count fired.

    Per-alert behaviour:
      - Calls ``alerts_runner.run_for_alert(alert_id, db)``.
      - Catches every ``Exception`` so one bad alert never kills the
        batch. The error is logged with full traceback.
      - When the alert fires, increments the returned counter.
      - When ``last_evaluated_at`` is present on the model, stamps it.

    The caller owns the session lifecycle. We commit once at the end so
    the cron is a single unit-of-work from the DB's perspective.
    """
    from backend.services.pricing import alerts_runner  # local — avoid cycle

    try:
        stmt = select(PricingAlert).where(PricingAlert.enabled.is_(True))
        alerts = list(db.execute(stmt).scalars().all())
    except Exception:
        logger.exception("alerts_cron.run_due_alerts: enabled-alerts query failed")
        try:
            db.rollback()
        except Exception:  # pragma: no cover - defensive
            logger.exception(
                "alerts_cron.run_due_alerts: rollback after query failed"
            )
        return 0

    if not alerts:
        return 0

    has_ts_col = _has_last_evaluated_at_column()
    now = _now()
    fired = 0

    for alert in alerts:
        alert_id = alert.id
        try:
            result = alerts_runner.run_for_alert(alert_id, db)
            if isinstance(result, dict) and result.get("fired"):
                fired += 1
        except Exception:
            logger.exception(
                "alerts_cron.run_due_alerts: alert %s evaluation failed", alert_id
            )
            try:
                db.rollback()
            except Exception:  # pragma: no cover - defensive
                logger.exception(
                    "alerts_cron.run_due_alerts: rollback after per-alert failure "
                    "alert_id=%s",
                    alert_id,
                )
            # Continue with the next alert — one bad row doesn't stop the batch.
            continue

        if has_ts_col:
            try:
                # Re-fetch on the (possibly clean) session to avoid
                # detached-instance issues if run_for_alert rolled back.
                fresh = db.get(PricingAlert, alert_id)
                if fresh is not None:
                    setattr(fresh, "last_evaluated_at", now)
            except Exception:
                logger.exception(
                    "alerts_cron.run_due_alerts: last_evaluated_at stamp failed "
                    "alert_id=%s",
                    alert_id,
                )

    try:
        db.commit()
    except Exception:
        logger.exception("alerts_cron.run_due_alerts: final commit failed")
        try:
            db.rollback()
        except Exception:  # pragma: no cover - defensive
            logger.exception(
                "alerts_cron.run_due_alerts: rollback after commit failure"
            )

    return fired


# ---------------------------------------------------------------------------
# APScheduler integration
# ---------------------------------------------------------------------------


_SCHEDULER = None  # type: ignore[var-annotated]
JOB_ID = "pricing_alerts_cron"
INTERVAL_SECONDS = 60 * 60  # 60 minutes


def _runner_job() -> None:
    """Job APScheduler invokes. Opens a session, sweeps alerts, closes."""
    from backend.database import SessionLocal

    session = SessionLocal()
    try:
        fired = run_due_alerts(session)
        if fired:
            logger.info("pricing_alerts_cron fired %d alert(s) this tick", fired)
    except Exception:  # pragma: no cover - defensive
        logger.exception("pricing_alerts_cron tick crashed")
    finally:
        try:
            session.close()
        except Exception:  # pragma: no cover
            logger.exception("pricing_alerts_cron session close failed")


def start_scheduler():
    """Boot a ``BackgroundScheduler`` with the alerts cron attached.

    Idempotent — calling twice is a no-op. Returns the scheduler so the
    shutdown hook can stop it cleanly. Skips when the
    ``PYTEST_CURRENT_TEST`` env var is set so tests never race the cron.
    """
    global _SCHEDULER
    if _SCHEDULER is not None:
        return _SCHEDULER
    if os.getenv("PYTEST_CURRENT_TEST"):
        return None

    from apscheduler.schedulers.background import BackgroundScheduler
    from apscheduler.triggers.interval import IntervalTrigger

    scheduler = BackgroundScheduler(timezone="UTC")
    scheduler.add_job(
        _runner_job,
        trigger=IntervalTrigger(seconds=INTERVAL_SECONDS),
        id=JOB_ID,
        coalesce=True,
        max_instances=1,
        replace_existing=True,
    )
    scheduler.start()
    _SCHEDULER = scheduler
    logger.info("pricing_alerts_cron started (interval=%ds)", INTERVAL_SECONDS)
    return scheduler


def stop_scheduler():
    """Gracefully stop the alerts cron if running."""
    global _SCHEDULER
    if _SCHEDULER is None:
        return
    try:
        _SCHEDULER.shutdown(wait=False)
    except Exception:  # pragma: no cover - defensive
        logger.exception("pricing_alerts_cron shutdown failed")
    finally:
        _SCHEDULER = None
