"""Phase 7 contract — market direction + briefing + alerts + LLM parse."""
from __future__ import annotations

from fastapi.testclient import TestClient

from backend.services.forecast import alerts as alerts_service

URL = "/api/v1/forecast"


def setup_function() -> None:
    alerts_service.reset_for_tests()


def _csrf(client: TestClient) -> dict[str, str]:
    csrf = client.cookies.get("pryzm_csrf")
    assert csrf
    return {"x-csrf": csrf}


def test_market_direction_shape(client: TestClient) -> None:
    res = client.get(f"{URL}/market-direction")
    assert res.status_code == 200, res.text
    body = res.json()
    assert {"source", "tiles", "digest"} <= set(body.keys())
    assert len(body["tiles"]) >= 6, "expected ≥6 market tiles"
    sample = body["tiles"][0]
    assert {"name", "value", "unit", "wowPct", "tone", "context"} <= set(sample.keys())


def test_briefing_returns_artifact_receipt(client: TestClient) -> None:
    res = client.post(
        f"{URL}/briefing",
        json={"scenario_id": None, "output_format": "pdf", "recipient": "self"},
        headers=_csrf(client),
    )
    assert res.status_code == 200, res.text
    body = res.json()
    assert {"jobId", "status", "artifactUrl", "format", "recipient"} <= set(body.keys())
    assert body["format"] == "pdf"
    assert body["artifactUrl"].endswith(".pdf")


def test_alert_lifecycle(client: TestClient) -> None:
    create_res = client.post(
        f"{URL}/alerts",
        json={
            "metric": "mape",
            "entity_type": "commodity_group",
            "entity_id": "BKAGG",
            "threshold_kind": "mape_above",
            "threshold_value": 0.1,
        },
        headers=_csrf(client),
    )
    assert create_res.status_code == 200, create_res.text
    aid = create_res.json()["id"]
    list_body = client.get(f"{URL}/alerts").json()
    assert any(a["id"] == aid for a in list_body["alerts"])
    test_res = client.post(f"{URL}/alerts/{aid}/test", headers=_csrf(client)).json()
    assert test_res["triggered"] is True
    del_res = client.delete(f"{URL}/alerts/{aid}", headers=_csrf(client))
    assert del_res.status_code == 204


def test_scenario_parse_steel_pass_through(client: TestClient) -> None:
    prompt = "What if steel goes up 10% and we pass through 60%?"
    res = client.post(
        f"{URL}/scenarios/parse",
        json={"prompt": prompt},
        headers=_csrf(client),
    )
    assert res.status_code == 200, res.text
    body = res.json()
    names = {i["name"] for i in body["inputs"]}
    assert "Steel S355" in names
    assert "Pass-through %" in names
    steel = next(i for i in body["inputs"] if i["name"] == "Steel S355")
    assert steel["perturbation"]["value"] == 10.0
    pt = next(i for i in body["inputs"] if i["name"] == "Pass-through %")
    assert pt["perturbation"]["value"] == 60.0


def test_scenario_parse_only_partial_match(client: TestClient) -> None:
    body = client.post(
        f"{URL}/scenarios/parse",
        json={"prompt": "What if steel goes up 10% and we only pass through half?"},
        headers=_csrf(client),
    ).json()
    names = {i["name"] for i in body["inputs"]}
    # "half" is not a numeric value so the parser may not match — but steel must.
    assert "Steel S355" in names


def test_forecast_screen_includes_market_direction(client: TestClient) -> None:
    body = client.get("/api/v1/screens/forecast").json()
    assert "marketDirection" in body
    assert body["marketDirection"]["tiles"]
