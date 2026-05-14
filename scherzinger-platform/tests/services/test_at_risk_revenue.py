"""Tests for the v2.2 Phase F at-risk revenue aggregator.

``build_at_risk_revenue`` is pure — composer.py passes the already-composed
``pareto`` + ``customers`` blocks through and gets back a per-tier €
breakdown. These tests drive synthetic payloads (no DB needed).
"""
from __future__ import annotations

import math

from backend.services.forecast.at_risk_revenue import build_at_risk_revenue


def _make_payload(customer_rows, at_risk_rows):
    return {
        "pareto": {"customer": {"rows": customer_rows}},
        "customers": {"topAtRisk": at_risk_rows},
    }


def test_returns_all_four_tiers_with_zeroes_when_no_data():
    out = build_at_risk_revenue({})
    assert {t["tier"] for t in out["tiers"]} == {"A", "B", "C", "D"}
    for t in out["tiers"]:
        assert t["forecastEur"] == 0.0
        assert t["atRiskEur"] == 0.0
        assert t["safeEur"] == 0.0
        assert t["atRiskShare"] == 0.0
        assert t["customerCount"] == 0
    assert out["totalForecastEur"] == 0.0
    assert out["totalAtRiskEur"] == 0.0


def test_tier_totals_match_synthetic_input():
    """One customer per tier, with known forecasts and risk probabilities.

    A: €2.0M forecast × 0.50 churn → 1.0M at risk
    B: €1.0M forecast × 0.40 decline → 0.4M at risk
    C: €0.5M forecast × 0.0 risk → 0 at risk (customer not in at-risk block)
    D: €0.1M forecast × 0.20 churn → 0.02M at risk
    """
    customers = [
        {"customerId": "1", "tier": "A", "forecast": "€2.0M"},
        {"customerId": "2", "tier": "B", "forecast": "€1.0M"},
        {"customerId": "3", "tier": "C", "forecast": "€500K"},
        {"customerId": "4", "tier": "D", "forecast": "€100K"},
    ]
    at_risk = [
        {"customerId": "1", "pChurn4Q": 0.50, "pMajorDecline": 0.30},
        {"customerId": "2", "pChurn4Q": 0.10, "pMajorDecline": 0.40},
        {"customerId": "4", "pChurn4Q": 0.20, "pMajorDecline": 0.15},
    ]
    out = build_at_risk_revenue(_make_payload(customers, at_risk))
    by_tier = {t["tier"]: t for t in out["tiers"]}

    assert by_tier["A"]["forecastEur"] == 2_000_000.0
    assert by_tier["A"]["atRiskEur"] == 1_000_000.0
    assert by_tier["A"]["safeEur"] == 1_000_000.0
    assert math.isclose(by_tier["A"]["atRiskShare"], 0.5)
    assert by_tier["A"]["customerCount"] == 1

    assert by_tier["B"]["forecastEur"] == 1_000_000.0
    assert by_tier["B"]["atRiskEur"] == 400_000.0
    assert math.isclose(by_tier["B"]["atRiskShare"], 0.4)

    assert by_tier["C"]["forecastEur"] == 500_000.0
    assert by_tier["C"]["atRiskEur"] == 0.0
    assert by_tier["C"]["safeEur"] == 500_000.0
    assert by_tier["C"]["atRiskShare"] == 0.0
    assert by_tier["C"]["customerCount"] == 1

    assert by_tier["D"]["forecastEur"] == 100_000.0
    assert by_tier["D"]["atRiskEur"] == 20_000.0
    assert by_tier["D"]["customerCount"] == 1

    assert out["totalForecastEur"] == 3_600_000.0
    assert out["totalAtRiskEur"] == 1_420_000.0


def test_at_risk_share_bounded_to_forecast():
    """Malformed risk (>1) must be clamped so at-risk ≤ forecast."""
    customers = [{"customerId": "x", "tier": "A", "forecast": "€1M"}]
    at_risk = [{"customerId": "x", "pChurn4Q": 1.7, "pMajorDecline": 2.0}]
    out = build_at_risk_revenue(_make_payload(customers, at_risk))
    a = next(t for t in out["tiers"] if t["tier"] == "A")
    assert a["atRiskEur"] <= a["forecastEur"]
    assert a["safeEur"] >= 0
    assert 0.0 <= a["atRiskShare"] <= 1.0


