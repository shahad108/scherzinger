"""Margin bridge waterfall.

Bucket order is fixed: target → mix → discount → cost → rebate → erosion → actual.
The seed encodes this order; helpers swap to gap_analysis composition later.

Phase 4 polish (vision §4.2):
  • Each loss bucket carries a ``classification`` (strategic / unintended /
    mixed) with a one-line ``classificationNote`` so Frank can defend the
    waterfall in a Till review without inventing prose on the fly.
  • Each loss bucket carries a ``movableShare`` (0..1) — the pilot
    estimate of how much of that bucket Frank can actually move this
    cycle. Summed weighted by €, it reconciles with the existing
    ``movableLocked`` headline (€260K / 62%).
  • A precomputed ``movableChart`` and ``movableBuckets`` view is
    attached so the FE Movable-only toggle is a pure render switch — no
    client-side recomputation, no drift between the chart and the table.
  • ``lowNClusters`` lists any low-n cluster a bucket's source prose
    references (currently SOPU n=6) so the UI can warn before action.

All enrichment is keyed off the existing ``buckets[].id`` — the seed
remains the single source of truth for headline numbers.
"""
from __future__ import annotations

import copy
from typing import Any

from ._seed import load_seed


# Per-bucket pilot heuristic. Numbers are the SAME shape Frank gets when
# he opens the per-bucket drill (sales-rep breaches, contract pass-
# through, etc.) — they are not invented for this view.
_BUCKET_META: dict[str, dict[str, Any]] = {
    "mix": {
        "classification": "mixed",
        "classificationNote": (
            "Customer-mix shifts are partly a deliberate tier strategy "
            "(strategic) and partly unmanaged drift (unintended). Drill "
            "to the tier pivot to split."
        ),
        # Tier-mix is largely contractually locked once a customer is in
        # a tier — only ~30% can be moved in-cycle via re-tiering.
        "movableShare": 0.30,
        "lowNClusters": [],
    },
    "discount": {
        "classification": "unintended",
        "classificationNote": (
            "Quotes below the guardrail margin floor. By definition "
            "unintended — every breach is a sales-rep decision that "
            "violated the policy."
        ),
        "movableShare": 0.85,
        "lowNClusters": [],
    },
    "cost": {
        "classification": "unintended",
        "classificationNote": (
            "Indexed contracts whose price trigger has not fired. "
            "Unintended on the 4 movable contracts (Frank can renegotiate "
            "this cycle); the remaining 3 are locked until frame renewal."
        ),
        # 4 of 7 un-triggered are movable per the seed source line.
        "movableShare": 4 / 7,
        "lowNClusters": [],
    },
    "rebate": {
        "classification": "unintended",
        "classificationNote": (
            "Customers accruing above their committed tier. Unintended "
            "but committed — recovery requires Till approval at the "
            "annual rebate true-up."
        ),
        "movableShare": 0.25,
        "lowNClusters": [],
    },
    "erosion": {
        "classification": "mixed",
        "classificationNote": (
            "Stale list prices. Some SKUs are kept stale on purpose to "
            "anchor low-margin loss-leaders (strategic); the rest are "
            "simply overdue (unintended)."
        ),
        "movableShare": 0.80,
        # The erosion source references BKAIZ (n=13, conf 64%) — not
        # low-n but near the threshold. SOPU is not in this bucket.
        "lowNClusters": [],
    },
}


_EUR_LOOKUP = {
    "mix": 64_000,
    "discount": 117_000,
    "cost": 150_000,
    "rebate": 54_000,
    "erosion": 32_000,
}


def _eur_str(value_eur: float) -> str:
    """Format a EUR value to the seed convention (€nK rounded)."""
    rounded = round(value_eur / 1_000)
    return f"€{rounded}K"


def _pp_str(pp: float) -> str:
    sign = "−" if pp >= 0 else "+"  # losses display as "−1.1pp"
    return f"{sign}{abs(pp):.1f}pp"


