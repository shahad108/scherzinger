"""Tidy loaders for the Scherzinger parquet sources.

Every loader returns a pandas DataFrame with stable column names so downstream
modules don't have to know about the raw schema. No leakage: each loader takes
an optional `as_of` cutoff that filters out future data.
"""
from __future__ import annotations

from dataclasses import dataclass
from pathlib import Path
from typing import Optional

import pandas as pd

DATA_ROOT = Path("/Users/dharmendersingh/Documents/Scherzinger_new/Data/cleaned")
NOTEBOOK_OUTPUT = Path("/Users/dharmendersingh/Documents/Scherzinger_new/notebooks/output")


@dataclass(frozen=True)
class DataBundle:
    quotes: pd.DataFrame
    invoices: pd.DataFrame
    customers: pd.DataFrame
    products: pd.DataFrame
    sku_forecasts: pd.DataFrame
    customer_forecasts: pd.DataFrame
    churn: pd.DataFrame


def load_all(as_of: Optional[pd.Timestamp] = None) -> DataBundle:
    """Load every dataset, optionally filtering to `date <= as_of`.

    `as_of` enforces the no-leakage rule for walk-forward backtests.
    """
    quotes = pd.read_parquet(DATA_ROOT / "quotes_clean.parquet")
    invoices = pd.read_parquet(DATA_ROOT / "invoices_clean.parquet")
    customers = pd.read_parquet(DATA_ROOT / "customers.parquet")
    products = pd.read_parquet(DATA_ROOT / "products.parquet")
    sku_fc = pd.read_parquet(NOTEBOOK_OUTPUT / "sku_forecasts.parquet")
    cust_fc = pd.read_parquet(NOTEBOOK_OUTPUT / "customer_forecasts.parquet")
    churn = pd.read_csv(NOTEBOOK_OUTPUT / "churn_predictions.csv")

    quotes["date"] = pd.to_datetime(quotes["date"])
    invoices["date"] = pd.to_datetime(invoices["date"])

    # Derive per-unit price for quotes (revenue / quantity) for win-prob fit.
    qty = quotes["quantity"].replace(0, pd.NA)
    quotes = quotes.assign(price_per_unit=(quotes["revenue"] / qty))

    if as_of is not None:
        as_of = pd.Timestamp(as_of)
        quotes = quotes.loc[quotes["date"] <= as_of].copy()
        invoices = invoices.loc[invoices["date"] <= as_of].copy()

    return DataBundle(
        quotes=quotes,
        invoices=invoices,
        customers=customers,
        products=products,
        sku_forecasts=sku_fc,
        customer_forecasts=cust_fc,
        churn=churn,
    )


def eligible_skus(
    bundle: DataBundle,
    train_end: pd.Timestamp,
    eval_start: pd.Timestamp,
    eval_end: pd.Timestamp,
    min_quotes_train: int = 20,
    min_quotes_eval: int = 5,
) -> list[str]:
    """SKUs with enough quote density to be backtestable.

    Train window: any date <= train_end.
    Eval window: [eval_start, eval_end].
    """
    q = bundle.quotes
    train_counts = (
        q.loc[q["date"] <= train_end].groupby("article_id").size().rename("n_train")
    )
    eval_counts = (
        q.loc[(q["date"] >= eval_start) & (q["date"] <= eval_end)]
        .groupby("article_id")
        .size()
        .rename("n_eval")
    )
    joined = pd.concat([train_counts, eval_counts], axis=1).fillna(0).astype(int)
    eligible = joined.loc[
        (joined["n_train"] >= min_quotes_train) & (joined["n_eval"] >= min_quotes_eval)
    ]
    return eligible.index.tolist()
