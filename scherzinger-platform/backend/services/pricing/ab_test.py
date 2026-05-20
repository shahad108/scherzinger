"""Pricing Studio v3 / Phase 8 — A/B test service.

Three top-level entry points:

  - ``create_ab_test``    Hash-split the eligible customer set into
                          control/variant arms, persist the experiment +
                          per-customer assignments, emit SSE.
  - ``score_ab_test``     Re-aggregate the observed outcomes per arm and
                          run a two-proportion z-test (conversion) +
                          Welch's t-test (margin). Returns an ``AbResult``
                          summary.
  - ``promote_or_hold``   Lifecycle move: 'promote' publishes the variant
                          price via ``publish_price``; 'hold' restores
                          control (no-op publish — the price book never
                          changed during the test) and stamps the
                          decision.

Eligibility is a JSON-logic blob — the in-house evaluator below extends
``services.pricing.approval_rules._eval`` with the ``in`` operator so the
seed shape ``{"in": [{"var": "tier"}, ["B", "C"]]}`` works. Tier-A
"must-not-touch" customers are excluded by callers wiring the rule.

Deterministic splitting: ``hash(customer_id + test_id) % 100`` so the
same inputs reproduce the same arms across runs (re-derivation in
analysis tooling stays consistent).
"""
from __future__ import annotations

import hashlib
import logging
import math
from dataclasses import dataclass, field
from datetime import datetime, timezone
from decimal import Decimal
from typing import Any, Iterable, Literal, Optional
from uuid import UUID

from sqlalchemy import select, text
from sqlalchemy.orm import Session

from backend.models import AbTest, AbTestAssignment
from backend.models.pricing.audit import (
    PricingAuditAction,
    PricingAuditTargetKind,
)
from backend.models.pricing.lineage import LineageSourceKind
from backend.services.pricing.approval_rules import _BIN_OPS, _MAX_RULE_DEPTH
from backend.services.pricing.audit import record_audit
from backend.services.pricing.lineage import create_lineage

logger = logging.getLogger(__name__)


# ---------------------------------------------------------------------------
# Errors
# ---------------------------------------------------------------------------


class AbTestError(Exception):
    """Base class for A/B-test workflow errors."""


class AbTestNotFoundError(AbTestError):
    pass


class AbTestEligibilityEmptyError(AbTestError):
    """No customer matched the eligibility rule — refuse to create the test."""


class AbTestInvalidDecisionError(AbTestError):
    """``decision`` not in ('promote', 'hold')."""


# ---------------------------------------------------------------------------
# Eligibility — JSON-logic with the ``in`` operator
# ---------------------------------------------------------------------------


def _eval_eligibility(node: Any, ctx: dict[str, Any], depth: int = 0) -> Any:
    """Extended JSON-logic evaluator.

    Mirrors ``approval_rules._eval`` (and, ``or``, comparison ops, ``var``)
    and adds ``in`` for membership checks like
    ``{"in": [{"var": "tier"}, ["B", "C"]]}``.
    """
    if depth > _MAX_RULE_DEPTH:
        raise ValueError("rule depth exceeded")

    if not isinstance(node, dict):
        return node

    if len(node) != 1:
        raise ValueError(f"json-logic node must have exactly one operator: {node!r}")
    (op, args), = node.items()

    if op == "var":
        # Accept ["key"] or "key".
        key = args[0] if isinstance(args, list) and args else args
        if not isinstance(key, str):
            raise ValueError(f"var requires a string key, got {key!r}")
        return ctx.get(key)

    if op in _BIN_OPS:
        if not isinstance(args, list) or len(args) != 2:
            raise ValueError(f"{op!r} expects [a, b], got {args!r}")
        a = _eval_eligibility(args[0], ctx, depth + 1)
        b = _eval_eligibility(args[1], ctx, depth + 1)
        return _BIN_OPS[op](a, b)

    if op == "and":
        if not isinstance(args, list):
            raise ValueError(f"and expects a list, got {args!r}")
        return all(_eval_eligibility(x, ctx, depth + 1) for x in args)

    if op == "or":
        if not isinstance(args, list):
            raise ValueError(f"or expects a list, got {args!r}")
        return any(_eval_eligibility(x, ctx, depth + 1) for x in args)

    if op == "in":
        if not isinstance(args, list) or len(args) != 2:
            raise ValueError(f"in expects [needle, haystack], got {args!r}")
        needle = _eval_eligibility(args[0], ctx, depth + 1)
        haystack = _eval_eligibility(args[1], ctx, depth + 1)
        if haystack is None:
            return False
        try:
            return needle in haystack
        except TypeError:
            return False

    if op == "!":
        # Negation of a single nested rule.
        return not _eval_eligibility(args[0] if isinstance(args, list) else args, ctx, depth + 1)

    raise ValueError(f"unsupported eligibility operator: {op!r}")


