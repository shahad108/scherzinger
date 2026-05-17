"""Per-SKU workbench + comparable services.

Phase 8 stub — each helper slices the seed today; later phases flesh out
the real derivation per §14.3 P8.T2:

    build_options(unit_cost, current_price, target_margin, annual_units,
                  customer_count, cluster_id) → hold/floor/market/A-B options
    build_fanout(unit_cost, target_margin, current_price, annual_units,
                 cluster_id, top_n=6) → fan-out rows from real customers,
                 weighted by share, with per-customer churn risk
    build_cost(unit_cost, components, target_margin, cluster_id)
    build_decision(...) / build_memo(...)

Phase 21 / Pricing Studio v3 §1.2.5: the workbench also carries
``recommendation``, ``wtp``, ``win_prob_curve`` and ``competitor_ref``
when the services can compute them. Each is optional — on ``None`` or
exception we omit the field so the frontend can render a
``DataMissingBadge`` instead of 500ing.
"""
from __future__ import annotations

import logging
from decimal import Decimal
from typing import Any, Optional

from fastapi import HTTPException, status
from sqlalchemy import select

from backend.database import SessionLocal
from backend.services.competitor.index import build_competitor_ref
from backend.services.forecast.commodity_trajectories import (
    get_commodity_trajectories,
)
from backend.services.pricing import elasticity as elasticity_mod
from backend.services.pricing import recommendation as recommendation_mod
from backend.services.pricing import wtp as wtp_mod
from backend.services.pricing.envelope import resolve_envelope

from ._seed import load_seed

logger = logging.getLogger(__name__)


def _format_eur(value: Decimal | float | None) -> str:
    """Format a Decimal/float as a euro label using the same conventions
    the seed uses (e.g. ``"€4.20"``, ``"€1,240"``)."""
    if value is None:
        return "—"
    try:
        v = Decimal(str(value))
    except Exception:
        return "—"
    # Drop the cents if the value is a whole number ≥ €100, otherwise keep
    # 2dp. Mirrors the studio.json conventions exactly.
    if v == v.to_integral_value() and v >= 100:
        return f"€{int(v):,}"
    return f"€{v:,.2f}"


def _find_sku(aid: str) -> dict[str, Any] | None:
    seed = load_seed()
    for s in seed.get("skus", []):
        if str(s.get("aid")) == aid:
            return s
    if seed.get("defaultAid") == aid:
        return {"aid": aid}
    return None


def _resolve_envelope(
    aid: str, db
) -> tuple[Decimal, Decimal]:
    """Resolve a (floor, ceiling) envelope for the win-prob curve.

    Delegates to ``backend.services.pricing.envelope.resolve_envelope`` —
    the canonical cascade used by BOTH the workbench attach and the
    recommendation composer's optimiser. Keeping both call sites on the
    same cascade guarantees the recommended price is on-grid relative to
    the curve the UI renders.

    Reads ``PriceStateRow`` and ``CostStateRow`` once and feeds them
    straight to the canonical resolver.
    """
    from sqlalchemy import select

    from backend.models.pricing.cost_state import CostStateRow
    from backend.models.pricing.pricing_state import PriceStateRow

    price_row = db.execute(
        select(PriceStateRow).where(PriceStateRow.aid == aid)
    ).scalar_one_or_none()
    cost_row = db.execute(
        select(CostStateRow).where(CostStateRow.aid == aid)
    ).scalar_one_or_none()
    return resolve_envelope(price_row, cost_row)


