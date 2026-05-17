"""Market direction widget (Phase 7).

We do NOT have external market feeds (Eurofer / LME / ECB / ifo).
This module mixes two approaches honestly:

* **Steel proxy** — derived from material_per_unit WoW trend in invoices,
  flagged ``external: false`` and labelled "internal proxy" so the FE
  doesn't claim live market data.
* **FX / PMI / ifo / VDMA** — synthetic demo values, each flagged
  ``external: false`` with a clear "synthetic for demo" caption.

When at least the steel proxy works, we return ``source: "live"``; otherwise
the whole widget falls back to ``source: "synthetic"``.
"""
from __future__ import annotations

from typing import Any

from sqlalchemy import text
from sqlalchemy.orm import Session


_SYNTHETIC_TILES = [
    {"name": "Steel HRC (Eurofer)", "value": 1180, "unit": "€/t", "wowPct": 1.2, "tone": "red",
     "context": "Trajectory steepening — +6.8% by Q3.", "external": False,
     "indicator": "⚠ synthetic for demo (no Eurofer feed)"},
    {"name": "EUR / USD", "value": 1.08, "unit": "FX", "wowPct": -0.3, "tone": "amber",
     "context": "USD strength on rate-divergence narrative.", "external": False,
     "indicator": "⚠ synthetic for demo (no ECB feed)"},
    {"name": "Alloys (Cr-Mo, Ni)", "value": 2840, "unit": "€/t", "wowPct": 0.4, "tone": "ink-3",
     "context": "Stable — 28% pass-through coverage.", "external": False,
     "indicator": "⚠ synthetic for demo (no LME feed)"},
    {"name": "Copper LME", "value": 8420, "unit": "€/t", "wowPct": 3.1, "tone": "amber",
     "context": "China demand pulse + supply chatter.", "external": False,
     "indicator": "⚠ synthetic for demo (no LME feed)"},
    {"name": "Energy (DE industrial)", "value": 0.184, "unit": "€/kWh", "wowPct": -2.4, "tone": "green",
     "context": "Mild April + storage levels easing.", "external": False,
     "indicator": "⚠ synthetic for demo (no BNetzA feed)"},
    {"name": "ifo Business Climate", "value": 87.2, "unit": "idx", "wowPct": 0.8, "tone": "green",
     "context": "Slight improvement; below 5y avg.", "external": False,
     "indicator": "⚠ synthetic for demo (no ifo feed)"},
    {"name": "German PMI", "value": 49.6, "unit": "idx", "wowPct": -0.4, "tone": "amber",
     "context": "Still contraction (<50); inventories drawing.", "external": False,
     "indicator": "⚠ synthetic for demo (no S&P PMI feed)"},
    {"name": "VDMA orders (3mo MA)", "value": -3.2, "unit": "% YoY", "wowPct": 0.0, "tone": "amber",
     "context": "Recovery delayed — orders flat MoM.", "external": False,
     "indicator": "⚠ synthetic for demo (no VDMA feed)"},
]

_DIGEST = {
    "wow": "Mixed signals — steel proxy from internal mix; FX/PMI/ifo synthetic.",
    "mom": "Steel proxy tracking internal material-cost trend.",
    "yoy": "External feeds pending integration.",
    "notes": "Tiles flagged external=false until live feeds are wired.",
}


def _seed() -> dict[str, Any]:
    return {"source": "synthetic", "tiles": _SYNTHETIC_TILES, "digest": _DIGEST}


def _steel_proxy_tile(db: Session) -> dict[str, Any] | None:
    """Approximate Steel HRC direction from internal material_per_unit trend.

    Compares the latest month's weighted avg material_per_unit to the prior
    month's. Returns a tile dict or None if data is missing.
    """
    try:
        rows = db.execute(text("""
            WITH bounds AS (SELECT MAX(date) AS max_d FROM invoices)
            SELECT EXTRACT(YEAR FROM date)::int AS y,
                   EXTRACT(MONTH FROM date)::int AS m,
                   SUM(material_per_unit * quantity) / NULLIF(SUM(quantity), 0) AS w_mat
            FROM invoices, bounds
            WHERE date > bounds.max_d - INTERVAL '90 days'
              AND material_per_unit IS NOT NULL
              AND quantity IS NOT NULL
            GROUP BY y, m
            ORDER BY y, m
        """)).fetchall()
    except Exception:
        return None
    rows = [r for r in rows if r[2] is not None]
    if len(rows) < 2:
        return None
    latest = float(rows[-1][2])
    prior = float(rows[-2][2])
    # D14: smoothing — if either side of the delta is near zero (mid-month
    # cutover, partial month, single-invoice noise), the % swing is a
    # division artifact, not a real signal. Suppress the WoW chip and
    # surface "n/a — insufficient prior period" instead of a -97% crash.
    MIN_VALUE = 1.0  # €/unit threshold; below this we treat the period as empty
    if (
        prior is None
        or latest is None
        or prior < MIN_VALUE
        or latest < MIN_VALUE
        or prior == 0
    ):
        return {
            "name": "Steel proxy (internal material/unit)",
            "value": round(latest, 2) if latest is not None else None,
            "unit": "€/unit",
            "wowPct": None,
            "wowLabel": "n/a — insufficient prior period",
            "tone": "amber",
            "context": (
                "Weighted material_per_unit MoM — internal proxy, NOT Eurofer. "
                "Delta suppressed: prior period below noise threshold."
            ),
            "external": False,
            "indicator": "internal proxy from invoices",
        }
    pct = (latest / prior - 1) * 100
    # Also suppress unrealistic single-week swings as a second guardrail.
    if abs(pct) > 50:
        return {
            "name": "Steel proxy (internal material/unit)",
            "value": round(latest, 2),
            "unit": "€/unit",
            "wowPct": None,
            "wowLabel": "n/a — single-period swing exceeded smoothing band",
            "tone": "amber",
            "context": (
                "Weighted material_per_unit MoM — internal proxy, NOT Eurofer. "
                f"Raw delta {pct:+.1f}% suppressed (>±50% threshold)."
            ),
            "external": False,
            "indicator": "internal proxy from invoices",
        }
    if pct > 1.5:
        tone = "red"
    elif pct < -1.5:
        tone = "green"
    else:
        tone = "amber"
    return {
        "name": "Steel proxy (internal material/unit)",
        "value": round(latest, 2),
        "unit": "€/unit",
        "wowPct": round(pct, 2),
        "tone": tone,
        "context": "Weighted material_per_unit MoM — internal proxy, NOT Eurofer.",
        "external": False,
        "indicator": "internal proxy from invoices",
    }


def get_market_direction(db: Session | None) -> dict[str, Any]:
    if db is None:
        return _seed()
    steel = _steel_proxy_tile(db)
    if steel is None:
        return _seed()

    # Replace the Steel HRC tile with the proxy; keep everything else synthetic-flagged.
    tiles: list[dict[str, Any]] = [steel]
    for t in _SYNTHETIC_TILES:
        if t["name"] == "Steel HRC (Eurofer)":
            continue
        tiles.append(t)

    if steel.get("wowPct") is not None:
        wow_text = f"Steel proxy {steel['wowPct']:+.2f}% MoM (internal); "
    else:
        wow_text = "Steel proxy delta suppressed (insufficient prior period); "
    return {
        "source": "live",
        "tiles": tiles,
        "digest": {
            **_DIGEST,
            "wow": wow_text + "FX/PMI/ifo synthetic — external feeds not wired.",
        },
    }
