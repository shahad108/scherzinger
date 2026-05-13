"""Phase 2 contract — /api/v1/forecast/methodology + /api/v1/forecast/lineage."""
from __future__ import annotations

from fastapi.testclient import TestClient

METHODOLOGY_URL = "/api/v1/forecast/methodology"
LINEAGE_URL = "/api/v1/forecast/lineage"


def test_methodology_shape(client: TestClient) -> None:
    res = client.get(METHODOLOGY_URL)
    assert res.status_code == 200, res.text
    body = res.json()
    assert {
        "lastReviewedAt",
        "sources",
        "assumptions",
        "models",
        "limitations",
        "validationReportMd",
    } <= set(body.keys())
    assert isinstance(body["sources"], list) and body["sources"]
    assert isinstance(body["assumptions"], list)
    assert any(a.get("label") == "Data-through" for a in body["assumptions"])
    assert isinstance(body["models"], list) and body["models"]
    sample_model = body["models"][0]
    assert {
        "modelName",
        "version",
        "trainedAt",
        "entityType",
        "metric",
        "metricValue",
    } <= set(sample_model.keys())


def test_lineage_default_returns_models_and_sources(client: TestClient) -> None:
    res = client.get(LINEAGE_URL)
    assert res.status_code == 200
    body = res.json()
    assert {"entityType", "models", "auditChain", "sources"} <= set(body.keys())
    assert body["entityType"] == "commodity_group"


def test_lineage_entity_type_filter(client: TestClient) -> None:
    res = client.get(LINEAGE_URL, params={"entity_type": "customer"})
    assert res.status_code == 200
    body = res.json()
    assert body["entityType"] == "customer"
    # Either we get the customer-specific model spec, or the default fallback.
    assert body["models"]


def test_forecast_screen_includes_methodology(client: TestClient) -> None:
    body = client.get("/api/v1/screens/forecast").json()
    assert "methodology" in body
    assert "assumptions" in body["methodology"]
    assert "models" in body["methodology"]
