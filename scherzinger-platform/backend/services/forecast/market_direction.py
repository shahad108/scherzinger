"""Market direction widget (Phase 7).

6–8 curated tiles + a WoW/MoM/YoY digest. Real path reads from
``market_series`` (populated by the notebook ETL); seed otherwise.
"""
from __future__ import annotations

from typing import Any

from sqlalchemy import text
from sqlalchemy.orm import Session


def _seed() -> dict[str, Any]:
    tiles = [
        {"name": "Steel HRC (Eurofer)", "value": 1180, "unit": "€/t", "wowPct": 1.2, "tone": "red", "context": "Trajectory steepening — +6.8% by Q3."},
        {"name": "EUR / USD", "value": 1.08, "unit": "FX", "wowPct": -0.3, "tone": "amber", "context": "USD strength on rate-divergence narrative."},
        {"name": "Alloys (Cr-Mo, Ni)", "value": 2840, "unit": "€/t", "wowPct": 0.4, "tone": "ink-3", "context": "Stable — 28% pass-through coverage."},
        {"name": "Copper LME", "value": 8420, "unit": "€/t", "wowPct": 3.1, "tone": "amber", "context": "China demand pulse + supply chatter."},
        {"name": "Energy (DE industrial)", "value": 0.184, "unit": "€/kWh", "wowPct": -2.4, "tone": "green", "context": "Mild April + storage levels easing."},
        {"name": "ifo Business Climate", "value": 87.2, "unit": "idx", "wowPct": 0.8, "tone": "green", "context": "Slight improvement; below 5y avg."},
        {"name": "German PMI", "value": 49.6, "unit": "idx", "wowPct": -0.4, "tone": "amber", "context": "Still contraction (<50); inventories drawing."},
        {"name": "VDMA orders (3mo MA)", "value": -3.2, "unit": "% YoY", "wowPct": 0.0, "tone": "amber", "context": "Recovery delayed — orders flat MoM."},
    ]
    digest = {
        "wow": "Mixed: copper +3.1%, energy −2.4%; steel still up.",
        "mom": "Steel HRC +2.8%, ifo +1.4pp, German PMI flat.",
        "yoy": "Energy −18%, steel +9%, FX −3% (vs USD).",
        "notes": "Watch copper next 2 weeks — China stimulus headline risk.",
    }
    return {"source": "seed", "tiles": tiles, "digest": digest}


def get_market_direction(db: Session | None) -> dict[str, Any]:
    if db is None:
        return _seed()
    try:
        rows = db.execute(text("""
            SELECT name, latest_value, unit, wow_pct, tone, context
            FROM market_series
            ORDER BY display_order
            LIMIT 8
        """)).fetchall()
    except Exception:
        return _seed()
    if not rows:
        return _seed()
    tiles = [
        {
            "name": r[0],
            "value": float(r[1]) if r[1] is not None else None,
            "unit": r[2] or "",
            "wowPct": float(r[3]) if r[3] is not None else 0.0,
            "tone": r[4] or "ink-3",
            "context": r[5] or "",
        }
        for r in rows
    ]
    return {"source": "live", "tiles": tiles, "digest": _seed()["digest"]}
