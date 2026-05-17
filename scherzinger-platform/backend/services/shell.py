"""Phase 3 shell rail service.

Composes ShellRailData for a user from the notifications / panels / reviewers
/ shell_sections tables. The wire shape matches
``frontend-v2/src/types/shell.ts`` ShellRailData verbatim.
"""
from __future__ import annotations

from typing import Any
from uuid import UUID

from sqlalchemy import text
from sqlalchemy.orm import Session

from backend.models import Notification, Panel, Reviewer, SidebarSection
from backend.services import quote_service


def _live_section_subs(db: Session) -> dict[str, str]:
    """Compute live sub-text for the canonical Action Center sections.

    Replaces the seeded sub-strings (e.g. "1,015 SKUs") with values derived
    from the current DB so the right-rail mini-cards stay in sync with the
    main panels. Returns empty dict on failure — the caller falls back to
    the persisted ``sub`` column.
    """
    try:
        # Total active SKUs (this year) — matches movable+locked bucket sum.
        active_skus = db.execute(
            text(
                """
                SELECT COUNT(DISTINCT i.article_id) FROM invoices i
                 WHERE i.year >= EXTRACT(YEAR FROM CURRENT_DATE) - 1
                """
            )
        ).scalar() or 0
        # Total catalog SKUs.
        catalog_skus = db.execute(text("SELECT COUNT(*) FROM products")).scalar() or 0
        # Movable share for the trailing year (movable revenue / total).
        rev = db.execute(
            text(
                """
                WITH movable_articles AS (
                  SELECT DISTINCT article_id FROM (
                    SELECT article_id FROM product_cost_trends
                     WHERE period_start = (SELECT MAX(period_start) FROM product_cost_trends)
                    UNION
                    SELECT aid FROM ab_tests WHERE status = 'running'
                  ) m
                )
                SELECT
                  COALESCE(SUM(i.revenue) FILTER (
                    WHERE i.article_id IN (SELECT article_id FROM movable_articles)
                  ), 0),
                  COALESCE(SUM(i.revenue), 0)
                FROM invoices i
                WHERE i.year >= EXTRACT(YEAR FROM CURRENT_DATE) - 1
                """
            )
        ).fetchone()
        movable_rev = float(rev[0] or 0) if rev else 0
        total_rev = float(rev[1] or 0) if rev else 0
        movable_pct = int(round(movable_rev / total_rev * 100)) if total_rev else 0
        if movable_rev >= 1_000_000:
            movable_eur = f"€{movable_rev / 1_000_000:.2f}M"
        else:
            movable_eur = f"€{movable_rev / 1_000:.0f}k"
        # Decisions count — same heuristic the composer uses (margin
        # erosion + cost risers + churn ≥ threshold). Cheap COUNT-only
        # query so we don't re-run the full builders here.
        decisions_count = db.execute(
            text(
                """
                WITH yearly AS (
                  SELECT i.article_id, i.year,
                         AVG(i.db2_margin) FILTER (WHERE i.db2_margin IS NOT NULL) AS m,
                         COUNT(*) AS n
                  FROM invoices i
                  WHERE i.year >= EXTRACT(YEAR FROM CURRENT_DATE) - 2
                  GROUP BY i.article_id, i.year
                ),
                pivoted AS (
                  SELECT article_id,
                         MAX(m) FILTER (WHERE year = (SELECT MAX(year) FROM yearly)) AS this_y,
                         MAX(m) FILTER (WHERE year = (SELECT MAX(year) FROM yearly) - 1) AS last_y,
                         SUM(n) AS records
                  FROM yearly GROUP BY article_id
                )
                SELECT COUNT(*) FROM pivoted
                 WHERE this_y BETWEEN -1 AND 1 AND last_y BETWEEN -1 AND 1
                   AND records >= 3 AND (last_y - this_y) >= 0.05
                """
            )
        ).scalar() or 0
        risers = db.execute(
            text(
                """
                SELECT COUNT(DISTINCT article_id) FROM product_cost_trends
                 WHERE cost_change_pct >= 0.10
                   AND period_start = (SELECT MAX(period_start) FROM product_cost_trends)
                """
            )
        ).scalar() or 0
        churn = db.execute(
            text("SELECT COUNT(*) FROM customer_risk_scores WHERE risk_score >= 0.7")
        ).scalar() or 0
        total_decisions = int(decisions_count) + int(risers) + int(churn)

        # D15: Lost-quote differential — must match the same degraded/live
        # rule the Action Center lostQuote builder uses. If either group
        # has zero count or null avg_margin for the current year, we treat
        # the differential as unavailable (no automatic fallback to prior
        # year so the rail does not silently drift from the main panel).
        from datetime import datetime as _dt
        diff_pp = None
        try:
            sens = quote_service.get_price_sensitivity(db, year=_dt.utcnow().year)
            groups = {g["group"]: g for g in sens.get("groups", [])}
            w = groups.get("won") or {}
            l = groups.get("price_lost") or {}
            # Treat as unavailable when either group has 0 deals or null margin
            if (
                w.get("avg_margin") is not None
                and l.get("avg_margin") is not None
                and int(w.get("count") or 0) > 0
                and int(l.get("count") or 0) > 0
            ):
                diff_pp = round((float(l["avg_margin"]) - float(w["avg_margin"])) * 100, 1)
        except Exception:
            diff_pp = None
        diff_label = (
            f"{'+' if diff_pp >= 0 else ''}{diff_pp}pp differential"
            if diff_pp is not None
            else ""
        )

        # D15: when the lost-quote pipeline can't produce a differential
        # (block degraded), explicitly tell the rail "unavailable" so the
        # chip can't fall back to the seed "+1.8pp differential" string.
        lost_sub = diff_label if diff_label else "unavailable · pipeline degraded"
        return {
            "sec-movable": f"~{movable_pct}% · {movable_eur}",
            "sec-sku": f"{active_skus:,} of {catalog_skus:,} SKUs (this year)",
            "sec-decisions": f"{total_decisions} ranked actions",
            "sec-lost": lost_sub,
        }
    except Exception:
        return {}


