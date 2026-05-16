"""Competitor reference index — derived from lost-quote rejection codes.

When Scherzinger loses a quote with rejection_code in (``PA``, ``PR``)
the lost unit price is the best competitor signal we have ("they got it
for €X"). We aggregate the last ``n_days`` worth, take the median, and
attach lineage. ``sample_count == 0`` returns ``None`` — the caller
renders a "no competitor signal" badge instead.
"""
from __future__ import annotations

import logging
from datetime import datetime, timedelta, timezone
from decimal import Decimal
from typing import Optional

import numpy as np
from sqlalchemy import text
from sqlalchemy.orm import Session

from backend.models.pricing.competitor import CompetitorRef
from backend.models.pricing.lineage import LineageRef, LineageSourceKind
from backend.services.pricing.lineage import create_lineage

logger = logging.getLogger(__name__)


_LOST_QUOTE_SQL = text(
    """
    SELECT (q.revenue / NULLIF(q.quantity, 0))::numeric AS unit_price,
           q.date AS quote_date
      FROM quotes q
     WHERE q.article_id = :aid
       AND q.is_won = FALSE
       AND q.rejection_code IN ('PA', 'PR')
       AND q.revenue IS NOT NULL
       AND q.quantity IS NOT NULL
       AND q.quantity > 0
       AND q.date >= :since
    """
)


def build_competitor_ref(
    *,
    aid: str,
    n_days: int = 90,
    db_session: Session,
) -> Optional[CompetitorRef]:
    """Median lost-quote unit price over the last ``n_days``.

    Returns ``None`` when there are no PA/PR rejections in window.
    """
    since = (datetime.now(timezone.utc) - timedelta(days=n_days)).date()
    # The SQL only binds :aid and :since; ``n_days`` is consumed locally
    # to derive ``since`` so we don't pass it as a no-op SQL parameter.
    rows = db_session.execute(
        _LOST_QUOTE_SQL, {"aid": aid, "since": since}
    ).fetchall()

    prices: list[Decimal] = []
    last_seen: Optional[datetime] = None
    for r in rows:
        if r[0] is None:
            continue
        prices.append(Decimal(str(r[0])))
        dt = r[1]
        if dt is not None:
            # ``q.date`` is a Date; promote to a datetime so the wire shape
            # always serialises as ISO 8601.
            if isinstance(dt, datetime):
                cand = dt
            else:
                cand = datetime(dt.year, dt.month, dt.day, tzinfo=timezone.utc)
            if last_seen is None or cand > last_seen:
                last_seen = cand

    if not prices:
        return None

    arr = np.array([float(p) for p in prices], dtype=float)
    median_price = Decimal(str(float(np.median(arr))))

    lineage_row = create_lineage(
        source_kind=LineageSourceKind.COMPETITOR_FEED,
        source_id=f"competitor:{aid}",
        sql=str(_LOST_QUOTE_SQL),
        model="competitor_median_v1",
        computed_by="system",
        session=db_session,
    )
    lineage = LineageRef(
        id=lineage_row.id,
        source_kind=lineage_row.source_kind,
        source_id=lineage_row.source_id,
        sql=lineage_row.sql,
        model=lineage_row.model,
        computed_at=lineage_row.computed_at,
        computed_by=lineage_row.computed_by,
    )
    return CompetitorRef(
        aid=aid,
        median_price=median_price,
        sample_count=len(prices),
        last_seen=last_seen or datetime.now(timezone.utc),
        window_days=n_days,
        lineage_ref=lineage,
    )
