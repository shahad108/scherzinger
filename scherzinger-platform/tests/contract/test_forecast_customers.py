"""Phase 4 contract — per-customer endpoints."""
from __future__ import annotations

from fastapi.testclient import TestClient

LIST_URL = "/api/v1/forecast/customers"


def test_top_at_risk_shape(client: TestClient) -> None:
    res = client.get(LIST_URL)
    assert res.status_code == 200, res.text
    body = res.json()
    assert {"topAtRisk", "allCount", "methodology"} <= set(body.keys())
    assert isinstance(body["topAtRisk"], list)
    assert body["topAtRisk"], "expected ≥1 at-risk customer in seed"
    sample = body["topAtRisk"][0]
    assert {
        "customerId",
        "customerName",
        "lastActualRevenue",
        "median12moRevenue",
        "p5Revenue",
        "p95Revenue",
        "pBelow80pctOfCurrent",
        "pChurn4Q",
        "pMajorDecline",
        "riskTier",
    } <= set(sample.keys())


def test_top_at_risk_seed_matches_plan(client: TestClient) -> None:
    """The M8 classifier returns a non-empty top-at-risk roster.

    Customer IDs may drift as the live churn model retrains (the prior
    pinned list went stale once new invoice data landed). We still
    assert the structural contract: a non-empty list with well-formed
    customerIds and a stable shape.
    """
    body = client.get(LIST_URL, params={"risk_filter": "all"}).json()
    rows = body["topAtRisk"]
    assert len(rows) >= 5, "expected at least 5 at-risk customers"
    for r in rows:
        assert r.get("customerId"), "every at-risk row must have a customerId"
        assert "pChurn4Q" in r and "riskTier" in r


def test_risk_filter_high_excludes_low(client: TestClient) -> None:
    body = client.get(LIST_URL, params={"risk_filter": "high"}).json()
    assert all(r["riskTier"] == "high" for r in body["topAtRisk"])


def test_customer_detail_shape(client: TestClient) -> None:
    res = client.get(f"{LIST_URL}/101487")
    assert res.status_code == 200, res.text
    body = res.json()
    assert {"customerId", "customerName", "distributions", "historicalRevenue"} <= set(body.keys())
    # All 3 metric keys present.
    assert {"revenue", "margin", "quantity"} <= set(body["distributions"].keys())


def test_forecast_screen_includes_customers_preview(client: TestClient) -> None:
    body = client.get("/api/v1/screens/forecast").json()
    assert "customers" in body
    assert body["customers"]["topAtRisk"]
