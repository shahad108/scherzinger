"""Phase 6 (Pricing Studio v3) — batch repricing composer.

Two responsibilities:

  ``build_batch_preview``  — apply a rule to every (aid in batch) and
                             return per-SKU before/after/delta/projected
                             rows. No DB writes beyond a per-SKU lineage.

  ``commit_batch``         — turn a previewed batch into N proposals
                             (one per AID), each routed through the
                             approval-rules engine. Returns the routing
                             summary so the UI can render the inbox
                             distribution before commit.

Rules are a Pydantic discriminated union on ``kind`` — see
``BatchRule`` below. The escape-hatch JSON-logic rule re-uses the
in-house evaluator that ``approval_rules`` ships, so the rule library is
consistent end-to-end.

Decimal end-to-end: every monetary value is ``Decimal`` from the moment
it leaves the DB until it lands in JSONB (where Pydantic ``mode='json'``
stringifies it). No JS float ever touches a price.
"""
from __future__ import annotations

import logging
from datetime import datetime, timezone
from decimal import Decimal
from typing import Any, Literal, Optional, Union
from uuid import UUID, uuid4

from pydantic import BaseModel, ConfigDict, Field
from sqlalchemy.orm import Session

from backend.models import PricingProposal, Recommendation
from backend.models.pricing.batch import (
    PricingBatch,
    PricingBatchItem,
    PricingBatchItemStatus,
    PricingBatchStatus,
)
from backend.models.pricing.competitor import CompetitorRef
from backend.models.pricing.cost_state import CostStateRow
from backend.models.pricing.lineage import LineageSourceKind
from backend.models.pricing.pricing_state import PriceStateRow
from backend.services.pricing import (
    approval_rules,
    elasticity as elasticity_mod,
    option_margin as option_margin_mod,
    recommendation as recommendation_mod,
)
from backend.services.pricing.approval_rules import (
    Proposal as RulesProposal,
    should_route_for_approval,
)
from backend.services.pricing.envelope import resolve_envelope
from backend.services.pricing.lineage import create_lineage

logger = logging.getLogger(__name__)


_PRICE_QUANT = Decimal("0.0001")
_PCT_QUANT = Decimal("0.0001")


# ---------------------------------------------------------------------------
# Rule and scope filter — Pydantic discriminated union.
# ---------------------------------------------------------------------------


class FloorPlusRule(BaseModel):
    """Set ``after_price = floor × (1 + margin_pp / 100)``.

    When no floor is recorded on PriceState we fall back to
    ``unit_cost × (1 + margin_pp / 100)`` so the rule still produces a
    safe lower-bound move rather than a 0 / NaN.
    """

    kind: Literal["floor_plus"] = "floor_plus"
    margin_pp: Decimal = Field(...)


class PctMoveRule(BaseModel):
    """Uniform percentage move (``after = before × (1 + pct/100)``).

    When ``floor_cap`` is true, the resulting price is capped at the WTP
    p90 (so an over-aggressive +30% move never sails past plausible
    market clearance).
    """

    kind: Literal["pct_move"] = "pct_move"
    pct: Decimal = Field(...)
    floor_cap: bool = False


class MatchCompetitorRule(BaseModel):
    """Set price to ``competitor_median × (1 - undershoot_pct/100)``.

    Falls back to the current price unchanged when the competitor index
    has no recent sample for the SKU.
    """

    kind: Literal["match_competitor"] = "match_competitor"
    undershoot_pct: Decimal = Field(...)


class TargetDb2Rule(BaseModel):
    """Solve for the price on the win-prob curve that hits ``target_pp``
    margin of DB2-over-invoiced revenue.

    Uses the same elasticity curve + option-margin waterfall the
    workbench renders; picks the grid point whose projected DB2/invoiced
    is closest to (but not below) ``target_pp``. Falls back to the
    recommendation's optimum when the curve has no signal.
    """

    kind: Literal["target_db2"] = "target_db2"
    target_pp: Decimal = Field(...)


class CustomJsonLogicRule(BaseModel):
    """Escape hatch — a JSON-logic expression evaluated with the in-house
    evaluator from ``approval_rules``.

    The expression has access to the per-SKU context:
      - ``current_price`` (float)
      - ``floor`` (float | None)
      - ``unit_cost`` (float | None)
      - ``wtp_p90`` (float | None)
      - ``competitor_median`` (float | None)

    The expression's truthy value is interpreted as a number and used as
    the new ``after_price``. Non-numeric truthy results coerce to
    ``current_price`` so a malformed expression can't push a SKU to 0.
    """

    kind: Literal["custom_jsonlogic"] = "custom_jsonlogic"
    expression: dict[str, Any] = Field(...)


