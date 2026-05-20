"""Phase 4 (Pricing Studio v3) — diff composer unit tests.

These tests exercise ``build_diff`` against a real DB session so the
``pricing_audit`` / ``cost_state`` / ``customer_on_sku_snapshot`` SQL
predicates are honest. Each test uses an isolated aid + customer prefix
to avoid colliding with seed data.
"""
from __future__ import annotations

from datetime import datetime, timedelta, timezone
from decimal import Decimal
from typing import Iterator
from unittest.mock import MagicMock, patch
from uuid import uuid4

import pytest

from backend.database import SessionLocal
from backend.models.pricing.audit import (
    PricingAuditAction,
    PricingAuditEntry,
    PricingAuditTargetKind,
)
from backend.models.pricing.cost_state import CostStateRow
from backend.models.pricing.customer_on_sku import CustomerOnSkuSnapshotRow
from backend.models.pricing.diff import ChangeKind
from backend.services.pricing.audit import record_audit
from backend.services.pricing.diff import build_diff


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
    return f"DIFF-{uuid4().hex[:8].upper()}"


# ---------------------------------------------------------------------------
# Cost diff
# ---------------------------------------------------------------------------


def test_cost_diff_captures_pct_change(db, aid):
    # Seed CostState at current cost = 88.0
    db.add(CostStateRow(aid=aid, unit_cost=Decimal("88.00"), breakdown={}))
    # Audit row: cost at 80.0 from 3 days ago.
    three_days_ago = datetime.now(timezone.utc) - timedelta(days=3)
    record_audit(
        actor="system",
        action=PricingAuditAction.OVERRIDE_ADDED,
        target_kind=PricingAuditTargetKind.SKU,
        target_id=aid,
        after={"aid": aid, "unit_cost": "80.00"},
        session=db,
    )
    # Reach into the row to backdate it.
    entry = db.query(PricingAuditEntry).filter_by(target_id=aid).one()
    entry.at = three_days_ago
    db.flush()

    since = datetime.now(timezone.utc) - timedelta(days=1)
    summary = build_diff(aid=aid, since=since, db_session=db)

    cost_changes = [c for c in summary.changes if c.kind == ChangeKind.COST]
    assert len(cost_changes) == 1
    c = cost_changes[0]
    assert c.before == Decimal("80.00")
    assert c.after == Decimal("88.00")
    # +10% change.
    assert c.pct is not None and c.pct == Decimal("10.00")


def test_cost_diff_skips_when_no_change(db, aid):
    db.add(CostStateRow(aid=aid, unit_cost=Decimal("80.00"), breakdown={}))
    record_audit(
        actor="system",
        action=PricingAuditAction.OVERRIDE_ADDED,
        target_kind=PricingAuditTargetKind.SKU,
        target_id=aid,
        after={"aid": aid, "unit_cost": "80.00"},
        session=db,
    )
    entry = db.query(PricingAuditEntry).filter_by(target_id=aid).one()
    entry.at = datetime.now(timezone.utc) - timedelta(days=3)
    db.flush()

    summary = build_diff(
        aid=aid,
        since=datetime.now(timezone.utc) - timedelta(days=1),
        db_session=db,
    )
    cost_changes = [c for c in summary.changes if c.kind == ChangeKind.COST]
    assert cost_changes == []


def test_competitor_diff_handles_null_gracefully(db, aid):
    """When no competitor signal is available, the diff omits the row.

    Stub the competitor service to return ``None`` and confirm the diff
    summary still composes without raising.
    """
    with patch(
        "backend.services.competitor.index.build_competitor_ref",
        return_value=None,
    ):
        summary = build_diff(
            aid=aid,
            since=datetime.now(timezone.utc) - timedelta(days=1),
            db_session=db,
        )
    assert all(
        c.kind != ChangeKind.COMPETITOR_SIGNAL for c in summary.changes
    )


# ---------------------------------------------------------------------------
# Customer risk diff
# ---------------------------------------------------------------------------


