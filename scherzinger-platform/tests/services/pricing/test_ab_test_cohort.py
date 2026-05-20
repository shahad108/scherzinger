"""Phase J1 — A/B test cohort assignment tests.

Covers the new ``assign_cohorts`` helper:

  - Deterministic split (same (test_id, customer_id) → same arm
    across runs).
  - ``slice_pct`` (variant_pct) is respected within tolerance.
  - Idempotent — calling twice never duplicates rows.
  - 0 eligible customers → 0 rows + no exception.

Skips cleanly when psycopg2 / the test DB are unreachable.
"""
from __future__ import annotations

from datetime import datetime, timezone
from decimal import Decimal
from uuid import UUID, uuid4

import pytest


pytest.importorskip("psycopg2")


@pytest.fixture
def db():
    from backend.database import SessionLocal

    session = SessionLocal()
    try:
        from sqlalchemy import text

        session.execute(text("SELECT 1"))
    except Exception:
        pytest.skip("test DB unreachable")
    yield session
    session.rollback()
    session.close()


def _seed_user(db) -> UUID:
    from backend.models import User

    uid = uuid4()
    user = User(
        id=uid,
        email=f"u{uid.hex[:8]}@example.com",
        name="AB Cohort User",
        dept="pricing",
        ui_persona_default="frank",
        password_hash="x",
    )
    db.add(user)
    db.flush()
    return uid


def _seed_ab_test(db, *, actor: UUID, aid: str) -> UUID:
    """Insert a minimal AbTest row and return its id."""
    from backend.models import AbTest

    now = datetime.now(timezone.utc)
    test = AbTest(
        aid=aid,
        slice_pct=Decimal("50.00"),
        start_date=now,
        end_date=None,
        control_price=Decimal("100.00"),
        treatment_price=Decimal("110.00"),
        status="running",
        decision_state="running",
        simulation_status="pending",
        created_by=actor,
        success_metric="db2_margin",
        duration_days=14,
        eligibility_json=None,
        criterion_json=None,
        target_sample=10,
    )
    db.add(test)
    db.flush()
    return test.id


def _make_facts(n: int):
    from backend.services.pricing.ab_test import CustomerFacts

    return [
        CustomerFacts(
            customer_id=f"C{i:04d}",
            tier="B",
            family="BKAGG",
            ltm_revenue=10_000.0 + i,
        )
        for i in range(n)
    ]


# ---------------------------------------------------------------------------
# 1. Deterministic
# ---------------------------------------------------------------------------


def test_cohort_assignment_deterministic(db) -> None:
    """Same (test_id, customer_id) → same arm across separate calls."""
    from backend.models import AbTestAssignment
    from backend.services.pricing.ab_test import assign_arm, assign_cohorts

    actor = _seed_user(db)
    aid = f"AB-{uuid4().hex[:6].upper()}"
    test_id = _seed_ab_test(db, actor=actor, aid=aid)

    facts = _make_facts(40)
    inserted = assign_cohorts(
        test_id=test_id,
        aid=aid,
        eligible=facts,
        variant_pct=50,
        control_price=Decimal("100.00"),
        variant_price=Decimal("110.00"),
        db_session=db,
    )
    assert inserted == 40

    rows = (
        db.query(AbTestAssignment)
        .filter(AbTestAssignment.test_id == test_id)
        .all()
    )
    persisted_by_key = {r.customer_key: r.arm for r in rows}

    # Recompute arms independently via the same hash → must match.
    for cust in facts:
        expected = assign_arm(cust.customer_id, test_id, variant_pct=50)
        assert persisted_by_key[cust.customer_id] == expected


# ---------------------------------------------------------------------------
# 2. slice_pct respected
# ---------------------------------------------------------------------------


