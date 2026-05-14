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
    """Calibration was repurposed from "CI hit-rate vs nominal band" to
    "per-cluster backtest accuracy" (see calibration.py header). MAPE is the
    real metric. The original 80% nominal-band heuristic was kept for back-
    compat (``actualHitRatePct = 100 - MAPE_pct``) but it isn't the contract
    anymore. The real contract: at least one cluster fits tightly enough to
    be tagged ``green`` (MAPE ≤ 3%)."""
    body = client.get(f"{URL}/calibration").json()
    measured = [r for r in body["rows"] if r.get("actualHitRatePct") is not None]
    assert measured, "expected at least one cluster with a measured hit rate"
    green = [r for r in measured if r.get("tone") == "green"]
    assert green, "expected at least one cluster within the green tone band"


def test_forecast_screen_includes_q2r_and_calibration(client: TestClient) -> None:
    body = client.get("/api/v1/screens/forecast").json()
    assert "quoteToRevenue" in body
    assert "calibration" in body
    assert body["quoteToRevenue"]["horizons"]
    assert body["calibration"]["rows"]
