"""Phase 1 — recommendation composer tests."""
from __future__ import annotations

from datetime import datetime, timezone
from decimal import Decimal
from unittest.mock import MagicMock, patch
from uuid import uuid4

from backend.models.pricing.competitor import CompetitorRef
from backend.models.pricing.cost_state import CostBreakdown, CostState
from backend.models.pricing.elasticity import CurvePoint, WinProbCurve
from backend.models.pricing.lineage import LineageRef, LineageSourceKind
from backend.models.pricing.pricing_state import PriceState
from backend.models.pricing.recommendation import (
    ConfidenceLevel,
    DriverKind,
)
from backend.models.pricing.wtp import WtpBand
from backend.services.pricing import recommendation as rec


def _lineage() -> LineageRef:
    return LineageRef(
        id=uuid4(),
        source_kind=LineageSourceKind.WON_DEAL_SAMPLE,
        source_id="test",
        sql=None,
        model=None,
        computed_at=datetime.now(timezone.utc),
        computed_by="test",
    )


def _cost(unit_cost: float = 70.0) -> CostState:
    return CostState(
        aid="X-1",
        unit_cost=Decimal(str(unit_cost)),
        breakdown=CostBreakdown(),
        last_ingested_at=datetime.now(timezone.utc),
        lineage_ref=_lineage(),
    )


def _price(current: float = 100.0, floor: float = 80.0, ceiling: float = 130.0) -> PriceState:
    return PriceState(
        aid="X-1",
        current_price=Decimal(str(current)),
        currency="EUR",
        floor=Decimal(str(floor)),
        ceiling=Decimal(str(ceiling)),
        list_price=Decimal(str(current * 1.2)),
        last_set_by="system",
        last_set_at=datetime.now(timezone.utc),
        lineage_ref=_lineage(),
    )


def _wtp(p10: float = 95.0, p50: float = 110.0, p90: float = 125.0, n: int = 20) -> WtpBand:
    return WtpBand(
        aid="X-1",
        tier="A",
        p10=Decimal(str(p10)),
        p50=Decimal(str(p50)),
        p90=Decimal(str(p90)),
        n_deals=n,
        window_days=540,
        confidence=ConfidenceLevel.HIGH,
        lineage_ref=_lineage(),
    )


def _competitor(median: float = 105.0, n: int = 9) -> CompetitorRef:
    return CompetitorRef(
        aid="X-1",
        median_price=Decimal(str(median)),
        sample_count=n,
        last_seen=datetime.now(timezone.utc),
        window_days=90,
        lineage_ref=_lineage(),
    )


def _curve() -> WinProbCurve:
    """20-point monotonically decreasing curve from floor → ceiling."""
    points: list[CurvePoint] = []
    floor_f, ceiling_f = 80.0, 130.0
    for i in range(20):
        p = floor_f + (ceiling_f - floor_f) * i / 19.0
        # Decreasing win-prob as price rises.
        wp = max(0.05, min(0.95, 1.0 - (p - floor_f) / (ceiling_f - floor_f) * 0.9))
        points.append(
            CurvePoint(
                price=Decimal(str(round(p, 2))),
                win_prob=Decimal(str(round(wp, 4))),
                lower_ci=Decimal(str(round(max(0.0, wp - 0.05), 4))),
                upper_ci=Decimal(str(round(min(1.0, wp + 0.05), 4))),
            )
        )
    return WinProbCurve(
        aid="X-1",
        tier="A",
        points=points,
        n_deals=40,
        confidence_band="asymptotic",
        lineage_ref=_lineage(),
    )


def test_drivers_sum_to_one() -> None:
    session = MagicMock()
    with patch.object(rec, "_load_cost", return_value=_cost()), patch.object(
        rec, "_load_price", return_value=_price()
    ), patch.object(rec, "_load_wtp", return_value=_wtp()), patch.object(
        rec, "_load_competitor", return_value=_competitor()
    ), patch.object(
        rec, "_load_curve", return_value=_curve()
    ), patch.object(
        rec, "_persist_lineage", return_value=_lineage()
    ):
        r = rec.build_recommendation(aid="X-1", tier="A", db_session=session)

    assert r is not None
    total = sum((d.contribution_pct for d in r.drivers), Decimal("0"))
    # Sum to 1.0 ±0.01 (drivers are 0..1 fractions).
    assert abs(total - Decimal("1")) <= Decimal("0.01"), f"drivers sum = {total}"


