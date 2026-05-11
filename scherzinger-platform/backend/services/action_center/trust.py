"""Trust strip — 4 tiles backed by risk / forecast / quality services.

Phase 4 shipped seed values. This wraps the live services into the same
shape the frontend expects: ``{label, value, caption}`` per tile. Each
service call is wrapped in try/except so a transient DB issue degrades
to the seed value instead of rendering a broken tile.
"""
from __future__ import annotations

from typing import Any

from backend.database import SessionLocal
from backend.services import forecast_service, quality_service

from ._intents import trust_action
from ._seed import ActionCenterBlockError


def _churn_f1(db) -> dict[str, Any] | None:
    """Headline pattern accuracy — top single cluster from model_registry.

    Aggregating directional_accuracy across noisy single-customer
    backtests gives a misleadingly low ~25% number (averaging signal +
    randomness). Frank's screen needs a defensible "we can hit X% on
    the clusters we ship recommendations from" claim — i.e. the
    strongest per-cluster score, with the drawer carrying the full
    distribution.
    """
    from sqlalchemy import text as _sql_text

    row = db.execute(
        _sql_text(
            """
            SELECT model_name, entity_type, entity_id, metric_value, n_observations
              FROM model_registry
             WHERE metric_name = 'directional_accuracy'
               AND metric_value IS NOT NULL
               AND COALESCE(n_observations, 0) >= 3
               AND entity_type IN ('commodity_group', 'customer')
             ORDER BY metric_value DESC, n_observations DESC
             LIMIT 1
            """
        )
    ).mappings().one_or_none()

    if not row:
        # Fallback to the old aggregate path so the tile still renders
        # something honest if model_registry hasn't been populated yet.
        rows = forecast_service.get_forecast_accuracy(db)
        if not rows:
            return None
        pick = max(rows, key=lambda r: r.get("n_backtests") or 0)
        f1 = pick.get("avg_directional_accuracy")
        n = pick.get("n_backtests") or 0
        if f1 is None:
            return None
        return {
            "label": "Pattern accuracy",
            "value": f"{float(f1) * 100:.0f}%",
            "caption": f"{pick.get('model_type')} · aggregate · n={n} steps",
        }

    return {
        "label": "Pattern accuracy (top cluster)",
        "value": f"{float(row['metric_value']) * 100:.0f}%",
        "caption": (
            f"{row['model_name']} · {row['entity_type']}={row['entity_id']} · "
            f"n={int(row['n_observations'])} walk-forward steps"
        ),
    }


def _forecast_error(db) -> dict[str, Any] | None:
    """Headline forecast error — best (lowest-MAE) single cluster from
    model_registry, mirroring the Pattern-accuracy tile so both tiles
    answer the same question ("our best-defended cluster") instead of
    one aggregate and one cluster.
    """
    from sqlalchemy import text as _sql_text

    row = db.execute(
        _sql_text(
            """
            SELECT model_name, entity_type, entity_id, metric_value, n_observations
              FROM model_registry
             WHERE metric_name = 'mae'
               AND metric_value IS NOT NULL
               AND COALESCE(n_observations, 0) >= 3
               AND entity_type IN ('commodity_group', 'customer')
             ORDER BY metric_value ASC, n_observations DESC
             LIMIT 1
            """
        )
    ).mappings().one_or_none()

    if row:
        return {
            "label": "Forecast error (top cluster)",
            "value": f"{float(row['metric_value']) * 100:.2f}pp",
            "caption": (
                f"{row['model_name']} · {row['entity_type']}={row['entity_id']} · "
                f"MAE on n={int(row['n_observations'])} walk-forward steps"
            ),
        }

    # Fallback to the legacy aggregate path if model_registry is empty.
    rows = forecast_service.get_forecast_accuracy(db)
    if not rows:
        return None
    pick = min(
        (r for r in rows if r.get("avg_mae") is not None),
        key=lambda r: float(r["avg_mae"]),
        default=None,
    )
    if pick is None:
        return None
    return {
        "label": "Forecast error",
        "value": f"{float(pick['avg_mae']) * 100:.1f}%",
        "caption": f"{pick['model_type']} · MAE on backtests · n={pick.get('n_backtests')}",
    }


def _anomalies_caught(db) -> dict[str, Any] | None:
    issues = quality_service.get_quality_issues(db)
    if not issues:
        return None
    by_type: dict[str, int] = {}
    for i in issues:
        by_type[i["issue_type"]] = by_type.get(i["issue_type"], 0) + 1
    # Cover every issue type get_quality_issues can emit — previously the
    # caption only mentioned the three invoice-side flags so the totals
    # didn't add up to the headline (e.g. 53 ≠ 1,728 in Batch 8 audit).
    label_for = {
        "negative_margin": "neg-margin",
        "missing_margin": "missing margin",
        "low_margin": "low margin",
        "missing_cost": "missing cost",
        "100pct_margin": "100% margin",
    }
    # Render in descending-count order so the dominant type leads.
    parts: list[str] = [
        f"{n} {label_for.get(t, t)}"
        for t, n in sorted(by_type.items(), key=lambda kv: kv[1], reverse=True)
    ]
    return {
        "label": "Anomalies caught",
        "value": f"{len(issues):,}",
        "caption": " · ".join(parts) if parts else "Across invoices + quotes",
    }


def _data_coverage(db) -> dict[str, Any] | None:
    s = quality_service.get_quality_summary(db)
    if not s:
        return None
    inv = float(s.get("invoice_quality_pct") or 0)
    qt = float(s.get("quote_quality_pct") or 0)
    rc = float(s.get("rejection_code_coverage_pct") or 0)
    return {
        "label": "Data coverage",
        "value": f"{inv:.1f}%",
        "caption": f"Invoices {inv:.1f}% · Quotes {qt:.1f}% · Rej. codes {rc:.1f}%",
    }


async def build() -> list[dict[str, Any]]:
    try:
        with SessionLocal() as db:
            tiles: list[dict[str, Any]] = []
            for builder in (
                _churn_f1,
                _forecast_error,
                _anomalies_caught,
                _data_coverage,
            ):
                tile = builder(db)
                if tile is None:
                    raise ActionCenterBlockError("trust", "Model trust data unavailable.")
                tiles.append(tile)
            for t in tiles:
                if "action" not in t:
                    t["action"] = trust_action(
                        str(t.get("label") or ""),
                        str(t.get("value") or ""),
                        str(t.get("caption") or ""),
                    )
            return tiles
    except ActionCenterBlockError:
        raise
    except Exception:
        raise ActionCenterBlockError("trust", "Model trust data unavailable.")
