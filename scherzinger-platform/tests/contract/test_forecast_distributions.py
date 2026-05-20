"""Phase 1 contract — /api/v1/forecast/distributions.

Per-entity Monte Carlo distribution summary. Shape mirrors
``frontend-v2/src/types/forecast.ts`` ``DistributionRow``.
"""
from __future__ import annotations

from fastapi.testclient import TestClient

URL = "/api/v1/forecast/distributions"


def test_distributions_shape(client: TestClient) -> None:
    res = client.get(URL)
    assert res.status_code == 200, res.text
    body = res.json()
    assert {
        "computedAt",
        "metric",
        "horizonMonths",
        "entityType",
        "source",
        "rows",
    } <= set(body.keys())
    assert isinstance(body["rows"], list)
    assert body["rows"], "expected at least one entity row"
    sample = body["rows"][0]
    assert {
        "entityId",
        "entityName",
        "lastActual",
        "median",
        "mean",
        "p5",
        "p25",
        "p75",
        "p95",
        "pBelowThreshold",
        "thresholdValue",
        "thresholdKind",
        "shockMode",
        "nSimulations",
    } <= set(sample.keys())


def test_distributions_metric_filter_plumbs_through(client: TestClient) -> None:
    res = client.get(URL, params={"metric": "revenue"})
    assert res.status_code == 200
    assert res.json()["metric"] == "revenue"


def test_distributions_horizon_filter_plumbs_through(client: TestClient) -> None:
    res = client.get(URL, params={"horizon_months": 6})
    assert res.status_code == 200
    assert res.json()["horizonMonths"] == 6


def test_distributions_volume_alias_maps_to_quantity(client: TestClient) -> None:
    res = client.get(URL, params={"metric": "volume"})
    assert res.status_code == 200
    assert res.json()["metric"] == "quantity"


def test_distributions_have_ordered_quantiles(client: TestClient) -> None:
    body = client.get(URL).json()
    for row in body["rows"]:
        assert row["p5"] <= row["p25"] <= row["median"] <= row["p75"] <= row["p95"], row