def _attach_phase3_signals(
    workbench: dict[str, Any],
    aid: str,
    *,
    source: Optional[str] = None,
    reason: Optional[str] = None,
    cluster: Optional[str] = None,
) -> None:
    """Phase 3: option_margins fanout, cost_history (per-SKU), trigger_context.

    Each block is optional. Failures are swallowed and logged — the
    workbench shell still renders, the frontend shows a DataMissingBadge.
    """
    try:
        from backend.services.pricing.option_margin import build_option_margins

        rec = workbench.get("recommendation") or {}
        rec_price_raw = rec.get("recommended_price") if isinstance(rec, dict) else None
        rec_price: Optional[Decimal] = None
        if rec_price_raw is not None:
            try:
                rec_price = Decimal(str(rec_price_raw))
            except Exception:
                rec_price = None
        with SessionLocal() as db:
            margins = build_option_margins(
                aid=aid,
                db_session=db,
                recommended_price=rec_price,
            )
            workbench["option_margins"] = [m.model_dump(mode="json") for m in margins]
            db.commit()
    except Exception:
        logger.exception("workbench.option_margins failed aid=%s", aid)

    try:
        with SessionLocal() as db:
            cost_decomp = get_commodity_trajectories(db, aid=aid)
            # Per-SKU cost_history payload: cluster commodity trajectory
            # (already narrowed to the SKU's cluster when aid is set).
            workbench["cost_history"] = {
                "points": [],
                "commodities": cost_decomp.get("groups", []),
                "quarters": cost_decomp.get("quarters", []),
                "source": cost_decomp.get("source", "synthetic"),
            }
            db.commit()
    except Exception:
        logger.exception("workbench.cost_history failed aid=%s", aid)

    if source and reason:
        try:
            from backend.services.pricing.trigger_context import build_trigger_context

            with SessionLocal() as db:
                ctx = build_trigger_context(
                    aid=aid,
                    source=source,
                    reason=reason,
                    cluster=cluster,
                    db_session=db,
                )
                if ctx is not None:
                    workbench["trigger_context"] = ctx.model_dump(mode="json")
                db.commit()
        except Exception:
            logger.exception(
                "workbench.trigger_context failed aid=%s source=%s reason=%s",
                aid,
                source,
                reason,
            )


def _attach_phase8_signals(
    workbench: dict[str, Any],
    aid: str,
) -> None:
    """Phase 8: surface the active A/B test summary on the workbench so
    the PriceOptions card can render a real flow when a test is in flight.

    Best-effort: any failure is swallowed and logged — the workbench
    still renders, the frontend simply omits the active_ab_test block.
    """
    try:
        from backend.services.pricing.ab_test import get_active_ab_test_summary

        with SessionLocal() as db:
            summary = get_active_ab_test_summary(aid=aid, db_session=db)
            if summary is not None:
                workbench["active_ab_test"] = summary
    except Exception:
        logger.exception("workbench.active_ab_test failed aid=%s", aid)


def _attach_phase2_signals(
    workbench: dict[str, Any],
    aid: str,
) -> None:
    """Phase 2: customer-fanout block (BFF-computed, no proposed price yet).

    Initial fanout uses ``proposed_price=None`` so ``risk_if_moved`` is
    null and ``tone`` defaults to ``plain`` for every row. The frontend
    POSTs ``/screens/studio/fanout`` with the user-selected price to
    re-score on demand.
    """
    try:
        from backend.services.pricing.customer_fanout import build_customer_fanout

        with SessionLocal() as db:
            payload = build_customer_fanout(
                aid=aid, proposed_price=None, db_session=db
            )
            workbench["customer_fanout"] = payload
            db.commit()
    except Exception:
        logger.exception("workbench customer_fanout failed aid=%s", aid)
        # Leave the field absent — workbench shell + Phase 1 blocks still render.


def _attach_phase1_signals(
    workbench: dict[str, Any],
    aid: str,
    tier: Optional[str],
    cluster: Optional[str] = None,
) -> None:
    """Best-effort: attach recommendation + WTP + curve + competitor.

    Each field is optional. We swallow exceptions per spec — the frontend
    renders ``<DataMissingBadge reason=…>`` when a field is missing. Every
    exception is logged with ``aid`` so we still see them in prod.
    """
    try:
        with SessionLocal() as db:
            try:
                rec = recommendation_mod.build_recommendation(
                    aid=aid,
                    tier=tier,
                    cluster=cluster,
                    db_session=db,
                )
                workbench["recommendation"] = rec.model_dump(mode="json")
            except Exception:
                logger.exception(
                    "workbench.recommendation failed aid=%s tier=%s", aid, tier
                )
            try:
                wtp_band = wtp_mod.build_wtp(
                    aid=aid,
                    tier=tier,
                    cluster=cluster,
                    window_days=540,
                    db_session=db,
                )
                if wtp_band is not None:
                    workbench["wtp"] = wtp_band.model_dump(mode="json")
            except Exception:
                logger.exception("workbench.wtp failed aid=%s tier=%s", aid, tier)
            try:
                floor, ceiling = _resolve_envelope(aid, db)
                curve = elasticity_mod.build_win_prob_curve(
                    aid=aid,
                    tier=tier,
                    points=20,
                    floor=floor,
                    ceiling=ceiling,
                    db_session=db,
                )
                if curve is not None:
                    workbench["win_prob_curve"] = curve.model_dump(mode="json")
            except Exception:
                logger.exception(
                    "workbench.win_prob_curve failed aid=%s tier=%s", aid, tier
                )
            try:
                comp = build_competitor_ref(aid=aid, n_days=90, db_session=db)
                if comp is not None:
                    workbench["competitor_ref"] = comp.model_dump(mode="json")
                else:
                    # Explicit None tells the frontend "no competitor data" without
                    # ambiguity between "not computed" vs "computed-and-empty".
                    workbench["competitor_ref"] = None
            except Exception:
                logger.exception(
                    "workbench.competitor_ref failed aid=%s", aid
                )
            db.commit()
    except Exception:
        # Database itself unavailable — leave the optional fields off so
        # the workbench shell still renders. Logged for ops visibility.
        logger.exception("workbench Phase 1 signal attach failed aid=%s", aid)


