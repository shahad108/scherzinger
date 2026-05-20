"""Pricing Studio v3 / Phase 7 — publish-to-quoting service.

Three workflow entry points:

  - ``publish_price``     atomic write to ``price_book`` (close prior row's
                          ``valid_to``, open new row), append audit, emit
                          SSE, fan out notifications, return a
                          ``PublishReceipt``.
  - ``schedule_publish``  for ``effective_at > now()``, persist to
                          ``scheduled_publishes`` so the scheduler picks
                          it up at the right time.
  - ``rollback_publish``  within 72h of the publish: re-open the prior
                          row, close the new row, audit, emit SSE.

All money is ``Decimal`` end-to-end (Numeric(14,4) in the DB; never a
float). ``publish_price`` takes a row-lock on the current active
price_book row for the aid (FOR UPDATE) so concurrent publishes are
serialised at the DB level.

Live wiring:
  - ``pricing.price_set(aid)`` on a successful publish.
  - ``pricing.price_rolled_back(aid)`` on a successful rollback.
  - Notification fan-out per proposal.notify flags is invoked synchronously
    inside the same transaction (best-effort — failures appear in the
    receipt as ``status='failed'`` but do not roll back the publish).
"""
from __future__ import annotations

import logging
from datetime import datetime, timedelta, timezone
from decimal import Decimal
from typing import Any, Optional
from uuid import UUID

from pydantic import BaseModel, ConfigDict
from sqlalchemy import select
from sqlalchemy.orm import Session

from backend.models import PricingProposal
from backend.models.pricing.audit import (
    PricingAuditAction,
    PricingAuditTargetKind,
)
from backend.models.pricing.lineage import LineageSourceKind
from backend.models.pricing.pricing_state import PriceStateRow
from backend.models.pricing.publish import (
    PriceBookRow,
    PublishReceiptRow,
    ScheduledPublish,
    ScheduledPublishStatus,
)
from backend.services.pricing.audit import record_audit
from backend.services.pricing.lineage import create_lineage
from backend.services.pricing.notifications import dispatch_notifications

logger = logging.getLogger(__name__)


ROLLBACK_WINDOW = timedelta(hours=72)


# ---------------------------------------------------------------------------
# Errors
# ---------------------------------------------------------------------------


class PublishError(Exception):
    """Base class for publish-workflow exceptions."""


class RollbackWindowExpiredError(PublishError):
    """Rollback attempted >72h after publish."""


class ReceiptAlreadyRolledBackError(PublishError):
    """Rollback attempted twice on the same receipt."""


class ReceiptNotFoundError(PublishError):
    """No receipt with that id."""


# ---------------------------------------------------------------------------
# Wire-shape models
# ---------------------------------------------------------------------------


class PublishReceipt(BaseModel):
    """Wire shape for a publish event."""

    model_config = ConfigDict(from_attributes=True)

    id: UUID
    aid: str
    source_proposal_id: Optional[UUID] = None
    old_price_book_row_id: Optional[UUID] = None
    new_price_book_row_id: UUID
    published_at: datetime
    rolled_back_at: Optional[datetime] = None
    notifications_dispatched: list[dict[str, Any]] = []
    published_by: str


class ScheduledPublishOut(BaseModel):
    """Wire shape for a scheduled publish."""

    model_config = ConfigDict(from_attributes=True)

    id: UUID
    aid: str
    price: Decimal
    effective_at: datetime
    source_proposal_id: Optional[UUID] = None
    status: str
    created_by: str
    created_at: datetime


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------


def _now() -> datetime:
    return datetime.now(timezone.utc)


def _ensure_tz(dt: datetime) -> datetime:
    if dt.tzinfo is None:
        return dt.replace(tzinfo=timezone.utc)
    return dt


