"""Phase 2 (Pricing Studio v3) — customer-on-SKU composer.

``build_customer_on_sku(aid, customer_id, *, proposed_price=None, db_session)``
produces a fully-populated ``CustomerOnSku`` for the Studio's customer
fanout panel + drill-in drawer.

Data sources (best-effort; loaders return ``None`` on missing data):
  - invoice ledger → last_paid, last_paid_at, ltm_units, ltm_eur, paid_band
  - customer risk scores → churn_p, decline_p
  - wallet share → wallet_share_pct (LTM EUR on SKU / LTM EUR all SKUs)
  - customer master → tier
  - customer_risk model → risk_if_moved (only when proposed_price given)

Each numeric carries a ``lineage_ref`` so downstream auditors can trace it.

The loaders are broken out (``_load_invoice_history``, etc) so tests can
monkey-patch them without spinning a database.
"""
from __future__ import annotations

import logging
from datetime import datetime
from decimal import Decimal, ROUND_HALF_UP
from typing import Optional

from sqlalchemy import text
from sqlalchemy.orm import Session

from backend.models.pricing.customer_on_sku import (
    CustomerOnSku,
    CustomerTier,
    PaidBand,
)
from backend.models.pricing.lineage import LineageRef, LineageSourceKind
from backend.services.pricing.customer_risk import risk_if_moved
from backend.services.pricing.lineage import create_lineage

logger = logging.getLogger(__name__)


# Minimum transaction count for paid_band to be statistically defensible.
PAID_BAND_MIN_N = 3


# ---------------------------------------------------------------------------
# Loaders — sliced for monkey-patching.
# ---------------------------------------------------------------------------


def _load_invoice_history(
    *, aid: str, customer_id: str, db_session: Session
) -> list[dict]:
    """Return the customer's per-transaction history on this SKU.

    Each row: {"date": datetime, "price": Decimal, "units": int, "won": bool}.
    Empty list when the customer has no recorded purchases for this aid.
    """
    try:
        rows = db_session.execute(
            text("""
                SELECT i.date, i.unit_price, i.quantity, i.revenue
                FROM invoices i
                WHERE i.customer_id = :cid
                  AND i.article_id = :aid
                ORDER BY i.date ASC
            """),
            {"cid": customer_id, "aid": aid},
        ).fetchall()
    except Exception:
        logger.exception(
            "customer_on_sku._load_invoice_history failed aid=%s cid=%s",
            aid,
            customer_id,
        )
        return []
    out: list[dict] = []
    for r in rows:
        price = Decimal(str(r[1])) if r[1] is not None else None
        if price is None:
            continue
        out.append(
            {
                "date": r[0],
                "price": price,
                "units": int(r[2] or 0),
                "revenue": Decimal(str(r[3] or 0)),
                # Won iff invoiced; the invoices table is post-decision.
                "won": True,
            }
        )
    return out


def _load_customer_master(
    *, customer_id: str, db_session: Session
) -> dict:
    """Return {"name", "tier"} or defaults if customer is unknown."""
    try:
        row = db_session.execute(
            text("""
                SELECT name, tier
                FROM customers
                WHERE customer_id = :cid
            """),
            {"cid": customer_id},
        ).fetchone()
    except Exception:
        logger.exception(
            "customer_on_sku._load_customer_master failed cid=%s", customer_id
        )
        row = None
    if row is None:
        return {"name": f"Customer {customer_id}", "tier": "C"}
    name = row[0] or f"Customer {customer_id}"
    tier = (row[1] or "C").upper()
    if tier not in ("A", "B", "C", "D"):
        tier = "C"
    return {"name": name, "tier": tier}


