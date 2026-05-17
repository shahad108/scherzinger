"""Seed price_state / cost_state / customer_on_sku for the Pricing Studio AIDs.

The Pricing Studio (frontend ``/pricing``) renders SKUs from
``backend/seeds/screens/studio.json``. On a fresh dev DB the underlying
state tables (``price_state``, ``cost_state``, ``customer_on_sku``) are
empty for those AIDs, so the recommender falls back to the LOW-confidence
"inputs available: cost=False, price=False" path on every panel.

This seeder is idempotent (UPSERT on the natural PKs / UNIQUE keys) and
deterministic per (aid, customer_id) so re-running produces the same rows.

Run with::

    .venv/bin/python -m backend.seeds.studio_aid_data
"""
from __future__ import annotations

import hashlib
import json
import logging
import random
import re
from datetime import datetime, timedelta, timezone
from decimal import Decimal
from pathlib import Path
from typing import Iterable

from sqlalchemy import text

from backend.database import SessionLocal

logger = logging.getLogger("seeds.studio_aid_data")
logging.basicConfig(level=logging.INFO, format="%(message)s")

# ---------------------------------------------------------------------------
# Studio AID source — parsed straight from the screen seed so the script
# stays in sync with whatever SKUs the studio actually renders.
# ---------------------------------------------------------------------------

STUDIO_SEED_PATH = (
    Path(__file__).resolve().parent / "screens" / "studio.json"
)

# Per-AID overrides that the studio screen seed already encodes
# (workbenchPatch.unitCost / currentPrice / annualUnits / customerCount).
# Anything missing falls back to parsing the ``meta`` string.

_PRICE_RE = re.compile(r"€([\d,\.]+)")


def _parse_meta_price(meta: str) -> Decimal | None:
    if not meta:
        return None
    m = _PRICE_RE.search(meta)
    if not m:
        return None
    raw = m.group(1).replace(",", "")
    try:
        return Decimal(raw)
    except Exception:
        return None


def _stable_rng(*parts: str) -> random.Random:
    """Deterministic RNG seeded by hashing the parts."""
    h = hashlib.sha256("|".join(parts).encode("utf-8")).hexdigest()
    return random.Random(int(h[:16], 16))


def _load_studio_skus() -> list[dict]:
    data = json.loads(STUDIO_SEED_PATH.read_text())
    skus: list[dict] = []
    for s in data.get("skus", []):
        aid = s["aid"]
        wb = s.get("workbenchPatch", {}) or {}
        # Prefer the workbench patch numbers — they're already the "truth"
        # the frontend assumes for the workbench inputs.
        cur = wb.get("currentPrice")
        cost = wb.get("unitCost")
        if cur is None:
            cur = _parse_meta_price(s.get("meta", ""))
        if cur is None:
            # Fallback synthetic — keep the row but use a sentinel price.
            cur = Decimal("100")
        cur = Decimal(str(cur))
        if cost is None:
            cost = (cur * Decimal("0.78")).quantize(Decimal("0.01"))
        else:
            cost = Decimal(str(cost))
        annual_units = wb.get("annualUnits") or 240
        customer_count = wb.get("customerCount") or 5
        cluster = (wb.get("customerCluster") or s.get("cluster") or "BKAGG").upper()
        skus.append(
            {
                "aid": aid,
                "cluster": cluster,
                "current_price": cur,
                "unit_cost": cost,
                "annual_units": int(annual_units),
                "customer_count": int(customer_count),
                "cost_breakdown": wb.get("cost") or {},
            }
        )
    return skus


# ---------------------------------------------------------------------------
# price_state
# ---------------------------------------------------------------------------

_UPSERT_PRICE = text(
    """
    INSERT INTO price_state (
        aid, current_price, currency, floor, ceiling, list_price,
        last_set_by, last_set_at, lineage_ref_id
    )
    VALUES (
        :aid, :current_price, :currency, :floor, :ceiling, :list_price,
        :last_set_by, :last_set_at, NULL
    )
    ON CONFLICT (aid) DO UPDATE SET
        current_price = EXCLUDED.current_price,
        currency = EXCLUDED.currency,
        floor = EXCLUDED.floor,
        ceiling = EXCLUDED.ceiling,
        list_price = EXCLUDED.list_price,
        last_set_by = EXCLUDED.last_set_by,
        last_set_at = EXCLUDED.last_set_at
    """
)