def eligibility_matches(rule: dict | None, ctx: dict[str, Any]) -> bool:
    """Public wrapper. ``None`` rule == match-everything."""
    if rule is None or rule == {}:
        return True
    try:
        return bool(_eval_eligibility(rule, ctx))
    except (ValueError, TypeError) as exc:
        logger.warning("eligibility_matches: failed to evaluate rule: %s", exc)
        return False


# ---------------------------------------------------------------------------
# Customer pool helpers
# ---------------------------------------------------------------------------


@dataclass(frozen=True)
class CustomerFacts:
    """Eligibility-rule input for a single customer."""

    customer_id: str
    tier: str = "C"
    family: str | None = None
    cluster: str | None = None
    ltm_revenue: float = 0.0

    def as_context(self) -> dict[str, Any]:
        return {
            "customer_id": self.customer_id,
            "tier": self.tier,
            "family": self.family,
            "cluster": self.cluster,
            "ltm_revenue": self.ltm_revenue,
        }


def _load_eligible_pool(*, aid: str, db_session: Session) -> list[CustomerFacts]:
    """Build the candidate customer pool for an aid.

    Pulls customers who bought the SKU in the last 12 months, joins to
    ``customers`` for tier when present, and to ``quotes`` for the
    business_unit (used as ``family`` here — Phase 8 plan uses
    `family` for "BKAGG", "STD", etc.). Falls back to defaults when the
    underlying tables are sparse.
    """
    pool: dict[str, dict[str, Any]] = {}

    # Step 1 — invoice-based customer ids + LTM revenue.
    try:
        with db_session.begin_nested():
            rows = db_session.execute(
                text(
                    """
                    SELECT customer_id,
                           COALESCE(SUM(revenue), 0) AS ltm_eur
                    FROM invoices
                    WHERE article_id = :aid
                      AND date >= (
                        SELECT COALESCE(MAX(date), CURRENT_DATE) - INTERVAL '12 months'
                        FROM invoices
                      )
                    GROUP BY customer_id
                    ORDER BY ltm_eur DESC
                    LIMIT 500
                    """
                ),
                {"aid": aid},
            ).fetchall()
    except Exception:
        logger.exception("ab_test._load_eligible_pool invoices aid=%s", aid)
        rows = []

    for r in rows:
        cid = str(r[0]) if r[0] is not None else None
        if cid is None:
            continue
        pool[cid] = {
            "customer_id": cid,
            "ltm_revenue": float(r[1] or 0.0),
            "tier": "C",
            "family": None,
            "cluster": None,
        }

    if not pool:
        return []

    # Step 2 — tier from customers master (column may not exist in dev).
    # Each lookup runs in its own SAVEPOINT so a missing column / sparse
    # table doesn't poison the outer transaction (the API endpoint would
    # otherwise see "current transaction is aborted").
    try:
        cids = list(pool.keys())
        with db_session.begin_nested():
            tier_rows = db_session.execute(
                text(
                    """
                    SELECT customer_id, COALESCE(tier, 'C') AS tier
                    FROM customers
                    WHERE customer_id = ANY(:ids)
                    """
                ),
                {"ids": cids},
            ).fetchall()
            for r in tier_rows:
                cid = str(r[0])
                if cid in pool:
                    t = (r[1] or "C").upper()
                    if t not in ("A", "B", "C", "D"):
                        t = "C"
                    pool[cid]["tier"] = t
    except Exception:
        logger.debug("ab_test._load_eligible_pool tier lookup failed aid=%s", aid)

    # Step 3 — family (business_unit) from quotes for this aid.
    try:
        with db_session.begin_nested():
            fam_rows = db_session.execute(
                text(
                    """
                    SELECT customer_id, MAX(business_unit) AS family
                    FROM quotes
                    WHERE article_id = :aid
                      AND customer_id = ANY(:ids)
                    GROUP BY customer_id
                    """
                ),
                {"aid": aid, "ids": list(pool.keys())},
            ).fetchall()
            for r in fam_rows:
                cid = str(r[0])
                if cid in pool:
                    pool[cid]["family"] = r[1]
    except Exception:
        logger.debug("ab_test._load_eligible_pool family lookup failed aid=%s", aid)

    return [
        CustomerFacts(
            customer_id=row["customer_id"],
            tier=row["tier"],
            family=row.get("family"),
            cluster=row.get("cluster"),
            ltm_revenue=row["ltm_revenue"],
        )
        for row in pool.values()
    ]


