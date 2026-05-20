"""Phase 17 — A/B simulation orchestration.

Wraps the persisted ``monte_carlo_results`` table with an A/B-aware service.
We don't expose raw Monte Carlo rows to the UI for this workflow; instead we
project them through ``summarize`` into a recommendation-shaped object that
both Action Center and reports can consume directly.

Three stages, all keyed by ``entity_type='ab_test'`` and the AbTest UUID:

  - ``pre_launch``: expected margin lift, downside probability, and required
    sample size for the planned control/treatment delta. Determines whether
    the test is safe to start.
  - ``in_flight``: recompute forecast using observed partial results plus the
    current allocation mix. Determines continue / hold / stop.
  - ``promotion_gate``: estimate the downside risk of full rollout, given the
    observed A/B lift and its uncertainty bounds. Determines promote / stop.

The actual stochastic sampling is intentionally light here — a sealed,
deterministic kernel so unit tests can pin behaviour without spinning up a
heavyweight numerics dependency. The contract is what callers depend on; the
sampling can be upgraded later without changing the API surface.
"""
from __future__ import annotations

import math
import random
from dataclasses import dataclass
from typing import Any, Iterable
from uuid import UUID, uuid4

from sqlalchemy import desc
from sqlalchemy.orm import Session

from backend.config import settings
from backend.models import AbTest, AbTestResult, MonteCarloResult


# --------------------------------------------------------------------------- #
# Stages + recommendations                                                    #
# --------------------------------------------------------------------------- #

STAGE_PRE_LAUNCH = "pre_launch"
STAGE_IN_FLIGHT = "in_flight"
STAGE_PROMOTION_GATE = "promotion_gate"
STAGES = {STAGE_PRE_LAUNCH, STAGE_IN_FLIGHT, STAGE_PROMOTION_GATE}

RECOMMEND_LAUNCH = "launch"
RECOMMEND_CONTINUE = "continue"
RECOMMEND_HOLD = "hold"
RECOMMEND_PROMOTE = "promote"
RECOMMEND_STOP = "stop"

# Heuristics — tuned for the demo dataset but exposed as constants so they can
# be moved into Settings later without touching call sites.
_DOWNSIDE_THRESHOLD = 0.20  # 20% chance of margin below threshold is the bar.
_MIN_LIFT_FOR_PROMOTE_PP = 0.5
_MIN_SAMPLES_FOR_PROMOTE = 30


@dataclass(frozen=True)
class SimulationSummary:
    """Decision-shaped projection of a Monte Carlo run for an A/B test."""

    simulation_id: str
    stage: str
    expected_lift: float | None
    downside_probability: float | None
    threshold_used: float | None
    p5_margin: float | None
    p50_margin: float | None
    p95_margin: float | None
    recommendation: str
    blockers: list[str]
    warnings: list[str]
    parameters: dict[str, Any]

    def to_dict(self) -> dict[str, Any]:
        return {
            "simulation_id": self.simulation_id,
            "stage": self.stage,
            "expected_lift": self.expected_lift,
            "downside_probability": self.downside_probability,
            "threshold_used": self.threshold_used,
            "p5_margin": self.p5_margin,
            "p50_margin": self.p50_margin,
            "p95_margin": self.p95_margin,
            "recommendation": self.recommendation,
            "blockers": list(self.blockers),
            "warnings": list(self.warnings),
            "parameters": dict(self.parameters),
        }


# --------------------------------------------------------------------------- #
# Sampling kernel                                                             #
# --------------------------------------------------------------------------- #

def _quantile(values: list[float], q: float) -> float:
    if not values:
        return 0.0
    values = sorted(values)
    idx = max(0, min(len(values) - 1, int(round(q * (len(values) - 1)))))
    return values[idx]


def _simulate_margin(
    *,
    base_margin: float,
    expected_lift_pp: float,
    sigma: float,
    n_simulations: int,
    seed: int | None,
) -> list[float]:
    """Sample ``n_simulations`` future margins around base + expected lift."""
    rng = random.Random(seed)
    centre = base_margin + (expected_lift_pp / 100.0)
    return [rng.gauss(centre, sigma) for _ in range(n_simulations)]


def _percentiles(samples: list[float], threshold: float) -> dict[str, float]:
    return {
        "mean": sum(samples) / len(samples) if samples else 0.0,
        "median": _quantile(samples, 0.5),
        "p5": _quantile(samples, 0.05),
        "p25": _quantile(samples, 0.25),
        "p75": _quantile(samples, 0.75),
        "p95": _quantile(samples, 0.95),
        "prob_below_threshold": (
            sum(1 for s in samples if s < threshold) / len(samples)
            if samples
            else 0.0
        ),
    }


# --------------------------------------------------------------------------- #
# Public API                                                                  #
# --------------------------------------------------------------------------- #

