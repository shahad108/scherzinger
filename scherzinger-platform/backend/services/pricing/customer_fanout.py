"""Phase 2 (Pricing Studio v3) — customer-fanout composer.

Single source of truth for the per-(aid, proposed_price) fanout panel.
Used by:
  - the workbench composer (initial Studio load)
  - POST /screens/studio/fanout (reactive re-score on slider drag)

Each row carries the extended per-customer reality fields plus the
BFF-computed ``tone`` (alert/warn/plain) and a ``proposal_queued`` flag
indicating an active draft proposal already exists for the (customer, aid).

NOTE: tone IS BFF truth. The frontend renders the string but never
re-derives it — see ``customer_risk.compute_tone`` for the thresholds.
"""
from __future__ import annotations

import logging
import time
from collections import OrderedDict
from decimal import Decimal
from typing import Any, Optional
from uuid import UUID

from sqlalchemy.orm import Session

from backend.models.pricing.customer_on_sku import CustomerOnSku
from backend.services.pricing.cache_keys import canonical_price_key
from backend.services.pricing.customer_on_sku import build_customer_on_sku
from backend.services.pricing.customer_risk import compute_tone

logger = logging.getLogger(__name__)


# Re-score cache. Keyed by (aid, canonical proposed_price string). 60s TTL.
#
# OrderedDict + insertion-order eviction gives us a one-line LRU bound so a
# busy Studio session can't grow the cache without limit. The cap is
# generous (1024 entries ≈ ~17 SKUs × ~60 prices each) since each entry
# is only the small fanout payload.
_CACHE_TTL_SECONDS = 60.0
_CACHE_MAX_ENTRIES = 1024
_CACHE: "OrderedDict[tuple[str, str], tuple[float, dict[str, Any]]]" = OrderedDict()


def invalidate_cache(aid: Optional[str] = None) -> None:
    """Clear cached fanout rows.

    When ``aid`` is given, drop only that aid's slice (called from the
    customer_state.update fanout). Otherwise drop everything (test seam).
    """
    if aid is None:
        _CACHE.clear()
        return
    for key in [k for k in _CACHE if k[0] == aid]:
        _CACHE.pop(key, None)


def _serialize_row(
    *,
    cos: CustomerOnSku,
    proposal_queued: bool,
    customer_name: Optional[str] = None,
) -> dict[str, Any]:
    """Convert a CustomerOnSku + flags into the wire-shape fanout row."""
    risk = cos.risk_if_moved
    tone = compute_tone(risk)
    row = {
        "customer_id": cos.customer_id,
        "customer_name": customer_name or f"Customer {cos.customer_id}",
        "aid": cos.aid,
        "tier": cos.tier.value,
        "last_paid": str(cos.last_paid) if cos.last_paid is not None else None,
        "last_paid_at": (
            cos.last_paid_at.isoformat() if cos.last_paid_at is not None else None
        ),
        "ltm_units": cos.ltm_units,
        "ltm_eur": str(cos.ltm_eur) if cos.ltm_eur is not None else None,
        "wallet_share_pct": (
            str(cos.wallet_share_pct)
            if cos.wallet_share_pct is not None
            else None
        ),
        "paid_band": (
            {
                "p10": str(cos.paid_band.p10),
                "p50": str(cos.paid_band.p50),
                "p90": str(cos.paid_band.p90),
            }
            if cos.paid_band is not None
            else None
        ),
        "churn_p": str(cos.churn_p) if cos.churn_p is not None else None,
        "decline_p": str(cos.decline_p) if cos.decline_p is not None else None,
        "risk_if_moved": str(risk) if risk is not None else None,
        "tone": tone,
        "proposal_queued": proposal_queued,
        "lineage_ref_id": (
            str(cos.lineage_ref.id) if cos.lineage_ref is not None else None
        ),
    }
    return row


# ---------------------------------------------------------------------------
# Loaders — split for monkey-patching.
# ---------------------------------------------------------------------------


