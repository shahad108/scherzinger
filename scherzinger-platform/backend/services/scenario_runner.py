"""Phase 5 — scenario_runner.

Takes a scenario's perturbation inputs and reruns the forecast composer
with those perturbations propagated through cost trajectory + price
channels. For deterministic scenarios (no Monte Carlo replay) we apply
the shifts directly to the tornado + distribution medians so the FE can
show the impact instantly.
"""
from __future__ import annotations

from copy import deepcopy
from typing import Any


_INPUT_PASS_THROUGH = {
    # Mapping of perturbation input name → tornado bar input name.
    # Used to translate scenario.inputs[*].name → bar.inputName.
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


def apply_scenario(forecast: dict[str, Any], scenario_inputs: list[dict[str, Any]]) -> dict[str, Any]:
    """Apply a scenario to a forecast payload.

    Strategy:
      - For each perturbation, derive a margin Δ from the tornado bar that
        already exists for that input (deltaPositive/deltaNegative).
      - Sum Δs into a single shift applied to:
          * distributions[*].median / p5 / p95
          * tornado.bars (untouched — those *are* the inputs we're using)
      - Header label is updated to reflect the scenario name.
    """
    if not scenario_inputs:
        return forecast  # base case → return as-is

    out = deepcopy(forecast)
    tornado = out.get("tornado") or {}
    bar_lookup = {b["inputName"]: b for b in tornado.get("bars") or []}

    total_pct_shift = 0.0
    for inp in scenario_inputs:
        name = inp.get("name", "")
        bar_name = _INPUT_PASS_THROUGH.get(name, name)
        bar = bar_lookup.get(bar_name)
        if not bar:
            continue
        pert = inp.get("perturbation") or {}
        # The tornado bars are calibrated to ±1σ. We scale linearly with the
        # perturbation value (interpreting value as σ multiples for ``pct``
        # type and as absolute pp delta for ``absolute``).
        value = float(pert.get("value", 0))
        if pert.get("type") == "pct":
            # ±10% on steel ≈ +1σ worth of shock. Use deltaPositive when
            # value > 0, deltaNegative when value < 0.
            if value >= 0:
                total_pct_shift += float(bar.get("deltaPositive", 0)) * (value / 10.0)
            else:
                total_pct_shift += float(bar.get("deltaNegative", 0)) * (abs(value) / 10.0)
        elif pert.get("type") == "absolute":
            # Absolute lever — treat it as a fraction of the bar's positive delta.
            total_pct_shift += float(bar.get("deltaPositive", 0)) * (value / 100.0)

    # Apply shift to distributions.
    distributions = out.get("distributions") or {}
    for row in distributions.get("rows") or []:
        for key in ("median", "mean", "p5", "p25", "p75", "p95"):
            v = row.get(key)
            if v is not None:
                row[key] = round(v + total_pct_shift, 2)

    # Update header label so the UI can show "Steel shock +10%" in the corner.
    out["scenarioApplied"] = {
        "shiftPpMargin": round(total_pct_shift, 2),
        "inputCount": len(scenario_inputs),
    }
    return out