def _current_active_row(
    *, aid: str, db_session: Session, lock: bool = False
) -> Optional[PriceBookRow]:
    """Return the price_book row currently in effect for ``aid``.

    Picks the row with ``valid_to IS NULL`` and the most recent
    ``valid_from``. When ``lock`` is True, acquires a FOR UPDATE row
    lock so concurrent publishes serialise behind us.
    """
    stmt = (
        select(PriceBookRow)
        .where(PriceBookRow.aid == aid)
        .where(PriceBookRow.valid_to.is_(None))
        .order_by(PriceBookRow.valid_from.desc())
        .limit(1)
    )
    if lock:
        stmt = stmt.with_for_update()
    return db_session.execute(stmt).scalars().first()


def _publish_sse(topic: str, *, aid: str, payload: dict[str, Any]) -> None:
    """Best-effort SSE publish — never raises."""
    try:
        from backend.services.events import publish_sync

        publish_sync(topic, payload, aid=aid)
    except RuntimeError:
        # Called inside a running event loop — fall back to fire-and-forget.
        try:
            import asyncio

            from backend.services.events import publish as publish_async

            loop = asyncio.get_event_loop()
            loop.create_task(publish_async(topic, payload, aid=aid))
        except Exception:  # pragma: no cover - best effort
            logger.exception(
                "_publish_sse async fallback failed topic=%s aid=%s",
                topic,
                aid,
            )
    except Exception:  # pragma: no cover - best effort
        logger.exception("_publish_sse failed topic=%s aid=%s", topic, aid)


def _proposal_notify_flags(
    *, proposal_id: Optional[UUID], db_session: Session
) -> dict[str, Any]:
    if proposal_id is None:
        return {}
    proposal = db_session.get(PricingProposal, proposal_id)
    if proposal is None:
        return {}
    payload = proposal.payload or {}
    notify = payload.get("notify") or {}
    if isinstance(notify, dict):
        return notify
    return {}


def _sync_price_state(
    *,
    aid: str,
    price: Decimal,
    actor: str,
    lineage_ref_id: Optional[UUID],
    db_session: Session,
) -> None:
    """Best-effort: keep ``price_state`` mirroring the active price_book row.

    ``price_state`` predates Phase 7 and is read by the Studio hero / batch
    composer; we update it inside the same transaction so consumers
    don't drift. If no row exists we don't create one here (PriceState
    is seeded elsewhere); only update when present.
    """
    row = db_session.get(PriceStateRow, aid)
    if row is None:
        return
    row.current_price = price
    row.last_set_by = actor
    row.last_set_at = _now()
    if lineage_ref_id is not None:
        row.lineage_ref_id = lineage_ref_id


# ---------------------------------------------------------------------------
# publish_price
# ---------------------------------------------------------------------------