BatchRule = Union[
    FloorPlusRule,
    PctMoveRule,
    MatchCompetitorRule,
    TargetDb2Rule,
    CustomJsonLogicRule,
]


class ScopeFilter(BaseModel):
    """Per-SKU inclusion filter applied at preview composition time.

    All fields default to ``None`` (no filter). Lists are inclusive OR
    within a field; multiple fields combine with AND.
    """

    model_config = ConfigDict(extra="forbid")

    tier: Optional[list[str]] = None
    family: Optional[list[str]] = None
    cluster: Optional[list[str]] = None
    min_ltm_units: Optional[int] = None


# ---------------------------------------------------------------------------
# Preview wire shape.
# ---------------------------------------------------------------------------


class BatchPreviewItem(BaseModel):
    """One row of the per-SKU preview table."""

    model_config = ConfigDict(arbitrary_types_allowed=True)

    aid: str
    before_price: Optional[Decimal] = None
    after_price: Optional[Decimal] = None
    delta: Optional[Decimal] = None
    delta_pct: Optional[Decimal] = None
    projected_db2: Optional[Decimal] = None
    win_prob_at_new: Optional[Decimal] = None
    risk_score: Optional[Decimal] = None
    lineage_ref: Optional[UUID] = None
    # Per-SKU approval route, captured at preview time so the UI can
    # render the routing summary without round-tripping every row.
    approval_route: list[str] = Field(default_factory=list)
    auto_approve: bool = False
    block: bool = False
    note: Optional[str] = None


class ApprovalRoutingSummary(BaseModel):
    """Per-role count of how many of the preview's items would route
    through that role. ``auto_approve`` and ``block`` are bucketed
    separately so the UI can show the "this many will skip approval"
    pill.
    """

    model_config = ConfigDict(extra="allow")

    auto_approve: int = 0
    block: int = 0


class BatchPreview(BaseModel):
    """Full preview payload for a batch."""

    batch_id: UUID
    status: str
    rule: dict[str, Any]
    scope_filter: dict[str, Any]
    items: list[BatchPreviewItem]
    approval_routing_summary: dict[str, int]
    kpi_summary: dict[str, Any]
    created_at: Optional[datetime] = None
    committed_at: Optional[datetime] = None
    cancelled_at: Optional[datetime] = None


# ---------------------------------------------------------------------------
# Per-SKU input loaders.
# ---------------------------------------------------------------------------


class _SkuInputs(BaseModel):
    """Cached per-SKU loads used across rule kinds."""

    model_config = ConfigDict(arbitrary_types_allowed=True)

    aid: str
    current_price: Optional[Decimal] = None
    floor: Optional[Decimal] = None
    ceiling: Optional[Decimal] = None
    unit_cost: Optional[Decimal] = None
    wtp_p90: Optional[Decimal] = None
    competitor_median: Optional[Decimal] = None
    competitor: Optional[CompetitorRef] = None
    rec_optimum: Optional[Decimal] = None


def _load_inputs(*, aid: str, db_session: Session) -> _SkuInputs:
    """Best-effort load of every signal a rule might need.

    Each loader is wrapped — a missing input never raises out of preview
    composition. Rules degrade gracefully (``MatchCompetitorRule`` keeps
    the current price when competitor median is unknown, etc.).
    """
    price_row = db_session.get(PriceStateRow, aid)
    current_price = (
        Decimal(str(price_row.current_price)) if price_row is not None else None
    )
    floor = (
        Decimal(str(price_row.floor))
        if price_row is not None and price_row.floor is not None
        else None
    )
    ceiling = (
        Decimal(str(price_row.ceiling))
        if price_row is not None and price_row.ceiling is not None
        else None
    )

    cost_row = db_session.get(CostStateRow, aid)
    unit_cost = Decimal(str(cost_row.unit_cost)) if cost_row is not None else None

    # WTP p90 — soft-fail.
    wtp_p90: Optional[Decimal] = None
    try:
        from backend.services.pricing import wtp as wtp_mod

        wtp = wtp_mod.build_wtp(
            aid=aid, tier=None, window_days=540, db_session=db_session
        )
        if wtp is not None:
            wtp_p90 = Decimal(str(wtp.p90))
    except Exception:  # pragma: no cover — defensive
        logger.exception("batch._load_inputs wtp aid=%s", aid)

    # Competitor median — soft-fail.
    competitor_median: Optional[Decimal] = None
    competitor: Optional[CompetitorRef] = None
    try:
        from backend.services.competitor.index import build_competitor_ref

        competitor = build_competitor_ref(aid=aid, n_days=90, db_session=db_session)
        if competitor is not None:
            competitor_median = Decimal(str(competitor.median_price))
    except Exception:
        logger.exception("batch._load_inputs competitor aid=%s", aid)

    return _SkuInputs(
        aid=aid,
        current_price=current_price,
        floor=floor,
        ceiling=ceiling,
        unit_cost=unit_cost,
        wtp_p90=wtp_p90,
        competitor_median=competitor_median,
        competitor=competitor,
    )


