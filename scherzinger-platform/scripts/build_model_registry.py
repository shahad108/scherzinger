#!/usr/bin/env python3
"""Build/refresh model_registry from backtest_results + margin_forecasts.

Writes one row per (model, entity_type, entity_id, metric) so the Trust
Strip drawer and the Settings → Model Cards page can read per-cluster
accuracy + last-trained + feature list from a single source of truth.

Idempotent: truncates model_registry before re-populating.
Run AFTER run_backtests.py + compute_forecasts.py.

Usage:
    python -m scripts.build_model_registry
"""
from __future__ import annotations

import json
import sys
import os
from datetime import datetime, timezone

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from sqlalchemy import text

from backend.database import SessionLocal


REGISTRY_VERSION = "v1.0-backfill"

# Per-model human-friendly notes describing model + training scope.
MODEL_NOTES = {
    "ema": "Exponentially-weighted moving average on monthly weighted DB2 margin (span=6). "
           "Requires ≥12 months of clean invoice data. Predicts mean reversion.",
    "linear_trend": "OLS linear regression on monthly weighted DB2 margin. "
                    "Requires ≥18 months of clean invoice data. Predicts trend continuation.",
    "seasonal_decomp": "Additive seasonal decomposition (period=12) + trend extrapolation. "
                       "Requires ≥24 months of clean invoice data. Captures yearly seasonality.",
}

MODEL_FEATURES = {
    "ema": ["monthly_weighted_db2_margin", "ema_span"],
    "linear_trend": ["monthly_weighted_db2_margin", "time_index"],
    "seasonal_decomp": ["monthly_weighted_db2_margin", "time_index", "calendar_month"],
}


def _insert(db, *, model_name, entity_type, entity_id, metric_name, metric_value,
            n_observations, trained_at, holdout_months, feature_list, notes):
    db.execute(
        text("""
            INSERT INTO model_registry
                (model_name, version, trained_at, holdout_months,
                 entity_type, entity_id, metric_name, metric_value,
                 n_observations, feature_list, notes)
            VALUES (:mn, :ver, :ta, :hm, :et, :eid, :metric, :val, :n,
                    CAST(:fl AS jsonb), :notes)
        """),
        {
            "mn": model_name,
            "ver": REGISTRY_VERSION,
            "ta": trained_at,
            "hm": holdout_months,
            "et": entity_type,
            "eid": entity_id,
            "metric": metric_name,
            "val": metric_value,
            "n": n_observations,
            "fl": json.dumps(feature_list) if feature_list else None,
            "notes": notes,
        },
    )


def main() -> None:
    db = SessionLocal()
    inserted = 0
    try:
        db.execute(text("TRUNCATE model_registry RESTART IDENTITY"))
        db.commit()

        # Use latest backtest_results row's created_at as trained_at when
        # available; otherwise stamp now() so the tile reads "trained today".
        latest_train = db.execute(
            text("SELECT MAX(created_at) FROM backtest_results")
        ).scalar()
        trained_at = latest_train or datetime.now(timezone.utc)

        rows = db.execute(
            text("""
                SELECT model_type, entity_type, entity_id,
                       mae, rmse, mape, directional_accuracy, n_test_periods,
                       horizon_months
                FROM backtest_results
            """)
        ).fetchall()

        for r in rows:
            model_type, entity_type, entity_id = r[0], r[1], r[2]
            mae, rmse, mape, dir_acc, n, horizon = r[3], r[4], r[5], r[6], r[7], r[8]
            notes = MODEL_NOTES.get(model_type, "")
            features = MODEL_FEATURES.get(model_type, [])

            for metric_name, metric_value in (
                ("mae", mae),
                ("rmse", rmse),
                ("mape", mape),
                ("directional_accuracy", dir_acc),
            ):
                if metric_value is None:
                    continue
                _insert(
                    db,
                    model_name=model_type,
                    entity_type=entity_type,
                    entity_id=entity_id,
                    metric_name=metric_name,
                    metric_value=float(metric_value),
                    n_observations=int(n) if n is not None else None,
                    trained_at=trained_at,
                    holdout_months=int(horizon) if horizon is not None else None,
                    feature_list=features,
                    notes=notes,
                )
                inserted += 1

        db.commit()

        total = db.execute(text("SELECT COUNT(*) FROM model_registry")).scalar()
        by_model = db.execute(
            text("""
                SELECT model_name, COUNT(*) FROM model_registry
                GROUP BY model_name ORDER BY model_name
            """)
        ).fetchall()
        print(f"  Inserted {inserted} model_registry rows ({total} total)")
        for m, c in by_model:
            print(f"    {m}: {c} rows")
        print("  ✅ model_registry built")
    finally:
        db.close()


if __name__ == "__main__":
    main()
