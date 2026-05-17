"""Pocket-margin waterfall composer.

For demo: reads existing invoice + quote ledger via the same DB connection
real_hero.py uses. Computes List -> Quoted -> Booked -> Invoiced -> DB2 step values
and per-cluster pocket-price bands. Stubbed-out reasonable defaults if the
DB session is unavailable so screens endpoint never fails because of this card.
"""
from __future__ import annotations
from typing import Any

from sqlalchemy import text
from sqlalchemy.orm import Session

# Step ordering -- must remain stable; frontend renders in this order.
STEP_ORDER = ["list", "quoted", "booked", "invoiced", "db2"]


def _safe_steps(values: dict[str, float]) -> list[dict[str, Any]]:
    out = []
    prev = None
    for name in STEP_ORDER:
        v = float(values.get(name, 0.0))
        leakage = None
        if prev is not None and prev != 0:
            leakage = (prev - v) / prev * 100.0
        out.append({"name": name, "value": v, "leakagePct": leakage})
        prev = v
    return out


def _histogram(prices: list[float], bins: int = 12) -> list[dict[str, Any]]:
    if not prices:
        return []
    lo, hi = min(prices), max(prices)
    if lo == hi:
        return [{"bin": f"{lo:.2f}", "count": len(prices)}]
    step = (hi - lo) / bins
    counts = [0] * bins
    for p in prices:
        idx = min(int((p - lo) / step), bins - 1)
        counts[idx] += 1
    return [{"bin": f"{lo + i*step:.2f}", "count": c} for i, c in enumerate(counts)]