def test_customer_risk_diff_uses_single_query_for_before_values(db, aid):
    """SF4 — ``_diff_customer_risk`` must collapse the per-customer
    ``ORDER BY ... LIMIT 1`` lookups into ONE window-function query.

    Wraps ``db.execute`` to count invocations and asserts <= 2 calls
    for 5 customers (1 for the snapshot fetch, 1 for the windowed
    before-values fetch — NOT 1 + N).
    """
    from datetime import datetime, timedelta, timezone

    from backend.services.pricing.diff import _diff_customer_risk

    customers = [(f"C{i}_{uuid4().hex[:4]}", Decimal(f"0.{20 + i}")) for i in range(5)]
    three_days_ago = datetime.now(timezone.utc) - timedelta(days=3)
    for cid, current_risk in customers:
        db.add(
            CustomerOnSkuSnapshotRow(
                aid=aid,
                customer_id=cid,
                risk_if_moved=current_risk,
                ltm_units=10,
            )
        )
    db.flush()
    for i, (cid, current_risk) in enumerate(customers):
        before = current_risk - Decimal("0.05")
        record_audit(
            actor="system",
            action=PricingAuditAction.OVERRIDE_ADDED,
            target_kind=PricingAuditTargetKind.CUSTOMER,
            target_id=cid,
            after={"aid": aid, "risk_if_moved": str(before)},
            session=db,
        )
    customer_ids = [cid for cid, _ in customers]
    db.query(PricingAuditEntry).filter(
        PricingAuditEntry.target_id.in_(customer_ids)
    ).update({PricingAuditEntry.at: three_days_ago}, synchronize_session=False)
    db.flush()

    # Wrap db.execute so we can count call counts.
    real_execute = db.execute
    calls: list[Any] = []

    def _counting_execute(*args, **kwargs):
        calls.append(args[0] if args else None)
        return real_execute(*args, **kwargs)

    db.execute = _counting_execute  # type: ignore[assignment]
    try:
        changes = _diff_customer_risk(
            aid=aid,
            since=datetime.now(timezone.utc) - timedelta(days=1),
            now=datetime.now(timezone.utc),
            db_session=db,
        )
    finally:
        db.execute = real_execute  # type: ignore[assignment]

    assert len(changes) == 5
    # SF4 acceptance: at most 2 SELECTs total. The pre-fix implementation
    # would issue 1 + N (= 6 for 5 customers).
    assert len(calls) <= 2, (
        f"_diff_customer_risk issued {len(calls)} SELECTs for 5 customers "
        f"— expected <= 2 (snapshot fetch + windowed before-values)"
    )


def test_customer_risk_diff_returns_top_5_by_abs_delta(db, aid):
    """Per-customer risk diff returns top 5 by |delta|, ordered by
    customer_id within the kind for determinism."""
    # Seed 7 customer snapshots with different current risk values.
    customers = [(f"C{i:03d}_{uuid4().hex[:4]}", Decimal(f"0.{i:02d}")) for i in range(7)]
    for cid, current_risk in customers:
        db.add(
            CustomerOnSkuSnapshotRow(
                aid=aid,
                customer_id=cid,
                risk_if_moved=current_risk,
                ltm_units=10,
            )
        )
    db.flush()

    # Seed audit rows: customer i had risk_if_moved = (current - 0.05*i)
    # so |delta| ranges from 0 to 0.30 — top 5 movers are i=2..6.
    three_days_ago = datetime.now(timezone.utc) - timedelta(days=3)
    for i, (cid, current_risk) in enumerate(customers):
        delta = Decimal("0.05") * i
        before = current_risk - delta
        record_audit(
            actor="system",
            action=PricingAuditAction.OVERRIDE_ADDED,
            target_kind=PricingAuditTargetKind.CUSTOMER,
            target_id=cid,
            after={"aid": aid, "risk_if_moved": str(before)},
            session=db,
        )
    # Backdate all the audit rows so they sit before `since`.
    customer_ids = [cid for cid, _ in customers]
    db.query(PricingAuditEntry).filter(
        PricingAuditEntry.target_id.in_(customer_ids)
    ).update({PricingAuditEntry.at: three_days_ago}, synchronize_session=False)
    db.flush()

    summary = build_diff(
        aid=aid,
        since=datetime.now(timezone.utc) - timedelta(days=1),
        db_session=db,
    )
    risk_changes = [
        c for c in summary.changes if c.kind == ChangeKind.CUSTOMER_RISK
    ]
    assert len(risk_changes) == 5

    # Largest |delta| customers must be present (i=6 down to i=2).
    expected_cids = {customers[i][0] for i in range(2, 7)}
    seen_cids = {c.customer_id for c in risk_changes}
    assert seen_cids == expected_cids


