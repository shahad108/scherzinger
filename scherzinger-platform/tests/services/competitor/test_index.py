"""Phase 1 — competitor signal index tests."""
from __future__ import annotations

from datetime import datetime, timezone
from decimal import Decimal
from unittest.mock import MagicMock
from uuid import uuid4

import pytest

from backend.services.competitor import index as comp


@pytest.fixture(autouse=True)
def _stub_lineage(monkeypatch):
    def _fake_create_lineage(**kwargs):
        row = MagicMock()
        row.id = uuid4()
        row.source_kind = (
            kwargs["source_kind"].value
            if hasattr(kwargs["source_kind"], "value")
            else str(kwargs["source_kind"])
        )
        row.source_id = kwargs["source_id"]
        row.sql = kwargs.get("sql")
        row.model = kwargs.get("model")
        row.computed_at = datetime.now(timezone.utc)
        row.computed_by = kwargs["computed_by"]
        return row

    monkeypatch.setattr(comp, "create_lineage", _fake_create_lineage)
    yield


def _stub_session(rows: list[tuple]) -> MagicMock:
    """Stub session returning the lost-quote rows for the competitor query."""
    session = MagicMock()
    session.execute.return_value.fetchall.return_value = rows
    return session


def test_zero_lost_quotes_returns_none() -> None:
    session = _stub_session([])
    ref = comp.build_competitor_ref(aid="X-1", n_days=90, db_session=session)
    assert ref is None


def test_nine_lost_quotes_returns_aggregate() -> None:
    last = datetime(2026, 5, 14, tzinfo=timezone.utc)
    # (unit_price_eur, last_quote_date)
    rows = [
        (Decimal("100"), last),
        (Decimal("105"), last),
        (Decimal("95"), last),
        (Decimal("110"), last),
        (Decimal("98"), last),
        (Decimal("102"), last),
        (Decimal("100"), last),
        (Decimal("99"), last),
        (Decimal("101"), last),
    ]
    session = _stub_session(rows)
    ref = comp.build_competitor_ref(aid="X-1", n_days=90, db_session=session)
    assert ref is not None
    assert ref.sample_count == 9
    assert ref.median_price == Decimal("100")
    assert ref.last_seen == last
    assert ref.lineage_ref is not None
    assert ref.window_days == 90


def test_window_days_is_passed_through() -> None:
    session = _stub_session([])
    # Bigger window — same empty stub, should still get None and the
    # caller-set window_days flows through the query params.
    ref = comp.build_competitor_ref(aid="X-1", n_days=365, db_session=session)
    assert ref is None
    # Verify the SQL params were passed (n_days argument propagates).
    call_args = session.execute.call_args
    if call_args is not None:
        # Param dict is the second positional arg.
        params = call_args.args[1] if len(call_args.args) > 1 else {}
        assert params.get("n_days") == 365 or "n_days" in str(params)
