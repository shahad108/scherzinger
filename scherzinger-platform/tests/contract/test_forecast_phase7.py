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
    # Default persona = analyst_memo (preserves prior behavior). Default
    # language for analyst_memo is English.
    assert body["persona"] == "analyst_memo"
    assert body["language"] == "en"


def test_briefing_manuel_persona_autoflips_to_german(client: TestClient) -> None:
    """v2.2 Phase I — when persona = manuel_1pager and no language given,
    the endpoint should auto-flip to German (Manuel reads German)."""
    res = client.post(
        f"{URL}/briefing",
        json={
            "scenario_id": None,
            "output_format": "pdf",
            "recipient": "till",
            "persona": "manuel_1pager",
        },
        headers=_csrf(client),
    )
    assert res.status_code == 200, res.text
    body = res.json()
    assert body["persona"] == "manuel_1pager"
    assert body["language"] == "de"
    pack = body["promptPack"]
    assert pack["tone"] == "terse"
    assert pack["length"] == "one_page"
    # Pricing terms preserved across languages.
    assert "EBITDA" in pack["preservedTerms"]
    assert "P50" in pack["preservedTerms"]


def test_briefing_prompt_pack_branches_all_four_combinations(client: TestClient) -> None:
    """v2.2 Phase I — persona × language matrix (4 cases).

    Asserts the prompt pack selected by the briefing service routes on both
    axes independently. No LLM is invoked; the receipt carries the pack
    metadata produced by ``_select_prompt_pack``.
    """
    matrix = [
        ("manuel_1pager", "de"),
        ("manuel_1pager", "en"),
        ("analyst_memo", "de"),
        ("analyst_memo", "en"),
    ]
    for persona, language in matrix:
        res = client.post(
            f"{URL}/briefing",
            json={
                "scenario_id": None,
                "output_format": "pdf",
                "recipient": "self",
                "persona": persona,
                "language": language,
            },
            headers=_csrf(client),
        )
        assert res.status_code == 200, res.text
        body = res.json()
        assert body["persona"] == persona, (persona, language, body)
        assert body["language"] == language, (persona, language, body)
        pack = body["promptPack"]
        # Persona controls tone + length.
        if persona == "manuel_1pager":
            assert pack["tone"] == "terse"
            assert pack["length"] == "one_page"
            assert pack["audience"] == "bu_lead"
        else:
            assert pack["tone"] == "analytical"
            assert pack["length"] == "full_memo"
            assert pack["audience"] == "pricing_analyst"
        # Language controls the output-language directive.
        if language == "de":
            assert "Deutsch" in pack["languageDirective"]
            assert pack["preservedTerms"], "German output must preserve pricing terms"
        else:
            assert "English" in pack["languageDirective"]


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
