"""Adapter — pulls inputs from the production source of truth and runs the
v1.4 engine to produce a JSON-serialisable recommendation packet.

v1 wiring (this commit): reads from the Scherzinger parquet files under
`Data/cleaned/` and the existing churn-predictions CSV. This keeps the
math identical to what the notebook validates.

v2 will swap this loader to read from the production Postgres tables
(`invoices`, `quotes`, `churn_state`, `forecast_vintages`) so the engine
runs against live data. The orchestrator API does not change.
"""
from __future__ import annotations

import json
import logging
from dataclasses import asdict
from functools import lru_cache
from pathlib import Path
from typing import Any, Optional

import numpy as np
import pandas as pd

from . import churn_response, cost_demand, monte_carlo, scorer, win_prob

logger = logging.getLogger(__name__)

# Resolve repo-root absolute paths so the service works regardless of the
# uvicorn working directory.
_REPO_ROOT = Path(__file__).resolve().parents[5]
DATA_ROOT = _REPO_ROOT / "Data" / "cleaned"
NOTEBOOK_OUTPUT = _REPO_ROOT / "notebooks" / "output"
CONFORMAL_SCALAR_FILE = (
    _REPO_ROOT / "notebooks" / "pricing_engine_v1" / "output" / "conformal_scalar.json"
)


@lru_cache(maxsize=1)
def _load_static() -> dict[str, pd.DataFrame]:
    """Cache the cleaned parquets in-process so per-SKU calls are sub-second."""
    return {
        "quotes": pd.read_parquet(DATA_ROOT / "quotes_clean.parquet").assign(
            date=lambda d: pd.to_datetime(d["date"]),
            price_per_unit=lambda d: d["revenue"].astype(float) / d["quantity"].replace(0, pd.NA).astype(float),
        ),
        "invoices": pd.read_parquet(DATA_ROOT / "invoices_clean.parquet").assign(
            date=lambda d: pd.to_datetime(d["date"])
        ),
        "sku_forecasts": pd.read_parquet(NOTEBOOK_OUTPUT / "sku_forecasts.parquet"),
        "churn": pd.read_csv(NOTEBOOK_OUTPUT / "churn_predictions.csv"),
    }


@lru_cache(maxsize=1)
def _conformal_scalar() -> float:
    try:
        return float(json.loads(CONFORMAL_SCALAR_FILE.read_text())["global_scalar"])
    except (FileNotFoundError, KeyError, json.JSONDecodeError):
        return 1.0


def score_sku(aid: str, as_of: Optional[str] = None, mc_draws: int = 400) -> dict[str, Any]:
    """Return the full recommendation packet for one SKU.

    Schema:
        article_id, current_price, unit_cost, expected_volume_12mo,
        n_customers, p_star, delta_pct, score_eur, score_eur_calibrated,
        breakeven_price, mc_ci_low, mc_ci_high, mc_p_positive,
        drivers {win_prob, cost, churn}, score_curve [[price, score], ...],
        constraint_active, wp_locked, conformal_scalar, engine_version.
    """
    bundle = _load_static()
    as_of_ts = pd.Timestamp(as_of) if as_of else pd.Timestamp(bundle["invoices"]["date"].max())
    quotes = bundle["quotes"].loc[bundle["quotes"]["date"] <= as_of_ts]
    invoices = bundle["invoices"].loc[bundle["invoices"]["date"] <= as_of_ts]
    global_win_rate = float(quotes["is_won"].mean())

    sku_inputs = cost_demand.compute_inputs(
        invoices, bundle["sku_forecasts"], aid, as_of=as_of_ts
    )
    if sku_inputs.current_price <= 0:
        return {"article_id": aid, "error": "no current price"}

    wp = win_prob.fit(quotes, aid, global_win_rate)
    churn_tbl = churn_response.build_table(
        bundle["churn"], invoices=invoices, as_of=as_of_ts
    )
    share = scorer._customer_share(invoices, aid, as_of_ts)
    if not share:
        return {"article_id": aid, "error": "no customer share"}
    cids = list(share.keys())
    customer_shares = np.array([share[c] for c in cids])
    customer_alphas = churn_tbl.alpha(cids)

    rec = scorer.optimise(sku_inputs, wp, customer_alphas, customer_shares)
    mc = monte_carlo.run(
        sku_inputs, wp, customer_alphas, customer_shares, rec.p_star, draws=mc_draws
    )

    k = _conformal_scalar()
    score_curve_pairs = rec.score_curve.tolist()

    return {
        "engine_version": "v1.4",
        "article_id": aid,
        "as_of": as_of_ts.date().isoformat(),
        "current_price": sku_inputs.current_price,
        "unit_cost": sku_inputs.unit_cost,
        "expected_volume_12mo": sku_inputs.expected_volume_12mo,
        "n_customers": rec.n_customers,
        "p_star": rec.p_star,
        "delta_pct": (rec.p_star - sku_inputs.current_price)
        / max(sku_inputs.current_price, 1e-9)
        * 100.0,
        "score_eur": rec.s_star,
        "score_eur_calibrated": rec.s_star * k,
        "breakeven_price": rec.p_breakeven,
        "mc_ci_low": mc.ci_low,
        "mc_ci_high": mc.ci_high,
        "mc_p_positive": mc.p_positive,
        "drivers": {k_: float(v) for k_, v in rec.drivers.items()},
        "score_curve": [[float(p), float(s)] for p, s in score_curve_pairs],
        "constraint_active": rec.constraint_active,
        "wp_locked": wp.locked,
        "wp_n_train": wp.n_train,
        "conformal_scalar": k,
    }


