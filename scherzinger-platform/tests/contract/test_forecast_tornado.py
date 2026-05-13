"""Phase 1 contract — /api/v1/forecast/tornado.

The endpoint composes from ``monte_carlo_results`` when the table is
populated; otherwise it falls back to the seed bundled with the forecast
screen JSON. Either way the shape must match what the FE TornadoCard
component expects (mirror of ``frontend-v2/src/types/forecast.ts``).
"""
from __future__ import annotations

from fastapi.testclient import TestClient

URL = "/api/v1/forecast/tornado"


def test_tornado_shape(client: TestClient) -> None:
    res = client.get(URL)
    assert res.status_code == 200, res.text
    body = res.json()
    assert {
        "computedAt",
        "metric",
        "horizonMonths",
        "entityType",
        "n_simulations",
        "shockMode",
        "source",
        "bars",
    } <= set(body.keys())
    assert isinstance(body["bars"], list)
    assert len(body["bars"]) >= 6, f"expected ≥6 bars for the headline tornado, got {len(body['bars'])}"
    sample = body["bars"][0]
    assert {
        "inputName",
        "unit",
        "perturbationSize",
        "deltaPositive",
        "deltaNegative",
        "deltaUnit",
    } <= set(sample.keys())


def test_tornado_metric_filter_plumbs_through(client: TestClient) -> None:
    res = client.get(URL, params={"metric": "revenue"})
    assert res.status_code == 200
    assert res.json()["metric"] == "revenue"


def test_tornado_volume_metric_translates_to_quantity(client: TestClient) -> None:
    """FE uses 'volume'; persisted column uses 'quantity'."""
    res = client.get(URL, params={"metric": "volume"})
    assert res.status_code == 200
    assert res.json()["metric"] == "quantity"


def test_tornado_horizon_filter_plumbs_through(client: TestClient) -> None:
    res = client.get(URL, params={"horizon_months": 3})
    assert res.status_code == 200
    assert res.json()["horizonMonths"] == 3


def test_tornado_sort_order_stable_by_abs_delta(client: TestClient) -> None:
    """The FE assumes bars are pre-sorted by |delta| desc."""
    body = client.get(URL).json()
    deltas = [
        max(abs(b["deltaPositive"]), abs(b["deltaNegative"])) for b in body["bars"]
    ]
    assert deltas == sorted(deltas, reverse=True), f"bars not sorted desc by |delta|: {deltas}"
