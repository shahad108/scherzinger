"""Pricing Studio v3 / Phase 9 — daily digest builder.

``build_daily_digest`` aggregates the triggered alert events for a
single user on a single calendar day, groups them by kind, and returns
a structured 1-pager the bell-inbox and the email connector can both
render.

Publishing rides the SSE topic ``pricing.digest.delivered`` so the
bell-icon badge can flash without polling. The email send-out itself is
handled by the existing notifications stub — this module just builds
the payload.
"""
from __future__ import annotations

import logging
from collections import defaultdict
from dataclasses import dataclass, field
from datetime import date, datetime, time, timezone
from typing import Any

from sqlalchemy import select
from sqlalchemy.orm import Session

from backend.models.pricing.alerts import PricingAlert, PricingAlertEvent
from backend.services.events import publish_sync

logger = logging.getLogger(__name__)


@dataclass
class DigestEntry:
    """One row inside the per-kind grouping."""

    event_id: str
    alert_id: str
    aid: str | None
    cluster: str | None
    family: str | None
    triggered_at: str
    payload: dict[str, Any]


@dataclass
class Digest:
    """Structured digest payload."""

    user_id: str
    digest_date: str
    total_events: int
    by_kind: dict[str, list[DigestEntry]] = field(default_factory=dict)

    def to_dict(self) -> dict[str, Any]:
        return {
            "user_id": self.user_id,
            "digest_date": self.digest_date,
            "total_events": self.total_events,
            "by_kind": {
                kind: [entry.__dict__ for entry in entries]
                for kind, entries in self.by_kind.items()
            },
        }


def _day_bounds(d: date) -> tuple[datetime, datetime]:
    start = datetime.combine(d, time.min, tzinfo=timezone.utc)
    end = datetime.combine(d, time.max, tzinfo=timezone.utc)
    return start, end


def build_daily_digest(
    user_id: str,
    target_date: date,
    db_session: Session,
) -> Digest:
    """Aggregate the user's triggered events on ``target_date``."""
    start, end = _day_bounds(target_date)
    stmt = (
        select(PricingAlertEvent, PricingAlert)
        .join(PricingAlert, PricingAlertEvent.alert_id == PricingAlert.id)
        .where(
            PricingAlert.created_by == user_id,
            PricingAlertEvent.triggered_at >= start,
            PricingAlertEvent.triggered_at <= end,
        )
        .order_by(PricingAlertEvent.triggered_at.asc())
    )
    rows = list(db_session.execute(stmt))

    by_kind: dict[str, list[DigestEntry]] = defaultdict(list)
    for event, alert in rows:
        entry = DigestEntry(
            event_id=str(event.id),
            alert_id=str(alert.id),
            aid=alert.scope_aid,
            cluster=alert.scope_cluster,
            family=alert.scope_family,
            triggered_at=event.triggered_at.isoformat()
            if event.triggered_at
            else "",
            payload=event.payload or {},
        )
        by_kind[alert.kind].append(entry)

    return Digest(
        user_id=user_id,
        digest_date=target_date.isoformat(),
        total_events=len(rows),
        by_kind=dict(by_kind),
    )


def publish_digest_delivered(digest: Digest) -> None:
    """Best-effort SSE publish on ``pricing.digest.delivered``.

    Swallows publish failures so the digest build path never raises into
    callers (the digest body is the source of truth — the SSE notify is
    only freshness tooling on top).
    """
    try:
        publish_sync(
            "pricing.digest.delivered",
            digest.to_dict(),
        )
    except RuntimeError:
        logger.debug("publish_digest_delivered: inside event loop, skipping")
    except Exception:
        logger.exception("publish_digest_delivered failed user=%s", digest.user_id)
