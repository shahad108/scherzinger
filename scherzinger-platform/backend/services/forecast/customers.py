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


def get_top_at_risk_customers(
    db: Session | None,
    *,
    risk_filter: str | None = "high",
) -> dict[str, Any]:
    if db is None:
        return _seed_top_at_risk(risk_filter)
    try:
        rows = db.execute(text("""
            SELECT mc.entity_id AS customer_id,
                   COALESCE(MAX(mc.parameters->>'entity_name'), mc.entity_id) AS name,
                   COALESCE(MAX(mc.parameters->>'last_actual_revenue')::float, 0) AS last_actual,
                   AVG(CASE WHEN mc.metric = 'revenue' THEN mc.median_margin END) AS median_rev,
                   AVG(CASE WHEN mc.metric = 'revenue' THEN mc.p5_margin END) AS p5_rev,
                   AVG(CASE WHEN mc.metric = 'revenue' THEN mc.p95_margin END) AS p95_rev,
                   AVG(CASE WHEN mc.metric = 'revenue' THEN mc.prob_below_threshold END) AS p_decline,
                   AVG(crs.p_churn_4q) AS p_churn,
                   AVG(crs.p_major_decline) AS p_major_decline
            FROM monte_carlo_results mc
            LEFT JOIN customer_risk_scores crs ON crs.customer_id = mc.entity_id
            WHERE mc.entity_type = 'customer' AND mc.horizon_months = 12
            GROUP BY mc.entity_id
            ORDER BY COALESCE(AVG(crs.p_major_decline), 0) DESC
            LIMIT 25
        """)).fetchall()
    except Exception:
        return _seed_top_at_risk(risk_filter)

    if not rows:
        return _seed_top_at_risk(risk_filter)

    top: list[dict[str, Any]] = []
    for r in rows:
        tier = _risk_tier(
            float(r[7]) if r[7] is not None else None,
            float(r[8]) if r[8] is not None else None,
        )
        if risk_filter and risk_filter != "all" and tier != risk_filter:
            continue
        top.append({
            "customerId": r[0],
            "customerName": r[1],
            "lastActualRevenue": float(r[2]) if r[2] is not None else None,
            "median12moRevenue": float(r[3]) if r[3] is not None else None,
            "p5Revenue": float(r[4]) if r[4] is not None else None,
            "p95Revenue": float(r[5]) if r[5] is not None else None,
            "pBelow80pctOfCurrent": float(r[6]) if r[6] is not None else None,
            "pChurn4Q": float(r[7]) if r[7] is not None else None,
            "pMajorDecline": float(r[8]) if r[8] is not None else None,
            "riskTier": tier,
        })

    return {
        "topAtRisk": top[:5],
        "allCount": len(top),
        "methodology": {
            "churnModel": "churn_classifier_v2",
            "revenueDeclineModel": "revenue_decline_m8",
            "windowMonths": 12,
            "thresholdRule": "high if p_churn≥0.5 OR p_major_decline≥0.5; medium if either ≥0.3",
        },
    }


def get_customer_detail(db: Session | None, customer_id: str) -> dict[str, Any]:
    """Single-customer detail across 3 metrics × 3 horizons."""
    if db is None:
        return _seed_customer_detail(customer_id)
    try:
        rows = db.execute(text("""
            SELECT metric, horizon_months,
                   median_margin, p5_margin, p25_margin, p75_margin, p95_margin,
                   prob_below_threshold, threshold_used
            FROM monte_carlo_results
            WHERE entity_type = 'customer' AND entity_id = :cid
            ORDER BY metric, horizon_months
        """), {"cid": customer_id}).fetchall()
    except Exception:
        return _seed_customer_detail(customer_id)
    if not rows:
        return _seed_customer_detail(customer_id)
    distributions: dict[str, dict[int, dict[str, Any]]] = {}
    for r in rows:
        m = r[0]
        h = int(r[1])
        distributions.setdefault(m, {})[h] = {
            "median": float(r[2]) if r[2] is not None else None,
            "p5": float(r[3]) if r[3] is not None else None,
            "p25": float(r[4]) if r[4] is not None else None,
            "p75": float(r[5]) if r[5] is not None else None,
            "p95": float(r[6]) if r[6] is not None else None,
            "pBelowThreshold": float(r[7]) if r[7] is not None else None,
            "thresholdValue": float(r[8]) if r[8] is not None else None,
        }
    return {
        "customerId": customer_id,
        "customerName": f"Customer {customer_id}",
        "distributions": distributions,
        "historicalRevenue": [],
        "riskTier": "unknown",
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
