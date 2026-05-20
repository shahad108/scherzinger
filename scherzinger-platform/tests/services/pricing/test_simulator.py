"""Phase 8 — services/pricing/simulator tests.

simulator.simulate returns three scenarios (low/mid/high) plus a
fan-band series, without writing to any A/B tables.
"""
from __future__ import annotations

from decimal import Decimal
from uuid import uuid4

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


def _pool(n: int = 15):
    from backend.services.pricing.ab_test import CustomerFacts

    return [
        CustomerFacts(
            customer_id=f"S{i:03d}",
            tier="B",
            family="BKAGG",
            cluster=None,
            ltm_revenue=10_000.0,
        )
        for i in range(n)
    ]


def test_simulate_returns_three_scenarios(db) -> None:
    from backend.services.pricing.simulator import simulate

    out = simulate(
        aid=f"SIM-{uuid4().hex[:6].upper()}",
        control_price=Decimal("100.00"),
        variant_price=Decimal("110.00"),
        eligibility=None,
        target_sample=10,
        db_session=db,
        candidate_pool=_pool(15),
    )

    assert "scenarios" in out
    for key in ("low", "mid", "high"):
        assert key in out["scenarios"]
        sc = out["scenarios"][key]
        # Each scenario carries the three projected deltas.
        for f in ("revenue_delta_12mo", "db2_delta_12mo", "churn_risk_pp"):
            assert f in sc


def test_simulate_fan_band_chart_has_12_months(db) -> None:
    from backend.services.pricing.simulator import simulate

    out = simulate(
        aid=f"SIM-{uuid4().hex[:6].upper()}",
        control_price=Decimal("100.00"),
        variant_price=Decimal("110.00"),
        eligibility=None,
        target_sample=5,
        db_session=db,
        candidate_pool=_pool(8),
    )
    fb = out["fan_band_chart_data"]
    assert len(fb) == 12
    # Each point has the three series.
    for row in fb:
        for k in ("month", "low", "mid", "high"):
            assert k in row
    assert fb[0]["month"] == 1
    assert fb[-1]["month"] == 12


def test_simulate_no_writes(db) -> None:
    """simulate must not insert into ab_tests or ab_test_assignments."""
    from sqlalchemy import func

    from backend.models import AbTest, AbTestAssignment
    from backend.services.pricing.simulator import simulate

    aid = f"SIM-{uuid4().hex[:6].upper()}"

    n_tests_before = db.query(func.count(AbTest.id)).scalar() or 0
    n_assign_before = db.query(func.count(AbTestAssignment.id)).scalar() or 0

    out = simulate(
        aid=aid,
        control_price=Decimal("100"),
        variant_price=Decimal("120"),
        eligibility=None,
        target_sample=5,
        db_session=db,
        candidate_pool=_pool(8),
    )
    assert out["aid"] == aid

    n_tests_after = db.query(func.count(AbTest.id)).scalar() or 0
    n_assign_after = db.query(func.count(AbTestAssignment.id)).scalar() or 0
    assert n_tests_after == n_tests_before
    assert n_assign_after == n_assign_before

    # Also confirm by aid query.
    assert db.query(AbTest).filter(AbTest.aid == aid).count() == 0


def test_simulate_low_to_high_ordering(db) -> None:
    """low ≤ mid ≤ high when the variant pricing direction is consistent."""
    from backend.services.pricing.simulator import simulate

    out = simulate(
        aid=f"SIM-{uuid4().hex[:6].upper()}",
        control_price=Decimal("100"),
        variant_price=Decimal("110"),  # variant > control: revenue uplift expected
        eligibility=None,
        target_sample=5,
        db_session=db,
        candidate_pool=_pool(20),
    )
    low = out["scenarios"]["low"]["revenue_delta_12mo"]
    mid = out["scenarios"]["mid"]["revenue_delta_12mo"]
    high = out["scenarios"]["high"]["revenue_delta_12mo"]
    # Allow ties (flat curve fallback); strict only when there's signal.
    assert low <= mid <= high


def test_simulate_eligibility_filter_changes_sample_size(db) -> None:
    from backend.services.pricing.ab_test import CustomerFacts
    from backend.services.pricing.simulator import simulate

    mixed_pool = [
        CustomerFacts(customer_id="A1", tier="A", family="BKAGG", ltm_revenue=10_000),
        CustomerFacts(customer_id="B1", tier="B", family="BKAGG", ltm_revenue=10_000),
        CustomerFacts(customer_id="C1", tier="C", family="STD", ltm_revenue=10_000),
        CustomerFacts(customer_id="C2", tier="C", family="OTHER", ltm_revenue=10_000),
    ]
    rule = {"in": [{"var": "family"}, ["BKAGG", "STD"]]}
    out = simulate(
        aid="SIM-elig",
        control_price=Decimal("100"),
        variant_price=Decimal("110"),
        eligibility=rule,
        target_sample=10,
        db_session=db,
        candidate_pool=mixed_pool,
    )
    # A1 dropped (tier A), C2 dropped (family OTHER): 2 eligible.
    assert out["n_eligible"] == 2
