"""Phase 3 (Pricing Studio v3) — Cost Trajectory Drawer endpoint contract.

GET /api/v1/pricing/sku/{aid}/cost-outlook?horizon_months=N
"""
from __future__ import annotations

from datetime import datetime, timezone
from decimal import Decimal
from unittest.mock import patch
from uuid import uuid4

import pytest
from fastapi.testclient import TestClient

from backend.models.pricing.lineage import LineageRef, LineageSourceKind
from backend.services.pricing import cost_outlook as co


URL = "/api/v1/pricing/sku/{aid}/cost-outlook"


def _stub_payload(aid: str = "A-1", horizon: int = 6) -> dict:
    lineage = LineageRef(
        id=uuid4(),
        source_kind=LineageSourceKind.COST_INGEST,
        source_id=f"cost_outlook:{aid}:{horizon}",
        sql=None,
        model="cost_outlook_v1",
        computed_at=datetime.now(timezone.utc),
        computed_by="system",
    )
    return {
        "aid": aid,
        "horizon_months": horizon,
        "today": {
            "unit_cost": "78.4000",
            "breakdown": {
                "material": "42.0000",
                "labor": "18.0000",
                "outsourcing": "11.0000",
                "overhead": "7.4000",
            },
        },
        "forecast": [
            {
                "month_offset": i,
                "p20_unit_cost": str(Decimal("78.40") - Decimal("0.5")),
                "p50_unit_cost": str(Decimal("78.40") + Decimal("0.3") * i),
                "p80_unit_cost": str(Decimal("78.40") + Decimal("1.0") * i),
            }
            for i in range(1, horizon + 1)
        ],
        "components": [
            {
                "name": "material",
                "today_value": "42.0000",
                "forecast_value": "46.0000",
                "change_pct": "9.52",
                "commodity_label": "Steel S355",
            },
        ],
        "floor_crosses_at": "2026-09",
        "commodity_trend": [{"commodity": "BKAGG", "monthly_yoy_pct": 2.7}],
        "lineage_ref": lineage.model_dump(mode="json"),
    }


@pytest.fixture(autouse=True)
def _clear_cache():
    co.invalidate_cache()
    yield
    co.invalidate_cache()


def test_cost_outlook_returns_full_shape(client: TestClient) -> None:
    with patch(
        "backend.services.pricing.cost_outlook.build_cost_outlook",
        return_value=_stub_payload(),
    ):
        res = client.get(URL.format(aid="A-1"))
    assert res.status_code == 200, res.text
    body = res.json()
    assert body["aid"] == "A-1"
    assert body["horizon_months"] == 6
    assert "today" in body and "unit_cost" in body["today"]
    assert "breakdown" in body["today"]
    assert len(body["forecast"]) == 6
    assert "components" in body
    assert "floor_crosses_at" in body
    assert "commodity_trend" in body
    assert "lineage_ref" in body


def test_cost_outlook_horizon_param_passes_through(client: TestClient) -> None:
    captured = {}

    def _capture(*, aid: str, horizon_months: int, db_session, **kw):
        captured["aid"] = aid
        captured["horizon_months"] = horizon_months
        return _stub_payload(aid=aid, horizon=horizon_months)

    with patch(
        "backend.services.pricing.cost_outlook.build_cost_outlook",
        side_effect=_capture,
    ):
        res = client.get(URL.format(aid="A-2"), params={"horizon_months": 3})
    assert res.status_code == 200
    assert captured["aid"] == "A-2"
    assert captured["horizon_months"] == 3
    assert len(res.json()["forecast"]) == 3


def test_cost_outlook_missing_state_returns_404(client: TestClient) -> None:
    """When no CostState row exists the endpoint must return 404 with a
    clear ``cost_state_missing`` error code."""
    def _raise(**kwargs):
        raise co.CostOutlookMissing(kwargs.get("aid"))

    with patch(
        "backend.services.pricing.cost_outlook.build_cost_outlook",
        side_effect=_raise,
    ):
        res = client.get(URL.format(aid="MISSING"))
    assert res.status_code == 404, res.text
    body = res.json()
    detail = body.get("detail")
    if isinstance(detail, dict):
        assert detail.get("code") == "cost_state_missing"


def test_cost_outlook_cache_idempotent_within_ttl(client: TestClient) -> None:
    """Two identical requests must produce identical bodies (60s TTL cache)."""
    payload = _stub_payload()
    with patch(
        "backend.services.pricing.cost_outlook.build_cost_outlook",
        return_value=payload,
    ):
        first = client.get(URL.format(aid="A-1"))
        second = client.get(URL.format(aid="A-1"))
    assert first.status_code == 200
    assert second.status_code == 200
    assert first.json() == second.json()


# ---------------------------------------------------------------------------
# Unit tests on build_cost_outlook itself (sans HTTP layer).
# ---------------------------------------------------------------------------


def test_build_cost_outlook_raises_when_cost_state_missing(monkeypatch) -> None:
    from unittest.mock import MagicMock

    db = MagicMock()
    res = MagicMock()
    res.scalar_one_or_none.return_value = None
    db.execute.return_value = res

    with pytest.raises(co.CostOutlookMissing):
        co.build_cost_outlook(aid="UNKNOWN", db_session=db, bypass_cache=True)