# ---------------------------------------------------------------------------
# Proposal diff
# ---------------------------------------------------------------------------


def test_proposal_diff_uses_count_not_full_fetch(db, aid):
    """SF3 — ``_diff_proposal`` must use ``func.count()`` for the count
    instead of materializing all rows in the window. With a 7-day window
    on a hot SKU this matters.

    We assert the behavior by seeding many rows and confirming both
    ``after`` (count) and ``label`` (latest row) are still correct.
    """
    from datetime import datetime, timedelta, timezone

    from backend.services.pricing.diff import _diff_proposal

    now = datetime.now(timezone.utc)
    since = now - timedelta(days=7)
    # Seed 10 proposal_created rows spaced 1h apart, plus 1 trailing
    # proposal_approved as the latest (so the label picks it up).
    for i in range(10):
        record_audit(
            actor="frank",
            action=PricingAuditAction.PROPOSAL_CREATED,
            target_kind=PricingAuditTargetKind.SKU,
            target_id=aid,
            after={"aid": aid, "rec_ref": f"p_{i:04d}"},
            session=db,
        )
    record_audit(
        actor="till",
        action=PricingAuditAction.PROPOSAL_APPROVED,
        target_kind=PricingAuditTargetKind.SKU,
        target_id=aid,
        after={"aid": aid, "proposal_id": "p_LATEST"},
        session=db,
    )
    db.flush()
    # Backdate the first 10 so they're earlier than the approval.
    entries = (
        db.query(PricingAuditEntry)
        .filter_by(target_id=aid)
        .order_by(PricingAuditEntry.at.asc())
        .all()
    )
    for idx, entry in enumerate(entries[:-1]):
        entry.at = now - timedelta(hours=10 - idx)
    db.flush()

    changes = _diff_proposal(aid=aid, since=since, now=now + timedelta(seconds=1), db_session=db)
    assert len(changes) == 1
    c = changes[0]
    assert c.after == Decimal("11")  # 10 created + 1 approved
    # Latest row's proposal_id should be reflected in the label.
    assert "p_LATEST"[:8] in c.label


def test_proposal_diff_empty_window_returns_no_change(db, aid):
    """SF3 — when nothing landed in the window, ``_diff_proposal`` must
    short-circuit on the count and return no DiffChange (no rowset
    materialization, no label query)."""
    from datetime import datetime, timedelta, timezone

    from backend.services.pricing.diff import _diff_proposal

    now = datetime.now(timezone.utc)
    since = now - timedelta(days=7)
    changes = _diff_proposal(aid=aid, since=since, now=now, db_session=db)
    assert changes == []


def test_proposal_diff_counts_in_window(db, aid):
    """A draft + an approval landed in the last day → count == 2."""
    now = datetime.now(timezone.utc)
    record_audit(
        actor="frank",
        action=PricingAuditAction.PROPOSAL_CREATED,
        target_kind=PricingAuditTargetKind.SKU,
        target_id=aid,
        after={"aid": aid, "rec_ref": "p_88a3", "rec_label": "draft #p_88a3"},
        session=db,
    )
    record_audit(
        actor="till",
        action=PricingAuditAction.PROPOSAL_APPROVED,
        target_kind=PricingAuditTargetKind.SKU,
        target_id=aid,
        after={"aid": aid, "proposal_id": "p_88a3"},
        session=db,
    )
    # Bump these to be after `since` and before `now`.
    one_hour_ago = now - timedelta(hours=1)
    db.query(PricingAuditEntry).filter_by(target_id=aid).update(
        {PricingAuditEntry.at: one_hour_ago}, synchronize_session=False
    )
    db.flush()

    summary = build_diff(
        aid=aid,
        since=now - timedelta(days=1),
        now=now + timedelta(seconds=1),
        db_session=db,
    )
    proposals = [c for c in summary.changes if c.kind == ChangeKind.PROPOSAL]
    assert len(proposals) == 1
    assert proposals[0].after == Decimal("2")  # 2 audit events in window.


