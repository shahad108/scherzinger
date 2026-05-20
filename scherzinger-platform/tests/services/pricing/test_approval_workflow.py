"""Phase 5 — approval workflow service tests.

Exercises ``submit_proposal_for_approval`` + ``apply_decision`` against
a live DB session. Frank is the proposal creator; ``md`` is the only
seeded approver role (see MF1 — Manuel is reserved for a future
intermediate-approver role, but until that role is seeded delta>5% and
tier-A both route to ``md``).

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


def test_submit_with_delta_over_5pct_routes_to_md(db) -> None:
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
    assert "md" in decision.needs
    assert len(instance.steps) == 1
    assert instance.steps[0]["role"] == "md"
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


def test_tier_a_with_high_delta_routes_to_md_deduped(db) -> None:
    """Tier-A customer with delta>5% fires BOTH delta-over-5pct + tier-a-customer.

    Post-MF1 both rules route to ``md``, so the rules engine must dedupe
    them into a single approval step (the user already proved they can act
    as ``md`` — making them approve twice is product noise).
    """
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
    assert decision.needs == ["md"]
    assert "delta-over-5pct" in decision.thresholds_hit
    assert "tier-a-customer" in decision.thresholds_hit
    assert [s["role"] for s in instance.steps] == ["md"]
    assert proposal.status == "pending_approval"

    # MD approves — terminal approve, proposal flips to approved.
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
        actor="md-actor",
        actor_roles=["md"],
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
        actor="md-actor",
        actor_roles=["md"],
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
            actor_roles=["sales"],  # not md
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
        actor="md-actor",
        actor_roles=["md"],
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

    items = approval_workflow.inbox_for_roles(session=db, user_roles=["md"])
    matching = [i for i in items if i["proposal_id"] == str(proposal.id)]
    assert len(matching) == 1
    assert matching[0]["step_role"] == "md"

    # A user without the md role doesn't see it.
    items_other = approval_workflow.inbox_for_roles(session=db, user_roles=["sales"])
    matching_other = [i for i in items_other if i["proposal_id"] == str(proposal.id)]
    assert matching_other == []


def test_concurrent_apply_decision_serialises_via_row_lock(db) -> None:
    """MF3 — two approvers racing through ``apply_decision`` must not
    both succeed.

    Without ``SELECT FOR UPDATE`` on the approval_instance row, two
    concurrent transactions can both observe the same pending step,
    both append ApprovalAction rows, and both flip ``proposal.status``
    → duplicate side effects.

    With the row lock, the second transaction blocks until the first
    commits, then re-reads the post-commit state and finds no pending
    step → raises ApprovalWorkflowError.

    We commit the seed data so the lock-blocked second session can
    actually observe the first session's updates after it commits.
    Cleanup via explicit deletes at the end keeps the test isolated.
    """
    import threading

    from backend.database import SessionLocal
    from backend.models import PricingProposal
    from backend.models.pricing.approval import ApprovalInstance

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
    db.commit()  # Persist so both worker sessions can observe the row.

    proposal_id = proposal.id
    instance_id = instance.id

    results: list[tuple[bool, str | None]] = []
    barrier = threading.Barrier(2)

    def _worker(label: str) -> None:
        session = SessionLocal()
        try:
            inst = session.get(ApprovalInstance, instance_id)
            prop = session.get(PricingProposal, proposal_id)
            barrier.wait(timeout=10)  # Release both threads simultaneously.
            try:
                approval_workflow.apply_decision(
                    session=session,
                    instance=inst,
                    proposal=prop,
                    actor=f"md-{label}",
                    actor_roles=["md"],
                    decision=ApprovalDecisionKind.APPROVE,
                    comment=label,
                )
                session.commit()
                results.append((True, None))
            except approval_workflow.ApprovalWorkflowError as exc:
                session.rollback()
                results.append((False, str(exc)))
        finally:
            session.close()

    t1 = threading.Thread(target=_worker, args=("A",))
    t2 = threading.Thread(target=_worker, args=("B",))
    t1.start()
    t2.start()
    t1.join(timeout=20)
    t2.join(timeout=20)

    # Exactly one worker wins; the other must observe the post-commit
    # state and raise (no pending step OR proposal already terminal).
    winners = [r for r in results if r[0]]
    losers = [r for r in results if not r[0]]
    try:
        assert len(winners) == 1, f"expected exactly one winner, got {results!r}"
        assert len(losers) == 1, f"expected exactly one loser, got {results!r}"

        # Exactly one ApprovalAction row landed.
        check = SessionLocal()
        try:
            actions = (
                check.query(ApprovalAction)
                .filter(ApprovalAction.approval_instance_id == instance_id)
                .all()
            )
            assert len(actions) == 1, f"expected 1 action row, got {len(actions)}"
            prop_check = check.get(PricingProposal, proposal_id)
            assert prop_check.status == "approved"
        finally:
            check.close()
    finally:
        # Clean up the persisted rows so the test stays isolated.
        cleanup = SessionLocal()
        try:
            cleanup.query(ApprovalAction).filter(
                ApprovalAction.approval_instance_id == instance_id
            ).delete()
            cleanup.query(ApprovalInstance).filter(
                ApprovalInstance.id == instance_id
            ).delete()
            cleanup.query(PricingProposal).filter(
                PricingProposal.id == proposal_id
            ).delete()
            cleanup.commit()
        finally:
            cleanup.close()
