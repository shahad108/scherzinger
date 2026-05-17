"""Phase 2 (Pricing Studio v3) — customer-fanout composer.

Single source of truth for the per-(aid, proposed_price) fanout panel.
Used by:
  - the workbench composer (initial Studio load)
  - POST /screens/studio/fanout (reactive re-score on slider drag)

Each row carries the extended per-customer reality fields plus the
BFF-computed ``tone`` (alert/warn/plain) and a ``proposal_queued`` flag
indicating an active draft proposal already exists for the (customer, aid).

NOTE: tone IS BFF truth. The frontend renders the string but never
re-derives it — see ``customer_risk.compute_tone`` for the thresholds.
"""
from __future__ import annotations

import logging
import time
from decimal import Decimal
from typing import Any, Optional
from uuid import UUID

from sqlalchemy.orm import Session

from backend.models.pricing.customer_on_sku import CustomerOnSku
from backend.services.pricing.cache_keys import canonical_price_key
from backend.services.pricing.customer_on_sku import build_customer_on_sku
from backend.services.pricing.customer_risk import compute_tone

logger = logging.getLogger(__name__)


# Re-score cache. Keyed by (aid, proposed_price as str). 60s TTL per spec.
_CACHE_TTL_SECONDS = 60.0
_CACHE: dict[tuple[str, str], tuple[float, dict[str, Any]]] = {}


def invalidate_cache(aid: Optional[str] = None) -> None:
    """Clear cached fanout rows.

    When ``aid`` is given, drop only that aid's slice (called from the
    customer_state.update fanout). Otherwise drop everything (test seam).
    """
    if aid is None:
        _CACHE.clear()
        return
    for key in [k for k in _CACHE if k[0] == aid]:
        _CACHE.pop(key, None)


def _serialize_row(
    *,
    cos: CustomerOnSku,
    proposal_queued: bool,
    customer_name: Optional[str] = None,
) -> dict[str, Any]:
    """Convert a CustomerOnSku + flags into the wire-shape fanout row."""
    risk = cos.risk_if_moved
    tone = compute_tone(risk)
    row = {
        "customer_id": cos.customer_id,
        "customer_name": customer_name or f"Customer {cos.customer_id}",
        "aid": cos.aid,
        "tier": cos.tier.value,
        "last_paid": str(cos.last_paid) if cos.last_paid is not None else None,
        "last_paid_at": (
            cos.last_paid_at.isoformat() if cos.last_paid_at is not None else None
        ),
        "ltm_units": cos.ltm_units,
        "ltm_eur": str(cos.ltm_eur) if cos.ltm_eur is not None else None,
        "wallet_share_pct": (
            str(cos.wallet_share_pct)
            if cos.wallet_share_pct is not None
            else None
        ),
        "paid_band": (
            {
                "p10": str(cos.paid_band.p10),
                "p50": str(cos.paid_band.p50),
                "p90": str(cos.paid_band.p90),
            }
            if cos.paid_band is not None
            else None
        ),
        "churn_p": str(cos.churn_p) if cos.churn_p is not None else None,
        "decline_p": str(cos.decline_p) if cos.decline_p is not None else None,
        "risk_if_moved": str(risk) if risk is not None else None,
        "tone": tone,
        "proposal_queued": proposal_queued,
        "lineage_ref_id": (
            str(cos.lineage_ref.id) if cos.lineage_ref is not None else None
        ),
    }
    return row


# ---------------------------------------------------------------------------
# Loaders — split for monkey-patching.
# ---------------------------------------------------------------------------


def _load_customer_ids_for_aid(*, aid: str, db_session: Session) -> list[str]:
    """All customer ids that have ever purchased the SKU. Ordered by LTM EUR DESC.

    Empty list when no invoices are recorded — caller handles the empty
    panel state.
    """
    from sqlalchemy import text
    try:
        rows = db_session.execute(
            text("""
                SELECT customer_id,
                       COALESCE(SUM(revenue), 0) AS ltm_eur
                FROM invoices
                WHERE article_id = :aid
                  AND date >= (SELECT MAX(date) - INTERVAL '12 months' FROM invoices)
                GROUP BY customer_id
                ORDER BY ltm_eur DESC
                LIMIT 50
            """),
            {"aid": aid},
        ).fetchall()
    except Exception:
        logger.exception("customer_fanout._load_customer_ids_for_aid aid=%s", aid)
        return []
    return [str(r[0]) for r in rows if r[0] is not None]


def _load_active_proposals_for_aid(
    *, aid: str, db_session: Session
) -> set[str]:
    """Set of customer_ids with an active (draft/submitted) proposal on this aid.

    Pulls ``pricing_proposals`` filtered by article_id + status; reads
    ``payload->>'customer_id'`` for the per-customer association.
    """
    from sqlalchemy import text
    try:
        rows = db_session.execute(
            text("""
                SELECT payload->>'customer_id' AS customer_id
                FROM pricing_proposals
                WHERE article_id = :aid
                  AND status IN ('draft', 'submitted', 'pending')
            """),
            {"aid": aid},
        ).fetchall()
    except Exception:
        logger.exception(
            "customer_fanout._load_active_proposals_for_aid aid=%s", aid
        )
        return set()
    out: set[str] = set()
    for r in rows:
        if r[0]:
            out.add(str(r[0]))
    return out


# ---------------------------------------------------------------------------
# Composer.
# ---------------------------------------------------------------------------


def build_customer_fanout(
    *,
    aid: str,
    proposed_price: Optional[Decimal] = None,
    db_session: Session,
    top_n: int = 6,
) -> dict[str, Any]:
    """Build the customer-fanout payload for (aid, proposed_price).

    Returns:
        {
            "aid": aid,
            "proposed_price": str | null,
            "rows": list[FanoutRow],
            "lineage_ref": str (uuid),
        }
    """
    cache_key = (aid, canonical_price_key(proposed_price))
    cached = _CACHE.get(cache_key)
    now = time.monotonic()
    if cached is not None and now - cached[0] < _CACHE_TTL_SECONDS:
        return cached[1]

    customer_ids = _load_customer_ids_for_aid(aid=aid, db_session=db_session)
    active = _load_active_proposals_for_aid(aid=aid, db_session=db_session)

    rows: list[dict[str, Any]] = []
    last_lineage_id: Optional[UUID] = None
    for cid in customer_ids[: max(top_n, 0)]:
        try:
            cos = build_customer_on_sku(
                aid=aid,
                customer_id=cid,
                proposed_price=proposed_price,
                db_session=db_session,
            )
        except Exception:
            logger.exception("customer_fanout build_customer_on_sku aid=%s cid=%s",
                             aid, cid)
            continue
        rows.append(
            _serialize_row(cos=cos, proposal_queued=cid in active)
        )
        if cos.lineage_ref is not None:
            last_lineage_id = cos.lineage_ref.id

    payload: dict[str, Any] = {
        "aid": aid,
        "proposed_price": (
            str(proposed_price) if proposed_price is not None else None
        ),
        "rows": rows,
        "lineage_ref": str(last_lineage_id) if last_lineage_id is not None else None,
    }
    _CACHE[cache_key] = (now, payload)
    return payload
