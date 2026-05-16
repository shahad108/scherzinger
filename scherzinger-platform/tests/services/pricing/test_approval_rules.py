"""Phase 21 — approval-rules engine."""
from __future__ import annotations

import pytest

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
