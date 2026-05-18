"""Header block — greeting + week + KPI stats.

Greeting comes from the authenticated user's display name. Week label
defers to the request's ``?week=`` query param when present, otherwise
the current ISO week computed from server clock.

Stats are wrapped over ``margin_service.get_margin_summary``: invoice
record count, distinct SKUs in current quote pipeline, and distinct
commodity groups. Raises :class:`ActionCenterBlockError` when no
invoices have been loaded; the composer then surfaces a degraded
header. Never falls back to seeded synthetic stats — plan §4 iron
rule 7.

Also surfaces ``workspaceScope`` and ``exportContext`` block fields
(plan §4 / §2.1 F2). Both are empty arrays today and unlock in Phase 2
when ``user_view_state`` + the report registry land.
"""
from __future__ import annotations

from datetime import date, datetime, timedelta
from typing import Any

from sqlalchemy import text

from backend.database import SessionLocal
from backend.services import margin_service

from ._seed import ActionCenterBlockError


def _iso_week_label(today: date) -> tuple[str, str]:
    iso = today.isocalendar()
    label = f"Week {iso.week}"
    monday = today - timedelta(days=today.weekday())
    sunday = monday + timedelta(days=6)
    range_label = (
        f"{monday.strftime('%b %-d')} – {sunday.strftime('%b %-d, %Y')}"
        if monday.month == sunday.month
        else f"{monday.strftime('%b %-d')} – {sunday.strftime('%b %-d, %Y')}"
    )
    return label, range_label


def _format_thousands(n: int) -> str:
    return f"{n:,}".replace(",", ",")


def _live_stats(db) -> list[dict[str, str]] | None:
    """Records / SKUs / commodity-group stats.

    ``records`` is the count of invoice rows in the trailing 30 days
    ending at ``MAX(invoices.date)``. Anchored on data-max so the demo
    dataset (raw stops 2025-12, seeded 2026 rows through ~May) keeps
    rendering a meaningful number. The accompanying label makes the
    window explicit ("records · last 30d") so it doesn't read as
    "this week".

    Returns None on any failure or if there's no data — caller raises
    :class:`ActionCenterBlockError` so the composer marks the header
    ``degraded``.
    """
    try:
        # Trailing 30 days from MAX(invoices.date). Both the value and the
        # label below are tied to this exact SQL — change them together.
        records_row = db.execute(
            text(
                """
                SELECT COUNT(*)
                  FROM invoices
                 WHERE date >= (SELECT MAX(date) FROM invoices) - INTERVAL '30 days'
                """
            )
        ).scalar()
        records = int(records_row or 0)
        if records == 0:
            return None

        sku_count = db.execute(text("SELECT COUNT(DISTINCT article_id) FROM products")).scalar() or 0
        commodity_count = db.execute(
            text("SELECT COUNT(DISTINCT commodity_group) FROM products WHERE commodity_group IS NOT NULL")
        ).scalar() or 0

        return [
            {"label": "invoice records · last 30d", "value": _format_thousands(records)},
            {"label": "SKUs", "value": _format_thousands(int(sku_count))},
            {"label": "commodity groups", "value": _format_thousands(int(commodity_count))},
        ]
    except Exception:
        return None


async def build(*, user_name: str, week: str | None) -> dict[str, Any]:
    greeting = f"Good morning, {user_name.split()[0]}."

    if week:
        week_label = week if week.lower().startswith("week") else f"Week {week}"
        date_range = "Operator-selected review window"
    else:
        wl, dr = _iso_week_label(date.today())
        week_label = wl
        date_range = dr

    try:
        with SessionLocal() as db:
            stats = _live_stats(db)
    except Exception:
        stats = None

    if stats is None:
        raise ActionCenterBlockError("header", "Header KPIs unavailable.")

    return {
        "greeting": greeting,
        "week": week_label,
        "dateRange": date_range,
        "stats": stats,
        # Workspace-scope + export-context drawer items. Empty today; the
        # frontend renders an honest empty-drawer stub. Plan §4 / §2.1 F2.
        # TODO Phase 2: populate from user_view_state + report registry.
        "workspaceScope": [],
        "exportContext": [],
    }