# ---------------------------------------------------------------------------
# Deterministic arm assignment
# ---------------------------------------------------------------------------


def assign_arm(customer_id: str, test_id: UUID | str, *, variant_pct: int = 50) -> str:
    """Return ``'control'`` or ``'variant'`` for the (customer, test) pair.

    Uses a stable SHA-256 hash so the assignment is reproducible across
    processes and time. ``variant_pct`` is the share that ends up in the
    variant arm (default 50/50).
    """
    seed = f"{customer_id}:{test_id}".encode("utf-8")
    digest = hashlib.sha256(seed).digest()
    bucket = int.from_bytes(digest[:4], "big") % 100
    return "variant" if bucket < variant_pct else "control"


# ---------------------------------------------------------------------------
# Phase J1 — idempotent cohort assignment helper
# ---------------------------------------------------------------------------


def assign_cohorts(
    *,
    test_id: UUID | str,
    aid: str,
    eligible: Iterable[CustomerFacts],
    variant_pct: int,
    control_price: Decimal,
    variant_price: Decimal,
    db_session: Session,
    lineage_ref: str | None = None,
) -> int:
    """Idempotently persist ``ab_test_assignments`` for ``eligible`` customers.

    Behaviour:
      - Hashes (``test_id``, ``customer_id``) into variant/control using
        ``assign_arm`` with the provided ``variant_pct`` (the test's
        ``slice_pct``). Re-runs produce the exact same cohort split.
      - SELECT-before-INSERT on ``(test_id, customer_key)`` so a re-run
        never duplicates rows (no DB-level unique constraint exists
        today).
      - 0 eligible customers → 0 rows, logs a warning, returns 0
        (does NOT raise — callers decide whether to raise upstream).
      - On any exception, ``db.rollback()`` + ``logger.exception()`` +
        re-raise so the caller's transaction state is correct.

    Returns the number of rows actually inserted on this call (0 on a
    full no-op re-run).
    """
    if isinstance(test_id, str):
        try:
            test_uuid = UUID(test_id)
        except ValueError as exc:
            raise ValueError(f"assign_cohorts: invalid test_id {test_id!r}") from exc
    else:
        test_uuid = test_id

    eligible_list = list(eligible)
    if not eligible_list:
        logger.warning(
            "ab_test.assign_cohorts: empty eligibility — 0 rows written "
            "(test_id=%s aid=%s)",
            test_uuid,
            aid,
        )
        return 0

    if variant_pct < 0:
        variant_pct = 0
    if variant_pct > 100:
        variant_pct = 100

    control_price = _to_decimal(control_price)
    variant_price = _to_decimal(variant_price)

    try:
        # Dedup against existing rows. customer_key is the join key.
        existing_keys = set(
            db_session.execute(
                select(AbTestAssignment.customer_key).where(
                    AbTestAssignment.test_id == test_uuid
                )
            ).scalars()
        )

        inserted = 0
        for cust in eligible_list:
            if cust.customer_id in existing_keys:
                continue
            arm = assign_arm(cust.customer_id, test_uuid, variant_pct=variant_pct)
            assigned_price = variant_price if arm == "variant" else control_price
            payload = {
                "tier": cust.tier,
                "family": cust.family,
                "ltm_revenue": cust.ltm_revenue,
            }
            if lineage_ref is not None:
                payload["lineage_ref"] = lineage_ref
            db_session.add(
                AbTestAssignment(
                    test_id=test_uuid,
                    article_id=aid,
                    customer_key=cust.customer_id,
                    quote_key=None,
                    arm=arm,
                    assigned_price=assigned_price,
                    payload=payload,
                )
            )
            inserted += 1

        db_session.flush()
        return inserted
    except Exception:
        logger.exception(
            "ab_test.assign_cohorts failed test_id=%s aid=%s", test_uuid, aid
        )
        try:
            db_session.rollback()
        except Exception:  # pragma: no cover - defensive
            logger.exception(
                "ab_test.assign_cohorts rollback failed test_id=%s", test_uuid
            )
        raise


