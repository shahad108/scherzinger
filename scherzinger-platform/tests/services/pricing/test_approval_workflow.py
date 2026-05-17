"""Phase 5 — approval workflow service tests.

Exercises ``submit_proposal_for_approval`` + ``apply_decision`` against
a live DB session. Frank is the proposal creator; Manuel + MD are the
approver roles in the seeded JSON rules.

These tests skip cleanly when the test DB isn't reachable.
"""
from __future__ import annotations

from decimal import Decimal
from uuid import uuid4

import pytest

from backend.models.pricing.approval import (
    ApprovalAction,
    ApprovalDecisionKind,
    ApprovalInstance,
    ApprovalStepState,
)
from backend.services.pricing import approval_workflow
from backend.services.pricing.approval_rules import reset_cache_for_tests


pytest.importorskip("psycopg2")


@pytest.fixture
def db():
    from backend.database import SessionLocal

    session = SessionLocal()
    # Sanity-poke the DB; skip the whole module if unreachable.
    try:
        session.execute(_select_one())
    except Exception:
        pytest.skip("test DB unreachable")
    yield session
    session.rollback()
    session.close()


def _select_one():
    from sqlalchemy import text

    return text("SELECT 1")


def _seed_user(db) -> "UUID":
    from backend.models import User

    uid = uuid4()
    user = User(
        id=uid,
        email=f"u{uid.hex[:8]}@example.com",
        name="Test User",
        dept="x",
        ui_persona_default="frank",
        password_hash="x",
    )
    db.add(user)
    db.flush()
    return uid


def _seed_proposal(
    db,
    *,
    creator_id,
    delta_pp: Decimal = Decimal("3.0"),
    current_price: Decimal = Decimal("100.00"),
    proposed_price: Decimal = Decimal("106.00"),
    tier: str = "B",
    aid: str = "TEST-A",
):
    from backend.models import PricingProposal, Recommendation

    rec = Recommendation(
        source_kind="test",
        source_ref=f"test:{uuid4().hex[:12]}",
        article_id=aid,
        title="test proposal",
        status="open",
        owner_user_id=creator_id,
        payload={},
    )
    db.add(rec)
    db.flush()
    proposal = PricingProposal(
        recommendation_id=rec.id,
        article_id=aid,
        current_price=current_price,
        proposed_price=proposed_price,
        delta_pp=delta_pp,
        status="draft",
        approval_required=False,
        created_by=creator_id,
        payload={"tier": tier, "effective_in_hours": 72},
    )
    db.add(proposal)
    db.flush()
    return proposal


@pytest.fixture(autouse=True)
def _reset_rules_cache():
    reset_cache_for_tests()
    yield
    reset_cache_for_tests()


def test_submit_with_delta_over_5pct_routes_to_manuel(db) -> None:
    creator = _seed_user(db)
    proposal = _seed_proposal(
        db,
        creator_id=creator,
        delta_pp=Decimal("4.0"),
        current_price=Decimal("100"),
        proposed_price=Decimal("106"),  # +6% — triggers delta-over-5pct
        tier="B",
    )
    instance, decision = approval_workflow.submit_proposal_for_approval(
        session=db, proposal=proposal, actor=str(creator)
    )
    db.flush()
    assert "manuel" in decision.needs
    assert len(instance.steps) == 1
    assert instance.steps[0]["role"] == "manuel"
    assert instance.steps[0]["decision"] == ApprovalStepState.PENDING.value
    assert proposal.status == "pending_approval"


def test_submit_with_small_delta_tier_c_auto_approves(db) -> None:
    creator = _seed_user(db)
    proposal = _seed_proposal(
        db,
        creator_id=creator,
        delta_pp=Decimal("1.5"),
        current_price=Decimal("100"),
        proposed_price=Decimal("101.5"),  # +1.5% — under all delta thresholds
        tier="C",
    )
    instance, decision = approval_workflow.submit_proposal_for_approval(
        session=db, proposal=proposal, actor=str(creator)
    )
    db.flush()
    assert decision.auto_approve is True
    assert instance.steps == []
    assert proposal.status == "approved"


def test_approve_advances_through_multiple_steps(db) -> None:
    """A tier-A customer with delta > 5% routes to both manuel and md."""
    creator = _seed_user(db)
    proposal = _seed_proposal(
        db,
        creator_id=creator,
        delta_pp=Decimal("4.0"),
        current_price=Decimal("100"),
        proposed_price=Decimal("110"),  # +10% — fires delta-over-5pct
        tier="A",  # fires tier-a-customer
    )
    instance, decision = approval_workflow.submit_proposal_for_approval(
        session=db, proposal=proposal, actor=str(creator)
    )
    db.flush()
    assert "manuel" in decision.needs
    assert "md" in decision.needs
    assert [s["role"] for s in instance.steps] == ["manuel", "md"]
    assert proposal.status == "pending_approval"

    # Step 0 (manuel) approves — instance must advance, proposal stays pending.
    approval_workflow.apply_decision(
        session=db,
        instance=instance,
        proposal=proposal,
        actor="manuel-actor",
        actor_roles=["manuel"],
        decision=ApprovalDecisionKind.APPROVE,
        comment="ok at manuel",
    )
    db.flush()
    assert instance.current_step == 1
    assert instance.steps[0]["decision"] == ApprovalStepState.APPROVED.value
    assert instance.steps[1]["decision"] == ApprovalStepState.PENDING.value
    assert proposal.status == "pending_approval"

    # Step 1 (md) approves — proposal terminally approves.
    approval_workflow.apply_decision(
        session=db,
        instance=instance,
        proposal=proposal,
        actor="md-actor",
        actor_roles=["md"],
        decision=ApprovalDecisionKind.APPROVE,
        comment="ok at md",
    )
    db.flush()
    assert proposal.status == "approved"
    assert all(s["decision"] == ApprovalStepState.APPROVED.value for s in instance.steps)


