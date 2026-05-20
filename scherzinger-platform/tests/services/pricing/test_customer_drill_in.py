"""Phase 2 (Pricing Studio v3) — customer drill-in composer service tests.

Focused on the SF1 (canonical price keys) and SF4 (explicit-None master)
fixes; the API contract is covered in tests/api/test_customer_drill_in.py.
"""
from __future__ import annotations

from datetime import datetime, timezone
from decimal import Decimal
from unittest.mock import MagicMock, patch
from uuid import uuid4

import pytest

from backend.models.pricing.customer_on_sku import (
    CustomerOnSku,
    CustomerTier,
    PaidBand,
)
from backend.models.pricing.lineage import LineageRef, LineageSourceKind
from backend.services.pricing import customer_drill_in as di


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


def _cos() -> CustomerOnSku:
    return CustomerOnSku(
        aid="X-1",
        customer_id="C-1",
        last_paid=Decimal("5.00"),
        last_paid_at=datetime.now(timezone.utc),
        ltm_units=10,
        ltm_eur=Decimal("50.00"),
        churn_p=Decimal("0.10"),
        decline_p=Decimal("0.10"),
        risk_if_moved=None,
        wallet_share_pct=Decimal("0.10"),
        paid_band=PaidBand(
            p10=Decimal("4.50"),
            p50=Decimal("5.00"),
            p90=Decimal("5.50"),
        ),
        tier=CustomerTier.A,
        lineage_ref=_lineage(),
    )


@pytest.fixture(autouse=True)
def _clear_cache():
    di.invalidate_cache()
    yield
    di.invalidate_cache()


@pytest.mark.parametrize(
    "price",
    [Decimal("127"), Decimal("127.0"), Decimal("127.00"), Decimal("127.0000")],
)
def test_drill_in_cache_key_canonical_for_equivalent_decimals(
    price: Decimal,
) -> None:
    """Equivalent Decimal prices MUST hit the same drill-in cache entry."""
    session = MagicMock()
    call_count = {"n": 0}

    def _build(*args, **kwargs):
        call_count["n"] += 1
        return _cos()

    with patch.object(
        di,
        "_load_customer_master",
        return_value={"name": "Acme", "tier": "A"},
    ), patch.object(di, "_load_history_on_sku", return_value=[]), patch.object(
        di, "_load_wallet_top_skus", return_value=[]
    ), patch.object(di, "build_customer_on_sku", side_effect=_build):
        di.build_drill_in(
            customer_id="C-1",
            aid="X-1",
            proposed_price=Decimal("127.00"),
            db_session=session,
        )
        di.build_drill_in(
            customer_id="C-1",
            aid="X-1",
            proposed_price=price,
            db_session=session,
        )
    # Second call MUST hit cache.
    assert call_count["n"] == 1


def test_drill_in_returns_none_when_master_missing() -> None:
    """SF4: explicit ``None`` from ``_load_customer_master`` → 404."""
    session = MagicMock()
    with patch.object(di, "_load_customer_master", return_value=None), \
         patch.object(di, "_load_history_on_sku", return_value=[]):
        result = di.build_drill_in(
            customer_id="C-MISSING",
            aid="X-1",
            proposed_price=None,
            db_session=session,
        )
    assert result is None


@pytest.mark.parametrize(
    "risk,expected_tone",
    [
        (Decimal("0.10"), "plain"),   # ≤ warn threshold (0.15)
        (Decimal("0.20"), "warn"),    # > warn (0.15), ≤ alert (0.30)
        (Decimal("0.50"), "alert"),   # > alert (0.30)
    ],
)
def test_drill_in_at_proposed_tone_is_bff_computed(
    risk: Decimal, expected_tone: str,
) -> None:
    """SF2 (Phase 2.2.5): the drill-in ``at_proposed`` payload carries the
    BFF-computed ``tone`` string. Drawer renders it but never re-derives
    thresholds — see ``customer_risk._TONE_*_GT`` constants for the
    canonical mapping shared with the fanout composer."""
    session = MagicMock()
    cos = _cos()
    # Force the risk-if-moved value used by the at_proposed block.
    cos.last_paid = Decimal("5.00")
    cos.churn_p = risk  # high enough that the computed risk lands in band
    cos.wallet_share_pct = Decimal("0.10")
    with patch.object(
        di,
        "_load_customer_master",
        return_value={"name": "Acme", "tier": "A"},
    ), patch.object(di, "_load_history_on_sku", return_value=[]), patch.object(
        di, "_load_wallet_top_skus", return_value=[]
    ), patch.object(di, "build_customer_on_sku", return_value=cos), patch.object(
        di, "risk_if_moved", return_value=risk
    ):
        payload = di.build_drill_in(
            customer_id="C-1",
            aid="X-1",
            proposed_price=Decimal("5.50"),
            db_session=session,
        )
    assert payload is not None
    assert payload["at_proposed"] is not None
    assert payload["at_proposed"]["tone"] == expected_tone


def test_drill_in_succeeds_when_master_present_even_without_history() -> None:
    """SF4: a real master + zero history should still build a payload.

    Previously the name-prefix sniff plus an empty history was treated as
    "doesn't exist". Now master presence is the source of truth.
    """
    session = MagicMock()
    with patch.object(
        di,
        "_load_customer_master",
        return_value={"name": "Acme", "tier": "A"},
    ), patch.object(di, "_load_history_on_sku", return_value=[]), patch.object(
        di, "_load_wallet_top_skus", return_value=[]
    ), patch.object(di, "build_customer_on_sku", return_value=_cos()):
        payload = di.build_drill_in(
            customer_id="C-1",
            aid="X-1",
            proposed_price=None,
            db_session=session,
        )
    assert payload is not None
    assert payload["customer"]["name"] == "Acme"
