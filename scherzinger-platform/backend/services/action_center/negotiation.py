"""Negotiation cockpit — commodity moves + discount gap.

Commodity tiles come from ``cost_service.get_cost_risers`` aggregated by
commodity_group. The discount-gap headline + summary text remain seeded
until margin_service.get_gap_analysis is wired (P14 follow-up).
"""
from __future__ import annotations

from typing import Any

from backend.database import SessionLocal
from backend.services import cost_service, margin_service

from ._seed import ActionCenterBlockError


_TONE_THRESHOLD_PP = 0.5  # |Δ| ≤ 0.5pp → flat


def _aggregate_by_group(rows: list[dict[str, Any]]) -> list[dict[str, Any]]:
    """Average cost_change_pct by commodity_group. Skip rows missing a group."""
    by_group: dict[str, list[float]] = {}
    for r in rows:
        g = (r.get("commodity_group") or "").strip()
        if not g:
            continue
        cc = r.get("cost_change_pct")
        if cc is None:
            continue
        by_group.setdefault(g, []).append(float(cc))
    tiles: list[dict[str, Any]] = []
    for group, vals in by_group.items():
        avg = sum(vals) / len(vals)
        tone = "positive" if avg > _TONE_THRESHOLD_PP else "negative" if avg < -_TONE_THRESHOLD_PP else "flat"
        tiles.append({
            "name": group,
            "delta": f"{'+' if avg >= 0 else ''}{avg:.1f}% YTD",
            "tone": tone,
        })
    # Largest absolute mover first — that's where the negotiation lever is.
    tiles.sort(key=lambda t: abs(float(t["delta"].rstrip("% YTD").rstrip())), reverse=True)
    if tiles:
        tiles[0]["note"] = "largest YTD move"
    return tiles


def _discount_gap(db) -> tuple[str, str] | None:
    """Catalog vs quoted margin spread. margin_service.get_catalog_vs_quoted
    returns a list of {category, count, revenue, avg_db2_margin}; we
    derive the headline as `quoted_margin − catalog_margin` in pp
    (negative means deals through quotes leak margin vs walk-in prices).
    """
    try:
        rows = margin_service.get_catalog_vs_quoted(db)
    except Exception:
        return None
    if not rows or not isinstance(rows, list):
        return None
    by_cat = {r.get("category"): r for r in rows if isinstance(r, dict)}
    quoted = by_cat.get("quoted") or {}
    catalog = by_cat.get("catalog") or {}
    q_avg = quoted.get("avg_db2_margin")
    c_avg = catalog.get("avg_db2_margin")
    if q_avg is None or c_avg is None:
        return None
    spread_pp = (float(q_avg) - float(c_avg)) * 100
    headline = f"{spread_pp:+.1f}pp"
    q_n = int(quoted.get("count") or 0)
    c_n = int(catalog.get("count") or 0)
    delta_label = f"quoted n={q_n:,} · catalog n={c_n:,}"
    return headline, delta_label


async def build() -> dict[str, Any]:
    try:
        with SessionLocal() as db:
            risers = cost_service.get_cost_risers(db, top=200)
            gap = _discount_gap(db)
        tiles = _aggregate_by_group(risers) if risers else []

        if not tiles:
            raise ActionCenterBlockError("negotiation", "Negotiation cockpit unavailable.")

        out: dict[str, Any] = {
            "discountGap": gap[0] if gap else "—",
            "discountGapDelta": gap[1] if gap else "—",
            "commodities": tiles[:8],
            "summary": [
                f"{tiles[0]['name']} {tiles[0]['delta']} — {tiles[0].get('note', 'lead mover')}",
                "Live commodity costs from product_cost_trends",
                "Negotiation window opens once moves cross ±5pp",
            ],
        }
        return out
    except ActionCenterBlockError:
        raise
    except Exception:
        raise ActionCenterBlockError("negotiation", "Negotiation cockpit unavailable.")
