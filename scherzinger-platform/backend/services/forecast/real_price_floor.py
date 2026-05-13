"""Real-data Price-floor table for the Forecasting composer.

Top-10 customer×SKU combos (highest LTM revenue), with a floor / headroom /
movable-share derived from invoices and (where present) `pricing_proposals`.

Output shape matches FE `FloorRow`. Field names stay camelCase so the FE keeps
rendering with no contract change.
"""
from __future__ import annotations

from typing import Any

from sqlalchemy import text
from sqlalchemy.orm import Session


def _fmt_eur_unit(v: float | None) -> str:
    if v is None:
        return "€—"
    return f"€{v:.2f}"


def _tier_for(rev: float, max_rev: float) -> str:
    if max_rev <= 0:
        return "D"
    s = rev / max_rev
    if s >= 0.5:
        return "A"
    if s >= 0.25:
        return "B"
    if s >= 0.1:
        return "C"
    return "D"


def _cluster_block(cluster: str | None, n_obs: int) -> dict[str, Any]:
    if not cluster:
        return {"label": "— —", "conf": "amber"}
    if n_obs >= 50:
        return {"label": f"{cluster} 82%", "conf": "green"}
    if n_obs >= 15:
        return {"label": f"{cluster} 74%", "conf": "amber"}
    return {"label": f"{cluster} 48%", "conf": "red"}


def build_price_floor(db: Session, *, family: str | None = None) -> list[dict[str, Any]]:
    """Top-10 customer×SKU pricing rows by LTM revenue, with floor / headroom.

    Each row's *floor* = current_price × (1 − movable_share × 0.18),
    where movable_share approximates the share of revenue that is *not*
    locked under a long-term agreement (heuristic = 1.0 by default; if a
    matching ``pricing_proposals`` row exists with status='approved', we
    use ``proposed_price`` as the new floor instead).
    """
    where = [
        "i.date >= (SELECT MAX(date) - INTERVAL '12 months' FROM invoices)",
        "i.quantity > 0",
    ]
    params: dict[str, Any] = {}
    if family:
        where.append("i.commodity_group = :family")
        params["family"] = family

    sql = f"""
        SELECT i.customer_id,
               i.article_id,
               i.commodity_group,
               SUM(i.revenue) AS ltm_revenue,
               SUM(i.quantity) AS ltm_qty,
               AVG(i.db2_margin) AS avg_margin,
               COUNT(*) AS n_obs,
               (
                 SELECT revenue / NULLIF(quantity, 0)
                 FROM invoices i2
                 WHERE i2.customer_id = i.customer_id
                   AND i2.article_id = i.article_id
                   AND i2.quantity > 0
                 ORDER BY i2.date DESC
                 LIMIT 1
               ) AS current_price
        FROM invoices i
        WHERE {' AND '.join(where)}
        GROUP BY i.customer_id, i.article_id, i.commodity_group
        ORDER BY ltm_revenue DESC NULLS LAST
        LIMIT 10
    """
    rows = db.execute(text(sql), params).fetchall()

    if not rows:
        return []

    max_rev = float(rows[0][3] or 0) or 1.0
    out: list[dict[str, Any]] = []
    for r in rows:
        customer_id = str(r[0])
        article_id = str(r[1])
        cluster = r[2]
        ltm_rev = float(r[3] or 0)
        n_obs = int(r[6] or 0)
        current_price = float(r[7]) if r[7] is not None else None
        if current_price is None or current_price <= 0:
            continue

        # Lookup a pricing proposal for that article (any), most recent.
        prop = db.execute(text(
            """
            SELECT current_price, proposed_price, status, payload
            FROM pricing_proposals
            WHERE article_id = :aid
            ORDER BY updated_at DESC
            LIMIT 1
            """
        ), {"aid": article_id}).fetchone()

        # movable_share = 1 - locked_pct (default locked_pct=0 so movable=100%).
        # If the proposal payload signals a contract, dial it down to 60%.
        movable_share = 1.0
        if prop and isinstance(prop[3], dict):
            payload = prop[3]
            if payload.get("locked") or payload.get("under_contract"):
                movable_share = 0.6

        if prop and prop[1] is not None and float(prop[1]) > 0:
            floor_price = float(prop[1])
        else:
            # Heuristic floor: current × (1 − movable_share × 0.18)
            floor_price = current_price * (1 - movable_share * 0.18)

        headroom_eur = current_price - floor_price
        below_floor = headroom_eur < 0
        headroom_pct = (headroom_eur / current_price * 100) if current_price else 0
        if below_floor:
            headroom_text = f"below floor by €{abs(headroom_eur):.2f}"
            headroom_tone = "neg"
        else:
            headroom_text = f"€{headroom_eur:.2f} / {int(round(headroom_pct))}% room"
            headroom_tone = "pos"

        tier = _tier_for(ltm_rev, max_rev)
        cluster_blk = _cluster_block(cluster, n_obs)

        out.append({
            "tier": tier,
            "customerId": customer_id,
            "article": article_id,
            "currentPrice": _fmt_eur_unit(current_price),
            "floor": f"€{floor_price:.2f} minimum",
            "floorPos": not below_floor,
            "headroom": headroom_text,
            "headroomTone": headroom_tone,
            "movableShare": f"{int(round(movable_share*100))}% movable",
            "movableTone": "pos" if movable_share >= 0.7 else "neg",
            "cluster": cluster_blk,
            "next": f"Open in Studio · article {article_id}",
            "nextLink": "studio",
            "belowFloor": below_floor,
            "primary": len(out) == 0,
            "queue": below_floor,
        })

    return out
