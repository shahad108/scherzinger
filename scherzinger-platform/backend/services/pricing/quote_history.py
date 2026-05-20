"""Pricing Studio v3 / Phase E — SKU quote history endpoint data source.

GET /api/v1/pricing/sku/{aid}/quote-history?limit=50

Returns the most recent quotes for a SKU, joined with
``quote_invoice_links`` so the UI can show quoted-vs-realised DB2 margin
for the won quotes that landed an invoice.

Wire contract (see plan §5, row E3):

    {
        "status": "live" | "empty" | "degraded",
        "reason": str | None,
        "rows": [
            {
              "quote_id": str,
              "position": int,
              "date": "YYYY-MM-DD",
              "customer_id": str,
              "is_won": bool,
              "status": str,
              "quantity": int | None,
              "revenue": str | None,                # Decimal-as-string
              "quoted_db2_margin": str | None,      # Decimal-as-string
              "actual_db2_margin": str | None,      # Decimal-as-string
              "margin_gap": str | None,             # Decimal-as-string
              "rejection_code": str | None,
              "currency": str | None,
            }, ...
        ],
        "summary": {
            "n_total": int,
            "n_won": int,
            "n_lost": int,
            "win_rate": str | None,                  # Decimal-as-string, 4dp
        },
        "lineage_ref_id": str | None,
    }

All monetary / ratio fields are serialised as Decimal-as-string so the
frontend can compare them losslessly across responses (Iron rule §2).
"""
from __future__ import annotations

import logging
from decimal import Decimal
from typing import Any, Optional

from sqlalchemy.orm import Session

from backend.models.linkage import QuoteInvoiceLink
from backend.models.pricing.lineage import LineageSourceKind
from backend.models.quote import Quote
from backend.services.pricing.lineage import create_lineage

logger = logging.getLogger(__name__)


def _to_decimal_str(value: Any, *, places: int = 4) -> Optional[str]:
    """Render a numeric value as a Decimal-string with fixed precision.

    None / non-finite inputs are returned as None so the frontend can
    distinguish "no data" from "0.0000".
    """
    if value is None:
        return None
    try:
        dec = Decimal(str(value))
    except Exception:
        logger.exception("quote_history._to_decimal_str failed value=%r", value)
        return None
    if not dec.is_finite():
        return None
    quantizer = Decimal("1").scaleb(-places)
    return str(dec.quantize(quantizer))


def _empty_summary() -> dict[str, Any]:
    return {
        "n_total": 0,
        "n_won": 0,
        "n_lost": 0,
        "win_rate": None,
    }


def _degraded(reason: str) -> dict[str, Any]:
    return {
        "status": "degraded",
        "reason": reason,
        "rows": [],
        "summary": _empty_summary(),
        "lineage_ref_id": None,
    }


def get_quote_history(
    db: Session,
    *,
    aid: str,
    limit: int = 50,
) -> dict[str, Any]:
    """Return recent quotes for ``aid`` with quoted-vs-actual margin info."""
    capped_limit = max(1, min(int(limit or 50), 200))
    try:
        quote_rows = (
            db.query(Quote)
            .filter(Quote.article_id == aid)
            .order_by(Quote.date.desc(), Quote.quote_id.desc(), Quote.position.asc())
            .limit(capped_limit)
            .all()
        )

        # Bulk-fetch matching invoice links so we make at most one extra
        # query regardless of how many quotes we returned.
        link_keys = {(q.quote_id, q.position) for q in quote_rows}
        link_map: dict[tuple[str, int], QuoteInvoiceLink] = {}
        if link_keys:
            quote_ids = list({k[0] for k in link_keys})
            link_rows = (
                db.query(QuoteInvoiceLink)
                .filter(QuoteInvoiceLink.quote_id.in_(quote_ids))
                .all()
            )
            for link in link_rows:
                key = (link.quote_id, link.quote_position)
                if key in link_keys and key not in link_map:
                    link_map[key] = link

        rows: list[dict[str, Any]] = []
        n_won = 0
        n_lost = 0
        for q in quote_rows:
            link = link_map.get((q.quote_id, q.position))
            actual_margin = link.actual_db2_margin if link else None
            margin_gap = link.margin_gap if link else None
            if q.is_won:
                n_won += 1
            else:
                n_lost += 1
            rows.append(
                {
                    "quote_id": q.quote_id,
                    "position": int(q.position),
                    "date": q.date.isoformat() if q.date is not None else None,
                    "customer_id": q.customer_id,
                    "is_won": bool(q.is_won),
                    "status": q.status,
                    "quantity": int(q.quantity) if q.quantity is not None else None,
                    "revenue": _to_decimal_str(q.revenue, places=2),
                    "quoted_db2_margin": _to_decimal_str(q.db2_margin, places=4),
                    "actual_db2_margin": _to_decimal_str(actual_margin, places=4),
                    "margin_gap": _to_decimal_str(margin_gap, places=4),
                    "rejection_code": q.rejection_code,
                    "currency": q.currency,
                }
            )

        n_total = len(rows)
        if n_total == 0:
            return {
                "status": "empty",
                "reason": "No quote history for SKU",
                "rows": [],
                "summary": _empty_summary(),
                "lineage_ref_id": None,
            }

        win_rate_str: Optional[str] = None
        if n_total > 0:
            win_rate = Decimal(n_won) / Decimal(n_total)
            win_rate_str = str(win_rate.quantize(Decimal("0.0001")))

        # Write a lineage row so the audit drawer can trace this list.
        lineage_id: Optional[str] = None
        try:
            lineage = create_lineage(
                source_kind=LineageSourceKind.INVOICE_LEDGER,
                source_id=f"quote_history:{aid}:{capped_limit}",
                sql=(
                    "SELECT q.*, l.actual_db2_margin, l.margin_gap "
                    "FROM quotes q LEFT JOIN quote_invoice_links l "
                    "ON l.quote_id = q.quote_id "
                    "AND l.quote_position = q.position "
                    "WHERE q.article_id = ? ORDER BY q.date DESC LIMIT ?"
                ),
                model="quote_history_v1",
                computed_by="system",
                session=db,
            )
            lineage_id = str(lineage.id)
        except Exception:
            logger.exception(
                "quote_history.get_quote_history: lineage write failed aid=%s",
                aid,
            )
            try:
                db.rollback()
            except Exception:
                logger.exception(
                    "quote_history.get_quote_history: rollback after lineage failure aid=%s",
                    aid,
                )

        return {
            "status": "live",
            "reason": None,
            "rows": rows,
            "summary": {
                "n_total": n_total,
                "n_won": n_won,
                "n_lost": n_lost,
                "win_rate": win_rate_str,
            },
            "lineage_ref_id": lineage_id,
        }
    except Exception:
        logger.exception("quote_history.get_quote_history failed aid=%s", aid)
        try:
            db.rollback()
        except Exception:
            logger.exception(
                "quote_history.get_quote_history: rollback failed aid=%s", aid
            )
        return _degraded("Query error")
