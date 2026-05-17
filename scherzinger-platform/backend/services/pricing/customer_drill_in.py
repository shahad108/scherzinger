"""Phase 2.2.4 (Pricing Studio v3) — customer drill-in composer.

Powers the Customer Drill-in side panel:

    GET /api/v1/pricing/customer/{customer_id}/sku/{aid}/drill-in

Returns:
    customer:           { id, name, tier }
    this_sku:           CustomerOnSku (all extended fields)
    at_proposed?:       { delta_vs_last_paid, delta_pct, risk_if_moved }
    wallet_top_skus:    list[{ aid, share_pct, ltm_eur }]   (top 5)
    history_on_sku:     list[{ date, price, units, won }]   (24mo)
    lineage_ref:        uuid

Cache: by (customer_id, aid, proposed_price) — 60s TTL.
"""
from __future__ import annotations

import logging
import time
from decimal import Decimal, ROUND_HALF_UP
from typing import Any, Optional

from sqlalchemy import text
from sqlalchemy.orm import Session

from backend.services.pricing.cache_keys import canonical_price_key
from backend.services.pricing.customer_on_sku import (
    _load_customer_master,
    build_customer_on_sku,
)
from backend.services.pricing.customer_risk import risk_if_moved

logger = logging.getLogger(__name__)


_CACHE_TTL_SECONDS = 60.0
_CACHE: dict[
    tuple[str, str, str], tuple[float, dict[str, Any]]
] = {}


def invalidate_cache() -> None:
    _CACHE.clear()


def _load_wallet_top_skus(
    *, customer_id: str, db_session: Session, limit: int = 5
) -> list[dict[str, Any]]:
    """Top SKUs by LTM EUR for the customer + share of wallet.

    Share is computed against the customer's LTM EUR across all SKUs so
    the per-row pct values sum to ≤ 1.
    """
    try:
        rows = db_session.execute(
            text("""
                WITH ltm AS (
                  SELECT article_id, SUM(revenue) AS rev
                  FROM invoices
                  WHERE customer_id = :cid
                    AND date >= (SELECT MAX(date) - INTERVAL '12 months' FROM invoices)
                  GROUP BY article_id
                ),
                tot AS (SELECT SUM(rev) AS total FROM ltm)
                SELECT ltm.article_id, ltm.rev, tot.total
                FROM ltm, tot
                ORDER BY ltm.rev DESC
                LIMIT :lim
            """),
            {"cid": customer_id, "lim": limit},
        ).fetchall()
    except Exception:
        logger.exception(
            "customer_drill_in._load_wallet_top_skus cid=%s", customer_id
        )
        return []
    out: list[dict[str, Any]] = []
    for r in rows:
        rev = Decimal(str(r[1] or 0))
        total = Decimal(str(r[2] or 0))
        share = (
            (rev / total).quantize(Decimal("0.0001"), rounding=ROUND_HALF_UP)
            if total > 0
            else Decimal("0")
        )
        out.append(
            {
                "aid": str(r[0]),
                "share_pct": str(share),
                "ltm_eur": str(rev.quantize(Decimal("0.01"))),
            }
        )
    return out


def _load_history_on_sku(
    *, customer_id: str, aid: str, db_session: Session, months: int = 24
) -> list[dict[str, Any]]:
    """24-month per-transaction history for the (customer, SKU)."""
    try:
        rows = db_session.execute(
            text("""
                SELECT date, unit_price, quantity, revenue
                FROM invoices
                WHERE customer_id = :cid
                  AND article_id = :aid
                  AND date >= (
                    SELECT MAX(date) - (:months || ' months')::INTERVAL FROM invoices
                  )
                ORDER BY date ASC
            """),
            {"cid": customer_id, "aid": aid, "months": months},
        ).fetchall()
    except Exception:
        logger.exception(
            "customer_drill_in._load_history_on_sku cid=%s aid=%s", customer_id, aid
        )
        return []
    out: list[dict[str, Any]] = []
    for r in rows:
        out.append(
            {
                "date": r[0].isoformat() if r[0] is not None else None,
                "price": str(Decimal(str(r[1]))) if r[1] is not None else None,
                "units": int(r[2] or 0),
                # "won" is True iff invoiced — see customer_on_sku for the same convention.
                "won": True,
            }
        )
    return out


