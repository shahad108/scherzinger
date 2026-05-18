"""Bucket cards — Movable / Locked.

Reuses the same movable / locked classification as ``movable_hero``: an
article is movable if it has a recent cost movement OR is in a running
A/B test. Raises :class:`ActionCenterBlockError` when invoices are empty
or the SQL fails. Never falls back to seeded synthetic buckets —
plan §4 iron rule 7.
"""
from __future__ import annotations

from typing import Any

from sqlalchemy import text

from backend.database import SessionLocal

from ._intents import bucket_action
from ._seed import ActionCenterBlockError


_FORMAT_EUR_M = lambda v: (
    f"€{v / 1_000_000:.2f}M" if v >= 1_000_000 else f"€{v / 1_000:.0f}k" if v >= 1_000 else f"€{v:,.0f}"
)


def _bucket_metrics(db) -> dict[str, Any] | None:
    row = (
        db.execute(
            text(
                """
                WITH movable_articles AS (
                  SELECT DISTINCT article_id FROM (
                    SELECT article_id FROM product_cost_trends
                     WHERE period_start = (SELECT MAX(period_start) FROM product_cost_trends)
                    UNION
                    SELECT aid AS article_id FROM ab_tests WHERE status = 'running'
                  ) m
                ),
                classified AS (
                  SELECT i.article_id, i.revenue, p.commodity_group,
                         CASE WHEN ma.article_id IS NOT NULL THEN TRUE ELSE FALSE END AS is_movable
                    FROM invoices i
                    JOIN products p ON p.article_id = i.article_id
                    LEFT JOIN movable_articles ma ON ma.article_id = i.article_id
                   WHERE i.year >= EXTRACT(YEAR FROM CURRENT_DATE) - 1
                ),
                catalog AS (SELECT COUNT(*) AS total_skus FROM products)
                SELECT
                  COALESCE(SUM(revenue) FILTER (WHERE is_movable), 0) AS movable_rev,
                  COALESCE(SUM(revenue) FILTER (WHERE NOT is_movable), 0) AS locked_rev,
                  COUNT(DISTINCT article_id) FILTER (WHERE is_movable) AS movable_skus,
                  COUNT(DISTINCT article_id) FILTER (WHERE NOT is_movable) AS locked_skus,
                  COUNT(DISTINCT commodity_group) FILTER (WHERE is_movable) AS movable_groups,
                  (SELECT total_skus FROM catalog) AS catalog_skus
                FROM classified
                """
            )
        )
        .mappings()
        .one_or_none()
    )
    if not row:
        return None
    if int(row["movable_skus"] or 0) == 0 and int(row["locked_skus"] or 0) == 0:
        return None

    # Top commodity group by *overall* 2025 revenue (not restricted to the
    # movable subset). Matches the audit's recommendation and the Pricing
    # Studio header which both surface BKAES as the cluster leader.
    lead_row = (
        db.execute(
            text(
                """
                SELECT commodity_group,
                       SUM(revenue) AS rev,
                       COUNT(DISTINCT article_id) AS skus
                  FROM invoices
                 WHERE year = 2025
                   AND commodity_group IS NOT NULL
                 GROUP BY commodity_group
                 ORDER BY rev DESC
                 LIMIT 1
                """
            )
        )
        .mappings()
        .one_or_none()
    )
    if lead_row:
        cluster_lead = str(lead_row["commodity_group"])
        cluster_lead_rev = float(lead_row["rev"] or 0)
        cluster_lead_skus = int(lead_row["skus"] or 0)
    else:
        cluster_lead = None
        cluster_lead_rev = 0.0
        cluster_lead_skus = 0

    return {
        "movable_rev": float(row["movable_rev"] or 0),
        "locked_rev": float(row["locked_rev"] or 0),
        "movable_skus": int(row["movable_skus"] or 0),
        "locked_skus": int(row["locked_skus"] or 0),
        "movable_groups": int(row["movable_groups"] or 0),
        "cluster_lead": cluster_lead,
        "cluster_lead_rev": cluster_lead_rev,
        "cluster_lead_skus": cluster_lead_skus,
        "catalog_skus": int(row["catalog_skus"] or 0),
    }


def _attach_actions(buckets: list[dict[str, Any]]) -> list[dict[str, Any]]:
    for b in buckets:
        bid = str(b.get("id") or "")
        if bid and "action" not in b:
            b["action"] = bucket_action(bid)
    return buckets


async def build(*, hide_locked: bool) -> list[dict[str, Any]]:
    try:
        with SessionLocal() as db:
            m = _bucket_metrics(db)
        if not m:
            raise ActionCenterBlockError("buckets", "Bucket summary unavailable.")
        active_skus = m["movable_skus"] + m["locked_skus"]
        coverage_note = (
            f" · {active_skus} of {m['catalog_skus']} catalog SKUs active this year"
            if m["catalog_skus"]
            else ""
        )
        # Cluster-leader phrase reflects 2025 invoiced revenue across ALL
        # SKUs (not just the movable subset). Matches the Pricing Studio
        # header so both screens agree on who leads.
        if m.get("cluster_lead"):
            lead_eur = _FORMAT_EUR_M(m["cluster_lead_rev"])
            lead_phrase = (
                f"{m['cluster_lead']} leads · {m['cluster_lead_skus']} SKUs · {lead_eur} (2025)"
            )
        else:
            lead_phrase = "cluster leader unavailable"
        movable = {
            "id": "movable",
            "title": "Movable bucket",
            "subtitle": (
                f"{m['movable_skus']} SKUs (this year) · {m['movable_groups']} commodity "
                f"groups · {lead_phrase}{coverage_note}"
            ),
            "tags": [
                {"label": f"{_FORMAT_EUR_M(m['movable_rev'])} open", "tone": "neutral"},
                {"label": "Movable", "tone": "info"},
            ],
            "avatars": ["FK", "HM", "TH", "+5"],
            "cta": "View SKUs",
        }
        locked = {
            "id": "locked",
            "title": "Locked bucket",
            "subtitle": f"{m['locked_skus']} SKUs (this year) · long-term contracts",
            "tags": [
                {"label": f"{_FORMAT_EUR_M(m['locked_rev'])} locked", "tone": "neutral"},
                {"label": "In renewal queue", "tone": "warning"},
            ],
            "avatars": ["MD", "TI", "+3"],
            "cta": "View renewals",
        }
        out = [movable] if hide_locked else [movable, locked]
        return _attach_actions(out)
    except ActionCenterBlockError:
        raise
    except Exception:
        raise ActionCenterBlockError("buckets", "Bucket summary unavailable.")
