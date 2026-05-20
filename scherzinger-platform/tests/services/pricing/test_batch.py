"""Phase 6 — batch composer (build_batch_preview / commit_batch) tests."""
from __future__ import annotations

from datetime import datetime, timezone
from decimal import Decimal
from unittest.mock import MagicMock
from uuid import uuid4

import pytest

from backend.services.pricing import batch as batch_mod
from backend.services.pricing.batch import (
    FloorPlusRule,
    PctMoveRule,
    ScopeFilter,
)


@pytest.fixture(autouse=True)
def _reset_rules_cache():
    from backend.services.pricing.approval_rules import reset_cache_for_tests

    reset_cache_for_tests()
    yield
    reset_cache_for_tests()


def _stub_inputs_loader(monkeypatch, *, aid_map: dict[str, "batch_mod._SkuInputs"]):
    """Replace ``_load_inputs`` with a closure that serves from ``aid_map``."""

    def _fake_loader(*, aid: str, db_session):  # noqa: ARG001
        return aid_map.get(
            aid,
            batch_mod._SkuInputs(
                aid=aid,
                current_price=Decimal("100"),
                floor=Decimal("80"),
                ceiling=Decimal("140"),
                unit_cost=Decimal("70"),
            ),
        )

    monkeypatch.setattr(batch_mod, "_load_inputs", _fake_loader)


def _stub_scope_includes(monkeypatch, *, always: bool = True):
    monkeypatch.setattr(
        batch_mod,
        "_scope_includes",
        lambda *, aid, scope, db_session: always,
    )


def _stub_project_db2(monkeypatch, *, value=Decimal("12.34")):
    monkeypatch.setattr(
        batch_mod, "_project_db2", lambda **kw: value
    )


def _stub_curve_load(monkeypatch):
    """Skip the elasticity curve call inside preview composition."""
    from backend.models.pricing.elasticity import CurvePoint, WinProbCurve

    points = [
        CurvePoint(
            price=Decimal("100"),
            win_prob=Decimal("0.7"),
            lower_ci=Decimal("0.6"),
            upper_ci=Decimal("0.8"),
        )
    ]
    from backend.services.pricing import elasticity as elasticity_mod

    def _fake_curve(**_kw):
        return WinProbCurve(
            aid=_kw.get("aid", "X"),
            tier=None,
            points=points,
            n_deals=10,
            confidence_band="asymptotic",
            lineage_ref=None,
        )

    monkeypatch.setattr(elasticity_mod, "build_win_prob_curve", _fake_curve)


def _stub_lineage(monkeypatch):
    """Skip the create_lineage DB write — return a stub row with an id."""

    def _fake_create(*, source_kind, source_id, sql, model, computed_by, session):
        stub = MagicMock()
        stub.id = uuid4()
        return stub

    monkeypatch.setattr(batch_mod, "create_lineage", _fake_create)


def _stub_session():
    """Minimal Session-like object that captures add() / flush() calls."""

    class FakeSession:
        def __init__(self):
            self.added = []
            self.flushed = 0

        def add(self, obj):
            self.added.append(obj)

        def flush(self):
            self.flushed += 1

        def get(self, *_a, **_kw):
            return None

        def query(self, *_a, **_kw):
            return MagicMock()

        def execute(self, *_a, **_kw):
            res = MagicMock()
            res.fetchone.return_value = None
            res.fetchall.return_value = []
            return res

    return FakeSession()


# ---------------------------------------------------------------------------
# build_batch_preview
# ---------------------------------------------------------------------------


def test_build_preview_returns_one_item_per_aid(monkeypatch) -> None:
    _stub_scope_includes(monkeypatch)
    _stub_inputs_loader(monkeypatch, aid_map={})
    _stub_project_db2(monkeypatch)
    _stub_curve_load(monkeypatch)
    _stub_lineage(monkeypatch)
    session = _stub_session()

    rule = PctMoveRule(pct=Decimal("5"))
    batch, items = batch_mod.build_batch_preview(
        aids=["A-1", "A-2", "A-3"],
        rule=rule,
        scope_filter=ScopeFilter(),
        db_session=session,
        actor="frank",
    )
    assert len(items) == 3
    for item in items:
        # +5% on 100 → 105
        assert Decimal(str(item.after_price)) == Decimal("105.0000")
        assert item.status == "queued"
        assert item.per_sku_lineage_ref is not None


