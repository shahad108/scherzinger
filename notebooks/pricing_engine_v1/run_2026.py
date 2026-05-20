"""Generate 2026 recommendations using all data through 2025-12-31.

No eval window — this is the forward run, not a backtest. Outputs:
    output/recommendations_2026.parquet
"""
from __future__ import annotations

import json
import sys
import time
from pathlib import Path

import numpy as np
import pandas as pd

sys.path.insert(0, str(Path(__file__).parent))

from lib import (
    backtest as bt_mod,
    churn_response,
    cost_demand,
    data_loader,
    monte_carlo,
    scorer,
    win_prob,
)

OUT = Path(__file__).parent / "output"
OUT.mkdir(parents=True, exist_ok=True)

AS_OF = pd.Timestamp("2025-12-31")

# Fix #3: apply the global scalar fitted on the 2025 backtest to the
# forward run so the portfolio number aligns with realised expectations.
try:
    _cal = json.loads((OUT / "conformal_scalar.json").read_text())
    GLOBAL_SCALAR = float(_cal.get("global_scalar", 1.0))
except FileNotFoundError:
    GLOBAL_SCALAR = 1.0


def main(max_skus: int | None = None) -> None:
    t0 = time.time()
    print(f"[load] reading data through {AS_OF.date()}")
    bundle = data_loader.load_all(as_of=AS_OF)
    global_win_rate = float(bundle.quotes["is_won"].mean())
    print(
        f"[load] quotes={len(bundle.quotes)} invoices={len(bundle.invoices)} win-rate={global_win_rate:.3f}"
    )

    # Eligibility: at least 15 quotes lifetime.
    counts = bundle.quotes.groupby("article_id").size()
    eligible = counts.loc[counts >= 15].index.tolist()
    print(f"[elig] {len(eligible)} SKUs with >=15 lifetime quotes")
    if max_skus is not None:
        eligible = eligible[:max_skus]

    rows = []
    for i, aid in enumerate(eligible, 1):
        try:
            sku_inputs = cost_demand.compute_inputs(
                bundle.invoices, bundle.sku_forecasts, aid, as_of=AS_OF
            )
            if sku_inputs.current_price <= 0:
                continue
            wp = win_prob.fit(bundle.quotes, aid, global_win_rate)
            churn_table = churn_response.build_table(
                bundle.churn,
                invoices=bundle.invoices,
                as_of=AS_OF,
            )
            share = scorer._customer_share(bundle.invoices, aid, AS_OF)
            if not share:
                continue
            cids = list(share.keys())
            customer_shares = np.array([share[c] for c in cids])
            customer_alphas = churn_table.alpha(cids)
            rec = scorer.optimise(sku_inputs, wp, customer_alphas, customer_shares)
            mc = monte_carlo.run(
                sku_inputs, wp, customer_alphas, customer_shares, rec.p_star, draws=400
            )
            rows.append(
                {
                    "article_id": aid,
                    "current_price": sku_inputs.current_price,
                    "unit_cost": sku_inputs.unit_cost,
                    "expected_volume_12mo": sku_inputs.expected_volume_12mo,
                    "n_customers": rec.n_customers,
                    "p_star": rec.p_star,
                    "delta_pct": (rec.p_star - sku_inputs.current_price)
                    / max(sku_inputs.current_price, 1e-9)
                    * 100.0,
                    "score_eur": rec.s_star,
                    "score_eur_calibrated": rec.s_star * GLOBAL_SCALAR,
                    "breakeven_price": rec.p_breakeven,
                    "mc_ci_low": mc.ci_low,
                    "mc_ci_high": mc.ci_high,
                    "mc_p_positive": mc.p_positive,
                    "driver_win_prob": rec.drivers.get("win_prob", 0.0),
                    "driver_cost": rec.drivers.get("cost", 0.0),
                    "driver_churn": rec.drivers.get("churn", 0.0),
                    "constraint_active": rec.constraint_active,
                    "wp_locked": wp.locked,
                    "wp_n_train": wp.n_train,
                }
            )
        except Exception as exc:
            print(f"[err] {aid}: {exc!r}")
        if i % 25 == 0 or i == len(eligible):
            print(f"[run] {i}/{len(eligible)}  t+{time.time()-t0:.1f}s")

    df = pd.DataFrame(rows)
    df.to_parquet(OUT / "recommendations_2026.parquet", index=False)
    df.to_csv(OUT / "recommendations_2026.csv", index=False)

    print("\n=== 2026 recommendations summary ===")
    print(f"  SKUs scored             {len(df)}")
    if len(df):
        print(f"  hold (Δ≈0%)             {(df['delta_pct'].abs() < 0.5).sum()}")
        print(f"  raise (Δ>+0.5%)         {(df['delta_pct'] > 0.5).sum()}")
        print(f"  lower (Δ<-0.5%)         {(df['delta_pct'] < -0.5).sum()}")
        print(f"  median Δ%               {df['delta_pct'].median():+.2f}")
        print(f"  mean   Δ%               {df['delta_pct'].mean():+.2f}")
        print(f"  P(score>0) ≥ 80%        {(df['mc_p_positive'] >= 0.80).sum()} / {len(df)}")
        print(f"  constraint active       {df['constraint_active'].notna().sum()}")
        print(f"  win-prob locked         {df['wp_locked'].sum()}")
        print(f"  total expected score €  {df['score_eur'].sum():,.0f}")
        print(f"  total expected (cal.) €  {df['score_eur_calibrated'].sum():,.0f}   (k={GLOBAL_SCALAR:.3f})")
    print(f"\n[done] t={time.time()-t0:.1f}s")


if __name__ == "__main__":
    n = int(sys.argv[1]) if len(sys.argv) > 1 else None
    main(max_skus=n)
