"""Pricing Studio v3 / Phase 4 — read-side audit query helpers.

The append-only ``pricing_audit`` table is the source of truth for the
Decision History drawer + the diff strip's "what changed" timeline.

This module owns the SELECT side; ``services.pricing.audit.record_audit``
owns the INSERT side. Keeping them in separate modules makes the read
caching story cleaner (audit is append-only, so reads can cache safely)
without forcing the write helper to depend on caching infrastructure.
"""
from __future__ import annotations

import logging
import time
from collections import OrderedDict
from datetime import datetime
from typing import Any, Optional
from uuid import UUID

from sqlalchemy import and_, or_, select
from sqlalchemy.orm import Session

from backend.models.pricing.audit import PricingAuditEntry
from backend.models.pricing.lineage import LineageRefRow, LineageSourceKind

logger = logging.getLogger(__name__)


# Append-only → safe to TTL-cache aggressively. 30s matches the freshness
# expectation of the Decision History drawer ("event happened seconds ago").
_CACHE_TTL_SECONDS = 30.0
_CACHE_MAX_ENTRIES = 256
# SF2 — cache entry shape extended to ``{rows, total, lineage_ref_id}`` so
# the read-side lineage row is materialized at most once per (aid, filters)
# window. This avoids inserting a fresh ``lineage_refs`` row on every audit
# drawer poll.
_CACHE: "OrderedDict[tuple, tuple[float, dict[str, Any]]]" = OrderedDict()


def invalidate_cache() -> None:
    """Drop the audit-query cache. Called by the SSE bus on
    ``audit.appended`` so the next read picks up the freshly-inserted row.
    """
    _CACHE.clear()


def _serialize_lineage(row: Optional[LineageRefRow]) -> Optional[dict[str, Any]]:
    if row is None:
        return None
    return {
        "id": str(row.id),
        "source_kind": row.source_kind,
        "source_id": row.source_id,
        "sql": row.sql,
        "model": row.model,
        "computed_at": row.computed_at.isoformat() if row.computed_at else None,
        "computed_by": row.computed_by,
    }


def _serialize_row(
    entry: PricingAuditEntry,
    *,
    lineage_row: Optional[LineageRefRow],
) -> dict[str, Any]:
    """Wire-shape audit row for the Decision History drawer.

    Carries:
      - ``lineage_ref`` so the "View lineage" pill can resolve provenance
      - ``linked_rec`` when the action references a recommendation (e.g.
        ``proposal_created`` whose payload carries a ``rec_ref`` / ``rec_id``)
    """
    after = entry.after or {}
    payload_for_link = after if isinstance(after, dict) else {}
    linked_rec: Optional[dict[str, Any]] = None
    if entry.action == "proposal_created":
        rec_ref = (
            payload_for_link.get("rec_ref")
            or payload_for_link.get("recommendation_ref")
            or payload_for_link.get("recommendation_id")
        )
        rec_label = payload_for_link.get("rec_label") or (
            f"draft #{str(rec_ref)[:8]}" if rec_ref else None
        )
        if rec_ref is not None:
            linked_rec = {"ref": str(rec_ref), "label": rec_label or str(rec_ref)}
    return {
        "id": str(entry.id),
        "at": entry.at.isoformat() if entry.at else None,
        "actor": entry.actor,
        "action": entry.action,
        "target_kind": entry.target_kind,
        "target_id": entry.target_id,
        "before": entry.before,
        "after": entry.after,
        "reason": entry.reason,
        "lineage_ref": _serialize_lineage(lineage_row),
        "linked_rec": linked_rec,
    }


def _aid_in_payload(aid: str) -> Any:
    """SQLAlchemy predicate matching rows whose payload references ``aid``.

    The Studio v3 audit log records customer/cluster actions with the
    SKU id pinned in the payload so the per-SKU drawer can surface them.
    Both ``before`` and ``after`` are checked because not every action
    fills both sides (e.g. ``override_added`` may only carry ``after``).

    SF5 — ``proposal_*`` audit rows persist the SKU under
    ``payload.article_id`` (see ``api.v1.pricing.create_proposal``)
    while customer/cluster overrides use ``payload.aid``. Both spellings
    must match so the SKU drawer surfaces proposal events too.
    """
    return or_(
        PricingAuditEntry.after["aid"].astext == aid,
        PricingAuditEntry.before["aid"].astext == aid,
        PricingAuditEntry.after["article_id"].astext == aid,
        PricingAuditEntry.before["article_id"].astext == aid,
    )


