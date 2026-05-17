"""Phase 3 (Pricing Studio v3) — option_margin composer service tests.

Each PriceOption (Hold / Floor / Market / Custom / Recommendation) must
produce a monotone-down waterfall (list ≥ quoted ≥ booked ≥ invoiced ≥ 0)
with ``db2 = invoiced - unit_cost`` and per-step leakage summing to
(list − db2). All arithmetic is Decimal end-to-end.
"""
from __future__ import annotations

from datetime import datetime, timezone
from decimal import Decimal
from unittest.mock import MagicMock, patch
from uuid import uuid4

import pytest

from backend.models.pricing.lineage import LineageRef, LineageSourceKind
from backend.models.pricing.option_margin import OptionMargin
from backend.services.pricing import option_margin as om


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


@pytest.fixture
def fake_db():
    """A MagicMock Session — the real composer never touches it directly
    in this suite because we monkey-patch the loaders."""
    return MagicMock()


@pytest.fixture(autouse=True)
def _patch_persist(monkeypatch):
    """Skip the lineage table write — the suite asserts a lineage_ref is
    returned without exercising the real INSERT."""
    monkeypatch.setattr(om, "_persist_lineage", lambda **kwargs: _lineage())
    yield


# ---------------------------------------------------------------------------
# Waterfall math — single option
# ---------------------------------------------------------------------------


def test_build_option_margin_hold_produces_monotone_waterfall(fake_db) -> None:
    result = om.build_option_margin(
        aid="A-1",
        option_id="hold",
        price=Decimal("100.00"),
        db_session=fake_db,
        unit_cost=Decimal("60.00"),
        ratios=(Decimal("0.88"), Decimal("0.9091"), Decimal("0.95")),
    )
    assert isinstance(result, OptionMargin)
    assert result.option_id == "hold"
    assert result.price == Decimal("100.0000")
    assert result.list == Decimal("100.0000")
    # Step values must descend.
    assert result.list >= result.quoted >= result.booked >= result.invoiced >= 0
    # db2 = invoiced - unit_cost.
    assert result.db2 == (result.invoiced - Decimal("60.00")).quantize(
        Decimal("0.0001")
    )
    # 4 leakage values, one per transition.
    assert len(result.leakage_per_step_pct) == 4
    # Lineage attached.
    assert result.lineage_ref is not None


def test_build_option_margin_floor_below_cost_clamps_db2_to_zero(fake_db) -> None:
    """When invoiced < unit_cost (loss territory) db2 must clamp to 0, not negative."""
    result = om.build_option_margin(
        aid="A-1",
        option_id="floor",
        price=Decimal("20.00"),
        db_session=fake_db,
        unit_cost=Decimal("60.00"),
        ratios=(Decimal("0.88"), Decimal("0.9091"), Decimal("0.95")),
    )
    assert result.db2 == Decimal("0.0000")


def test_build_option_margin_decimal_end_to_end(fake_db) -> None:
    result = om.build_option_margin(
        aid="A-1",
        option_id="recommendation",
        price=Decimal("127.00"),
        db_session=fake_db,
        unit_cost=Decimal("70.00"),
        ratios=(Decimal("0.88"), Decimal("0.9091"), Decimal("0.95")),
    )
    for v in (result.list, result.quoted, result.booked, result.invoiced, result.db2):
        assert isinstance(v, Decimal), type(v)
    for pct in result.leakage_per_step_pct:
        assert isinstance(pct, Decimal)


def test_leakage_sum_matches_list_minus_db2(fake_db) -> None:
    """leakage_per_step_pct expressed as % of list — sum × list / 100 should equal list − db2."""
    result = om.build_option_margin(
        aid="A-1",
        option_id="market",
        price=Decimal("80.00"),
        db_session=fake_db,
        unit_cost=Decimal("40.00"),
        ratios=(Decimal("0.88"), Decimal("0.9091"), Decimal("0.95")),
    )
    total_leak_pct = sum(result.leakage_per_step_pct, Decimal("0"))
    expected_total_pct = (
        (result.list - result.db2) / result.list * Decimal("100")
    ).quantize(Decimal("0.01"))
    # Allow 0.05 pp tolerance for the four-way rounding noise.
    assert abs(total_leak_pct - expected_total_pct) <= Decimal("0.05")


