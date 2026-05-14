"""Phase 3 shell mutation tests.

Covers mark-read, list with pagination, and section CRUD (incl. CSRF
double-submit which the auth tests already prove globally).
"""
from __future__ import annotations

from fastapi.testclient import TestClient


def _csrf_headers(client: TestClient) -> dict[str, str]:
    csrf = client.cookies.get("pryzm_csrf")
    assert csrf, "expected pryzm_csrf cookie after login"
    return {"x-csrf": csrf}


def test_list_notifications(client: TestClient) -> None:
    res = client.get("/api/v1/notifications")
    assert res.status_code == 200
    body = res.json()
    assert "notifications" in body
    assert "next_cursor" in body
    assert isinstance(body["notifications"], list)
    assert len(body["notifications"]) >= 1


def test_mark_notification_read_flips_unread(client: TestClient) -> None:
    # Reset 'pro' to unread so this test is idempotent across runs against
    # a persistent Postgres dev DB.
    from backend.database import SessionLocal
    from backend.models import Notification, User

    with SessionLocal() as db:
        user = db.query(User).filter_by(email="frank@scherzinger.de").one()
        n = (
            db.query(Notification)
            .filter_by(user_id=user.id, external_id="pro")
            .one()
        )
        n.unread = True
        db.commit()

    initial = client.get("/api/v1/screens/shell").json()
    pro = next(n for n in initial["notifications"] if n["id"] == "pro")
    assert pro["unread"] is True

    res = client.post("/api/v1/notifications/pro/read", headers=_csrf_headers(client))
    assert res.status_code == 200, res.text

    after = client.get("/api/v1/screens/shell").json()
    pro_after = next(n for n in after["notifications"] if n["id"] == "pro")
    assert pro_after["unread"] is False


def test_mark_unknown_notification_404(client: TestClient) -> None:
    res = client.post(
        "/api/v1/notifications/does-not-exist/read", headers=_csrf_headers(client)
    )
    assert res.status_code == 404


def test_section_crud(client: TestClient) -> None:
    # Create
    res = client.post(
        "/api/v1/sections",
        json={"title": "Test section", "sub": "test sub", "href": "#test"},
        headers=_csrf_headers(client),
    )
    assert res.status_code == 201, res.text
    section_id = res.json()["id"]

    # List includes it
    listed = client.get("/api/v1/sections").json()
    assert any(s["id"] == section_id for s in listed)

    # Patch
    patch = client.patch(
        f"/api/v1/sections/{section_id}",
        json={"title": "Renamed", "sub": None, "href": "#renamed"},
        headers=_csrf_headers(client),
    )
    assert patch.status_code == 200
    assert patch.json()["title"] == "Renamed"

    # Delete
    deleted = client.delete(f"/api/v1/sections/{section_id}", headers=_csrf_headers(client))
    assert deleted.status_code == 200

    # Gone from list
    listed2 = client.get("/api/v1/sections").json()
    assert not any(s["id"] == section_id for s in listed2)


def test_section_rejects_external_href(client: TestClient) -> None:
    res = client.post(
        "/api/v1/sections",
        json={"title": "Bad", "href": "https://evil.example/"},
        headers=_csrf_headers(client),
    )
    assert res.status_code == 400


def test_panels_endpoint(client: TestClient) -> None:
    """The seeded panel id is fixed; we look it up via /shell which already
    exposed the panel's reviewers, then load /panels/{id}/reviewers explicitly."""
    from uuid import UUID
    PANEL_ID = UUID("00000000-0000-0000-0000-0000000000a1")
    res = client.get(f"/api/v1/panels/{PANEL_ID}/reviewers")
    assert res.status_code == 200
    body = res.json()
    assert body["panel_id"] == str(PANEL_ID)
    # Live DB may carry additional reviewers beyond the 4 seeded ones; the
    # contract is that the panel has *at least* the seeded membership.
    assert len(body["people"]) >= 4
