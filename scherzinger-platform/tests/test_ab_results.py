"""Phase 17 — A/B result aggregation math (no DB required).

We feed the pure aggregator with stand-in assignment records to verify the
control-vs-treatment math, the Welch p-value approximation, and the CI
helper. The DB-backed integration tests live in
``tests/contract/test_ab_tracker.py``.
"""
from __future__ import annotations

import math
from types import SimpleNamespace

from backend.services import ab_results_service as r


def _a(arm: str, *, margin: float | None, revenue: float | None = None):
    return SimpleNamespace(arm=arm, outcome_margin=margin, outcome_revenue=revenue)


def test_aggregate_empty_arm_returns_zero_n():
    agg = r._aggregate([], "control")
    assert agg.n == 0
    assert agg.mean_margin is None
    assert agg.var_margin is None


def test_aggregate_single_sample_no_variance():
    agg = r._aggregate([_a("control", margin=0.20)], "control")
    assert agg.n == 1
    assert agg.mean_margin == 0.20
    assert agg.var_margin is None


def test_aggregate_mean_and_revenue_sum():
    rows = [
        _a("treatment", margin=0.21, revenue=100),
        _a("treatment", margin=0.23, revenue=200),
        _a("control", margin=0.18, revenue=50),
    ]
    agg_t = r._aggregate(rows, "treatment")
    assert agg_t.n == 2
    assert math.isclose(agg_t.mean_margin, 0.22, rel_tol=1e-9)
    assert agg_t.total_revenue == 300


def test_welch_p_value_returns_none_for_tiny_samples():
    c = r.ArmAgg(n=1, mean_margin=0.2, var_margin=None, total_revenue=0)
    t = r.ArmAgg(n=1, mean_margin=0.25, var_margin=None, total_revenue=0)
    assert r._welch_p_value(c, t) is None


def test_welch_p_value_low_for_clear_separation():
    # Two well-separated means with small variance -> p should be small.
    c = r.ArmAgg(n=50, mean_margin=0.20, var_margin=0.0001, total_revenue=0)
    t = r.ArmAgg(n=50, mean_margin=0.25, var_margin=0.0001, total_revenue=0)
    p = r._welch_p_value(c, t)
    assert p is not None and p < 0.01


def test_welch_p_value_high_for_overlapping_distributions():
    c = r.ArmAgg(n=20, mean_margin=0.20, var_margin=0.01, total_revenue=0)
    t = r.ArmAgg(n=20, mean_margin=0.21, var_margin=0.01, total_revenue=0)
    p = r._welch_p_value(c, t)
    assert p is not None and p > 0.5


def test_ci_for_diff_brackets_observed_delta():
    c = r.ArmAgg(n=50, mean_margin=0.20, var_margin=0.0001, total_revenue=0)
    t = r.ArmAgg(n=50, mean_margin=0.25, var_margin=0.0001, total_revenue=0)
    low, high = r._ci_for_diff(c, t)
    assert low is not None and high is not None
    assert low < 0.05 < high


def test_ci_for_diff_none_on_tiny_samples():
    c = r.ArmAgg(n=1, mean_margin=0.20, var_margin=None, total_revenue=0)
    t = r.ArmAgg(n=1, mean_margin=0.25, var_margin=None, total_revenue=0)
    assert r._ci_for_diff(c, t) == (None, None)


def test_normal_cdf_anchor_values():
    assert math.isclose(r._normal_cdf(0.0), 0.5, rel_tol=1e-9)
    assert math.isclose(r._normal_cdf(1.96), 0.975, abs_tol=1e-3)
