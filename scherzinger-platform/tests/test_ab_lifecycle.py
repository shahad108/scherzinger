"""Phase 17 — A/B lifecycle + simulation summary mapping (no DB required).

These unit tests exercise the pure decision logic in
``ab_simulation_service`` and ``ab_lifecycle_service`` without touching
Postgres. The DB-backed integration tests live in
``tests/contract/test_ab_tracker.py``.
"""
from __future__ import annotations

from types import SimpleNamespace
from uuid import uuid4

import pytest

from backend.services import ab_lifecycle_service as lc
from backend.services import ab_simulation_service as sim


def _make_test(**overrides):
    """Build an unsaved AbTest-shaped namespace for pure-Python checks."""
    base = dict(
        id=uuid4(),
        aid="200832-E",
        slice_pct=50.0,
        start_date=None,
        end_date=None,
        control_price=4.10,
        treatment_price=4.38,
        status="running",
        decision_state="running",
        simulation_status="ready",
        promotion_eligible=False,
        promotion_blockers=None,
        latest_simulation_id=None,
        status_reason=None,
        updated_at=None,
    )
    base.update(overrides)
    return SimpleNamespace(**base)


# --------------------------------------------------------------------------- #
# Lifecycle transitions                                                       #
# --------------------------------------------------------------------------- #

def test_assert_transition_running_to_held_ok():
    lc.assert_transition(lc.STATE_RUNNING, lc.STATE_HELD)


def test_assert_transition_held_to_promoted_rejected():
    with pytest.raises(lc.LifecycleError):
        lc.assert_transition(lc.STATE_HELD, lc.STATE_PROMOTED)


def test_assert_transition_promoted_is_terminal():
    with pytest.raises(lc.LifecycleError):
        lc.assert_transition(lc.STATE_PROMOTED, lc.STATE_RUNNING)


def test_assert_transition_running_to_promoted_allowed_structurally():
    # The lifecycle allows it; the gate (in transition()) is what blocks it.
    lc.assert_transition(lc.STATE_RUNNING, lc.STATE_PROMOTED)


# --------------------------------------------------------------------------- #
# Simulation recommendation mapping                                           #
# --------------------------------------------------------------------------- #

def test_recommend_pre_launch_positive_lift_low_downside_returns_launch():
    rec, blockers, warnings = sim._recommend(
        stage=sim.STAGE_PRE_LAUNCH,
        expected_lift_pp=2.0,
        downside_prob=0.05,
        observed=None,
    )
    assert rec == sim.RECOMMEND_LAUNCH
    assert blockers == []


def test_recommend_pre_launch_high_downside_blocks_launch():
    rec, blockers, warnings = sim._recommend(
        stage=sim.STAGE_PRE_LAUNCH,
        expected_lift_pp=2.0,
        downside_prob=0.40,
        observed=None,
    )
    assert rec == sim.RECOMMEND_HOLD
    assert any("downside probability" in b for b in blockers)


def test_recommend_pre_launch_zero_lift_warns():
    rec, blockers, warnings = sim._recommend(
        stage=sim.STAGE_PRE_LAUNCH,
        expected_lift_pp=0.0,
        downside_prob=0.05,
        observed=None,
    )
    assert rec == sim.RECOMMEND_LAUNCH  # no blocker, but a warning
    assert any("does not improve margin" in w for w in warnings)


def test_recommend_in_flight_high_downside_stops():
    rec, blockers, _ = sim._recommend(
        stage=sim.STAGE_IN_FLIGHT,
        expected_lift_pp=1.0,
        downside_prob=0.40,
        observed=None,
    )
    assert rec == sim.RECOMMEND_STOP


def test_recommend_in_flight_moderate_downside_holds():
    rec, blockers, _ = sim._recommend(
        stage=sim.STAGE_IN_FLIGHT,
        expected_lift_pp=1.0,
        downside_prob=0.25,
        observed=None,
    )
    assert rec == sim.RECOMMEND_HOLD


def test_recommend_in_flight_clean_continues():
    rec, blockers, _ = sim._recommend(
        stage=sim.STAGE_IN_FLIGHT,
        expected_lift_pp=1.0,
        downside_prob=0.05,
        observed=None,
    )
    assert rec == sim.RECOMMEND_CONTINUE
    assert blockers == []


def test_recommend_promotion_gate_no_observed_blocks():
    rec, blockers, _ = sim._recommend(
        stage=sim.STAGE_PROMOTION_GATE,
        expected_lift_pp=1.0,
        downside_prob=0.05,
        observed=None,
    )
    assert rec == sim.RECOMMEND_STOP
    assert any("no observed result" in b for b in blockers)


