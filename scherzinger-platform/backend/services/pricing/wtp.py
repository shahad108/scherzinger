"""Willingness-to-pay (WTP) band — won-deal percentiles per SKU × tier.

Computes p10/p50/p90 of historic ``revenue / quantity`` on won deals over
a rolling ``window_days`` window, plus a coarse confidence bucket that
reflects both sample size and band tightness.

The caller (recommender) treats ``confidence == "low"`` as a signal to
fall back to cluster-anchor prices; we emit a structured log line so the
fallback path is observable in prod.
"""
from __future__ import annotations

import logging
from datetime import timedelta
from decimal import Decimal
from typing import Optional

import numpy as np
from sqlalchemy import text
from sqlalchemy.orm import Session

from backend.models.pricing.lineage import LineageSourceKind
from backend.models.pricing.recommendation import ConfidenceLevel
from backend.models.pricing.wtp import WtpBand
from backend.services.pricing.lineage import create_lineage

logger = logging.getLogger(__name__)


# Won-deal sample for a SKU × optional tier slice. ``quotes`` carries the
# raw revenue + quantity, so the per-unit price = revenue / quantity. The
# tier filter is left optional — when None we aggregate every won deal on
# the SKU.
_WTP_SQL = text(
    """
    SELECT (q.revenue / NULLIF(q.quantity, 0))::numeric AS unit_price
      FROM quotes q
     WHERE q.article_id = :aid
       AND q.is_won = TRUE
       AND q.revenue IS NOT NULL
       AND q.quantity IS NOT NULL
       AND q.quantity > 0
       AND q.date >= :since
       AND (:tier IS NULL OR q.business_unit = :tier)
    """
)


def _bucket(n_deals: int, p10: Decimal, p50: Decimal, p90: Decimal) -> ConfidenceLevel:
    """Confidence rule per Phase 1 spec.

    - n < 5            → LOW
    - 5 ≤ n < 15       → MED
    - n ≥ 15           → HIGH
    - (p90-p10)/p50 > 0.5 forces LOW regardless of n.
    """
    if p50 > 0 and (p90 - p10) / p50 > Decimal("0.5"):
        return ConfidenceLevel.LOW
    if n_deals < 5:
        return ConfidenceLevel.LOW
    if n_deals < 15:
        return ConfidenceLevel.MED
    return ConfidenceLevel.HIGH


def build_wtp(
    *,
    aid: str,
    tier: Optional[str] = None,
    window_days: int = 540,
    db_session: Session,
) -> Optional[WtpBand]:
    """Return the WTP band for ``aid`` (× ``tier`` if given).

    Returns ``None`` when the won-deal sample is empty — caller should
    treat that as "no signal" and either fall back to cluster anchors or
    omit the WTP card.
    """
    # Window cutoff — we query ``quotes.date`` which is a Date column.
    from datetime import datetime, timezone

    since = (datetime.now(timezone.utc) - timedelta(days=window_days)).date()
    rows = db_session.execute(
        _WTP_SQL, {"aid": aid, "tier": tier, "since": since}
    ).fetchall()
    prices = [Decimal(str(r[0])) for r in rows if r[0] is not None]
    if not prices:
        return None

    arr = np.array([float(p) for p in prices], dtype=float)
    p10 = Decimal(str(float(np.percentile(arr, 10))))
    p50 = Decimal(str(float(np.percentile(arr, 50))))
    p90 = Decimal(str(float(np.percentile(arr, 90))))
    confidence = _bucket(len(prices), p10, p50, p90)

    if confidence == ConfidenceLevel.LOW:
        logger.warning(
            "wtp.low_confidence aid=%s tier=%s n=%d span=%s — caller "
            "should fall back to cluster anchor prices",
            aid,
            tier,
            len(prices),
            (p90 - p10),
        )

    lineage = create_lineage(
        source_kind=LineageSourceKind.WON_DEAL_SAMPLE,
        source_id=f"wtp:{aid}:{tier or 'all'}",
        sql=str(_WTP_SQL),
        model="wtp_percentile_v1",
        computed_by="system",
        session=db_session,
    )
    return WtpBand(
        aid=aid,
        tier=tier,
        p10=p10,
        p50=p50,
        p90=p90,
        n_deals=len(prices),
        window_days=window_days,
        confidence=confidence,
        lineage_ref=_lineage_wire(lineage),
    )


def _lineage_wire(row) -> "object":
    """Materialise a wire-shape LineageRef from a freshly-flushed row."""
    from backend.models.pricing.lineage import LineageRef

    return LineageRef(
        id=row.id,
        source_kind=row.source_kind,
        source_id=row.source_id,
        sql=row.sql,
        model=row.model,
        computed_at=row.computed_at,
        computed_by=row.computed_by,
    )
