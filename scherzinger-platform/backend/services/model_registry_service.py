"""Model Registry read service.

Powers:
  - GET /api/v1/models/cards       → full registry shaped per-model
  - GET /api/v1/models/trust-drawer → 4 tiles re-shaped for Action Center

A single source of truth for per-(model, cluster) accuracy, last-trained
date, feature list, and notes. Reads model_registry table.
"""
from __future__ import annotations

from typing import Any

from sqlalchemy import text
from sqlalchemy.orm import Session


# Friendly labels for the entity_type axis so the FE can render
# "Top commodity clusters" / "Top customer clusters" / "Overall".
ENTITY_LABEL = {
    "overall": "Overall",
    "commodity_group": "By commodity",
    "customer": "By customer",
    "product": "By product",
}


def _round(value: Any, ndigits: int = 4) -> Any:
    if value is None:
        return None
    return round(float(value), ndigits)


def get_model_cards(db: Session) -> list[dict[str, Any]]:
    """Return one card per distinct model_name.

    Each card carries:
      - model_name, version, last_trained_at, holdout_months
      - features[]
      - notes
      - clusters[]: rows per (entity_type, entity_id) with all metrics
        rolled up into one record.
    """
    # Postgres has no MAX(jsonb); aggregate scalars, then re-fetch the
    # newest feature_list row per model_name.
    models = db.execute(
        text("""
            SELECT model_name,
                   MAX(version) AS version,
                   MAX(trained_at) AS last_trained_at,
                   MAX(holdout_months) AS holdout_months,
                   MAX(notes) AS notes
            FROM model_registry
            GROUP BY model_name
            ORDER BY model_name
        """)
    ).fetchall()

    feature_lists: dict[str, Any] = {}
    for row in db.execute(
        text("""
            SELECT DISTINCT ON (model_name) model_name, feature_list
            FROM model_registry
            WHERE feature_list IS NOT NULL
            ORDER BY model_name, trained_at DESC
        """)
    ).fetchall():
        feature_lists[row[0]] = row[1]

    if not models:
        return []

    cards: list[dict[str, Any]] = []
    for m in models:
        name = m[0]
        clusters = db.execute(
            text("""
                SELECT entity_type, entity_id, metric_name, metric_value, n_observations
                FROM model_registry
                WHERE model_name = :n
                ORDER BY entity_type, entity_id, metric_name
            """),
            {"n": name},
        ).fetchall()

        # Pivot metrics into one record per (entity_type, entity_id).
        grouped: dict[tuple[str, str | None], dict[str, Any]] = {}
        for c in clusters:
            et, eid, metric, val, n = c[0], c[1], c[2], c[3], c[4]
            key = (et, eid)
            entry = grouped.setdefault(
                key,
                {
                    "entity_type": et,
                    "entity_id": eid,
                    "entity_label": ENTITY_LABEL.get(et, et),
                    "n": n,
                    "metrics": {},
                },
            )
            entry["metrics"][metric] = _round(val)
            if n is not None:
                entry["n"] = max(entry["n"] or 0, n)

        cards.append({
            "model_name": name,
            "version": m[1],
            "last_trained_at": m[2].isoformat() if m[2] else None,
            "holdout_months": m[3],
            "notes": m[4],
            "features": feature_lists.get(name, []),
            "clusters": list(grouped.values()),
        })

    return cards


def _best_cluster_for_metric(
    cards: list[dict[str, Any]], metric: str, prefer_entity: str | None = None
) -> dict[str, Any] | None:
    """Find the (model, cluster) with the most observations for a metric.

    Used to surface a defensible headline number for each trust tile.
    """
    best = None
    best_n = -1
    for card in cards:
        for c in card["clusters"]:
            if metric not in c["metrics"] or c["metrics"][metric] is None:
                continue
            if prefer_entity and c["entity_type"] != prefer_entity:
                continue
            n = c["n"] or 0
            if n > best_n:
                best_n = n
                best = {
                    "model_name": card["model_name"],
                    "version": card["version"],
                    "last_trained_at": card["last_trained_at"],
                    "entity_type": c["entity_type"],
                    "entity_id": c["entity_id"],
                    "metric": metric,
                    "metric_value": c["metrics"][metric],
                    "n": c["n"],
                }
    return best


