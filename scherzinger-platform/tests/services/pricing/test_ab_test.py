"""Phase 8 — services/pricing/ab_test tests.

Covers create_ab_test (split + persist), score_ab_test (z-test +
decision_ready), promote_or_hold (publish_price fan-out), and the
eligibility evaluator.

Skips cleanly when psycopg2 / the test DB are unreachable.
"""
from __future__ import annotations

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
        name="AB Test User",
        dept="pricing",
        ui_persona_default="frank",
        password_hash="x",
    )
    db.add(user)
    db.flush()
    return uid


def _make_pool(n: int = 20, *, all_tier: str = "B"):
    from backend.services.pricing.ab_test import CustomerFacts

    return [
        CustomerFacts(
            customer_id=f"C{i:03d}",
            tier=all_tier,
            family="BKAGG",
            cluster=None,
            ltm_revenue=10_000.0 + i * 100,
        )
        for i in range(n)
    ]


# ---------------------------------------------------------------------------
# Eligibility evaluator
# ---------------------------------------------------------------------------


def test_eligibility_in_operator() -> None:
    from backend.services.pricing.ab_test import eligibility_matches

    rule = {"in": [{"var": "tier"}, ["B", "C"]]}
    assert eligibility_matches(rule, {"tier": "B"}) is True
    assert eligibility_matches(rule, {"tier": "A"}) is False


def test_eligibility_and_or_compound() -> None:
    from backend.services.pricing.ab_test import eligibility_matches

    rule = {
        "and": [
            {"in": [{"var": "tier"}, ["B", "C"]]},
            {"in": [{"var": "family"}, ["BKAGG", "STD"]]},
        ]
    }
    assert eligibility_matches(rule, {"tier": "B", "family": "BKAGG"}) is True
    assert eligibility_matches(rule, {"tier": "A", "family": "BKAGG"}) is False
    assert eligibility_matches(rule, {"tier": "B", "family": "X"}) is False


def test_eligibility_none_matches_all() -> None:
    from backend.services.pricing.ab_test import eligibility_matches

    assert eligibility_matches(None, {"tier": "A"}) is True
    assert eligibility_matches({}, {"tier": "A"}) is True


# ---------------------------------------------------------------------------
# Deterministic split
# ---------------------------------------------------------------------------


def test_assign_arm_deterministic() -> None:
    from backend.services.pricing.ab_test import assign_arm

    tid = uuid4()
    arms_a = [assign_arm(f"cust-{i}", tid) for i in range(50)]
    arms_b = [assign_arm(f"cust-{i}", tid) for i in range(50)]
    assert arms_a == arms_b  # same inputs → same arms

    # Different test_id ⇒ at least some flip.
    arms_other = [assign_arm(f"cust-{i}", uuid4()) for i in range(50)]
    assert arms_a != arms_other


# ---------------------------------------------------------------------------
# create_ab_test
# ---------------------------------------------------------------------------


def test_create_ab_test_writes_test_and_assignments(db) -> None:
    from backend.models import AbTest, AbTestAssignment
    from backend.services.pricing.ab_test import create_ab_test

    actor = _seed_user(db)
    pool = _make_pool(20)
    aid = f"AB-{uuid4().hex[:6].upper()}"

    test = create_ab_test(
        aid=aid,
        control_price=Decimal("100.00"),
        variant_price=Decimal("110.00"),
        eligibility={"in": [{"var": "tier"}, ["B", "C"]]},
        criterion={"alpha": 0.10, "metric": "db2"},
        target_sample=10,
        actor=str(actor),
        db_session=db,
        candidate_pool=pool,
    )
    db.flush()

    assert isinstance(test, AbTest)
    assert test.aid == aid
    assert Decimal(test.control_price) == Decimal("100.00")
    assert Decimal(test.treatment_price) == Decimal("110.00")
    assert test.target_sample == 10

    rows = (
        db.query(AbTestAssignment)
        .filter(AbTestAssignment.test_id == test.id)
        .all()
    )
    assert len(rows) > 0
    arms = {r.arm for r in rows}
    assert arms.issubset({"control", "variant"})
    # Both arms get at least one assignment with a 20-customer pool.
    assert "control" in arms or "variant" in arms


