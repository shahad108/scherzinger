"""Phase 4 (Pricing Studio v3) — audit_query read-side tests.

Specifically targets the SF2 perf fix: the audit endpoint must not
allocate a fresh ``lineage_refs`` row on every read. The first non-empty
call materializes one lineage row; subsequent identical calls reuse the
cached value within the 30s TTL. Empty paginations skip the INSERT
entirely.
"""
from __future__ import annotations

from datetime import datetime, timezone
from typing import Iterator
from uuid import uuid4

import pytest

from backend.database import SessionLocal
from backend.models.pricing.audit import (
    PricingAuditAction,
    PricingAuditTargetKind,
)
from backend.models.pricing.lineage import LineageRefRow
from backend.services.pricing.audit import record_audit
from backend.services.pricing.audit_query import (
    invalidate_cache,
    list_audit_for_sku,
)


@pytest.fixture
def db() -> Iterator:
    s = SessionLocal()
    try:
        yield s
    finally:
        s.rollback()
        s.close()


@pytest.fixture
def aid() -> str:
    return f"AQ-{uuid4().hex[:8].upper()}"


@pytest.fixture(autouse=True)
def _clear_cache() -> Iterator[None]:
    invalidate_cache()
    yield
    invalidate_cache()


def test_empty_audit_query_does_not_insert_lineage(db, aid) -> None:
    """SF2 — an empty audit list (no matching rows) must NOT insert a
    ``lineage_refs`` row. The endpoint is hit on every drawer poll, so
    writing a row per empty read is straight bloat.
    """
    before_count = db.query(LineageRefRow).count()
    rows, total, lineage_ref_id = list_audit_for_sku(aid=aid, db_session=db)
    after_count = db.query(LineageRefRow).count()

    assert rows == []
    assert total == 0
    assert lineage_ref_id is None
    assert after_count == before_count


def test_repeated_audit_query_reuses_cached_lineage(db, aid) -> None:
    """SF2 — two consecutive identical reads must insert exactly one
    lineage row total. The cache stores ``lineage_ref_id`` alongside
    rows/total so the second call returns the same UUID without any
    new INSERT.
    """
    # Seed one matching audit row.
    record_audit(
        actor="frank",
        action=PricingAuditAction.PRICE_SET,
        target_kind=PricingAuditTargetKind.SKU,
        target_id=aid,
        after={"aid": aid, "price": "5.10"},
        session=db,
    )
    db.flush()

    before_count = db.query(LineageRefRow).count()

    rows1, total1, lineage1 = list_audit_for_sku(aid=aid, db_session=db)
    after_first = db.query(LineageRefRow).count()

    rows2, total2, lineage2 = list_audit_for_sku(aid=aid, db_session=db)
    after_second = db.query(LineageRefRow).count()

    assert total1 == total2 == 1
    assert len(rows1) == len(rows2) == 1
    assert lineage1 is not None
    assert lineage1 == lineage2
    # Exactly ONE new lineage row across both calls.
    assert after_first == before_count + 1
    assert after_second == after_first, (
        f"second identical read inserted "
        f"{after_second - after_first} extra lineage row(s)"
    )
