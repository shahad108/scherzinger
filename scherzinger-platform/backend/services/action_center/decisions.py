"""Today's analyst decisions — ranked across multiple data sources.

The engine concatenates candidates from three real sources and ranks
them by impact-score so the top of the list is the best lever for the
analyst this week:

  1. **Churn risk** — customer_risk_scores.risk_score > 0.7
  2. **Cost riser pass-through gap** — product_cost_trends.cost_change_pct
     > 10% AND no matching catalog price update.
  3. **Margin erosion** — articles whose actual_db2_margin has dropped
     more than 5pp YoY (derived from quote_invoice_links).

Each builder returns a candidate dict with the same keys the seed used
(`rank`, `severity`, `title`, `why`, `headline`, `tag`, `cluster`,
`recommendation`, `facts`, `trend`, `primaryCta`, …) so the frontend
component is unchanged.

Falls back to the seed when no candidates can be generated (fresh DB /
dev mode); applies the ``cluster`` filter and the ``limit`` cap.
"""
from __future__ import annotations

from typing import Any

import math

from sqlalchemy import text

from backend.database import SessionLocal
from backend.services import cost_service, risk_service, workflow_service

from ._intents import decision_intents, stable_recommendation_ref
from ._seed import ActionCenterBlockError


def _conf_from_n(n: int) -> int:
    """Sample-size → confidence %. Matches sku_table for consistency."""
    if n >= 3:
        return max(45, min(95, int(math.log10(n + 1) * 30 + 35)))
    return max(20, n * 8)


def _sane_margin(v: float | None) -> float | None:
    """Drop margins outside [-100%, 100%] — they're data-quality noise."""
    if v is None:
        return None
    return v if -1.0 <= v <= 1.0 else None


# ----- candidate builders ------------------------------------------------

def _financial_impact(value: float | None) -> dict[str, Any]:
    """Wrap a € amount in the typed financialImpact shape so the
    TodaySummaryStrip can sum a single field per card.

    Returns ``{"recoverableMargin": None}`` only when the input is
    missing or non-numeric (i.e. *not derivable*). Zero or negative
    values are still surfaced honestly — the strip's sum then reflects
    reality rather than silently dropping data points.
    """
    if value is None or not isinstance(value, (int, float)):
        return {"recoverableMargin": None}
    return {
        "recoverableMargin": {
            "value": round(float(value), 2),
            "currency": "EUR",
        }
    }


def _churn_candidates(db, cluster: str | None) -> list[dict[str, Any]]:
    """Customers with risk_score > 0.7 — high-impact churn signals."""
    rows = risk_service.get_risk_scores(db, top=50)
    out: list[dict[str, Any]] = []
    for r in rows:
        score = float(r.get("risk_score") or 0)
        if score < 0.7:
            continue
        cid = str(r.get("customer_id") or "—")
        tier = str(r.get("risk_tier") or "—")
        # Estimate revenue at risk = sum of last-year invoices for this customer.
        revenue = (
            db.execute(
                text(
                    """
                    SELECT COALESCE(SUM(revenue), 0)
                      FROM invoices
                     WHERE customer_id = :cid AND year = (
                       SELECT MAX(year) FROM invoices WHERE customer_id = :cid
                     )
                    """
                ),
                {"cid": cid},
            ).scalar()
            or 0
        )
        revenue = float(revenue)
        impact_score = score * (revenue / 100_000)
        # Recoverable margin for a churn candidate ≈ risk_score × revenue at
        # risk. The TodaySummaryStrip sums these to surface "if we save the
        # at-risk customers, this is what we keep".
        recoverable = score * revenue if revenue > 0 else None
        out.append(
            {
                "_score": impact_score,
                "_kind": "churn",
                "severity": "warning" if score < 0.85 else "critical",
                "title": f"Churn risk · Customer {cid}",
                "headline": f"Customer {cid} risk {score:.2f} ({tier} tier) · ~€{revenue:,.0f}/yr at risk",
                "why": f"Risk model flags {cid} on margin trend + win-rate slide; gap component {r.get('gap_component') or 0:.2f}.",
                "tag": "Churn risk",
                "daysOpenLabel": f"score {score:.2f}",
                "authorityLabel": "Sales escalation",
                "tags": [],
                "meta": [],
                "cluster": {"label": tier, "confidence": int(score * 100), "n": 1},
                "contract": "movable",
                "recommendation": "Open in Quotes & Guardrails",
                "timeMinutes": 15,
                "confLabel": "High" if score >= 0.85 else "Medium",
                "facts": [
                    {
                        "label": "Risk score",
                        "value": f"{score:.2f}",
                        "detail": f"tier {tier}",
                        "tone": "negative" if score >= 0.85 else "neutral",
                    },
                    {
                        "label": "Revenue at risk",
                        "value": f"€{revenue:,.0f}",
                        "detail": "last-year revenue",
                        "tone": "neutral",
                    },
                ],
                "trend": None,
                "primaryCta": "Approval flow · Quotes & Guardrails",
                "secondaryCta": "Open customer detail",
                "cta": "Approval flow · Quotes & Guardrails",
                "financialImpact": _financial_impact(recoverable),
            }
        )
    return out


