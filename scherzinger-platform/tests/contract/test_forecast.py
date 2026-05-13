"""Phase 7 contract — composed Forecasting."""
from __future__ import annotations

from fastapi.testclient import TestClient

URL = "/api/v1/screens/forecast"


def test_forecast_top_level_shape(client: TestClient) -> None:
    res = client.get(URL)
    assert res.status_code == 200, res.text
    body = res.json()
    expected = {
        "header",
        "hero",
        "clusters",
        "walkForward",
        "inputCost",
        "pareto",
        "priceFloor",
        "priceFloorFootnote",
        "newProduct",
        # Phase 1 — simulator surface (tornado + distributions + mode toggle).
        "mode",
        "tornado",
        "distributions",
        # Phase 2 — methodology + lineage payload.
        "methodology",
    }
    assert set(body.keys()) == expected
    assert {"customer", "sku"} <= set(body["pareto"].keys())
    # Phase 1 — mode + horizon plumbed into the composer.
    assert body["mode"]["active"] in ("revenue", "margin", "volume")
    assert body["mode"]["horizonMonths"] in (3, 6, 12)
    # Tornado + distributions always non-empty (seed fallback).
    assert body["tornado"]["bars"]
    assert body["distributions"]["rows"]


def test_forecast_persona_till_404(client: TestClient) -> None:
    res = client.get(URL, params={"persona": "till"})
    assert res.status_code == 404
    assert "Phase 10" in res.json()["detail"]["message"]


def test_forecast_persona_heiko_404(client: TestClient) -> None:
    res = client.get(URL, params={"persona": "heiko"})
    assert res.status_code == 404
    assert "Phase 11" in res.json()["detail"]["message"]


def test_forecast_mode_param_plumbs_through(client: TestClient) -> None:
    body = client.get(URL, params={"mode": "margin"}).json()
    # Real impl recomputes the modeLabel; today the helper title-cases the param.
    assert body["header"].get("mode") == "margin"


def test_forecast_phase6_intervals(client: TestClient) -> None:
    """Phase 6: hero series carries P50/P80/P95 and an intervals block."""
    body = client.get(URL).json()
    hero = body["hero"]
    series = hero["series"]
    assert series
    for p in series:
        assert "p50" in p and "p80Low" in p and "p80High" in p
        assert "p95Low" in p and "p95High" in p
        # P95 must enclose P80 (or equal at the edges).
        assert p["p95Low"] <= p["p80Low"]
        assert p["p95High"] >= p["p80High"]
        # P50 sits inside both bands.
        assert p["p80Low"] <= p["p50"] <= p["p80High"]

    intervals = hero["intervals"]
    assert {"title", "bands", "disclosure", "calibration", "heuristic"} <= set(intervals.keys())
    band_ids = {b["id"] for b in intervals["bands"]}
    assert band_ids == {"p50", "p80", "p95"}
    cal = intervals["calibration"]
    assert cal["windowMonths"] >= 1
    # P95 must catch at least as many actuals as P80.
    assert cal["p95Hit"] >= cal["p80Hit"]


def test_forecast_etag_round_trip(client: TestClient) -> None:
    first = client.get(URL)
    etag = first.headers.get("etag")
    assert etag
    second = client.get(URL, headers={"If-None-Match": etag})
    assert second.status_code == 304
