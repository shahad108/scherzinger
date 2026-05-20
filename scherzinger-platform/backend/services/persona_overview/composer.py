"""Read-only persona-overview composers (Phase 12).

These return whatever real rows we have today for Till (MD) and Heiko
(Sales). Both screens are intentionally narrow: a KPI strip, a queue
table, and a list of decisions Frank shared with them. Neither persona
mutates state from the landing page; the route contract is read-only.
"""
from __future__ import annotations

from typing import Any
from uuid import UUID

from sqlalchemy import desc
from sqlalchemy.orm import Session

from backend.models import (
    AbTest,
    AuditLog,
    Notification,
    PricingProposal,
    Recommendation,
)
from backend.services import quote_service


def _share_notifications(db: Session, user_id: UUID, limit: int = 25) -> list[dict[str, Any]]:
    """Notifications that came from a Frank ``share_decision`` action.

    external_id pattern ``share:{hash16}`` is set by actions._share_decision().
    """
    rows = (
        db.query(Notification)
        .filter(Notification.user_id == user_id)
        .filter(Notification.external_id.like("share:%"))
        .order_by(desc(Notification.created_at))
        .limit(limit)
        .all()
    )
    return [
        {
            "id": str(n.id),
            "external_id": n.external_id,
            "title": n.title,
            "sub": n.sub,
            "link": n.link,
            "unread": bool(n.unread),
            "created_at": n.created_at.isoformat() if n.created_at else None,
        }
        for n in rows
    ]


# ---------------------------------------------------------------------------
# Till — MD overview


def build_md_overview(db: Session, *, user_id: UUID, user_name: str | None) -> dict[str, Any]:
    pending = (
        db.query(PricingProposal)
        .filter(
            PricingProposal.status.in_(("pending_approval", "draft"))
        )
        .order_by(desc(PricingProposal.created_at))
        .limit(20)
        .all()
    )

    pending_approval_count = sum(1 for p in pending if p.status == "pending_approval")
    draft_count = sum(1 for p in pending if p.status == "draft")

    estimated_eur = 0.0
    for p in pending:
        if p.current_price is not None and p.proposed_price is not None:
            estimated_eur += float(p.proposed_price) - float(p.current_price)

    ab_running = (
        db.query(AbTest)
        .filter(AbTest.status == "running")
        .count()
    )

    shares = _share_notifications(db, user_id)
    unread_shares = sum(1 for s in shares if s["unread"])

    recent_audit = (
        db.query(AuditLog)
        .order_by(desc(AuditLog.created_at))
        .limit(15)
        .all()
    )

    proposals_payload = [
        {
            "id": str(p.id),
            "article_id": p.article_id,
            "current_price": float(p.current_price) if p.current_price is not None else None,
            "proposed_price": float(p.proposed_price) if p.proposed_price is not None else None,
            "delta_pp": float(p.delta_pp) if p.delta_pp is not None else None,
            "status": p.status,
            "approval_required": bool(p.approval_required),
            "created_at": p.created_at.isoformat() if p.created_at else None,
        }
        for p in pending
    ]

    return {
        "header": {
            "title": "Managing Director — Overview",
            "sub": "Read-only · what Frank just decided · what needs your sign-off",
            "for_user": user_name or "Till",
        },
        "kpis": [
            {
                "key": "pending_approval",
                "label": "Pending approval",
                "value": pending_approval_count,
                "sub": "proposals awaiting MD sign-off",
                "tone": "warning" if pending_approval_count else "neutral",
            },
            {
                "key": "drafts",
                "label": "Draft proposals",
                "value": draft_count,
                "sub": "Frank's current cycle",
                "tone": "info",
            },
            {
                "key": "ab_running",
                "label": "A/B tests live",
                "value": ab_running,
                "sub": "with pre-launch audit",
                "tone": "info",
            },
            {
                "key": "shares",
                "label": "Shared with me",
                "value": len(shares),
                "sub": f"{unread_shares} unread",
                "tone": "warning" if unread_shares else "neutral",
            },
        ],
        "approvalQueue": {
            "title": "Approval queue",
            "subtitle": "Proposals Frank has staged. Pending-approval rows need a MD sign-off before they go live.",
            "rows": proposals_payload,
        },
        "shares": {
            "title": "Shared with me — from Frank",
            "subtitle": "Decisions Frank flagged for your eyes. Click through to see the audit-trail receipt.",
            "rows": shares,
        },
        "recentAudit": [
            {
                "kind": a.action_kind,
                "target_id": a.target_id,
                "audit_hash": getattr(a, "audit_hash", None),
                "actor_persona": a.actor_persona,
                "created_at": a.created_at.isoformat() if a.created_at else None,
            }
            for a in recent_audit
        ],
        "crossLinks": [
            {"label": "Pricing Action Center (read-only)", "jumpTo": "/action-center?persona=till"},
            {"label": "Monday briefing — Till variant", "jumpTo": "/ai?persona=till"},
            {"label": "Model cards · Trust surface", "jumpTo": "/settings/model-cards"},
        ],
        "heuristic": {
            "label": "Read-only overview",
            "rule": "Counts read live from pricing_proposals, ab_tests, notifications, audit_log. No state changes from this screen.",
        },
    }


