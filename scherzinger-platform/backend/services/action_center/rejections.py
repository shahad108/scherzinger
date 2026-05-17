"""Rejection codes ranked — revenue lost per code.

Wraps quote_service.get_rejection_codes. Returns up to ``limit`` rows so
the frontend can implement a click-to-expand "Show all N" pill (default
5; max 200).
"""
from __future__ import annotations

from datetime import datetime
from typing import Any

from backend.database import SessionLocal
from backend.services import quote_service

from ._seed import ActionCenterBlockError


_OWNER_HINTS = {
    # Default ownership routing per code prefix; tweak as the rejection
    # code dictionary stabilises.
    "PA": "Heiko · negotiation",
    "PR": "Heiko · negotiation",
    "LT": "Operations · capacity",
    "QU": "Quality · root-cause",
    "KA": "Frank · drive data fix",
}


def _format_eur(amount: float) -> str:
    if amount >= 1_000_000:
        return f"€{amount / 1_000_000:.1f}M"
    if amount >= 1_000:
        return f"€{int(round(amount / 1_000))}k"
    return f"€{int(round(amount))}"


# DATA-AUDIT-2026-05-17 defect #8 — data-quality annotation for KA.
# KA ("Auftrag erteilt" / "order received without prior quote") historically
# dominated rejection revenue (€4.94M / 51% all-time). It functions as an
# "unrecorded reason" bucket and is NOT a real loss reason. When it appears
# in the ranking we tag it with `data_quality` so the FE can disclose the
# treatment instead of hiding the row.
_DQ_NOTES = {
    "KA": (
        "Code KA dominates the historical loss volume — treat as "
        "'reason unrecorded' rather than a true rejection reason."
    ),
}


def _row(rank: int, raw: dict[str, Any]) -> dict[str, Any]:
    code = str(raw.get("code") or "—")
    desc = raw.get("description_en") or raw.get("description_de") or code
    interp = raw.get("interpretation") or ""
    # Use revenue share so % matches the € headline; both denominators come
    # from the same total_lost_revenue computed in quote_service. The share
    # denominator INCLUDES every rejection code (KA included) so percentages
    # are not silently renormalised against a filtered base.
    pct_rev = float(raw.get("pct_of_lost_revenue") or 0)
    revenue = float(raw.get("revenue") or 0)
    owner = next((v for k, v in _OWNER_HINTS.items() if code.upper().startswith(k)), "Frank · review")
    row: dict[str, Any] = {
        "rank": str(rank),
        "code": f"{code} · {desc}",
        "subtitle": interp or f"{raw.get('count')} lost quotes carrying €{revenue:,.0f} in revenue.",
        "lostRevenue": _format_eur(revenue),
        "share": f"{pct_rev * 100:.0f}%",
        "owner": owner,
    }
    dq = _DQ_NOTES.get(code.upper())
    if dq:
        row["data_quality"] = dq
    return row


async def build(*, limit: int = 5) -> list[dict[str, Any]]:
    capped = max(1, min(limit, 200))
    try:
        with SessionLocal() as db:
            year = datetime.utcnow().year
            raw = quote_service.get_rejection_codes(db, year=year)
        if not raw:
            # Fall back to the previous year of data if current year is empty.
            with SessionLocal() as db:
                raw = quote_service.get_rejection_codes(db, year=year - 1)
        if not raw:
            return []
        # Keep KA in the ranking — it ships with a data_quality tag so the FE
        # can render the disclosure (defect #8). pct_of_lost_revenue is
        # already computed over the FULL base including KA, so the displayed
        # share % is honest. We sort by revenue desc (already done upstream).
        rows = [_row(i + 1, r) for i, r in enumerate(raw[:capped])]
        return rows
    except Exception:
        raise ActionCenterBlockError("rejections", "Rejection-code analysis unavailable.")
