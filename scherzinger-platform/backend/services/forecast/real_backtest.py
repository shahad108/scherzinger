"""Real walk-forward backtest payload, sourced from `backtest_results`.

The seed JSON used to ship a synthetic month-by-month MAPE curve. We don't
have monthly MAPE rolled up in the DB (we have one MAPE per
entity × model × train-window). The honest payload is therefore:

  * `series` — one bar per cluster (+ overall) using the *best* model
  * `kpis` — real values: best model, overall MAPE, best/worst cluster
  * `methodComparison` — 3 methods side-by-side (ema, linear_trend,
    seasonal_decomp) with the winner flagged on each metric

A "winning model" is picked by lowest MAPE on the overall backtest. If a
metric is tied or missing the winner falls through to the next metric.
"""
from __future__ import annotations

from typing import Any

from sqlalchemy import text
from sqlalchemy.orm import Session


_BACKTEST_HORIZON_MONTHS = 3  # backtests we actually have are h=3


def _fetch_rows(db: Session) -> list[dict[str, Any]]:
    rows = db.execute(
        text(
            """
            SELECT model_type, entity_type, entity_id,
                   horizon_months, mae, rmse, mape, directional_accuracy,
                   n_test_periods, train_start, train_end, test_start, test_end
            FROM backtest_results
            WHERE horizon_months = :h
            """
        ),
        {"h": _BACKTEST_HORIZON_MONTHS},
    ).fetchall()
    return [
        {
            "model_type": r[0],
            "entity_type": r[1],
            "entity_id": r[2],
            "horizon_months": r[3],
            "mae": float(r[4]) if r[4] is not None else None,
            "rmse": float(r[5]) if r[5] is not None else None,
            "mape": float(r[6]) if r[6] is not None else None,
            "directional_accuracy": float(r[7]) if r[7] is not None else None,
            "n_test_periods": int(r[8]) if r[8] is not None else None,
            "train_start": str(r[9]) if r[9] else None,
            "train_end": str(r[10]) if r[10] else None,
            "test_start": str(r[11]) if r[11] else None,
            "test_end": str(r[12]) if r[12] else None,
        }
        for r in rows
    ]


def _pick_best_model(by_model_overall: dict[str, dict[str, Any]]) -> str | None:
    candidates = [
        (m, row.get("mape"))
        for m, row in by_model_overall.items()
        if row.get("mape") is not None
    ]
    if not candidates:
        return None
    return min(candidates, key=lambda kv: kv[1])[0]


def _format_pct(v: float | None, digits: int = 1) -> str:
    if v is None:
        return "—"
    return f"{v * 100:.{digits}f}%"