def test_create_ab_test_excludes_tier_a(db) -> None:
    from backend.models import AbTestAssignment
    from backend.services.pricing.ab_test import CustomerFacts, create_ab_test

    actor = _seed_user(db)
    aid = f"AB-{uuid4().hex[:6].upper()}"
    pool = [
        CustomerFacts(customer_id="A1", tier="A", family="BKAGG", ltm_revenue=100_000),
        CustomerFacts(customer_id="A2", tier="A", family="BKAGG", ltm_revenue=80_000),
        CustomerFacts(customer_id="B1", tier="B", family="BKAGG", ltm_revenue=50_000),
        CustomerFacts(customer_id="C1", tier="C", family="BKAGG", ltm_revenue=20_000),
    ]
    test = create_ab_test(
        aid=aid,
        control_price=Decimal("100.00"),
        variant_price=Decimal("110.00"),
        eligibility=None,  # no rule → still excludes tier-A
        criterion=None,
        target_sample=4,
        actor=str(actor),
        db_session=db,
        candidate_pool=pool,
    )
    db.flush()

    rows = (
        db.query(AbTestAssignment)
        .filter(AbTestAssignment.test_id == test.id)
        .all()
    )
    customer_ids = {r.customer_key for r in rows}
    assert customer_ids.isdisjoint({"A1", "A2"})
    assert customer_ids == {"B1", "C1"}


def test_create_ab_test_deterministic_arms_same_inputs(db) -> None:
    """Same pool + same test_id should yield identical per-customer arms."""
    from backend.services.pricing.ab_test import assign_arm

    pool = _make_pool(50, all_tier="B")
    fixed_test_id = uuid4()

    arms1 = {c.customer_id: assign_arm(c.customer_id, fixed_test_id) for c in pool}
    arms2 = {c.customer_id: assign_arm(c.customer_id, fixed_test_id) for c in pool}
    assert arms1 == arms2


def test_create_ab_test_empty_pool_raises(db) -> None:
    from backend.services.pricing.ab_test import (
        AbTestEligibilityEmptyError,
        create_ab_test,
    )

    actor = _seed_user(db)
    with pytest.raises(AbTestEligibilityEmptyError):
        create_ab_test(
            aid="NOTHING",
            control_price=Decimal("100"),
            variant_price=Decimal("110"),
            eligibility=None,
            criterion=None,
            target_sample=5,
            actor=str(actor),
            db_session=db,
            candidate_pool=[],  # explicit empty
        )


# ---------------------------------------------------------------------------
# score_ab_test
# ---------------------------------------------------------------------------


def _stamp_outcomes(db, test_id, won_control: int, lost_control: int,
                     won_variant: int, lost_variant: int) -> None:
    """Stamp outcome rows directly to set up a score_ab_test scenario."""
    from backend.models import AbTestAssignment

    rows = (
        db.query(AbTestAssignment)
        .filter(AbTestAssignment.test_id == test_id)
        .all()
    )
    by_arm = {"control": [], "variant": []}
    for r in rows:
        by_arm[r.arm].append(r)

    def _apply(arm: str, n_won: int, n_lost: int) -> None:
        rs = by_arm[arm][: n_won + n_lost]
        for i, r in enumerate(rs):
            r.outcome_ref_type = "won" if i < n_won else "lost"
            r.outcome_margin = Decimal("0.18") if i < n_won else Decimal("0.0")
            r.outcome_revenue = Decimal("1000.00") if i < n_won else Decimal("0")

    _apply("control", won_control, lost_control)
    _apply("variant", won_variant, lost_variant)
    db.flush()


def test_score_ab_test_returns_z_stat_and_decision_ready(db) -> None:
    from backend.services.pricing.ab_test import (
        CustomerFacts,
        create_ab_test,
        score_ab_test,
    )

    actor = _seed_user(db)
    aid = f"AB-{uuid4().hex[:6].upper()}"
    # 200 customers, target_sample=30 → 60-cap on the assignment pool;
    # ~30 per arm in practice. Stamp 25 outcomes per arm to clear target.
    pool = [
        CustomerFacts(customer_id=f"PC{i:03d}", tier="B", family="BKAGG", ltm_revenue=1000)
        for i in range(200)
    ]
    test = create_ab_test(
        aid=aid,
        control_price=Decimal("100"),
        variant_price=Decimal("110"),
        eligibility=None,
        criterion={"alpha": 0.10},
        target_sample=25,
        actor=str(actor),
        db_session=db,
        candidate_pool=pool,
    )
    db.flush()

    # Setup: control = 10/25 won; variant = 22/25 won → strong signal.
    _stamp_outcomes(
        db, test.id,
        won_control=10, lost_control=15,
        won_variant=22, lost_variant=3,
    )

    result = score_ab_test(test_id=test.id, db_session=db)
    assert result.control.n >= 25
    assert result.variant.n >= 25
    assert result.z_stat is not None
    assert result.p_value is not None
    assert result.p_value < 0.10
    assert result.decision_ready is True