def _load_customer_ids_for_aid(*, aid: str, db_session: Session) -> list[str]:
    """All customer ids that have ever purchased the SKU. Ordered by LTM EUR DESC.

    Empty list when no invoices are recorded — caller handles the empty
    panel state.
    """
    from sqlalchemy import text
    try:
        rows = db_session.execute(
            text("""
                SELECT customer_id,
                       COALESCE(SUM(revenue), 0) AS ltm_eur
                FROM invoices
                WHERE article_id = :aid
                  AND date >= (SELECT MAX(date) - INTERVAL '12 months' FROM invoices)
                  -- D16: exclude synthetic ABE-* customer ids that leaked
                  -- into the seeded DB; they pollute the fanout list with
                  -- fake "customers" who never existed in the real ledger.
                  AND customer_id NOT LIKE 'ABE-%'
                GROUP BY customer_id
                ORDER BY ltm_eur DESC
                LIMIT 50
            """),
            {"aid": aid},
        ).fetchall()
    except Exception:
        logger.exception("customer_fanout._load_customer_ids_for_aid aid=%s", aid)
        return []
    return [str(r[0]) for r in rows if r[0] is not None]


# ---------------------------------------------------------------------------
# Bulk loaders — used by ``build_customer_fanout`` to avoid 4×N queries.
#
# Each returns a ``dict[str, Any]`` keyed by ``customer_id``. The fanout
# composer then passes each customer's slice into ``build_customer_on_sku``
# via the ``prefetched`` arg so the per-customer SELECTs are skipped.
# ---------------------------------------------------------------------------


def _bulk_load_history_on_aid(
    *, aid: str, customer_ids: list[str], db_session: Session
) -> dict[str, list[dict]]:
    """Per-customer invoice history on this SKU. Empty dict on failure."""
    if not customer_ids:
        return {}
    from sqlalchemy import bindparam, text
    from decimal import Decimal
    try:
        stmt = text("""
            SELECT customer_id, date, revenue_per_unit, quantity, revenue
            FROM invoices
            WHERE article_id = :aid
              AND customer_id IN :cids
            ORDER BY customer_id, date ASC
        """).bindparams(bindparam("cids", expanding=True))
        rows = db_session.execute(
            stmt,
            {"aid": aid, "cids": list(customer_ids)},
        ).fetchall()
    except Exception:
        logger.exception("customer_fanout._bulk_load_history_on_aid aid=%s", aid)
        return {}
    out: dict[str, list[dict]] = {cid: [] for cid in customer_ids}
    for r in rows:
        cid = str(r[0])
        price = Decimal(str(r[2])) if r[2] is not None else None
        if price is None:
            continue
        out.setdefault(cid, []).append(
            {
                "date": r[1],
                "price": price,
                "units": int(r[3] or 0),
                "revenue": Decimal(str(r[4] or 0)),
                "won": True,
            }
        )
    return out


def _bulk_load_master(
    *, customer_ids: list[str], db_session: Session
) -> dict[str, Optional[dict]]:
    """Per-customer master record (name/tier). Unknown ids map to None."""
    if not customer_ids:
        return {}
    from sqlalchemy import bindparam, text
    try:
        # ``tier`` lives on ``customer_on_sku`` (one row per (aid, customer));
        # the customer master only carries name. Pull the strongest tier
        # across the customer's SKUs (A > B > C > D) so the fanout label
        # is stable even when the specific SKU row is missing for a
        # customer.
        stmt = text(
            """
            SELECT c.customer_id, c.name,
                   COALESCE(t.tier, 'C') AS tier
            FROM customers c
            LEFT JOIN (
                SELECT customer_id, MIN(tier) AS tier
                FROM customer_on_sku
                WHERE tier IN ('A','B','C','D')
                GROUP BY customer_id
            ) t ON t.customer_id = c.customer_id
            WHERE c.customer_id IN :cids
            """
        ).bindparams(bindparam("cids", expanding=True))
        rows = db_session.execute(
            stmt, {"cids": list(customer_ids)}
        ).fetchall()
    except Exception:
        logger.exception("customer_fanout._bulk_load_master")
        return {cid: None for cid in customer_ids}
    out: dict[str, Optional[dict]] = {cid: None for cid in customer_ids}
    for r in rows:
        cid = str(r[0])
        name = r[1] or f"Customer {cid}"
        tier = (r[2] or "C").upper()
        if tier not in ("A", "B", "C", "D"):
            tier = "C"
        out[cid] = {"name": name, "tier": tier}
    return out


