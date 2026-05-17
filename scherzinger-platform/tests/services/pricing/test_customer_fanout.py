"""Phase 2 (Pricing Studio v3) — customer-fanout composer tests.

Verifies:
  - tone is BFF-computed for each row from risk_if_moved
  - re-scoring with a different proposed_price changes tone
  - proposal_queued flag set when a draft proposal exists
"""
from __future__ import annotations

from datetime import datetime, timezone
from decimal import Decimal
from unittest.mock import MagicMock, patch
from uuid import uuid4

import pytest

from backend.models.pricing.customer_on_sku import CustomerOnSku, CustomerTier, PaidBand
from backend.models.pricing.lineage import LineageRef, LineageSourceKind
from backend.services.pricing import customer_fanout as cf


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


def _cos(
    cid: str,
    *,
    last_paid: Decimal = Decimal("5.00"),
    risk: Decimal | None = None,
    churn: Decimal | None = Decimal("0.10"),
    wallet: Decimal = Decimal("0.10"),
) -> CustomerOnSku:
    return CustomerOnSku(
        aid="X-1",
        customer_id=cid,
        last_paid=last_paid,
        last_paid_at=datetime.now(timezone.utc),
        ltm_units=1000,
        ltm_eur=Decimal("5000.00"),
        churn_p=churn,
        decline_p=churn,
        risk_if_moved=risk,
        wallet_share_pct=wallet,
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
    cf.invalidate_cache()
    yield
    cf.invalidate_cache()


def test_tone_alert_when_high_risk() -> None:
    """risk_if_moved > 0.30 → tone=alert (BFF-computed)."""
    session = MagicMock()
    with patch.object(cf, "_load_customer_ids_for_aid", return_value=["C-1"]), \
         patch.object(cf, "_load_active_proposals_for_aid", return_value=set()), \
         patch.object(cf, "build_customer_on_sku",
                      return_value=_cos("C-1", risk=Decimal("0.45"))):
        payload = cf.build_customer_fanout(
            aid="X-1",
            proposed_price=Decimal("6.00"),
            db_session=session,
        )
    assert len(payload["rows"]) == 1
    assert payload["rows"][0]["tone"] == "alert"
    assert payload["rows"][0]["risk_if_moved"] == "0.45"


def test_tone_warn_when_mid_risk() -> None:
    session = MagicMock()
    with patch.object(cf, "_load_customer_ids_for_aid", return_value=["C-1"]), \
         patch.object(cf, "_load_active_proposals_for_aid", return_value=set()), \
         patch.object(cf, "build_customer_on_sku",
                      return_value=_cos("C-1", risk=Decimal("0.20"))):
        payload = cf.build_customer_fanout(
            aid="X-1",
            proposed_price=Decimal("5.50"),
            db_session=session,
        )
    assert payload["rows"][0]["tone"] == "warn"


def test_tone_plain_when_low_risk_or_none() -> None:
    session = MagicMock()
    with patch.object(cf, "_load_customer_ids_for_aid", return_value=["C-1", "C-2"]), \
         patch.object(cf, "_load_active_proposals_for_aid", return_value=set()), \
         patch.object(cf, "build_customer_on_sku",
                      side_effect=[
                          _cos("C-1", risk=Decimal("0.05")),
                          _cos("C-2", risk=None),
                      ]):
        payload = cf.build_customer_fanout(
            aid="X-1",
            proposed_price=Decimal("5.00"),
            db_session=session,
        )
    assert payload["rows"][0]["tone"] == "plain"
    assert payload["rows"][1]["tone"] == "plain"
    assert payload["rows"][1]["risk_if_moved"] is None


def test_re_scoring_changes_tone() -> None:
    session = MagicMock()
    # Same customer, two prices → different risk → different tone.
    with patch.object(cf, "_load_customer_ids_for_aid", return_value=["C-1"]), \
         patch.object(cf, "_load_active_proposals_for_aid", return_value=set()), \
         patch.object(cf, "build_customer_on_sku",
                      return_value=_cos("C-1", risk=Decimal("0.05"))):
        a = cf.build_customer_fanout(
            aid="X-1", proposed_price=Decimal("5.00"), db_session=session
        )
    # Cache lives per (aid, price), so a new price hits a fresh build.
    with patch.object(cf, "_load_customer_ids_for_aid", return_value=["C-1"]), \
         patch.object(cf, "_load_active_proposals_for_aid", return_value=set()), \
         patch.object(cf, "build_customer_on_sku",
                      return_value=_cos("C-1", risk=Decimal("0.40"))):
        b = cf.build_customer_fanout(
            aid="X-1", proposed_price=Decimal("6.50"), db_session=session
        )
    assert a["rows"][0]["tone"] == "plain"
    assert b["rows"][0]["tone"] == "alert"


def test_proposal_queued_flag_set_when_draft_exists() -> None:
    session = MagicMock()
    with patch.object(cf, "_load_customer_ids_for_aid", return_value=["C-1", "C-2"]), \
         patch.object(cf, "_load_active_proposals_for_aid", return_value={"C-1"}), \
         patch.object(cf, "build_customer_on_sku",
                      side_effect=[_cos("C-1"), _cos("C-2")]):
        payload = cf.build_customer_fanout(
            aid="X-1", proposed_price=Decimal("5.00"), db_session=session
        )
    rows_by_id = {r["customer_id"]: r for r in payload["rows"]}
    assert rows_by_id["C-1"]["proposal_queued"] is True
    assert rows_by_id["C-2"]["proposal_queued"] is False


def test_row_carries_extended_fields() -> None:
    """Every fanout row must surface the Phase 2 extended fields."""
    session = MagicMock()
    with patch.object(cf, "_load_customer_ids_for_aid", return_value=["C-1"]), \
         patch.object(cf, "_load_active_proposals_for_aid", return_value=set()), \
         patch.object(cf, "build_customer_on_sku",
                      return_value=_cos("C-1", risk=Decimal("0.20"))):
        payload = cf.build_customer_fanout(
            aid="X-1", proposed_price=Decimal("5.00"), db_session=session
        )
    row = payload["rows"][0]
    for key in (
        "wallet_share_pct", "paid_band", "risk_if_moved", "tone",
        "churn_p", "lineage_ref_id", "proposal_queued", "ltm_eur",
    ):
        assert key in row, f"missing {key} from fanout row"
    assert row["paid_band"] is not None
    assert "p10" in row["paid_band"]


def test_idempotent_within_cache_ttl() -> None:
    """Same (aid, proposed_price) returns the cached payload."""
    session = MagicMock()
    call_count = {"n": 0}

    def _build(*args, **kwargs):
        call_count["n"] += 1
        return _cos("C-1", risk=Decimal("0.05"))

    with patch.object(cf, "_load_customer_ids_for_aid", return_value=["C-1"]), \
         patch.object(cf, "_load_active_proposals_for_aid", return_value=set()), \
         patch.object(cf, "build_customer_on_sku", side_effect=_build):
        a = cf.build_customer_fanout(
            aid="X-1", proposed_price=Decimal("5.00"), db_session=session
        )
        b = cf.build_customer_fanout(
            aid="X-1", proposed_price=Decimal("5.00"), db_session=session
        )
    assert a is b
    assert call_count["n"] == 1


@pytest.mark.parametrize(
    "price",
    [Decimal("127"), Decimal("127.0"), Decimal("127.00"), Decimal("127.0000")],
)
def test_cache_key_canonical_for_equivalent_decimals(price: Decimal) -> None:
    """``Decimal("127.00")`` and ``Decimal("127.0")`` MUST hit the same cache.

    Without canonicalization the raw ``str()`` text differs and equivalent
    prices would thrash the per-price cache.
    """
    session = MagicMock()
    call_count = {"n": 0}

    def _build(*args, **kwargs):
        call_count["n"] += 1
        return _cos("C-1", risk=Decimal("0.05"))

    # Seed the cache at 127.00, then re-query with the parametrized variant.
    with patch.object(cf, "_load_customer_ids_for_aid", return_value=["C-1"]), \
         patch.object(cf, "_load_active_proposals_for_aid", return_value=set()), \
         patch.object(cf, "build_customer_on_sku", side_effect=_build):
        cf.build_customer_fanout(
            aid="X-1", proposed_price=Decimal("127.00"), db_session=session
        )
        cf.build_customer_fanout(
            aid="X-1", proposed_price=price, db_session=session
        )
    # Second call MUST be a cache hit → build_customer_on_sku invoked once.
    assert call_count["n"] == 1