# ---------------------------------------------------------------------------
# Rule application — pure functions.
# ---------------------------------------------------------------------------


def _apply_floor_plus(rule: FloorPlusRule, inputs: _SkuInputs) -> Optional[Decimal]:
    base = inputs.floor or inputs.unit_cost
    if base is None:
        return inputs.current_price
    factor = Decimal("1") + (rule.margin_pp / Decimal("100"))
    return (base * factor).quantize(_PRICE_QUANT)


def _apply_pct_move(rule: PctMoveRule, inputs: _SkuInputs) -> Optional[Decimal]:
    if inputs.current_price is None:
        return None
    factor = Decimal("1") + (rule.pct / Decimal("100"))
    out = (inputs.current_price * factor).quantize(_PRICE_QUANT)
    if rule.floor_cap and inputs.wtp_p90 is not None and out > inputs.wtp_p90:
        out = inputs.wtp_p90.quantize(_PRICE_QUANT)
    return out


def _apply_match_competitor(
    rule: MatchCompetitorRule, inputs: _SkuInputs
) -> Optional[Decimal]:
    if inputs.competitor_median is None:
        # Degrade — hold the current price rather than 0-ing the SKU.
        return inputs.current_price
    factor = Decimal("1") - (rule.undershoot_pct / Decimal("100"))
    return (inputs.competitor_median * factor).quantize(_PRICE_QUANT)


def _apply_target_db2(
    rule: TargetDb2Rule, inputs: _SkuInputs, *, db_session: Session
) -> Optional[Decimal]:
    """Find the curve grid price whose projected DB2/invoiced ≥ target_pp.

    Uses the same option-margin composer to project the waterfall.
    Falls back to the recommendation's optimum when no grid point
    qualifies.
    """
    if inputs.unit_cost is None:
        return inputs.current_price
    floor, ceiling = resolve_envelope(
        # resolve_envelope reads off ``current_price`` / ``floor`` / ``ceiling``
        # — we hand it a minimal proxy with only those fields populated.
        type("P", (), {
            "current_price": inputs.current_price or Decimal("0"),
            "floor": inputs.floor,
            "ceiling": inputs.ceiling,
            "list_price": None,
        })(),
        type("C", (), {"unit_cost": inputs.unit_cost})(),
    )
    try:
        curve = elasticity_mod.build_win_prob_curve(
            aid=inputs.aid,
            tier=None,
            points=20,
            floor=floor,
            ceiling=ceiling,
            db_session=db_session,
        )
    except Exception:
        logger.exception("batch._apply_target_db2 curve aid=%s", inputs.aid)
        return inputs.current_price

    if curve is None or not curve.points:
        return inputs.current_price

    ratios = option_margin_mod._extract_cluster_ratios(
        aid=inputs.aid, db_session=db_session
    )
    target_ratio = (rule.target_pp / Decimal("100"))
    best_price: Optional[Decimal] = None
    for pt in curve.points:
        _l, _q, _b, invoiced, db2, _leak = option_margin_mod._waterfall_from_price(
            price=pt.price, ratios=ratios, unit_cost=inputs.unit_cost
        )
        if invoiced <= 0:
            continue
        ratio = db2 / invoiced
        if ratio >= target_ratio:
            best_price = pt.price
            break
    if best_price is not None:
        return best_price.quantize(_PRICE_QUANT)
    # Fall back to the recommender's optimum (which respects floor).
    try:
        rec = recommendation_mod.build_recommendation(
            aid=inputs.aid, db_session=db_session
        )
        if rec is not None and rec.recommended_price is not None:
            return Decimal(str(rec.recommended_price)).quantize(_PRICE_QUANT)
    except Exception:
        logger.exception(
            "batch._apply_target_db2 recommendation aid=%s", inputs.aid
        )
    return inputs.current_price


