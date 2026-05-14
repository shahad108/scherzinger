"""Next-cycle moves composer — 3-5 ranked recommendations for Frank."""
from __future__ import annotations
from typing import Any


def build_next_moves(
    *,
    cluster_signals: dict[str, dict[str, Any]] | None = None,
    top_n: int = 5,
) -> list[dict[str, Any]]:
    """cluster_signals example:
      {
        "BKAGG": {
          "skus_below_floor": 12,
          "forecast_impact_eur": 420000,
          "signal": "cost crossing list price",
        },
        ...
      }
    """
    cluster_signals = cluster_signals or {}
    moves: list[dict[str, Any]] = []
    for cluster, sig in cluster_signals.items():
        impact = float(sig.get("forecast_impact_eur", 0))
        moves.append({
            "id": f"move-{cluster.lower()}",
            "rank": 0,  # filled after sort
            "cluster": cluster,
            "headline": _headline_for(cluster, sig),
            "forecastImpactEur": impact,
            "sourceSignal": sig.get("signal", "anomaly"),
            "actionIntent": {
                "kind": sig.get("intent_kind", "open_studio"),
                "payload": {
                    "cluster": cluster,
                    "context": sig.get("intent_context", "next-cycle"),
                },
            },
        })
    moves.sort(key=lambda m: m["forecastImpactEur"], reverse=True)
    moves = moves[:top_n]
    for i, m in enumerate(moves):
        m["rank"] = i + 1
    return moves


def _headline_for(cluster: str, sig: dict[str, Any]) -> str:
    n = sig.get("skus_below_floor")
    if n:
        return f"{cluster} cluster: {n} SKUs at risk · €{int(sig.get('forecast_impact_eur', 0))/1000:.0f}k next-12mo impact"
    return f"{cluster}: {sig.get('signal', 'review recommended')}"