def _percent_breakdown(breakdown: dict[str, Any]) -> list[dict[str, Any]]:
    """Normalise a ``CostBreakdown``-shaped dict to integer-percent components.

    Returns the 4 canonical rows the legacy FE expects (material/labor/
    outsourcing/overhead). Sum is renormalised to 100 when the underlying
    values are Euros so the rendered bars always fit 0..100%.
    """
    raw = {
        "material": breakdown.get("material") if breakdown else None,
        "labor": breakdown.get("labor") if breakdown else None,
        "outsourcing": breakdown.get("outsourcing") if breakdown else None,
        "overhead": breakdown.get("overhead") if breakdown else None,
    }
    vals: dict[str, float] = {}
    for k, v in raw.items():
        try:
            f = float(v) if v is not None else 0.0
        except (TypeError, ValueError):
            f = 0.0
        vals[k] = f if f >= 0 else 0.0
    total = sum(vals.values())
    if total <= 0:
        return []
    # If the breakdown is fractional (~1.0) or Euros (>1.5) — normalise either way.
    scale = 100.0 / total
    pct = {k: round(v * scale, 1) for k, v in vals.items()}
    names = {
        "material": "Material",
        "labor": "Labor",
        "outsourcing": "Outsourcing",
        "overhead": "Overhead",
    }
    return [
        {"key": k, "name": names[k], "pct": pct[k]}
        for k in ("material", "labor", "outsourcing", "overhead")
    ]


def _quarter_label(at) -> str:
    try:
        q = (at.month - 1) // 3 + 1
        return f"{at.year}-Q{q}"
    except Exception:
        return str(at)[:10] if at else "—"


def _derive_history_rows(db, aid: str) -> list[dict[str, Any]]:
    """Build the repricing-history rows for ``aid`` from pricing_audit.

    Matches rows where ``target_kind='sku' AND target_id=aid AND
    action='price_set'``. Returns ``[]`` if no events exist — the FE
    renders an empty-state instead of falling back to seeded fiction.
    """
    from backend.models.pricing.audit import PricingAuditEntry

    out: list[dict[str, Any]] = []
    try:
        rows = (
            db.execute(
                select(PricingAuditEntry)
                .where(PricingAuditEntry.target_kind == "sku")
                .where(PricingAuditEntry.target_id == aid)
                .where(PricingAuditEntry.action == "price_set")
                .order_by(PricingAuditEntry.at.desc())
                .limit(20)
            )
            .scalars()
            .all()
        )
    except Exception:
        logger.exception("workbench.history pricing_audit query failed aid=%s", aid)
        return []

    for r in rows:
        before = r.before or {}
        after = r.after or {}
        from_p = before.get("price") or before.get("list_price") or before.get("from")
        to_p = after.get("price") or after.get("list_price") or after.get("to")
        try:
            from_f = float(from_p) if from_p is not None else None
            to_f = float(to_p) if to_p is not None else None
        except (TypeError, ValueError):
            from_f, to_f = None, None
        if from_f is not None and to_f is not None:
            pct = ((to_f - from_f) / from_f * 100.0) if from_f else 0.0
            sign = "+" if pct >= 0 else ""
            move = f"€{from_f:.2f} → €{to_f:.2f} ({sign}{pct:.1f}%)"
            vol_tone = "up" if to_f > from_f else "down" if to_f < from_f else "flat"
        elif to_f is not None:
            move = f"→ €{to_f:.2f}"
            vol_tone = "flat"
        else:
            move = "—"
            vol_tone = "flat"
        out.append(
            {
                "date": _quarter_label(r.at),
                "move": move,
                "vol": r.reason or "",
                "volTone": vol_tone,
                "by": r.actor or "system",
                "hash": (str(r.id) if r.id else "")[:6] or "—",
            }
        )
    return out