def _apply_custom_jsonlogic(
    rule: CustomJsonLogicRule, inputs: _SkuInputs
) -> Optional[Decimal]:
    """Evaluate the json-logic expression and coerce the result to Decimal.

    The expression's context is the per-SKU input bag (floats). A
    non-numeric truthy value (e.g. ``True``) falls back to ``current_price``
    so a malformed escape-hatch rule can never zero a SKU.
    """
    ctx: dict[str, Any] = {
        "current_price": float(inputs.current_price) if inputs.current_price else None,
        "floor": float(inputs.floor) if inputs.floor else None,
        "unit_cost": float(inputs.unit_cost) if inputs.unit_cost else None,
        "wtp_p90": float(inputs.wtp_p90) if inputs.wtp_p90 else None,
        "competitor_median": (
            float(inputs.competitor_median)
            if inputs.competitor_median
            else None
        ),
    }
    try:
        value = approval_rules._eval(rule.expression, ctx)
    except (ValueError, TypeError, KeyError):
        logger.exception("batch._apply_custom_jsonlogic aid=%s eval failed", inputs.aid)
        return inputs.current_price
    if isinstance(value, bool):
        # Bare boolean — fall through to current price (per docstring).
        return inputs.current_price
    if isinstance(value, (int, float)):
        return Decimal(str(value)).quantize(_PRICE_QUANT)
    if isinstance(value, Decimal):
        return value.quantize(_PRICE_QUANT)
    return inputs.current_price


def _apply_rule(
    *, rule: BatchRule, inputs: _SkuInputs, db_session: Session
) -> Optional[Decimal]:
    if isinstance(rule, FloorPlusRule):
        return _apply_floor_plus(rule, inputs)
    if isinstance(rule, PctMoveRule):
        return _apply_pct_move(rule, inputs)
    if isinstance(rule, MatchCompetitorRule):
        return _apply_match_competitor(rule, inputs)
    if isinstance(rule, TargetDb2Rule):
        return _apply_target_db2(rule, inputs, db_session=db_session)
    if isinstance(rule, CustomJsonLogicRule):
        return _apply_custom_jsonlogic(rule, inputs)
    raise ValueError(f"unsupported batch rule kind: {type(rule)!r}")


# ---------------------------------------------------------------------------
# Risk + projection helpers.
# ---------------------------------------------------------------------------


def _win_prob_at(curve_points: list[Any], price: Decimal) -> Optional[Decimal]:
    """Win-prob at the nearest curve grid point."""
    if not curve_points:
        return None
    closest = min(curve_points, key=lambda p: abs(Decimal(str(p.price)) - price))
    return Decimal(str(closest.win_prob))


def _project_db2(
    *, inputs: _SkuInputs, after_price: Decimal, db_session: Session
) -> Optional[Decimal]:
    """Project DB2 (margin EUR per unit) at the proposed price.

    Re-uses the option-margin waterfall composer so the projection is
    identical to what the workbench renders. Returns ``None`` when we
    can't form a projection (no unit_cost).
    """
    if inputs.unit_cost is None:
        return None
    try:
        om = option_margin_mod.build_option_margin(
            aid=inputs.aid,
            option_id="batch_preview",
            price=after_price,
            unit_cost=inputs.unit_cost,
            db_session=db_session,
        )
        return Decimal(str(om.db2))
    except Exception:
        logger.exception("batch._project_db2 aid=%s", inputs.aid)
        return None


def _risk_score(
    *,
    before_price: Optional[Decimal],
    after_price: Optional[Decimal],
    win_prob_at_new: Optional[Decimal],
) -> Optional[Decimal]:
    """Cheap composite risk score in [0, 1].

    Weighted blend of |delta_pct| and (1 - win_prob_at_new). The blend
    avoids returning 0 for any move so the UI can render a meaningful
    pill even on a tiny delta.
    """
    if before_price is None or after_price is None or before_price == 0:
        return None
    delta_pct = abs((after_price - before_price) / before_price)
    win_term = (
        Decimal("1") - win_prob_at_new
        if win_prob_at_new is not None
        else Decimal("0.5")
    )
    score = (delta_pct * Decimal("0.6") + win_term * Decimal("0.4")).quantize(
        _PCT_QUANT
    )
    if score > Decimal("1"):
        score = Decimal("1")
    if score < Decimal("0"):
        score = Decimal("0")
    return score


