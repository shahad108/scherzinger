"""Phase 7 — /api/v1/pricing/sku/{aid}/publish + /rollback + /price-book.

Exercises the publish workflow end-to-end through the FastAPI app.
Skips when psycopg2 isn't available or the DB is unreachable.
"""
from __future__ import annotations

from datetime import datetime, timedelta, timezone
from decimal import Decimal
from uuid import uuid4

import pytest
from fastapi.testclient import TestClient


pytest.importorskip("psycopg2")


def _csrf(client: TestClient) -> dict[str, str]:
    tok = client.cookies.get("pryzm_csrf")
    return {"x-csrf": tok} if tok else {}


def _aid() -> str:
    return f"PUBE-{uuid4().hex[:8].upper()}"


def test_publish_immediate_returns_receipt(client: TestClient) -> None:
    aid = _aid()
    res = client.post(
        f"/api/v1/pricing/sku/{aid}/publish",
        json={"price": "127.00"},
        headers=_csrf(client),
    )
    assert res.status_code == 201, res.text
    body = res.json()
    assert body["scheduled"] is False
    receipt = body["receipt"]
    assert receipt["aid"] == aid
    assert receipt["new_price_book_row_id"]
    assert receipt["published_at"]


def test_publish_scheduled_when_effective_at_future(client: TestClient) -> None:
    aid = _aid()
    future = (datetime.now(timezone.utc) + timedelta(days=3)).isoformat()
    res = client.post(
        f"/api/v1/pricing/sku/{aid}/publish",
        json={"price": "200.00", "effective_at": future},
        headers=_csrf(client),
    )
    assert res.status_code == 201, res.text
    body = res.json()
    assert body["scheduled"] is True
    sched = body["scheduled_publish"]
    assert sched["status"] == "pending"
    assert sched["aid"] == aid


def test_publish_then_rollback_within_window(client: TestClient) -> None:
    aid = _aid()
    # First publish to set a baseline price.
    res = client.post(
        f"/api/v1/pricing/sku/{aid}/publish",
        json={"price": "100.00"},
        headers=_csrf(client),
    )
    assert res.status_code == 201, res.text

    # Second publish — this is the receipt we'll roll back.
    res = client.post(
        f"/api/v1/pricing/sku/{aid}/publish",
        json={"price": "120.00"},
        headers=_csrf(client),
    )
    assert res.status_code == 201, res.text
    receipt_id = res.json()["receipt"]["id"]

    # Rollback.
    res = client.post(
        f"/api/v1/pricing/sku/{aid}/rollback",
        json={"receipt_id": receipt_id, "reason": "test rollback"},
        headers=_csrf(client),
    )
    assert res.status_code == 200, res.text
    body = res.json()
    assert body["receipt"]["rolled_back_at"] is not None
    assert body["receipt"]["rollback_reason"] == "test rollback"


def test_rollback_outside_window_returns_409(client: TestClient) -> None:
    aid = _aid()
    res = client.post(
        f"/api/v1/pricing/sku/{aid}/publish",
        json={"price": "55.00"},
        headers=_csrf(client),
    )
    assert res.status_code == 201, res.text
    receipt_id = res.json()["receipt"]["id"]

    # Backdate the receipt 80h via a direct DB write.
    from backend.database import SessionLocal
    from backend.models.pricing.publish import PublishReceiptRow

    with SessionLocal() as s:
        row = s.get(PublishReceiptRow, receipt_id)
        row.published_at = datetime.now(timezone.utc) - timedelta(hours=80)
        s.commit()

    res = client.post(
        f"/api/v1/pricing/sku/{aid}/rollback",
        json={"receipt_id": receipt_id, "reason": "too late"},
        headers=_csrf(client),
    )
    assert res.status_code == 409, res.text


def test_rollback_with_mismatched_aid_returns_400(client: TestClient) -> None:
    aid_a = _aid()
    res = client.post(
        f"/api/v1/pricing/sku/{aid_a}/publish",
        json={"price": "33.00"},
        headers=_csrf(client),
    )
    receipt_id = res.json()["receipt"]["id"]
    res = client.post(
        f"/api/v1/pricing/sku/OTHER-AID/rollback",
        json={"receipt_id": receipt_id, "reason": "wrong aid"},
        headers=_csrf(client),
    )
    assert res.status_code == 400, res.text


def test_get_price_book_returns_history(client: TestClient) -> None:
    aid = _aid()
    for p in ("10.00", "11.00", "12.00"):
        res = client.post(
            f"/api/v1/pricing/sku/{aid}/publish",
            json={"price": p},
            headers=_csrf(client),
        )
        assert res.status_code == 201

    res = client.get(f"/api/v1/pricing/sku/{aid}/price-book?limit=10")
    assert res.status_code == 200, res.text
    body = res.json()
    assert body["aid"] == aid
    assert len(body["rows"]) == 3
    # Most recent valid_from first.
    valid_froms = [r["valid_from"] for r in body["rows"]]
    assert valid_froms == sorted(valid_froms, reverse=True)
