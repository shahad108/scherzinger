"""API tests for /forecast/annotations.

Writes (POST/DELETE) require auth — same pattern as forecast_overrides. If
the seeded Frank user is missing the auth-dependent tests are skipped (same
convention as the existing contract tests).
"""
from fastapi.testclient import TestClient

from backend.main import app


def _csrf_headers(client: TestClient) -> dict[str, str]:
    csrf = client.cookies.get("pryzm_csrf")
    return {"x-csrf": csrf} if csrf else {}


def _login_frank() -> TestClient | None:
    client = TestClient(app)
    res = client.post(
        "/api/v1/auth/login",
        json={"email": "frank@scherzinger.de", "password": "frank-demo-2026"},
    )
    if res.status_code != 200:
        return None
    return client


def test_post_get_delete_roundtrip(tmp_path, monkeypatch):
    import pytest

    import backend.services.forecast.annotations as annotations

    store = tmp_path / "annotations.json"
    store.write_text("[]")
    monkeypatch.setattr(annotations, "STORE_PATH", store)

    client = _login_frank()
    if client is None:
        pytest.skip("frank user not seeded — run scripts/seed_auth.py")

    payload = {
        "target": {"kind": "month", "value": "2026-08"},
        "body": "Q3 renegotiation closed early — watch for upside.",
    }
    r = client.post(
        "/api/v1/forecast/annotations", json=payload, headers=_csrf_headers(client)
    )
    assert r.status_code == 201, r.text
    body = r.json()
    aid = body["id"]
    # Author must be derived from the JWT session, not a client-supplied value.
    assert body["author"] and body["author"] != "attacker"

    # GET stays open.
    r2 = client.get("/api/v1/forecast/annotations")
    assert r2.status_code == 200
    items = r2.json()["items"]
    assert any(x["id"] == aid for x in items)

    # Filter via query parameters.
    r3 = client.get(
        "/api/v1/forecast/annotations",
        params={"target_kind": "month", "target_value": "2026-08"},
    )
    assert r3.status_code == 200
    assert any(x["id"] == aid for x in r3.json()["items"])

    r4 = client.delete(
        f"/api/v1/forecast/annotations/{aid}", headers=_csrf_headers(client)
    )
    assert r4.status_code == 204


def test_post_rejects_empty_body(monkeypatch, tmp_path):
    import pytest

    import backend.services.forecast.annotations as annotations

    store = tmp_path / "annotations.json"
    store.write_text("[]")
    monkeypatch.setattr(annotations, "STORE_PATH", store)

    client = _login_frank()
    if client is None:
        pytest.skip("frank user not seeded — run scripts/seed_auth.py")

    r = client.post(
        "/api/v1/forecast/annotations",
        json={
            "target": {"kind": "month", "value": "2026-08"},
            "body": "",
        },
        headers=_csrf_headers(client),
    )
    assert r.status_code == 422, r.text  # pydantic min_length


def test_post_rejects_bad_target_kind(monkeypatch, tmp_path):
    import pytest

    import backend.services.forecast.annotations as annotations

    store = tmp_path / "annotations.json"
    store.write_text("[]")
    monkeypatch.setattr(annotations, "STORE_PATH", store)

    client = _login_frank()
    if client is None:
        pytest.skip("frank user not seeded — run scripts/seed_auth.py")

    r = client.post(
        "/api/v1/forecast/annotations",
        json={
            "target": {"kind": "row", "value": "x"},
            "body": "body",
        },
        headers=_csrf_headers(client),
    )
    assert r.status_code == 422, r.text


def test_writes_require_auth(monkeypatch, tmp_path):
    """Bare TestClient (no login) must be rejected on POST/DELETE."""
    import backend.services.forecast.annotations as annotations

    store = tmp_path / "annotations.json"
    store.write_text("[]")
    monkeypatch.setattr(annotations, "STORE_PATH", store)

    anon = TestClient(app)
    anon.cookies.set("pryzm_csrf", "test-csrf-token")
    csrf = {"x-csrf": "test-csrf-token"}

    payload = {
        "target": {"kind": "month", "value": "2026-08"},
        "body": "anon attempt should fail",
    }
    r = anon.post("/api/v1/forecast/annotations", json=payload, headers=csrf)
    assert r.status_code == 401, r.text

    r2 = anon.delete("/api/v1/forecast/annotations/whatever", headers=csrf)
    assert r2.status_code == 401, r2.text


def test_post_ignores_client_supplied_author(monkeypatch, tmp_path):
    """Client cannot spoof the author — must come from the JWT."""
    import pytest

    import backend.services.forecast.annotations as annotations

    store = tmp_path / "annotations.json"
    store.write_text("[]")
    monkeypatch.setattr(annotations, "STORE_PATH", store)

    client = _login_frank()
    if client is None:
        pytest.skip("frank user not seeded — run scripts/seed_auth.py")

    r = client.post(
        "/api/v1/forecast/annotations",
        json={
            "target": {"kind": "month", "value": "2026-08"},
            "body": "ignore the client author",
            "author": "attacker",  # extra field — pydantic ignores by default
        },
        headers=_csrf_headers(client),
    )
    assert r.status_code == 201, r.text
    assert r.json()["author"] != "attacker"


def test_delete_unknown_returns_404(monkeypatch, tmp_path):
    import pytest

    import backend.services.forecast.annotations as annotations

    store = tmp_path / "annotations.json"
    store.write_text("[]")
    monkeypatch.setattr(annotations, "STORE_PATH", store)

    client = _login_frank()
    if client is None:
        pytest.skip("frank user not seeded — run scripts/seed_auth.py")

    r = client.delete(
        "/api/v1/forecast/annotations/does-not-exist", headers=_csrf_headers(client)
    )
    assert r.status_code == 404, r.text
