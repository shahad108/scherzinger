"""Phase E (E3) — quote-history service tests.

Exercises the SQL path against the real DB session so we know the
``Quote`` + ``QuoteInvoiceLink`` join works end-to-end. Each test
inserts uniquely-prefixed test rows so they remain isolated regardless
of seed/demo data already present in the dev DB.
"""
from __future__ import annotations

import uuid
from datetime import date, timedelta

import pytest
from sqlalchemy.orm import Session

from backend.database import SessionLocal
from backend.models.linkage import QuoteInvoiceLink
from backend.models.quote import Quote
from backend.services.pricing import quote_history as qh


def _unique_aid(prefix: str) -> str:
    """Generate a deterministic-but-unique aid so tests don't collide."""
    return f"{prefix}-{uuid.uuid4().hex[:10].upper()}"


def _make_quote(
    *,
    aid: str,
    quote_id: str,
    position: int = 1,
    is_won: bool = True,
    status_str: str = "Won",
    rejection_code: str | None = None,
    quote_date: date | None = None,
    revenue: float | None = 100.0,
    db2_margin: float | None = 0.25,
    quantity: int | None = 1,
    customer_id: str = "CUST-TEST",
) -> Quote:
    today = date.today()
    qd = quote_date or today
    return Quote(
        quote_id=quote_id,
        position=position,
        status_code=1 if is_won else 0,
        status=status_str,
        is_won=is_won,
        date=qd,
        customer_id=customer_id,
        article_id=aid,
        currency="EUR",
        quantity=quantity,
        revenue=revenue,
        db2_margin=db2_margin,
        rejection_code=rejection_code,
        rejection_code_reliable=False,
        year=qd.year,
        quarter=((qd.month - 1) // 3) + 1,
        month=qd.month,
        dq_missing_cost=False,
        dq_100pct_margin=False,
        dq_any_issue=False,
    )


@pytest.fixture
def session() -> Session:
    s = SessionLocal()
    try:
        yield s
    finally:
        s.rollback()
        s.close()


def test_quote_history_returns_live_with_rows(session: Session) -> None:
    """3 quotes (2 won, 1 lost) → status=live, n_won=2, win_rate=0.6667."""
    aid = _unique_aid("QH-LIVE")
    today = date.today()

    session.add_all(
        [
            _make_quote(
                aid=aid,
                quote_id=f"Q-{aid}-A",
                quote_date=today,
                is_won=True,
                status_str="Won",
            ),
            _make_quote(
                aid=aid,
                quote_id=f"Q-{aid}-B",
                quote_date=today - timedelta(days=1),
                is_won=True,
                status_str="Won",
            ),
            _make_quote(
                aid=aid,
                quote_id=f"Q-{aid}-C",
                quote_date=today - timedelta(days=2),
                is_won=False,
                status_str="Lost",
                rejection_code="PA",
            ),
        ]
    )
    session.flush()

    result = qh.get_quote_history(session, aid=aid, limit=50)

    assert result["status"] == "live"
    assert result["reason"] is None
    assert len(result["rows"]) == 3
    assert result["summary"] == {
        "n_total": 3,
        "n_won": 2,
        "n_lost": 1,
        "win_rate": "0.6667",
    }
    # Ordering: most recent first.
    assert result["rows"][0]["quote_id"] == f"Q-{aid}-A"
    # lineage_ref_id is a UUID string.
    assert result["lineage_ref_id"] is not None
    uuid.UUID(result["lineage_ref_id"])  # parses without error.

    # Decimal-as-string contract.
    first = result["rows"][0]
    assert isinstance(first["revenue"], str)
    assert isinstance(first["quoted_db2_margin"], str)


def test_quote_history_returns_empty_when_no_quotes(session: Session) -> None:
    aid = _unique_aid("QH-EMPTY")  # no rows inserted

    result = qh.get_quote_history(session, aid=aid, limit=50)

    assert result["status"] == "empty"
    assert result["reason"] == "No quote history for SKU"
    assert result["rows"] == []
    assert result["summary"] == {
        "n_total": 0,
        "n_won": 0,
        "n_lost": 0,
        "win_rate": None,
    }
    assert result["lineage_ref_id"] is None


def test_quote_history_includes_actual_margin_for_won_with_link(
    session: Session,
) -> None:
    """A won quote with a matching quote_invoice_links row must carry the
    realised ``actual_db2_margin`` and ``margin_gap`` values.
    """
    aid = _unique_aid("QH-LINK")
    quote_id = f"Q-{aid}-W"

    session.add(
        _make_quote(
            aid=aid,
            quote_id=quote_id,
            position=1,
            is_won=True,
            status_str="Won",
            db2_margin=0.30,
            revenue=200.0,
        )
    )
    session.add(
        QuoteInvoiceLink(
            quote_id=quote_id,
            quote_position=1,
            invoice_id=f"INV-{aid}",
            invoice_position=1,
            order_id=f"ORD-{aid}",
            match_type="direct_auftrag",
            quoted_db2_margin=0.30,
            actual_db2_margin=0.27,
            margin_gap=-0.03,
            days_to_invoice=14,
        )
    )
    session.flush()

    result = qh.get_quote_history(session, aid=aid, limit=50)

    assert result["status"] == "live"
    assert len(result["rows"]) == 1
    row = result["rows"][0]
    assert row["is_won"] is True
    assert row["actual_db2_margin"] is not None
    assert row["actual_db2_margin"].startswith("0.27")
    assert row["margin_gap"] is not None
    assert row["margin_gap"].startswith("-0.03")


def test_quote_history_won_without_link_returns_null_actual_margin(
    session: Session,
) -> None:
    """A won quote with NO matching ``quote_invoice_links`` row must still be
    returned, with ``actual_db2_margin`` and ``margin_gap`` both ``None``.

    Regression guard against future refactors of the LEFT JOIN that might
    silently drop won quotes lacking realised-margin data.
    """
    aid = _unique_aid("QH-NOLINK")
    quote_id = f"Q-{aid}-W"

    session.add(
        _make_quote(
            aid=aid,
            quote_id=quote_id,
            position=1,
            is_won=True,
            status_str="Won",
            db2_margin=0.30,
            revenue=200.0,
        )
    )
    session.flush()

    result = qh.get_quote_history(session, aid=aid, limit=50)

    assert result["status"] == "live"
    assert len(result["rows"]) == 1
    row = result["rows"][0]
    assert row["is_won"] is True
    assert row["actual_db2_margin"] is None
    assert row["margin_gap"] is None
    # Quoted margin should still flow through from the quote itself.
    assert row["quoted_db2_margin"] is not None
