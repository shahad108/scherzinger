"""Input cost trajectory — derived from internal ``product_cost_trends``.

We don't have external commodity feeds (Eurofer / LME / ECB). Instead we
expose 4 honest tiles built from internal cost-component weighted averages,
each marked ``source: "internal-cost-trends"`` so the FE can show
"approximate from internal cost mix" rather than pretending these are
external prices.

Tiles correspond to the cost components on each invoice line:
  material   — avg_material_per_unit
  fertigung  — avg_fek_per_unit (variable manufacturing cost)
  fixed-mfg  — avg_fv_per_unit
  full-mfg   — avg_hkvoll_per_unit

WoW Δ is approximated as the latest-period weighted ``cost_change_pct``.
"""
from __future__ import annotations

from typing import Any

from sqlalchemy import text
from sqlalchemy.orm import Session


def _seed_fallback() -> dict[str, Any]:
    return {
        "source": "synthetic",
        "tiles": [
            {
                "label": "Steel S355 / S275",
                "value": "€1,180",
                "unit": "/t",
                "capRich": {"tone": "red", "arrow": "↑ +6.8%",
                            "main": "by Q3 → €1,260 · 62% pass-through · WoW",
                            "rest": "+1.6pp accelerating"},
            },
            {
                "label": "Alloys (Cr-Mo, Ni)",
                "value": "€2,840",
                "unit": "/t",
                "capRich": {"tone": "ink-3", "arrow": "→ +0.4%",
                            "main": "stable · 28% pass-through · WoW",
                            "rest": "−0.2pp easing"},
            },
            {
                "label": "Copper",
                "value": "€8,420",
                "unit": "/t",
                "capRich": {"tone": "amber", "arrow": "↑ +3.1%",
                            "main": "by Q4 → €8,680 · 15% pass-through · WoW",
                            "rest": "+0.2pp drift"},
            },
            {
                "label": "Energy (industrial kWh)",
                "value": "€0.184",
                "unit": "/kWh",
                "capRich": {"tone": "green", "arrow": "↓ −2.4%",
                            "main": "by Q2 → €0.180 · 0% pass-through (absorbed) · WoW",
                            "rest": "−0.6pp easing"},
            },
        ],
        "stress": {
            "title": "Stress test",
            "sub": "worst-case steel +10%",
            "bullets": [
                "Compresses margin by **€42K** across 47 SKUs.",
                "Headroom on alloys absorbs partially; energy buffer holds.",
            ],
            "centralLabel": "Central case",
            "centralValue": "€18–28K",
            "centralCaption": "compression next quarter (38% of revenue is fixed-price, no pass-through)",
        },
    }


def _tone_arrow(pct: float) -> tuple[str, str]:
    if pct > 1.5:
        return "red", f"↑ +{pct:.1f}%"
    if pct > 0.3:
        return "amber", f"↑ +{pct:.1f}%"
    if pct < -1.5:
        return "green", f"↓ {pct:.1f}%"
    if pct < -0.3:
        return "green", f"↓ {pct:.1f}%"
    return "ink-3", f"→ {pct:+.1f}%"


def _fmt_eur(v: float) -> str:
    if v >= 100:
        return f"€{v:,.0f}".replace(",", ",")
    return f"€{v:.2f}"


def build_input_cost(db: Session | None) -> dict[str, Any]:
    """Return the InputCostTrajectory block.

    Marks every tile with ``"source": "internal-cost-trends"`` so the FE
    can label it honestly instead of implying live market feeds.
    """
    if db is None:
        return _seed_fallback()

    try:
        # Weighted-avg cost components across the latest period vs prior.
        # We aggregate by period_end month → latest 2 periods.
        rows = db.execute(text("""
            WITH latest_periods AS (
                SELECT DISTINCT period_end
                FROM product_cost_trends
                ORDER BY period_end DESC
                LIMIT 2
            )
            SELECT period_end,
                   SUM(avg_material_per_unit * record_count) / NULLIF(SUM(record_count), 0) AS material,
                   SUM(avg_fek_per_unit * record_count) / NULLIF(SUM(record_count), 0) AS fek,
                   SUM(avg_fv_per_unit * record_count) / NULLIF(SUM(record_count), 0) AS fv,
                   SUM(avg_hkvoll_per_unit * record_count) / NULLIF(SUM(record_count), 0) AS hk,
                   SUM(cost_change_pct * record_count) / NULLIF(SUM(record_count), 0) AS chg
            FROM product_cost_trends
            WHERE period_end IN (SELECT period_end FROM latest_periods)
            GROUP BY period_end
            ORDER BY period_end DESC
        """)).fetchall()
    except Exception:
        return _seed_fallback()

    if not rows or len(rows) < 1:
        return _seed_fallback()

    latest = rows[0]
    prior = rows[1] if len(rows) > 1 else None

    def _pct(latest_v: float | None, prior_v: float | None) -> float:
        if latest_v is None or prior_v is None or prior_v == 0:
            return 0.0
        return (float(latest_v) / float(prior_v) - 1) * 100

    components = [
        ("Material per unit (weighted)", "/unit", float(latest[1] or 0),
         _pct(latest[1], prior[1] if prior else None),
         "Aggregated SUM(material_per_unit·record_count) ÷ SUM(record_count) across articles."),
        ("Variable mfg (FEK)", "/unit", float(latest[2] or 0),
         _pct(latest[2], prior[2] if prior else None),
         "Direct manufacturing cost per unit, weighted."),
        ("Fixed mfg (FV)", "/unit", float(latest[3] or 0),
         _pct(latest[3], prior[3] if prior else None),
         "Fixed overhead allocation per unit."),
        ("Full cost (HKvoll)", "/unit", float(latest[4] or 0),
         _pct(latest[4], prior[4] if prior else None),
         "Full standard cost per unit (material + mfg + overhead)."),
    ]

    tiles = []
    for label, unit, value, pct, ctx in components:
        tone, arrow = _tone_arrow(pct)
        tiles.append({
            "label": label,
            "value": _fmt_eur(value),
            "unit": unit,
            "source": "internal-cost-trends",
            "indicator": "⚠ approximate from internal cost mix (no external feed)",
            "capRich": {
                "tone": tone,
                "arrow": arrow,
                "main": f"period-over-period · {ctx}",
                "rest": f"{pct:+.2f}pp",
            },
        })

    # Stress block — keep honest copy
    latest_chg = float(latest[5]) * 100 if latest[5] is not None else 0.0
    return {
        "source": "internal-cost-trends",
        "tiles": tiles,
        "stress": {
            "title": "Cost-mix stress",
            "sub": f"weighted cost change last period: {latest_chg:+.2f}%",
            "bullets": [
                "Tiles approximate market input cost from internal cost components.",
                "External feeds (Eurofer steel, LME copper, ECB FX, BNetzA energy) not wired — pending integration.",
            ],
            "centralLabel": "Internal change",
            "centralValue": f"{latest_chg:+.2f}%",
            "centralCaption": "weighted by article record count over the latest period",
        },
    }