def _load_customer_risk_scores(
    *, customer_id: str, db_session: Session
) -> dict:
    """Return {"churn_p", "decline_p"} or both None when no scores exist.

    Aligned with ``services/forecast/customers.py``: the persisted score
    drives both views (churn = score × 0.85, decline = score).
    """
    try:
        row = db_session.execute(
            text("""
                SELECT risk_score
                FROM customer_risk_scores
                WHERE customer_id = :cid
                ORDER BY score_date DESC
                LIMIT 1
            """),
            {"cid": customer_id},
        ).fetchone()
    except Exception:
        logger.exception(
            "customer_on_sku._load_customer_risk_scores failed cid=%s", customer_id
        )
        row = None
    if row is None or row[0] is None:
        return {"churn_p": None, "decline_p": None}
    score = Decimal(str(row[0]))
    return {
        "churn_p": (score * Decimal("0.85")).quantize(
            Decimal("0.0001"), rounding=ROUND_HALF_UP
        ),
        "decline_p": score.quantize(Decimal("0.0001"), rounding=ROUND_HALF_UP),
    }


def _load_customer_ltm_eur(
    *, customer_id: str, db_session: Session
) -> Decimal:
    """LTM EUR across ALL SKUs for the wallet-share denominator."""
    try:
        row = db_session.execute(
            text("""
                SELECT COALESCE(SUM(revenue), 0)
                FROM invoices
                WHERE customer_id = :cid
                  AND date >= (SELECT MAX(date) - INTERVAL '12 months' FROM invoices)
            """),
            {"cid": customer_id},
        ).fetchone()
    except Exception:
        logger.exception(
            "customer_on_sku._load_customer_ltm_eur failed cid=%s", customer_id
        )
        return Decimal("0")
    if row is None or row[0] is None:
        return Decimal("0")
    return Decimal(str(row[0]))


def _persist_lineage(
    *, aid: str, customer_id: str, db_session: Session
) -> LineageRef:
    row = create_lineage(
        source_kind=LineageSourceKind.INVOICE_LEDGER,
        source_id=f"customer_on_sku:{aid}:{customer_id}",
        sql=(
            "SELECT date, unit_price, quantity, revenue FROM invoices "
            "WHERE customer_id = ? AND article_id = ? ORDER BY date"
        ),
        model="customer_on_sku_v1",
        computed_by="system",
        session=db_session,
    )
    return LineageRef(
        id=row.id,
        source_kind=row.source_kind,
        source_id=row.source_id,
        sql=row.sql,
        model=row.model,
        computed_at=row.computed_at,
        computed_by=row.computed_by,
    )


# ---------------------------------------------------------------------------
# Math helpers.
# ---------------------------------------------------------------------------


def _percentile(values: list[Decimal], q: Decimal) -> Decimal:
    """Linear-interpolation percentile across a sorted list.

    ``q`` is a fraction in [0, 1]. List MUST already be sorted ascending.
    Decimal-only math.
    """
    if not values:
        raise ValueError("empty list")
    n = len(values)
    if n == 1:
        return values[0]
    rank = q * Decimal(n - 1)
    lo = int(rank)
    hi = lo + 1
    if hi >= n:
        return values[-1]
    frac = rank - Decimal(lo)
    return (values[lo] * (Decimal(1) - frac) + values[hi] * frac).quantize(
        Decimal("0.0001"), rounding=ROUND_HALF_UP
    )


def _paid_band_from_history(history: list[dict]) -> Optional[PaidBand]:
    """Compute the p10/p50/p90 across the customer's paid prices.

    Returns ``None`` when the sample is below ``PAID_BAND_MIN_N`` — the
    bands are not defensible and the frontend renders a 'thin sample'
    badge instead.
    """
    if len(history) < PAID_BAND_MIN_N:
        return None
    prices = sorted([h["price"] for h in history if h.get("price") is not None])
    if len(prices) < PAID_BAND_MIN_N:
        return None
    return PaidBand(
        p10=_percentile(prices, Decimal("0.10")),
        p50=_percentile(prices, Decimal("0.50")),
        p90=_percentile(prices, Decimal("0.90")),
    )


