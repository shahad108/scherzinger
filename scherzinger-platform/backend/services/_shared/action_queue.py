"""Shared SKU/queue source helper.

Both ``backend/services/action_center/decisions.py`` and
``backend/services/studio/composer.py`` need to enumerate the same set
of SKUs in the same order when the analyst pivots between the screens
(Action Center → Pricing Studio). Without a single source, the two
endpoints will drift — the decisions list will reference aids that
aren't in the studio shell's picker, breaking the deep-link.

This module is that single source. Public API:

    get_action_queue_skus(
        db,
        *,
        queue: str | None = None,
        customer_id: str | None = None,
    ) -> list[dict]

Returns canonical SKU dicts with at minimum:

    {
      "article_id":      str,
      "commodity_group": str | None,
      "current_margin":  float | None,   # 0..1
      "revenue_at_risk": float | None,   # EUR
      "queue":           'churn' | 'cost_riser' | 'margin_erosion' | 'other',
    }

The implementation is intentionally light: it stitches together the
same SQL fragments the two callers already use (cost-riser, margin
erosion, churn) and emits a deterministic, deduped list. Phase B5
plan: this is enrichment-shape only — the candidate generation in
``decisions.py`` still owns the per-queue rules (so we don't break
the existing impact-score / interleaving). The list this module
returns is the *universe* of SKUs that those queues could touch.
"""
from __future__ import annotations

from typing import Any, Iterable

from sqlalchemy import text


_QUEUE_VALUES = {"churn", "cost_riser", "margin_erosion", "other"}


def _safe_float(v: Any) -> float | None:
    if v is None:
        return None
    try:
        return float(v)
    except (TypeError, ValueError):
        return None


def _row(
    article_id: str,
    *,
    commodity_group: str | None,
    current_margin: float | None,
    revenue_at_risk: float | None,
    queue: str,
) -> dict[str, Any]:
    return {
        "article_id": article_id,
        "commodity_group": commodity_group,
        "current_margin": current_margin,
        "revenue_at_risk": revenue_at_risk,
        "queue": queue if queue in _QUEUE_VALUES else "other",
    }


def _cost_riser_rows(db) -> list[dict[str, Any]]:
    """SKUs whose latest commodity cost movement is ≥ 5%.

    Mirrors ``decisions._cost_riser_candidates`` threshold so the two
    screens agree on which aids belong to the cost_riser queue.
    """
    try:
        rows = (
            db.execute(
                text(
                    """
                    WITH latest AS (
                      SELECT article_id,
                             cost_change_pct,
                             avg_hkvoll_per_unit
                        FROM product_cost_trends pct
                       WHERE period_start = (
                         SELECT MAX(period_start) FROM product_cost_trends
                       )
                    ),
                    revenue AS (
                      SELECT i.article_id,
                             SUM(i.revenue) AS rev,
                             AVG(i.db2_margin) FILTER (WHERE i.db2_margin IS NOT NULL)
                               AS avg_margin
                        FROM invoices i
                       WHERE i.year = (
                         SELECT MAX(year) FROM invoices i2
                          WHERE i2.article_id = i.article_id
                       )
                       GROUP BY i.article_id
                    )
                    SELECT l.article_id,
                           l.cost_change_pct,
                           p.commodity_group,
                           r.rev,
                           r.avg_margin
                      FROM latest l
                      JOIN products p ON p.article_id = l.article_id
                      LEFT JOIN revenue r ON r.article_id = l.article_id
                     WHERE l.cost_change_pct IS NOT NULL
                       AND l.cost_change_pct >= 0.05
                     ORDER BY l.cost_change_pct DESC
                     LIMIT 50
                    """
                )
            )
            .mappings()
            .all()
        )
    except Exception:
        try:
            db.rollback()
        except Exception:
            pass
        return []
    out: list[dict[str, Any]] = []
    for r in rows:
        aid = r.get("article_id")
        if not aid:
            continue
        cc = _safe_float(r.get("cost_change_pct")) or 0.0
        rev = _safe_float(r.get("rev")) or 0.0
        recoverable = cc * rev if rev > 0 else None
        out.append(
            _row(
                str(aid),
                commodity_group=(str(r.get("commodity_group")) if r.get("commodity_group") else None),
                current_margin=_safe_float(r.get("avg_margin")),
                revenue_at_risk=recoverable,
                queue="cost_riser",
            )
        )
    return out