def publish_price(
    *,
    aid: str,
    price: Decimal,
    effective_at: datetime,
    source_proposal_id: Optional[UUID],
    actor: str,
    db_session: Session,
) -> PublishReceipt:
    """Atomically publish ``price`` for ``aid`` effective ``effective_at``.

    Steps (all inside the caller's transaction):
      1. Row-lock the current active price_book row for ``aid`` (if any).
      2. Close prior row's ``valid_to = effective_at``.
      3. Insert a lineage_ref tagging the new row (source=manual_override
         when no proposal, source=scheduled_publish otherwise).
      4. Insert the new price_book row (valid_from=effective_at,
         valid_to=NULL).
      5. Mirror price_state.current_price = price.
      6. Insert the publish_receipts row.
      7. Append a pricing_audit row (action=price_set).
      8. Fan out notifications per the proposal's notify flags.
      9. Update the receipt's notifications_dispatched column.
      10. Emit pricing.price_set(aid) on the SSE bus.

    Caller commits.
    """
    effective_at = _ensure_tz(effective_at)
    price = Decimal(price) if not isinstance(price, Decimal) else price

    # 1. Lock + capture prior row.
    prior = _current_active_row(aid=aid, db_session=db_session, lock=True)
    before_price = prior.price if prior is not None else None
    old_row_id = prior.id if prior is not None else None

    # 2. Close prior row.
    if prior is not None:
        prior.valid_to = effective_at

    # 3. Lineage.
    lineage = create_lineage(
        source_kind=LineageSourceKind.SCHEDULED_PUBLISH
        if source_proposal_id is not None
        else LineageSourceKind.MANUAL_OVERRIDE,
        source_id=str(source_proposal_id) if source_proposal_id else f"manual:{aid}",
        sql=None,
        model="publish_price",
        computed_by=actor,
        session=db_session,
    )

    # 4. New row.
    new_row = PriceBookRow(
        aid=aid,
        price=price,
        currency="EUR",
        valid_from=effective_at,
        valid_to=None,
        source_proposal_id=source_proposal_id,
        lineage_ref_id=lineage.id,
    )
    db_session.add(new_row)
    db_session.flush()  # populate new_row.id

    # 5. Mirror price_state.
    _sync_price_state(
        aid=aid,
        price=price,
        actor=actor,
        lineage_ref_id=lineage.id,
        db_session=db_session,
    )

    # 6. Receipt (notifications attached after fan-out).
    receipt_row = PublishReceiptRow(
        aid=aid,
        source_proposal_id=source_proposal_id,
        old_price_book_row_id=old_row_id,
        new_price_book_row_id=new_row.id,
        published_at=_now(),
        notifications_dispatched=[],
        published_by=actor,
    )
    db_session.add(receipt_row)
    db_session.flush()

    # 7. Audit.
    record_audit(
        actor=actor,
        action=PricingAuditAction.PRICE_SET,
        target_kind=PricingAuditTargetKind.SKU,
        target_id=aid,
        before={
            "price": str(before_price) if before_price is not None else None,
            "price_book_row_id": str(old_row_id) if old_row_id else None,
        },
        after={
            "price": str(price),
            "price_book_row_id": str(new_row.id),
            "valid_from": effective_at.isoformat(),
            "source_proposal_id": str(source_proposal_id) if source_proposal_id else None,
            "receipt_id": str(receipt_row.id),
        },
        reason="publish_price",
        lineage_ref=lineage.id,
        session=db_session,
    )

    # 8. Fan-out.
    notify_flags = _proposal_notify_flags(
        proposal_id=source_proposal_id, db_session=db_session
    )
    notification_results: list[dict[str, Any]] = []
    if notify_flags:
        try:
            notification_results = dispatch_notifications(
                aid=aid,
                proposal_id=source_proposal_id,
                notify_flags=notify_flags,
                actor=actor,
                db_session=db_session,
                message=f"Price published for {aid}: {price} EUR",
            )
        except Exception:  # pragma: no cover
            logger.exception("publish_price.dispatch_notifications failed")

    # 9. Persist the fan-out result on the receipt.
    receipt_row.notifications_dispatched = notification_results
    db_session.flush()

    # 10. SSE.
    _publish_sse(
        "pricing.price_set",
        aid=aid,
        payload={
            "aid": aid,
            "price": str(price),
            "receipt_id": str(receipt_row.id),
            "source_proposal_id": str(source_proposal_id) if source_proposal_id else None,
            "valid_from": effective_at.isoformat(),
        },
    )

    return PublishReceipt.model_validate(receipt_row)


# ---------------------------------------------------------------------------
# schedule_publish
# ---------------------------------------------------------------------------


