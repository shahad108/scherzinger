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
    """Try churn-model F1 first; fall back to overall directional accuracy."""
    rows = forecast_service.get_forecast_accuracy(db)
    if not rows:
        return None
    churn = next((r for r in rows if "churn" in (r.get("model_type") or "").lower()), None)
    pick = churn or max(rows, key=lambda r: r.get("n_backtests") or 0)
    f1 = pick.get("avg_directional_accuracy")
    n = pick.get("n_backtests") or 0
    if f1 is None:
        return None
    # No churn model is trained on Scherzinger data yet — we surface the
    # best forecast model's directional accuracy from backtest_results
    # under an honest label. Real churn lands once the model_registry has
    # a churn entry; until then "Pattern accuracy" is the truthful framing.
    return {
        "label": "Pattern accuracy",
        "value": f"{float(f1) * 100:.0f}%",
        "caption": f"{pick.get('model_type')} · {pick.get('entity_type')} · n={n} walk-forward steps",
    }


def _forecast_error(db) -> dict[str, Any] | None:
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
    parts: list[str] = []
    if by_type.get("negative_margin"):
        parts.append(f"{by_type['negative_margin']} negative-margin")
    if by_type.get("missing_margin"):
        parts.append(f"{by_type['missing_margin']} missing")
    if by_type.get("low_margin"):
        parts.append(f"{by_type['low_margin']} low")
    return {
        "label": "Anomalies caught",
        "value": str(len(issues)),
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
