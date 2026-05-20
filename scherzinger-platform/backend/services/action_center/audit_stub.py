"""Audit feed for Action Center.

Phase 12 (P12.T7) — reads from ``audit_service.recent`` for the calling
user. Returns ``[]`` when the user has no recent audit rows; the
composer then classifies the block ``status: 'empty'`` and the frontend
renders an honest empty panel rather than synthesised history (plan §4
iron rule 7).
"""
from __future__ import annotations

from datetime import timedelta
from typing import Any
from uuid import UUID

from backend.database import SessionLocal
from backend.services import audit_service


_KIND_TO_LABEL = {
    "accept_recommendation": "Accepted recommendation",
    "decline_recommendation": "Declined recommendation",
    "partial_accept": "Partial accept",
    "start_ab_test": "A/B test started",
    "stop_ab_test": "A/B test stopped",
    "quote_approve": "Quote approved",
    "quote_counter": "Quote countered",
    "quote_decline": "Quote declined",
    "quote_hold": "Quote held",
    "quote_bulk": "Bulk quote action",
    "studio_accept": "Studio decision accepted",
    "briefing_forward": "Briefing forwarded",
    "briefing_pdf": "Briefing exported (PDF)",
    "briefing_email": "Briefing emailed",
    "guardrail_edit_request": "Guardrail edit requested",
    "guardrail_apply": "Guardrail applied",
    "forecast_override": "Forecast overridden",
    "notification_read": "Notification read",
    "section_save": "Sidebar section saved",
    "section_remove": "Sidebar section removed",
}


def _format_row(row: Any, actor_name: str) -> dict[str, Any]:
    label = _KIND_TO_LABEL.get(row.action_kind, row.action_kind)
    target = row.target_id or row.target_type or ""
    change = f"{label}: {target}" if target else label
    delta_bits: list[str] = []
    if row.delta_pp is not None:
        delta_bits.append(f"Δ {float(row.delta_pp):+.1f}pp")
    if row.audit_hash:
        delta_bits.append(f"#{row.audit_hash[:8]}")
    return {
        "actor": actor_name,
        "change": change,
        "delta": " · ".join(delta_bits) if delta_bits else "—",
        "ts": row.created_at.strftime("%Y-%m-%d %H:%M") if row.created_at else "—",
    }


async def build(user_id: str | None = None, user_name: str | None = None) -> list[dict[str, Any]]:
    """Return the last 30 days of audit rows for the user, formatted for the UI."""
    if user_id:
        try:
            uid = UUID(user_id)
        except ValueError:
            uid = None
        if uid is not None:
            with SessionLocal() as db:
                rows = audit_service.recent(
                    db, actor_user_id=uid, since=timedelta(days=30), limit=30
                )
            if rows:
                actor = user_name or "User"
                return [_format_row(r, actor) for r in rows]
    return []
