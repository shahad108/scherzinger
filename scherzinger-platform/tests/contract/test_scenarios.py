"""Phase 5 contract — scenarios CRUD + share + scenario-applied forecast."""
from __future__ import annotations

from fastapi.testclient import TestClient

from backend.services import scenario_service

URL = "/api/v1/scenarios"
FORECAST_URL = "/api/v1/screens/forecast"


def setup_function() -> None:
    scenario_service.reset_memory_store_for_tests()


def _csrf(client: TestClient) -> dict[str, str]:
    csrf = client.cookies.get("pryzm_csrf")
    assert csrf, "expected pryzm_csrf cookie after login"
    return {"x-csrf": csrf}


def test_list_returns_three_system_scenarios(client: TestClient) -> None:
    res = client.get(URL)
    assert res.status_code == 200, res.text
    body = res.json()
    assert {"system", "saved", "teamShared"} <= set(body.keys())
    assert len(body["system"]) == 3
    names = {s["name"] for s in body["system"]}
    assert names == {"Base case", "Steel shock +10%", "Multi-input shock"}


def test_create_then_list_includes_in_saved(client: TestClient) -> None:
    payload = {
        "name": "Test Q4 hard landing",
        "description": "Steel +12%, demand −8%.",
        "visibility": "private",
        "inputs": [
            {"name": "Steel S355", "kind": "market_series", "unit": "€/t",
             "perturbation": {"type": "pct", "value": 12}},
            {"name": "Demand growth", "kind": "internal_lever", "unit": "%",
             "perturbation": {"type": "pct", "value": -8}},
        ],
    }
    res = client.post(URL, json=payload, headers=_csrf(client))
    assert res.status_code == 201, res.text
    sid = res.json()["id"]
    list_body = client.get(URL).json()
    saved_names = {s["name"] for s in list_body["saved"]}
    assert "Test Q4 hard landing" in saved_names
    # Sanity: a fetch by id round-trips.
    one = client.get(f"{URL}/{sid}").json()
    assert one["name"] == "Test Q4 hard landing"


def test_share_flips_visibility_to_team(client: TestClient) -> None:
    create_res = client.post(URL, json={
        "name": "Share me",
        "visibility": "private",
        "inputs": [],
    }, headers=_csrf(client))
    sid = create_res.json()["id"]
    res = client.post(f"{URL}/{sid}/share", json={"recipient": "team"}, headers=_csrf(client))
    assert res.status_code == 200, res.text


def test_delete_round_trips(client: TestClient) -> None:
    create_res = client.post(URL, json={
        "name": "To delete",
        "visibility": "private",
        "inputs": [],
    }, headers=_csrf(client))
    sid = create_res.json()["id"]
    res = client.delete(f"{URL}/{sid}", headers=_csrf(client))
    assert res.status_code == 204
    assert client.get(f"{URL}/{sid}").status_code == 404


def test_forecast_with_scenario_id_applies_perturbation(client: TestClient) -> None:
    base = client.get(FORECAST_URL).json()
    base_median = base["distributions"]["rows"][0]["median"]

    # Steel shock system scenario.
    res = client.get(FORECAST_URL, params={
        "scenario_id": "00000000-0000-0000-0000-000000000002",
    })
    assert res.status_code == 200, res.text
    perturbed = res.json()
    assert perturbed.get("activeScenarioId") == "00000000-0000-0000-0000-000000000002"
    perturbed_median = perturbed["distributions"]["rows"][0]["median"]
    # Steel shock should shift the median (sign depends on tornado direction).
    assert perturbed_median != base_median
    assert "scenarioApplied" in perturbed


def test_forecast_with_base_scenario_is_passthrough(client: TestClient) -> None:
    base = client.get(FORECAST_URL).json()
    res = client.get(FORECAST_URL, params={
        "scenario_id": "00000000-0000-0000-0000-000000000001",
    })
    body = res.json()
    # Base scenario has no inputs — distributions should be untouched.
    assert body["distributions"]["rows"][0]["median"] == base["distributions"]["rows"][0]["median"]
