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
    """Seed customer IDs must include the M8 classifier's top scorers."""
    body = client.get(LIST_URL, params={"risk_filter": "all"}).json()
    ids = {r["customerId"] for r in body["topAtRisk"]}
    assert {"101487", "104447", "100924", "101154", "100702"} <= ids


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