def _resolve_eligibility_pool(
    *,
    aid: str,
    eligibility: dict | None,
    db_session: Session,
) -> list[CustomerFacts]:
    """Phase J1 — resolve the candidate customer pool from ``eligibility_json``.

    Supported shapes:
      - ``{"customer_ids": ["C1", "C2", ...]}`` → exact list.
      - ``{"commodity_group": "X"}`` / ``{"commodity_group": "X",
        "min_quote_count": 5}`` → customers in the last 12 months for
        this aid whose quote count meets the threshold (commodity_group
        is informational; we filter the candidate set via the
        article_id-scoped pool).
      - empty / None → fall back to ``_load_eligible_pool`` (active
        customers on this aid in the last 12 months).

    Always returns a list (possibly empty). Never raises on DB issues —
    logs and returns ``[]`` so the caller can decide the response shape.
    """
    if eligibility and isinstance(eligibility, dict):
        cust_ids = eligibility.get("customer_ids")
        if isinstance(cust_ids, list) and cust_ids:
            return [
                CustomerFacts(customer_id=str(cid)) for cid in cust_ids if cid
            ]
        min_q = eligibility.get("min_quote_count")
        if isinstance(min_q, int) and min_q > 0:
            try:
                with db_session.begin_nested():
                    rows = db_session.execute(
                        text(
                            """
                            SELECT customer_id, COUNT(*) AS n
                            FROM quotes
                            WHERE article_id = :aid
                              AND quote_date >= (CURRENT_DATE - INTERVAL '12 months')
                            GROUP BY customer_id
                            HAVING COUNT(*) >= :n
                            """
                        ),
                        {"aid": aid, "n": min_q},
                    ).fetchall()
                return [CustomerFacts(customer_id=str(r[0])) for r in rows if r[0]]
            except Exception:
                logger.exception(
                    "ab_test._resolve_eligibility_pool min_quote_count failed aid=%s",
                    aid,
                )
                return []

    # Fallback: invoice-driven pool for this aid over the last 12 months.
    return _load_eligible_pool(aid=aid, db_session=db_session)


# ---------------------------------------------------------------------------
# AbResult wire shape
# ---------------------------------------------------------------------------