def test_reject_marks_proposal_rejected(db) -> None:
    creator = _seed_user(db)
    proposal = _seed_proposal(
        db,
        creator_id=creator,
        delta_pp=Decimal("4.0"),
        current_price=Decimal("100"),
        proposed_price=Decimal("106"),
        tier="B",
    )
    instance, _decision = approval_workflow.submit_proposal_for_approval(
        session=db, proposal=proposal, actor=str(creator)
    )
    db.flush()
    approval_workflow.apply_decision(
        session=db,
        instance=instance,
        proposal=proposal,
        actor="manuel-actor",
        actor_roles=["manuel"],
        decision=ApprovalDecisionKind.REJECT,
        comment="margin too thin",
    )
    db.flush()
    assert proposal.status == "rejected"
    assert instance.steps[0]["decision"] == ApprovalStepState.REJECTED.value


def test_request_changes_marks_proposal_changes_requested(db) -> None:
    creator = _seed_user(db)
    proposal = _seed_proposal(
        db,
        creator_id=creator,
        delta_pp=Decimal("4.0"),
        current_price=Decimal("100"),
        proposed_price=Decimal("106"),
        tier="B",
    )
    instance, _ = approval_workflow.submit_proposal_for_approval(
        session=db, proposal=proposal, actor=str(creator)
    )
    db.flush()
    approval_workflow.apply_decision(
        session=db,
        instance=instance,
        proposal=proposal,
        actor="manuel-actor",
        actor_roles=["manuel"],
        decision=ApprovalDecisionKind.REQUEST_CHANGES,
        comment="please cite the cost source",
    )
    db.flush()
    assert proposal.status == "changes_requested"
    assert instance.steps[0]["decision"] == ApprovalStepState.CHANGES_REQUESTED.value


def test_decision_requires_matching_role(db) -> None:
    creator = _seed_user(db)
    proposal = _seed_proposal(
        db,
        creator_id=creator,
        delta_pp=Decimal("4.0"),
        current_price=Decimal("100"),
        proposed_price=Decimal("106"),
        tier="B",
    )
    instance, _ = approval_workflow.submit_proposal_for_approval(
        session=db, proposal=proposal, actor=str(creator)
    )
    db.flush()
    with pytest.raises(approval_workflow.ApprovalWorkflowError) as exc:
        approval_workflow.apply_decision(
            session=db,
            instance=instance,
            proposal=proposal,
            actor="rando",
            actor_roles=["sales"],  # not manuel
            decision=ApprovalDecisionKind.APPROVE,
            comment=None,
        )
    assert "roles do not include" in str(exc.value)


def test_recall_only_allowed_in_draft(db) -> None:
    creator = _seed_user(db)
    proposal = _seed_proposal(
        db,
        creator_id=creator,
        delta_pp=Decimal("1.5"),
        current_price=Decimal("100"),
        proposed_price=Decimal("101.5"),
        tier="C",
    )
    # While draft: recall works.
    approval_workflow.recall_proposal(session=db, proposal=proposal, actor=str(creator))
    db.flush()
    assert proposal.status == "recalled"

    # And a fresh proposal that's already pending_approval cannot be recalled.
    proposal2 = _seed_proposal(
        db,
        creator_id=creator,
        delta_pp=Decimal("4.0"),
        current_price=Decimal("100"),
        proposed_price=Decimal("106"),
        tier="B",
    )
    approval_workflow.submit_proposal_for_approval(
        session=db, proposal=proposal2, actor=str(creator)
    )
    db.flush()
    with pytest.raises(approval_workflow.ApprovalWorkflowError):
        approval_workflow.recall_proposal(session=db, proposal=proposal2, actor=str(creator))


def test_action_row_is_persisted_for_each_decision(db) -> None:
    creator = _seed_user(db)
    proposal = _seed_proposal(
        db,
        creator_id=creator,
        delta_pp=Decimal("4.0"),
        current_price=Decimal("100"),
        proposed_price=Decimal("106"),
        tier="B",
    )
    instance, _ = approval_workflow.submit_proposal_for_approval(
        session=db, proposal=proposal, actor=str(creator)
    )
    db.flush()
    approval_workflow.apply_decision(
        session=db,
        instance=instance,
        proposal=proposal,
        actor="manuel-actor",
        actor_roles=["manuel"],
        decision=ApprovalDecisionKind.APPROVE,
        comment="ok",
    )
    db.flush()
    rows = (
        db.query(ApprovalAction)
        .filter(ApprovalAction.approval_instance_id == instance.id)
        .all()
    )
    assert len(rows) == 1
    assert rows[0].decision == "approve"
    assert rows[0].comment == "ok"


def test_inbox_returns_pending_instances_for_matching_role(db) -> None:
    creator = _seed_user(db)
    proposal = _seed_proposal(
        db,
        creator_id=creator,
        delta_pp=Decimal("4.0"),
        current_price=Decimal("100"),
        proposed_price=Decimal("106"),
        tier="B",
    )
    approval_workflow.submit_proposal_for_approval(
        session=db, proposal=proposal, actor=str(creator)
    )
    db.flush()

    items = approval_workflow.inbox_for_roles(session=db, user_roles=["manuel"])
    matching = [i for i in items if i["proposal_id"] == str(proposal.id)]
    assert len(matching) == 1
    assert matching[0]["step_role"] == "manuel"

    # A user without the manuel role doesn't see it.
    items_other = approval_workflow.inbox_for_roles(session=db, user_roles=["sales"])
    matching_other = [i for i in items_other if i["proposal_id"] == str(proposal.id)]
    assert matching_other == []