def get_trust_drawer(db: Session) -> dict[str, Any]:
    """Return per-tile drilldown content for the Action Center Trust strip.

    Four tiles, each with: headline value, qualifier copy, the
    (model, cluster) it came from, and a top-5 cluster table.
    """
    cards = get_model_cards(db)
    if not cards:
        return {"tiles": [], "models": []}

    def _top_clusters(metric: str, sort_ascending: bool = False, limit: int = 5):
        rows = []
        for card in cards:
            for c in card["clusters"]:
                v = c["metrics"].get(metric)
                if v is None or c["entity_type"] == "overall":
                    continue
                rows.append({
                    "model_name": card["model_name"],
                    "entity_type": c["entity_type"],
                    "entity_id": c["entity_id"],
                    "entity_label": c["entity_label"],
                    "metric": metric,
                    "metric_value": v,
                    "n": c["n"],
                })
        rows.sort(key=lambda r: r["metric_value"], reverse=not sort_ascending)
        return rows[:limit]

    # Tile 1: Directional accuracy (Trust "Churn / pattern" tile).
    da_best = _best_cluster_for_metric(cards, "directional_accuracy")
    tile_da = {
        "key": "directional_accuracy",
        "label": "Pattern accuracy (top cluster)",
        "value": f"{da_best['metric_value']:.0%}" if da_best else "—",
        "caption": (
            f"{da_best['model_name']} · {da_best['entity_type']}={da_best['entity_id']} · "
            f"n={da_best['n']} walk-forward steps"
        ) if da_best else "Backtest data unavailable.",
        "source": da_best,
        "top_clusters": _top_clusters("directional_accuracy", sort_ascending=False),
        "explainer": (
            "Share of test windows where the model called the next-period margin "
            "direction correctly. Computed via walk-forward backtest on real "
            "Scherzinger invoice data — no synthetic labels."
        ),
    }

    # Tile 2: Forecast error (MAE) — lower is better.
    mae_best = None
    best_n = -1
    for card in cards:
        for c in card["clusters"]:
            v = c["metrics"].get("mae")
            if v is None or c["entity_type"] == "overall":
                continue
            n = c["n"] or 0
            if n > best_n:
                best_n = n
                mae_best = {
                    "model_name": card["model_name"],
                    "version": card["version"],
                    "last_trained_at": card["last_trained_at"],
                    "entity_type": c["entity_type"],
                    "entity_id": c["entity_id"],
                    "metric": "mae",
                    "metric_value": v,
                    "n": c["n"],
                }
    tile_err = {
        "key": "forecast_error",
        "label": "Forecast MAE (top cluster)",
        "value": f"{mae_best['metric_value']*100:.2f}pp" if mae_best else "—",
        "caption": (
            f"{mae_best['model_name']} · {mae_best['entity_type']}={mae_best['entity_id']} · "
            f"n={mae_best['n']} steps"
        ) if mae_best else "Backtest data unavailable.",
        "source": mae_best,
        "top_clusters": _top_clusters("mae", sort_ascending=True),
        "explainer": (
            "Mean Absolute Error of the predicted weighted DB2 margin vs. the "
            "actual margin over walk-forward test windows. Reported in margin "
            "percentage points; lower is better."
        ),
    }

    # Tile 3 + 4 — anomalies caught and data coverage — pulled from
    # quality_service in the existing trust block, but mirrored here so
    # the drawer's first tile-set is consistent.
    return {
        "tiles": [tile_da, tile_err],
        "models": cards,
    }