def test_build_preview_respects_scope_filter(monkeypatch) -> None:
    """When _scope_includes returns False for an AID, it's dropped."""
    _stub_inputs_loader(monkeypatch, aid_map={})
    _stub_project_db2(monkeypatch)
    _stub_curve_load(monkeypatch)
    _stub_lineage(monkeypatch)

    keep = {"A-2"}

    def _fake_scope(*, aid, scope, db_session):  # noqa: ARG001
        return aid in keep

    monkeypatch.setattr(batch_mod, "_scope_includes", _fake_scope)

    session = _stub_session()
    rule = PctMoveRule(pct=Decimal("5"))
    _batch, items = batch_mod.build_batch_preview(
        aids=["A-1", "A-2", "A-3"],
        rule=rule,
        scope_filter=ScopeFilter(min_ltm_units=100),
        db_session=session,
        actor="frank",
    )
    assert [item.aid for item in items] == ["A-2"]


def test_build_preview_persists_rule_and_scope_filter(monkeypatch) -> None:
    _stub_scope_includes(monkeypatch)
    _stub_inputs_loader(monkeypatch, aid_map={})
    _stub_project_db2(monkeypatch)
    _stub_curve_load(monkeypatch)
    _stub_lineage(monkeypatch)
    session = _stub_session()

    rule = FloorPlusRule(margin_pp=Decimal("12"))
    scope = ScopeFilter(tier=["A", "B"])
    batch, _items = batch_mod.build_batch_preview(
        aids=["A-1"],
        rule=rule,
        scope_filter=scope,
        db_session=session,
        actor="frank",
    )
    assert batch.rule_json["kind"] == "floor_plus"
    # Pydantic .model_dump(mode="json") stringifies Decimals.
    assert Decimal(str(batch.rule_json["margin_pp"])) == Decimal("12")
    assert batch.scope_filter_json["tier"] == ["A", "B"]


def test_build_preview_writes_approval_route_on_each_item(monkeypatch) -> None:
    _stub_scope_includes(monkeypatch)
    _stub_inputs_loader(monkeypatch, aid_map={})
    _stub_project_db2(monkeypatch)
    _stub_curve_load(monkeypatch)
    _stub_lineage(monkeypatch)
    session = _stub_session()

    # +10% triggers delta-over-5pct → routes to "md".
    rule = PctMoveRule(pct=Decimal("10"))
    _batch, items = batch_mod.build_batch_preview(
        aids=["A-1"],
        rule=rule,
        scope_filter=ScopeFilter(),
        db_session=session,
        actor="frank",
    )
    preview = items[0].preview_json
    assert "md" in preview["approval_route"]


# ---------------------------------------------------------------------------
# Approval routing summary in serializer
# ---------------------------------------------------------------------------


def test_serialize_batch_emits_approval_routing_summary() -> None:
    from backend.models.pricing.batch import PricingBatch, PricingBatchItem

    batch = PricingBatch(
        id=uuid4(),
        created_by="frank",
        rule_json={"kind": "pct_move", "pct": "5"},
        scope_filter_json={},
        status="preview",
    )
    items = [
        PricingBatchItem(
            id=uuid4(),
            batch_id=batch.id,
            aid=f"A-{i}",
            before_price=Decimal("100"),
            after_price=Decimal("105"),
            status="queued",
            preview_json={
                "approval_route": ["md"] if i % 2 == 0 else [],
                "auto_approve": (i % 2 == 1),
                "block": False,
            },
        )
        for i in range(4)
    ]
    payload = batch_mod.serialize_batch(batch, items)
    summary = payload["approval_routing_summary"]
    assert summary["md"] == 2
    assert summary["auto_approve"] == 2
    assert summary["block"] == 0


def test_serialize_batch_kpi_summary_aggregates() -> None:
    from backend.models.pricing.batch import PricingBatch, PricingBatchItem

    batch = PricingBatch(
        id=uuid4(),
        created_by="frank",
        rule_json={"kind": "pct_move", "pct": "5"},
        scope_filter_json={},
        status="preview",
    )
    items = [
        PricingBatchItem(
            id=uuid4(),
            batch_id=batch.id,
            aid=f"A-{i}",
            before_price=Decimal("100"),
            after_price=Decimal("105"),
            status="queued",
            preview_json={
                "projected_db2": "10.00",
                "win_prob_at_new": "0.7",
            },
        )
        for i in range(3)
    ]
    payload = batch_mod.serialize_batch(batch, items)
    kpi = payload["kpi_summary"]
    assert kpi["count"] == 3
    # 3 × (105 - 100) = 15
    assert Decimal(kpi["total_revenue_impact"]) == Decimal("15")
    # 3 × 10
    assert Decimal(kpi["total_margin_impact"]) == Decimal("30")
    # avg of 0.7, 0.7, 0.7
    assert Decimal(kpi["avg_win_prob_at_new"]) == Decimal("0.7000")