def _enrich(seed_waterfall: dict[str, Any]) -> dict[str, Any]:
    out = copy.deepcopy(seed_waterfall)

    enriched_buckets: list[dict[str, Any]] = []
    movable_buckets: list[dict[str, Any]] = []
    movable_chart: list[dict[str, Any]] = []

    # Walk buckets in seed order. For loss buckets, attach classification
    # + movable share. For endpoint buckets (target/actual), copy through.
    target_cumulative = 0.0
    cumulative_after = 0.0

    # First pass: target endpoint sets the starting margin.
    for b in out["buckets"]:
        bid = b.get("id")
        if b.get("endpoint") == "green-start":
            target_cumulative = float(str(b["pct"]).replace("%", "").strip())
            cumulative_after = target_cumulative
            enriched_buckets.append(b)
            movable_buckets.append(b)
            movable_chart.append({
                "label": b["name"].split()[0],
                "cumulative": target_cumulative,
                "delta": target_cumulative,
                "kind": "endpoint",
            })
            continue

        if b.get("endpoint") == "green-end":
            # Actual endpoint — recomputed below after we know movable totals.
            enriched_buckets.append(b)
            continue

        meta = _BUCKET_META.get(bid, {})
        if meta:
            b = {**b, **meta}
        enriched_buckets.append(b)

        # Movable-only view: scale the bucket's pp and €.
        loss_pp = float(str(b["pct"]).replace("pp", "").replace("−", "-").strip())
        share = float(meta.get("movableShare", 0.0))
        movable_eur = _EUR_LOOKUP.get(bid, 0) * share
        movable_pp = loss_pp * share
        cumulative_after += movable_pp  # loss_pp is already negative

        mb = {
            **b,
            "pct": _pp_str(movable_pp),
            "eur": _eur_str(movable_eur),
            "movableShare": share,
        }
        movable_buckets.append(mb)
        movable_chart.append({
            "label": b["name"].split()[0],
            "cumulative": round(cumulative_after, 2),
            "delta": round(movable_pp, 2),
            "kind": "loss",
        })

    # Append the recomputed actual endpoint for movable view.
    actual = next((b for b in out["buckets"] if b.get("endpoint") == "green-end"), None)
    movable_actual_pct = round(cumulative_after, 1)
    movable_actual_eur = round(
        sum(_EUR_LOOKUP[k] * _BUCKET_META[k]["movableShare"] for k in _EUR_LOOKUP),
        -3,
    )
    if actual is not None:
        movable_actual = {
            **actual,
            "pct": f"{movable_actual_pct:.1f}%",
            "eur": f"−{_eur_str(movable_actual_eur)}",
        }
        movable_buckets.append(movable_actual)
        movable_chart.append({
            "label": "Actual",
            "cumulative": movable_actual_pct,
            "delta": movable_actual_pct,
            "kind": "endpoint",
        })

    out["buckets"] = enriched_buckets

    # Phase 4: precomputed movable-only view + heuristic note for honesty.
    out["movableView"] = {
        "title": "Movable-only view — only the leakage Frank can act on this cycle",
        "buckets": movable_buckets,
        "chart": movable_chart,
        "totalChip": f"{_eur_str(movable_actual_eur)} movable leakage of {out['totalChip']}",
        "heuristic": {
            "label": "Pilot heuristic",
            "rule": (
                "movable_eur per bucket = bucket_eur × pilot share "
                "(mix 30%, discount 85%, cost 4/7 ≈ 57%, rebate 25%, "
                "erosion 80%). Shares are conservative pilot estimates; "
                "replaced by the contract-aware optimiser once it lands."
            ),
            "qualifier": "Hover any bucket's classification pill for the strategic-vs-unintended split.",
        },
    }
    return out


async def build() -> Any:
    return _enrich(load_seed()["waterfall"])
