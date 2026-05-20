"""Phase 2 (Pricing Studio v3) — customer state change notifier.

When an external ``customer_state.update(customer_id)`` event arrives,
the BFF must:

  1. Drop cached fanout slices that may now be stale.
  2. Publish ``pricing.customer_state_updated`` on the SSE bus, **once
     per (aid, customer_id)** pair, so the frontend can invalidate
     just the affected fanout rows without a full Studio reload.

The list of affected aids is read from ``customer_on_sku`` (every SKU
the customer is on).
"""
from __future__ import annotations

import logging
from typing import Iterable

from sqlalchemy import text
from sqlalchemy.orm import Session

from backend.services.events import publish, publish_sync
from backend.services.pricing.customer_fanout import invalidate_cache as invalidate_fanout_cache

logger = logging.getLogger(__name__)


def _aids_for_customer(*, customer_id: str, db_session: Session) -> list[str]:
    """All aids the customer appears on (via customer_on_sku + recent invoices)."""
    aids: set[str] = set()
    # Snapshot — most up-to-date.
    try:
        for r in db_session.execute(
            text("""
                SELECT aid FROM customer_on_sku WHERE customer_id = :cid
                UNION
                SELECT aid FROM customer_on_sku_snapshot WHERE customer_id = :cid
            """),
            {"cid": customer_id},
        ).fetchall():
            if r[0]:
                aids.add(str(r[0]))
    except Exception:
        logger.exception(
            "customer_state._aids_for_customer customer_on_sku cid=%s", customer_id
        )
    # Fallback: scan recent invoices when the snapshot tables are empty.
    if not aids:
        try:
            for r in db_session.execute(
                text("""
                    SELECT DISTINCT article_id
                    FROM invoices
                    WHERE customer_id = :cid
                      AND date >= (
                        SELECT MAX(date) - INTERVAL '12 months' FROM invoices
                      )
                """),
                {"cid": customer_id},
            ).fetchall():
                if r[0]:
                    aids.add(str(r[0]))
        except Exception:
            logger.exception(
                "customer_state._aids_for_customer invoices cid=%s", customer_id
            )
    return sorted(aids)


async def notify_customer_state_changed(
    customer_id: str,
    *,
    db_session: Session,
    aids: Iterable[str] | None = None,
) -> list[str]:
    """Async fanout — publishes one event per affected (aid, customer_id).

    Caller passes ``aids`` only when it already knows which SKUs are
    affected (e.g. a targeted state-feed). Without it we resolve the
    list from ``customer_on_sku``.

    Returns the list of aids touched (for logging / tests).
    """
    resolved = list(aids) if aids is not None else _aids_for_customer(
        customer_id=customer_id, db_session=db_session
    )
    for aid in resolved:
        invalidate_fanout_cache(aid=aid)
        await publish(
            "pricing.customer_state_updated",
            {"aid": aid, "customer_id": customer_id},
            aid=aid,
        )
    return resolved


def notify_customer_state_changed_sync(
    customer_id: str,
    *,
    db_session: Session,
    aids: Iterable[str] | None = None,
) -> list[str]:
    """Sync façade for non-async callers (cron jobs, sync ingesters).

    MUST NOT be called from inside an async context — see
    ``services.events.publish_sync`` for the rationale.
    """
    resolved = list(aids) if aids is not None else _aids_for_customer(
        customer_id=customer_id, db_session=db_session
    )
    for aid in resolved:
        invalidate_fanout_cache(aid=aid)
        publish_sync(
            "pricing.customer_state_updated",
            {"aid": aid, "customer_id": customer_id},
            aid=aid,
        )
    return resolved
