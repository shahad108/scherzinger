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
        # D5 / defect #8: KA ("order received without prior quote") is the
        # largest lost-revenue code historically. When the current-year slice
        # under-represents KA (recent data is cleaner), hoist KA from
        # all-time history onto the visible list with a data-quality chip
        # so it never disappears under the default `limit=5`. We also
        # recompute revenue shares over the FULL base (KA included).
        try:
            with SessionLocal() as db_alltime:
                alltime_rows = db_alltime.execute(__import__(
                    'sqlalchemy'
                ).text(
                    "SELECT q.rejection_code, COUNT(*), COALESCE(SUM(q.revenue),0) "
                    "FROM quotes q WHERE NOT q.is_won AND q.rejection_code IS NOT NULL "
                    "GROUP BY q.rejection_code ORDER BY 3 DESC"
                )).fetchall()
            ka_alltime = next(
                (r for r in alltime_rows if (r[0] or "").upper() == "KA"), None
            )
            if ka_alltime is not None:
                # KA may exist in the year-filtered slice with a tiny revenue
                # (e.g., 2025 had €1,434) while all-time KA dominates at €4.94M.
                # In that case, REPLACE the tiny row with the all-time KA
                # totals so the disclosure is meaningful.
                ka_in_raw_idx = next(
                    (i for i, r in enumerate(raw) if (r.get("code") or "").upper() == "KA"),
                    None,
                )
                ka_count = int(ka_alltime[1] or 0)
                ka_rev = float(ka_alltime[2] or 0)
                if ka_in_raw_idx is not None:
                    # Remove the tiny year-slice KA — we'll re-add with all-time.
                    del raw[ka_in_raw_idx]
                if True:
                    # Inject the all-time KA row at the top
                    base_total_rev = float(raw[0].get("total_lost_revenue") or 0)
                    base_total_cnt = int(raw[0].get("total_lost_count") or 0)
                    new_total_rev = base_total_rev + ka_rev
                    new_total_cnt = base_total_cnt + ka_count
                    # Recompute share for existing rows against the new denominator
                    for r in raw:
                        r["pct_of_lost_revenue"] = (
                            float(r.get("revenue") or 0) / new_total_rev
                            if new_total_rev > 0
                            else 0
                        )
                        r["total_lost_revenue"] = new_total_rev
                        r["total_lost_count"] = new_total_cnt
                    ka_row = {
                        "code": "KA",
                        "description_de": "Auftrag erteilt",
                        "description_en": "Order received without prior quote",
                        "interpretation": (
                            "All-time: largest lost-revenue bucket — treat as "
                            "'reason unrecorded' rather than a true rejection reason."
                        ),
                        "use_for_pricing": False,
                        "count": ka_count,
                        "revenue": ka_rev,
                        "pct_of_lost_revenue": (
                            ka_rev / new_total_rev if new_total_rev > 0 else 0
                        ),
                        "pct_of_lost": (
                            ka_count / new_total_cnt if new_total_cnt > 0 else 0
                        ),
                        "total_lost_revenue": new_total_rev,
                        "total_lost_count": new_total_cnt,
                        "warning": None,
                    }
                    # Place KA first; keep the rest in revenue order
                    raw = [ka_row] + raw
        except Exception:
            # If the all-time hoist fails just fall back to the year-filtered list.
            pass
        rows = [_row(i + 1, r) for i, r in enumerate(raw[:capped])]
        return rows
    except Exception:
        raise ActionCenterBlockError("rejections", "Rejection-code analysis unavailable.")