# ---------------------------------------------------------------------------
# Scope filter — best-effort.
# ---------------------------------------------------------------------------


def _scope_includes(
    *, aid: str, scope: ScopeFilter, db_session: Session
) -> bool:
    """Best-effort scope predicate. Defaults to inclusive.

    We don't yet have a dedicated SKU-meta table in v3; the filter
    queries ``invoices`` for tier / family / cluster / ltm-units when a
    constraint is present. When ANY query fails we include the SKU so a
    transient outage doesn't silently drop rows.
    """
    if not any(
        (scope.tier, scope.family, scope.cluster, scope.min_ltm_units)
    ):
        return True
    try:
        from sqlalchemy import text

        row = db_session.execute(
            text(
                "SELECT business_unit, family_id, commodity_group, "
                "       SUM(quantity)::numeric AS ltm_units "
                "  FROM invoices "
                " WHERE article_id = :aid "
                "   AND date >= NOW() - INTERVAL '365 days' "
                " GROUP BY business_unit, family_id, commodity_group "
                " LIMIT 1"
            ),
            {"aid": aid},
        ).fetchone()
    except Exception:
        logger.exception("batch._scope_includes aid=%s", aid)
        return True
    if row is None:
        # No invoice history — include unless an explicit min_ltm_units > 0
        # was requested (the SKU clearly fails that one).
        return not (scope.min_ltm_units is not None and scope.min_ltm_units > 0)
    business_unit, family_id, commodity_group, ltm_units = row
    if scope.tier and business_unit not in scope.tier:
        return False
    if scope.family and family_id not in scope.family:
        return False
    if scope.cluster and commodity_group not in scope.cluster:
        return False
    if scope.min_ltm_units is not None:
        ltm = float(ltm_units) if ltm_units is not None else 0.0
        if ltm < scope.min_ltm_units:
            return False
    return True


# ---------------------------------------------------------------------------
# Approval routing — per-item.
# ---------------------------------------------------------------------------


def _route_for_item(
    *,
    aid: str,
    before_price: Optional[Decimal],
    after_price: Optional[Decimal],
) -> tuple[list[str], bool, bool, list[str]]:
    """Run the would-be proposal through ``should_route_for_approval``.

    Returns ``(needs, auto_approve, block, reasons)``.
    """
    if before_price is None or after_price is None:
        return ([], False, False, ["missing prices"])
    if before_price == 0:
        delta_pct = 0.0
    else:
        try:
            delta_pct = float((after_price - before_price) / before_price * Decimal("100"))
        except Exception:  # pragma: no cover — defensive
            delta_pct = 0.0
    delta_pp = float(after_price - before_price)
    proposal = RulesProposal(
        delta_pct=delta_pct,
        delta_pp=delta_pp,
        tier="B",  # MD/manuel routing in v3 isn't tier-dependent for non-tier-A;
        # batch flows don't know each SKU's predominant tier without a
        # customer-on-sku join, so we default to "B" (no auto-approve,
        # no MD-required) and let the per-rule conditions (delta>5pct,
        # short lead-time, etc.) drive the routing.
        effective_in_hours=72.0,
        aid=aid,
    )
    decision = should_route_for_approval(proposal)
    return (
        list(decision.needs),
        decision.auto_approve and not decision.needs and not decision.block,
        decision.block,
        list(decision.reasons),
    )


# ---------------------------------------------------------------------------
# Public API — preview.
# ---------------------------------------------------------------------------


