"""Phase 2 (Pricing Studio v3) — customer-on-SKU composer tests."""
from __future__ import annotations

from datetime import datetime, timedelta, timezone
from decimal import Decimal
from unittest.mock import MagicMock, patch
from uuid import uuid4

import pytest

from backend.models.pricing.customer_on_sku import CustomerTier, PaidBand
from backend.models.pricing.lineage import LineageRef, LineageSourceKind
from backend.services.pricing import customer_on_sku as cos


def _lineage() -> LineageRef:
    return LineageRef(
        id=uuid4(),
        source_kind=LineageSourceKind.INVOICE_LEDGER,
        source_id="customer_on_sku:test",
        sql=None,
        model=None,
        computed_at=datetime.now(timezone.utc),
        computed_by="test",
    )


def _hist(prices: list[float], *, units: int = 100, latest: datetime | None = None) -> list[dict]:
    """Synthesize a history list: one entry per price, spaced 30 days apart."""
    latest = latest or datetime.now(timezone.utc)
    out = []
    for i, p in enumerate(prices):
        d = latest - timedelta(days=30 * (len(prices) - 1 - i))
        out.append({
            "date": d,
            "price": Decimal(str(p)),
            "units": units,
            "revenue": Decimal(str(p)) * Decimal(units),
            "won": True,
        })
    return out


def test_build_returns_all_extended_fields_no_proposed_price() -> None:
    session = MagicMock()
    history = _hist([4.00, 4.20, 4.50, 4.80, 5.00])
    with patch.object(cos, "_load_invoice_history", return_value=history), \
         patch.object(cos, "_load_customer_master", return_value={"name": "Acme", "tier": "A"}), \
         patch.object(cos, "_load_customer_risk_scores", return_value={
             "churn_p": Decimal("0.10"), "decline_p": Decimal("0.12"),
         }), \
         patch.object(cos, "_load_customer_ltm_eur", return_value=Decimal("100000")), \
         patch.object(cos, "_persist_lineage", return_value=_lineage()):
        row = cos.build_customer_on_sku(
            aid="X-1",
            customer_id="C-1",
            proposed_price=None,
            db_session=session,
        )

    # Extended fields are all present.
    assert row.aid == "X-1"
    assert row.customer_id == "C-1"
    assert row.last_paid == Decimal("5.00")
    assert row.ltm_units > 0
    assert row.ltm_eur is not None and row.ltm_eur > Decimal("0")
    assert row.churn_p == Decimal("0.1000")
    assert row.decline_p == Decimal("0.1200")
    # No proposed price → risk_if_moved is None (NOT zero).
    assert row.risk_if_moved is None
    assert row.wallet_share_pct is not None
    assert row.paid_band is not None
    assert isinstance(row.paid_band, PaidBand)
    assert row.tier == CustomerTier.A
    assert row.lineage_ref is not None


def test_paid_band_none_when_under_three_transactions() -> None:
    session = MagicMock()
    # Only 2 transactions
    history = _hist([4.00, 4.50])
    with patch.object(cos, "_load_invoice_history", return_value=history), \
         patch.object(cos, "_load_customer_master", return_value={"name": "Acme", "tier": "B"}), \
         patch.object(cos, "_load_customer_risk_scores", return_value={
             "churn_p": Decimal("0.20"), "decline_p": Decimal("0.20"),
         }), \
         patch.object(cos, "_load_customer_ltm_eur", return_value=Decimal("10000")), \
         patch.object(cos, "_persist_lineage", return_value=_lineage()):
        row = cos.build_customer_on_sku(
            aid="X-1",
            customer_id="C-2",
            db_session=session,
        )
    assert row.paid_band is None
    # Other fields still populated.
    assert row.last_paid == Decimal("4.50")
    assert row.ltm_units > 0


def test_risk_if_moved_populated_when_proposed_price() -> None:
    session = MagicMock()
    history = _hist([5.00, 5.00, 5.00, 5.00])
    with patch.object(cos, "_load_invoice_history", return_value=history), \
         patch.object(cos, "_load_customer_master", return_value={"name": "Acme", "tier": "A"}), \
         patch.object(cos, "_load_customer_risk_scores", return_value={
             "churn_p": Decimal("0.30"), "decline_p": Decimal("0.30"),
         }), \
         patch.object(cos, "_load_customer_ltm_eur", return_value=Decimal("100000")), \
         patch.object(cos, "_persist_lineage", return_value=_lineage()):
        # Propose a +10% hike from last_paid=5.00 → 5.50.
        row = cos.build_customer_on_sku(
            aid="X-1",
            customer_id="C-3",
            proposed_price=Decimal("5.50"),
            db_session=session,
        )
    assert row.risk_if_moved is not None
    assert isinstance(row.risk_if_moved, Decimal)
    # +10% Δ on a 0.30 churn baseline → > baseline (clamped to [0,1])
    assert row.risk_if_moved >= Decimal("0.20")