def _cost_riser_candidates(db) -> list[dict[str, Any]]:
    """Articles whose commodity cost has risen sharply WITHOUT a price move."""
    out: list[dict[str, Any]] = []
    risers = cost_service.get_cost_risers(db, top=30)
    for r in risers:
        cc = float(r.get("cost_change_pct") or 0)
        if cc < 0.10:  # only flag rises ≥ 10%
            continue
        aid = str(r.get("article_id") or "—")
        unit = float(r.get("avg_hkvoll_per_unit") or 0)
        commodity = str(r.get("commodity_group") or "—")
        impact_score = cc * 100 * float(r.get("record_count") or 1)
        # Pass-through revenue from the latest year (best signal of how much
        # margin we recover by repricing) — drive recoverableMargin off the
        # cost change × annual revenue at unit cost.
        annual_revenue = (
            db.execute(
                text(
                    """
                    SELECT COALESCE(SUM(revenue), 0)
                      FROM invoices
                     WHERE article_id = :aid AND year = (
                       SELECT MAX(year) FROM invoices WHERE article_id = :aid
                     )
                    """
                ),
                {"aid": aid},
            ).scalar()
            or 0
        )
        annual_revenue = float(annual_revenue)
        recoverable = cc * annual_revenue if annual_revenue > 0 else None
        out.append(
            {
                "_score": impact_score,
                "_kind": "cost_riser",
                "severity": "warning",
                "title": f"Cost riser · Article {aid} ({commodity})",
                "headline": f"Article {aid} unit cost +{cc * 100:.1f}% — pass-through pending",
                "why": f"product_cost_trends shows {commodity} unit cost up {cc * 100:.1f}% over the latest period; current catalog price unchanged.",
                "tag": "Cost riser",
                "daysOpenLabel": "this period",
                "authorityLabel": "Pricing review",
                "tags": [],
                "meta": [],
                "cluster": {"label": commodity, "confidence": _conf_from_n(int(r.get("record_count") or 0)), "n": int(r.get("record_count") or 0)},
                "contract": "movable",
                "recommendation": "Open in Pricing Studio",
                "timeMinutes": 10,
                "confLabel": "Medium",
                "facts": [
                    {
                        "label": "Cost change",
                        "value": f"+{cc * 100:.1f}%",
                        "detail": f"unit cost ≈ €{unit:.2f}",
                        "tone": "negative",
                    },
                    {
                        "label": "Sample",
                        "value": str(r.get("record_count") or 0),
                        "detail": "purchase records",
                        "tone": "neutral",
                    },
                ],
                "trend": None,
                "primaryCta": "Open in Studio →",
                "secondaryCta": "Push to negotiation cockpit",
                "cta": "Open in Studio →",
                "financialImpact": _financial_impact(recoverable),
            }
        )
    return out


