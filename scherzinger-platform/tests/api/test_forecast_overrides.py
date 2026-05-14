from fastapi.testclient import TestClient

from backend.main import app

# Bypass CSRF double-submit by attaching matching cookie + header on the client.
CSRF_TOKEN = "test-csrf-token"
client = TestClient(app, cookies={"pryzm_csrf": CSRF_TOKEN})
CSRF_HEADERS = {"x-csrf": CSRF_TOKEN}


def test_post_get_patch_delete_roundtrip(tmp_path, monkeypatch):
    from backend.services.forecast import overrides

    store = tmp_path / "overrides.json"
    store.write_text("[]")
    monkeypatch.setattr(overrides, "STORE_PATH", store)

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
        "/api/v1/forecast/overrides", json=payload, headers=CSRF_HEADERS
    )
    assert r.status_code == 201, r.text
    oid = r.json()["id"]

    r2 = client.get("/api/v1/forecast/overrides")
    assert r2.status_code == 200
    assert any(x["id"] == oid for x in r2.json()["items"])

    r3 = client.patch(
        f"/api/v1/forecast/overrides/{oid}",
        json={"actual": 660000},
        headers=CSRF_HEADERS,
    )
    assert r3.status_code == 200, r3.text
    assert r3.json()["actual"] == 660000

    r4 = client.delete(
        f"/api/v1/forecast/overrides/{oid}", headers=CSRF_HEADERS
    )
    assert r4.status_code == 204


def test_post_rejects_short_reason(monkeypatch, tmp_path):
    from backend.services.forecast import overrides

    store = tmp_path / "overrides.json"
    store.write_text("[]")
    monkeypatch.setattr(overrides, "STORE_PATH", store)

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
        headers=CSRF_HEADERS,
    )
    assert r.status_code == 422, r.text  # pydantic min_length