def build_shell(db: Session, user_id: UUID) -> dict[str, Any]:
    notifications = (
        db.query(Notification)
        .filter_by(user_id=user_id)
        .order_by(Notification.created_at.desc(), Notification.id)
        .limit(20)
        .all()
    )

    panel = db.query(Panel).filter_by(owner_user_id=user_id).first()
    reviewer_rows: list[Reviewer] = []
    extra_count = 0
    panel_label = "Cross-functional pricing panel"
    if panel is not None:
        panel_label = panel.label
        reviewer_rows = (
            db.query(Reviewer)
            .filter_by(panel_id=panel.id)
            .order_by(Reviewer.sort_order, Reviewer.id)
            .limit(4)
            .all()
        )
        total = (
            db.query(Reviewer)
            .filter_by(panel_id=panel.id)
            .count()
        )
        extra_count = max(0, total - len(reviewer_rows)) + 5  # base extras seeded as 5

    sections = (
        db.query(SidebarSection)
        .filter_by(user_id=user_id)
        .order_by(SidebarSection.sort_order, SidebarSection.id)
        .all()
    )
    live_subs = _live_section_subs(db)

    return {
        "notifications": [
            {
                "id": n.external_id or str(n.id),
                "tone": n.tone,
                "title": n.title,
                "sub": n.sub,
                "unread": n.unread,
            }
            for n in notifications
        ],
        "reviewers": {
            "panelLabel": panel_label,
            "panelId": str(panel.id) if panel else None,
            "people": [
                {"id": str(r.id), "initials": r.initials, "bg": r.bg}
                for r in reviewer_rows
            ],
            "extraCount": extra_count,
        },
        "sections": [
            {
                "id": s.external_id or str(s.id),
                "title": s.title,
                "sub": live_subs.get(s.external_id or "") or s.sub or "",
                "href": s.href,
            }
            for s in sections
        ],
    }


def notify(
    db: Session,
    *,
    user_id: UUID,
    tone: str,
    title: str,
    sub: str,
    link: str | None = None,
    external_id: str | None = None,
) -> Notification:
    """Phase 3.T3 — single producer helper. All later phases that fan out
    notifications (briefings, A/B day-N, guardrail changes, …) call this.
    """
    n = Notification(
        user_id=user_id,
        tone=tone,
        title=title,
        sub=sub,
        link=link,
        external_id=external_id,
        unread=True,
    )
    db.add(n)
    db.flush()
    return n