def _margin_erosion_rows(db) -> list[dict[str, Any]]:
    """SKUs whose actual_db2_margin has dropped ≥ 5pp YoY.

    Subset of ``decisions._margin_erosion_candidates``'s SQL — same
    thresholds, same window, just the join+filter we need for the
    universe-list. Sort key is the YoY drop so the worst offenders
    surface first.
    """
    try:
        rows = (
            db.execute(
                text(
                    """
                    WITH yearly AS (
                      SELECT i.article_id,
                             i.year,
                             AVG(i.db2_margin) FILTER (WHERE i.db2_margin IS NOT NULL)
                               AS avg_margin,
                             COUNT(*) AS n,
                             SUM(i.revenue) AS rev
                        FROM invoices i
                       WHERE i.year >= EXTRACT(YEAR FROM CURRENT_DATE) - 2
                       GROUP BY i.article_id, i.year
                    ),
                    last_full AS (
                      SELECT COALESCE(MAX(year), EXTRACT(YEAR FROM CURRENT_DATE)::int - 1) AS y
                        FROM yearly
                       WHERE year < EXTRACT(YEAR FROM CURRENT_DATE)
                    ),
                    pivoted AS (
                      SELECT article_id,
                             MAX(avg_margin) FILTER (WHERE year = (SELECT y FROM last_full)) AS this_year,
                             MAX(avg_margin) FILTER (WHERE year = (SELECT y FROM last_full) - 1) AS last_year,
                             SUM(rev) FILTER (WHERE year = (SELECT y FROM last_full)) AS this_year_rev,
                             SUM(n) AS records
                        FROM yearly
                       GROUP BY article_id
                    )
                    SELECT p.article_id,
                           p.this_year, p.last_year, p.this_year_rev,
                           pr.commodity_group
                      FROM pivoted p
                      JOIN products pr ON pr.article_id = p.article_id
                     WHERE p.this_year IS NOT NULL
                       AND p.last_year IS NOT NULL
                       AND p.this_year BETWEEN -1 AND 1
                       AND p.last_year BETWEEN -1 AND 1
                       AND p.records >= 2
                       AND (p.last_year - p.this_year) >= 0.05
                     ORDER BY (p.last_year - p.this_year) DESC
                     LIMIT 50
                    """
                )
            )
            .mappings()
            .all()
        )
    except Exception:
        try:
            db.rollback()
        except Exception:
            pass
        return []
    out: list[dict[str, Any]] = []
    for r in rows:
        aid = r.get("article_id")
        if not aid:
            continue
        this_y = _safe_float(r.get("this_year"))
        last_y = _safe_float(r.get("last_year"))
        rev = _safe_float(r.get("this_year_rev")) or 0.0
        recoverable = None
        if this_y is not None and last_y is not None and rev > 0 and last_y > this_y:
            recoverable = (last_y - this_y) * rev
        out.append(
            _row(
                str(aid),
                commodity_group=(str(r.get("commodity_group")) if r.get("commodity_group") else None),
                current_margin=this_y,
                revenue_at_risk=recoverable,
                queue="margin_erosion",
            )
        )
    return out


def _churn_rows(db, customer_id: str | None) -> list[dict[str, Any]]:
    """SKUs purchased by at-risk customers (risk_score > 0.7).

    A churn candidate is customer-level, but for the Studio shell we
    need to know *which aids* a churn customer touches so the picker
    can show that slice. Joins customer_risk_scores → invoices.

    When ``customer_id`` is passed, we scope to that one customer.
    """
    params: dict[str, Any] = {}
    cid_filter = ""
    if customer_id:
        cid_filter = "AND crs.customer_id = :cid"
        params["cid"] = customer_id
    try:
        rows = (
            db.execute(
                text(
                    f"""
                    SELECT DISTINCT i.article_id,
                           p.commodity_group,
                           AVG(i.db2_margin) FILTER (WHERE i.db2_margin IS NOT NULL)
                             OVER (PARTITION BY i.article_id) AS avg_margin,
                           SUM(i.revenue) OVER (PARTITION BY i.article_id) AS rev,
                           MAX(crs.risk_score) OVER (PARTITION BY i.article_id) AS top_risk
                      FROM customer_risk_scores crs
                      JOIN invoices i ON i.customer_id = crs.customer_id
                      JOIN products p ON p.article_id = i.article_id
                     WHERE crs.risk_score >= 0.7
                       {cid_filter}
                     LIMIT 200
                    """
                ),
                params,
            )
            .mappings()
            .all()
        )
    except Exception:
        try:
            db.rollback()
        except Exception:
            pass
        return []
    out: list[dict[str, Any]] = []
    seen: set[str] = set()
    for r in rows:
        aid = r.get("article_id")
        if not aid:
            continue
        aid_s = str(aid)
        if aid_s in seen:
            continue
        seen.add(aid_s)
        rev = _safe_float(r.get("rev")) or 0.0
        risk = _safe_float(r.get("top_risk")) or 0.0
        recoverable = risk * rev if rev > 0 else None
        out.append(
            _row(
                aid_s,
                commodity_group=(str(r.get("commodity_group")) if r.get("commodity_group") else None),
                current_margin=_safe_float(r.get("avg_margin")),
                revenue_at_risk=recoverable,
                queue="churn",
            )
        )
    return out


def _dedupe(rows: Iterable[dict[str, Any]]) -> list[dict[str, Any]]:
    """Stable dedupe by article_id, keeping the first row (preserves the
    interleaving of churn → cost_riser → margin_erosion).
    """
    seen: set[str] = set()
    out: list[dict[str, Any]] = []
    for r in rows:
        aid = r.get("article_id")
        if not aid or aid in seen:
            continue
        seen.add(aid)
        out.append(r)
    return out


def get_action_queue_skus(
    db,
    *,
    queue: str | None = None,
    customer_id: str | None = None,
) -> list[dict[str, Any]]:
    """Return the canonical SKU universe across all action-queue
    detectors. Both Pricing Studio and Action Center consume this so
    they cannot drift.

    ``queue``        — optional filter; one of 'churn', 'cost_riser',
                       'margin_erosion'. ``None`` returns the union.
    ``customer_id``  — optional customer scope; today only narrows the
                       churn slice but is forwarded everywhere so a
                       future per-customer cost/margin slice can hook in
                       without changing the call sites.
    """
    q = (queue or "").lower() or None

    universe: list[dict[str, Any]] = []
    if q in (None, "churn"):
        universe.extend(_churn_rows(db, customer_id=customer_id))
    if q in (None, "cost_riser"):
        universe.extend(_cost_riser_rows(db))
    if q in (None, "margin_erosion"):
        universe.extend(_margin_erosion_rows(db))

    return _dedupe(universe)