def _seed_price(db, sku: dict) -> None:
    cur = sku["current_price"]
    floor = (cur * Decimal("1.10")).quantize(Decimal("0.01"))
    ceiling = (cur * Decimal("1.45")).quantize(Decimal("0.01"))
    list_price = (cur * Decimal("1.10")).quantize(Decimal("0.01"))
    db.execute(
        _UPSERT_PRICE,
        {
            "aid": sku["aid"],
            "current_price": cur.quantize(Decimal("0.01")),
            "currency": "EUR",
            "floor": floor,
            "ceiling": ceiling,
            "list_price": list_price,
            "last_set_by": "system:studio-seed",
            "last_set_at": datetime.now(timezone.utc),
        },
    )


# ---------------------------------------------------------------------------
# cost_state
# ---------------------------------------------------------------------------

_UPSERT_COST = text(
    """
    INSERT INTO cost_state (
        aid, unit_cost, breakdown, last_ingested_at, trajectory_30d, lineage_ref_id
    )
    VALUES (
        :aid, :unit_cost, CAST(:breakdown AS jsonb), :last_ingested_at,
        CAST(:trajectory_30d AS jsonb), NULL
    )
    ON CONFLICT (aid) DO UPDATE SET
        unit_cost = EXCLUDED.unit_cost,
        breakdown = EXCLUDED.breakdown,
        last_ingested_at = EXCLUDED.last_ingested_at,
        trajectory_30d = EXCLUDED.trajectory_30d
    """
)


def _breakdown_for(sku: dict) -> dict:
    """Return a fractional cost breakdown summing to 1.0.

    If the studio seed already has a numeric ``cost`` block (material/labor/
    outsourcing/overhead), honour those weights. Otherwise generate
    deterministic weights by hashing the aid.
    """
    raw = sku.get("cost_breakdown") or {}
    # Studio's workbenchPatch.cost values are %-like ints (38, 24, 30, 8).
    parts: dict[str, float] = {}
    for k in ("material", "labor", "outsourcing", "overhead"):
        v = raw.get(k)
        if v is not None:
            try:
                parts[k] = float(v)
            except Exception:
                parts[k] = 0.0
    total = sum(parts.values())
    if total > 0:
        return {k: round(v / total, 4) for k, v in parts.items()}

    # Deterministic fallback — vary material 0.45..0.60 by hash.
    rng = _stable_rng("cost-breakdown", sku["aid"])
    material = round(0.45 + rng.random() * 0.15, 4)
    labor = round((1 - material) * (0.40 + rng.random() * 0.10), 4)
    outsourcing = round((1 - material - labor) * (0.55 + rng.random() * 0.15), 4)
    overhead = round(1 - material - labor - outsourcing, 4)
    return {
        "material": material,
        "labor": labor,
        "outsourcing": outsourcing,
        "overhead": overhead,
    }


def _trajectory_for(sku: dict) -> list[dict]:
    """Six-point monthly trajectory ending at ``unit_cost``, with a 4–8%
    rise across the window. Deterministic per aid."""
    rng = _stable_rng("cost-traj", sku["aid"])
    rise_pct = 0.04 + rng.random() * 0.04  # 4–8%
    end_cost = float(sku["unit_cost"])
    start_cost = end_cost / (1 + rise_pct)
    points = []
    now = datetime.now(timezone.utc)
    for i in range(6):
        # i=0 is 5*30 days ago, i=5 is "now"
        frac = i / 5.0
        cost = start_cost + (end_cost - start_cost) * frac
        date = now - timedelta(days=(5 - i) * 30)
        points.append(
            {
                "date": date.date().isoformat(),
                "unit_cost": round(cost, 4),
            }
        )
    return points


def _seed_cost(db, sku: dict) -> None:
    breakdown = _breakdown_for(sku)
    trajectory = _trajectory_for(sku)
    db.execute(
        _UPSERT_COST,
        {
            "aid": sku["aid"],
            "unit_cost": sku["unit_cost"].quantize(Decimal("0.0001")),
            "breakdown": json.dumps(breakdown),
            "last_ingested_at": datetime.now(timezone.utc),
            "trajectory_30d": json.dumps(trajectory),
        },
    )


# ---------------------------------------------------------------------------
# customer_on_sku
# ---------------------------------------------------------------------------

_UPSERT_COS = text(
    """
    INSERT INTO customer_on_sku (
        id, aid, customer_id, last_paid, last_paid_at, ltm_units,
        churn_p, wallet_share_pct, tier, lineage_ref_id, updated_at
    )
    VALUES (
        gen_random_uuid(), :aid, :customer_id, :last_paid, :last_paid_at,
        :ltm_units, :churn_p, :wallet_share_pct, :tier, NULL, :updated_at
    )
    ON CONFLICT (aid, customer_id) DO UPDATE SET
        last_paid = EXCLUDED.last_paid,
        last_paid_at = EXCLUDED.last_paid_at,
        ltm_units = EXCLUDED.ltm_units,
        churn_p = EXCLUDED.churn_p,
        wallet_share_pct = EXCLUDED.wallet_share_pct,
        tier = EXCLUDED.tier,
        updated_at = EXCLUDED.updated_at
    """
)


