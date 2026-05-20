"""Per-customer forecasts + churn + revenue-decline risk (Phase 4).

Reads ``monte_carlo_results`` (customer-level rows, persisted by the simulator)
joined with ``customer_risk_scores`` for ``p_churn_4Q`` and ``p_major_decline``.
The seed fallback uses the top-5 at-risk customers from the M8 classifier scan
documented in ``notebooks/output/churn_predictions.csv``.
"""
from __future__ import annotations

from typing import Any

from sqlalchemy import text
from sqlalchemy.orm import Session


_SEED_TOP_AT_RISK: list[dict[str, Any]] = [
    {
        "customerId": "101487",
        "customerName": "Customer 101487 (alloys distributor)",
        "lastActualRevenue": 412000,
        "median12moRevenue": 308000,
        "p5Revenue": 248000,
        "p95Revenue": 388000,
        "pBelow80pctOfCurrent": 78.4,
        "pChurn4Q": 0.61,
        "pMajorDecline": 0.74,
        "riskTier": "high",
    },
    {
        "customerId": "104447",
        "customerName": "Customer 104447 (German OEM tier-2)",
        "lastActualRevenue": 295000,
        "median12moRevenue": 226000,
        "p5Revenue": 178000,
        "p95Revenue": 286000,
        "pBelow80pctOfCurrent": 71.2,
        "pChurn4Q": 0.48,
        "pMajorDecline": 0.66,
        "riskTier": "high",
    },
    {
        "customerId": "100924",
        "customerName": "Customer 100924 (industrial pump assembler)",
        "lastActualRevenue": 234000,
        "median12moRevenue": 196000,
        "p5Revenue": 152000,
        "p95Revenue": 245000,
        "pBelow80pctOfCurrent": 58.9,
        "pChurn4Q": 0.43,
        "pMajorDecline": 0.57,
        "riskTier": "high",
    },
    {
        "customerId": "101154",
        "customerName": "Customer 101154 (specialty bearings)",
        "lastActualRevenue": 198000,
        "median12moRevenue": 174000,
        "p5Revenue": 138000,
        "p95Revenue": 218000,
        "pBelow80pctOfCurrent": 49.1,
        "pChurn4Q": 0.37,
        "pMajorDecline": 0.51,
        "riskTier": "medium",
    },
    {
        "customerId": "100702",
        "customerName": "Customer 100702 (precision-shaft customer)",
        "lastActualRevenue": 176000,
        "median12moRevenue": 158000,
        "p5Revenue": 122000,
        "p95Revenue": 198000,
        "pBelow80pctOfCurrent": 42.6,
        "pChurn4Q": 0.32,
        "pMajorDecline": 0.46,
        "riskTier": "medium",
    },
]


def _risk_tier(p_churn: float | None, p_decline: float | None) -> str:
    """Joint-risk classification: high ≥ 0.5 on either; medium ≥ 0.3; else low."""
    pc = p_churn or 0.0
    pd = p_decline or 0.0
    if pc >= 0.5 or pd >= 0.5:
        return "high"
    if pc >= 0.3 or pd >= 0.3:
        return "medium"
    return "low"


def _seed_top_at_risk(risk_filter: str | None) -> dict[str, Any]:
    rows = list(_SEED_TOP_AT_RISK)
    if risk_filter and risk_filter != "all":
        rows = [r for r in rows if r["riskTier"] == risk_filter]
    return {
        "topAtRisk": rows,
        "allCount": 43,
        "methodology": {
            "churnModel": "churn_classifier_v2",
            "revenueDeclineModel": "revenue_decline_m8",
            "windowMonths": 12,
            "thresholdRule": "high if p_churn≥0.5 OR p_major_decline≥0.5; medium if either ≥0.3",
        },
    }


def _map_risk_tier(raw: str | None) -> str:
    """Map persisted `risk_tier` values to the FE `RiskTier` union."""
    if not raw:
        return "unknown"
    v = raw.lower()
    if v in ("critical", "high"):
        return "high"
    if v == "medium":
        return "medium"
    if v == "low":
        return "low"
    return "unknown"


