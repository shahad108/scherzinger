"""Walk-forward backtest harness.

For each eligible SKU:
    1. Train every input model on data up to `train_end`.
    2. Run the optimiser, obtain p_star.
    3. Compute the *counterfactual* engine score at p_star using the FULL
       eval-period input distributions (this is the "what the engine bought").
    4. Compute the realised score: from the actual invoices in the eval
       period, what contribution was realised at the actual prices charged.
    5. Compute the engine-counterfactual at the actual avg price — i.e. what
       score the engine *would have given* the price actually used. Lift
       is engine(p_star) - engine(p_actual).

The "realised vs CI" coverage check uses the Monte-Carlo band on
engine(p_star) and asks whether the realised number is inside.
"""
from __future__ import annotations

from dataclasses import dataclass
from typing import Optional

import numpy as np
import pandas as pd

from . import churn_response, cost_demand, scorer, monte_carlo, win_prob


@dataclass
class BacktestRow:
    article_id: str
    n_train_quotes: int
    n_eval_quotes: int
    current_price: float
    p_star: float
    p_actual_eval: float
    s_engine_p_star: float
    s_engine_p_actual: float
    s_realised_eval: float
    mc_low: float
    mc_high: float
    mc_p_positive: float
    constraint_active: Optional[str]


def realised_score(
    invoices_eval: pd.DataFrame, article_id: str, unit_cost_train: float
) -> tuple[float, float]:
    """(realised €contribution in eval window, weighted average price actually charged).

    v1.4 Fix #2: prefer the invoice-recorded db2_total (real per-line margin,
    using the actual unit cost at the time of invoicing) over the
    recomputed `revenue - train_cost * qty`. Stale train-period costs were
    biasing the realised baseline.
    """
    inv = invoices_eval.loc[invoices_eval["article_id"] == article_id]
    qty = float(inv["quantity"].sum())
    if qty <= 0:
        return 0.0, 0.0
    rev = float(inv["revenue"].sum())
    avg_price = rev / qty
    db2_sum = float(inv["db2_total"].sum()) if "db2_total" in inv.columns else 0.0
    realised = db2_sum if db2_sum != 0 else (rev - unit_cost_train * qty)
    return realised, avg_price


def run_one(
    bundle_train,
    bundle_eval,
    article_id: str,
    global_win_rate: float,
) -> Optional[BacktestRow]:
    sku_inputs = cost_demand.compute_inputs(
        bundle_train.invoices,
        bundle_train.sku_forecasts,
        article_id,
        as_of=bundle_train.invoices["date"].max(),
    )
    if sku_inputs.current_price <= 0:
        return None

    wp = win_prob.fit(bundle_train.quotes, article_id, global_win_rate)
    churn_table = churn_response.build_table(
        bundle_train.churn,
        invoices=bundle_train.invoices,
        as_of=bundle_train.invoices["date"].max(),
    )

    customer_share_dict = scorer._customer_share(
        bundle_train.invoices, article_id, bundle_train.invoices["date"].max()
    )
    if not customer_share_dict:
        return None
    customer_ids = list(customer_share_dict.keys())
    customer_shares = np.array([customer_share_dict[c] for c in customer_ids])
    customer_alphas = churn_table.alpha(customer_ids)

    rec = scorer.optimise(sku_inputs, wp, customer_alphas, customer_shares)

    mc = monte_carlo.run(
        sku_inputs, wp, customer_alphas, customer_shares, rec.p_star, draws=400
    )

    s_p_actual = 0.0
    p_actual_eval = 0.0
    s_realised = 0.0
    if bundle_eval is not None:
        s_realised, p_actual_eval = realised_score(
            bundle_eval.invoices, article_id, sku_inputs.unit_cost
        )
        if p_actual_eval > 0:
            s_p_actual = scorer._score_at_price(
                p_actual_eval, sku_inputs, wp, customer_alphas, customer_shares
            )

    n_train_q = int((bundle_train.quotes["article_id"] == article_id).sum())
    n_eval_q = (
        int((bundle_eval.quotes["article_id"] == article_id).sum())
        if bundle_eval is not None
        else 0
    )

    return BacktestRow(
        article_id=article_id,
        n_train_quotes=n_train_q,
        n_eval_quotes=n_eval_q,
        current_price=sku_inputs.current_price,
        p_star=rec.p_star,
        p_actual_eval=p_actual_eval,
        s_engine_p_star=rec.s_star,
        s_engine_p_actual=s_p_actual,
        s_realised_eval=s_realised,
        mc_low=mc.ci_low,
        mc_high=mc.ci_high,
        mc_p_positive=mc.p_positive,
        constraint_active=rec.constraint_active,
    )


def aggregate_gates(rows: list[BacktestRow]) -> dict[str, float]:
    df = pd.DataFrame([r.__dict__ for r in rows])
    if df.empty:
        return {}
    df["lift_pct"] = (df["s_engine_p_star"] - df["s_engine_p_actual"]) / df[
        "s_engine_p_actual"
    ].abs().replace(0, np.nan) * 100.0
    df["coverage"] = (df["s_realised_eval"] >= df["mc_low"]) & (
        df["s_realised_eval"] <= df["mc_high"]
    )
    df["realised_positive"] = df["s_realised_eval"] > 0
    return {
        "n_skus": int(len(df)),
        "median_lift_pct": float(df["lift_pct"].median(skipna=True)),
        "mean_lift_pct": float(df["lift_pct"].mean(skipna=True)),
        "ci_coverage": float(df["coverage"].mean()),
        "share_p_positive_ge_80": float((df["mc_p_positive"] >= 0.80).mean()),
        "share_realised_positive": float(df["realised_positive"].mean()),
        "share_constraint_active": float(df["constraint_active"].notna().mean()),
    }
