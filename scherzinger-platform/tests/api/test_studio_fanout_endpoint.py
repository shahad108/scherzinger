"""Phase 2 (Pricing Studio v3) — POST /screens/studio/fanout endpoint.

Acceptance:
  - re-scored rows returned for (aid, proposed_price)
  - response p50 < 500ms (composer is cached and exercised under stubs here)
  - same (aid, proposed_price) → cache hit (idempotent)
"""
from __future__ import annotations

import time
from datetime import datetime, timezone
from decimal import Decimal
from unittest.mock import patch
from uuid import uuid4

import pytest
from fastapi.testclient import TestClient

from backend.models.pricing.customer_on_sku import (
    CustomerOnSku,
    CustomerTier,
    PaidBand,
)
from backend.models.pricing.lineage import LineageRef, LineageSourceKind
from backend.services.pricing import customer_fanout as cf


URL = "/api/v1/screens/studio/fanout"


def _csrf(client: TestClient) -> dict[str, str]:
    """Mint the x-csrf header from the cookie set on login."""
    tok = client.cookies.get("pryzm_csrf")
    return {"x-csrf": tok} if tok else {}


def _lineage() -> LineageRef:
    return LineageRef(
        id=uuid4(),
        source_kind=LineageSourceKind.INVOICE_LEDGER,
        source_id="t",
        sql=None,
        model=None,
        computed_at=datetime.now(timezone.utc),
        computed_by="test",
    )


def _cos(cid: str, risk: Decimal | None) -> CustomerOnSku:
    return CustomerOnSku(
        aid="X-1",
        customer_id=cid,
        last_paid=Decimal("5.00"),
        last_paid_at=datetime.now(timezone.utc),
        ltm_units=100,
        ltm_eur=Decimal("500.00"),
        churn_p=Decimal("0.10"),
        decline_p=Decimal("0.10"),
        risk_if_moved=risk,
        wallet_share_pct=Decimal("0.20"),
        paid_band=PaidBand(p10=Decimal("4.5"), p50=Decimal("5"), p90=Decimal("5.5")),
        tier=CustomerTier.A,
        lineage_ref=_lineage(),
    )


@pytest.fixture(autouse=True)
def _clear_cache():
    cf.invalidate_cache()
    yield
    cf.invalidate_cache()


def test_fanout_endpoint_returns_re_scored_rows(client: TestClient) -> None:
    with patch.object(cf, "_load_customer_ids_for_aid", return_value=["C-1", "C-2"]), \
         patch.object(cf, "_load_active_proposals_for_aid", return_value=set()), \
         patch.object(cf, "build_customer_on_sku",
                      side_effect=lambda **kw: _cos(kw["customer_id"], Decimal("0.20"))):
        res = client.post(
            URL,
            json={"aid": "X-1", "proposed_price": "5.50"},
            headers=_csrf(client),
        )
    assert res.status_code == 200, res.text
    body = res.json()
    assert body["aid"] == "X-1"
    assert body["proposed_price"] == "5.50"
    assert len(body["rows"]) == 2
    assert body["rows"][0]["tone"] == "warn"


def test_fanout_endpoint_caches_idempotent(client: TestClient) -> None:
    """Same (aid, proposed_price) returns the cached payload — second
    call must NOT re-invoke the heavy composer."""
    call_count = {"n": 0}

    def _build(**kwargs):
        call_count["n"] += 1
        return _cos(kwargs["customer_id"], Decimal("0.05"))

    with patch.object(cf, "_load_customer_ids_for_aid", return_value=["C-1"]), \
         patch.object(cf, "_load_active_proposals_for_aid", return_value=set()), \
         patch.object(cf, "build_customer_on_sku", side_effect=_build):
        headers = _csrf(client)
        r1 = client.post(URL, json={"aid": "X-1", "proposed_price": "5.00"}, headers=headers)
        r2 = client.post(URL, json={"aid": "X-1", "proposed_price": "5.00"}, headers=headers)
    assert r1.status_code == 200
    assert r2.status_code == 200
    assert r1.json() == r2.json()
    # First call built; second served from cache.
    assert call_count["n"] == 1


def test_fanout_endpoint_p50_under_500ms(client: TestClient) -> None:
    """Spec acceptance: p50 response time < 500ms (in stub-mode here)."""
    timings: list[float] = []
    with patch.object(cf, "_load_customer_ids_for_aid", return_value=["C-1", "C-2", "C-3"]), \
         patch.object(cf, "_load_active_proposals_for_aid", return_value=set()), \
         patch.object(cf, "build_customer_on_sku",
                      side_effect=lambda **kw: _cos(kw["customer_id"], Decimal("0.05"))):
        for i in range(5):
            cf.invalidate_cache()
            t0 = time.perf_counter()
            res = client.post(
                URL,
                json={"aid": "X-1", "proposed_price": f"5.{i:02d}"},
                headers=_csrf(client),
            )
            timings.append(time.perf_counter() - t0)
            assert res.status_code == 200
    timings.sort()
    p50 = timings[len(timings) // 2]
    assert p50 < 0.5, f"p50 {p50:.3f}s exceeds 500ms budget"


def test_fanout_endpoint_requires_auth() -> None:
    """A bare client (no login cookies) must be rejected."""
    from fastapi.testclient import TestClient
    from backend.main import app

    bare = TestClient(app)
    res = bare.post(URL, json={"aid": "X-1", "proposed_price": "5.00"})
    assert res.status_code in (401, 403)