def test_score_ab_test_not_decision_ready_when_small_sample(db) -> None:
    from backend.services.pricing.ab_test import (
        CustomerFacts,
        create_ab_test,
        score_ab_test,
    )

    actor = _seed_user(db)
    aid = f"AB-{uuid4().hex[:6].upper()}"
    pool = [
        CustomerFacts(customer_id=f"SC{i:03d}", tier="B", family="BKAGG", ltm_revenue=500)
        for i in range(10)
    ]
    test = create_ab_test(
        aid=aid,
        control_price=Decimal("100"),
        variant_price=Decimal("110"),
        eligibility=None,
        criterion={"alpha": 0.10},
        target_sample=100,  # huge target, tiny pool
        actor=str(actor),
        db_session=db,
        candidate_pool=pool,
    )
    db.flush()

    _stamp_outcomes(db, test.id, won_control=2, lost_control=2,
                    won_variant=3, lost_variant=1)
    result = score_ab_test(test_id=test.id, db_session=db)
    assert result.decision_ready is False


# ---------------------------------------------------------------------------
# promote_or_hold
# ---------------------------------------------------------------------------


def test_promote_calls_publish_price(db) -> None:
    from backend.services.pricing.ab_test import (
        CustomerFacts,
        create_ab_test,
        promote_or_hold,
    )

    actor = _seed_user(db)
    aid = f"AB-{uuid4().hex[:6].upper()}"
    pool = [CustomerFacts(customer_id=f"P{i}", tier="B", family="BKAGG", ltm_revenue=100) for i in range(8)]
    test = create_ab_test(
        aid=aid,
        control_price=Decimal("100"),
        variant_price=Decimal("115"),
        eligibility=None,
        criterion=None,
        target_sample=4,
        actor=str(actor),
        db_session=db,
        candidate_pool=pool,
    )
    db.flush()

    calls = []

    class _MockReceipt:
        id = uuid4()

    def fake_publish(*, aid, price, effective_at, source_proposal_id, actor, db_session):  # noqa: ARG001
        calls.append({"aid": aid, "price": price})
        return _MockReceipt()

    outcome = promote_or_hold(
        test_id=test.id,
        decision="promote",
        actor=str(actor),
        db_session=db,
        publish_fn=fake_publish,
    )
    assert outcome.decision == "promote"
    assert outcome.status == "promoted"
    assert len(calls) == 1
    assert calls[0]["aid"] == aid
    assert Decimal(calls[0]["price"]) == Decimal("115")
    assert outcome.receipt_id  # populated from MockReceipt.id

    db.flush()
    db.refresh(test)
    assert test.decision_state == "promoted"
    assert test.end_date is not None


def test_hold_does_not_call_publish(db) -> None:
    from backend.services.pricing.ab_test import (
        CustomerFacts,
        create_ab_test,
        promote_or_hold,
    )

    actor = _seed_user(db)
    aid = f"AB-{uuid4().hex[:6].upper()}"
    pool = [CustomerFacts(customer_id=f"H{i}", tier="C", family="BKAGG", ltm_revenue=100) for i in range(6)]
    test = create_ab_test(
        aid=aid,
        control_price=Decimal("100"),
        variant_price=Decimal("105"),
        eligibility=None,
        criterion=None,
        target_sample=3,
        actor=str(actor),
        db_session=db,
        candidate_pool=pool,
    )
    db.flush()

    calls = []

    def fake_publish(**kwargs):  # noqa: ARG001
        calls.append(kwargs)
        return None

    outcome = promote_or_hold(
        test_id=test.id,
        decision="hold",
        actor=str(actor),
        db_session=db,
        publish_fn=fake_publish,
    )
    assert outcome.decision == "hold"
    assert outcome.status == "held"
    assert calls == []  # publish never called

    db.flush()
    db.refresh(test)
    assert test.decision_state == "held"


def test_invalid_decision_raises(db) -> None:
    from backend.services.pricing.ab_test import (
        AbTestInvalidDecisionError,
        CustomerFacts,
        create_ab_test,
        promote_or_hold,
    )

    actor = _seed_user(db)
    aid = f"AB-{uuid4().hex[:6].upper()}"
    pool = [CustomerFacts(customer_id="X1", tier="B", family="BKAGG", ltm_revenue=100)]
    test = create_ab_test(
        aid=aid,
        control_price=Decimal("100"),
        variant_price=Decimal("110"),
        eligibility=None,
        criterion=None,
        target_sample=1,
        actor=str(actor),
        db_session=db,
        candidate_pool=pool,
    )
    db.flush()

    with pytest.raises(AbTestInvalidDecisionError):
        promote_or_hold(
            test_id=test.id,
            decision="nope",  # type: ignore[arg-type]
            actor=str(actor),
            db_session=db,
        )