def build_batch_preview(
    *,
    aids: list[str],
    rule: BatchRule,
    scope_filter: ScopeFilter,
    db_session: Session,
    actor: str = "system",
) -> tuple[PricingBatch, list[PricingBatchItem]]:
    """Apply the rule to each AID. Persists the batch + item rows.

    Returns ``(batch_row, item_rows)``. The caller commits.
    """
    batch = PricingBatch(
        created_by=actor,
        rule_json=rule.model_dump(mode="json"),
        scope_filter_json=scope_filter.model_dump(mode="json"),
        status=PricingBatchStatus.PREVIEW.value,
    )
    db_session.add(batch)
    db_session.flush()

    items: list[PricingBatchItem] = []
    for aid in aids:
        if not _scope_includes(aid=aid, scope=scope_filter, db_session=db_session):
            continue
        inputs = _load_inputs(aid=aid, db_session=db_session)
        before_price = inputs.current_price
        after_price = _apply_rule(rule=rule, inputs=inputs, db_session=db_session)
        if after_price is not None:
            after_price = after_price.quantize(_PRICE_QUANT)

        # Projection — best-effort.
        projected_db2: Optional[Decimal] = None
        win_prob_at_new: Optional[Decimal] = None
        if after_price is not None:
            projected_db2 = _project_db2(
                inputs=inputs, after_price=after_price, db_session=db_session
            )
            try:
                floor_e, ceiling_e = resolve_envelope(
                    type("P", (), {
                        "current_price": before_price or Decimal("0"),
                        "floor": inputs.floor,
                        "ceiling": inputs.ceiling,
                        "list_price": None,
                    })(),
                    type("C", (), {"unit_cost": inputs.unit_cost or Decimal("0")})(),
                )
                curve = elasticity_mod.build_win_prob_curve(
                    aid=aid,
                    tier=None,
                    points=20,
                    floor=floor_e,
                    ceiling=ceiling_e,
                    db_session=db_session,
                )
                if curve is not None:
                    win_prob_at_new = _win_prob_at(curve.points, after_price)
            except Exception:
                logger.exception("batch.preview win_prob aid=%s", aid)

        delta = (
            (after_price - before_price).quantize(_PRICE_QUANT)
            if (after_price is not None and before_price is not None)
            else None
        )
        delta_pct = None
        if before_price is not None and before_price != 0 and delta is not None:
            delta_pct = (delta / before_price).quantize(_PCT_QUANT)

        risk = _risk_score(
            before_price=before_price,
            after_price=after_price,
            win_prob_at_new=win_prob_at_new,
        )

        needs, auto_approve, block, reasons = _route_for_item(
            aid=aid, before_price=before_price, after_price=after_price
        )

        # Per-SKU lineage row — provenance for the preview values.
        lineage_row = create_lineage(
            source_kind=LineageSourceKind.ELASTICITY_MODEL,
            source_id=f"batch_preview:{batch.id}:{aid}",
            sql=None,
            model="batch_preview_v1",
            computed_by=actor,
            session=db_session,
        )

        preview_payload = BatchPreviewItem(
            aid=aid,
            before_price=before_price,
            after_price=after_price,
            delta=delta,
            delta_pct=delta_pct,
            projected_db2=projected_db2,
            win_prob_at_new=win_prob_at_new,
            risk_score=risk,
            lineage_ref=lineage_row.id,
            approval_route=needs,
            auto_approve=auto_approve,
            block=block,
            note=("; ".join(reasons) if reasons else None),
        )

        item = PricingBatchItem(
            batch_id=batch.id,
            aid=aid,
            before_price=before_price,
            after_price=after_price,
            status=PricingBatchItemStatus.QUEUED.value,
            per_sku_lineage_ref=lineage_row.id,
            preview_json=preview_payload.model_dump(mode="json"),
        )
        db_session.add(item)
        items.append(item)

    db_session.flush()
    return batch, items


# ---------------------------------------------------------------------------
# Public API — commit.
# ---------------------------------------------------------------------------