def test_cohort_assignment_respects_slice_pct(db) -> None:
    """1000 customers + slice=20 → ~20% variant (within ±5pp).

    SHA-256 is uniform but finite samples drift. We use n=1000 + a wide
    ±5 percentage-point band so this is essentially never flaky in CI.
    The 100-customer / ±5 case is a near-miss at ~1.25σ.
    """
    from backend.models import AbTestAssignment
    from backend.services.pricing.ab_test import assign_cohorts

    actor = _seed_user(db)
    aid = f"AB-{uuid4().hex[:6].upper()}"
    test_id = _seed_ab_test(db, actor=actor, aid=aid)

    facts = _make_facts(1000)
    assign_cohorts(
        test_id=test_id,
        aid=aid,
        eligible=facts,
        variant_pct=20,
        control_price=Decimal("100.00"),
        variant_price=Decimal("110.00"),
        db_session=db,
    )

    rows = (
        db.query(AbTestAssignment)
        .filter(AbTestAssignment.test_id == test_id)
        .all()
    )
    n_variant = sum(1 for r in rows if r.arm == "variant")
    n_control = sum(1 for r in rows if r.arm == "control")
    assert n_variant + n_control == 1000
    # ±5pp on n=1000: ~0.5σ window collapses → effectively impossible
    # for a uniform hash to fall outside this range.
    pct_variant = 100.0 * n_variant / 1000
    assert 15 <= pct_variant <= 25, f"expected ~20%, got {pct_variant:.1f}%"
    pct_control = 100.0 * n_control / 1000
    assert 75 <= pct_control <= 85, f"expected ~80%, got {pct_control:.1f}%"

    # Edge cases: slice_pct=100 → all variant. slice_pct=0 → all control.
    aid2 = f"AB-{uuid4().hex[:6].upper()}"
    test_all_variant = _seed_ab_test(db, actor=actor, aid=aid2)
    assign_cohorts(
        test_id=test_all_variant,
        aid=aid2,
        eligible=_make_facts(20),
        variant_pct=100,
        control_price=Decimal("100.00"),
        variant_price=Decimal("110.00"),
        db_session=db,
    )
    arms = [
        r.arm
        for r in db.query(AbTestAssignment)
        .filter(AbTestAssignment.test_id == test_all_variant)
        .all()
    ]
    assert all(a == "variant" for a in arms) and len(arms) == 20

    aid3 = f"AB-{uuid4().hex[:6].upper()}"
    test_all_control = _seed_ab_test(db, actor=actor, aid=aid3)
    assign_cohorts(
        test_id=test_all_control,
        aid=aid3,
        eligible=_make_facts(20),
        variant_pct=0,
        control_price=Decimal("100.00"),
        variant_price=Decimal("110.00"),
        db_session=db,
    )
    arms = [
        r.arm
        for r in db.query(AbTestAssignment)
        .filter(AbTestAssignment.test_id == test_all_control)
        .all()
    ]
    assert all(a == "control" for a in arms) and len(arms) == 20


# ---------------------------------------------------------------------------
# 3. Idempotent
# ---------------------------------------------------------------------------


def test_cohort_assignment_idempotent(db) -> None:
    """Calling assign_cohorts twice never duplicates rows."""
    from backend.models import AbTestAssignment
    from backend.services.pricing.ab_test import assign_cohorts

    actor = _seed_user(db)
    aid = f"AB-{uuid4().hex[:6].upper()}"
    test_id = _seed_ab_test(db, actor=actor, aid=aid)

    facts = _make_facts(25)
    first = assign_cohorts(
        test_id=test_id,
        aid=aid,
        eligible=facts,
        variant_pct=50,
        control_price=Decimal("100.00"),
        variant_price=Decimal("110.00"),
        db_session=db,
    )
    assert first == 25

    n_after_first = (
        db.query(AbTestAssignment)
        .filter(AbTestAssignment.test_id == test_id)
        .count()
    )

    # Second call with the same inputs — must be a full no-op.
    second = assign_cohorts(
        test_id=test_id,
        aid=aid,
        eligible=facts,
        variant_pct=50,
        control_price=Decimal("100.00"),
        variant_price=Decimal("110.00"),
        db_session=db,
    )
    assert second == 0

    n_after_second = (
        db.query(AbTestAssignment)
        .filter(AbTestAssignment.test_id == test_id)
        .count()
    )
    assert n_after_first == n_after_second == 25


# ---------------------------------------------------------------------------
# 4. Empty eligibility → no rows, no exception
# ---------------------------------------------------------------------------


def test_cohort_assignment_empty_eligibility(db) -> None:
    """0 eligible customers → write 0 rows, no exception."""
    from backend.models import AbTestAssignment
    from backend.services.pricing.ab_test import assign_cohorts

    actor = _seed_user(db)
    aid = f"AB-{uuid4().hex[:6].upper()}"
    test_id = _seed_ab_test(db, actor=actor, aid=aid)

    inserted = assign_cohorts(
        test_id=test_id,
        aid=aid,
        eligible=[],
        variant_pct=50,
        control_price=Decimal("100.00"),
        variant_price=Decimal("110.00"),
        db_session=db,
    )
    assert inserted == 0

    n = (
        db.query(AbTestAssignment)
        .filter(AbTestAssignment.test_id == test_id)
        .count()
    )
    assert n == 0