def test_recommend_promotion_gate_insufficient_samples_blocks():
    observed = SimpleNamespace(
        sample_size_control=5,
        sample_size_treatment=5,
        p_value=0.01,
        lift_pp=1.2,
    )
    rec, blockers, _ = sim._recommend(
        stage=sim.STAGE_PROMOTION_GATE,
        expected_lift_pp=1.0,
        downside_prob=0.05,
        observed=observed,
    )
    assert rec == sim.RECOMMEND_STOP
    assert any("insufficient sample size" in b for b in blockers)


def test_recommend_promotion_gate_not_significant_blocks():
    observed = SimpleNamespace(
        sample_size_control=100,
        sample_size_treatment=100,
        p_value=0.20,
        lift_pp=1.2,
    )
    rec, blockers, _ = sim._recommend(
        stage=sim.STAGE_PROMOTION_GATE,
        expected_lift_pp=1.0,
        downside_prob=0.05,
        observed=observed,
    )
    assert rec == sim.RECOMMEND_STOP
    assert any("not statistically significant" in b for b in blockers)


def test_recommend_promotion_gate_low_lift_blocks():
    observed = SimpleNamespace(
        sample_size_control=100,
        sample_size_treatment=100,
        p_value=0.01,
        lift_pp=0.1,
    )
    rec, blockers, _ = sim._recommend(
        stage=sim.STAGE_PROMOTION_GATE,
        expected_lift_pp=1.0,
        downside_prob=0.05,
        observed=observed,
    )
    assert rec == sim.RECOMMEND_STOP
    assert any("below promotion bar" in b for b in blockers)


def test_recommend_promotion_gate_high_downside_blocks():
    observed = SimpleNamespace(
        sample_size_control=100,
        sample_size_treatment=100,
        p_value=0.01,
        lift_pp=1.2,
    )
    rec, blockers, _ = sim._recommend(
        stage=sim.STAGE_PROMOTION_GATE,
        expected_lift_pp=1.0,
        downside_prob=0.35,
        observed=observed,
    )
    assert rec == sim.RECOMMEND_STOP
    assert any("simulated downside probability" in b for b in blockers)


def test_recommend_promotion_gate_all_clear_promotes():
    observed = SimpleNamespace(
        sample_size_control=120,
        sample_size_treatment=125,
        p_value=0.01,
        lift_pp=1.2,
    )
    rec, blockers, _ = sim._recommend(
        stage=sim.STAGE_PROMOTION_GATE,
        expected_lift_pp=1.0,
        downside_prob=0.05,
        observed=observed,
    )
    assert rec == sim.RECOMMEND_PROMOTE
    assert blockers == []


# --------------------------------------------------------------------------- #
# Sampling kernel + sample-size planner                                       #
# --------------------------------------------------------------------------- #

def test_quantile_handles_empty():
    assert sim._quantile([], 0.5) == 0.0


def test_quantile_ordering():
    xs = [3.0, 1.0, 2.0, 4.0, 5.0]
    assert sim._quantile(xs, 0.0) == 1.0
    assert sim._quantile(xs, 1.0) == 5.0
    assert sim._quantile(xs, 0.5) == 3.0


def test_simulate_margin_is_deterministic_under_seed():
    a = sim._simulate_margin(
        base_margin=0.2, expected_lift_pp=1.0, sigma=0.05, n_simulations=500, seed=42
    )
    b = sim._simulate_margin(
        base_margin=0.2, expected_lift_pp=1.0, sigma=0.05, n_simulations=500, seed=42
    )
    assert a == b


def test_required_sample_size_grows_as_effect_shrinks():
    small = sim.required_sample_size(base_margin=0.2, expected_lift_pp=0.5, sigma=0.05)
    big = sim.required_sample_size(base_margin=0.2, expected_lift_pp=5.0, sigma=0.05)
    assert small > big
    assert big >= 30


def test_required_sample_size_floor_on_zero_effect():
    # No effect -> we should report a very high n, not zero.
    n = sim.required_sample_size(base_margin=0.2, expected_lift_pp=0.0, sigma=0.05)
    assert n >= 1000


# --------------------------------------------------------------------------- #
# Planning lift derivation                                                    #
# --------------------------------------------------------------------------- #

def test_planning_lift_pp_positive_when_treatment_higher():
    t = _make_test(control_price=4.10, treatment_price=4.38)
    assert sim._planning_lift_pp(t) > 0


def test_planning_lift_pp_zero_when_control_zero():
    t = _make_test(control_price=0, treatment_price=4.38)
    assert sim._planning_lift_pp(t) == 0.0
