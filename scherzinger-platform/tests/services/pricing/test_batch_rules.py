"""Phase 6 — batch rule application tests.

These tests target the pure-function rule helpers in
``backend.services.pricing.batch`` without touching the DB. The
``_apply_*`` helpers operate on an ``_SkuInputs`` Pydantic bag, so we
can hand-construct inputs and assert the math directly.
"""
from __future__ import annotations

from decimal import Decimal

import pytest

from backend.services.pricing import batch as batch_mod
from backend.services.pricing.batch import (
    CustomJsonLogicRule,
    FloorPlusRule,
    MatchCompetitorRule,
    PctMoveRule,
    ScopeFilter,
    TargetDb2Rule,
)


def _inputs(**overrides):
    base = dict(
        aid="X-1",
        current_price=Decimal("100.0000"),
        floor=Decimal("80.0000"),
        ceiling=Decimal("140.0000"),
        unit_cost=Decimal("70.0000"),
        wtp_p90=Decimal("125.0000"),
        competitor_median=Decimal("105.0000"),
    )
    base.update(overrides)
    return batch_mod._SkuInputs(**base)


# ---------------------------------------------------------------------------
# FloorPlusRule
# ---------------------------------------------------------------------------


def test_floor_plus_uses_floor_when_present() -> None:
    rule = FloorPlusRule(margin_pp=Decimal("10"))
    inputs = _inputs(floor=Decimal("80"))
    out = batch_mod._apply_floor_plus(rule, inputs)
    # 80 × 1.10 = 88
    assert out == Decimal("88.0000")


def test_floor_plus_falls_back_to_cost_when_floor_missing() -> None:
    rule = FloorPlusRule(margin_pp=Decimal("20"))
    inputs = _inputs(floor=None, unit_cost=Decimal("70"))
    out = batch_mod._apply_floor_plus(rule, inputs)
    # 70 × 1.20 = 84
    assert out == Decimal("84.0000")


def test_floor_plus_degrades_to_current_when_both_missing() -> None:
    rule = FloorPlusRule(margin_pp=Decimal("15"))
    inputs = _inputs(floor=None, unit_cost=None)
    out = batch_mod._apply_floor_plus(rule, inputs)
    assert out == Decimal("100.0000")  # current_price


# ---------------------------------------------------------------------------
# PctMoveRule
# ---------------------------------------------------------------------------


def test_pct_move_applies_uniformly() -> None:
    rule = PctMoveRule(pct=Decimal("5"))
    inputs = _inputs(current_price=Decimal("100"))
    out = batch_mod._apply_pct_move(rule, inputs)
    assert out == Decimal("105.0000")


def test_pct_move_with_floor_cap_clamps_to_wtp_p90() -> None:
    rule = PctMoveRule(pct=Decimal("50"), floor_cap=True)
    inputs = _inputs(current_price=Decimal("100"), wtp_p90=Decimal("125"))
    out = batch_mod._apply_pct_move(rule, inputs)
    # +50% would be 150, but wtp p90 is 125 — cap kicks in.
    assert out == Decimal("125.0000")


def test_pct_move_without_floor_cap_unbounded() -> None:
    rule = PctMoveRule(pct=Decimal("50"), floor_cap=False)
    inputs = _inputs(current_price=Decimal("100"), wtp_p90=Decimal("125"))
    out = batch_mod._apply_pct_move(rule, inputs)
    assert out == Decimal("150.0000")


def test_pct_move_returns_none_when_current_price_missing() -> None:
    rule = PctMoveRule(pct=Decimal("10"))
    inputs = _inputs(current_price=None)
    out = batch_mod._apply_pct_move(rule, inputs)
    assert out is None


# ---------------------------------------------------------------------------
# MatchCompetitorRule
# ---------------------------------------------------------------------------


def test_match_competitor_undershoots() -> None:
    rule = MatchCompetitorRule(undershoot_pct=Decimal("3"))
    inputs = _inputs(competitor_median=Decimal("100"))
    out = batch_mod._apply_match_competitor(rule, inputs)
    # 100 × (1 - 0.03) = 97
    assert out == Decimal("97.0000")


def test_match_competitor_holds_current_when_competitor_missing() -> None:
    rule = MatchCompetitorRule(undershoot_pct=Decimal("5"))
    inputs = _inputs(competitor_median=None, current_price=Decimal("100"))
    out = batch_mod._apply_match_competitor(rule, inputs)
    assert out == Decimal("100.0000")


# ---------------------------------------------------------------------------
# CustomJsonLogicRule
# ---------------------------------------------------------------------------


