"""Phase 2 (Pricing Studio v3) — customer-risk model tests.

Covers risk_if_moved across six (churn × Δ) scenarios + clamp + tone
mapping. Decimal end-to-end (no float in output).
"""
from __future__ import annotations

from decimal import Decimal

import pytest

from backend.services.pricing.customer_risk import (
    compute_tone,
    risk_if_moved,
)


@pytest.mark.parametrize(
    "churn,wallet,delta,expected_min,expected_max",
    [
        # Low churn × small +Δ → mild risk
        (Decimal("0.05"), Decimal("0.10"), Decimal("2"),
         Decimal("0.08"), Decimal("0.10")),
        # Low churn × large +Δ → meaningful risk
        (Decimal("0.05"), Decimal("0.10"), Decimal("20"),
         Decimal("0.44"), Decimal("0.46")),
        # Mid churn × small +Δ
        (Decimal("0.25"), Decimal("0.10"), Decimal("2"),
         Decimal("0.28"), Decimal("0.30")),
        # Mid churn × large +Δ
        (Decimal("0.25"), Decimal("0.10"), Decimal("20"),
         Decimal("0.64"), Decimal("0.66")),
        # High churn × small +Δ
        (Decimal("0.55"), Decimal("0.10"), Decimal("2"),
         Decimal("0.58"), Decimal("0.60")),
        # High churn × large +Δ → clamps to 1
        (Decimal("0.55"), Decimal("0.10"), Decimal("30"),
         Decimal("1"), Decimal("1")),
    ],
)
def test_risk_if_moved_scenarios(
    churn: Decimal,
    wallet: Decimal,
    delta: Decimal,
    expected_min: Decimal,
    expected_max: Decimal,
) -> None:
    out = risk_if_moved(churn_p=churn, wallet_share_pct=wallet, delta_pct=delta)
    assert isinstance(out, Decimal)
    assert expected_min <= out <= expected_max, f"out={out} not in [{expected_min},{expected_max}]"


def test_risk_clamped_to_unit_interval() -> None:
    # Pathological: very high churn + light wallet + huge +Δ
    out = risk_if_moved(
        churn_p=Decimal("0.95"),
        wallet_share_pct=Decimal("0.02"),
        delta_pct=Decimal("99"),
    )
    assert out == Decimal("1.0000")
    # Pathological: zero churn + price cut
    out2 = risk_if_moved(
        churn_p=Decimal("0"),
        wallet_share_pct=Decimal("0.50"),
        delta_pct=Decimal("-50"),
    )
    assert out2 == Decimal("0.0000")


def test_zero_delta_returns_base_times_wallet() -> None:
    out = risk_if_moved(
        churn_p=Decimal("0.20"),
        wallet_share_pct=Decimal("0.30"),  # deeply embedded → 0.8x
        delta_pct=Decimal("0"),
    )
    # 0.20 * 0.8 = 0.16, quantised to 4dp
    assert out == Decimal("0.1600")


def test_price_cut_lowers_risk() -> None:
    hike = risk_if_moved(
        churn_p=Decimal("0.30"),
        wallet_share_pct=Decimal("0.10"),
        delta_pct=Decimal("10"),
    )
    cut = risk_if_moved(
        churn_p=Decimal("0.30"),
        wallet_share_pct=Decimal("0.10"),
        delta_pct=Decimal("-10"),
    )
    assert hike > cut


def test_no_float_in_output() -> None:
    out = risk_if_moved(
        churn_p=Decimal("0.5"),
        wallet_share_pct=Decimal("0.1"),
        delta_pct=Decimal("5"),
    )
    # Must be Decimal, not float-coerced.
    assert isinstance(out, Decimal)
    # 4-decimal precision.
    assert out.as_tuple().exponent == -4


def test_compute_tone_thresholds() -> None:
    assert compute_tone(Decimal("0.10")) == "plain"
    assert compute_tone(Decimal("0.15")) == "plain"  # boundary
    assert compute_tone(Decimal("0.16")) == "warn"
    assert compute_tone(Decimal("0.30")) == "warn"  # boundary
    assert compute_tone(Decimal("0.31")) == "alert"
    assert compute_tone(Decimal("0.99")) == "alert"


def test_compute_tone_none_is_plain() -> None:
    assert compute_tone(None) == "plain"