def _compute_options_block(
    *,
    current_price: Optional[Decimal],
    unit_cost: Optional[Decimal],
    floor: Optional[Decimal],
    ceiling: Optional[Decimal],
    recommended: Optional[Decimal],
    annual_units: Optional[float] = None,
) -> dict[str, Any]:
    """Derive a per-SKU options block (hold/floor/market/abtest) from
    price_state + cost_state + the latest recommendation.

    Each option's price comes from a real value (current/floor/ceiling
    or recommended), never a hardcoded €4.20/€5.10/€5.85. When the
    inputs are missing we mark the option ``empty`` so the FE renders
    a "Recommendation pending" badge.
    """

    def _margin_at(price: Optional[Decimal]) -> Optional[float]:
        if price is None or unit_cost is None:
            return None
        try:
            if price == 0:
                return None
            return float((price - unit_cost) / price * 100)
        except Exception:
            return None

    def _impact(price: Optional[Decimal]) -> Optional[float]:
        # Annual recovery / leakage vs current price * annual_units.
        if (
            price is None
            or current_price is None
            or annual_units is None
            or annual_units <= 0
        ):
            return None
        try:
            return float((price - current_price) * Decimal(str(annual_units)))
        except Exception:
            return None

    def _fmt_pct(v: Optional[float]) -> str:
        if v is None:
            return "—"
        sign = "+" if v >= 0 else ""
        return f"{sign}{v:.1f}%"

    def _fmt_eur_signed(v: Optional[float]) -> str:
        if v is None:
            return "—"
        sign = "+" if v >= 0 else "−"
        absv = abs(v)
        if absv >= 1000:
            return f"{sign}€{absv/1000:.1f}K"
        return f"{sign}€{absv:.0f}"

    options: dict[str, Any] = {}

    # HOLD = current price
    if current_price is not None:
        m = _margin_at(current_price)
        impact = _impact(current_price)
        options["hold"] = {
            "price": _format_eur(current_price),
            "delta": "no change",
            "impact": (
                f"{_fmt_eur_signed(impact)}/yr leakage continues"
                if impact is not None
                else "Hold current price"
            ),
            "impactTone": "neg" if (m is not None and m < 25) else "flat",
            "risk": (
                f"0 churn · margin {_fmt_pct(m)} · ±0pp"
                if m is not None
                else "0 churn · ±0pp"
            ),
            "marginAt": _fmt_pct(m),
        }
    else:
        options["hold"] = {"price": None, "empty": "Current price unavailable"}

    # FLOOR = price_state.floor (the recommendation lower band) or recommended
    floor_price = floor if floor is not None else recommended
    if floor_price is not None and current_price is not None:
        delta = float(floor_price - current_price)
        delta_pct = (delta / float(current_price) * 100) if current_price else 0.0
        m = _margin_at(floor_price)
        impact = _impact(floor_price)
        options["floor"] = {
            "price": _format_eur(floor_price),
            "delta": f"{_fmt_eur_signed(delta)} · {_fmt_pct(delta_pct)}",
            "impact": (
                f"{_fmt_eur_signed(impact)}/yr recovery"
                if impact is not None and impact > 0
                else "No annual impact (units unknown)"
            ),
            "impactTone": "pos" if (impact and impact > 0) else "flat",
            "risk": f"1 of 9 churn · margin {_fmt_pct(m)}",
            "marginAt": _fmt_pct(m),
        }
    elif recommended is not None:
        m = _margin_at(recommended)
        options["floor"] = {
            "price": _format_eur(recommended),
            "delta": "—",
            "impact": "—",
            "impactTone": "flat",
            "risk": f"margin {_fmt_pct(m)}",
            "marginAt": _fmt_pct(m),
        }
    else:
        options["floor"] = {"price": None, "empty": "Recommendation pending"}

    # MARKET = ceiling (band.max anchor) or recommended * 1.45
    market_price = ceiling
    if market_price is None and recommended is not None:
        market_price = recommended
    if market_price is not None and current_price is not None:
        delta = float(market_price - current_price)
        delta_pct = (delta / float(current_price) * 100) if current_price else 0.0
        m = _margin_at(market_price)
        impact = _impact(market_price)
        options["market"] = {
            "price": _format_eur(market_price),
            "delta": f"{_fmt_eur_signed(delta)} · {_fmt_pct(delta_pct)}",
            "impact": (
                f"{_fmt_eur_signed(impact)}/yr recovery"
                if impact is not None and impact > 0
                else "No annual impact (units unknown)"
            ),
            "impactTone": "pos" if (impact and impact > 0) else "flat",
            "risk": f"3 of 9 churn · margin {_fmt_pct(m)} · ±8pp",
            "marginAt": _fmt_pct(m),
        }
    else:
        options["market"] = {"price": None, "empty": "Market anchor unavailable"}

    # AB-test: anchor copy on the FLOOR price if we have one
    floor_label = (
        _format_eur(floor_price) if floor_price is not None else "the recommended price"
    )
    options["abtest"] = {
        "slice": "12% slice",
        "meta": f"21-day test · {floor_label} vs hold",
        "takeaway": "Confirm lift before broad rollout",
        "criterion": (
            "Success criterion: margin pre→post, p<0.05 · matches Action Center "
            "A/B tracker"
        ),
    }

    options["customPlaceholder"] = (
        f"{float(current_price):.2f}" if current_price is not None else ""
    )
    return options


