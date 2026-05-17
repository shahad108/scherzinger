"""Phase 6 (Pricing Studio v3) — live-wiring hooks for batches.

Two flows update ``pricing_batch_items`` from events emitted elsewhere in
the system:

  - ``on_proposal_decided(proposal_id, decision)`` — bumps the matching
    batch item's status (``committed`` for approve / ``failed`` for
    reject) so the batch detail page's per-row chips refresh without
    re-querying every proposal.

  - ``on_cost_moved(aid)`` — marks every queued/locked batch item that
    references ``aid`` as having stale ``before_price`` (we set
    ``preview_json.before_price_stale = True``). We deliberately do NOT
    recompute the preview automatically — the user reviewed the
    original numbers; silently shifting them under their feet would
    erode trust. The UI surfaces a visible "cost moved" pill from this
    flag instead.

These helpers are sync, idempotent, and safe to call from any caller.
"""
from __future__ import annotations

import logging
from datetime import datetime, timezone
from typing import Any
from uuid import UUID

from sqlalchemy.orm import Session

from backend.models.pricing.batch import (
    PricingBatchItem,
    PricingBatchItemStatus,
)

logger = logging.getLogger(__name__)


def on_proposal_decided(
    *,
    proposal_id: UUID,
    decision: str,
    db_session: Session,
) -> None:
    """Update any batch item that owns this proposal.

    The query is wrapped in a SAVEPOINT-style nested transaction so a
    "table doesn't exist yet" error on a partially-migrated environment
    can't poison the outer transaction (the approval workflow commits
    after this returns).
    """
    try:
        savepoint = db_session.begin_nested()
    except Exception:
        # No active transaction — surface but don't crash.
        logger.debug("batch_subscribers begin_nested skipped")
        savepoint = None
    try:
        items = (
            db_session.query(PricingBatchItem)
            .filter(PricingBatchItem.proposal_id == proposal_id)
            .all()
        )
    except Exception:
        logger.exception(
            "batch_subscribers.on_proposal_decided query failed proposal_id=%s",
            proposal_id,
        )
        if savepoint is not None:
            try:
                savepoint.rollback()
            except Exception:
                logger.exception("batch_subscribers savepoint rollback failed")
        return
    if not items:
        if savepoint is not None:
            try:
                savepoint.commit()
            except Exception:
                logger.exception("batch_subscribers savepoint commit failed")
        return
    if decision in {"approve", "approved"}:
        new_status = PricingBatchItemStatus.COMMITTED.value
    elif decision in {"reject", "rejected", "request_changes", "changes_requested"}:
        new_status = PricingBatchItemStatus.FAILED.value
    else:
        # Unknown decision — leave the row alone.
        logger.info(
            "batch_subscribers.on_proposal_decided unknown decision=%r proposal_id=%s",
            decision,
            proposal_id,
        )
        return
    now = datetime.now(timezone.utc)
    for item in items:
        item.status = new_status
        item.updated_at = now
    try:
        db_session.flush()
    except Exception:
        logger.exception(
            "batch_subscribers.on_proposal_decided flush failed proposal_id=%s",
            proposal_id,
        )
        if savepoint is not None:
            try:
                savepoint.rollback()
            except Exception:
                logger.exception("batch_subscribers savepoint rollback failed")
        return
    if savepoint is not None:
        try:
            savepoint.commit()
        except Exception:
            logger.exception("batch_subscribers savepoint commit failed")


def on_cost_moved(*, aid: str, db_session: Session) -> None:
    """Flag every open batch item for ``aid`` as having a stale before_price.

    Wrapped in a SAVEPOINT for the same reason as ``on_proposal_decided``.
    """
    open_statuses = (
        PricingBatchItemStatus.QUEUED.value,
        PricingBatchItemStatus.LOCKED.value,
    )
    try:
        savepoint = db_session.begin_nested()
    except Exception:
        logger.debug("batch_subscribers begin_nested skipped")
        savepoint = None
    try:
        items = (
            db_session.query(PricingBatchItem)
            .filter(PricingBatchItem.aid == aid)
            .filter(PricingBatchItem.status.in_(open_statuses))
            .all()
        )
    except Exception:
        logger.exception("batch_subscribers.on_cost_moved query failed aid=%s", aid)
        if savepoint is not None:
            try:
                savepoint.rollback()
            except Exception:
                logger.exception("batch_subscribers savepoint rollback failed")
        return
    if not items:
        if savepoint is not None:
            try:
                savepoint.commit()
            except Exception:
                logger.exception("batch_subscribers savepoint commit failed")
        return
    now = datetime.now(timezone.utc)
    for item in items:
        preview = dict(item.preview_json or {})
        preview["before_price_stale"] = True
        item.preview_json = preview
        item.updated_at = now
    try:
        db_session.flush()
    except Exception:
        logger.exception("batch_subscribers.on_cost_moved flush failed aid=%s", aid)
        if savepoint is not None:
            try:
                savepoint.rollback()
            except Exception:
                logger.exception("batch_subscribers savepoint rollback failed")
        return
    if savepoint is not None:
        try:
            savepoint.commit()
        except Exception:
            logger.exception("batch_subscribers savepoint commit failed")


__all__ = ["on_proposal_decided", "on_cost_moved"]