def list_audit_for_sku(
    *,
    aid: str,
    db_session: Session,
    limit: int = 50,
    offset: int = 0,
    action_in: Optional[list[str]] = None,
    actor: Optional[str] = None,
    since: Optional[datetime] = None,
    bypass_cache: bool = False,
) -> tuple[list[dict[str, Any]], int, Optional[UUID]]:
    """Return paginated audit rows for ``aid`` + total count + query lineage.

    Includes direct ``target_kind='sku'`` rows AND customer/cluster rows
    whose payload pins the SKU. Ordered by ``at desc``.

    Returns ``(rows, total, lineage_ref_id)``.

    SF2 — ``lineage_ref_id`` is created once per (aid, filters) window and
    cached alongside the rows. Empty result sets return ``None`` so the
    read endpoint can omit the lineage write entirely. Subsequent calls
    inside the 30s TTL reuse the same lineage row.
    """
    limit = max(1, min(int(limit), 200))
    offset = max(0, int(offset))
    cache_key = (
        "list",
        aid,
        limit,
        offset,
        tuple(sorted(action_in)) if action_in else None,
        actor,
        since.isoformat() if since else None,
    )
    now = time.monotonic()
    if not bypass_cache:
        cached = _CACHE.get(cache_key)
        if cached and (now - cached[0]) < _CACHE_TTL_SECONDS:
            _CACHE.move_to_end(cache_key)
            return (
                cached[1]["rows"],
                cached[1]["total"],
                cached[1].get("lineage_ref_id"),
            )

    base_predicate = or_(
        and_(
            PricingAuditEntry.target_kind == "sku",
            PricingAuditEntry.target_id == aid,
        ),
        and_(
            PricingAuditEntry.target_kind.in_(("customer", "cluster", "family")),
            _aid_in_payload(aid),
        ),
    )
    filters = [base_predicate]
    if action_in:
        filters.append(PricingAuditEntry.action.in_(list(action_in)))
    if actor:
        filters.append(PricingAuditEntry.actor == actor)
    if since is not None:
        filters.append(PricingAuditEntry.at >= since)

    where_clause = and_(*filters)

    # Total: cheap COUNT on the same predicate.
    from sqlalchemy import func

    total = (
        db_session.execute(
            select(func.count()).select_from(PricingAuditEntry).where(where_clause)
        ).scalar_one()
    )

    rows = (
        db_session.execute(
            select(PricingAuditEntry)
            .where(where_clause)
            .order_by(PricingAuditEntry.at.desc(), PricingAuditEntry.id.desc())
            .offset(offset)
            .limit(limit)
        )
        .scalars()
        .all()
    )

    # Bulk-load lineage rows so we don't N+1.
    lineage_ids = [r.lineage_ref_id for r in rows if r.lineage_ref_id is not None]
    lineage_by_id: dict[UUID, LineageRefRow] = {}
    if lineage_ids:
        lin_rows = (
            db_session.execute(
                select(LineageRefRow).where(LineageRefRow.id.in_(lineage_ids))
            )
            .scalars()
            .all()
        )
        lineage_by_id = {row.id: row for row in lin_rows}

    serialized = [
        _serialize_row(
            r, lineage_row=lineage_by_id.get(r.lineage_ref_id) if r.lineage_ref_id else None
        )
        for r in rows
    ]

    # SF2 — only materialize the audit-query lineage row when there's at
    # least one row to surface. Empty paginated reads return ``None`` so the
    # endpoint can omit the INSERT.
    lineage_ref_id: Optional[UUID] = None
    if serialized:
        from backend.services.pricing.lineage import create_lineage

        lineage_row = create_lineage(
            source_kind=LineageSourceKind.MANUAL_OVERRIDE,
            source_id=f"audit_query:{aid}",
            sql=None,
            model="audit_query_v1",
            computed_by="system",
            session=db_session,
        )
        lineage_ref_id = lineage_row.id

    _CACHE[cache_key] = (
        now,
        {
            "rows": serialized,
            "total": int(total),
            "lineage_ref_id": lineage_ref_id,
        },
    )
    _CACHE.move_to_end(cache_key)
    while len(_CACHE) > _CACHE_MAX_ENTRIES:
        _CACHE.popitem(last=False)
    return serialized, int(total), lineage_ref_id