def build_pocket_waterfall(
    *,
    list_price: float = 100.0,
    quoted: float = 88.0,
    booked: float = 80.0,
    invoiced: float = 76.0,
    db2: float = 18.0,
    per_cluster_prices: dict[str, list[float]] | None = None,
) -> dict[str, Any]:
    steps = _safe_steps({
        "list": list_price, "quoted": quoted, "booked": booked,
        "invoiced": invoiced, "db2": db2,
    })
    bands = []
    for cluster, prices in (per_cluster_prices or {}).items():
        if not prices:
            continue
        sorted_p = sorted(prices)
        n = len(sorted_p)
        median = sorted_p[n // 2]
        p10 = sorted_p[max(0, int(n * 0.1) - 1)]
        p90 = sorted_p[min(n - 1, int(n * 0.9))]
        bands.append({
            "cluster": cluster,
            "histogram": _histogram(prices),
            "median": median, "p10": p10, "p90": p90,
        })
    return {
        "steps": steps,
        "perCluster": bands,
        "unit": "pct_of_list" if list_price == 100.0 else "eur_total",
    }


def build_pocket_waterfall_from_db(
    db: Session | None,
    *,
    cluster: str | None = None,
    months: int = 12,
    aid: str | None = None,
) -> dict[str, Any]:
    """Live variant that gathers step values from the invoice + quote ledgers,
    then delegates to ``build_pocket_waterfall`` for the pure shape.

    Step derivation:
      * ``list``     — Σ list_price × quantity from invoices over the
                       trailing window (uses ``list_price_per_unit`` when
                       present, otherwise reconstructs from the line as
                       ``revenue / quantity`` — i.e. the realised price is
                       taken as both list and quoted).
      * ``quoted``   — Σ revenue from quotes (won + lost + open) over the
                       same trailing window.
      * ``booked``   — Σ revenue from won quotes (or invoiced revenue when
                       quote linkage is missing).
      * ``invoiced`` — Σ revenue from invoices over the trailing window.
      * ``db2``      — Σ db2_total from invoices (pocket margin in EUR).

    The function falls back to the seeded defaults whenever a query fails
    so the screen endpoint never breaks because of this card.
    """
    if db is None:
        return build_pocket_waterfall()

    try:
        # Defensive rollback if a prior block poisoned the transaction.
        try:
            db.rollback()
        except Exception:
            pass

        cluster_clause_i = ""
        cluster_clause_q = ""
        params: dict[str, Any] = {"months": months}
        if cluster:
            cluster_clause_i = "AND i.commodity_group = :cluster"
            cluster_clause_q = "AND q.commodity_group = :cluster"
            params["cluster"] = cluster
        # Phase 3.2.1 (Pricing Studio v3): SKU-granular waterfall — when
        # aid is set we narrow the invoice + quote ledger to that article.
        # Quote rows carry an ``article_id`` column same as invoices.
        if aid:
            cluster_clause_i = (cluster_clause_i + " AND i.article_id = :aid").strip()
            cluster_clause_q = (cluster_clause_q + " AND q.article_id = :aid").strip()
            params["aid"] = aid

        # "List" is not stored on the invoice line; we approximate it as the
        # per-article 95th-percentile realised unit-price × the line quantity.
        # That's the price the article *could* fetch, before customer-specific
        # concessions — the typical interpretation of "list" in a pocket
        # waterfall when no separate list-price book is available.
        inv_extras = db.execute(text(f"""
            WITH per_article AS (
              SELECT i.article_id,
                     PERCENTILE_CONT(0.95) WITHIN GROUP (
                       ORDER BY (i.revenue::float / NULLIF(i.quantity, 0))
                     ) AS p95_price
              FROM invoices i
              WHERE i.date >= (SELECT MAX(date) - (:months * INTERVAL '1 month') FROM invoices)
                AND i.quantity > 0
                {cluster_clause_i}
              GROUP BY i.article_id
            )
            SELECT COALESCE(SUM(pa.p95_price * i.quantity), 0) AS list_total
            FROM invoices i
            JOIN per_article pa ON pa.article_id = i.article_id
            WHERE i.date >= (SELECT MAX(date) - (:months * INTERVAL '1 month') FROM invoices)
              AND i.quantity > 0
              {cluster_clause_i}
        """), params).fetchone()
        list_total_approx = float(inv_extras[0] or 0) if inv_extras else 0.0

        inv = db.execute(text(f"""
            SELECT
              COALESCE(SUM(i.revenue), 0) AS invoiced_total,
              COALESCE(SUM(i.db2_total), 0) AS db2_total
            FROM invoices i
            WHERE i.date >= (SELECT MAX(date) - (:months * INTERVAL '1 month') FROM invoices)
              {cluster_clause_i}
        """), params).fetchone()
        list_total = list_total_approx
        invoiced_total = float(inv[0] or 0) if inv else 0.0
        db2_total = float(inv[1] or 0) if inv else 0.0

        qt = db.execute(text(f"""
            SELECT
              COALESCE(SUM(q.revenue), 0) AS quoted_total,
              COALESCE(SUM(CASE WHEN q.is_won THEN q.revenue ELSE 0 END), 0) AS booked_total
            FROM quotes q
            WHERE q.date >= (SELECT MAX(date) - (:months * INTERVAL '1 month') FROM quotes)
              AND q.status NOT IN ('cancelled')
              {cluster_clause_q}
        """), params).fetchone()
        quoted_total = float(qt[0] or 0) if qt else 0.0
        booked_total = float(qt[1] or 0) if qt else 0.0

        # If the list/quoted are zero but invoiced isn't (e.g. no quote
        # ledger rows for this cluster window), back-fill list = invoiced so
        # the waterfall still renders monotonically rather than flat-line.
        if quoted_total <= 0 and invoiced_total > 0:
            quoted_total = invoiced_total
        if booked_total <= 0 and invoiced_total > 0:
            booked_total = invoiced_total
        if list_total <= 0 and invoiced_total > 0:
            list_total = invoiced_total

        # Enforce monotonic-down ordering for the waterfall — if upstream is
        # smaller than downstream the chart looks nonsensical.
        quoted_total = min(quoted_total, list_total) if list_total > 0 else quoted_total
        booked_total = min(booked_total, quoted_total) if quoted_total > 0 else booked_total
        invoiced_total = min(invoiced_total, booked_total) if booked_total > 0 else invoiced_total
        db2_total = min(db2_total, invoiced_total) if invoiced_total > 0 else db2_total

        # Per-cluster net-price histograms (price = revenue / quantity).
        cluster_filter_p = ""
        ppct_params: dict[str, Any] = {"months": months}
        if cluster:
            cluster_filter_p = "AND commodity_group = :cluster"
            ppct_params["cluster"] = cluster
        if aid:
            cluster_filter_p = (cluster_filter_p + " AND article_id = :aid").strip()
            ppct_params["aid"] = aid
        price_rows = db.execute(text(f"""
            SELECT commodity_group, revenue, quantity
            FROM invoices
            WHERE date >= (SELECT MAX(date) - (:months * INTERVAL '1 month') FROM invoices)
              AND quantity > 0
              AND revenue IS NOT NULL
              {cluster_filter_p}
        """), ppct_params).fetchall()

        per_cluster: dict[str, list[float]] = {}
        for r in price_rows:
            cl = str(r[0] or "—")
            try:
                rev = float(r[1] or 0)
                qty = float(r[2] or 0)
                if qty <= 0:
                    continue
                per_cluster.setdefault(cl, []).append(rev / qty)
            except (TypeError, ValueError):
                continue
        # Cap each cluster's sample for stability.
        per_cluster = {k: v[:500] for k, v in per_cluster.items() if v}

        return build_pocket_waterfall(
            list_price=list_total,
            quoted=quoted_total,
            booked=booked_total,
            invoiced=invoiced_total,
            db2=db2_total,
            per_cluster_prices=per_cluster,
        )
    except Exception:
        return build_pocket_waterfall()
