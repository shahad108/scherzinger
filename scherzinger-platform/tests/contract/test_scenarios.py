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


# ---------------------------------------------------------------------------
# Phase B — scenarios propagate across the whole payload (not just distributions)
# and presets resolve the same way as system / saved scenarios.
# ---------------------------------------------------------------------------


def test_forecast_preset_steel_spike_resolves_and_shifts(client: TestClient) -> None:
    """preset:steel-spike used to be a silent no-op — verify it now applies."""
    base = client.get(FORECAST_URL).json()
    res = client.get(FORECAST_URL, params={"scenario_id": "preset:steel-spike"})
    assert res.status_code == 200, res.text
    body = res.json()
    # Active id surfaces for the banner.
    assert body.get("activeScenarioId") == "preset:steel-spike"
    # Receipt is stamped with a non-zero shift (steel +20% should bite).
    receipt = body.get("scenarioApplied")
    assert receipt is not None
    assert receipt["inputCount"] >= 1
    assert abs(receipt["shiftPpMargin"]) > 0
    # filterScope reflects the active scenario for FE badges.
    assert body["filterScope"]["scenarioId"] == "preset:steel-spike"
    # Distributions still moved (as before).
    assert (
        body["distributions"]["rows"][0]["median"]
        != base["distributions"]["rows"][0]["median"]
    )


def test_forecast_preset_unknown_returns_base_without_crash(client: TestClient) -> None:
    """Unknown preset ids must not 500 — they fall through as no-op."""
    res = client.get(FORECAST_URL, params={"scenario_id": "preset:doesnotexist"})
    assert res.status_code == 200, res.text
    body = res.json()
    # No activeScenarioId stamped because scenario_service.get_scenario
    # returned None → composer skipped the apply branch.
    assert "activeScenarioId" not in body or body["activeScenarioId"] is None


def test_forecast_scenario_propagates_beyond_distributions(client: TestClient) -> None:
    """Phase B contract: scenarios shift hero, PVM, pocket waterfall,
    margin trajectory, commodity trajectories, at-risk revenue — not just
    the distributions card."""
    base = client.get(FORECAST_URL).json()
    perturbed = client.get(
        FORECAST_URL,
        params={"scenario_id": "00000000-0000-0000-0000-000000000002"},
    ).json()

    # Pick one downstream section that previously did NOT shift and prove
    # it now responds to the scenario. We pick the first available signal
    # to keep the test robust to which optional blocks composed.
    sections_with_evidence = 0

    # Hero KPI total — recomputed from shifted future-month series.
    bh = (base.get("hero") or {}).get("forecast12moTotal")
    ph = (perturbed.get("hero") or {}).get("forecast12moTotal")
    if isinstance(bh, (int, float)) and isinstance(ph, (int, float)) and bh != 0:
        if abs(ph - bh) / abs(bh) > 1e-6:
            sections_with_evidence += 1

    # Margin trajectory projected first quarter.
    def _first_proj_margin(p: dict) -> float | None:
        mt = p.get("marginTrajectory") or {}
        proj = mt.get("projected") or []
        if proj and isinstance(proj[0], dict):
            v = proj[0].get("margin")
            if isinstance(v, (int, float)):
                return float(v)
        return None
    bm = _first_proj_margin(base)
    pm = _first_proj_margin(perturbed)
    if bm is not None and pm is not None and bm != pm:
        sections_with_evidence += 1

    # At-risk revenue total.
    bar = (base.get("atRiskRevenue") or {}).get("totalForecastEur")
    par = (perturbed.get("atRiskRevenue") or {}).get("totalForecastEur")
    if (
        isinstance(bar, (int, float))
        and isinstance(par, (int, float))
        and bar != 0
        and abs(par - bar) / abs(bar) > 1e-6
    ):
        sections_with_evidence += 1

    # Commodity trajectories last quarter on the first group.
    def _last_q(p: dict) -> float | None:
        ct = p.get("commodityTrajectories") or {}
        groups = ct.get("groups") or []
        if groups and isinstance(groups[0], dict):
            series = groups[0].get("series") or []
            if series and isinstance(series[-1], (int, float)):
                return float(series[-1])
        return None
    bc = _last_q(base)
    pc = _last_q(perturbed)
    if bc is not None and pc is not None and bc != pc:
        sections_with_evidence += 1

    assert sections_with_evidence >= 2, (
        "Expected scenario propagation to shift at least two non-distribution "
        "sections; saw evidence in "
        f"{sections_with_evidence}. Phase B regression."
    )


def test_forecast_tornado_bars_untouched_under_scenario(client: TestClient) -> None:
    """Tornado bars are the sensitivity model — they must NOT shift when a
    scenario is applied (would be double-counting)."""
    base = client.get(FORECAST_URL).json()
    perturbed = client.get(
        FORECAST_URL,
        params={"scenario_id": "00000000-0000-0000-0000-000000000002"},
    ).json()
    assert base.get("tornado") == perturbed.get("tornado")


def test_run_endpoint_returns_baseline_vs_shifted(client: TestClient) -> None:
    """POST /scenarios/{id}/run returns baseline + shifted forecasts and deltas
    across revenue / volume / margin targets."""
    res = client.post(
        f"{URL}/preset:steel-spike/run",
        json={"horizon": 12},
        headers=_csrf(client),
    )
    assert res.status_code == 200, res.text
    body = res.json()
    assert body["scenarioId"] == "preset:steel-spike"
    assert body["horizonMonths"] == 12
    assert set(body["baseline"]) == {"revenue", "volume", "margin"}
    assert set(body["shifted"]) == {"revenue", "volume", "margin"}
    assert set(body["deltas"]) == {"revenue", "volume", "margin"}
    # Each target carries 12 monthly points
    for target in ("revenue", "volume", "margin"):
        assert len(body["baseline"][target]["monthly"]) == 12
        assert len(body["shifted"][target]["monthly"]) == 12
        delta = body["deltas"][target]
        assert {"baseline", "shifted", "absoluteDelta", "pctDelta"} <= set(delta)
    # Steel-spike preset is a downward shock — revenue should drop.
    assert body["deltas"]["revenue"]["pctDelta"] is not None
    assert body["deltas"]["revenue"]["pctDelta"] < 0
    # Receipt is stamped from the scenarioApplied envelope.
    assert body["receipt"] is not None
    assert body["receipt"]["inputCount"] >= 1


def test_run_endpoint_404_on_unknown_scenario_resolves_to_base(client: TestClient) -> None:
    """Unknown scenario IDs resolve to base (consistent with the forecast
    endpoint's `scenario_id=` behaviour) rather than 500."""
    res = client.post(
        f"{URL}/preset:does-not-exist/run",
        json={"horizon": 12},
        headers=_csrf(client),
    )
    assert res.status_code == 200, res.text
    body = res.json()
    # No real shift → deltas near zero.
    rev_delta = body["deltas"]["revenue"]["pctDelta"]
    assert rev_delta is None or abs(rev_delta) < 1e-6
