"""Pricing Studio v3 / Phase A6 — scheduled-publish runner.

Polls the ``scheduled_publishes`` table for rows where
``status='pending' AND effective_at <= now()`` and fires each by calling
``publish_price()``. On success the row flips to ``fired``; on exception
it flips to ``failed`` (and a ``failure_reason`` column is populated when
present — the column-existence check keeps this forward-compatible with
a future migration without breaking today).

Wired by ``backend/main.py`` as an APScheduler ``BackgroundScheduler``
job (id ``scheduled_publish_runner``, every 60 seconds, ``coalesce=True``,
``max_instances=1``). The scheduler is NOT started under pytest — tests
must call ``run_due_publishes`` directly so they don't race with a
background thread.
"""
from __future__ import annotations

import logging
from datetime import datetime, timezone
from typing import Optional

from sqlalchemy import inspect, select
from sqlalchemy.orm import Session

from backend.models.pricing.publish import (
    ScheduledPublish,
    ScheduledPublishStatus,
)
from backend.services.pricing.publish import publish_price

logger = logging.getLogger(__name__)


_FAILURE_REASON_COLUMN: Optional[bool] = None


def _has_failure_reason_column() -> bool:
    """Cached check — does ``scheduled_publishes`` have a ``failure_reason``?

    The plan calls for setting a ``failure_reason`` field if it exists on
    the model. Today it doesn't, but a future migration may add one.
    We check once per process via SQLAlchemy introspection so we don't
    re-mapper-inspect on every tick.
    """
    global _FAILURE_REASON_COLUMN
    if _FAILURE_REASON_COLUMN is None:
        try:
            mapper = inspect(ScheduledPublish)
            cols = {c.key for c in mapper.column_attrs}
            _FAILURE_REASON_COLUMN = "failure_reason" in cols
        except Exception:
            logger.exception("scheduled_publish_runner failure_reason probe failed")
            _FAILURE_REASON_COLUMN = False
    return bool(_FAILURE_REASON_COLUMN)


def _now() -> datetime:
    return datetime.now(timezone.utc)


def _mark_failed(
    *, row: ScheduledPublish, reason: str, db_session: Session
) -> None:
    """Flip a row to ``failed`` and (best-effort) write a failure_reason.

    The caller has already rolled back the failed transaction; we open a
    fresh write here for the status flip so the row doesn't stay pending.
    """
    row.status = ScheduledPublishStatus.FAILED.value
    if _has_failure_reason_column():
        try:
            setattr(row, "failure_reason", reason[:2000])
        except Exception:
            logger.exception(
                "scheduled_publish_runner could not set failure_reason on row %s",
                row.id,
            )
    db_session.add(row)


def run_due_publishes(db: Session) -> int:
    """Fire every pending scheduled-publish row whose ``effective_at`` is
    in the past. Returns the number of rows successfully fired.

    Per-row behaviour:
      - Success → status flips to ``fired`` (+ ``fired_at`` stamp).
      - Exception → ``db.rollback()``, status flips to ``failed`` in a
        fresh transaction, ``logger.exception`` records the trace.

    The caller owns the session lifecycle. We commit once at the end of
    the successful sweep so the runner is a single unit-of-work from the
    DB's perspective; per-row failures use their own savepoint via
    rollback + add + flush.
    """
    now = _now()

    # Collect due rows up-front (snapshot the queue, then iterate).
    stmt = (
        select(ScheduledPublish)
        .where(ScheduledPublish.status == ScheduledPublishStatus.PENDING.value)
        .where(ScheduledPublish.effective_at <= now)
        .order_by(ScheduledPublish.effective_at.asc())
    )
    try:
        due_rows = list(db.execute(stmt).scalars().all())
    except Exception:
        logger.exception("scheduled_publish_runner query failed")
        try:
            db.rollback()
        except Exception:  # pragma: no cover
            logger.exception("scheduled_publish_runner rollback after query failed")
        return 0

    if not due_rows:
        return 0

    fired = 0
    for row in due_rows:
        row_id = row.id
        try:
            publish_price(
                aid=row.aid,
                price=row.price,
                effective_at=row.effective_at,
                source_proposal_id=row.source_proposal_id,
                actor=row.created_by or "scheduler",
                db_session=db,
            )
            # Refetch in case publish_price expired the row.
            current = db.get(ScheduledPublish, row_id)
            if current is not None:
                current.status = ScheduledPublishStatus.FIRED.value
                current.fired_at = _now()
            db.commit()
            fired += 1
        except Exception as exc:
            logger.exception(
                "scheduled_publish_runner failed to fire row id=%s aid=%s",
                row_id,
                row.aid,
            )
            try:
                db.rollback()
            except Exception:  # pragma: no cover
                logger.exception(
                    "scheduled_publish_runner rollback failed for row %s", row_id
                )
            # Re-fetch the row on the now-clean session and flip to failed.
            try:
                fresh = db.get(ScheduledPublish, row_id)
                if fresh is not None:
                    _mark_failed(row=fresh, reason=str(exc), db_session=db)
                    db.commit()
            except Exception:  # pragma: no cover
                logger.exception(
                    "scheduled_publish_runner failed to mark row %s as failed",
                    row_id,
                )
                try:
                    db.rollback()
                except Exception:
                    logger.exception(
                        "scheduled_publish_runner second rollback failed for row %s",
                        row_id,
                    )
    return fired


# ---------------------------------------------------------------------------
# APScheduler integration
# ---------------------------------------------------------------------------


_SCHEDULER = None  # type: ignore[var-annotated]
JOB_ID = "scheduled_publish_runner"
INTERVAL_SECONDS = 60


def _runner_job() -> None:
    """The actual job APScheduler invokes. Opens a session, runs, closes."""
    from backend.database import SessionLocal

    session = SessionLocal()
    try:
        fired = run_due_publishes(session)
        if fired:
            logger.info(
                "scheduled_publish_runner fired %d row(s) on this tick", fired
            )
    except Exception:  # pragma: no cover - defensive
        logger.exception("scheduled_publish_runner tick crashed")
    finally:
        try:
            session.close()
        except Exception:  # pragma: no cover
            logger.exception("scheduled_publish_runner session close failed")


def start_scheduler():
    """Boot a ``BackgroundScheduler`` with the runner job attached.

    Idempotent — calling twice is a no-op. Returns the scheduler so the
    shutdown hook can stop it cleanly.
    """
    global _SCHEDULER
    if _SCHEDULER is not None:
        return _SCHEDULER

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
    logger.info(
        "scheduled_publish_runner started (interval=%ds)", INTERVAL_SECONDS
    )
    return scheduler


def stop_scheduler():
    """Gracefully stop the scheduler if running."""
    global _SCHEDULER
    if _SCHEDULER is None:
        return
    try:
        _SCHEDULER.shutdown(wait=False)
    except Exception:  # pragma: no cover - defensive
        logger.exception("scheduled_publish_runner shutdown failed")
    finally:
        _SCHEDULER = None