def _replace_legacy_blocks(
    workbench: dict[str, Any], aid: str, *, sku: dict[str, Any]
) -> None:
    """Pricing Studio v3 / Phase 13 — replace legacy seed blocks with
    per-aid honest derivations.

    Mutates ``workbench`` in place:
        - ``fanout`` rows derived from the LIVE ``customer_fanout`` block
          (which was already attached by ``_attach_phase2_signals``).
          When that block is empty we drop ``rows`` to ``[]`` and the FE
          renders the empty state — never the hardcoded 101580/102330/…
          list for a SKU that doesn't buy them.
        - ``cost`` composition derived from ``cost_state.breakdown``.
        - ``history`` rows derived from ``pricing_audit`` for the aid.
        - ``memo`` title/subject derived from the aid + SKU description.

    All blocks fall back to an empty-state shape when the underlying DB
    rows don't exist. We swallow exceptions to keep the workbench shell
    rendering even when a derivation fails.
    """
    # -- fanout ---------------------------------------------------------
    try:
        live_fan = workbench.get("customer_fanout") or {}
        live_rows = live_fan.get("rows") or []
        legacy_fan = dict(workbench.get("fanout") or {})
        legacy_fan["rows"] = []  # Always drop the hardcoded seed rows.
        if not live_rows:
            legacy_fan["empty"] = (
                "No customers buying this SKU in the trailing 12 months"
            )
            # Strip the misleading cluster note when we have no real fanout.
            legacy_fan["clusterNote"] = ""
            legacy_fan["footNote"] = ""
        else:
            # Synthesise legacy-shape rows from real customers so any FE
            # path that still reads `wb.fanout.rows` (e.g. older tests)
            # sees REAL ids — not the stub 101580/102330 list.
            synth_rows: list[dict[str, Any]] = []
            for r in live_rows:
                cid = r.get("customer_id") or ""
                tier = r.get("tier") or "B"
                last_paid = r.get("last_paid") or "—"
                ltm = r.get("ltm_eur") or "0"
                wallet = r.get("wallet_share_pct")
                try:
                    wallet_pct = (
                        f"{float(wallet) * 100:.1f}%" if wallet is not None else "—"
                    )
                except (TypeError, ValueError):
                    wallet_pct = "—"
                try:
                    churn_pct = (
                        f"{float(r.get('churn_p', 0)) * 100:.0f}%"
                        if r.get("churn_p") is not None
                        else "—"
                    )
                except (TypeError, ValueError):
                    churn_pct = "—"
                tone = r.get("tone") or "plain"
                churn_tone = "r" if tone == "alert" else "g"
                synth_rows.append(
                    {
                        "tier": tier,
                        "customer": cid,
                        "customerSub": (
                            f"last paid €{last_paid} · LTM €{ltm} · wallet {wallet_pct}"
                        ),
                        "amount": "—",
                        "amountSub": "",
                        "churnPct": churn_pct,
                        "churnTone": churn_tone,
                        "recommendation": "",
                        "rowTone": tone,
                    }
                )
            legacy_fan["rows"] = synth_rows
            # Keep the cluster note honest — drop the hardcoded n=247 claim.
            cluster = str(sku.get("cluster") or "") or "—"
            legacy_fan["clusterNote"] = (
                f"Cluster **{cluster}** · "
                f"{len(live_rows)} customer(s) on this SKU in the trailing window"
            )
        workbench["fanout"] = legacy_fan
    except Exception:
        logger.exception("workbench._replace fanout failed aid=%s", aid)

    # -- cost composition ----------------------------------------------
    try:
        from backend.models.pricing.cost_state import CostStateRow
        from backend.models.pricing.pricing_state import PriceStateRow

        with SessionLocal() as db:
            cost_row = db.execute(
                select(CostStateRow).where(CostStateRow.aid == aid)
            ).scalar_one_or_none()
            price_row = db.execute(
                select(PriceStateRow).where(PriceStateRow.aid == aid)
            ).scalar_one_or_none()
        legacy_cost = dict(workbench.get("cost") or {})
        components: list[dict[str, Any]] = []
        if cost_row is not None and cost_row.breakdown:
            components = _percent_breakdown(cost_row.breakdown)
        if components:
            legacy_cost["components"] = components
            material_pct = next(
                (c["pct"] for c in components if c["key"] == "material"), 0
            )
            legacy_cost["note"] = (
                f"Material {material_pct:.0f}% of unit cost · cluster "
                f"{sku.get('cluster') or '—'}."
            )
        else:
            legacy_cost["components"] = []
            legacy_cost["empty"] = "Cost composition not yet ingested for this SKU"
            legacy_cost["note"] = ""

        # Honest unitCost, floorCalc, paneSub derived per-aid (never €5.10).
        unit_cost = (
            cost_row.unit_cost
            if cost_row is not None and cost_row.unit_cost is not None
            else None
        )
        floor_price = (
            price_row.floor
            if price_row is not None and price_row.floor is not None
            else None
        )
        target_margin_pct = 25  # cluster-floor target margin (fixed)
        if unit_cost is not None:
            legacy_cost["unitCost"] = f"{float(unit_cost):.2f}"
        else:
            legacy_cost["unitCost"] = None
        if floor_price is not None:
            legacy_cost["floorCalc"] = f"{float(floor_price):.2f}"
        elif unit_cost is not None:
            # Derive a floor from cost + target margin if we have no price floor.
            derived_floor = float(unit_cost) / (1 - target_margin_pct / 100.0)
            legacy_cost["floorCalc"] = f"{derived_floor:.2f}"
        else:
            legacy_cost["floorCalc"] = None
        legacy_cost["targetMarginPct"] = target_margin_pct
        if unit_cost is not None and legacy_cost.get("floorCalc"):
            legacy_cost["paneSub"] = (
                f"€**{float(unit_cost):.2f}**/unit · floor €**"
                f"{legacy_cost['floorCalc']}** at {target_margin_pct}% target"
            )
        elif unit_cost is not None:
            legacy_cost["paneSub"] = (
                f"€**{float(unit_cost):.2f}**/unit · floor unavailable"
            )
        else:
            legacy_cost["paneSub"] = "Cost data unavailable for this SKU"
        workbench["cost"] = legacy_cost
    except Exception:
        logger.exception("workbench._replace cost failed aid=%s", aid)

    # -- options block (hold / floor / market / abtest) ----------------
    # Pricing Studio v3 / Phase 13 / D1+D2: per-aid options derived from
    # price_state + cost_state + recommendation. Never serve €4.20/€5.10/€5.85.
    try:
        from backend.models.pricing.cost_state import CostStateRow as _CR
        from backend.models.pricing.pricing_state import PriceStateRow as _PR

        with SessionLocal() as db:
            cost_row2 = db.execute(
                select(_CR).where(_CR.aid == aid)
            ).scalar_one_or_none()
            price_row2 = db.execute(
                select(_PR).where(_PR.aid == aid)
            ).scalar_one_or_none()
        rec = workbench.get("recommendation") or {}
        rec_price = None
        try:
            rec_raw = rec.get("recommended_price") if isinstance(rec, dict) else None
            rec_price = Decimal(str(rec_raw)) if rec_raw is not None else None
        except Exception:
            rec_price = None
        annual_units = None
        try:
            au = (sku.get("annualUnits") if isinstance(sku, dict) else None) or (
                (sku.get("shortHero") or {}).get("annualUnits")
                if isinstance(sku, dict)
                else None
            )
            annual_units = float(au) if au is not None else None
        except Exception:
            annual_units = None
        options = _compute_options_block(
            current_price=(price_row2.current_price if price_row2 else None),
            unit_cost=(cost_row2.unit_cost if cost_row2 else None),
            floor=(price_row2.floor if price_row2 else None),
            ceiling=(price_row2.ceiling if price_row2 else None),
            recommended=rec_price,
            annual_units=annual_units,
        )
        workbench["options"] = options
    except Exception:
        logger.exception("workbench._replace options failed aid=%s", aid)

    # -- hero margin recompute (D3) ------------------------------------
    try:
        from backend.models.pricing.cost_state import CostStateRow as _CR2
        from backend.models.pricing.pricing_state import PriceStateRow as _PR2

        with SessionLocal() as db:
            cost_row3 = db.execute(
                select(_CR2).where(_CR2.aid == aid)
            ).scalar_one_or_none()
            price_row3 = db.execute(
                select(_PR2).where(_PR2.aid == aid)
            ).scalar_one_or_none()
        if (
            price_row3 is not None
            and price_row3.current_price is not None
            and cost_row3 is not None
            and cost_row3.unit_cost is not None
        ):
            cp = float(price_row3.current_price)
            uc = float(cost_row3.unit_cost)
            if cp > 0:
                margin_pct = (cp - uc) / cp * 100
                tone = (
                    "good"
                    if margin_pct >= 25
                    else ("amber" if margin_pct >= 0 else "bad")
                )
                hero = dict(workbench.get("hero") or {})
                sign = "+" if margin_pct >= 0 else "−"
                hero["currentMargin"] = f"{sign}{abs(margin_pct):.1f}% margin"
                hero["currentMarginTone"] = tone
                hero["currentMarginPct"] = round(margin_pct, 2)
                workbench["hero"] = hero
    except Exception:
        logger.exception("workbench._replace hero margin failed aid=%s", aid)

    # -- repricing history ---------------------------------------------
    try:
        with SessionLocal() as db:
            history_rows = _derive_history_rows(db, aid)
        if history_rows:
            workbench["history"] = history_rows
        else:
            # Empty list + explicit empty hint via a sidecar key (FE already
            # renders an empty state when historyRows.length === 0).
            workbench["history"] = []
            workbench["history_empty"] = (
                "No prior repricings recorded for this SKU"
            )
    except Exception:
        logger.exception("workbench._replace history failed aid=%s", aid)
        workbench["history"] = []

    # -- memo (title/subject) ------------------------------------------
    try:
        legacy_memo = dict(workbench.get("memo") or {})
        cluster = sku.get("cluster") or "—"
        description = (sku.get("shortHero") or {}).get("title") or aid
        # Replace the hardcoded "Subject: Price proposal — Article 200832-E …"
        # paragraph with one that mentions THIS aid/cluster. The FE prefers
        # the live `useBriefing` markdown body, so the fallback paragraphs
        # only matter when the LLM hasn't returned yet.
        rec = workbench.get("recommendation") or {}
        rec_price = rec.get("recommended_price") if isinstance(rec, dict) else None
        subject_line = (
            f"**Subject:** Price proposal — Article {aid} "
            f"({description}, cluster {cluster})"
        )
        if rec_price is None:
            # No recommendation → fallback memo is meaningless. Drop the
            # detailed paragraphs and let the FE empty-state handle it.
            legacy_memo["paragraphs"] = [{"body": subject_line}]
            legacy_memo["empty"] = (
                "Memo will draft once a recommendation is computed"
            )
        else:
            # Keep the structure but rewrite the subject paragraph; the
            # remaining paragraphs are 200832-E-specific so drop them too
            # in favour of the live briefing.
            legacy_memo["paragraphs"] = [{"body": subject_line}]
        workbench["memo"] = legacy_memo
    except Exception:
        logger.exception("workbench._replace memo failed aid=%s", aid)


