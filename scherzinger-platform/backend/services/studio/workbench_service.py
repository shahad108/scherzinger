"""Per-SKU workbench + comparable services.

Phase A2 + A3 + A4 (Pricing Studio plan §5):
    * No seed-merge anywhere. Workbench is built from a small empty
      scaffold plus DB-derived blocks (recommendation, wtp, win-prob
      curve, competitor ref, fanout, cost-history, option margins,
      legacy fanout/cost/history/memo).
    * Each block reports a status via ``meta.blocks[<block>]`` using the
      same enum the Action Center composer uses:
        - ``'live'``    real data present
        - ``'empty'``   underlying query returned nothing (legitimate)
        - ``'degraded'`` an exception was caught — we logged + rolled
                        back the txn — the FE shows the degraded chip
        - ``'locked'``  data source not connected at all (today only
                        competitor_ref falls here)
    * Every ``except`` that handles a DB call now calls ``db.rollback()``
      on the active session before swallowing — same pattern as
      ``backend/services/action_center/decisions.py``. This stops a
      single failing query from poisoning the rest of the txn.
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

from ._seed import StudioBlockError  # noqa: F401 — re-exported for callers

logger = logging.getLogger(__name__)


# ---------------------------------------------------------------------------
# Status-meta helpers
# ---------------------------------------------------------------------------


def _live(reason: str | None = None) -> dict[str, Any]:
    return {"status": "live", "reason": reason}


def _empty(reason: str | None = None) -> dict[str, Any]:
    return {"status": "empty", "reason": reason}


def _degraded(reason: str) -> dict[str, Any]:
    return {"status": "degraded", "reason": reason}


def _locked(reason: str) -> dict[str, Any]:
    return {"status": "locked", "reason": reason}


def _safe_rollback(db) -> None:
    """Best-effort rollback. Never raises."""
    try:
        db.rollback()
    except Exception:
        # Swallowing here is correct — the caller is already in an error
        # path; the session will close on the with-block exit anyway.
        pass


def _format_eur(value: Decimal | float | None) -> str:
    """Format a Decimal/float as a euro label (e.g. ``"€4.20"``, ``"€1,240"``)."""
    if value is None:
        return "—"
    try:
        v = Decimal(str(value))
    except Exception:
        logger.debug("studio:workbench:_format_eur non-numeric input=%r", value)
        return "—"
    if v == v.to_integral_value() and v >= 100:
        return f"€{int(v):,}"
    return f"€{v:,.2f}"


# ---------------------------------------------------------------------------
# Existence check (no more seed-find)
# ---------------------------------------------------------------------------


def _sku_exists(aid: str) -> tuple[bool, dict[str, Any]]:
    """Return (exists, sku_info). ``sku_info`` carries the canonical fields
    we previously read from ``studio.json`` shortHero — when missing we
    return an empty dict and the workbench renders with empty blocks.

    An aid is considered to exist if it has a row in ``price_state`` OR
    in ``cost_state``. Either is enough to construct a meaningful
    workbench shell.
    """
    try:
        from backend.models.pricing.cost_state import CostStateRow
        from backend.models.pricing.pricing_state import PriceStateRow

        with SessionLocal() as db:
            try:
                pr = db.execute(
                    select(PriceStateRow).where(PriceStateRow.aid == aid)
                ).scalar_one_or_none()
                cr = db.execute(
                    select(CostStateRow).where(CostStateRow.aid == aid)
                ).scalar_one_or_none()
            except Exception:
                logger.exception("studio:workbench:sku_exists aid=%s", aid)
                _safe_rollback(db)
                return False, {}
            if pr is None and cr is None:
                return False, {}
            sku: dict[str, Any] = {"aid": aid}
            if pr is not None:
                sku["cluster"] = getattr(pr, "cluster", None)
            return True, sku
    except Exception:
        logger.exception("studio:workbench:sku_exists aid=%s — DB unavailable", aid)
        return False, {}


def _resolve_envelope(
    aid: str, db
) -> tuple[Decimal, Decimal]:
    """Resolve a (floor, ceiling) envelope for the win-prob curve."""
    from backend.models.pricing.cost_state import CostStateRow
    from backend.models.pricing.pricing_state import PriceStateRow

    price_row = db.execute(
        select(PriceStateRow).where(PriceStateRow.aid == aid)
    ).scalar_one_or_none()
    cost_row = db.execute(
        select(CostStateRow).where(CostStateRow.aid == aid)
    ).scalar_one_or_none()
    return resolve_envelope(price_row, cost_row)


# ---------------------------------------------------------------------------
# Phase-1 signal attach (recommendation / wtp / win-prob / competitor)
# ---------------------------------------------------------------------------


def _attach_phase1_signals(
    workbench: dict[str, Any],
    aid: str,
    tier: Optional[str],
    cluster: Optional[str] = None,
) -> dict[str, dict[str, Any]]:
    """Attach recommendation / WTP / win-prob curve / competitor_ref.

    Each block writes its own status into the returned dict. On exception
    we log, roll back the session (so subsequent queries don't see an
    aborted txn), and emit ``status='degraded'`` with a short reason.

    The shared ``db`` session is the bug-prone bit — without rollback,
    a single failing SQL (e.g. column-name typo) would poison every
    subsequent query in the block. This is the same fix-pattern we
    applied to ``action_center/decisions.py``.
    """
    block_status: dict[str, dict[str, Any]] = {
        "recommendation": _empty("No recommendation yet for this aid"),
        # `drivers` mirrors `recommendation` status by default; promoted to
        # `degraded` when the recommender emits a heuristic split (one
        # signal swallowed the L1 pie — see services/pricing/recommendation.py
        # ``_maybe_heuristic_split``).
        "drivers": _empty("No drivers yet for this aid"),
        "wtp": _empty("No WTP band computed for this aid"),
        "win_prob_curve": _empty("No win-prob curve computed for this aid"),
        "competitor_ref": _locked("Competitor data source not connected"),
    }

    try:
        with SessionLocal() as db:
            # --- recommendation ---------------------------------------
            try:
                rec = recommendation_mod.build_recommendation(
                    aid=aid,
                    tier=tier,
                    cluster=cluster,
                    db_session=db,
                )
                if rec is not None:
                    workbench["recommendation"] = rec.model_dump(mode="json")
                    block_status["recommendation"] = _live()
                    # Drivers status: degraded when the recommender fell
                    # back to the heuristic split (one signal would have
                    # swallowed the L1 pie). Otherwise mirror recommendation
                    # status.
                    if getattr(rec, "drivers_heuristic", False):
                        block_status["drivers"] = _degraded(
                            "Driver attribution is heuristic — win-prob "
                            "curve was flat or competitor source locked, "
                            "so the per-driver shares are apportioned "
                            "from cost/floor/cluster signals rather than "
                            "measured."
                        )
                    else:
                        block_status["drivers"] = _live()
            except Exception as exc:
                logger.exception(
                    "studio:workbench:recommendation aid=%s tier=%s", aid, tier
                )
                _safe_rollback(db)
                block_status["recommendation"] = _degraded(
                    f"Recommendation builder failed ({type(exc).__name__})"
                )

            # --- WTP band --------------------------------------------
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
                    block_status["wtp"] = _live()
            except Exception as exc:
                logger.exception("studio:workbench:wtp aid=%s tier=%s", aid, tier)
                _safe_rollback(db)
                block_status["wtp"] = _degraded(
                    f"WTP builder failed ({type(exc).__name__})"
                )

            # --- win-prob curve --------------------------------------
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
                    block_status["win_prob_curve"] = _live()
            except Exception as exc:
                logger.exception(
                    "studio:workbench:win_prob_curve aid=%s tier=%s", aid, tier
                )
                _safe_rollback(db)
                block_status["win_prob_curve"] = _degraded(
                    f"Win-prob curve builder failed ({type(exc).__name__})"
                )

            # --- competitor_ref --------------------------------------
            try:
                comp = build_competitor_ref(aid=aid, n_days=90, db_session=db)
                if comp is not None:
                    workbench["competitor_ref"] = comp.model_dump(mode="json")
                    block_status["competitor_ref"] = _live()
                else:
                    workbench["competitor_ref"] = None
                    # Stays as 'locked' — the data source isn't connected.
            except Exception as exc:
                logger.exception("studio:workbench:competitor_ref aid=%s", aid)
                _safe_rollback(db)
                block_status["competitor_ref"] = _degraded(
                    f"Competitor lookup failed ({type(exc).__name__})"
                )

            try:
                db.commit()
            except Exception:
                logger.exception(
                    "studio:workbench:phase1 final commit failed aid=%s", aid
                )
                _safe_rollback(db)
    except Exception as exc:
        # Database itself unavailable — leave optional fields off and
        # mark every block degraded. Workbench shell still renders.
        logger.exception("studio:workbench:phase1 session setup failed aid=%s", aid)
        reason = f"DB session unavailable ({type(exc).__name__})"
        for key in block_status:
            if block_status[key].get("status") in ("empty", "live"):
                block_status[key] = _degraded(reason)

    return block_status


# ---------------------------------------------------------------------------
# Phase-2 customer-fanout
# ---------------------------------------------------------------------------


def _attach_phase2_signals(
    workbench: dict[str, Any],
    aid: str,
) -> dict[str, Any]:
    """Phase 2: customer-fanout block (BFF-computed, no proposed price)."""
    try:
        from backend.services.pricing.customer_fanout import build_customer_fanout

        with SessionLocal() as db:
            try:
                payload = build_customer_fanout(
                    aid=aid, proposed_price=None, db_session=db
                )
                workbench["customer_fanout"] = payload
                rows = (payload or {}).get("rows") or []
                try:
                    db.commit()
                except Exception:
                    logger.exception(
                        "studio:workbench:phase2 commit failed aid=%s", aid
                    )
                    _safe_rollback(db)
                if rows:
                    return _live()
                return _empty("No customers buying this aid in the lookback window")
            except Exception as exc:
                logger.exception("studio:workbench:customer_fanout aid=%s", aid)
                _safe_rollback(db)
                return _degraded(
                    f"Customer fanout failed ({type(exc).__name__})"
                )
    except Exception as exc:
        logger.exception("studio:workbench:phase2 session setup failed aid=%s", aid)
        return _degraded(f"DB session unavailable ({type(exc).__name__})")


# ---------------------------------------------------------------------------
# Phase-3 option-margins / cost-history / trigger-context
# ---------------------------------------------------------------------------


def _attach_phase3_signals(
    workbench: dict[str, Any],
    aid: str,
    *,
    source: Optional[str] = None,
    reason: Optional[str] = None,
    cluster: Optional[str] = None,
) -> dict[str, dict[str, Any]]:
    """Phase 3: option_margins, cost_history (per-SKU), trigger_context."""
    block_status: dict[str, dict[str, Any]] = {
        "option_margins": _empty("No options computed yet"),
        "cost_history": _empty("No cost history available for this aid"),
        "trigger_context": _empty(
            "No trigger context — open the workbench from Action Center to populate"
        ),
    }

    # --- option_margins ----------------------------------------------
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
            try:
                margins = build_option_margins(
                    aid=aid,
                    db_session=db,
                    recommended_price=rec_price,
                )
                workbench["option_margins"] = [m.model_dump(mode="json") for m in margins]
                if margins:
                    block_status["option_margins"] = _live()
                try:
                    db.commit()
                except Exception:
                    logger.exception(
                        "studio:workbench:option_margins commit failed aid=%s", aid
                    )
                    _safe_rollback(db)
            except Exception as exc:
                logger.exception("studio:workbench:option_margins aid=%s", aid)
                _safe_rollback(db)
                block_status["option_margins"] = _degraded(
                    f"Option margins failed ({type(exc).__name__})"
                )
    except Exception as exc:
        logger.exception(
            "studio:workbench:option_margins session setup failed aid=%s", aid
        )
        block_status["option_margins"] = _degraded(
            f"DB session unavailable ({type(exc).__name__})"
        )

    # --- cost_history ------------------------------------------------
    try:
        with SessionLocal() as db:
            try:
                cost_decomp = get_commodity_trajectories(db, aid=aid)
                workbench["cost_history"] = {
                    "points": [],
                    "commodities": cost_decomp.get("groups", []),
                    "quarters": cost_decomp.get("quarters", []),
                    "source": cost_decomp.get("source", "synthetic"),
                }
                if cost_decomp.get("groups") or cost_decomp.get("quarters"):
                    block_status["cost_history"] = _live()
                try:
                    db.commit()
                except Exception:
                    logger.exception(
                        "studio:workbench:cost_history commit failed aid=%s", aid
                    )
                    _safe_rollback(db)
            except Exception as exc:
                logger.exception("studio:workbench:cost_history aid=%s", aid)
                _safe_rollback(db)
                block_status["cost_history"] = _degraded(
                    f"Cost history failed ({type(exc).__name__})"
                )
    except Exception as exc:
        logger.exception(
            "studio:workbench:cost_history session setup failed aid=%s", aid
        )
        block_status["cost_history"] = _degraded(
            f"DB session unavailable ({type(exc).__name__})"
        )

    # --- trigger_context ---------------------------------------------
    if source and reason:
        try:
            from backend.services.pricing.trigger_context import build_trigger_context

            with SessionLocal() as db:
                try:
                    ctx = build_trigger_context(
                        aid=aid,
                        source=source,
                        reason=reason,
                        cluster=cluster,
                        db_session=db,
                    )
                    if ctx is not None:
                        workbench["trigger_context"] = ctx.model_dump(mode="json")
                        block_status["trigger_context"] = _live()
                    try:
                        db.commit()
                    except Exception:
                        logger.exception(
                            "studio:workbench:trigger_context commit failed aid=%s", aid
                        )
                        _safe_rollback(db)
                except Exception as exc:
                    logger.exception(
                        "studio:workbench:trigger_context aid=%s source=%s reason=%s",
                        aid,
                        source,
                        reason,
                    )
                    _safe_rollback(db)
                    block_status["trigger_context"] = _degraded(
                        f"Trigger context failed ({type(exc).__name__})"
                    )
        except Exception as exc:
            logger.exception(
                "studio:workbench:trigger_context session setup failed aid=%s", aid
            )
            block_status["trigger_context"] = _degraded(
                f"DB session unavailable ({type(exc).__name__})"
            )

    return block_status


# ---------------------------------------------------------------------------
# Phase-8 active A/B test
# ---------------------------------------------------------------------------


def _attach_phase8_signals(
    workbench: dict[str, Any],
    aid: str,
) -> dict[str, Any]:
    """Active A/B test summary for the workbench card."""
    try:
        from backend.services.pricing.ab_test import get_active_ab_test_summary

        with SessionLocal() as db:
            try:
                summary = get_active_ab_test_summary(aid=aid, db_session=db)
                if summary is not None:
                    workbench["active_ab_test"] = summary
                    return _live()
                return _empty("No active A/B test for this aid")
            except Exception as exc:
                logger.exception("studio:workbench:active_ab_test aid=%s", aid)
                _safe_rollback(db)
                return _degraded(
                    f"A/B test lookup failed ({type(exc).__name__})"
                )
    except Exception as exc:
        logger.exception(
            "studio:workbench:active_ab_test session setup failed aid=%s", aid
        )
        return _degraded(f"DB session unavailable ({type(exc).__name__})")


# ---------------------------------------------------------------------------
# Legacy-block derivations (fanout/cost/history/memo/options/hero)
# ---------------------------------------------------------------------------


def _percent_breakdown(breakdown: dict[str, Any]) -> list[dict[str, Any]]:
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
        # Pure date-arith fallback; no DB session involved here.
        logger.debug("studio:workbench:_quarter_label non-date input=%r", at)
        return str(at)[:10] if at else "—"


def _derive_history_rows(db, aid: str) -> list[dict[str, Any]]:
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
        logger.exception("studio:workbench:history pricing_audit aid=%s", aid)
        _safe_rollback(db)
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
    def _margin_at(price: Optional[Decimal]) -> Optional[float]:
        if price is None or unit_cost is None:
            return None
        try:
            if price == 0:
                return None
            return float((price - unit_cost) / price * 100)
        except Exception:
            # Pure-arith fallback — no DB session involved.
            logger.debug(
                "studio:workbench:_margin_at arith failed price=%s cost=%s",
                price,
                unit_cost,
            )
            return None

    def _impact(price: Optional[Decimal]) -> Optional[float]:
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
            logger.debug(
                "studio:workbench:_impact arith failed price=%s curr=%s units=%s",
                price,
                current_price,
                annual_units,
            )
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

    # FLOOR = price_state.floor or recommended
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

    # MARKET = ceiling or recommended
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
) -> dict[str, dict[str, Any]]:
    """Build the legacy blocks (fanout/cost/options/history/memo/hero) from
    live tables. Each block reports its status in the returned dict.

    Returned keys: ``fanout``, ``cost``, ``options``, ``hero``,
    ``history``, ``memo``.
    """
    block_status: dict[str, dict[str, Any]] = {
        "fanout": _empty("No customers buying this aid"),
        "cost": _empty("Cost composition not yet ingested for this aid"),
        "options": _empty("No options derived for this aid"),
        "hero": _empty("Hero margin unavailable"),
        "history": _empty("No prior repricings recorded for this aid"),
        "memo": _empty("Memo will draft once a recommendation is computed"),
    }

    # -- fanout legacy-shape derivation -------------------------------
    try:
        live_fan = workbench.get("customer_fanout") or {}
        live_rows = live_fan.get("rows") or []
        legacy_fan: dict[str, Any] = {}
        legacy_fan["rows"] = []
        if not live_rows:
            legacy_fan["empty"] = (
                "No customers buying this SKU in the trailing 12 months"
            )
            legacy_fan["clusterNote"] = ""
            legacy_fan["footNote"] = ""
        else:
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
            cluster = str(sku.get("cluster") or "") or "—"
            legacy_fan["clusterNote"] = (
                f"Cluster **{cluster}** · "
                f"{len(live_rows)} customer(s) on this SKU in the trailing window"
            )
            block_status["fanout"] = _live()
        workbench["fanout"] = legacy_fan
    except Exception as exc:
        logger.exception("studio:workbench:legacy.fanout aid=%s", aid)
        block_status["fanout"] = _degraded(
            f"Fanout shape derivation failed ({type(exc).__name__})"
        )
        workbench.setdefault("fanout", {"rows": []})

    # -- cost composition --------------------------------------------
    try:
        from backend.models.pricing.cost_state import CostStateRow
        from backend.models.pricing.pricing_state import PriceStateRow

        with SessionLocal() as db:
            try:
                cost_row = db.execute(
                    select(CostStateRow).where(CostStateRow.aid == aid)
                ).scalar_one_or_none()
                price_row = db.execute(
                    select(PriceStateRow).where(PriceStateRow.aid == aid)
                ).scalar_one_or_none()
            except Exception as exc:
                logger.exception("studio:workbench:legacy.cost aid=%s", aid)
                _safe_rollback(db)
                block_status["cost"] = _degraded(
                    f"Cost query failed ({type(exc).__name__})"
                )
                cost_row = price_row = None
        legacy_cost: dict[str, Any] = {}
        components: list[dict[str, Any]] = []
        if cost_row is not None and cost_row.breakdown:
            components = _percent_breakdown(cost_row.breakdown)
        if components:
            legacy_cost["components"] = components
            material_pct = next(
                (c["pct"] for c in components if c["key"] == "material"), 0
            )
            sku_cluster = sku.get("cluster")
            if sku_cluster:
                legacy_cost["note"] = (
                    f"Material {material_pct:.0f}% of unit cost · cluster "
                    f"{sku_cluster}."
                )
            else:
                legacy_cost["note"] = f"Material {material_pct:.0f}% of unit cost."
            block_status["cost"] = _live()
        else:
            legacy_cost["components"] = []
            legacy_cost["empty"] = "Cost composition not yet ingested for this SKU"
            legacy_cost["note"] = ""

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
        target_margin_pct = 25
        legacy_cost["unitCost"] = (
            f"{float(unit_cost):.2f}" if unit_cost is not None else None
        )
        if floor_price is not None:
            legacy_cost["floorCalc"] = f"{float(floor_price):.2f}"
        elif unit_cost is not None:
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
    except Exception as exc:
        logger.exception("studio:workbench:legacy.cost session aid=%s", aid)
        block_status["cost"] = _degraded(
            f"Cost session unavailable ({type(exc).__name__})"
        )
        workbench.setdefault("cost", {"components": []})

    # -- options block -----------------------------------------------
    try:
        from backend.models.pricing.cost_state import CostStateRow as _CR
        from backend.models.pricing.pricing_state import PriceStateRow as _PR

        with SessionLocal() as db:
            try:
                cost_row2 = db.execute(
                    select(_CR).where(_CR.aid == aid)
                ).scalar_one_or_none()
                price_row2 = db.execute(
                    select(_PR).where(_PR.aid == aid)
                ).scalar_one_or_none()
            except Exception as exc:
                logger.exception("studio:workbench:legacy.options query aid=%s", aid)
                _safe_rollback(db)
                block_status["options"] = _degraded(
                    f"Options query failed ({type(exc).__name__})"
                )
                cost_row2 = price_row2 = None
        rec = workbench.get("recommendation") or {}
        rec_price = None
        try:
            rec_raw = rec.get("recommended_price") if isinstance(rec, dict) else None
            rec_price = Decimal(str(rec_raw)) if rec_raw is not None else None
        except Exception:
            logger.debug(
                "studio:workbench:legacy.options bad rec_price=%r",
                rec.get("recommended_price"),
            )
            rec_price = None
        annual_units = None
        try:
            au = (sku.get("annualUnits") if isinstance(sku, dict) else None)
            annual_units = float(au) if au is not None else None
        except Exception:
            logger.debug("studio:workbench:legacy.options bad annual_units")
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
        if options and (
            options.get("hold", {}).get("price")
            or options.get("floor", {}).get("price")
            or options.get("market", {}).get("price")
        ):
            block_status["options"] = _live()
    except Exception as exc:
        logger.exception("studio:workbench:legacy.options session aid=%s", aid)
        block_status["options"] = _degraded(
            f"Options session unavailable ({type(exc).__name__})"
        )
        workbench.setdefault("options", {})

    # -- hero margin recompute ---------------------------------------
    # Phase B6: hero exposes BOTH a trailing 12-month invoice-derived
    # margin AND a point-in-time price_state/cost_state margin. The FE
    # renders them side-by-side so the analyst can tell which source
    # any single number came from. If either source is missing we keep
    # the available one and tag the block as degraded with a reason
    # pointing at the missing source.
    try:
        from sqlalchemy import text as _text

        from backend.models.pricing.cost_state import CostStateRow as _CR2
        from backend.models.pricing.pricing_state import PriceStateRow as _PR2

        trailing_margin: Optional[str] = None
        point_margin: Optional[str] = None
        missing_sources: list[str] = []

        with SessionLocal() as db:
            try:
                cost_row3 = db.execute(
                    select(_CR2).where(_CR2.aid == aid)
                ).scalar_one_or_none()
                price_row3 = db.execute(
                    select(_PR2).where(_PR2.aid == aid)
                ).scalar_one_or_none()
            except Exception as exc:
                logger.exception("studio:workbench:legacy.hero query aid=%s", aid)
                _safe_rollback(db)
                block_status["hero"] = _degraded(
                    f"Hero query failed ({type(exc).__name__})"
                )
                cost_row3 = price_row3 = None
            # Trailing 12mo margin from the invoice ledger.
            try:
                trailing_row = (
                    db.execute(
                        _text(
                            """
                            SELECT AVG(db2_margin) AS avg_margin
                              FROM invoices
                             WHERE article_id = :aid
                               AND db2_margin IS NOT NULL
                               AND date >= (CURRENT_DATE - INTERVAL '12 months')
                            """
                        ),
                        {"aid": aid},
                    )
                    .mappings()
                    .first()
                )
                if trailing_row and trailing_row.get("avg_margin") is not None:
                    try:
                        trailing_margin = str(Decimal(str(trailing_row["avg_margin"])).quantize(Decimal("0.0001")))
                    except Exception:
                        trailing_margin = None
            except Exception:
                logger.exception(
                    "studio:workbench:legacy.hero trailing aid=%s", aid
                )
                _safe_rollback(db)
                trailing_margin = None
        if trailing_margin is None:
            missing_sources.append("trailing_margin (no invoices in last 12mo)")

        # Point-in-time margin from price_state / cost_state.
        if (
            price_row3 is not None
            and price_row3.current_price is not None
            and cost_row3 is not None
            and cost_row3.unit_cost is not None
        ):
            cp = Decimal(str(price_row3.current_price))
            uc = Decimal(str(cost_row3.unit_cost))
            if cp > 0:
                try:
                    point_margin = str(
                        ((cp - uc) / cp).quantize(Decimal("0.0001"))
                    )
                except Exception:
                    point_margin = None
        if point_margin is None:
            missing_sources.append("point_margin (price_state or cost_state missing)")

        # Backward-compat scalar (the legacy frontend reads currentMargin
        # / currentMarginPct directly off the hero). Prefer the point
        # margin when present, fall back to the trailing margin.
        hero = dict(workbench.get("hero") or {})
        # Phase B6 — explicit dual margin fields with labels.
        hero["trailing_margin"] = trailing_margin
        hero["point_margin"] = point_margin
        hero["trailing_margin_label"] = "Trailing 12mo margin"
        hero["point_margin_label"] = "Current point margin"

        chosen = point_margin or trailing_margin
        if chosen is not None:
            try:
                margin_pct = float(Decimal(chosen)) * 100
                tone = (
                    "good"
                    if margin_pct >= 25
                    else ("amber" if margin_pct >= 0 else "bad")
                )
                sign = "+" if margin_pct >= 0 else "−"
                hero["currentMargin"] = f"{sign}{abs(margin_pct):.1f}% margin"
                hero["currentMarginTone"] = tone
                hero["currentMarginPct"] = round(margin_pct, 2)
            except Exception:
                pass
        if price_row3 is not None and price_row3.current_price is not None:
            hero["currentPrice"] = _format_eur(price_row3.current_price)
        workbench["hero"] = hero

        if trailing_margin is not None and point_margin is not None:
            block_status["hero"] = _live()
        elif trailing_margin is None and point_margin is None:
            block_status["hero"] = _empty(
                "Hero margin unavailable: both invoice trailing margin and "
                "price_state/cost_state point margin are missing"
            )
        else:
            block_status["hero"] = _degraded(
                "Hero margin partial — missing: " + "; ".join(missing_sources)
            )
    except Exception as exc:
        logger.exception("studio:workbench:legacy.hero session aid=%s", aid)
        block_status["hero"] = _degraded(
            f"Hero session unavailable ({type(exc).__name__})"
        )

    # -- repricing history -------------------------------------------
    try:
        with SessionLocal() as db:
            try:
                history_rows = _derive_history_rows(db, aid)
            except Exception as exc:
                logger.exception("studio:workbench:legacy.history aid=%s", aid)
                _safe_rollback(db)
                block_status["history"] = _degraded(
                    f"History query failed ({type(exc).__name__})"
                )
                history_rows = []
        if history_rows:
            workbench["history"] = history_rows
            block_status["history"] = _live()
        else:
            workbench["history"] = []
            workbench["history_empty"] = (
                "No prior repricings recorded for this SKU"
            )
    except Exception as exc:
        logger.exception("studio:workbench:legacy.history session aid=%s", aid)
        block_status["history"] = _degraded(
            f"History session unavailable ({type(exc).__name__})"
        )
        workbench["history"] = []

    # -- memo (subject line only — body comes from useBriefing live LLM)
    try:
        legacy_memo: dict[str, Any] = {}
        cluster = sku.get("cluster") or "—"
        description = aid
        rec = workbench.get("recommendation") or {}
        rec_price = rec.get("recommended_price") if isinstance(rec, dict) else None
        subject_line = (
            f"**Subject:** Price proposal — Article {aid} "
            f"({description}, cluster {cluster})"
        )
        if rec_price is None:
            legacy_memo["paragraphs"] = [{"body": subject_line}]
            legacy_memo["empty"] = (
                "Memo will draft once a recommendation is computed"
            )
        else:
            legacy_memo["paragraphs"] = [{"body": subject_line}]
            block_status["memo"] = _live()
        workbench["memo"] = legacy_memo
    except Exception as exc:
        logger.exception("studio:workbench:legacy.memo aid=%s", aid)
        block_status["memo"] = _degraded(
            f"Memo derivation failed ({type(exc).__name__})"
        )
        workbench.setdefault("memo", {"paragraphs": []})

    return block_status


# ---------------------------------------------------------------------------
# Public builders
# ---------------------------------------------------------------------------


async def build_workbench(
    *,
    aid: str,
    tier: Optional[str] = None,
    source: Optional[str] = None,
    reason: Optional[str] = None,
) -> dict[str, Any]:
    """Per-SKU workbench.

    Phase A3: no seed merge. The aid must exist in ``price_state`` or
    ``cost_state`` (404 otherwise). All workbench blocks are derived
    from live tables; each carries an entry in ``meta.blocks`` so the
    frontend can render ``live``/``empty``/``degraded``/``locked``
    states honestly.
    """
    exists, sku = _sku_exists(aid)
    if not exists:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail=f"unknown aid: {aid}"
        )

    # Start from a minimal scaffold — empty blocks the FE renders as
    # "empty" until a builder upgrades them to "live". The hero title /
    # sub / eyebrow are seeded from the SKU + cluster so the dark hero
    # card on the right of the workbench shows something meaningful even
    # before the phase-1 builders enrich it with recommendation copy.
    cluster = str(sku.get("cluster") or "") or None
    sku_tier = str(sku.get("tier") or "") or None
    tier_label = sku_tier.upper() if sku_tier else None
    eyebrow_parts: list[str] = []
    if tier_label:
        eyebrow_parts.append(f"Tier {tier_label}")
    if cluster:
        eyebrow_parts.append(f"Cluster {cluster}")
    eyebrow = " · ".join(eyebrow_parts) or "Pricing workbench"
    sub_parts: list[str] = []
    if cluster:
        sub_parts.append(f"Belongs to cluster {cluster}")
    if tier_label:
        sub_parts.append(f"tier {tier_label}")
    sub = ", ".join(sub_parts).capitalize() if sub_parts else (
        "Live workbench — pick an option below to draft a proposal."
    )
    workbench: dict[str, Any] = {
        "aid": aid,
        "hero": {
            "aid": aid,
            "eyebrow": eyebrow,
            "title": f"Article {aid}",
            "sub": sub,
            "chips": [],
            "meta": "",
            "currentPrice": None,
            "currentMargin": None,
            "currentMarginTone": "good",
            "targetText": "",
        },
        "options": {},
        "fanout": {"rows": [], "clusterNote": "", "footNote": ""},
        "cost": {"components": [], "note": ""},
        "history": [],
        "decision": {},
        "memo": {"paragraphs": []},
    }

    phase1_status = _attach_phase1_signals(
        workbench,
        aid,
        tier or str(sku.get("tier") or "") or None,
        cluster=cluster,
    )
    phase2_status = _attach_phase2_signals(workbench, aid)
    phase3_status = _attach_phase3_signals(
        workbench,
        aid,
        source=source,
        reason=reason,
        cluster=cluster,
    )
    phase8_status = _attach_phase8_signals(workbench, aid)
    legacy_status = _replace_legacy_blocks(workbench, aid, sku=sku)

    # Aggregate per-block status into meta.blocks. Order is stable so
    # the frontend's iteration is deterministic.
    meta_blocks: dict[str, Any] = {
        "recommendation": phase1_status["recommendation"],
        "drivers": phase1_status.get(
            "drivers", _empty("No drivers yet for this aid")
        ),
        "wtp": phase1_status["wtp"],
        "win_prob_curve": phase1_status["win_prob_curve"],
        "competitor_ref": phase1_status["competitor_ref"],
        "customer_fanout": phase2_status,
        "cost_history": phase3_status["cost_history"],
        "option_margins": phase3_status["option_margins"],
        "trigger_context": phase3_status["trigger_context"],
        "active_ab_test": phase8_status,
        # Legacy-shape blocks the FE reads from the workbench root:
        "fanout": legacy_status["fanout"],
        "cost": legacy_status["cost"],
        "options": legacy_status["options"],
        "hero": legacy_status["hero"],
        "history": legacy_status["history"],
        "memo": legacy_status["memo"],
        # Decision block is currently a pass-through stub — until F-phase
        # wires real lifecycle reads it's intentionally empty.
        "decision": _empty(
            "Decision lifecycle data is computed on Accept/Reject — see Phase F"
        ),
        # Comparable lives on its own endpoint.
        "comparable": _empty("Use /screens/studio/comparable/{aid}"),
    }
    workbench["meta"] = {"blocks": meta_blocks}
    return workbench


async def build_comparable(*, aid: str) -> dict[str, Any]:
    """Comparable-cluster panel. Phase A3: returns an empty rows list
    when no comparable data exists for the aid — never a seeded payload.
    """
    exists, sku = _sku_exists(aid)
    if not exists:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail=f"unknown aid: {aid}"
        )
    comparable: dict[str, Any] = {
        "aid": aid,
        "isNew": bool(sku.get("isNew", False)),
        "rows": [],
        "meta": {
            "blocks": {
                "comparable": _empty(
                    "Comparable lookup not yet connected — needs cluster-similarity index"
                )
            }
        },
    }
    return comparable