def required_sample_size(
    *, base_margin: float, expected_lift_pp: float, sigma: float
) -> int:
    """Closed-form normal-approx sample size for a two-sample mean comparison.

    Conservative defaults: alpha=0.05 two-sided, power=0.80.
    Falls back to a floor of 30 per arm so we never report "0 samples needed"
    on degenerate inputs.
    """
    if expected_lift_pp == 0:
        return 10_000
    z_alpha = 1.96
    z_beta = 0.84
    effect = abs(expected_lift_pp) / 100.0
    if effect <= 0 or sigma <= 0:
        return 10_000
    n = 2 * ((z_alpha + z_beta) * sigma / effect) ** 2
    return max(30, int(math.ceil(n)))


def run(
    db: Session,
    test: AbTest,
    *,
    stage: str,
    base_margin: float | None = None,
    expected_lift_pp: float | None = None,
    sigma: float | None = None,
    horizon_months: int = 6,
    threshold: float | None = None,
    n_simulations: int | None = None,
    seed: int | None = None,
    observed: AbTestResult | None = None,
) -> SimulationSummary:
    """Run a single-stage A/B simulation and persist a row in monte_carlo_results."""

    if stage not in STAGES:
        raise ValueError(f"unknown stage: {stage!r} (allowed: {sorted(STAGES)})")

    n_simulations = n_simulations or settings.MONTE_CARLO_SIMS
    threshold = threshold if threshold is not None else settings.MONTE_CARLO_THRESHOLD

    # --- Stage-aware parameter resolution. ----------------------------------
    if stage == STAGE_PRE_LAUNCH:
        base = base_margin if base_margin is not None else 0.0
        lift_pp = expected_lift_pp if expected_lift_pp is not None else _planning_lift_pp(test)
        s = sigma if sigma is not None else 0.05
    elif stage == STAGE_IN_FLIGHT:
        if observed is None or observed.observed_margin_treatment is None:
            base = base_margin if base_margin is not None else 0.0
            lift_pp = expected_lift_pp if expected_lift_pp is not None else _planning_lift_pp(test)
        else:
            base = float(observed.observed_margin_control or 0.0)
            obs_lift_pp = float(observed.lift_pp or 0.0)
            lift_pp = expected_lift_pp if expected_lift_pp is not None else obs_lift_pp
        s = sigma if sigma is not None else 0.04
    else:  # promotion_gate
        if observed is None or observed.observed_margin_treatment is None:
            base = base_margin if base_margin is not None else 0.0
            lift_pp = expected_lift_pp if expected_lift_pp is not None else 0.0
        else:
            base = float(observed.observed_margin_control or 0.0)
            lift_pp = expected_lift_pp if expected_lift_pp is not None else float(
                observed.lift_pp or 0.0
            )
        s = sigma if sigma is not None else 0.03

    samples = _simulate_margin(
        base_margin=base,
        expected_lift_pp=lift_pp,
        sigma=s,
        n_simulations=n_simulations,
        seed=seed,
    )
    stats = _percentiles(samples, threshold)

    sim_id = str(uuid4())
    params: dict[str, Any] = {
        "stage": stage,
        "control_price": float(test.control_price) if test.control_price is not None else None,
        "treatment_price": (
            float(test.treatment_price) if test.treatment_price is not None else None
        ),
        "slice_pct": float(test.slice_pct) if test.slice_pct is not None else None,
        "horizon_months": horizon_months,
        "base_margin": base,
        "expected_lift_pp": lift_pp,
        "sigma": s,
        "n_simulations": n_simulations,
        "threshold_used": threshold,
    }

    row = MonteCarloResult(
        simulation_id=sim_id,
        entity_type="ab_test",
        entity_id=str(test.id),
        horizon_months=horizon_months,
        n_simulations=n_simulations,
        mean_margin=stats["mean"],
        median_margin=stats["median"],
        p5_margin=stats["p5"],
        p25_margin=stats["p25"],
        p75_margin=stats["p75"],
        p95_margin=stats["p95"],
        prob_below_threshold=stats["prob_below_threshold"],
        threshold_used=threshold,
        parameters=params,
    )
    db.add(row)

    # Link the most-recent simulation onto the master test row.
    test.latest_simulation_id = sim_id
    test.simulation_status = "ready"

    rec, blockers, warnings = _recommend(
        stage=stage,
        expected_lift_pp=lift_pp,
        downside_prob=stats["prob_below_threshold"],
        observed=observed,
    )

    summary = SimulationSummary(
        simulation_id=sim_id,
        stage=stage,
        expected_lift=lift_pp,
        downside_probability=stats["prob_below_threshold"],
        threshold_used=threshold,
        p5_margin=stats["p5"],
        p50_margin=stats["median"],
        p95_margin=stats["p95"],
        recommendation=rec,
        blockers=blockers,
        warnings=warnings,
        parameters=params,
    )
    db.flush()
    return summary