def _margin_erosion_candidates(db) -> list[dict[str, Any]]:
    """Articles where actual_db2_margin has dropped > 5pp YoY."""
    rows = (
        db.execute(
            text(
                """
                WITH yearly AS (
                  SELECT i.article_id,
                         i.year,
                         AVG(i.db2_margin) FILTER (WHERE i.db2_margin IS NOT NULL) AS avg_margin,
                         COUNT(*) AS n
                  FROM invoices i
                  WHERE i.year >= EXTRACT(YEAR FROM CURRENT_DATE) - 2
                  GROUP BY i.article_id, i.year
                ),
                pivoted AS (
                  SELECT article_id,
                         MAX(avg_margin) FILTER (WHERE year = (SELECT MAX(year) FROM yearly)) AS this_year,
                         MAX(avg_margin) FILTER (WHERE year = (SELECT MAX(year) FROM yearly) - 1) AS last_year,
                         SUM(n) AS records
                  FROM yearly
                  GROUP BY article_id
                )
                SELECT p.article_id,
                       p.this_year, p.last_year,
                       (p.last_year - p.this_year) AS drop_pp,
                       p.records,
                       pr.description, pr.commodity_group,
                       COALESCE((
                         SELECT SUM(revenue) FROM invoices i2
                          WHERE i2.article_id = p.article_id
                            AND i2.year = (SELECT MAX(year) FROM yearly)
                       ), 0) AS this_year_revenue
                FROM pivoted p
                JOIN products pr ON pr.article_id = p.article_id
                WHERE p.this_year IS NOT NULL AND p.last_year IS NOT NULL
                  AND p.this_year BETWEEN -1 AND 1
                  AND p.last_year BETWEEN -1 AND 1
                  AND p.records >= 3
                  AND (p.last_year - p.this_year) >= 0.05
                ORDER BY drop_pp DESC
                LIMIT 20
                """
            )
        )
        .mappings()
        .all()
    )
    out: list[dict[str, Any]] = []
    for r in rows:
        sane_this = _sane_margin(r.get("this_year"))
        sane_last = _sane_margin(r.get("last_year"))
        if sane_this is None or sane_last is None:
            continue
        aid = str(r.get("article_id") or "—")
        this_y = sane_this * 100
        last_y = sane_last * 100
        drop = (sane_last - sane_this) * 100
        n = int(r.get("records") or 0)
        desc = str(r.get("description") or "—")
        commodity = str(r.get("commodity_group") or "—")
        impact = drop * math.log10(n + 1)
        # Recoverable margin ≈ margin drop (in pp) × annual revenue — i.e.
        # what we get back if the margin returns to last year's level.
        this_year_revenue = float(r.get("this_year_revenue") or 0)
        recoverable = (
            (sane_last - sane_this) * this_year_revenue
            if this_year_revenue > 0 and (sane_last - sane_this) > 0
            else None
        )
        out.append(
            {
                "_score": impact,
                "_kind": "margin_erosion",
                "severity": "critical",
                "title": f"Margin erosion · SKU {aid} ({desc})",
                "headline": f"Article {aid} ({desc}, {commodity}) · margin {last_y:.1f}% → {this_y:.1f}% over 1yr",
                "why": f"Actual DB2 margin on invoices fell {drop:.1f}pp year-over-year over {n} invoice rows. Catalog price likely lagging cost.",
                "tag": "Margin Erosion",
                "daysOpenLabel": "1yr trend",
                "authorityLabel": "Your authority",
                "tags": [],
                "meta": [],
                "cluster": {"label": commodity, "confidence": _conf_from_n(n), "n": n},
                "contract": "movable",
                "recommendation": "Open in Pricing Studio",
                "timeMinutes": 10,
                "confLabel": "High",
                "facts": [
                    {
                        "label": "Margin drift",
                        "value": f"{last_y:.1f}% → {this_y:.1f}%",
                        "detail": "year over year",
                        "tone": "negative",
                    },
                    {
                        "label": "Drop",
                        "value": f"−{drop:.1f}pp",
                        "detail": "from invoice db2_margin",
                        "tone": "negative",
                    },
                ],
                "trend": {
                    "label": "Margin · 1yr",
                    "value": f"{this_y:.1f}%",
                    "delta": f"↓ {drop:.1f}pp",
                    "spark": [last_y, last_y * 0.9 + this_y * 0.1, last_y * 0.7 + this_y * 0.3, this_y],
                },
                "primaryCta": "Open in Studio →",
                "secondaryCta": "Insert From Library",
                "cta": "Open in Studio →",
                "financialImpact": _financial_impact(recoverable),
            }
        )
    return out


# ----- ranker -------------------------------------------------------------

