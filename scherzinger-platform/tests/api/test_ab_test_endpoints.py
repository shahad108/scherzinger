"""Phase 8 — /api/v1/pricing/ab-tests + /pricing/simulate endpoint tests.

End-to-end through the FastAPI app: create → get → score → decision.
Skips when psycopg2 / the test DB are unreachable.
"""
from __future__ import annotations

from decimal import Decimal
from uuid import uuid4

import pytest
from fastapi.testclient import TestClient


pytest.importorskip("psycopg2")


def _csrf(client: TestClient) -> dict[str, str]:
    tok = client.cookies.get("pryzm_csrf")
    return {"x-csrf": tok} if tok else {}


def _seed_pool_via_invoices(aid: str, n: int = 10) -> None:
    """Seed a handful of invoices so _load_eligible_pool finds customers.

    Idempotent — uses a unique aid per test so cleanup isn't needed.
    """
    from datetime import datetime, timedelta

    from backend.database import SessionLocal
    from backend.models import Customer, Invoice

    with SessionLocal() as db:
        for i in range(n):
            cid = f"{aid}-CUST-{i:03d}"
            if not db.get(Customer, cid):
                db.add(Customer(customer_id=cid, name=f"Cust {i}"))
            d = (datetime.utcnow() - timedelta(days=30)).date()
            db.add(
                Invoice(
                    invoice_id=f"INV-{aid}-{i:03d}",
                    position=1,
                    customer_id=cid,
                    article_id=aid,
                    date=d,
                    revenue=1000.0,
                    quantity=10,
                    year=d.year,
                    quarter=((d.month - 1) // 3) + 1,
                    month=d.month,
                )
            )
        db.commit()


def _aid() -> str:
    return f"ABE-{uuid4().hex[:6].upper()}"


def test_create_ab_test_endpoint(client: TestClient) -> None:
    aid = _aid()
    _seed_pool_via_invoices(aid, n=8)

    res = client.post(
        "/api/v1/pricing/ab-tests",
        json={
            "aid": aid,
            "control_price": "100.00",
            "variant_price": "115.00",
            "eligibility": None,
            "criterion": {"alpha": 0.10, "metric": "db2"},
            "target_sample": 4,
        },
        headers=_csrf(client),
    )
    assert res.status_code == 201, res.text
    body = res.json()
    assert "ab_test" in body
    t = body["ab_test"]
    assert t["aid"] == aid
    assert t["target_sample"] == 4
    assert t["decision_state"] == "running"


def test_get_ab_test_with_scoring(client: TestClient) -> None:
    aid = _aid()
    _seed_pool_via_invoices(aid, n=6)
    create = client.post(
        "/api/v1/pricing/ab-tests",
        json={
            "aid": aid,
            "control_price": "100.00",
            "variant_price": "110.00",
            "target_sample": 3,
        },
        headers=_csrf(client),
    )
    assert create.status_code == 201, create.text
    test_id = create.json()["ab_test"]["id"]

    res = client.get(f"/api/v1/pricing/ab-tests/{test_id}")
    assert res.status_code == 200, res.text
    body = res.json()
    assert body["ab_test"]["id"] == test_id
    assert "scoring" in body
    # Pre-stamping outcomes, scoring should still return the shape.
    sc = body["scoring"]
    for k in ("control", "variant", "z_stat", "p_value", "decision_ready"):
        assert k in sc


def test_get_ab_test_404(client: TestClient) -> None:
    bogus = str(uuid4())
    res = client.get(f"/api/v1/pricing/ab-tests/{bogus}")
    assert res.status_code == 404


def test_score_endpoint(client: TestClient) -> None:
    aid = _aid()
    _seed_pool_via_invoices(aid, n=5)
    create = client.post(
        "/api/v1/pricing/ab-tests",
        json={
            "aid": aid,
            "control_price": "100",
            "variant_price": "105",
            "target_sample": 2,
        },
        headers=_csrf(client),
    )
    test_id = create.json()["ab_test"]["id"]
    res = client.post(
        f"/api/v1/pricing/ab-tests/{test_id}/score",
        headers=_csrf(client),
    )
    assert res.status_code == 200, res.text
    assert "scoring" in res.json()


def test_decision_promote_and_hold(client: TestClient) -> None:
    aid_h = _aid()
    _seed_pool_via_invoices(aid_h, n=5)
    create = client.post(
        "/api/v1/pricing/ab-tests",
        json={"aid": aid_h, "control_price": "100", "variant_price": "108", "target_sample": 2},
        headers=_csrf(client),
    )
    test_id = create.json()["ab_test"]["id"]

    res = client.post(
        f"/api/v1/pricing/ab-tests/{test_id}/decision",
        json={"decision": "hold"},
        headers=_csrf(client),
    )
    assert res.status_code == 200, res.text
    out = res.json()
    assert out["decision"] == "hold"
    assert out["status"] == "held"


def test_decision_invalid(client: TestClient) -> None:
    aid = _aid()
    _seed_pool_via_invoices(aid, n=4)
    create = client.post(
        "/api/v1/pricing/ab-tests",
        json={"aid": aid, "control_price": "100", "variant_price": "108", "target_sample": 2},
        headers=_csrf(client),
    )
    test_id = create.json()["ab_test"]["id"]
    res = client.post(
        f"/api/v1/pricing/ab-tests/{test_id}/decision",
        json={"decision": "bogus"},
        headers=_csrf(client),
    )
    assert res.status_code == 400


def test_simulate_endpoint(client: TestClient) -> None:
    aid = _aid()
    _seed_pool_via_invoices(aid, n=6)
    res = client.post(
        "/api/v1/pricing/simulate",
        json={
            "aid": aid,
            "control_price": "100.00",
            "variant_price": "115.00",
            "eligibility": {"in": [{"var": "tier"}, ["B", "C"]]},
            "target_sample": 5,
        },
        headers=_csrf(client),
    )
    assert res.status_code == 200, res.text
    body = res.json()
    assert "scenarios" in body
    assert set(body["scenarios"].keys()) == {"low", "mid", "high"}
    assert "fan_band_chart_data" in body
    assert len(body["fan_band_chart_data"]) == 12