def latest_for_stage(
    db: Session, test_id: UUID | str, *, stage: str
) -> SimulationSummary | None:
    """Reload the most-recent persisted simulation for (test, stage)."""
    rows: Iterable[MonteCarloResult] = (
        db.query(MonteCarloResult)
        .filter(
            MonteCarloResult.entity_type == "ab_test",
            MonteCarloResult.entity_id == str(test_id),
        )
        .order_by(desc(MonteCarloResult.id))
        .all()
    )
    for r in rows:
        params = r.parameters or {}
        if params.get("stage") == stage:
            return _row_to_summary(r)
    return None


def latest(db: Session, test_id: UUID | str) -> SimulationSummary | None:
    """Most recent simulation for the test, regardless of stage."""
    row = (
        db.query(MonteCarloResult)
        .filter(
            MonteCarloResult.entity_type == "ab_test",
            MonteCarloResult.entity_id == str(test_id),
        )
        .order_by(desc(MonteCarloResult.id))
        .first()
    )
    return _row_to_summary(row) if row else None


# --------------------------------------------------------------------------- #
# Helpers                                                                     #
# --------------------------------------------------------------------------- #

def _planning_lift_pp(test: AbTest) -> float:
    """Treatment minus control price as a percentage-point lift target.

    For the pre-launch stage we don't yet have observed margin data so the
    planning assumption is that the price delta carries through to margin.
    """
    c = float(test.control_price or 0.0)
    t = float(test.treatment_price or 0.0)
    if c <= 0:
        return 0.0
    return ((t - c) / c) * 100.0


def _row_to_summary(row: MonteCarloResult) -> SimulationSummary:
    params = row.parameters or {}
    stage = str(params.get("stage") or STAGE_PRE_LAUNCH)
    rec, blockers, warnings = _recommend(
        stage=stage,
        expected_lift_pp=float(params.get("expected_lift_pp") or 0.0),
        downside_prob=float(row.prob_below_threshold or 0.0),
        observed=None,
    )
    return SimulationSummary(
        simulation_id=row.simulation_id,
        stage=stage,
        expected_lift=float(params.get("expected_lift_pp") or 0.0),
        downside_probability=float(row.prob_below_threshold) if row.prob_below_threshold is not None else None,
        threshold_used=float(row.threshold_used) if row.threshold_used is not None else None,
        p5_margin=float(row.p5_margin) if row.p5_margin is not None else None,
        p50_margin=float(row.median_margin) if row.median_margin is not None else None,
        p95_margin=float(row.p95_margin) if row.p95_margin is not None else None,
        recommendation=rec,
        blockers=blockers,
        warnings=warnings,
        parameters=params,
    )


def _recommend(
    *,
    stage: str,
    expected_lift_pp: float,
    downside_prob: float,
    observed: AbTestResult | None,
) -> tuple[str, list[str], list[str]]:
    blockers: list[str] = []
    warnings: list[str] = []

    if stage == STAGE_PRE_LAUNCH:
        if expected_lift_pp <= 0:
            warnings.append("planned treatment price does not improve margin")
        if downside_prob > _DOWNSIDE_THRESHOLD:
            blockers.append(
                f"downside probability {downside_prob:.0%} exceeds {_DOWNSIDE_THRESHOLD:.0%} threshold"
            )
        return (RECOMMEND_HOLD if blockers else RECOMMEND_LAUNCH, blockers, warnings)

    if stage == STAGE_IN_FLIGHT:
        if downside_prob > _DOWNSIDE_THRESHOLD * 1.5:
            return (RECOMMEND_STOP, [
                f"downside probability {downside_prob:.0%} too high to continue"
            ], warnings)
        if downside_prob > _DOWNSIDE_THRESHOLD:
            return (RECOMMEND_HOLD, [
                f"downside probability {downside_prob:.0%} above hold threshold"
            ], warnings)
        return (RECOMMEND_CONTINUE, blockers, warnings)

    # promotion_gate
    if observed is None:
        blockers.append("no observed result available for promotion gate")
    else:
        n_c = observed.sample_size_control or 0
        n_t = observed.sample_size_treatment or 0
        if n_c < _MIN_SAMPLES_FOR_PROMOTE or n_t < _MIN_SAMPLES_FOR_PROMOTE:
            blockers.append(
                f"insufficient sample size (control={n_c}, treatment={n_t}; min {_MIN_SAMPLES_FOR_PROMOTE})"
            )
        if observed.p_value is None or float(observed.p_value) > 0.05:
            blockers.append("observed result is not statistically significant (p > 0.05)")
        if observed.lift_pp is None or float(observed.lift_pp) < _MIN_LIFT_FOR_PROMOTE_PP:
            blockers.append(
                f"observed lift below promotion bar of {_MIN_LIFT_FOR_PROMOTE_PP}pp"
            )
    if downside_prob > _DOWNSIDE_THRESHOLD:
        blockers.append(
            f"simulated downside probability {downside_prob:.0%} above {_DOWNSIDE_THRESHOLD:.0%} threshold"
        )
    return (RECOMMEND_STOP if blockers else RECOMMEND_PROMOTE, blockers, warnings)