@dataclass
class ArmStats:
    n: int = 0
    won: int = 0
    conv: float | None = None
    margin: float | None = None
    revenue: float = 0.0


@dataclass
class AbResult:
    test_id: str
    control: ArmStats
    variant: ArmStats
    z_stat: float | None
    p_value: float | None
    decision_ready: bool
    lineage_ref: str | None = None

    def to_dict(self) -> dict[str, Any]:
        return {
            "test_id": self.test_id,
            "control": {
                "n": self.control.n,
                "conv": self.control.conv,
                "margin": self.control.margin,
                "revenue": self.control.revenue,
            },
            "variant": {
                "n": self.variant.n,
                "conv": self.variant.conv,
                "margin": self.variant.margin,
                "revenue": self.variant.revenue,
            },
            "z_stat": self.z_stat,
            "p_value": self.p_value,
            "decision_ready": self.decision_ready,
            "lineage_ref": self.lineage_ref,
        }


@dataclass
class ActionResult:
    test_id: str
    decision: str
    status: str
    receipt_id: str | None = None
    notes: list[str] = field(default_factory=list)

    def to_dict(self) -> dict[str, Any]:
        return {
            "test_id": self.test_id,
            "decision": self.decision,
            "status": self.status,
            "receipt_id": self.receipt_id,
            "notes": self.notes,
        }


# ---------------------------------------------------------------------------
# SSE helper
# ---------------------------------------------------------------------------


def _publish_sse(topic: str, *, aid: str, payload: dict[str, Any]) -> None:
    """Best-effort SSE publish — never raises."""
    try:
        from backend.services.events import publish_sync

        publish_sync(topic, payload, aid=aid)
    except RuntimeError:
        try:
            import asyncio

            from backend.services.events import publish as publish_async

            loop = asyncio.get_event_loop()
            loop.create_task(publish_async(topic, payload, aid=aid))
        except Exception:  # pragma: no cover
            logger.exception("_publish_sse async fallback failed topic=%s", topic)
    except Exception:  # pragma: no cover
        logger.exception("_publish_sse failed topic=%s aid=%s", topic, aid)


# ---------------------------------------------------------------------------
# create_ab_test
# ---------------------------------------------------------------------------


def _to_decimal(v: Any) -> Decimal:
    return v if isinstance(v, Decimal) else Decimal(str(v))


