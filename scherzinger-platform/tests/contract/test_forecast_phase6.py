"""Phase 6 contract — quote-to-revenue + calibration endpoints + screen include."""
from __future__ import annotations

from fastapi.testclient import TestClient

URL = "/api/v1/forecast"


def test_quote_to_revenue_shape(client: TestClient) -> None:
    res = client.get(f"{URL}/quote-to-revenue")
    assert res.status_code == 200, res.text
    body = res.json()
    assert {"source", "horizons"} <= set(body.keys())
    assert len(body["horizons"]) == 3
    days = {h["horizonDays"] for h in body["horizons"]}
    assert days == {30, 60, 90}
    for h in body["horizons"]:
        assert {"openQuotes", "winRate", "avgMargin", "expectedRevenue", "expectedGrossProfit"} <= set(h.keys())


def test_quote_to_revenue_arithmetic_consistent(client: TestClient) -> None:
    body = client.get(f"{URL}/quote-to-revenue").json()
    for h in body["horizons"]:
        derived = h["openPipelineEur"] * h["winRate"] * h["avgMargin"]
        # Allow rounding slack of 5%.
        assert abs(derived - h["expectedGrossProfit"]) / max(1, derived) < 0.05


def test_calibration_shape(client: TestClient) -> None:
    res = client.get(f"{URL}/calibration")
    assert res.status_code == 200, res.text
    body = res.json()
    assert {"nominalBand", "rows"} <= set(body.keys())
    assert body["nominalBand"] == 80
    assert len(body["rows"]) >= 4
    for row in body["rows"]:
        assert {"clusterId", "actualHitRatePct", "nBacktests", "tone"} <= set(row.keys())
        assert row["tone"] in ("green", "amber", "red")


def test_calibration_has_one_within_5pp(client: TestClient) -> None:
    body = client.get(f"{URL}/calibration").json()
    nominal = body["nominalBand"]
    within = [r for r in body["rows"] if abs(r["actualHitRatePct"] - nominal) <= 5]
    assert within, "expected at least one cluster within ±5pp of nominal"


def test_forecast_screen_includes_q2r_and_calibration(client: TestClient) -> None:
    body = client.get("/api/v1/screens/forecast").json()
    assert "quoteToRevenue" in body
    assert "calibration" in body
    assert body["quoteToRevenue"]["horizons"]
    assert body["calibration"]["rows"]
