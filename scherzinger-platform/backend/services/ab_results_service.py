"""Phase 17 — A/B test result computation.

Aggregates the ``ab_test_assignments`` rows for a given test into a single
``ab_test_results`` snapshot row. Each refresh writes a new snapshot (so the
table keeps an append-only history of how the experiment looked over time)
and updates the corresponding ``ab_tests`` row's bookkeeping.

The computation is deliberately portable: we use a Welch's t-test
approximation in pure stdlib so the same code works against Postgres in prod
and SQLite in tests, without dragging in scipy.
"""
from __future__ import annotations

import math
from dataclasses import dataclass
from typing import Iterable
from uuid import UUID

from sqlalchemy.orm import Session

from backend.models import AbTest, AbTestAssignment, AbTestResult


@dataclass(frozen=True)
class ArmAgg:
    n: int
    mean_margin: float | None
    var_margin: float | None
    total_revenue: float


def _aggregate(assignments: Iterable[AbTestAssignment], arm: str) -> ArmAgg:
    margins: list[float] = []
    revenues: list[float] = []
    for a in assignments:
        if a.arm != arm:
            continue
        if a.outcome_margin is not None:
            margins.append(float(a.outcome_margin))
        if a.outcome_revenue is not None:
            revenues.append(float(a.outcome_revenue))
    n = len(margins)
    if n == 0:
        return ArmAgg(n=0, mean_margin=None, var_margin=None, total_revenue=sum(revenues))
    mean = sum(margins) / n
    if n < 2:
        var = None
    else:
        var = sum((m - mean) ** 2 for m in margins) / (n - 1)
    return ArmAgg(n=n, mean_margin=mean, var_margin=var, total_revenue=sum(revenues))


def _welch_p_value(c: ArmAgg, t: ArmAgg) -> float | None:
    """Two-sided p-value for the difference in means, normal-approx."""
    if c.n < 2 or t.n < 2:
        return None
    if c.mean_margin is None or t.mean_margin is None:
        return None
    if c.var_margin is None or t.var_margin is None:
        return None
    se2 = (c.var_margin / c.n) + (t.var_margin / t.n)
    if se2 <= 0:
        return None
    z = (t.mean_margin - c.mean_margin) / math.sqrt(se2)
    # Normal-approx survival function (no scipy): 2 * (1 - Phi(|z|)).
    return 2.0 * (1.0 - _normal_cdf(abs(z)))


def _normal_cdf(x: float) -> float:
    return 0.5 * (1.0 + math.erf(x / math.sqrt(2.0)))


def _ci_for_diff(
    c: ArmAgg, t: ArmAgg, *, z: float = 1.96
) -> tuple[float | None, float | None]:
    if c.n < 2 or t.n < 2:
        return None, None
    if c.mean_margin is None or t.mean_margin is None:
        return None, None
    if c.var_margin is None or t.var_margin is None:
        return None, None
    se = math.sqrt((c.var_margin / c.n) + (t.var_margin / t.n))
    diff = t.mean_margin - c.mean_margin
    return diff - z * se, diff + z * se


def compute(
    db: Session,
    test: AbTest,
    *,
    metric_name: str = "margin",
    period: str | None = None,
) -> AbTestResult:
    """Aggregate observed assignments into a new ab_test_results snapshot."""
    assignments = (
        db.query(AbTestAssignment).filter(AbTestAssignment.test_id == test.id).all()
    )
    control = _aggregate(assignments, "control")
    treatment = _aggregate(assignments, "treatment")

    delta = (
        (treatment.mean_margin - control.mean_margin)
        if (treatment.mean_margin is not None and control.mean_margin is not None)
        else None
    )
    lift_pp = delta * 100.0 if delta is not None else None
    p_value = _welch_p_value(control, treatment)
    ci_low, ci_high = _ci_for_diff(control, treatment)

    snapshot = AbTestResult(
        test_id=test.id,
        period=period or "to_date",
        control_margin=control.mean_margin,
        treatment_margin=treatment.mean_margin,
        control_volume=control.n,
        treatment_volume=treatment.n,
        p_value=p_value,
        sample_size_control=control.n,
        sample_size_treatment=treatment.n,
        metric_name=metric_name,
        metric_delta=delta,
        lift_pp=lift_pp,
        confidence_interval_low=ci_low,
        confidence_interval_high=ci_high,
        observed_revenue_control=control.total_revenue,
        observed_revenue_treatment=treatment.total_revenue,
        observed_margin_control=control.mean_margin,
        observed_margin_treatment=treatment.mean_margin,
    )
    db.add(snapshot)
    db.flush()
    return snapshot


def latest(db: Session, test_id: UUID | str) -> AbTestResult | None:
    """Most recent computed snapshot for the test."""
    return (
        db.query(AbTestResult)
        .filter(AbTestResult.test_id == test_id)
        .order_by(AbTestResult.computed_at.desc(), AbTestResult.id.desc())
        .first()
    )


def serialize(snapshot: AbTestResult | None) -> dict | None:
    if snapshot is None:
        return None

    def _f(v):
        return float(v) if v is not None else None

    return {
        "id": str(snapshot.id),
        "test_id": str(snapshot.test_id),
        "period": snapshot.period,
        "computed_at": snapshot.computed_at.isoformat() if snapshot.computed_at else None,
        "metric_name": snapshot.metric_name,
        "metric_delta": _f(snapshot.metric_delta),
        "lift_pp": _f(snapshot.lift_pp),
        "p_value": _f(snapshot.p_value),
        "confidence_interval": {
            "low": _f(snapshot.confidence_interval_low),
            "high": _f(snapshot.confidence_interval_high),
        },
        "sample_size": {
            "control": snapshot.sample_size_control,
            "treatment": snapshot.sample_size_treatment,
        },
        "observed_revenue": {
            "control": _f(snapshot.observed_revenue_control),
            "treatment": _f(snapshot.observed_revenue_treatment),
        },
        "observed_margin": {
            "control": _f(snapshot.observed_margin_control),
            "treatment": _f(snapshot.observed_margin_treatment),
        },
    }
