"""Pricing Studio v3 / Phase 10 — user language preference endpoints.

A dedicated lightweight read/write pair for the German toggle in the
header. Both endpoints delegate to UserPreferences.language (already
persisted in p14) so existing /me/preferences callers keep working.
"""
from __future__ import annotations

import pytest
from fastapi.testclient import TestClient


GET_URL = "/api/v1/users/me/language"
PUT_URL = "/api/v1/users/me/language"


def _csrf(client: TestClient) -> dict[str, str]:
    tok = client.cookies.get("pryzm_csrf")
    return {"x-csrf": tok} if tok else {}


@pytest.fixture(autouse=True)
def _reset_language(client: TestClient):
    # Each test starts in a known-good state (en). Restore after.
    client.put(PUT_URL, json={"lang": "en"}, headers=_csrf(client))
    yield
    client.put(PUT_URL, json={"lang": "en"}, headers=_csrf(client))


def test_get_default_returns_a_supported_lang(client: TestClient) -> None:
    res = client.get(GET_URL)
    assert res.status_code == 200, res.text
    body = res.json()
    assert "lang" in body
    assert body["lang"] in ("en", "de")


def test_put_then_get_round_trip_de(client: TestClient) -> None:
    res = client.put(PUT_URL, json={"lang": "de"}, headers=_csrf(client))
    assert res.status_code == 200, res.text
    assert res.json()["lang"] == "de"

    res = client.get(GET_URL)
    assert res.status_code == 200
    assert res.json()["lang"] == "de"


def test_put_then_get_round_trip_en(client: TestClient) -> None:
    # Start from de so the en write is a real change.
    client.put(PUT_URL, json={"lang": "de"}, headers=_csrf(client))
    res = client.put(PUT_URL, json={"lang": "en"}, headers=_csrf(client))
    assert res.status_code == 200, res.text
    assert res.json()["lang"] == "en"

    res = client.get(GET_URL)
    assert res.json()["lang"] == "en"


def test_put_rejects_unsupported_lang(client: TestClient) -> None:
    res = client.put(PUT_URL, json={"lang": "fr"}, headers=_csrf(client))
    assert res.status_code == 400


def test_get_requires_auth() -> None:
    """Auth gate: fresh TestClient (no cookies) must 401/403."""
    from backend.main import app

    fresh = TestClient(app)
    res = fresh.get(GET_URL)
    assert res.status_code in (401, 403)


def test_put_requires_auth() -> None:
    from backend.main import app

    fresh = TestClient(app)
    res = fresh.put(PUT_URL, json={"lang": "de"})
    assert res.status_code in (401, 403)
