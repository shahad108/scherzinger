"""Walk-forward backtest runner.

Train: all data up to 2024-12-31. Evaluate: 2025-01-01 to 2025-12-31.
Outputs:
    output/backtest_2025_rows.parquet
    output/backtest_2025_gates.json
"""
from __future__ import annotations

import json
import sys
import time
from pathlib import Path

import numpy as np
import pandas as pd

sys.path.insert(0, str(Path(__file__).parent))

from lib import data_loader, backtest

OUT = Path(__file__).parent / "output"
OUT.mkdir(parents=True, exist_ok=True)

TRAIN_END = pd.Timestamp("2024-12-31")
EVAL_START = pd.Timestamp("2025-01-01")
EVAL_END = pd.Timestamp("2025-12-31")


def main(max_skus: int | None = None) -> None:
    t0 = time.time()
    print(f"[load] reading data (no leakage past {TRAIN_END.date()})")
    bundle_train = data_loader.load_all(as_of=TRAIN_END)
    bundle_eval = data_loader.load_all()
    bundle_eval = type(bundle_eval)(
        quotes=bundle_eval.quotes[
            (bundle_eval.quotes["date"] >= EVAL_START)
            & (bundle_eval.quotes["date"] <= EVAL_END)
        ],
        invoices=bundle_eval.invoices[
            (bundle_eval.invoices["date"] >= EVAL_START)
            & (bundle_eval.invoices["date"] <= EVAL_END)
        ],
        customers=bundle_eval.customers,
        products=bundle_eval.products,
        sku_forecasts=bundle_eval.sku_forecasts,
        customer_forecasts=bundle_eval.customer_forecasts,
        churn=bundle_eval.churn,
    )

    global_win_rate = float(bundle_train.quotes["is_won"].mean())
    print(f"[load] train quotes={len(bundle_train.quotes)} invoices={len(bundle_train.invoices)}  win-rate={global_win_rate:.3f}")
    print(f"[load] eval  quotes={len(bundle_eval.quotes)} invoices={len(bundle_eval.invoices)}")

    eligible = data_loader.eligible_skus(
        # eligibility uses the FULL quotes panel; the loader's as_of trims it.
        bundle=type(bundle_train)(
            quotes=pd.concat([bundle_train.quotes, bundle_eval.quotes]),
            invoices=bundle_train.invoices,
            customers=bundle_train.customers,
            products=bundle_train.products,
            sku_forecasts=bundle_train.sku_forecasts,
            customer_forecasts=bundle_train.customer_forecasts,
            churn=bundle_train.churn,
        ),
        train_end=TRAIN_END,
        eval_start=EVAL_START,
        eval_end=EVAL_END,
        min_quotes_train=15,
        min_quotes_eval=3,
    )
    print(f"[elig] {len(eligible)} eligible SKUs")
    if max_skus is not None:
        eligible = eligible[:max_skus]
        print(f"[elig] limited to first {max_skus}")

    rows: list[backtest.BacktestRow] = []
    for i, aid in enumerate(eligible, 1):
        try:
            row = backtest.run_one(bundle_train, bundle_eval, aid, global_win_rate)
        except Exception as exc:
            print(f"[err] {aid}: {exc!r}")
            continue
        if row is None:
            continue
        rows.append(row)
        if i % 25 == 0 or i == len(eligible):
            print(f"[run] {i}/{len(eligible)}  t+{time.time()-t0:.1f}s")

    df = pd.DataFrame([r.__dict__ for r in rows])
    df.to_parquet(OUT / "backtest_2025_rows.parquet", index=False)

    gates = backtest.aggregate_gates(rows)
    (OUT / "backtest_2025_gates.json").write_text(json.dumps(gates, indent=2))

    print("\n=== 2025 walk-forward backtest gates ===")
    for k, v in gates.items():
        print(f"  {k:32s}  {v}")
    print(f"\n[done] {len(rows)} SKUs scored in {time.time()-t0:.1f}s")


if __name__ == "__main__":
    n = int(sys.argv[1]) if len(sys.argv) > 1 else None
    main(max_skus=n)
