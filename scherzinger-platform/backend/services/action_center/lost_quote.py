"""Lost-quote differential — Welch t-test on won/lost margin distribution.

Wraps quote_service.get_price_sensitivity. Falls back to the bundled
seed when no quote data has been loaded yet.
"""
from __future__ import annotations

from datetime import datetime
from typing import Any

from backend.database import SessionLocal
from backend.services import quote_service

from ._intents import lost_quote_action
from ._seed import ActionCenterBlockError


def _implication(differential_pp: float, p_value: float | None) -> str:
    if p_value is None:
        return "Not enough lost quotes to compute a Welch t-test."
    if p_value > 0.05:
        return "No significant gap between won and price-lost quote margins."
    if differential_pp >= 0:
        return (
            "Lost quotes carry HIGHER margin than won quotes — premium pricing is "
            "leaving deals on the table. Review price sensitivity on premium-tier SKUs."
        )
    return (
        "Lost quotes carry LOWER margin than won — discounting isn't winning the "
        "deals; competitor lead-time/quality is the likelier driver."
    )


async def build() -> dict[str, Any]:
    try:
        year = datetime.utcnow().year
        with SessionLocal() as db:
            sensitivity = quote_service.get_price_sensitivity(db, year=year)
            groups = {g["group"]: g for g in sensitivity.get("groups", [])}
            # If the current year is empty (early in the year, fresh load), step
            # back one year so the panel always reflects the most recent useful
            # signal rather than seed.
            if not any(g.get("count") for g in groups.values()):
                sensitivity = quote_service.get_price_sensitivity(db, year=year - 1)
                groups = {g["group"]: g for g in sensitivity.get("groups", [])}
            # Quote-to-invoice gap is the demo's headline pilot signal —
            # computed across the full linkage table, not gated by year.
            quote_invoice_gap = quote_service.get_quote_to_invoice_gap(db)
        won = groups.get("won")
        lost = groups.get("price_lost")
        if not won or not lost or won.get("avg_margin") is None or lost.get("avg_margin") is None:
            raise ActionCenterBlockError("lostQuote", "Lost-quote differential unavailable.")

        won_avg = float(won["avg_margin"]) * 100  # service returns 0..1
        lost_avg = float(lost["avg_margin"]) * 100
        diff = lost_avg - won_avg
        p_value = sensitivity.get("p_value")
        non_price = groups.get("non_price_lost") or {}
        linked = int(
            (won.get("count") or 0)
            + (lost.get("count") or 0)
            + (non_price.get("count") or 0)
        )
        return {
            "wonAvg": round(won_avg, 1),
            "lostAvg": round(lost_avg, 1),
            "differential": round(diff, 1),
            "pValue": round(float(p_value), 4) if p_value is not None else None,
            "implication": _implication(diff, p_value),
            "linkedRecords": linked,
            "quoteInvoiceGap": quote_invoice_gap,
            "action": lost_quote_action(),
        }
    except ActionCenterBlockError:
        raise
    except Exception:
        raise ActionCenterBlockError("lostQuote", "Lost-quote differential unavailable.")