def test_negative_or_nan_risk_treated_as_zero():
    customers = [
        {"customerId": "neg", "tier": "B", "forecast": "€500K"},
        {"customerId": "nan", "tier": "B", "forecast": "€500K"},
    ]
    at_risk = [
        {"customerId": "neg", "pChurn4Q": -0.5, "pMajorDecline": -0.3},
        {"customerId": "nan", "pChurn4Q": float("nan"), "pMajorDecline": None},
    ]
    out = build_at_risk_revenue(_make_payload(customers, at_risk))
    b = next(t for t in out["tiers"] if t["tier"] == "B")
    assert b["atRiskEur"] == 0.0
    assert b["forecastEur"] == 1_000_000.0


def test_empty_tiers_zero_out_cleanly():
    """No customers at all → every tier reports 0/0/0/0."""
    out = build_at_risk_revenue(_make_payload([], []))
    assert all(t["customerCount"] == 0 for t in out["tiers"])
    assert all(t["forecastEur"] == 0.0 for t in out["tiers"])
    assert all(t["atRiskShare"] == 0.0 for t in out["tiers"])


def test_customer_count_matches_input_even_with_zero_forecast():
    """A customer with a €0 forecast still counts toward customerCount."""
    customers = [
        {"customerId": "1", "tier": "A", "forecast": "€2.0M"},
        {"customerId": "2", "tier": "A", "forecast": "€0"},
        {"customerId": "3", "tier": "A", "forecast": "—"},
    ]
    out = build_at_risk_revenue(_make_payload(customers, []))
    a = next(t for t in out["tiers"] if t["tier"] == "A")
    assert a["customerCount"] == 3
    assert a["forecastEur"] == 2_000_000.0


def test_total_at_risk_never_exceeds_total_forecast():
    """Even with adversarial inputs the outer total invariant holds."""
    customers = [
        {"customerId": str(i), "tier": "A", "forecast": "€100K"}
        for i in range(5)
    ]
    at_risk = [
        {"customerId": str(i), "pChurn4Q": 5.0, "pMajorDecline": 5.0}
        for i in range(5)
    ]
    out = build_at_risk_revenue(_make_payload(customers, at_risk))
    assert out["totalAtRiskEur"] <= out["totalForecastEur"]
    assert out["totalAtRiskEur"] == out["totalForecastEur"]  # fully at risk after clamp


def test_unknown_customer_treated_as_zero_risk():
    """Customers not in at-risk block default to 0 risk (safe by default)."""
    customers = [{"customerId": "unknown", "tier": "A", "forecast": "€1M"}]
    out = build_at_risk_revenue(_make_payload(customers, []))
    a = next(t for t in out["tiers"] if t["tier"] == "A")
    assert a["forecastEur"] == 1_000_000.0
    assert a["atRiskEur"] == 0.0
    assert a["safeEur"] == 1_000_000.0


def test_parses_various_eur_formats():
    """Pareto formats euros several ways — all should be parsed."""
    customers = [
        {"customerId": "1", "tier": "A", "forecast": "€2.1M"},
        {"customerId": "2", "tier": "A", "forecast": "€420K"},
        {"customerId": "3", "tier": "A", "forecast": "€420 000"},     # NBSP
        {"customerId": "4", "tier": "A", "forecast": "€100,000"},
    ]
    out = build_at_risk_revenue(_make_payload(customers, []))
    a = next(t for t in out["tiers"] if t["tier"] == "A")
    # 2.1M + 420K + 420 000 + 100 000 = 3 040 000
    assert math.isclose(a["forecastEur"], 3_040_000.0)


def test_tier_letter_case_insensitive():
    customers = [{"customerId": "1", "tier": "a", "forecast": "€1M"}]
    out = build_at_risk_revenue(_make_payload(customers, []))
    a = next(t for t in out["tiers"] if t["tier"] == "A")
    assert a["forecastEur"] == 1_000_000.0
    assert a["customerCount"] == 1