def test_recommended_price_within_band() -> None:
    session = MagicMock()
    with patch.object(rec, "_load_cost", return_value=_cost()), patch.object(
        rec, "_load_price", return_value=_price()
    ), patch.object(rec, "_load_wtp", return_value=_wtp()), patch.object(
        rec, "_load_competitor", return_value=_competitor()
    ), patch.object(
        rec, "_load_curve", return_value=_curve()
    ), patch.object(
        rec, "_persist_lineage", return_value=_lineage()
    ):
        r = rec.build_recommendation(aid="X-1", tier="A", db_session=session)

    assert r is not None
    assert r.band.min <= r.recommended_price <= r.band.max
    assert r.band.target == r.recommended_price


def test_all_inputs_none_returns_fallback_low_confidence() -> None:
    session = MagicMock()
    with patch.object(rec, "_load_cost", return_value=None), patch.object(
        rec, "_load_price", return_value=None
    ), patch.object(rec, "_load_wtp", return_value=None), patch.object(
        rec, "_load_competitor", return_value=None
    ), patch.object(
        rec, "_load_curve", return_value=None
    ), patch.object(
        rec, "_persist_lineage", return_value=_lineage()
    ):
        r = rec.build_recommendation(aid="X-1", tier=None, db_session=session)

    assert r is not None
    assert r.confidence_level == ConfidenceLevel.LOW
    # Must NOT silently return zero — fallback price > 0 and rationale notes the gap.
    assert r.recommended_price > Decimal("0")
    assert "fallback" in r.rationale_md.lower() or "missing" in r.rationale_md.lower()


def test_driver_kinds_phase_1_set() -> None:
    session = MagicMock()
    with patch.object(rec, "_load_cost", return_value=_cost()), patch.object(
        rec, "_load_price", return_value=_price()
    ), patch.object(rec, "_load_wtp", return_value=_wtp()), patch.object(
        rec, "_load_competitor", return_value=_competitor()
    ), patch.object(
        rec, "_load_curve", return_value=_curve()
    ), patch.object(
        rec, "_persist_lineage", return_value=_lineage()
    ):
        r = rec.build_recommendation(aid="X-1", tier="A", db_session=session)
    kinds = {d.kind for d in r.drivers}
    # All five Phase 1 kinds are present.
    assert DriverKind.COST_TRAJECTORY in kinds
    assert DriverKind.COMPETITOR_SIGNAL in kinds
    assert DriverKind.CUSTOMER_MIX in kinds
    assert DriverKind.WIN_PROB_OPTIMUM in kinds
    assert DriverKind.FLOOR_PROTECTION in kinds


def test_recompute_exists_and_emits_event(monkeypatch) -> None:
    """The live-wiring hook must publish ``pricing.recommendation_updated``
    with the new payload + aid.

    Wiring into the real cost-ingest service is a follow-on commit (see
    TODO in ``services/cost_service.py``); this test pins the contract.
    """
    captured: dict = {}

    def fake_publish_sync(topic, payload, *, aid=None, cluster=None):
        captured["topic"] = topic
        captured["payload"] = payload
        captured["aid"] = aid

    # The function imports publish_sync lazily, so patch the events
    # module directly.
    from backend.services import events as ev_mod

    monkeypatch.setattr(ev_mod, "publish_sync", fake_publish_sync)

    # Stub SessionLocal + the build_recommendation call so recompute
    # doesn't reach the DB.
    fake_rec = MagicMock()
    fake_rec.model_dump.return_value = {"aid": "X-1", "recommended_price": "100.00"}

    class _SessionCM:
        def __enter__(self):
            return MagicMock()

        def __exit__(self, *a):
            return False

    monkeypatch.setattr(rec, "SessionLocal", lambda: _SessionCM())
    monkeypatch.setattr(rec, "build_recommendation", lambda **kwargs: fake_rec)

    result = rec.recompute("X-1", tier="A")
    assert result is fake_rec
    assert captured.get("topic") == "pricing.recommendation_updated"
    assert captured.get("aid") == "X-1"
    assert captured.get("payload") == {
        "aid": "X-1",
        "recommended_price": "100.00",
    }


def test_lineage_ref_attached() -> None:
    session = MagicMock()
    with patch.object(rec, "_load_cost", return_value=_cost()), patch.object(
        rec, "_load_price", return_value=_price()
    ), patch.object(rec, "_load_wtp", return_value=_wtp()), patch.object(
        rec, "_load_competitor", return_value=_competitor()
    ), patch.object(
        rec, "_load_curve", return_value=_curve()
    ), patch.object(
        rec, "_persist_lineage", return_value=_lineage()
    ):
        r = rec.build_recommendation(aid="X-1", tier="A", db_session=session)
    assert r.lineage_ref is not None
    for d in r.drivers:
        assert d.lineage_ref is not None