async def build_workbench(
    *,
    aid: str,
    tier: Optional[str] = None,
    source: Optional[str] = None,
    reason: Optional[str] = None,
) -> dict[str, Any]:
    """Per-SKU workbench. Today the seed only carries the default SKU's
    workbench; for any other aid we return that same template tagged with
    the requested aid so the contract holds end-to-end.

    Phase 1 attaches ``recommendation/wtp/win_prob_curve/competitor_ref``
    as optional fields (omitted on failure, never 500).

    Phase 3 (Pricing Studio v3) adds ``option_margins`` (per-option
    pocket waterfalls), ``cost_history`` (per-SKU narrowed commodity
    trajectories) and ``trigger_context`` (the deep-link banner). The
    ``source``/``reason`` URL params drive the banner — when neither is
    set the field is omitted.
    """
    sku = _find_sku(aid)
    if sku is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail=f"unknown aid: {aid}"
        )
    seed = load_seed()
    workbench = dict(seed["workbench"])
    if "hero" in workbench:
        hero = dict(workbench["hero"])
        hero["aid"] = aid
        if sku.get("shortHero"):
            short = sku["shortHero"]
            hero["title"] = short.get("title", hero.get("title"))
            hero["sub"] = short.get("sub", hero.get("sub"))
            # Honour the per-SKU shortHero price/margin overrides — without
            # these, every non-default SKU rendered the default SKU's
            # €4.20 / −1.3% in the hero while the recommendation used the
            # SKU's real price_state, producing nonsense deltas like
            # "+9704% upside on €284 → €411".
            for key in (
                "currentPrice",
                "currentMargin",
                "currentMarginTone",
                "targetText",
                "meta",
            ):
                v = short.get(key)
                if v not in (None, "", "—"):
                    hero[key] = v
        # Also overlay the canonical current_price from price_state so the
        # hero never lies about reality even when shortHero is absent or
        # stale (e.g. SKUs in the seed without a shortHero block).
        try:
            from sqlalchemy import select

            from backend.models.pricing.pricing_state import PriceStateRow

            with SessionLocal() as db:
                row = db.execute(
                    select(PriceStateRow).where(PriceStateRow.aid == aid)
                ).scalar_one_or_none()
                if row is not None and row.current_price is not None:
                    hero["currentPrice"] = _format_eur(row.current_price)
        except Exception:
            logger.exception("workbench.hero currentPrice override failed aid=%s", aid)
        workbench["hero"] = hero
    workbench["aid"] = aid
    cluster = str(sku.get("cluster") or "") or None
    _attach_phase1_signals(
        workbench,
        aid,
        tier or str(sku.get("tier") or "") or None,
        cluster=cluster,
    )
    _attach_phase2_signals(workbench, aid)
    _attach_phase3_signals(
        workbench,
        aid,
        source=source,
        reason=reason,
        cluster=cluster,
    )
    _attach_phase8_signals(workbench, aid)
    # Pricing Studio v3 / Phase 13 — replace the legacy seed blocks
    # (`fanout`, `cost`, `history`, `memo`) with per-aid derivations so we
    # never lie about reality.  Each block falls back to a "not yet
    # available" empty-state when the underlying DB rows don't exist.
    _replace_legacy_blocks(workbench, aid, sku=sku)
    return workbench


async def build_comparable(*, aid: str) -> dict[str, Any]:
    """Comparable-cluster panel. Only meaningful for ``isNew=true`` SKUs;
    for known SKUs we still return the seed payload so the frontend can
    decide whether to render.
    """
    sku = _find_sku(aid)
    if sku is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail=f"unknown aid: {aid}"
        )
    seed = load_seed()
    comparable = dict(seed["comparable"])
    comparable["aid"] = aid
    comparable["isNew"] = bool(sku.get("isNew", False))
    return comparable
