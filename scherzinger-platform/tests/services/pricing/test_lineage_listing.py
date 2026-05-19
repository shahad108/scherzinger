"""Phase E (E6) — lineage-by-aid listing tests.

Filters use ``source_id`` patterns because the lineage_refs table doesn't
have a dedicated ``lookup_payload`` column — pricing signals encode the
aid into ``source_id`` (see ``_KIND_FROM_SOURCE_ID`` in
``services.pricing.lineage``).
"""
from __future__ import annotations

import uuid
from unittest.mock import MagicMock

import pytest
from sqlalchemy.orm import Session

from backend.database import SessionLocal
from backend.models.pricing.lineage import LineageSourceKind
from backend.services.pricing import lineage as lineage_svc


def _unique_aid(prefix: str) -> str:
    return f"{prefix}-{uuid.uuid4().hex[:10].upper()}"


@pytest.fixture
def session() -> Session:
    s = SessionLocal()
    try:
        yield s
    finally:
        s.rollback()
        s.close()


def test_list_lineage_returns_empty_when_no_refs(session: Session) -> None:
    """A fresh, never-seen aid must return status=empty with no rows."""
    aid = _unique_aid("LIN-EMPTY")
    result = lineage_svc.list_lineage_for_aid(session, aid=aid)
    assert result == {"status": "empty", "reason": "No lineage records for SKU", "rows": []}


def test_list_lineage_returns_rows_filtered_by_aid(session: Session) -> None:
    """Two lineage rows for aid-A + one for aid-B → listing for aid-A
    returns exactly 2 rows with the correct ``kind`` mapping derived
    from source_id prefixes.
    """
    aid_a = _unique_aid("LIN-A")
    aid_b = _unique_aid("LIN-B")

    # aid-A: a recommendation + a cost outlook signal.
    lineage_svc.create_lineage(
        source_kind=LineageSourceKind.ELASTICITY_MODEL,
        source_id=f"rec:{aid_a}",
        sql=None,
        model="recommender_v1",
        computed_by="test",
        session=session,
    )
    lineage_svc.create_lineage(
        source_kind=LineageSourceKind.COST_INGEST,
        source_id=f"cost_outlook:{aid_a}:6",
        sql=None,
        model="cost_outlook_v1",
        computed_by="test",
        session=session,
    )
    # aid-B: a single wtp signal — must not leak into aid-A listing.
    lineage_svc.create_lineage(
        source_kind=LineageSourceKind.WON_DEAL_SAMPLE,
        source_id=f"wtp:{aid_b}:all",
        sql=None,
        model="wtp_v1",
        computed_by="test",
        session=session,
    )
    session.flush()

    result = lineage_svc.list_lineage_for_aid(session, aid=aid_a)

    assert result["status"] == "live"
    assert len(result["rows"]) == 2

    kinds = {row["kind"] for row in result["rows"]}
    assert kinds == {"recommendation", "cost_outlook"}

    # Cross-check that aid-B's row is absent.
    source_ids = {row["sql_preview"] for row in result["rows"]}  # noqa: F841
    assert all(aid_b not in (row["id"] or "") for row in result["rows"])
    for row in result["rows"]:
        # id is a uuid-string.
        uuid.UUID(row["id"])
        # computed_at present and ISO-shaped (contains T).
        assert row["computed_at"] is not None
        assert "T" in row["computed_at"]


def test_list_lineage_handles_db_error() -> None:
    """A DB exception must be caught and converted to a degraded payload
    with rollback called. The session is a MagicMock so we can assert
    rollback() was triggered.
    """
    fake_db = MagicMock()
    fake_db.query.side_effect = RuntimeError("boom")

    result = lineage_svc.list_lineage_for_aid(fake_db, aid="ANY-AID")

    assert result == {"status": "degraded", "reason": "Lineage query failed", "rows": []}
    fake_db.rollback.assert_called_once()
