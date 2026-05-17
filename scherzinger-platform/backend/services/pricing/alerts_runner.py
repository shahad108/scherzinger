"""Pricing Studio v3 / Phase 9 — periodic alerts runner.

A thin wrapper around ``services.pricing.alerts.evaluate_alerts`` that
the future cron / scheduler will call once per hour. We deliberately
do NOT wire a background scheduler here — Phase 9 ships the function
and a manual ``POST /api/v1/pricing/alerts/{id}/test`` endpoint so QA
can drive a single evaluation. Production scheduling lands in Phase 10
once the scheduled-tasks MCP is plumbed.

TODO(phase-10/10.x): wire ``run_once`` to APScheduler / cron / the
external scheduled-tasks MCP at the hourly cadence the plan specifies.
"""
from __future__ import annotations

import logging
from typing import Any
from uuid import UUID

from sqlalchemy.orm import Session

from backend.models.pricing.alerts import PricingAlert, PricingAlertEvent
from backend.services.pricing import alerts as alerts_service

logger = logging.getLogger(__name__)


def run_once(db_session: Session) -> list[PricingAlertEvent]:
    """Evaluate every enabled alert once.

    Wrapped in try/except so a single bad alert can't take down the
    whole pass. Returns the list of events that fired.
    """
    try:
        return alerts_service.evaluate_alerts(db_session)
    except Exception:
        logger.exception("alerts_runner.run_once crashed")
        return []


def run_for_alert(
    alert_id: UUID, db_session: Session
) -> dict[str, Any]:
    """QA seam: evaluate a single alert and fire it if conditions match.

    Used by ``POST /api/v1/pricing/alerts/{id}/test``.
    """
    alert = db_session.get(PricingAlert, alert_id)
    if alert is None:
        raise alerts_service.AlertNotFoundError(f"alert {alert_id} not found")

    spec = alerts_service._rehydrate_spec(alert)  # noqa: SLF001 — same package
    payload = alerts_service.evaluate_single(spec, db_session)
    if payload is None:
        return {
            "alert_id": str(alert.id),
            "fired": False,
            "reason": "trigger condition not met",
        }
    event = alerts_service._fire_alert(  # noqa: SLF001
        alert=alert, payload=payload, db_session=db_session
    )
    return {
        "alert_id": str(alert.id),
        "fired": True,
        "event_id": str(event.id),
        "payload": payload,
        "channels_dispatched": event.channels_dispatched,
    }