def _bulk_load_risk_scores(
    *, customer_ids: list[str], db_session: Session
) -> dict[str, dict]:
    """Per-customer churn_p/decline_p, both None when no score row exists.

    Churn damping factor is hoisted to a module constant on
    ``customer_on_sku`` for the single-customer path; we re-apply the
    same factor here so the bulk + single paths stay in sync.
    """
    from decimal import Decimal, ROUND_HALF_UP
    from sqlalchemy import bindparam, text
    default = {"churn_p": None, "decline_p": None}
    if not customer_ids:
        return {}
    try:
        stmt = text("""
            SELECT DISTINCT ON (customer_id) customer_id, risk_score
            FROM customer_risk_scores
            WHERE customer_id IN :cids
            ORDER BY customer_id, score_date DESC
        """).bindparams(bindparam("cids", expanding=True))
        rows = db_session.execute(
            stmt, {"cids": list(customer_ids)}
        ).fetchall()
    except Exception:
        logger.exception("customer_fanout._bulk_load_risk_scores")
        return {cid: dict(default) for cid in customer_ids}
    # Lazy import to keep the constant in one place.
    from backend.services.pricing.customer_on_sku import _CHURN_DAMPING_FACTOR
    out: dict[str, dict] = {cid: dict(default) for cid in customer_ids}
    for r in rows:
        cid = str(r[0])
        if r[1] is None:
            continue
        score = Decimal(str(r[1]))
        out[cid] = {
            "churn_p": (score * _CHURN_DAMPING_FACTOR).quantize(
                Decimal("0.0001"), rounding=ROUND_HALF_UP
            ),
            "decline_p": score.quantize(
                Decimal("0.0001"), rounding=ROUND_HALF_UP
            ),
        }
    return out


def _bulk_load_customer_ltm_eur(
    *, customer_ids: list[str], db_session: Session
) -> dict[str, "Decimal"]:
    """Per-customer LTM EUR across all SKUs (wallet-share denominator)."""
    from decimal import Decimal
    from sqlalchemy import bindparam, text
    if not customer_ids:
        return {}
    try:
        stmt = text("""
            SELECT customer_id, COALESCE(SUM(revenue), 0)
            FROM invoices
            WHERE customer_id IN :cids
              AND date >= (SELECT MAX(date) - INTERVAL '12 months' FROM invoices)
            GROUP BY customer_id
        """).bindparams(bindparam("cids", expanding=True))
        rows = db_session.execute(
            stmt, {"cids": list(customer_ids)}
        ).fetchall()
    except Exception:
        logger.exception("customer_fanout._bulk_load_customer_ltm_eur")
        return {cid: Decimal("0") for cid in customer_ids}
    out: dict[str, Decimal] = {cid: Decimal("0") for cid in customer_ids}
    for r in rows:
        cid = str(r[0])
        out[cid] = Decimal(str(r[1] or 0))
    return out


def _load_active_proposals_for_aid(
    *, aid: str, db_session: Session
) -> set[str]:
    """Set of customer_ids with an active (draft/submitted) proposal on this aid.

    Pulls ``pricing_proposals`` filtered by article_id + status; reads
    ``payload->>'customer_id'`` for the per-customer association.
    """
    from sqlalchemy import text
    try:
        rows = db_session.execute(
            text("""
                SELECT payload->>'customer_id' AS customer_id
                FROM pricing_proposals
                WHERE article_id = :aid
                  AND status IN ('draft', 'submitted', 'pending')
            """),
            {"aid": aid},
        ).fetchall()
    except Exception:
        logger.exception(
            "customer_fanout._load_active_proposals_for_aid aid=%s", aid
        )
        return set()
    out: set[str] = set()
    for r in rows:
        if r[0]:
            out.add(str(r[0]))
    return out