def test_no_history_returns_safe_defaults() -> None:
    session = MagicMock()
    with patch.object(cos, "_load_invoice_history", return_value=[]), \
         patch.object(cos, "_load_customer_master", return_value={"name": "Acme", "tier": "C"}), \
         patch.object(cos, "_load_customer_risk_scores", return_value={
             "churn_p": None, "decline_p": None,
         }), \
         patch.object(cos, "_load_customer_ltm_eur", return_value=Decimal("0")), \
         patch.object(cos, "_persist_lineage", return_value=_lineage()):
        row = cos.build_customer_on_sku(
            aid="X-1",
            customer_id="C-empty",
            proposed_price=Decimal("5.00"),
            db_session=session,
        )
    assert row.last_paid is None
    assert row.last_paid_at is None
    assert row.ltm_units == 0
    assert row.paid_band is None
    # No churn data → no risk_if_moved.
    assert row.risk_if_moved is None
    assert row.wallet_share_pct is None


def test_wallet_share_clamped_to_one() -> None:
    """LTM EUR on SKU should not exceed customer-wide LTM EUR.

    When data is inconsistent (e.g. seed mismatch), clamp to 1.0.
    """
    session = MagicMock()
    history = _hist([10.00, 10.00, 10.00], units=1000)
    # SKU total = 30,000 but customer total is reported as only 10,000.
    with patch.object(cos, "_load_invoice_history", return_value=history), \
         patch.object(cos, "_load_customer_master", return_value={"name": "X", "tier": "B"}), \
         patch.object(cos, "_load_customer_risk_scores", return_value={
             "churn_p": Decimal("0.10"), "decline_p": Decimal("0.10"),
         }), \
         patch.object(cos, "_load_customer_ltm_eur", return_value=Decimal("10000")), \
         patch.object(cos, "_persist_lineage", return_value=_lineage()):
        row = cos.build_customer_on_sku(
            aid="X-1",
            customer_id="C-clamp",
            db_session=session,
        )
    assert row.wallet_share_pct is not None
    assert row.wallet_share_pct <= Decimal("1")


def test_paid_band_percentiles_are_decimal() -> None:
    session = MagicMock()
    history = _hist([3.00, 4.00, 5.00, 6.00, 7.00, 8.00, 9.00])
    with patch.object(cos, "_load_invoice_history", return_value=history), \
         patch.object(cos, "_load_customer_master", return_value={"name": "X", "tier": "B"}), \
         patch.object(cos, "_load_customer_risk_scores", return_value={
             "churn_p": Decimal("0.10"), "decline_p": Decimal("0.10"),
         }), \
         patch.object(cos, "_load_customer_ltm_eur", return_value=Decimal("100000")), \
         patch.object(cos, "_persist_lineage", return_value=_lineage()):
        row = cos.build_customer_on_sku(
            aid="X-1",
            customer_id="C-pct",
            db_session=session,
        )
    pb = row.paid_band
    assert pb is not None
    assert isinstance(pb.p10, Decimal)
    assert isinstance(pb.p50, Decimal)
    assert isinstance(pb.p90, Decimal)
    assert pb.p10 < pb.p50 < pb.p90


def test_unknown_tier_falls_back_to_C() -> None:
    session = MagicMock()
    history = _hist([5.00, 5.00, 5.00])
    with patch.object(cos, "_load_invoice_history", return_value=history), \
         patch.object(cos, "_load_customer_master", return_value={"name": "X", "tier": "Z"}), \
         patch.object(cos, "_load_customer_risk_scores", return_value={
             "churn_p": Decimal("0.10"), "decline_p": Decimal("0.10"),
         }), \
         patch.object(cos, "_load_customer_ltm_eur", return_value=Decimal("100000")), \
         patch.object(cos, "_persist_lineage", return_value=_lineage()):
        row = cos.build_customer_on_sku(
            aid="X-1",
            customer_id="C-z",
            db_session=session,
        )
    assert row.tier == CustomerTier.C


def test_operational_error_propagates_from_loader() -> None:
    """SF5: DB connection errors MUST propagate, not silently mask data.

    A broad ``except Exception`` swallowed OperationalError and produced an
    empty history → looked like 'no purchases' instead of '500'. The narrow
    handler lets the connection error bubble up to the API layer.
    """
    import sqlalchemy.exc
    session = MagicMock()
    session.execute.side_effect = sqlalchemy.exc.OperationalError(
        "stmt", {}, Exception("connection lost")
    )
    with pytest.raises(sqlalchemy.exc.OperationalError):
        cos._load_invoice_history(
            aid="X-1", customer_id="C-1", db_session=session
        )