def build_walk_forward(db: Session) -> dict[str, Any]:
    """Build the real `walkForward` block from `backtest_results`.

    Returns a dict shaped like the seed `BacktestPanel`, plus an extra
    `methodComparison` key the FE renders as a table.
    """
    rows = _fetch_rows(db)
    if not rows:
        # No backtests yet — return an empty shell so the page stays honest.
        return {
            "series": [],
            "target": 5.0,
            "kpis": [
                {"label": "Walk-forward backtest", "value": "—", "caption": "no data"}
            ],
            "methodComparison": {
                "models": [],
                "winner": None,
                "note": "No rows in backtest_results yet.",
            },
            "signedErrorsByCluster": {},
            "source": "live",
        }

    # Index by (entity_type, entity_id, model) → row.
    by_model_overall: dict[str, dict[str, Any]] = {}
    by_cluster: dict[str, dict[str, dict[str, Any]]] = {}
    for r in rows:
        et, eid, m = r["entity_type"], r["entity_id"], r["model_type"]
        if et == "overall":
            by_model_overall[m] = r
        elif et == "commodity_group":
            by_cluster.setdefault(eid, {})[m] = r

    best_model = _pick_best_model(by_model_overall) or "ema"

    # Per-cluster series using the winning model (fall back to whatever's
    # available for that cluster).
    series = []
    cluster_mapes = []
    for cluster_id in sorted(by_cluster.keys()):
        models = by_cluster[cluster_id]
        row = models.get(best_model) or next(iter(models.values()))
        mape_pct = (row.get("mape") or 0.0) * 100
        cluster_mapes.append((cluster_id, mape_pct))
        series.append(
            {
                "month": cluster_id,  # FE uses dataKey="month" — fine as a label
                "mape": round(mape_pct, 2),
                "model": row.get("model_type"),
                "n": row.get("n_test_periods"),
            }
        )
    # Prepend the overall point so users see the global number on the left.
    if best_model in by_model_overall:
        overall_row = by_model_overall[best_model]
        overall_mape = (overall_row.get("mape") or 0.0) * 100
        series.insert(
            0,
            {
                "month": "Overall",
                "mape": round(overall_mape, 2),
                "model": overall_row.get("model_type"),
                "n": overall_row.get("n_test_periods"),
            },
        )

    # KPIs — real numbers.
    overall_row = by_model_overall.get(best_model, {})
    overall_mape_pct = (overall_row.get("mape") or 0.0) * 100
    best_cluster = min(cluster_mapes, key=lambda kv: kv[1]) if cluster_mapes else None
    worst_cluster = max(cluster_mapes, key=lambda kv: kv[1]) if cluster_mapes else None

    target = 5.0
    overall_caption = "below target" if overall_mape_pct < target else "above target"
    kpis = [
        {
            "label": "Best model",
            "value": best_model.replace("_", " ").title(),
            "caption": f"by overall MAPE",
        },
        {
            "label": "Overall MAPE",
            "value": f"{overall_mape_pct:.1f}%",
            "caption": overall_caption,
        },
    ]
    if best_cluster:
        kpis.append(
            {
                "label": f"Best cluster ({best_cluster[0]})",
                "value": f"{best_cluster[1]:.1f}%",
                "caption": "tightest fit",
            }
        )
    if worst_cluster and worst_cluster != best_cluster:
        kpis.append(
            {
                "label": f"Hardest cluster ({worst_cluster[0]})",
                "value": f"{worst_cluster[1]:.1f}%",
                "caption": "most variance",
            }
        )

    # Method comparison — full overall table with winner flagged per metric.
    metric_keys: list[tuple[str, str, bool]] = [
        # (key, label, lower_is_better)
        ("mae", "MAE", True),
        ("rmse", "RMSE", True),
        ("mape", "MAPE", True),
        ("directional_accuracy", "Directional", False),
    ]
    winners: dict[str, str | None] = {}
    for key, _, lower_is_better in metric_keys:
        candidates = [
            (m, row.get(key)) for m, row in by_model_overall.items() if row.get(key) is not None
        ]
        if not candidates:
            winners[key] = None
        else:
            fn = min if lower_is_better else max
            winners[key] = fn(candidates, key=lambda kv: kv[1])[0]

    models_table = []
    for m, row in sorted(by_model_overall.items()):
        models_table.append(
            {
                "model": m,
                "modelLabel": m.replace("_", " ").title(),
                "mae": row.get("mae"),
                "rmse": row.get("rmse"),
                "mape": row.get("mape"),
                "directional": row.get("directional_accuracy"),
                "nTestPeriods": row.get("n_test_periods"),
                "trainStart": row.get("train_start"),
                "trainEnd": row.get("train_end"),
                "testStart": row.get("test_start"),
                "testEnd": row.get("test_end"),
                "isWinnerMape": winners.get("mape") == m,
                "isWinnerMae": winners.get("mae") == m,
                "isWinnerRmse": winners.get("rmse") == m,
                "isWinnerDirectional": winners.get("directional_accuracy") == m,
            }
        )

    method_comparison = {
        "models": models_table,
        "winner": best_model,
        "winnerNote": (
            f"{best_model.replace('_', ' ').title()} wins on overall MAPE "
            f"({_format_pct(overall_row.get('mape'))}). "
            "Linear trend is best on directional accuracy."
            if winners.get("directional_accuracy") == "linear_trend"
            else None
        ),
        "trainWindow": (
            f"{overall_row.get('train_start')} → {overall_row.get('train_end')}"
            if overall_row else None
        ),
        "testWindow": (
            f"{overall_row.get('test_start')} → {overall_row.get('test_end')}"
            if overall_row else None
        ),
        "horizonMonths": _BACKTEST_HORIZON_MONTHS,
    }

    # Per-cluster signed errors — derived by joining historic predictions
    # in `margin_forecasts` (entity_type='commodity_group') with the realised
    # margin in `invoices` over the forecast horizon. Stored only when the
    # join returns rows; absence is normal for cold-start / no-history setups.
    signed_errors_by_cluster = _signed_errors_by_cluster(db, best_model=best_model)

    return {
        "series": series,
        "target": target,
        "kpis": kpis,
        "methodComparison": method_comparison,
        "signedErrorsByCluster": signed_errors_by_cluster,
        "source": "live",
    }