def schedule_publish(
    *,
    aid: str,
    price: Decimal,
    effective_at: datetime,
    source_proposal_id: Optional[UUID],
    actor: str,
    db_session: Session,
) -> ScheduledPublishOut:
    """Persist a pending future publish.

    The scheduler kicks the row at ``effective_at`` (Phase 7 ships the
    record; a follow-up adds the APScheduler kicker — see the inline
    TODO in this module).
    """
    effective_at = _ensure_tz(effective_at)
    price = Decimal(price) if not isinstance(price, Decimal) else price

    if effective_at <= _now():
        # Caller responsible for routing to publish_price; we still
        # accept the row and mark pending so the scheduler picks it up
        # on the next tick (defensive).
        logger.warning(
            "schedule_publish.past_effective_at aid=%s effective_at=%s",
            aid,
            effective_at,
        )

    row = ScheduledPublish(
        aid=aid,
        price=price,
        effective_at=effective_at,
        source_proposal_id=source_proposal_id,
        status=ScheduledPublishStatus.PENDING.value,
        created_by=actor,
    )
    db_session.add(row)
    db_session.flush()
    # TODO(phase-10): wire APScheduler / cron kicker to walk
    # (status='pending', effective_at <= now()) and call publish_price
    # for each row, updating status='fired' on success or 'failed' on
    # exception.
    return ScheduledPublishOut.model_validate(row)


# ---------------------------------------------------------------------------
# rollback_publish
# ---------------------------------------------------------------------------


def rollback_publish(
    *,
    receipt_id: UUID,
    reason: str,
    actor: str,
    db_session: Session,
) -> PublishReceipt:
    """Re-open the prior price_book row + close the new row.

    Rules:
      - Receipt must exist.
      - Receipt must be within ``ROLLBACK_WINDOW`` (72h) of published_at.
      - If the receipt is already rolled back, the call is a no-op and
        returns the previously-rolled-back receipt unchanged. This makes
        retry-safe rollback ergonomics possible from the UI without
        risking duplicate ``price_rolled_back`` audit rows.

    Phase A7 fix:
      - Previously the rollback only re-opened the prior price_book row
        and stamped the receipt. ``price_state.current_price`` was
        already mirrored via ``_sync_price_state``, but the audit row
        used the generic ``rollback`` action which conflated this with
        proposal-level rollbacks. We now write a dedicated
        ``price_rolled_back`` audit entry so downstream consumers (the
        Studio queue margin column, the Quotes screen, the Decision
        History drawer) can rely on a stable, semantically-meaningful
        marker that the active price reverted.
    """
    receipt = db_session.get(PublishReceiptRow, receipt_id)
    if receipt is None:
        raise ReceiptNotFoundError(f"receipt {receipt_id} not found")
    if receipt.rolled_back_at is not None:
        # Idempotent: no second audit row, no second SSE, same response.
        return PublishReceipt.model_validate(receipt)
    published_at = _ensure_tz(receipt.published_at)
    if _now() - published_at > ROLLBACK_WINDOW:
        raise RollbackWindowExpiredError(
            f"receipt {receipt_id} is older than {ROLLBACK_WINDOW} — rollback window expired"
        )

    new_row = db_session.get(PriceBookRow, receipt.new_price_book_row_id)
    if new_row is None:  # pragma: no cover - should never happen
        raise PublishError(
            f"price_book row {receipt.new_price_book_row_id} missing for receipt {receipt_id}"
        )

    now = _now()
    post_publish_price = new_row.price
    # Close the row we previously opened.
    new_row.valid_to = now

    # Resolve the price we are restoring TO.
    #
    #   1) Preferred path: the receipt records the prior row we closed
    #      when we published — re-open it and use its price.
    #   2) Fallback: if no prior row was recorded (first-ever publish for
    #      this aid), fall back to the latest active price_book row that
    #      remains after this rollback.
    prior: Optional[PriceBookRow] = None
    restored_price: Optional[Decimal] = None
    restored_lineage_ref_id: Optional[UUID] = None
    if receipt.old_price_book_row_id is not None:
        prior = db_session.get(PriceBookRow, receipt.old_price_book_row_id)
        if prior is not None:
            # Re-open the prior row.
            prior.valid_to = None
            restored_price = prior.price
            restored_lineage_ref_id = prior.lineage_ref_id

    if restored_price is None:
        # Fallback: any other active row left after we closed new_row.
        fallback = _current_active_row(aid=receipt.aid, db_session=db_session)
        if fallback is not None and fallback.id != new_row.id:
            restored_price = fallback.price
            restored_lineage_ref_id = fallback.lineage_ref_id

    # Build a lineage_ref tagging this rollback so price_state points at
    # the right edge in the lineage graph.
    rollback_lineage = create_lineage(
        source_kind=LineageSourceKind.MANUAL_OVERRIDE,
        source_id=f"rollback:{receipt.id}",
        sql=None,
        model="rollback_publish",
        computed_by=actor,
        session=db_session,
    )

    # Phase A7: always flip price_state.current_price back to the
    # restored price (when known). Tag last_set_by with the receipt id so
    # the audit trail makes the source obvious.
    if restored_price is not None:
        _sync_price_state(
            aid=receipt.aid,
            price=restored_price,
            actor=f"rollback:{receipt.id}",
            lineage_ref_id=rollback_lineage.id,
            db_session=db_session,
        )

    # Stamp the rollback on the receipt.
    receipt.rolled_back_at = now
    receipt.rollback_reason = reason
    db_session.flush()

    # Audit. ``price_rolled_back`` is the canonical action name for the
    # downstream-visible "active price reverted" event. The generic
    # ``rollback`` action remains reserved for proposal-level rollbacks.
    record_audit(
        actor=actor,
        action="price_rolled_back",
        target_kind=PricingAuditTargetKind.SKU,
        target_id=receipt.aid,
        before={"price": str(post_publish_price)},
        after={"price": str(restored_price) if restored_price is not None else None},
        reason="rollback_within_72h_window",
        lineage_ref=rollback_lineage.id,
        session=db_session,
    )

    # SSE.
    _publish_sse(
        "pricing.price_rolled_back",
        aid=receipt.aid,
        payload={
            "aid": receipt.aid,
            "receipt_id": str(receipt.id),
            "restored_price": str(restored_price) if restored_price is not None else None,
            "rolled_back_at": now.isoformat(),
            "reason": reason,
        },
    )

    return PublishReceipt.model_validate(receipt)