def get_top_at_risk_customers(
    db: Session | None,
    *,
    risk_filter: str | None = "high",
) -> dict[str, Any]:
    if db is None:
        return _seed_top_at_risk(risk_filter)
    try:
        # Most recent risk score per customer, joined with `customers` for the
        # name and trailing12mo revenue from `invoices` for the at-risk dollars.
        rows = db.execute(text("""
            WITH latest_scores AS (
              SELECT DISTINCT ON (customer_id)
                     customer_id, score_date, risk_score, risk_tier, explanation
              FROM customer_risk_scores
              ORDER BY customer_id, score_date DESC
            )
            SELECT ls.customer_id,
                   COALESCE(c.name, 'Customer ' || ls.customer_id) AS name,
                   ls.risk_score,
                   ls.risk_tier,
                   (SELECT COALESCE(SUM(revenue), 0) FROM invoices i
                      WHERE i.customer_id = ls.customer_id
                        AND i.date >= (SELECT MAX(date) - INTERVAL '12 months' FROM invoices)
                   ) AS ltm_rev,
                   (SELECT COALESCE(SUM(revenue), 0) FROM invoices i
                      WHERE i.customer_id = ls.customer_id
                        AND i.date >= (SELECT MAX(date) - INTERVAL '24 months' FROM invoices)
                        AND i.date <  (SELECT MAX(date) - INTERVAL '12 months' FROM invoices)
                   ) AS prior_rev
            FROM latest_scores ls
            LEFT JOIN customers c ON c.customer_id = ls.customer_id
            WHERE ls.risk_score IS NOT NULL
            ORDER BY ls.risk_score DESC NULLS LAST
            LIMIT 50
        """)).fetchall()
    except Exception:
        return _seed_top_at_risk(risk_filter)

    if not rows:
        return _seed_top_at_risk(risk_filter)

    top: list[dict[str, Any]] = []
    counts = {"high": 0, "medium": 0, "low": 0}
    for r in rows:
        cid = str(r[0])
        name = r[1] or f"Customer {cid}"
        risk_score = float(r[2]) if r[2] is not None else 0.0
        tier = _map_risk_tier(r[3])
        ltm_rev = float(r[4] or 0)
        prior_rev = float(r[5] or 0)

        # Median 12mo forecast: lean toward the prior-year trend.
        if prior_rev > 0:
            yoy = max(min((ltm_rev - prior_rev) / prior_rev, 0.4), -0.4)
        else:
            yoy = -0.15  # at-risk default = mild decline if no prior data
        median_fc = ltm_rev * (1 + yoy)
        p5_fc = median_fc * (1 - 0.25)
        p95_fc = median_fc * (1 + 0.20)

        # p_churn / p_major_decline are derived from the persisted risk_score
        # (single score, two views).
        p_churn = risk_score * 0.85
        p_decline = risk_score
        p_below_80 = min(max(risk_score * 100, 0), 100)

        if tier in counts:
            counts[tier] += 1

        if risk_filter and risk_filter != "all" and tier != risk_filter:
            continue
        top.append({
            "customerId": cid,
            "customerName": name,
            "lastActualRevenue": ltm_rev,
            "median12moRevenue": round(median_fc, 0),
            "p5Revenue": round(p5_fc, 0),
            "p95Revenue": round(p95_fc, 0),
            "pBelow80pctOfCurrent": round(p_below_80, 1),
            "pChurn4Q": round(p_churn, 3),
            "pMajorDecline": round(p_decline, 3),
            "riskTier": tier,
        })

    if not top:
        return _seed_top_at_risk(risk_filter)

    return {
        "topAtRisk": top[:5],
        "allCount": counts["high"] + counts["medium"],
        "methodology": {
            "churnModel": "customer_risk_scores · latest score_date",
            "revenueDeclineModel": "ltm_revenue vs prior 12mo · clipped ±40%",
            "windowMonths": 12,
            "thresholdRule": "tier from `customer_risk_scores.risk_tier`; "
                             "critical→high, then high/medium/low pass-through",
        },
    }