def _trailing_year_filter(history: list[dict]) -> list[dict]:
    """Filter to the trailing-12-month slice. Empty list returns empty.

    Uses the most-recent transaction in the slice as 'today' so
    historical/seeded data still produces an LTM window.
    """
    if not history:
        return []
    # Already sorted ascending; the last row's date is the latest.
    latest = history[-1]["date"]
    if latest is None:
        return history
    # 365 days back
    from datetime import timedelta
    cutoff = latest - timedelta(days=365)
    return [h for h in history if h.get("date") is not None and h["date"] >= cutoff]


def _delta_pct(last_paid: Optional[Decimal], proposed: Optional[Decimal]) -> Decimal:
    """Return Δprice as percent points (e.g. +5 = +5%). Zero on missing data."""
    if last_paid is None or proposed is None or last_paid == 0:
        return Decimal("0")
    return ((proposed - last_paid) / last_paid * Decimal("100")).quantize(
        Decimal("0.0001"), rounding=ROUND_HALF_UP
    )


# ---------------------------------------------------------------------------
# Composer.
# ---------------------------------------------------------------------------


def build_customer_on_sku(
    *,
    aid: str,
    customer_id: str,
    proposed_price: Optional[Decimal] = None,
    db_session: Session,
) -> CustomerOnSku:
    """Build the per-(aid, customer_id) reality row.

    ``proposed_price`` drives ``risk_if_moved``. When omitted, the field
    is ``None`` (NOT zero — zero would conflate "no proposal" with "zero
    risk", and the frontend needs to distinguish the two).
    """
    history = _load_invoice_history(
        aid=aid, customer_id=customer_id, db_session=db_session
    )
    master = _load_customer_master(customer_id=customer_id, db_session=db_session)
    risk_scores = _load_customer_risk_scores(
        customer_id=customer_id, db_session=db_session
    )

    ltm = _trailing_year_filter(history)
    ltm_units = sum(int(h.get("units") or 0) for h in ltm)
    ltm_eur = sum(
        (h.get("revenue") or Decimal("0") for h in ltm),
        Decimal("0"),
    )

    last_paid: Optional[Decimal] = None
    last_paid_at: Optional[datetime] = None
    if history:
        last = history[-1]
        last_paid = last.get("price")
        last_paid_at = last.get("date")

    paid_band = _paid_band_from_history(history)

    customer_total_ltm = _load_customer_ltm_eur(
        customer_id=customer_id, db_session=db_session
    )
    wallet_share_pct: Optional[Decimal]
    if customer_total_ltm > 0:
        wallet_share_pct = (ltm_eur / customer_total_ltm).quantize(
            Decimal("0.0001"), rounding=ROUND_HALF_UP
        )
        if wallet_share_pct > 1:
            wallet_share_pct = Decimal("1")
    else:
        wallet_share_pct = None

    churn_p = risk_scores["churn_p"]
    decline_p = risk_scores["decline_p"]

    # risk_if_moved is only meaningful when proposed_price is given.
    risk: Optional[Decimal] = None
    if proposed_price is not None and churn_p is not None:
        delta = _delta_pct(last_paid, proposed_price)
        risk = risk_if_moved(
            churn_p=churn_p,
            wallet_share_pct=wallet_share_pct or Decimal("0"),
            delta_pct=delta,
        )

    lineage = _persist_lineage(
        aid=aid, customer_id=customer_id, db_session=db_session
    )

    tier_str = master.get("tier", "C")
    try:
        tier = CustomerTier(tier_str)
    except ValueError:
        tier = CustomerTier.C

    return CustomerOnSku(
        aid=aid,
        customer_id=customer_id,
        last_paid=last_paid,
        last_paid_at=last_paid_at,
        ltm_units=ltm_units,
        ltm_eur=(ltm_eur.quantize(Decimal("0.01"), rounding=ROUND_HALF_UP)
                 if ltm_eur else Decimal("0.00")),
        churn_p=churn_p,
        decline_p=decline_p,
        risk_if_moved=risk,
        wallet_share_pct=wallet_share_pct,
        paid_band=paid_band,
        tier=tier,
        lineage_ref=lineage,
    )