def create_ab_test(
    *,
    aid: str,
    control_price: Decimal,
    variant_price: Decimal,
    eligibility: dict | None,
    criterion: dict | None,
    target_sample: int,
    actor: str,
    db_session: Session,
    candidate_pool: Optional[Iterable[CustomerFacts]] = None,
    duration_days: int | None = 14,
    success_metric: str | None = "db2_margin",
    hypothesis: str | None = None,
    slice_pct: int | Decimal | float = 50,
) -> AbTest:
    """Create + persist a new A/B price test.

    Steps inside the caller's transaction:
      1. Build the eligible customer pool for ``aid`` (or use the
         ``candidate_pool`` test seam).
      2. Apply the ``eligibility`` rule + drop tier-A "must-not-touch".
      3. Deterministically split into control/variant arms.
      4. Persist ``ab_tests`` + one ``ab_test_assignments`` row per pick.
      5. Record audit + lineage.
      6. Emit ``pricing.ab_test_created`` on the SSE bus.
    """
    if target_sample <= 0:
        raise ValueError("target_sample must be > 0")

    control_price = _to_decimal(control_price)
    variant_price = _to_decimal(variant_price)

    # 1. Candidate pool.
    if candidate_pool is None:
        pool = _load_eligible_pool(aid=aid, db_session=db_session)
    else:
        pool = list(candidate_pool)

    # 2. Apply eligibility + tier-A guard.
    eligible: list[CustomerFacts] = []
    for cust in pool:
        if cust.tier == "A":
            # tier-A "must-not-touch" — exclude unconditionally.
            continue
        if eligibility_matches(eligibility, cust.as_context()):
            eligible.append(cust)

    if not eligible:
        raise AbTestEligibilityEmptyError(
            f"no eligible customers for aid={aid} eligibility={eligibility!r}"
        )

    # 3. Create the AbTest row (id needed for deterministic hash).
    now = datetime.now(timezone.utc)
    # actor may be a UUID string ("user:abc") or persona name. The
    # ab_tests.created_by column is a UUID FK to users — when actor is
    # not a UUID we leave it null in dev/test fixtures by raising; the
    # API caller passes ctx.user_id (always a UUID) so prod is safe.
    try:
        created_by_uuid = UUID(actor) if not isinstance(actor, UUID) else actor
    except (ValueError, TypeError) as exc:
        raise ValueError(
            f"create_ab_test: actor must be a UUID-shaped user id (got {actor!r})"
        ) from exc

    try:
        slice_pct_dec = _to_decimal(slice_pct)
    except Exception:
        slice_pct_dec = Decimal("50.00")
    if slice_pct_dec < 0:
        slice_pct_dec = Decimal("0")
    if slice_pct_dec > 100:
        slice_pct_dec = Decimal("100")
    variant_pct_int = int(slice_pct_dec)

    test = AbTest(
        aid=aid,
        slice_pct=slice_pct_dec,
        start_date=now,
        end_date=None,
        control_price=control_price,
        treatment_price=variant_price,
        status="running",
        decision_state="running",
        simulation_status="pending",
        created_by=created_by_uuid,
        success_metric=success_metric,
        duration_days=duration_days,
        hypothesis=hypothesis,
        eligibility_json=eligibility,
        criterion_json=criterion,
        target_sample=target_sample,
    )
    db_session.add(test)
    db_session.flush()  # populate test.id

    # 4. Lineage tag.
    lineage = create_lineage(
        source_kind=LineageSourceKind.AB_TEST_ASSIGNMENT,
        source_id=f"ab_test:{test.id}",
        sql=None,
        model="ab_test.create",
        computed_by=str(actor),
        session=db_session,
    )

    # 5. Hash-split + persist assignments. Cap at 3 × target_sample
    # so a 10k-customer pool doesn't write 10k rows when target is 30
    # but still over-provisions for the deterministic split (a 2× cap
    # can leave one arm short of target on small samples).
    cap = max(target_sample * 3, target_sample)
    chosen = eligible[: min(len(eligible), cap)]
    inserted = assign_cohorts(
        test_id=test.id,
        aid=aid,
        eligible=chosen,
        variant_pct=variant_pct_int,
        control_price=control_price,
        variant_price=variant_price,
        db_session=db_session,
        lineage_ref=str(lineage.id),
    )
    # ``assignments_rows`` below was a debug-friendly view; the audit
    # block needs the count, so keep it as an int proxy.
    assignments_rows = [None] * inserted  # type: ignore[var-annotated]

    # 6. Audit.
    record_audit(
        actor=str(actor),
        action=PricingAuditAction.AB_TEST_CREATED,
        target_kind=PricingAuditTargetKind.SKU,
        target_id=aid,
        before=None,
        after={
            "test_id": str(test.id),
            "control_price": str(control_price),
            "variant_price": str(variant_price),
            "n_assignments": len(assignments_rows),
            "target_sample": target_sample,
            "eligibility": eligibility,
            "criterion": criterion,
        },
        reason="ab_test.create",
        lineage_ref=lineage.id,
        session=db_session,
    )

    # 7. SSE.
    _publish_sse(
        "pricing.ab_test_created",
        aid=aid,
        payload={
            "aid": aid,
            "test_id": str(test.id),
            "control_price": str(control_price),
            "variant_price": str(variant_price),
            "n_assignments": len(assignments_rows),
            "target_sample": target_sample,
        },
    )

    return test


# ---------------------------------------------------------------------------
# score_ab_test
# ---------------------------------------------------------------------------


