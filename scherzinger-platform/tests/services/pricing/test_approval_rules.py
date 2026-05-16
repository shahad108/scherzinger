"""Phase 21 — approval-rules engine."""
from __future__ import annotations

import json

import pytest

from backend.services.pricing import approval_rules as ar
from backend.services.pricing.approval_rules import (
    Proposal,
    reset_cache_for_tests,
    should_route_for_approval,
)


@pytest.fixture(autouse=True)
def _reset_cache():
    reset_cache_for_tests()
    yield
    reset_cache_for_tests()


def test_delta_over_5pct_routes_to_manuel() -> None:
    proposal = Proposal(delta_pct=6.5, delta_pp=4.0, tier="B", effective_in_hours=72)
    decision = should_route_for_approval(proposal)
    assert "manuel" in decision.needs
    assert "delta-over-5pct" in decision.thresholds_hit
    assert decision.auto_approve is False


def test_tier_a_routes_to_md() -> None:
    proposal = Proposal(delta_pct=1.5, delta_pp=1.0, tier="A", effective_in_hours=72)
    decision = should_route_for_approval(proposal)
    assert "md" in decision.needs
    assert "tier-a-customer" in decision.thresholds_hit


def test_small_delta_tier_c_auto_approves() -> None:
    proposal = Proposal(delta_pct=1.0, delta_pp=1.5, tier="C", effective_in_hours=72)
    decision = should_route_for_approval(proposal)
    assert decision.auto_approve is True
    assert decision.needs == []
    assert "small-delta-tier-cd-auto-approve" in decision.thresholds_hit


def test_small_delta_tier_d_auto_approves() -> None:
    proposal = Proposal(delta_pct=0.5, delta_pp=2.0, tier="D", effective_in_hours=72)
    decision = should_route_for_approval(proposal)
    assert decision.auto_approve is True
    assert decision.needs == []


def test_small_delta_tier_b_does_not_auto_approve() -> None:
    """Tier B small-delta is NOT in the auto-approve set."""
    proposal = Proposal(delta_pct=1.0, delta_pp=1.5, tier="B", effective_in_hours=72)
    decision = should_route_for_approval(proposal)
    assert decision.auto_approve is False


def test_short_lead_time_blocks() -> None:
    proposal = Proposal(delta_pct=1.0, delta_pp=1.0, tier="C", effective_in_hours=12)
    decision = should_route_for_approval(proposal)
    assert decision.block is True
    assert "needs_lead_time" in decision.needs
    assert decision.auto_approve is False


def test_routed_proposal_never_auto_approves() -> None:
    """Auto-approve flag is suppressed when any other rule routes."""
    proposal = Proposal(delta_pct=6.0, delta_pp=1.0, tier="C", effective_in_hours=72)
    decision = should_route_for_approval(proposal)
    assert "manuel" in decision.needs
    assert decision.auto_approve is False


# ---------------------------------------------------------------------------
# Defensive: malformed + adversarial rules must not raise out of the engine.
# ---------------------------------------------------------------------------


def _write_rules(tmp_path, rules):
    p = tmp_path / "rules.json"
    p.write_text(json.dumps({"rules": rules}), encoding="utf-8")
    return p


def test_typeerror_in_rule_evaluation_is_caught(tmp_path, monkeypatch) -> None:
    """A rule that compares None to a number (TypeError) must NOT 500.

    We point the engine at a fixture file via reload_rules() since the
    public surface no longer accepts a path argument.
    """
    # Inject a rule that will TypeError on Python 3 (None > 5).
    rules = [
        {
            "id": "broken-typeerror",
            "condition": {">": [{"var": "missing"}, 5]},
            "route_to": ["nobody"],
        },
        {
            "id": "small-delta-tier-cd-auto-approve",
            "condition": {
                "and": [
                    {"<": [{"var": "delta_pct"}, 2]},
                    {"or": [
                        {"==": [{"var": "tier"}, "C"]},
                        {"==": [{"var": "tier"}, "D"]},
                    ]},
                ]
            },
            "auto_approve": True,
        },
    ]
    p = _write_rules(tmp_path, rules)
    # ``_BIN_OPS`` short-circuits when either side is None, so disable
    # that guard for this test to force the TypeError path.
    monkeypatch.setitem(
        ar._BIN_OPS, ">", lambda a, b: a > b  # type: ignore[operator]
    )
    monkeypatch.setattr(ar, "DEFAULT_RULES_PATH", p)
    ar.reset_cache_for_tests()

    proposal = Proposal(delta_pct=1.0, delta_pp=1.0, tier="C", effective_in_hours=72)
    # MUST NOT raise.
    decision = should_route_for_approval(proposal)
    assert any("broken-typeerror" in r for r in decision.reasons)
    # The healthy rule still fires.
    assert decision.auto_approve is True


def test_deeply_nested_rule_does_not_blow_stack(tmp_path, monkeypatch) -> None:
    """A pathologically nested rule is treated as not-fired, not a 500."""
    # Build {"and":[{"and":[{"and":[ … {"==":[1,1]} ]}]}]} with 200 levels.
    node = {"==": [1, 1]}
    for _ in range(200):
        node = {"and": [node]}
    rules = [{"id": "too-deep", "condition": node, "route_to": ["nobody"]}]
    p = _write_rules(tmp_path, rules)
    monkeypatch.setattr(ar, "DEFAULT_RULES_PATH", p)
    ar.reset_cache_for_tests()

    proposal = Proposal(delta_pct=0.5, delta_pp=0.5, tier="C", effective_in_hours=72)
    decision = should_route_for_approval(proposal)
    # MUST NOT raise. The depth-exceeded rule is treated as not-fired
    # and surfaced via reasons.
    assert "nobody" not in decision.needs
    assert any("too-deep" in r for r in decision.reasons)


def test_reload_rules_is_required_to_repoint_path(tmp_path, monkeypatch) -> None:
    """The public ``should_route_for_approval`` no longer accepts a path.

    Tests must use ``reload_rules()`` (or ``reset_cache_for_tests()`` plus a
    monkeypatched ``DEFAULT_RULES_PATH``) to swap in a fixture rules file.
    This guards against a future regression that re-exposes the path arg.
    """
    import inspect

    sig = inspect.signature(should_route_for_approval)
    # Only `proposal` is allowed.
    assert list(sig.parameters) == ["proposal"]