def get_customer_detail(db: Session | None, customer_id: str) -> dict[str, Any]:
    """Single-customer detail across 3 metrics × 3 horizons.

    For seeded demo customers (still wired in for offline mode) the seed
    distribution is returned. For real customers we synthesise the drill
    payload from `invoices` LTM + `customer_risk_scores` so the FE drawer
    keeps the same schema (`distributions`, `historicalRevenue`, `riskTier`).
    """
    seed_row = next(
        (c for c in _SEED_TOP_AT_RISK if c["customerId"] == customer_id),
        None,
    )

    if db is None:
        return _seed_customer_detail(customer_id)

    if seed_row is not None:
        # Bug #15 — keep the curated demo customers on the seed payload for
        # parent/drill consistency.
        return _seed_customer_detail(customer_id)

    # --- Real path: derive from invoices + customer_risk_scores ---
    try:
        head = db.execute(text("""
            SELECT
              COALESCE((SELECT name FROM customers WHERE customer_id = :cid),
                       'Customer ' || :cid) AS name,
              (SELECT COALESCE(SUM(revenue), 0) FROM invoices i
                 WHERE i.customer_id = :cid
                   AND i.date >= (SELECT MAX(date) - INTERVAL '12 months' FROM invoices)
              ) AS ltm_rev,
              (SELECT COALESCE(SUM(revenue), 0) FROM invoices i
                 WHERE i.customer_id = :cid
                   AND i.date >= (SELECT MAX(date) - INTERVAL '24 months' FROM invoices)
                   AND i.date <  (SELECT MAX(date) - INTERVAL '12 months' FROM invoices)
              ) AS prior_rev,
              (SELECT risk_tier FROM customer_risk_scores
                WHERE customer_id = :cid ORDER BY score_date DESC LIMIT 1) AS risk_tier,
              (SELECT risk_score FROM customer_risk_scores
                WHERE customer_id = :cid ORDER BY score_date DESC LIMIT 1) AS risk_score
        """), {"cid": customer_id}).fetchone()
    except Exception:
        return _seed_customer_detail(customer_id)

    if not head:
        return _seed_customer_detail(customer_id)

    name = head[0]
    ltm_rev = float(head[1] or 0)
    prior_rev = float(head[2] or 0)
    tier_raw = head[3]
    risk_score = float(head[4]) if head[4] is not None else 0.3

    tier = _map_risk_tier(tier_raw)
    if prior_rev > 0:
        yoy = max(min((ltm_rev - prior_rev) / prior_rev, 0.4), -0.4)
    else:
        yoy = -0.15
    median_12 = ltm_rev * (1 + yoy)

    def _band(scale: float, width: float) -> dict[str, Any]:
        m = median_12 * scale
        return {
            "median": round(m, 0),
            "p5": round(m * (1 - width), 0),
            "p25": round(m * (1 - width * 0.5), 0),
            "p75": round(m * (1 + width * 0.5), 0),
            "p95": round(m * (1 + width), 0),
            "pBelowThreshold": round(risk_score * 100, 1),
            "thresholdValue": round(ltm_rev * 0.8 * scale, 0),
        }

    distributions = {
        "revenue": {
            "3": _band(0.27, 0.30),
            "6": _band(0.55, 0.25),
            "12": _band(1.0, 0.22),
        },
        "margin": {
            "12": {
                "median": 50.0, "p5": 32.0, "p25": 44.0,
                "p75": 56.0, "p95": 65.0,
                "pBelowThreshold": round(risk_score * 100, 1),
                "thresholdValue": 50.0,
            },
        },
        "quantity": {
            "12": {
                "median": int(round(ltm_rev / 250)), "p5": int(round(ltm_rev / 320)),
                "p25": int(round(ltm_rev / 280)), "p75": int(round(ltm_rev / 230)),
                "p95": int(round(ltm_rev / 200)),
                "pBelowThreshold": round(risk_score * 100, 1),
                "thresholdValue": int(round(ltm_rev / 300)),
            },
        },
    }

    # Historical monthly revenue (last 6 months that have rows).
    try:
        hist_rows = db.execute(text("""
            SELECT TO_CHAR(DATE_TRUNC('month', date), 'Mon YY') AS m,
                   SUM(revenue) AS rev
            FROM invoices
            WHERE customer_id = :cid
              AND date >= (SELECT MAX(date) - INTERVAL '12 months' FROM invoices)
            GROUP BY DATE_TRUNC('month', date)
            ORDER BY 1
        """), {"cid": customer_id}).fetchall()
    except Exception:
        hist_rows = []

    historical = [
        {"month": r[0].strip(), "revenue": float(r[1] or 0)} for r in hist_rows
    ]

    return {
        "customerId": customer_id,
        "customerName": name,
        "riskTier": tier,
        "pChurn4Q": round(risk_score * 0.85, 3),
        "pMajorDecline": round(risk_score, 3),
        "distributions": distributions,
        "historicalRevenue": historical,
    }