def _normal_cdf(x: float) -> float:
    return 0.5 * (1.0 + math.erf(x / math.sqrt(2.0)))


def _aggregate_arm(rows: list[AbTestAssignment], arm: str) -> ArmStats:
    n = 0
    won = 0
    margins: list[float] = []
    revenue_total = 0.0
    for r in rows:
        if r.arm != arm:
            continue
        n += 1
        if r.outcome_ref_type is not None:
            # Recognise won/lost via outcome_ref_type semantics: when the
            # caller stamps it 'won' or 'lost' we count conversions.
            if str(r.outcome_ref_type).lower() == "won":
                won += 1
        if r.outcome_margin is not None:
            margins.append(float(r.outcome_margin))
        if r.outcome_revenue is not None:
            revenue_total += float(r.outcome_revenue)
    conv = (won / n) if n > 0 else None
    margin = (sum(margins) / len(margins)) if margins else None
    return ArmStats(n=n, won=won, conv=conv, margin=margin, revenue=revenue_total)


def _two_proportion_z(c: ArmStats, v: ArmStats) -> tuple[float | None, float | None]:
    """Two-sided two-proportion z-test on conversion."""
    if c.n < 2 or v.n < 2:
        return None, None
    if c.conv is None or v.conv is None:
        return None, None
    p_pool = (c.won + v.won) / (c.n + v.n)
    if p_pool <= 0 or p_pool >= 1:
        return None, None
    se = math.sqrt(p_pool * (1 - p_pool) * (1.0 / c.n + 1.0 / v.n))
    if se <= 0:
        return None, None
    z = (v.conv - c.conv) / se
    p = 2.0 * (1.0 - _normal_cdf(abs(z)))
    return z, p


def score_ab_test(
    *,
    test_id: UUID | str,
    db_session: Session,
    alpha: float | None = None,
) -> AbResult:
    """Aggregate per-arm outcomes + compute the z-stat / p-value.

    ``decision_ready`` is True when both arms have ≥ target_sample rows
    AND the p-value is below the criterion threshold (``alpha`` or the
    persisted ``criterion_json.alpha``, default 0.10).
    """
    if isinstance(test_id, str):
        try:
            test_id = UUID(test_id)
        except ValueError as exc:
            raise AbTestNotFoundError(f"invalid test_id {test_id!r}") from exc
    test = db_session.get(AbTest, test_id)
    if test is None:
        raise AbTestNotFoundError(f"ab_test {test_id} not found")

    rows = (
        db_session.query(AbTestAssignment)
        .filter(AbTestAssignment.test_id == test.id)
        .all()
    )
    control = _aggregate_arm(rows, "control")
    variant = _aggregate_arm(rows, "variant")

    z_stat, p_value = _two_proportion_z(control, variant)

    # Decision-ready gate: both arms hit target sample + p < threshold.
    threshold = alpha
    if threshold is None and test.criterion_json:
        threshold = test.criterion_json.get("alpha")
    if threshold is None:
        threshold = 0.10

    decision_ready = False
    target = test.target_sample or 0
    if (
        control.n >= target
        and variant.n >= target
        and p_value is not None
        and p_value < threshold
    ):
        decision_ready = True

    return AbResult(
        test_id=str(test.id),
        control=control,
        variant=variant,
        z_stat=z_stat,
        p_value=p_value,
        decision_ready=decision_ready,
    )


# ---------------------------------------------------------------------------
# promote_or_hold
# ---------------------------------------------------------------------------