def test_custom_jsonlogic_evaluates_var() -> None:
    """A trivial expression that returns the current price doubled."""
    # Our mini evaluator doesn't support arithmetic ops directly, so use
    # ``var`` to pull a context number — the result is the picked number.
    rule = CustomJsonLogicRule(expression={"var": "wtp_p90"})
    inputs = _inputs(wtp_p90=Decimal("123"))
    out = batch_mod._apply_custom_jsonlogic(rule, inputs)
    assert out == Decimal("123.0000")


def test_custom_jsonlogic_falls_back_on_truthy_bool() -> None:
    rule = CustomJsonLogicRule(
        expression={">": [{"var": "current_price"}, 0]}
    )
    inputs = _inputs(current_price=Decimal("100"))
    out = batch_mod._apply_custom_jsonlogic(rule, inputs)
    # A bare boolean result MUST fall back to current_price (see docstring).
    assert out == Decimal("100.0000")


def test_custom_jsonlogic_invalid_expression_falls_back() -> None:
    rule = CustomJsonLogicRule(expression={"unknown_op": [1, 2]})
    inputs = _inputs(current_price=Decimal("100"))
    out = batch_mod._apply_custom_jsonlogic(rule, inputs)
    assert out == Decimal("100.0000")


# ---------------------------------------------------------------------------
# Validation — missing required fields
# ---------------------------------------------------------------------------


def test_floor_plus_requires_margin_pp() -> None:
    from pydantic import ValidationError

    with pytest.raises(ValidationError):
        FloorPlusRule()


def test_pct_move_requires_pct() -> None:
    from pydantic import ValidationError

    with pytest.raises(ValidationError):
        PctMoveRule()


def test_target_db2_requires_target_pp() -> None:
    from pydantic import ValidationError

    with pytest.raises(ValidationError):
        TargetDb2Rule()


# ---------------------------------------------------------------------------
# ScopeFilter validation
# ---------------------------------------------------------------------------


def test_scope_filter_rejects_unknown_field() -> None:
    from pydantic import ValidationError

    with pytest.raises(ValidationError):
        ScopeFilter.model_validate({"unknown": "x"})


def test_scope_filter_accepts_optional_fields() -> None:
    sf = ScopeFilter.model_validate(
        {"tier": ["A"], "min_ltm_units": 100}
    )
    assert sf.tier == ["A"]
    assert sf.min_ltm_units == 100
    assert sf.family is None


# ---------------------------------------------------------------------------
# Risk score helper
# ---------------------------------------------------------------------------


def test_risk_score_zero_delta_is_low() -> None:
    out = batch_mod._risk_score(
        before_price=Decimal("100"),
        after_price=Decimal("100"),
        win_prob_at_new=Decimal("0.8"),
    )
    # 0 × 0.6 + 0.2 × 0.4 = 0.08
    assert out == Decimal("0.0800")


def test_risk_score_high_delta_high_win_loss_is_high() -> None:
    out = batch_mod._risk_score(
        before_price=Decimal("100"),
        after_price=Decimal("130"),
        win_prob_at_new=Decimal("0.2"),
    )
    # 0.3 × 0.6 + 0.8 × 0.4 = 0.18 + 0.32 = 0.5
    assert out == Decimal("0.5000")


def test_risk_score_missing_before_returns_none() -> None:
    out = batch_mod._risk_score(
        before_price=None,
        after_price=Decimal("100"),
        win_prob_at_new=Decimal("0.8"),
    )
    assert out is None


# ---------------------------------------------------------------------------
# Routing helper — would-be approval decision
# ---------------------------------------------------------------------------


def test_route_for_item_small_delta_routes_minimally() -> None:
    from backend.services.pricing.approval_rules import reset_cache_for_tests

    reset_cache_for_tests()
    needs, auto_approve, block, _reasons = batch_mod._route_for_item(
        aid="X-1",
        before_price=Decimal("100"),
        after_price=Decimal("101"),  # +1%
    )
    # Tier B + ~1% delta: no MD route, no block — and no auto-approve
    # because the auto-approve rule only fires for tier C/D.
    assert "md" not in needs
    assert block is False


def test_route_for_item_large_delta_routes_to_md() -> None:
    from backend.services.pricing.approval_rules import reset_cache_for_tests

    reset_cache_for_tests()
    needs, auto_approve, block, _reasons = batch_mod._route_for_item(
        aid="X-1",
        before_price=Decimal("100"),
        after_price=Decimal("110"),  # +10% → delta-over-5pct
    )
    assert "md" in needs
    assert auto_approve is False
