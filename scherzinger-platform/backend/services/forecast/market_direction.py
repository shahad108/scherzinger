"""Market direction widget (Phase 7) — live feeds from FRED.

The 8 tiles displayed in the forecast page's "External market direction"
strip are now driven by real series from
``notebooks/output/market_series.parquet`` (built by the forecasting
notebook from FRED + EIA + ECB).

Each tile resolves to ``external: True`` and carries a provenance indicator
like ``FRED · WPU101 · 2026-04`` when the live observation is available.
When a particular series is missing or stale, that tile falls back to the
internal proxy (steel) or a clearly-flagged synthetic placeholder so the
strip never crashes.
"""
from __future__ import annotations

from typing import Any

from sqlalchemy import text
from sqlalchemy.orm import Session

from .market_feeds import MarketObs, freq_for, latest_for


# ---------------------------------------------------------------------------
# Tile catalogue. Each entry maps a display name to:
#   - the FRED series id we read,
#   - a display unit (overrides the FRED unit which is often verbose),
#   - amber/red thresholds for the tone (% change of latest vs prior obs).
# Synthetic fall-backs are kept ONLY as a last resort if the parquet is
# missing entirely.
# ---------------------------------------------------------------------------
_TILE_CATALOGUE: list[dict[str, Any]] = [
    {
        "label": "Steel PPI (US, FRED WPU101)",
        "series_id": "WPU101",
        "unit": "idx 1982=100",
        "amber_pct": 1.5,
        "red_pct": 3.0,
        "context_template": "FRED WPU101 — iron & steel producer-price index. Proxy for EU steel cost direction.",
        "fallback_steel_proxy": True,
    },
    {
        "label": "EUR / USD",
        "series_id": "DEXUSEU",
        "unit": "USD/EUR",
        "amber_pct": 0.8,
        "red_pct": 2.0,
        "context_template": "FRED DEXUSEU — daily ECB reference rate. Reflects euro purchasing power vs USD inputs.",
        "decimals": 4,
    },
    {
        "label": "Copper (LME, FRED PCOPPUSDM)",
        "series_id": "PCOPPUSDM",
        "unit": "USD/t",
        "amber_pct": 2.5,
        "red_pct": 5.0,
        "context_template": "FRED PCOPPUSDM — Global price of copper, LME settlement.",
    },
    {
        "label": "Aluminum (LME, FRED PALUMUSDM)",
        "series_id": "PALUMUSDM",
        "unit": "USD/t",
        "amber_pct": 2.5,
        "red_pct": 5.0,
        "context_template": "FRED PALUMUSDM — Global price of aluminum, LME settlement.",
    },
    {
        "label": "Brent crude (FRED DCOILBRENTEU)",
        "series_id": "DCOILBRENTEU",
        "unit": "USD/bbl",
        "amber_pct": 3.0,
        "red_pct": 7.0,
        "context_template": "FRED DCOILBRENTEU — Europe Brent spot price. Drives energy & freight cost.",
    },
    {
        "label": "Energy price index (FRED PNRGINDEXM)",
        "series_id": "PNRGINDEXM",
        "unit": "idx",
        "amber_pct": 1.5,
        "red_pct": 3.5,
        "context_template": "FRED PNRGINDEXM — IMF/World Bank energy commodities index, monthly.",
    },
    {
        "label": "DE 10y Bund yield",
        "series_id": "IRLTLT01DEM156N",
        "unit": "%",
        "amber_pct": 5.0,
        "red_pct": 12.0,
        "context_template": "FRED IRLTLT01DEM156N — Germany 10y government bond yield. Discount-rate proxy.",
        "decimals": 2,
    },
    {
        "label": "US industrial production",
        "series_id": "INDPRO",
        "unit": "idx 2017=100",
        "amber_pct": 0.6,
        "red_pct": 1.5,
        "context_template": "FRED INDPRO — broad industrial-production index. Demand proxy for export markets.",
    },
]


def _format_value(obs: MarketObs, decimals: int | None) -> Any:
    """Pretty-format the displayed value. Default rounds based on magnitude."""
    v = obs.latest_value
    if decimals is not None:
        return round(v, decimals)
    if abs(v) >= 1000:
        return round(v, 0)
    if abs(v) >= 10:
        return round(v, 1)
    return round(v, 3)


def _tone_for(pct: float | None, amber: float, red: float) -> str:
    if pct is None:
        return "amber"
    apct = abs(pct)
    if apct >= red:
        return "red" if pct > 0 else "green"
    if apct >= amber:
        return "amber"
    return "ink-3"


_SINGLE_PERIOD_SUSPECT_PCT = 40.0  # Treat one-period swings above ±40% as suspect data quality.