_TIER_CHURN = {
    "A": 0.05,
    "B": 0.12,
    "C": 0.20,
    "D": 0.65,
}


def _pick_customers(db, n: int, sku_seed: str) -> list[str]:
    """Pick ``n`` customer_ids deterministically.

    Order customers by hash(seed + customer_id) so the same SKU always
    gets the same buyer roster, regardless of insert order in customers.
    """
    rows = db.execute(
        text("SELECT customer_id FROM customers")
    ).fetchall()
    ids = [r[0] for r in rows]
    if not ids:
        return []
    # Deterministic shuffle.
    def keyfn(cid: str) -> str:
        return hashlib.sha256(f"{sku_seed}|{cid}".encode("utf-8")).hexdigest()

    ids.sort(key=keyfn)
    return ids[:n]


def _seed_customer_on_sku(db, sku: dict) -> int:
    n_customers = max(3, min(8, sku["customer_count"] + 2))
    customer_ids = _pick_customers(db, n_customers, sku["aid"])
    if not customer_ids:
        return 0

    rng = _stable_rng("cos", sku["aid"])
    cur = float(sku["current_price"])

    # Generate raw (units, price) per customer; we'll normalise wallet share.
    rows = []
    for idx, cid in enumerate(customer_ids):
        # Tier by rank: top buyer = A, next ~25% = B, next ~25% = C, rest = D.
        if idx == 0:
            tier = "A"
        elif idx <= max(1, n_customers // 4):
            tier = "B"
        elif idx <= max(2, n_customers // 2):
            tier = "C"
        else:
            tier = "D"

        # Units pull: A buys lots, D buys little.
        units_base = {
            "A": rng.randint(600, 2000),
            "B": rng.randint(300, 900),
            "C": rng.randint(150, 500),
            "D": rng.randint(80, 250),
        }[tier]
        jitter = 0.8 + rng.random() * 0.6  # 0.8..1.4
        last_paid = round(cur * jitter, 2)
        # Last paid within last 18 months.
        days_back = rng.randint(15, 540)
        last_paid_at = datetime.now(timezone.utc) - timedelta(days=days_back)
        churn = max(0.0, min(0.95, _TIER_CHURN[tier] + (rng.random() - 0.5) * 0.06))
        rows.append(
            {
                "customer_id": cid,
                "tier": tier,
                "ltm_units": units_base,
                "last_paid": Decimal(str(last_paid)),
                "last_paid_at": last_paid_at,
                "churn_p": Decimal(str(round(churn, 4))),
                "revenue": units_base * last_paid,
            }
        )

    total_rev = sum(r["revenue"] for r in rows) or 1.0
    for r in rows:
        r["wallet_share_pct"] = Decimal(str(round(r["revenue"] / total_rev, 4)))

    now = datetime.now(timezone.utc)
    for r in rows:
        db.execute(
            _UPSERT_COS,
            {
                "aid": sku["aid"],
                "customer_id": r["customer_id"],
                "last_paid": r["last_paid"],
                "last_paid_at": r["last_paid_at"],
                "ltm_units": r["ltm_units"],
                "churn_p": r["churn_p"],
                "wallet_share_pct": r["wallet_share_pct"],
                "tier": r["tier"],
                "updated_at": now,
            },
        )
    return len(rows)


# ---------------------------------------------------------------------------
# quotes — synthetic won/lost deals so the elasticity curve has a real fit
# instead of falling back to the flat-50% confidence_band=None curve.
# ---------------------------------------------------------------------------

# Marker used in quote_id so we can identify (and overwrite) our own
# synthetic rows on re-seed without nuking real fixture data.
_QUOTE_TAG = "STUDIO-SEED"


def _seed_quotes(db, sku: dict) -> int:
    """Generate ~20 synthetic quotes (mix of won/lost) per AID.

    The elasticity fitter needs ≥ 8 rows with hkvoll > 0 to escape the
    flat-50% fallback. We seed 20 deals spread over the last 18 months,
    each pulled from a synthetic logistic with sensible slope so the
    recommender lands on a price between the cost-floor and the
    competitor band.

    Deterministic per aid via the stable RNG, idempotent via DELETE-then-
    INSERT on a tagged quote_id namespace.
    """
    cur = float(sku["current_price"])
    unit_cost = float(sku["unit_cost"])
    cluster = sku["cluster"]

    rng = _stable_rng("quotes", sku["aid"])
    # Wipe prior synthetic rows for this aid so re-runs stay deterministic.
    db.execute(
        text(
            "DELETE FROM quotes WHERE article_id = :aid AND quote_id LIKE :tag"
        ),
        {"aid": sku["aid"], "tag": f"{_QUOTE_TAG}-%"},
    )

    n_quotes = 20
    # Pick customers — these need to exist (FK-free but used for fanout).
    customer_rows = db.execute(
        text("SELECT customer_id FROM customers LIMIT 200")
    ).fetchall()
    if not customer_rows:
        return 0
    customers = [r[0] for r in customer_rows]

    inserted = 0
    base_date = datetime.now(timezone.utc).date()
    for i in range(n_quotes):
        # Force at least 6 won and 6 lost (rest random) so the logistic
        # has a non-degenerate sample. Won deals are anchored tightly to
        # current price (±10%) so the WTP band stays narrow enough to
        # clear the (p90-p10)/p50 ≤ 0.5 confidence rule. Lost deals sit
        # 15–35% above current to give the curve real signal.
        if i < 6:
            is_won = True
            price_mult = 0.92 + rng.random() * 0.16  # 0.92..1.08
        elif i < 12:
            is_won = False
            price_mult = 1.15 + rng.random() * 0.20  # 1.15..1.35
        else:
            # Mixed; bias towards current price.
            price_mult = 0.90 + rng.random() * 0.40  # 0.90..1.30
            # Won probability tapers with price.
            is_won = rng.random() < max(0.05, 1.2 - price_mult)
        unit_price = round(cur * price_mult, 2)
        quantity = rng.randint(1, 50)
        revenue = round(unit_price * quantity, 2)
        # Per-unit cost stable, small noise.
        cost_per_unit = unit_cost * (0.95 + rng.random() * 0.10)
        hkvoll = round(cost_per_unit * quantity, 2)
        days_back = rng.randint(30, 540)
        date = base_date - timedelta(days=days_back)
        cid = customers[i % len(customers)]
        quote_id = f"{_QUOTE_TAG}-{sku['aid']}-{i:02d}"
        db.execute(
            text(
                """
                INSERT INTO quotes (
                    quote_id, position, status_code, status, is_won, date,
                    customer_id, article_id, business_unit, commodity_group,
                    currency, exchange_rate, quantity, revenue, hkvoll,
                    db2_total, db2_margin, rejection_code_reliable,
                    year, quarter, month,
                    dq_missing_cost, dq_100pct_margin, dq_any_issue
                ) VALUES (
                    :quote_id, :position, :status_code, :status, :is_won, :date,
                    :customer_id, :article_id, :business_unit, :commodity_group,
                    :currency, :exchange_rate, :quantity, :revenue, :hkvoll,
                    :db2_total, :db2_margin, :rcr,
                    :year, :quarter, :month,
                    FALSE, FALSE, FALSE
                )
                """
            ),
            {
                "quote_id": quote_id,
                "position": 10,
                "status_code": 9 if is_won else 5,
                "status": "won" if is_won else "lost",
                "is_won": bool(is_won),
                "date": date,
                "customer_id": cid,
                "article_id": sku["aid"],
                "business_unit": "BU001",
                "commodity_group": cluster,
                "currency": "EUR",
                "exchange_rate": 1.0,
                "quantity": quantity,
                "revenue": revenue,
                "hkvoll": hkvoll,
                "db2_total": round(revenue - hkvoll, 2),
                "db2_margin": round((revenue - hkvoll) / max(revenue, 1e-6), 4),
                "rcr": False,
                "year": date.year,
                "quarter": (date.month - 1) // 3 + 1,
                "month": date.month,
            },
        )
        inserted += 1
    return inserted


# ---------------------------------------------------------------------------
# Entrypoint
# ---------------------------------------------------------------------------


def seed_all() -> None:
    skus = _load_studio_skus()
    logger.info("Loaded %d studio SKUs from %s", len(skus), STUDIO_SEED_PATH)

    counts = {
        "price_state": 0,
        "cost_state": 0,
        "customer_on_sku": 0,
        "quotes": 0,
    }
    with SessionLocal() as db:
        for sku in skus:
            _seed_price(db, sku)
            counts["price_state"] += 1
            _seed_cost(db, sku)
            counts["cost_state"] += 1
            n_cos = _seed_customer_on_sku(db, sku)
            counts["customer_on_sku"] += n_cos
            n_q = _seed_quotes(db, sku)
            counts["quotes"] += n_q
            logger.info(
                "  %s  price OK  cost OK  customer_on_sku +%d  quotes +%d",
                sku["aid"],
                n_cos,
                n_q,
            )
        db.commit()

    logger.info("Done. Upserts: %s", counts)


if __name__ == "__main__":
    seed_all()