def _at_proposed_block(
    *,
    last_paid: Optional[Decimal],
    proposed_price: Decimal,
    churn_p: Optional[Decimal],
    wallet_share_pct: Optional[Decimal],
) -> dict[str, Any]:
    """Compute the at_proposed price-delta + risk block."""
    delta_vs_last_paid: Optional[Decimal]
    delta_pct: Optional[Decimal]
    if last_paid is None or last_paid == 0:
        delta_vs_last_paid = None
        delta_pct = None
    else:
        delta_vs_last_paid = (proposed_price - last_paid).quantize(
            Decimal("0.0001"), rounding=ROUND_HALF_UP
        )
        delta_pct = (
            (proposed_price - last_paid) / last_paid * Decimal("100")
        ).quantize(Decimal("0.0001"), rounding=ROUND_HALF_UP)

    risk: Optional[Decimal] = None
    if churn_p is not None and delta_pct is not None:
        risk = risk_if_moved(
            churn_p=churn_p,
            wallet_share_pct=wallet_share_pct or Decimal("0"),
            delta_pct=delta_pct,
        )
    return {
        "delta_vs_last_paid": (
            str(delta_vs_last_paid) if delta_vs_last_paid is not None else None
        ),
        "delta_pct": str(delta_pct) if delta_pct is not None else None,
        "risk_if_moved": str(risk) if risk is not None else None,
    }


def _serialize_cos(cos) -> dict[str, Any]:
    return {
        "aid": cos.aid,
        "customer_id": cos.customer_id,
        "last_paid": str(cos.last_paid) if cos.last_paid is not None else None,
        "last_paid_at": (
            cos.last_paid_at.isoformat() if cos.last_paid_at is not None else None
        ),
        "ltm_units": cos.ltm_units,
        "ltm_eur": str(cos.ltm_eur) if cos.ltm_eur is not None else None,
        "churn_p": str(cos.churn_p) if cos.churn_p is not None else None,
        "decline_p": str(cos.decline_p) if cos.decline_p is not None else None,
        "risk_if_moved": (
            str(cos.risk_if_moved) if cos.risk_if_moved is not None else None
        ),
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
        "tier": cos.tier.value,
    }


def build_drill_in(
    *,
    customer_id: str,
    aid: str,
    proposed_price: Optional[Decimal] = None,
    db_session: Session,
) -> Optional[dict[str, Any]]:
    """Compose the drill-in payload. Returns None when customer doesn't exist."""
    cache_key = (
        customer_id,
        aid,
        canonical_price_key(proposed_price),
    )
    cached = _CACHE.get(cache_key)
    now = time.monotonic()
    if cached is not None and now - cached[0] < _CACHE_TTL_SECONDS:
        return cached[1]

    # Existence check — relies on master + invoice history. If both are
    # empty, this customer has nothing to drill into.
    master = _load_customer_master(customer_id=customer_id, db_session=db_session)
    history = _load_history_on_sku(
        customer_id=customer_id, aid=aid, db_session=db_session
    )
    # When we got a synthesized "Customer {id}" name AND no history, treat
    # as 404. Master-loader never raises (returns default) — distinguish
    # by checking the invoices table for any rows.
    if master["name"].startswith("Customer ") and not history:
        # Final disambiguation: any invoice rows at all for this customer?
        try:
            row = db_session.execute(
                text("SELECT 1 FROM invoices WHERE customer_id = :cid LIMIT 1"),
                {"cid": customer_id},
            ).fetchone()
        except Exception:
            row = None
        if row is None:
            return None

    cos = build_customer_on_sku(
        aid=aid,
        customer_id=customer_id,
        proposed_price=proposed_price,
        db_session=db_session,
    )

    at_proposed: Optional[dict[str, Any]] = None
    if proposed_price is not None:
        at_proposed = _at_proposed_block(
            last_paid=cos.last_paid,
            proposed_price=proposed_price,
            churn_p=cos.churn_p,
            wallet_share_pct=cos.wallet_share_pct,
        )

    wallet_top = _load_wallet_top_skus(
        customer_id=customer_id, db_session=db_session
    )

    payload: dict[str, Any] = {
        "customer": {
            "id": customer_id,
            "name": master["name"],
            "tier": master["tier"],
        },
        "this_sku": _serialize_cos(cos),
        "at_proposed": at_proposed,
        "wallet_top_skus": wallet_top,
        "history_on_sku": history,
        "lineage_ref": (
            str(cos.lineage_ref.id) if cos.lineage_ref is not None else None
        ),
    }
    _CACHE[cache_key] = (now, payload)
    return payload
