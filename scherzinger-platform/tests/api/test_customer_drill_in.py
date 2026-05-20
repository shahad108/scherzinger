"""Phase 2 (Pricing Studio v3) — Customer Drill-in endpoint contract.

GET /api/v1/pricing/customer/{customer_id}/sku/{aid}/drill-in
"""
from __future__ import annotations

from decimal import Decimal
from unittest.mock import patch

import pytest
from fastapi.testclient import TestClient


URL = "/api/v1/pricing/customer/{cid}/sku/{aid}/drill-in"


def _stub_payload() -> dict:
    return {
        "customer": {"id": "C-1", "name": "Acme", "tier": "A"},
        "this_sku": {
            "aid": "X-1",
            "customer_id": "C-1",
            "last_paid": "5.00",
            "last_paid_at": "2026-04-01T00:00:00+00:00",
            "ltm_units": 1000,
            "ltm_eur": "5000.00",
            "churn_p": "0.10",
            "decline_p": "0.12",
            "risk_if_moved": None,
            "wallet_share_pct": "0.20",
            "paid_band": {"p10": "4.50", "p50": "5.00", "p90": "5.50"},
            "tier": "A",
        },
        "at_proposed": None,
        "wallet_top_skus": [
            {"aid": "X-1", "share_pct": "0.45", "ltm_eur": "5000.00"},
            {"aid": "X-2", "share_pct": "0.25", "ltm_eur": "2750.00"},
        ],
        "history_on_sku": [
            {"date": "2025-05-01T00:00:00+00:00", "price": "5.00",
             "units": 100, "won": True},
        ],
        "lineage_ref": "11111111-1111-1111-1111-111111111111",
    }


def test_drill_in_returns_full_shape(client: TestClient) -> None:
    with patch(
        "backend.services.pricing.customer_drill_in.build_drill_in",
        return_value=_stub_payload(),
    ):
        res = client.get(URL.format(cid="C-1", aid="X-1"))
    assert res.status_code == 200, res.text
    body = res.json()
    assert body["customer"]["id"] == "C-1"
    assert body["customer"]["tier"] == "A"
    assert "this_sku" in body
    assert body["this_sku"]["aid"] == "X-1"
    assert "wallet_top_skus" in body
    assert len(body["wallet_top_skus"]) >= 1
    assert "history_on_sku" in body
    assert "lineage_ref" in body
    # at_proposed omitted (null) when no proposed_price query param.
    assert body["at_proposed"] is None


def test_drill_in_with_proposed_price_includes_at_proposed(client: TestClient) -> None:
    payload = _stub_payload()
    payload["at_proposed"] = {
        "delta_vs_last_paid": "0.50",
        "delta_pct": "10.0000",
        "risk_if_moved": "0.32",
    }
    with patch(
        "backend.services.pricing.customer_drill_in.build_drill_in",
        return_value=payload,
    ):
        res = client.get(
            URL.format(cid="C-1", aid="X-1"),
            params={"proposed_price": "5.50"},
        )
    assert res.status_code == 200, res.text
    body = res.json()
    assert body["at_proposed"] is not None
    assert body["at_proposed"]["delta_pct"] == "10.0000"
    assert body["at_proposed"]["risk_if_moved"] == "0.32"


def test_drill_in_404_when_customer_missing(client: TestClient) -> None:
    with patch(
        "backend.services.pricing.customer_drill_in.build_drill_in",
        return_value=None,
    ):
        res = client.get(URL.format(cid="C-MISSING", aid="X-1"))
    assert res.status_code == 404


def test_drill_in_400_when_proposed_price_invalid(client: TestClient) -> None:
    res = client.get(
        URL.format(cid="C-1", aid="X-1"),
        params={"proposed_price": "not-a-number"},
    )
    assert res.status_code == 400


def test_drill_in_requires_auth() -> None:
    """A bare client (no login cookies) must be rejected."""
    from fastapi.testclient import TestClient
    from backend.main import app

    bare = TestClient(app)
    res = bare.get(URL.format(cid="C-1", aid="X-1"))
    assert res.status_code in (401, 403)
