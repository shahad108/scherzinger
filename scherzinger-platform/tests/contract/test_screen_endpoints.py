"""Contract tests for the BFF screen endpoints.

Phase 1: each endpoint returns the canonical mock JSON byte-for-byte, with
ETag + Cache-Control headers, validates against its Pydantic schema, and
honours conditional GET (If-None-Match → 304).
"""
from __future__ import annotations

import pytest

from backend.schemas.screens import (
    ActionCenterData,
    AiShell,
    ForecastShell,
    MarginCockpitData,
    QuotesShell,
    ShellRailData,
    StudioShell,
)

from .conftest import SCREEN_ENDPOINTS, screen_base_path

ENDPOINT_TO_MODEL = {
    "/shell": ShellRailData,
    "/action-center": ActionCenterData,
    "/margin-cockpit": MarginCockpitData,
    "/quotes": QuotesShell,
    "/forecast": ForecastShell,
    "/studio": StudioShell,
    "/ai": AiShell,
}


def _url(endpoint: str) -> str:
    return f"{screen_base_path()}{endpoint}"


@pytest.mark.parametrize("endpoint", list(SCREEN_ENDPOINTS.keys()))
def test_endpoint_returns_200(client, endpoint: str) -> None:
    res = client.get(_url(endpoint))
    assert res.status_code == 200, res.text


SEED_BACKED_ENDPOINTS = [
    # /shell is DB-backed (Phase 3); /action-center, /margin-cockpit, /quotes,
    # /forecast, /studio, /ai are composed (Phases 4-9).
    e
    for e in SCREEN_ENDPOINTS
    if e
    not in (
        "/shell",
        "/action-center",
        "/margin-cockpit",
        "/quotes",
        "/forecast",
        "/studio",
        "/ai",
    )
]


@pytest.mark.parametrize("endpoint", SEED_BACKED_ENDPOINTS)
def test_endpoint_payload_equals_seed(
    client, endpoint: str, screen_mocks: dict
) -> None:
    res = client.get(_url(endpoint))
    assert res.status_code == 200
    assert res.json() == screen_mocks[endpoint]


def test_shell_payload_matches_seed_shape(client, screen_mocks: dict) -> None:
    """Phase 3: /shell is DB-backed for the seeded Frank user. Shape and
    counts must match the seed; ids may differ (reviewer ids are UUIDs now).
    """
    res = client.get(_url("/shell"))
    assert res.status_code == 200
    body = res.json()
    seed = screen_mocks["/shell"]

    assert set(body.keys()) == set(seed.keys())
    assert len(body["notifications"]) == len(seed["notifications"])
    # /shell sorts by created_at desc, so order may differ from the seed file
    # ordering. Compare by id rather than position.
    body_notif_by_id = {n["id"]: n for n in body["notifications"]}
    for n_seed in seed["notifications"]:
        n_body = body_notif_by_id.get(n_seed["id"])
        assert n_body is not None, f"missing notification {n_seed['id']}"
        assert n_body["tone"] == n_seed["tone"]
        assert n_body["title"] == n_seed["title"]
        # /shell is mutable post-Phase 3 (mark-read flips this), so we no
        # longer pin unread to the seed value here.
    assert body["reviewers"]["panelLabel"] == seed["reviewers"]["panelLabel"]
    # Live DB may carry additional reviewers beyond the seeded panel —
    # the contract is that *every seeded reviewer* still appears.
    assert len(body["reviewers"]["people"]) >= len(seed["reviewers"]["people"])
    body_initials = {p["initials"] for p in body["reviewers"]["people"]}
    for p_seed in seed["reviewers"]["people"]:
        assert p_seed["initials"] in body_initials, (
            f"missing seeded reviewer initials {p_seed['initials']!r}"
        )
    # The live DB can carry additional user-pinned sections on top of the
    # canonical seeded ones. Assert the seed sections are a subset by title.
    assert len(body["sections"]) >= len(seed["sections"])
    seed_titles_by_pos = [s["title"] for s in seed["sections"]]
    body_titles = [s["title"] for s in body["sections"]]
    for title in seed_titles_by_pos:
        assert title in body_titles, f"missing seeded section title {title!r}"


@pytest.mark.parametrize("endpoint", list(SCREEN_ENDPOINTS.keys()))
def test_endpoint_validates_against_schema(client, endpoint: str) -> None:
    model = ENDPOINT_TO_MODEL[endpoint]
    res = client.get(_url(endpoint))
    assert res.status_code == 200
    # model.model_validate raises on mismatch.
    parsed = model.model_validate(res.json())
    # Round-trip must be lossless.
    assert parsed.model_dump() == res.json()


@pytest.mark.parametrize("endpoint", list(SCREEN_ENDPOINTS.keys()))
def test_endpoint_emits_etag_header(client, endpoint: str) -> None:
    res = client.get(_url(endpoint))
    assert res.status_code == 200
    etag = res.headers.get("etag")
    assert etag, f"{endpoint}: missing ETag header"
    assert etag.startswith('"') and etag.endswith('"'), f"{endpoint}: ETag must be quoted"


@pytest.mark.parametrize("endpoint", list(SCREEN_ENDPOINTS.keys()))
def test_endpoint_honours_if_none_match(client, endpoint: str) -> None:
    first = client.get(_url(endpoint))
    etag = first.headers["etag"]
    second = client.get(_url(endpoint), headers={"If-None-Match": etag})
    assert second.status_code == 304, second.text


def test_version_endpoint(client) -> None:
    res = client.get(f"{screen_base_path()}/version")
    assert res.status_code == 200
    body = res.json()
    assert set(body.keys()) == {"version", "backend_commit", "schema_hash"}
    assert body["version"] == "1.0.0"
    assert len(body["schema_hash"]) == 16


def test_me_stub_returns_frank(client) -> None:
    res = client.get("/api/v1/me")
    assert res.status_code == 200
    body = res.json()
    assert body["ui_persona"] == "frank"
    assert body["email"] == "frank@scherzinger.de"
    assert "view.action_center" in body["permissions"]
    assert "admin.users" not in body["permissions"]