# ---------------------------------------------------------------------------
# Fanout — all five canonical options at once.
# ---------------------------------------------------------------------------


def test_build_option_margins_fanout_emits_known_options(monkeypatch) -> None:
    """build_option_margins should compute Hold / Floor / Market / Recommendation
    when PriceState + CostState are present."""
    from backend.models.pricing.cost_state import CostStateRow
    from backend.models.pricing.pricing_state import PriceStateRow

    # Build a fake DB that returns canned PriceState + CostState rows.
    price = PriceStateRow()
    price.aid = "A-1"
    price.current_price = Decimal("100.00")
    price.list_price = Decimal("110.00")
    price.floor = Decimal("70.00")
    price.ceiling = None
    price.currency = "EUR"

    cost = CostStateRow()
    cost.aid = "A-1"
    cost.unit_cost = Decimal("60.00")
    cost.breakdown = {}

    class FakeDB:
        def __init__(self):
            self._calls = 0
            self._cluster_query = False

        def execute(self, stmt, params=None):
            text = str(stmt)
            res = MagicMock()
            if "FROM price_state" in text or "price_state" in text:
                scalar_res = MagicMock()
                scalar_res.scalar_one_or_none.return_value = price
                return scalar_res
            if "FROM cost_state" in text or "cost_state" in text:
                scalar_res = MagicMock()
                scalar_res.scalar_one_or_none.return_value = cost
                return scalar_res
            if "commodity_group" in text:
                res.fetchone.return_value = ("BKAGG",)
                return res
            res.fetchone.return_value = None
            res.fetchall.return_value = []
            return res

    fake_db = FakeDB()
    # Stub the cluster ratios to avoid invoking the real cluster query.
    monkeypatch.setattr(
        om,
        "_extract_cluster_ratios",
        lambda **kwargs: (Decimal("0.88"), Decimal("0.9091"), Decimal("0.95")),
    )

    results = om.build_option_margins(
        aid="A-1",
        db_session=fake_db,
        recommended_price=Decimal("105.00"),
    )
    option_ids = [r.option_id for r in results]
    assert "hold" in option_ids
    assert "floor" in option_ids
    assert "market" in option_ids
    assert "recommendation" in option_ids
    # No custom price requested → option absent.
    assert "custom" not in option_ids


def test_build_option_margin_accepts_float_string_for_price(fake_db) -> None:
    """Defensive: composer should coerce non-Decimal inputs without crashing."""
    result = om.build_option_margin(
        aid="A-1",
        option_id="custom",
        price="42.50",  # type: ignore[arg-type]
        db_session=fake_db,
        unit_cost=Decimal("30.00"),
        ratios=(Decimal("0.88"), Decimal("0.9091"), Decimal("0.95")),
    )
    assert result.price == Decimal("42.5000")


def test_extract_cluster_ratios_falls_back_to_seed_on_failure(monkeypatch, fake_db) -> None:
    def _boom(*args, **kwargs):
        raise RuntimeError("ledger down")

    monkeypatch.setattr(om, "build_pocket_waterfall_from_db", _boom)
    monkeypatch.setattr(om, "_load_cluster", lambda **kwargs: "BKAGG")

    ratios = om._extract_cluster_ratios(aid="A-1", db_session=fake_db)
    assert ratios == (
        om._SEED_QUOTED_OVER_LIST,
        om._SEED_BOOKED_OVER_QUOTED,
        om._SEED_INVOICED_OVER_BOOKED,
    )
