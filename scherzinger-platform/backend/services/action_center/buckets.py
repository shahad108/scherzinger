"""Bucket filter chips — the BucketFilterRow above DecisionCards.

The block no longer hits the database directly. It composes filter chips
from the **resolved decisions block** so the counts always agree with
what the user sees in `DecisionCards`. The composer runs this builder
as a second pass after the main asyncio.gather (similar to summary).

Each chip is one of the real decision queues that decisions.py already
classifies via the `queue` field: ``churn`` / ``cost_riser`` /
``margin_erosion``. The pinned ``"all"`` chip clears the filter and
emits a typed noop intent so the frontend dispatcher short-circuits.

Plan §2.5 — replaces the old Movable/Locked SKU-revenue cards with
honest action-queue chips so the user can scope to one queue or open
the full queue in Pricing Studio with cmd-click / right-click.
"""
from __future__ import annotations

from collections import Counter
from typing import Any

from ._intents import noop_intent, queue_route_intent


# Display labels for each canonical queue id. Order is the *secondary*
# tiebreaker when two queues have the same count — primary sort is count
# desc, secondary uses this declaration order so the UI stays stable
# across refreshes.
_QUEUE_LABELS: list[tuple[str, str]] = [
    ("churn", "Churn risk"),
    ("cost_riser", "Cost risers"),
    ("margin_erosion", "Margin erosion"),
    ("other", "Other"),
]


async def build(decisions: list[dict[str, Any]] | None) -> dict[str, Any]:
    """Compose filter chips for the BucketFilterRow.

    Counts come from the live decisions block (already resolved). No new
    SQL — the composer runs this after the decisions block returns. When
    decisions is None (degraded upstream) we emit an empty filter list;
    the composer maps that to ``status: 'degraded'``.
    """
    if decisions is None:
        return {"filters": []}

    rows = [d for d in decisions if isinstance(d, dict)]
    counts: Counter[str] = Counter()
    for d in rows:
        counts[str(d.get("queue") or "other")] += 1
    total = sum(counts.values())

    # Build the non-"all" chips in canonical declaration order so the
    # secondary sort is deterministic.
    non_all: list[dict[str, Any]] = []
    for qid, label in _QUEUE_LABELS:
        n = counts.get(qid, 0)
        if n <= 0:
            continue
        non_all.append(
            {
                "id": qid,
                "label": label,
                "count": n,
                "queueRoute": queue_route_intent(qid, label),
                "tone": "warning",
            }
        )
    # Stable sort by count desc — preserves declaration order on ties.
    non_all.sort(key=lambda f: -int(f["count"]))

    filters: list[dict[str, Any]] = [
        {
            "id": "all",
            "label": "All",
            "count": total,
            "queueRoute": noop_intent(),
            "tone": "neutral",
        }
    ]
    filters.extend(non_all)
    return {"filters": filters}