def _candidate_ref(c: dict[str, Any]) -> tuple[str, str | None, str | None]:
    """Derive (source_ref, article_id, customer_id) for a candidate."""
    kind = str(c.get("_kind") or "decision")
    if kind == "churn":
        # title format: "Churn risk · Customer {cid}"
        cid = str(c.get("title", "")).split("Customer", 1)[-1].strip() or None
        return stable_recommendation_ref(kind, cid), None, cid
    # cost_riser / margin_erosion both encode the article_id in the title.
    aid = str(c.get("title", "")).split("Article", 1)[-1].split("(", 1)[0].strip().strip("·") or None
    aid = aid.strip() or None
    if not aid:
        # Fallback to "SKU {aid}" pattern.
        aid = str(c.get("title", "")).split("SKU", 1)[-1].split("(", 1)[0].strip() or None
    return stable_recommendation_ref(kind, aid), aid, None


def _attach_intents_and_filter(
    candidates: list[dict[str, Any]],
) -> list[dict[str, Any]]:
    """Look up recommendation status for each candidate, drop ones already
    acted on (accepted/rejected/snoozed) and attach typed action intents
    so the frontend can route/mutate without label parsing."""
    refs_by_idx: list[tuple[str, str | None, str | None, str]] = []
    for c in candidates:
        ref, aid, cid = _candidate_ref(c)
        refs_by_idx.append((ref, aid, cid, str(c.get("_kind") or "decision")))

    status_map: dict[str, Any] = {}
    try:
        with SessionLocal() as db:
            status_map = workflow_service.get_recommendation_status_map(
                db, [r[0] for r in refs_by_idx]
            )
    except Exception:
        status_map = {}

    out: list[dict[str, Any]] = []
    for c, (ref, aid, cid, kind) in zip(candidates, refs_by_idx):
        rec = status_map.get(ref)
        # Hide already-resolved recommendations on next refresh — Phase 1
        # acceptance: refresh shows backend state, not optimistic UI only.
        if rec is not None and rec.status in {
            "accepted_as_proposal",
            "partial_proposed",
            "rejected",
            "snoozed",
            "queued_for_renewal",
            "implemented",
            "cancelled",
        }:
            continue
        cluster_label = str((c.get("cluster") or {}).get("label") or "") or None
        intents = decision_intents(
            rec_id=ref,
            article_id=aid,
            customer_id=cid,
            cluster=cluster_label,
            title=str(c.get("headline") or c.get("title") or ref),
            source_kind=kind,
        )
        c["recommendationId"] = ref
        c["status"] = rec.status if rec else "open"
        c["primaryAction"] = intents["primaryAction"]
        c["secondaryAction"] = intents["secondaryAction"]
        c["partialAction"] = intents["partialAction"]
        c["snoozeAction"] = intents["snoozeAction"]
        c["sliceAbAction"] = intents["sliceAbAction"]
        out.append(c)
    return out


def _rank_and_format(
    candidates: list[dict[str, Any]], cluster: str | None, limit: int
) -> list[dict[str, Any]]:
    if cluster:
        filtered = [
            c
            for c in candidates
            if str(c.get("cluster", {}).get("label", "")).lower() == cluster.lower()
        ]
        candidates = filtered or candidates  # graceful when filter empties
    candidates.sort(key=lambda c: float(c.get("_score") or 0), reverse=True)
    candidates = _attach_intents_and_filter(candidates)
    out = []
    for i, c in enumerate(candidates[: max(1, min(limit, 200))], start=1):
        c.pop("_score", None)
        c.pop("_kind", None)
        c["rank"] = str(i)
        out.append(c)
    return out


async def build(*, cluster: str | None, limit: int = 3) -> list[dict[str, Any]]:
    try:
        with SessionLocal() as db:
            candidates: list[dict[str, Any]] = []
            for builder in (
                lambda: _margin_erosion_candidates(db),
                lambda: _cost_riser_candidates(db),
                lambda: _churn_candidates(db, cluster),
            ):
                try:
                    candidates.extend(builder() or [])
                except Exception:
                    continue
        return _rank_and_format(candidates, cluster, limit)
    except Exception:
        raise ActionCenterBlockError("decisions", "Decision ranking unavailable.")