def commit_batch(
    *,
    batch: PricingBatch,
    db_session: Session,
    actor: str,
    actor_user_id,  # UUID — for the created proposals
    locked_aids: Optional[list[str]] = None,
    dry_run: bool = False,
) -> dict[str, Any]:
    """Turn the batch's queued items into proposals, routed through
    ``approval_rules``.

    ``locked_aids`` are excluded from the commit — their items stay in
    the ``locked`` status with no proposal created.

    Returns a commit summary::

      {
        "created_proposals": [<serialized proposal>, ...],
        "routed_by_role": {<role>: count, ...},
        "total_revenue_impact": "<Decimal>",
        "dry_run": bool,
      }
    """
    from backend.services import workflow_service
    from backend.services.pricing import approval_workflow

    if batch.status == PricingBatchStatus.COMMITTED.value:
        raise BatchAlreadyCommittedError(
            f"batch {batch.id} is already committed"
        )
    if batch.status == PricingBatchStatus.CANCELLED.value:
        raise BatchAlreadyCommittedError(
            f"batch {batch.id} is cancelled"
        )

    locked = set(locked_aids or [])
    items = (
        db_session.query(PricingBatchItem)
        .filter(PricingBatchItem.batch_id == batch.id)
        .all()
    )

    created: list[dict[str, Any]] = []
    routed_by_role: dict[str, int] = {}
    total_revenue_impact = Decimal("0")

    for item in items:
        if item.aid in locked:
            item.status = PricingBatchItemStatus.LOCKED.value
            continue
        before_price = (
            Decimal(str(item.before_price))
            if item.before_price is not None
            else None
        )
        after_price = (
            Decimal(str(item.after_price))
            if item.after_price is not None
            else None
        )
        if after_price is None:
            item.status = PricingBatchItemStatus.FAILED.value
            continue

        # Build a stable Recommendation envelope (idempotent on source_ref).
        rec = workflow_service.ensure_recommendation(
            db_session,
            actor_user_id=actor_user_id,
            body={
                "recommendation_id": f"batch:{batch.id}:{item.aid}",
                "article_id": item.aid,
                "source_kind": "pricing_batch",
                "after": {
                    "batch_id": str(batch.id),
                    "aid": item.aid,
                    "before_price": str(before_price) if before_price else None,
                    "after_price": str(after_price),
                },
            },
        )

        delta_pp = (
            (after_price - before_price)
            if before_price is not None
            else None
        )

        proposal_payload: dict[str, Any] = {
            "article_id": item.aid,
            "current_price": str(before_price) if before_price else None,
            "proposed_price": str(after_price),
            "delta_pp": str(delta_pp) if delta_pp is not None else None,
            "approval_required": False,
            "batch_id": str(batch.id),
            "tier": "B",
            "effective_in_hours": 72,
        }

        if dry_run:
            # Stage the would-be route into the summary but write nothing.
            needs, auto_approve, block, _reasons = _route_for_item(
                aid=item.aid,
                before_price=before_price,
                after_price=after_price,
            )
            if auto_approve:
                routed_by_role["auto_approve"] = (
                    routed_by_role.get("auto_approve", 0) + 1
                )
            elif block:
                routed_by_role["block"] = routed_by_role.get("block", 0) + 1
            else:
                for r in needs:
                    routed_by_role[r] = routed_by_role.get(r, 0) + 1
            if before_price is not None and after_price is not None:
                total_revenue_impact += (after_price - before_price)
            continue

        proposal = workflow_service.create_pricing_proposal(
            db_session,
            recommendation=rec,
            actor_user_id=actor_user_id,
            body=proposal_payload,
            status="draft",
        )
        proposal.current_price = before_price
        proposal.proposed_price = after_price
        proposal.delta_pp = delta_pp
        db_session.flush()

        # Submit through the approval workflow so each per-AID proposal
        # picks up its own routing decision.
        instance, decision = approval_workflow.submit_proposal_for_approval(
            session=db_session,
            proposal=proposal,
            actor=actor,
        )

        if decision.block:
            routed_by_role["block"] = routed_by_role.get("block", 0) + 1
        elif decision.auto_approve and not decision.needs:
            routed_by_role["auto_approve"] = (
                routed_by_role.get("auto_approve", 0) + 1
            )
        else:
            for r in decision.needs:
                routed_by_role[r] = routed_by_role.get(r, 0) + 1

        item.proposal_id = proposal.id
        item.status = (
            PricingBatchItemStatus.COMMITTED.value
            if decision.auto_approve and not decision.needs and not decision.block
            else PricingBatchItemStatus.QUEUED.value
        )

        if before_price is not None and after_price is not None:
            total_revenue_impact += (after_price - before_price)

        created.append(workflow_service.serialize_proposal(proposal))

    if not dry_run:
        batch.status = PricingBatchStatus.COMMITTED.value
        batch.committed_at = datetime.now(timezone.utc)

    db_session.flush()
    return {
        "created_proposals": created,
        "routed_by_role": routed_by_role,
        "total_revenue_impact": str(total_revenue_impact),
        "dry_run": dry_run,
    }


# ---------------------------------------------------------------------------
# Cancel.
# ---------------------------------------------------------------------------


class BatchAlreadyCommittedError(Exception):
    """Raised when a caller tries to cancel/re-commit a terminal batch."""