# ---------------------------------------------------------------------------
# Heiko — deal inbox


def build_deal_inbox(db: Session, *, user_id: UUID, user_name: str | None) -> dict[str, Any]:
    shares = _share_notifications(db, user_id)
    unread_shares = sum(1 for s in shares if s["unread"])

    # Lost-quote gap signal (same data feeding Frank's /quotes page, but
    # framed for Heiko: "the customers we lost margin on at the negotiation
    # table"). Read-only — Heiko can't mutate.
    try:
        gap = quote_service.get_quote_to_invoice_gap(db)
    except Exception:  # noqa: BLE001 - resilience for read-only screen
        gap = {"overall": None, "byYear": []}

    overall = gap.get("overall") or {}
    median_pp = overall.get("median_gap_pp")
    mean_pp = overall.get("mean_gap_pp")
    n = overall.get("n")

    ab_running = (
        db.query(AbTest)
        .filter(AbTest.status == "running")
        .count()
    )

    recent_recs = (
        db.query(Recommendation)
        .order_by(desc(Recommendation.updated_at))
        .limit(10)
        .all()
    )

    return {
        "header": {
            "title": "Sales — Deal Inbox",
            "sub": "Read-only · decisions Frank shared with you · negotiation context",
            "for_user": user_name or "Heiko",
        },
        "kpis": [
            {
                "key": "shares",
                "label": "Shared with me",
                "value": len(shares),
                "sub": f"{unread_shares} unread",
                "tone": "warning" if unread_shares else "neutral",
            },
            {
                "key": "quote_invoice_gap",
                "label": "Quote→invoice median gap",
                "value": f"{median_pp:.1f}pp" if median_pp is not None else "—",
                "sub": f"{mean_pp:.1f}pp mean · n={n:,}" if (mean_pp is not None and n) else "linkage unavailable",
                "tone": "warning",
            },
            {
                "key": "ab_running",
                "label": "Live A/B tests",
                "value": ab_running,
                "sub": "Frank's price experiments",
                "tone": "info",
            },
        ],
        "shares": {
            "title": "Shared with me — from Frank",
            "subtitle": "Negotiation prep + customer follow-up cues. Click through to source.",
            "rows": shares,
        },
        "lostQuote": {
            "title": "Quote → invoice gap",
            "subtitle": "What we promise on the quote vs what we book on the invoice. Use as a negotiation anchor.",
            "overall": overall or None,
            "byYear": gap.get("byYear") or [],
        },
        "recentRecs": [
            {
                "id": str(r.id),
                "title": r.title,
                "article_id": r.article_id,
                "cluster": r.cluster,
                "status": r.status,
                "source_kind": r.source_kind,
            }
            for r in recent_recs
        ],
        "crossLinks": [
            {"label": "Quotes & guardrails (read-only)", "jumpTo": "/quotes?persona=heiko"},
            {"label": "Lost-quote differential (margin)", "jumpTo": "/margin?persona=heiko"},
        ],
        "heuristic": {
            "label": "Read-only inbox",
            "rule": "Shares + lost-quote gap pulled live. Heiko cannot accept/reject decisions from this screen — flip to Frank's view for that.",
        },
    }