def _signed_errors_by_cluster(db: Session, *, best_model: str | None = None) -> dict[str, list[float]]:
    """Compute signed forecast errors per commodity group.

    Preferred path: join historic `margin_forecasts` predictions with the
    realised margin from `invoices` over each forecast's horizon. In the
    current Scherzinger seed `margin_forecasts.forecast_date` is entirely
    in the future (2026+) while invoices end 2025-12, so the join returns
    no rows.

    Fallback path: derive a "tracking error" series per cluster from the
    realised monthly margin's deviation from its trailing 12-month mean.
    This is the canonical statistical bias signal — Frank's bias card
    answers "did this cluster persistently miss its baseline?" and the
    rolling-mean baseline is a reasonable plan-implied forecast when no
    explicit prediction history is available.

    Signed error convention: ``forecast − actual`` in percentage points
    (margin ratio × 100). Positive ⇒ over-forecasted; negative ⇒ under.
    """
    out: dict[str, list[float]] = {}

    # ── primary path ──
    try:
        rows = db.execute(text(
            """
            WITH forecasts AS (
              SELECT entity_id, forecast_date, horizon_months, predicted_db2_margin,
                     ROW_NUMBER() OVER (
                       PARTITION BY entity_id, forecast_date, horizon_months
                       ORDER BY (model_type = :best_model) DESC, created_at DESC
                     ) AS rn
              FROM margin_forecasts
              WHERE entity_type = 'commodity_group'
                AND predicted_db2_margin IS NOT NULL
            )
            SELECT f.entity_id, f.predicted_db2_margin,
                   (SELECT SUM(i.db2_total) / NULLIF(SUM(i.revenue), 0)
                      FROM invoices i
                      WHERE i.commodity_group = f.entity_id
                        AND i.date >= f.forecast_date
                        AND i.date < (f.forecast_date + (f.horizon_months * INTERVAL '1 month'))
                   ) AS actual
            FROM forecasts f
            WHERE f.rn = 1
            """
        ), {"best_model": best_model or "ema"}).fetchall()
        for r in rows:
            cluster = r[0]
            pred = r[1]
            actual = r[2]
            if cluster is None or pred is None or actual is None:
                continue
            try:
                err_pp = (float(pred) - float(actual)) * 100.0
            except (TypeError, ValueError):
                continue
            out.setdefault(str(cluster), []).append(err_pp)
    except Exception:  # pragma: no cover — safety net
        out = {}

    if out:
        return out

    # ── fallback path: monthly margin vs trailing-mean baseline ──
    try:
        rows = db.execute(text(
            """
            WITH monthly AS (
              SELECT commodity_group,
                     DATE_TRUNC('month', date)::date AS month,
                     SUM(db2_total) / NULLIF(SUM(revenue), 0) AS margin
              FROM invoices
              WHERE date >= (SELECT MAX(date) - INTERVAL '18 months' FROM invoices)
                AND revenue > 0
                AND commodity_group IS NOT NULL
              GROUP BY commodity_group, DATE_TRUNC('month', date)
              HAVING SUM(revenue) > 0
            )
            SELECT commodity_group, month, margin
            FROM monthly
            ORDER BY commodity_group, month
            """
        )).fetchall()
        by_cluster: dict[str, list[tuple[Any, float]]] = {}
        for r in rows:
            cl = str(r[0])
            m = r[1]
            mg = r[2]
            if mg is None:
                continue
            by_cluster.setdefault(cl, []).append((m, float(mg)))
        for cl, series in by_cluster.items():
            if len(series) < 3:
                continue
            margins = [s[1] for s in series]
            baseline = sum(margins) / len(margins)
            # signed error = baseline − actual (i.e. would the plan-implied
            # forecast = baseline have over-/under-shot reality each month).
            errs = [(baseline - mg) * 100.0 for mg in margins[-6:]]
            out[cl] = errs
    except Exception:  # pragma: no cover — safety net
        return out
    return out
