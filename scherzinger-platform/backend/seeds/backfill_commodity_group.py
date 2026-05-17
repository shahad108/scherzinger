"""Backfill ``invoices.commodity_group`` from the raw products parquet.

The synthetic seeder leaves ``commodity_group`` NULL for many AIDs which
pollutes downstream aggregators that GROUP BY or filter on the field.
This script reads the raw products parquet (`Data/cleaned/products.parquet`)
and patches ``invoices.commodity_group`` for every AID that has a real
cluster in raw. Synthetic AIDs without a raw counterpart (e.g. STSEED-*,
ABE-*) keep their NULL — all SQL has to handle this case anyway.

Re-runnable: only updates NULL rows, never overwrites a non-NULL value.

Usage:
    cd scherzinger-platform
    .venv/bin/python -m backend.seeds.backfill_commodity_group
"""
from __future__ import annotations

import logging
from pathlib import Path
from typing import Optional

import pandas as pd
from sqlalchemy import text

from backend.database import SessionLocal

logger = logging.getLogger(__name__)

_RAW_PRODUCTS = Path(
    "/Users/dharmendersingh/Documents/Scherzinger_new/Data/cleaned/products.parquet"
)


def _load_product_map(path: Path = _RAW_PRODUCTS) -> dict[str, Optional[str]]:
    if not path.exists():
        logger.warning("backfill_commodity_group: raw products parquet not found: %s", path)
        return {}
    df = pd.read_parquet(path)
    out: dict[str, Optional[str]] = {}
    for aid, cg in zip(df["article_id"].astype(str), df["commodity_group"]):
        if cg is None or (isinstance(cg, float) and pd.isna(cg)):
            continue
        out[aid] = str(cg)
    return out


def run() -> dict[str, int]:
    """Backfill rows. Returns ``{"updated": N, "remaining_null": M}``."""
    pmap = _load_product_map()
    if not pmap:
        return {"updated": 0, "remaining_null": -1}

    with SessionLocal() as db:
        null_aids = [
            r[0]
            for r in db.execute(
                text("SELECT DISTINCT article_id FROM invoices WHERE commodity_group IS NULL")
            ).all()
        ]
        n_updated = 0
        for aid in null_aids:
            cg = pmap.get(str(aid))
            if not cg:
                continue
            n = db.execute(
                text(
                    "UPDATE invoices SET commodity_group = :cg "
                    "WHERE article_id = :aid AND commodity_group IS NULL"
                ),
                {"cg": cg, "aid": aid},
            ).rowcount
            n_updated += n or 0
        db.commit()
        remaining = db.execute(
            text("SELECT count(*) FROM invoices WHERE commodity_group IS NULL")
        ).scalar() or 0

    return {"updated": int(n_updated), "remaining_null": int(remaining)}


if __name__ == "__main__":
    logging.basicConfig(level=logging.INFO)
    result = run()
    print(
        f"Backfilled rows: {result['updated']}   "
        f"Remaining NULL: {result['remaining_null']}"
    )
