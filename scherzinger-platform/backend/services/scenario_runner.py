"""Phase 5 — scenario_runner.

Translates a scenario's perturbation inputs into a unified shift envelope
(``ScenarioShift``) by reading the calibrated tornado-bar sensitivities
from the assembled forecast payload.

The shift envelope is consumed by ``services.forecast.scenario_apply``,
which propagates a single coherent shift across every numeric section of
the composed forecast (hero series, distributions, PVM, pocket waterfall,
margin / commodity trajectories, at-risk revenue …). Tornado bars are
deliberately untouched — they ARE the sensitivity model. Diagnostics
(calibration, bias, win-loss, walk-forward, erosion projection) and
prescriptive copy (next-moves) also pass through unchanged.
"""
from __future__ import annotations

from dataclasses import dataclass, field
from typing import Any


# Map from a scenario.inputs[*].name to the tornado bar inputName the
# simulator emits. Keeps the FE / scenario library naming readable while
# letting the runner look up the right calibrated sensitivity.
_INPUT_PASS_THROUGH = {
    "Steel S355": "Steel S355 / S275",
    "Steel": "Steel S355 / S275",
    "Steel HRC": "Steel S355 / S275",
    "EUR/USD": "EUR / USD",
    "Demand growth": "Demand growth %",
    "List-price uplift": "List-price uplift",
    "Pass-through %": "Pass-through %",
    "Alloys": "Alloys (Cr-Mo, Ni)",
    "Energy": "Energy (kWh)",
    "Copper": "Copper",
}

# Frank baseline used to convert margin-pp shifts into a relative factor
# applicable to revenue / volume / cost series.
_BASE_MARGIN_PCT = 64.0


@dataclass
class ScenarioShift:
    """Unified shift envelope derived from a scenario's perturbations.

    Fields:
      pp_margin:        additive pp shift on a margin fraction (neg = down)
      factor:           multiplicative factor for revenue / volume / cost
                        series (= 1 + pp_margin / base_margin)
      matched_inputs:   count of inputs that resolved to a tornado bar
      unmatched_inputs: input names that did NOT resolve
    """

    pp_margin: float
    factor: float
    matched_inputs: int = 0
    unmatched_inputs: list[str] = field(default_factory=list)

    @property
    def is_noop(self) -> bool:
        return abs(self.pp_margin) < 1e-9 and abs(self.factor - 1.0) < 1e-9


def compute_shift(
    scenario_inputs: list[dict[str, Any]] | None,
    tornado: dict[str, Any] | None,
) -> ScenarioShift:
    """Translate scenario inputs into a single calibrated shift envelope.

    Tornado bars carry ``deltaPositive`` / ``deltaNegative`` calibrated to
    ±1σ of margin sensitivity per input. We scale linearly with the
    perturbation value:

      * ``type="pct"`` — value treated as "10pct = 1σ" multiples
        (steel +10% ≈ +1σ); positive uses deltaPositive, negative uses
        deltaNegative.
      * ``type="absolute"`` — value divided by 100 and applied to
        deltaPositive (internal-lever absolutes always raise margin).
    """
    if not scenario_inputs:
        return ScenarioShift(pp_margin=0.0, factor=1.0)

    bars_by_name: dict[str, dict[str, Any]] = {
        b["inputName"]: b for b in (tornado or {}).get("bars") or []
    }

    pp_margin = 0.0
    matched = 0
    unmatched: list[str] = []

    for inp in scenario_inputs:
        name = str(inp.get("name", ""))
        bar_name = _INPUT_PASS_THROUGH.get(name, name)
        bar = bars_by_name.get(bar_name)
        if not bar:
            unmatched.append(name)
            continue
        pert = inp.get("perturbation") or {}
        try:
            value = float(pert.get("value", 0))
        except (TypeError, ValueError):
            value = 0.0
        ptype = pert.get("type")
        if ptype == "pct":
            if value >= 0:
                pp_margin += float(bar.get("deltaPositive", 0)) * (value / 10.0)
            else:
                pp_margin += float(bar.get("deltaNegative", 0)) * (abs(value) / 10.0)
        elif ptype == "absolute":
            pp_margin += float(bar.get("deltaPositive", 0)) * (value / 100.0)
        matched += 1

    factor = 1.0 + (pp_margin / _BASE_MARGIN_PCT)
    return ScenarioShift(
        pp_margin=round(pp_margin, 3),
        factor=round(factor, 5),
        matched_inputs=matched,
        unmatched_inputs=unmatched,
    )


# ---------------------------------------------------------------------------
# Legacy compatibility shim. The pre-Phase-B apply_scenario only shifted the
# distributions grid. New code paths should call
# ``services.forecast.scenario_apply.apply_shift`` instead. Kept so any
# remaining call site (and the existing tests) still works.
# ---------------------------------------------------------------------------


def apply_scenario(
    forecast: dict[str, Any], scenario_inputs: list[dict[str, Any]]
) -> dict[str, Any]:
    """Deprecated — prefer :func:`services.forecast.scenario_apply.apply_shift`.

    Returns the forecast with a shift propagated through the full payload.
    """
    # Local import to avoid a circular dependency at module import time.
    from backend.services.forecast.scenario_apply import apply_shift

    if not scenario_inputs:
        return forecast

    shift = compute_shift(scenario_inputs, forecast.get("tornado"))
    return apply_shift(forecast, shift)
