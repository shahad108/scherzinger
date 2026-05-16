"""Phase 1 — willingness-to-pay (WTP) band tests.

The band is computed from won-deal samples on a SKU × tier slice. We
verify the confidence rule (n_deals + band width) and the fallback path
when the sample is empty/sparse.
"""
from __future__ import annotations

from decimal import Decimal
from datetime import datetime, timezone
from unittest.mock import MagicMock
from uuid import uuid4

import pytest

from backend.models.pricing.recommendation import ConfidenceLevel
from backend.services.pricing import wtp as wtp_mod


def _stub_session(samples: list[float]) -> MagicMock:
    """A SessionLocal-like stub returning the won-deal price list."""
    session = MagicMock()
    rows = [(Decimal(str(s)),) for s in samples]
    session.execute.return_value.fetchall.return_value = rows
    return session


@pytest.fixture(autouse=True)
def _stub_lineage(monkeypatch):
    """Stub the lineage helper so unit tests don't need a real DB row."""

    def _fake_create_lineage(**kwargs):
        row = MagicMock()
        row.id = uuid4()
        row.source_kind = (
            kwargs["source_kind"].value
            if hasattr(kwargs["source_kind"], "value")
            else str(kwargs["source_kind"])
        )
        row.source_id = kwargs["source_id"]
        row.sql = kwargs.get("sql")
        row.model = kwargs.get("model")
        row.computed_at = datetime.now(timezone.utc)
        row.computed_by = kwargs["computed_by"]
        return row

    monkeypatch.setattr(wtp_mod, "create_lineage", _fake_create_lineage)
    yield


def test_n_deals_below_5_is_low_confidence() -> None:
    session = _stub_session([100.0, 110.0, 95.0])
    band = wtp_mod.build_wtp(
        aid="X-1", tier="A", window_days=540, db_session=session
    )
    assert band is not None
    assert band.n_deals == 3
    assert band.confidence == ConfidenceLevel.LOW


def test_n_deals_15_and_tight_band_is_high_confidence() -> None:
    # Tight band → (p90-p10)/p50 ≤ 0.5
    samples = [100.0 + i for i in range(20)]  # n=20, p10≈101.9, p90≈118.1, p50=109.5
    session = _stub_session(samples)
    band = wtp_mod.build_wtp(
        aid="X-1", tier="A", window_days=540, db_session=session
    )
    assert band is not None
    assert band.n_deals == 20
    assert band.confidence == ConfidenceLevel.HIGH


def test_wide_band_drops_confidence_to_low() -> None:
    # Wide spread: (p90-p10)/p50 > 0.5 even with many deals → "low".
    samples = [50.0] * 5 + [100.0] * 10 + [200.0] * 5
    session = _stub_session(samples)
    band = wtp_mod.build_wtp(
        aid="X-1", tier="A", window_days=540, db_session=session
    )
    assert band is not None
    assert band.confidence == ConfidenceLevel.LOW


def test_empty_sample_returns_none() -> None:
    session = _stub_session([])
    band = wtp_mod.build_wtp(
        aid="X-1", tier="A", window_days=540, db_session=session
    )
    assert band is None


def test_medium_sample_med_confidence() -> None:
    # 5 ≤ n < 15 with tight band → "med"
    samples = [100.0, 102.0, 104.0, 106.0, 108.0, 110.0, 112.0]  # n=7
    session = _stub_session(samples)
    band = wtp_mod.build_wtp(
        aid="X-1", tier="A", window_days=540, db_session=session
    )
    assert band is not None
    assert band.n_deals == 7
    assert band.confidence == ConfidenceLevel.MED