# ---------------------------------------------------------------------------
# Serialization helpers
# ---------------------------------------------------------------------------


def serialize_price_book_row(row: PriceBookRow) -> dict[str, Any]:
    return {
        "id": str(row.id),
        "aid": row.aid,
        "price": str(row.price),
        "currency": row.currency,
        "valid_from": row.valid_from.isoformat() if row.valid_from else None,
        "valid_to": row.valid_to.isoformat() if row.valid_to else None,
        "source_proposal_id": (
            str(row.source_proposal_id) if row.source_proposal_id else None
        ),
        "lineage_ref_id": (
            str(row.lineage_ref_id) if row.lineage_ref_id else None
        ),
        "created_at": row.created_at.isoformat() if row.created_at else None,
    }


def list_price_book(
    *, aid: str, db_session: Session, limit: int = 20
) -> list[dict[str, Any]]:
    stmt = (
        select(PriceBookRow)
        .where(PriceBookRow.aid == aid)
        .order_by(PriceBookRow.valid_from.desc())
        .limit(max(1, min(limit, 200)))
    )
    rows = db_session.execute(stmt).scalars().all()
    return [serialize_price_book_row(r) for r in rows]


def serialize_receipt(receipt: PublishReceiptRow) -> dict[str, Any]:
    return {
        "id": str(receipt.id),
        "aid": receipt.aid,
        "source_proposal_id": (
            str(receipt.source_proposal_id) if receipt.source_proposal_id else None
        ),
        "old_price_book_row_id": (
            str(receipt.old_price_book_row_id)
            if receipt.old_price_book_row_id
            else None
        ),
        "new_price_book_row_id": str(receipt.new_price_book_row_id),
        "published_at": (
            receipt.published_at.isoformat() if receipt.published_at else None
        ),
        "rolled_back_at": (
            receipt.rolled_back_at.isoformat() if receipt.rolled_back_at else None
        ),
        "notifications_dispatched": receipt.notifications_dispatched or [],
        "published_by": receipt.published_by,
        "rollback_reason": receipt.rollback_reason,
    }
