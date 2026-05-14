"""API tests for /forecast/overrides.

POST/PATCH/DELETE now require auth (Phase 8 finding #2), so these mirror the
auth pattern used by tests/contract/test_p14_settings.py — log in as the
seeded Frank user before issuing write requests. If the seeded user is
missing the suite is skipped (same convention as the contract tests).
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


def test_post_get_patch_delete_roundtrip(tmp_path, monkeypatch):
    import pytest

    from backend.services.forecast import overrides

    store = tmp_path / "overrides.json"
    store.write_text("[]")
    monkeypatch.setattr(overrides, "STORE_PATH", store)

    client = _login_frank()
    if client is None:
        pytest.skip("frank user not seeded — run scripts/seed_auth.py")

    payload = {
        "month": "2026-08",
        "cluster": None,
        "mode": "revenue",
        "actual": 650000,
        "modelP50": 612000,
        "source": "manual",
        "confidence": "medium",
        "reason": "Q3 contract renegotiation closed early",
    }
    r = client.post(
        "/api/v1/forecast/overrides", json=payload, headers=_csrf_headers(client)
    )
    assert r.status_code == 201, r.text
    oid = r.json()["id"]

    # GET stays open (read endpoints mirror other forecast reads).
    r2 = client.get("/api/v1/forecast/overrides")
    assert r2.status_code == 200
    assert any(x["id"] == oid for x in r2.json()["items"])

    r3 = client.patch(
        f"/api/v1/forecast/overrides/{oid}",
        json={"actual": 660000},
        headers=_csrf_headers(client),
    )
    assert r3.status_code == 200, r3.text
    assert r3.json()["actual"] == 660000

    r4 = client.delete(
        f"/api/v1/forecast/overrides/{oid}", headers=_csrf_headers(client)
    )
    assert r4.status_code == 204


def test_post_rejects_short_reason(monkeypatch, tmp_path):
    import pytest

    from backend.services.forecast import overrides

    store = tmp_path / "overrides.json"
    store.write_text("[]")
    monkeypatch.setattr(overrides, "STORE_PATH", store)

    client = _login_frank()
    if client is None:
        pytest.skip("frank user not seeded — run scripts/seed_auth.py")

    r = client.post(
        "/api/v1/forecast/overrides",
        json={
            "month": "2026-08",
            "cluster": None,
            "mode": "revenue",
            "actual": 1,
            "modelP50": 1,
            "source": "manual",
            "confidence": "low",
            "reason": "short",
        },
        headers=_csrf_headers(client),
    )
    assert r.status_code == 422, r.text  # pydantic min_length


def test_writes_require_auth(monkeypatch, tmp_path):
    """Bare TestClient (no login) must be rejected on POST/PATCH/DELETE."""
    from backend.services.forecast import overrides

    store = tmp_path / "overrides.json"
    store.write_text("[]")
    monkeypatch.setattr(overrides, "STORE_PATH", store)

    anon = TestClient(app)
    # CSRF token still set to avoid the CSRF gate masking the auth check.
    anon.cookies.set("pryzm_csrf", "test-csrf-token")
    csrf = {"x-csrf": "test-csrf-token"}

    payload = {
        "month": "2026-08",
        "cluster": None,
        "mode": "revenue",
        "actual": 100,
        "modelP50": 90,
        "source": "manual",
        "confidence": "low",
        "reason": "anon attempt should fail",
    }
    r = anon.post("/api/v1/forecast/overrides", json=payload, headers=csrf)
    assert r.status_code == 401, r.text

    r2 = anon.patch(
        "/api/v1/forecast/overrides/whatever",
        json={"actual": 1},
        headers=csrf,
    )
    assert r2.status_code == 401, r2.text

    r3 = anon.delete("/api/v1/forecast/overrides/whatever", headers=csrf)
    assert r3.status_code == 401, r3.text


def test_delete_unknown_returns_404(monkeypatch, tmp_path):
    import pytest

    from backend.services.forecast import overrides

    store = tmp_path / "overrides.json"
    store.write_text("[]")
    monkeypatch.setattr(overrides, "STORE_PATH", store)

    client = _login_frank()
    if client is None:
        pytest.skip("frank user not seeded — run scripts/seed_auth.py")

    r = client.delete(
        "/api/v1/forecast/overrides/does-not-exist", headers=_csrf_headers(client)
    )
    assert r.status_code == 404, r.text