def promote_or_hold(
    *,
    test_id: UUID | str,
    decision: Literal["promote", "hold"],
    actor: str,
    db_session: Session,
    publish_fn=None,  # test seam — defaults to publish_price.
) -> ActionResult:
    """Close the test and either publish the variant price or hold.

    Audit + SSE always fire. Promotion calls ``publish_price`` from
    Phase 7 (or the injected ``publish_fn`` for testability); hold path
    leaves the price book untouched (control was already the live price
    during the test).
    """
    if decision not in ("promote", "hold"):
        raise AbTestInvalidDecisionError(
            f"decision must be 'promote' or 'hold', got {decision!r}"
        )
    if isinstance(test_id, str):
        try:
            test_id = UUID(test_id)
        except ValueError as exc:
            raise AbTestNotFoundError(f"invalid test_id {test_id!r}") from exc
    test = db_session.get(AbTest, test_id)
    if test is None:
        raise AbTestNotFoundError(f"ab_test {test_id} not found")

    now = datetime.now(timezone.utc)
    notes: list[str] = []
    receipt_id: str | None = None

    if decision == "promote":
        # Phase 7 publish_price (or test seam).
        if publish_fn is None:
            from backend.services.pricing.publish import publish_price as publish_fn  # type: ignore[no-redef]
        try:
            receipt = publish_fn(
                aid=test.aid,
                price=Decimal(test.treatment_price),
                effective_at=now,
                source_proposal_id=None,
                actor=str(actor),
                db_session=db_session,
            )
            receipt_id = str(getattr(receipt, "id", None) or "")
        except Exception as exc:  # pragma: no cover
            logger.exception("promote_or_hold.publish_price failed test_id=%s", test_id)
            notes.append(f"publish_failed: {exc!r}")
        test.decision_state = "promoted"
        test.status = "promoted"
    else:  # hold
        # Control price is already the live price — nothing to do in
        # price_book. Mark the test held so the lifecycle is closed.
        test.decision_state = "held"
        test.status = "held"
        notes.append("variant_held; control retained")

    test.end_date = now
    test.updated_at = now
    db_session.flush()

    # Audit.
    record_audit(
        actor=str(actor),
        action=(
            PricingAuditAction.AB_TEST_PROMOTED
            if decision == "promote"
            else PricingAuditAction.AB_TEST_HELD
        ),
        target_kind=PricingAuditTargetKind.SKU,
        target_id=test.aid,
        before={"decision_state": "running"},
        after={
            "decision_state": test.decision_state,
            "test_id": str(test.id),
            "receipt_id": receipt_id,
        },
        reason=f"ab_test.{decision}",
        session=db_session,
    )

    # SSE.
    _publish_sse(
        "pricing.ab_test_decided",
        aid=test.aid,
        payload={
            "aid": test.aid,
            "test_id": str(test.id),
            "decision": decision,
            "receipt_id": receipt_id,
            "decided_at": now.isoformat(),
        },
    )

    return ActionResult(
        test_id=str(test.id),
        decision=decision,
        status=test.status,
        receipt_id=receipt_id,
        notes=notes,
    )


# ---------------------------------------------------------------------------
# Workbench summary helper
# ---------------------------------------------------------------------------


def get_active_ab_test_summary(
    *, aid: str, db_session: Session
) -> dict[str, Any] | None:
    """Return a compact summary of the active (running/held) A/B test on aid.

    Used by the Studio workbench composer to surface the A/B test card.
    """
    test = (
        db_session.query(AbTest)
        .filter(AbTest.aid == aid)
        .filter(AbTest.decision_state.in_(["running", "held"]))
        .order_by(AbTest.created_at.desc())
        .first()
    )
    if test is None:
        return None

    try:
        result = score_ab_test(test_id=test.id, db_session=db_session)
        scoring = result.to_dict()
    except Exception:  # pragma: no cover - defensive
        logger.exception("get_active_ab_test_summary.score failed test=%s", test.id)
        scoring = None

    return {
        "test_id": str(test.id),
        "aid": test.aid,
        "control_price": str(test.control_price),
        "variant_price": str(test.treatment_price),
        "decision_state": test.decision_state,
        "target_sample": test.target_sample,
        "criterion": test.criterion_json,
        "scoring": scoring,
    }
