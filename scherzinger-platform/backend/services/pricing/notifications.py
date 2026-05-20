"""Pricing Studio v3 / Phase 7 — notification fan-out.

After ``publish_price`` writes the new price_book row, this dispatcher
fans out to the per-channel connectors configured by the proposal's
``notify`` flags::

    notify = {
        "sales": True,                 # → Slack DM to assigned rep
        "customers": ["c1", "c2"],     # → Email (one per recipient)
        "escalate": True,              # → internal escalation note
        "ab_test": False,              # → Action Center ab_setup (Phase 8)
    }

The Phase 7 deliverable ships *stub* connectors — each function logs
the intended message and returns a structured result dict so Phase 10
can plug real MCP/SMTP wiring in without touching this module.

Every dispatch returns a list of per-channel result dicts of the form::

    {"channel": str, "recipient": str, "status": "sent" | "failed",
     "error": str | None, "dispatched_at": iso-8601 str}

The dispatcher also writes a ``pricing_audit`` row (action =
``alert_triggered``) so the audit drawer + diff strip show the fan-out
as a single timeline entry alongside the publish itself.
"""
from __future__ import annotations

import logging
from datetime import datetime, timezone
from typing import Any, Optional
from uuid import UUID

from sqlalchemy.orm import Session

from backend.models.pricing.audit import (
    PricingAuditAction,
    PricingAuditTargetKind,
)

logger = logging.getLogger(__name__)


# ---------------------------------------------------------------------------
# Stub connectors. Phase 10 swaps in real Slack/SMTP wiring.
# ---------------------------------------------------------------------------


def _now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


def _result(
    *,
    channel: str,
    recipient: str,
    status: str,
    error: Optional[str] = None,
) -> dict[str, Any]:
    return {
        "channel": channel,
        "recipient": recipient,
        "status": status,
        "error": error,
        "dispatched_at": _now_iso(),
    }


def send_slack_dm(user_id: str, message: str) -> dict[str, Any]:
    """Stub: log the intended Slack DM and report success.

    TODO(phase-10): replace with the existing MCP-style Slack connector.
    """
    logger.info(
        "notifications.send_slack_dm user_id=%s message=%s",
        user_id,
        message,
    )
    return _result(channel="slack", recipient=user_id, status="sent")


def send_email(to: str, subject: str, body: str) -> dict[str, Any]:
    """Stub: log the intended email and report success.

    TODO(phase-10): replace with SES / SMTP fallback.
    """
    logger.info(
        "notifications.send_email to=%s subject=%s body_len=%d",
        to,
        subject,
        len(body),
    )
    return _result(channel="email", recipient=to, status="sent")


def write_internal_escalation(
    *,
    aid: str,
    actor: str,
    reason: str,
    db_session: Session,
) -> dict[str, Any]:
    """Write a pricing_audit row tagged as an escalation alert.

    The "recipient" of an internal escalation is the BU lead role; Phase
    10 will plug in real BU lead routing. For v3 we record the alert in
    the audit trail so the timeline drawer reflects the fan-out.
    """
    # Local import to avoid a cycle with services.pricing.audit, which
    # itself depends on the SSE bus.
    from backend.services.pricing.audit import record_audit

    try:
        record_audit(
            actor=actor,
            action=PricingAuditAction.ALERT_TRIGGERED,
            target_kind=PricingAuditTargetKind.SKU,
            target_id=aid,
            after={
                "channel": "internal_escalation",
                "aid": aid,
                "reason": reason,
            },
            reason=reason,
            session=db_session,
        )
    except Exception as exc:  # pragma: no cover - best-effort
        logger.exception(
            "notifications.write_internal_escalation failed aid=%s", aid
        )
        return _result(
            channel="internal_escalation",
            recipient="bu_lead",
            status="failed",
            error=str(exc),
        )
    return _result(
        channel="internal_escalation",
        recipient="bu_lead",
        status="sent",
    )


def trigger_ab_setup(
    *,
    aid: str,
    proposal_id: Optional[UUID],
) -> dict[str, Any]:
    """Stub: hand off to Action Center's existing ab_setup action.

    Phase 8 owns A/B test composition; Phase 7 just records that the
    proposal's notify.ab_test flag was acted on.
    """
    logger.info(
        "notifications.trigger_ab_setup aid=%s proposal_id=%s",
        aid,
        proposal_id,
    )
    return _result(
        channel="ab_test",
        recipient=str(proposal_id) if proposal_id else aid,
        status="sent",
    )


# ---------------------------------------------------------------------------
# Dispatcher.
# ---------------------------------------------------------------------------


def _coerce_customer_list(value: Any) -> list[str]:
    """Accept either ``True`` (no recipients), a list of customer ids, or
    a list of address strings. Returns a list of strings (recipients)."""
    if value is True:
        return []
    if isinstance(value, list):
        return [str(v) for v in value if v]
    if isinstance(value, str) and value:
        return [value]
    return []


def dispatch_notifications(
    *,
    aid: str,
    proposal_id: Optional[UUID],
    notify_flags: dict[str, Any],
    actor: str,
    db_session: Session,
    message: Optional[str] = None,
) -> list[dict[str, Any]]:
    """Fan out to each enabled channel and return per-channel results.

    ``notify_flags`` is the proposal's ``notify`` payload — already
    surfaced by the approval workflow. Empty / missing flags ⇒ no
    channels called.
    """
    results: list[dict[str, Any]] = []
    msg = message or f"Price updated for {aid}"

    sales = notify_flags.get("sales")
    if sales:
        # ``sales`` may be a bool (route to the assigned rep — name comes
        # from elsewhere) or an explicit user id. v3 stubs both.
        rep_id = sales if isinstance(sales, str) else "sales_lead"
        try:
            results.append(send_slack_dm(rep_id, msg))
        except Exception as exc:  # pragma: no cover
            logger.exception("dispatch_notifications.slack failed")
            results.append(
                _result(
                    channel="slack",
                    recipient=rep_id,
                    status="failed",
                    error=str(exc),
                )
            )

    customers = _coerce_customer_list(notify_flags.get("customers"))
    for recipient in customers:
        try:
            results.append(
                send_email(recipient, f"Price update for {aid}", msg)
            )
        except Exception as exc:  # pragma: no cover
            logger.exception(
                "dispatch_notifications.email failed recipient=%s", recipient
            )
            results.append(
                _result(
                    channel="email",
                    recipient=recipient,
                    status="failed",
                    error=str(exc),
                )
            )

    if notify_flags.get("escalate"):
        results.append(
            write_internal_escalation(
                aid=aid,
                actor=actor,
                reason=msg,
                db_session=db_session,
            )
        )

    if notify_flags.get("ab_test"):
        results.append(
            trigger_ab_setup(aid=aid, proposal_id=proposal_id)
        )

    return results