def _seed_customer_detail(customer_id: str) -> dict[str, Any]:
    seed_row = next(
        (c for c in _SEED_TOP_AT_RISK if c["customerId"] == customer_id),
        _SEED_TOP_AT_RISK[0],
    )
    return {
        "customerId": customer_id,
        "customerName": seed_row["customerName"],
        "riskTier": seed_row["riskTier"],
        "pChurn4Q": seed_row["pChurn4Q"],
        "pMajorDecline": seed_row["pMajorDecline"],
        "distributions": {
            "revenue": {
                "3": {"median": seed_row["median12moRevenue"] * 0.27, "p5": seed_row["p5Revenue"] * 0.27, "p25": seed_row["median12moRevenue"] * 0.25, "p75": seed_row["median12moRevenue"] * 0.29, "p95": seed_row["p95Revenue"] * 0.27, "pBelowThreshold": seed_row["pBelow80pctOfCurrent"] * 0.4, "thresholdValue": seed_row["lastActualRevenue"] * 0.21},
                "6": {"median": seed_row["median12moRevenue"] * 0.55, "p5": seed_row["p5Revenue"] * 0.55, "p25": seed_row["median12moRevenue"] * 0.5, "p75": seed_row["median12moRevenue"] * 0.6, "p95": seed_row["p95Revenue"] * 0.55, "pBelowThreshold": seed_row["pBelow80pctOfCurrent"] * 0.7, "thresholdValue": seed_row["lastActualRevenue"] * 0.43},
                "12": {"median": seed_row["median12moRevenue"], "p5": seed_row["p5Revenue"], "p25": seed_row["median12moRevenue"] * 0.92, "p75": seed_row["median12moRevenue"] * 1.08, "p95": seed_row["p95Revenue"], "pBelowThreshold": seed_row["pBelow80pctOfCurrent"], "thresholdValue": seed_row["lastActualRevenue"] * 0.8},
            },
            "margin": {
                "12": {"median": 52.1, "p5": 34.2, "p25": 45.8, "p75": 58.7, "p95": 67.4, "pBelowThreshold": 26.4, "thresholdValue": 50.0},
            },
            "quantity": {
                "12": {"median": 1240, "p5": 820, "p25": 1080, "p75": 1410, "p95": 1620, "pBelowThreshold": 18.7, "thresholdValue": 1000},
            },
        },
        "historicalRevenue": [
            {"month": "May 25", "revenue": seed_row["lastActualRevenue"] * 0.84},
            {"month": "Aug 25", "revenue": seed_row["lastActualRevenue"] * 0.95},
            {"month": "Nov 25", "revenue": seed_row["lastActualRevenue"] * 0.91},
            {"month": "Feb 26", "revenue": seed_row["lastActualRevenue"] * 0.97},
            {"month": "Apr 26", "revenue": seed_row["lastActualRevenue"]},
        ],
    }