def _live_tile(spec: dict[str, Any], obs: MarketObs) -> dict[str, Any]:
    freq = freq_for(obs.series_id)
    period = obs.period_label(freq)
    pct = obs.pct_change
    raw_pct = pct
    suppressed = False
    if pct is not None and abs(pct) > _SINGLE_PERIOD_SUSPECT_PCT:
        suppressed = True
        pct = None
    return {
        "name": spec["label"],
        "value": _format_value(obs, spec.get("decimals")),
        "unit": spec["unit"],
        "wowPct": (round(pct, 2) if pct is not None else None),
        "wowLabel": (
            None
            if pct is not None
            else (
                f"n/a · raw {raw_pct:+.1f}% suppressed (>±{_SINGLE_PERIOD_SUSPECT_PCT:.0f}%)"
                if suppressed
                else f"n/a · {period} unavailable"
            )
        ),
        "tone": _tone_for(pct, spec["amber_pct"], spec["red_pct"]),
        "context": (
            f"{spec['context_template']} Latest {obs.latest_date}"
            + (f" · {pct:+.2f}% {period}" if pct is not None else "")
        ),
        "external": True,
        "indicator": f"{obs.source.upper()} · {obs.series_id} · {obs.latest_date}",
        "periodLabel": period,
    }


def _steel_proxy_tile(db: Session) -> dict[str, Any] | None:
    """Internal material/unit MoM proxy — used only as a Steel fallback."""
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
    MIN_VALUE = 1.0
    if prior < MIN_VALUE or latest < MIN_VALUE or prior == 0:
        return {
            "name": "Steel proxy (internal material/unit)",
            "value": round(latest, 2),
            "unit": "€/unit",
            "wowPct": None,
            "wowLabel": "n/a — insufficient prior period",
            "tone": "amber",
            "context": "Weighted material_per_unit MoM — internal proxy fallback.",
            "external": False,
            "indicator": "internal proxy from invoices",
        }
    pct = (latest / prior - 1) * 100
    if abs(pct) > 50:
        return {
            "name": "Steel proxy (internal material/unit)",
            "value": round(latest, 2),
            "unit": "€/unit",
            "wowPct": None,
            "wowLabel": "n/a — single-period swing exceeded smoothing band",
            "tone": "amber",
            "context": "Weighted material_per_unit MoM — internal proxy fallback.",
            "external": False,
            "indicator": "internal proxy from invoices",
        }
    tone = "red" if pct > 1.5 else ("green" if pct < -1.5 else "amber")
    return {
        "name": "Steel proxy (internal material/unit)",
        "value": round(latest, 2),
        "unit": "€/unit",
        "wowPct": round(pct, 2),
        "tone": tone,
        "context": "Weighted material_per_unit MoM — internal proxy fallback.",
        "external": False,
        "indicator": "internal proxy from invoices",
    }


def _fallback_synthetic_tile(spec: dict[str, Any]) -> dict[str, Any]:
    """Last-resort tile when neither FRED nor internal proxy is available."""
    return {
        "name": spec["label"],
        "value": None,
        "unit": spec["unit"],
        "wowPct": None,
        "wowLabel": "n/a · feed unavailable",
        "tone": "ink-3",
        "context": f"{spec['context_template']} (FRED parquet not yet loaded — refresh notebook fetcher.)",
        "external": False,
        "indicator": "feed offline",
    }


def get_market_direction(db: Session | None) -> dict[str, Any]:
    tiles: list[dict[str, Any]] = []
    live_count = 0
    for spec in _TILE_CATALOGUE:
        obs = latest_for(spec["series_id"])
        if obs is not None:
            tiles.append(_live_tile(spec, obs))
            live_count += 1
            continue
        # Steel-PPI gap → fall back to internal material/unit proxy.
        if spec.get("fallback_steel_proxy") and db is not None:
            steel = _steel_proxy_tile(db)
            if steel is not None:
                tiles.append(steel)
                continue
        tiles.append(_fallback_synthetic_tile(spec))

    # Build a one-line digest summarising how many tiles are live.
    total = len(tiles)
    if live_count == total:
        wow_text = f"{live_count}/{total} tiles live from FRED — last refresh per tile timestamp."
    elif live_count > 0:
        wow_text = f"{live_count}/{total} tiles live from FRED; remaining tiles awaiting feed refresh."
    else:
        wow_text = "FRED parquet not loaded — refresh notebook fetcher to enable live tiles."

    digest = {
        "wow": wow_text,
        "mom": "Tile deltas are observation-to-observation (period varies by series).",
        "yoy": "Year-on-year diffs available via parquet — wire when needed.",
        "notes": "External=true tiles read directly from FRED-normalised observations.",
    }
    return {
        "source": "live" if live_count > 0 else "synthetic",
        "tiles": tiles,
        "digest": digest,
    }