# ---------------------------------------------------------------------------
# Order
# ---------------------------------------------------------------------------


def test_changes_are_alpha_ordered_by_kind(db, aid):
    db.add(CostStateRow(aid=aid, unit_cost=Decimal("88.00"), breakdown={}))
    record_audit(
        actor="system",
        action=PricingAuditAction.OVERRIDE_ADDED,
        target_kind=PricingAuditTargetKind.SKU,
        target_id=aid,
        after={"aid": aid, "unit_cost": "80.00"},
        session=db,
    )
    db.query(PricingAuditEntry).filter_by(target_id=aid).update(
        {PricingAuditEntry.at: datetime.now(timezone.utc) - timedelta(days=3)},
        synchronize_session=False,
    )
    record_audit(
        actor="frank",
        action=PricingAuditAction.PROPOSAL_CREATED,
        target_kind=PricingAuditTargetKind.SKU,
        target_id=aid,
        after={"aid": aid, "rec_ref": "p_1"},
        session=db,
    )
    db.flush()

    summary = build_diff(
        aid=aid,
        since=datetime.now(timezone.utc) - timedelta(days=1),
        db_session=db,
    )
    kinds = [c.kind.value for c in summary.changes]
    assert kinds == sorted(kinds)


def test_empty_diff_returns_summary_with_empty_changes(db, aid):
    summary = build_diff(
        aid=aid,
        since=datetime.now(timezone.utc) - timedelta(days=1),
        db_session=db,
    )
    assert summary.aid == aid
    assert summary.changes == []
    assert summary.summary_lineage_ref is not None


# ---------------------------------------------------------------------------
# SF1 — Empty diff GETs must not bloat the lineage_refs table.
# ---------------------------------------------------------------------------


def test_empty_diff_does_not_insert_lineage_row(db, aid):
    """Performance: an empty diff (no changes) must NOT create a new
    ``lineage_refs`` row. The diff endpoint is hit on every page open,
    so allocating a lineage row per empty GET bloats the table.
    """
    from backend.models.pricing.lineage import LineageRefRow

    before_count = db.query(LineageRefRow).count()
    summary = build_diff(
        aid=aid,
        since=datetime.now(timezone.utc) - timedelta(days=1),
        db_session=db,
    )
    after_count = db.query(LineageRefRow).count()

    assert summary.changes == []
    # Field still populated for wire-shape stability, but no row inserted.
    assert summary.summary_lineage_ref is not None
    assert after_count == before_count, (
        f"empty diff inserted {after_count - before_count} lineage row(s)"
    )


def test_nonempty_diff_inserts_one_lineage_row(db, aid):
    """Performance counterpart: when ``changes`` is non-empty the diff
    must still insert exactly one lineage row (unchanged behavior).
    """
    from backend.models.pricing.lineage import LineageRefRow

    db.add(CostStateRow(aid=aid, unit_cost=Decimal("88.00"), breakdown={}))
    record_audit(
        actor="system",
        action=PricingAuditAction.OVERRIDE_ADDED,
        target_kind=PricingAuditTargetKind.SKU,
        target_id=aid,
        after={"aid": aid, "unit_cost": "80.00"},
        session=db,
    )
    db.query(PricingAuditEntry).filter_by(target_id=aid).update(
        {PricingAuditEntry.at: datetime.now(timezone.utc) - timedelta(days=3)},
        synchronize_session=False,
    )
    db.flush()

    before_count = db.query(LineageRefRow).count()
    summary = build_diff(
        aid=aid,
        since=datetime.now(timezone.utc) - timedelta(days=1),
        db_session=db,
    )
    after_count = db.query(LineageRefRow).count()

    assert len(summary.changes) >= 1
    assert after_count == before_count + 1