# ---------------------------------------------------------------------------
# Composer.
# ---------------------------------------------------------------------------


def build_customer_fanout(
    *,
    aid: str,
    proposed_price: Optional[Decimal] = None,
    db_session: Session,
    top_n: int = 6,
) -> dict[str, Any]:
    """Build the customer-fanout payload for (aid, proposed_price).

    Returns:
        {
            "aid": aid,
            "proposed_price": str | null,
            "rows": list[FanoutRow],
            "lineage_ref": str (uuid),
        }
    """
    cache_key = (aid, canonical_price_key(proposed_price))
    cached = _CACHE.get(cache_key)
    now = time.monotonic()
    if cached is not None and now - cached[0] < _CACHE_TTL_SECONDS:
        # Hit → bump LRU recency.
        _CACHE.move_to_end(cache_key)
        return cached[1]

    customer_ids = _load_customer_ids_for_aid(aid=aid, db_session=db_session)
    active = _load_active_proposals_for_aid(aid=aid, db_session=db_session)

    # SF2: bulk-load everything build_customer_on_sku needs in 4 queries
    # so the per-customer composer loop becomes O(N) Python — not O(4·N)
    # round-trips.
    visible = customer_ids[: max(top_n, 0)]
    history_by_cid = _bulk_load_history_on_aid(
        aid=aid, customer_ids=visible, db_session=db_session
    )
    master_by_cid = _bulk_load_master(
        customer_ids=visible, db_session=db_session
    )
    risk_by_cid = _bulk_load_risk_scores(
        customer_ids=visible, db_session=db_session
    )
    ltm_by_cid = _bulk_load_customer_ltm_eur(
        customer_ids=visible, db_session=db_session
    )

    rows: list[dict[str, Any]] = []
    last_lineage_id: Optional[UUID] = None
    for cid in visible:
        prefetched = {
            "history": history_by_cid.get(cid, []),
            "master": master_by_cid.get(cid),
            "risk_scores": risk_by_cid.get(cid, {"churn_p": None, "decline_p": None}),
            "customer_total_ltm": ltm_by_cid.get(cid),
        }
        try:
            cos = build_customer_on_sku(
                aid=aid,
                customer_id=cid,
                proposed_price=proposed_price,
                db_session=db_session,
                prefetched=prefetched,
            )
        except Exception:
            logger.exception("customer_fanout build_customer_on_sku aid=%s cid=%s",
                             aid, cid)
            continue
        rows.append(
            _serialize_row(cos=cos, proposal_queued=cid in active)
        )
        if cos.lineage_ref is not None:
            last_lineage_id = cos.lineage_ref.id

    # SF3 (Phase 2.2.5): BFF-computed context label so the workbench pane
    # header stays in sync with the re-score. When a proposed price was
    # supplied the label echoes ``at proposed €X.XX``; the no-price
    # default fanout reports ``cost-floor`` (matches the existing mock
    # pane subtitle so the legacy regex parse keeps working).
    if proposed_price is not None:
        # Emit a tabular-friendly two-decimal price so the workbench
        # subtitle looks consistent with the option chips.
        from decimal import ROUND_HALF_UP
        price_label = str(
            proposed_price.quantize(Decimal("0.01"), rounding=ROUND_HALF_UP)
        )
        context_label = f"at proposed €{price_label}"
    else:
        context_label = "cost-floor"

    payload: dict[str, Any] = {
        "aid": aid,
        "proposed_price": (
            str(proposed_price) if proposed_price is not None else None
        ),
        "context_label": context_label,
        "rows": rows,
        "lineage_ref": str(last_lineage_id) if last_lineage_id is not None else None,
    }
    _CACHE[cache_key] = (now, payload)
    _CACHE.move_to_end(cache_key)
    while len(_CACHE) > _CACHE_MAX_ENTRIES:
        _CACHE.popitem(last=False)  # drop oldest (LRU)
    return payload