def cancel_batch(*, batch: PricingBatch, db_session: Session) -> PricingBatch:
    if batch.status == PricingBatchStatus.COMMITTED.value:
        raise BatchAlreadyCommittedError(
            f"batch {batch.id} is already committed and cannot be cancelled"
        )
    batch.status = PricingBatchStatus.CANCELLED.value
    batch.cancelled_at = datetime.now(timezone.utc)
    db_session.flush()
    return batch


# ---------------------------------------------------------------------------
# Serialization — for the GET batch endpoint.
# ---------------------------------------------------------------------------


def _approval_routing_summary(
    items: list[PricingBatchItem],
) -> dict[str, int]:
    summary: dict[str, int] = {"auto_approve": 0, "block": 0}
    for item in items:
        preview = item.preview_json or {}
        if preview.get("auto_approve"):
            summary["auto_approve"] = summary["auto_approve"] + 1
            continue
        if preview.get("block"):
            summary["block"] = summary["block"] + 1
            continue
        for role in preview.get("approval_route") or []:
            summary[role] = summary.get(role, 0) + 1
    return summary


def _kpi_summary(items: list[PricingBatchItem]) -> dict[str, Any]:
    count = len(items)
    revenue_impact = Decimal("0")
    margin_impact = Decimal("0")
    win_prob_changes: list[Decimal] = []
    for item in items:
        before = (
            Decimal(str(item.before_price))
            if item.before_price is not None
            else None
        )
        after = (
            Decimal(str(item.after_price))
            if item.after_price is not None
            else None
        )
        if before is not None and after is not None:
            revenue_impact += (after - before)
        preview = item.preview_json or {}
        db2_raw = preview.get("projected_db2")
        if db2_raw is not None:
            try:
                margin_impact += Decimal(str(db2_raw))
            except Exception:
                pass
        wp_raw = preview.get("win_prob_at_new")
        if wp_raw is not None:
            try:
                win_prob_changes.append(Decimal(str(wp_raw)))
            except Exception:
                pass
    avg_win_prob = (
        (sum(win_prob_changes, Decimal("0")) / Decimal(len(win_prob_changes))).quantize(
            _PCT_QUANT
        )
        if win_prob_changes
        else None
    )
    return {
        "count": count,
        "total_revenue_impact": str(revenue_impact),
        "total_margin_impact": str(margin_impact),
        "avg_win_prob_at_new": (
            str(avg_win_prob) if avg_win_prob is not None else None
        ),
    }


def serialize_batch(
    batch: PricingBatch, items: list[PricingBatchItem]
) -> dict[str, Any]:
    return {
        "batch_id": str(batch.id),
        "status": batch.status,
        "created_by": batch.created_by,
        "rule": batch.rule_json or {},
        "scope_filter": batch.scope_filter_json or {},
        "items": [
            {
                "id": str(item.id),
                "aid": item.aid,
                "before_price": (
                    str(item.before_price)
                    if item.before_price is not None
                    else None
                ),
                "after_price": (
                    str(item.after_price)
                    if item.after_price is not None
                    else None
                ),
                "status": item.status,
                "proposal_id": (
                    str(item.proposal_id) if item.proposal_id is not None else None
                ),
                "per_sku_lineage_ref": (
                    str(item.per_sku_lineage_ref)
                    if item.per_sku_lineage_ref is not None
                    else None
                ),
                "preview": item.preview_json or {},
            }
            for item in items
        ],
        "approval_routing_summary": _approval_routing_summary(items),
        "kpi_summary": _kpi_summary(items),
        "created_at": (
            batch.created_at.isoformat() if batch.created_at else None
        ),
        "committed_at": (
            batch.committed_at.isoformat() if batch.committed_at else None
        ),
        "cancelled_at": (
            batch.cancelled_at.isoformat() if batch.cancelled_at else None
        ),
    }


__all__ = [
    "ApprovalRoutingSummary",
    "BatchAlreadyCommittedError",
    "BatchPreview",
    "BatchPreviewItem",
    "BatchRule",
    "CustomJsonLogicRule",
    "FloorPlusRule",
    "MatchCompetitorRule",
    "PctMoveRule",
    "ScopeFilter",
    "TargetDb2Rule",
    "build_batch_preview",
    "cancel_batch",
    "commit_batch",
    "serialize_batch",
]