def score_at_custom_price(
    aid: str, candidate_price: float, as_of: Optional[str] = None
) -> dict[str, Any]:
    """Compute S(p) at a user-supplied candidate price.

    Used by the Custom-card live simulate in the UI. Returns a thin packet:
    {score_eur, score_eur_calibrated, p_retain_mean, p_churn_mean,
    breakeven_distance_pct, vs_current_pct}.
    """
    bundle = _load_static()
    as_of_ts = pd.Timestamp(as_of) if as_of else pd.Timestamp(bundle["invoices"]["date"].max())
    quotes = bundle["quotes"].loc[bundle["quotes"]["date"] <= as_of_ts]
    invoices = bundle["invoices"].loc[bundle["invoices"]["date"] <= as_of_ts]
    global_win_rate = float(quotes["is_won"].mean())

    sku_inputs = cost_demand.compute_inputs(
        invoices, bundle["sku_forecasts"], aid, as_of=as_of_ts
    )
    if sku_inputs.current_price <= 0:
        return {"article_id": aid, "error": "no current price"}

    wp = win_prob.fit(quotes, aid, global_win_rate)
    churn_tbl = churn_response.build_table(
        bundle["churn"], invoices=invoices, as_of=as_of_ts
    )
    share = scorer._customer_share(invoices, aid, as_of_ts)
    cids = list(share.keys())
    customer_shares = np.array([share[c] for c in cids])
    customer_alphas = churn_tbl.alpha(cids)

    s_p = scorer._score_at_price(
        float(candidate_price), sku_inputs, wp, customer_alphas, customer_shares
    )
    s_cur = scorer._score_at_price(
        float(sku_inputs.current_price),
        sku_inputs,
        wp,
        customer_alphas,
        customer_shares,
    )
    delta = (candidate_price - sku_inputs.current_price) / max(
        sku_inputs.current_price, 1e-9
    )
    p_retain = churn_response.p_retain(
        customer_alphas, np.full_like(customer_alphas, float(delta))
    )
    k = _conformal_scalar()
    return {
        "engine_version": "v1.4",
        "article_id": aid,
        "candidate_price": float(candidate_price),
        "current_price": sku_inputs.current_price,
        "delta_pct": float(delta) * 100.0,
        "score_eur": s_p,
        "score_eur_calibrated": s_p * k,
        "score_eur_at_current": s_cur,
        "score_eur_at_current_calibrated": s_cur * k,
        "uplift_pct_vs_current": (s_p - s_cur) / max(abs(s_cur), 1e-9) * 100.0,
        "p_retain_mean": float(p_retain.mean()),
        "p_churn_mean": float(1.0 - p_retain.mean()),
        "conformal_scalar": k,
    }
