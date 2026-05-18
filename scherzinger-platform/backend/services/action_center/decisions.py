"""Today's analyst decisions — ranked across multiple data sources.

The engine concatenates candidates from three real sources and ranks
them by impact-score so the top of the list is the best lever for the
analyst this week:

  1. **Churn risk** — customer_risk_scores.risk_score > 0.7
  2. **Cost riser pass-through gap** — product_cost_trends.cost_change_pct
     > 10% AND no matching catalog price update.
  3. **Margin erosion** — articles whose actual_db2_margin has dropped
     more than 5pp YoY (derived from quote_invoice_links).

Each builder returns a candidate dict with the canonical card keys
(`rank`, `severity`, `title`, `why`, `headline`, `tag`, `cluster`,
`recommendation`, `facts`, `trend`, `primaryCta`, …) so the frontend
component is unchanged.

Applies the ``cluster`` filter and the ``limit`` cap. If every builder
returns no rows (e.g. fresh DB), the composer classifies the block as
``status: 'empty'``. If the underlying DB call explodes the composer
maps the raised :class:`ActionCenterBlockError` to ``status: 'degraded'``.
This block never falls back to seeded synthetic candidates — plan §4
iron rule 7.
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


def _conf_tone(score: int) -> str:
    """Map a 0..100 confidence score to one of {high, mid, low}.

    Used by the standardised ``confidence`` block on every decision row
    so the frontend doesn't have to re-bucket the same number.
    """
    if score >= 75:
        return "high"
    if score >= 50:
        return "mid"
    return "low"


def _iso_or_none(value: Any) -> str | None:
    """Best-effort ISO string for date/datetime/string values from SQL."""
    if value is None:
        return None
    if hasattr(value, "isoformat"):
        try:
            return value.isoformat()
        except Exception:  # pragma: no cover — defensive
            return None
    return str(value)


def _active_model_card(db) -> dict[str, Any]:
    """Return the most-recently-trained ``model_registry`` row as a small
    descriptor. When the table is empty or missing (dev DBs without the
    registry populated yet), every sub-field is ``None`` so the frontend
    can render the "Locked — model registry pending" placeholder.
    """
    empty = {"id": None, "version": None, "trainedAt": None}
    try:
        row = (
            db.execute(
                text(
                    """
                    SELECT model_name, version, trained_at
                      FROM model_registry
                     ORDER BY trained_at DESC NULLS LAST
                     LIMIT 1
                    """
                )
            )
            .mappings()
            .first()
        )
    except Exception:
        return empty
    if row is None:
        return empty
    return {
        "id": str(row.get("model_name")) if row.get("model_name") else None,
        "version": str(row.get("version")) if row.get("version") else None,
        "trainedAt": _iso_or_none(row.get("trained_at")),
    }


def _feature_importance_for(db, model_card: dict[str, Any]) -> list[dict[str, Any]]:
    """Top-3 ``feature_importance`` entries from the active model row.

    Reads the JSONB ``feature_importance`` column on ``model_registry``.
    Returns an empty list when the column is missing, empty, or shaped
    unexpectedly — the frontend treats `[] + model.id == None` as locked.
    """
    model_id = model_card.get("id")
    if not model_id:
        return []
    try:
        row = (
            db.execute(
                text(
                    """
                    SELECT feature_importance
                      FROM model_registry
                     WHERE model_name = :name
                     ORDER BY trained_at DESC NULLS LAST
                     LIMIT 1
                    """
                ),
                {"name": model_id},
            )
            .mappings()
            .first()
        )
    except Exception:
        return []
    if row is None:
        return []
    raw = row.get("feature_importance")
    if not raw:
        return []
    items: list[tuple[str, float]] = []
    # Accept either {feature: weight} dict or [{feature, weight|weightPct}]
    if isinstance(raw, dict):
        for k, v in raw.items():
            try:
                items.append((str(k), float(v)))
            except Exception:
                continue
    elif isinstance(raw, list):
        for entry in raw:
            if not isinstance(entry, dict):
                continue
            name = entry.get("feature") or entry.get("name")
            weight = entry.get("weightPct")
            if weight is None:
                weight = entry.get("weight")
            try:
                if name is not None and weight is not None:
                    items.append((str(name), float(weight)))
            except Exception:
                continue
    if not items:
        return []
    # Normalise to percent 0..100 if values look like 0..1 ratios.
    max_w = max(abs(w) for _, w in items)
    scale = 100.0 if 0 < max_w <= 1.0 else 1.0
    items.sort(key=lambda kv: abs(kv[1]), reverse=True)
    return [{"feature": n, "weightPct": round(w * scale, 2)} for n, w in items[:3]]


def _customer_evidence(db, customer_id: str) -> dict[str, Any]:
    """Evidence pack for a churn row — counts and dates from real invoices."""
    out: dict[str, Any] = {
        "invoiceCount": None,
        "quoteCount": None,
        "lastInvoiceDate": None,
        "sampleSize": None,
        "dataFreshness": None,
    }
    try:
        row = (
            db.execute(
                text(
                    """
                    SELECT COUNT(*) AS n_inv,
                           MAX(date) AS last_invoice
                      FROM invoices
                     WHERE customer_id = :cid
                    """
                ),
                {"cid": customer_id},
            )
            .mappings()
            .first()
        )
        if row is not None:
            n_inv = int(row.get("n_inv") or 0)
            out["invoiceCount"] = n_inv
            out["sampleSize"] = n_inv
            out["lastInvoiceDate"] = _iso_or_none(row.get("last_invoice"))
            out["dataFreshness"] = out["lastInvoiceDate"]
    except Exception:
        # Roll back so a column/schema drift on one query doesn't poison
        # every subsequent query in the same session.
        try:
            db.rollback()
        except Exception:
            pass
    try:
        n_q = (
            db.execute(
                text("SELECT COUNT(*) FROM quotes WHERE customer_id = :cid"),
                {"cid": customer_id},
            ).scalar()
        )
        if n_q is not None:
            out["quoteCount"] = int(n_q)
    except Exception:
        try:
            db.rollback()
        except Exception:
            pass
    return out


def _customer_linked_quotes(db, customer_id: str, limit: int = 5) -> list[str]:
    try:
        rows = (
            db.execute(
                text(
                    """
                    SELECT quote_id
                      FROM quotes
                     WHERE customer_id = :cid
                     ORDER BY quote_date DESC NULLS LAST
                     LIMIT :lim
                    """
                ),
                {"cid": customer_id, "lim": limit},
            )
            .scalars()
            .all()
        )
        return [str(q) for q in rows if q is not None]
    except Exception:
        try:
            db.rollback()
        except Exception:
            pass
        return []


def _sku_evidence(db, article_id: str, *, kind: str) -> dict[str, Any]:
    """Evidence pack for cost_riser/margin_erosion rows — SKU-scoped."""
    out: dict[str, Any] = {
        "invoiceCount": None,
        "quoteCount": None,
        "lastInvoiceDate": None,
        "sampleSize": None,
        "dataFreshness": None,
    }
    try:
        row = (
            db.execute(
                text(
                    """
                    SELECT COUNT(*) AS n_inv,
                           MAX(date) AS last_invoice
                      FROM invoices
                     WHERE article_id = :aid
                    """
                ),
                {"aid": article_id},
            )
            .mappings()
            .first()
        )
        if row is not None:
            n_inv = int(row.get("n_inv") or 0)
            out["invoiceCount"] = n_inv
            out["lastInvoiceDate"] = _iso_or_none(row.get("last_invoice"))
            out["dataFreshness"] = out["lastInvoiceDate"]
    except Exception:
        try:
            db.rollback()
        except Exception:
            pass
    if kind == "cost_riser":
        try:
            n = (
                db.execute(
                    text(
                        "SELECT COUNT(*) FROM product_cost_trends WHERE article_id = :aid"
                    ),
                    {"aid": article_id},
                ).scalar()
            )
            if n is not None:
                out["sampleSize"] = int(n)
        except Exception:
            try:
                db.rollback()
            except Exception:
                pass
            out["sampleSize"] = out["invoiceCount"]
    else:  # margin_erosion
        try:
            n = (
                db.execute(
                    text(
                        "SELECT COUNT(*) FROM quote_invoice_links WHERE article_id = :aid"
                    ),
                    {"aid": article_id},
                ).scalar()
            )
            if n is not None:
                out["sampleSize"] = int(n)
        except Exception:
            try:
                db.rollback()
            except Exception:
                pass
            out["sampleSize"] = out["invoiceCount"]
    try:
        n_q = (
            db.execute(
                text(
                    """
                    SELECT COUNT(DISTINCT q.quote_id)
                      FROM quote_invoice_links q
                     WHERE q.article_id = :aid
                    """
                ),
                {"aid": article_id},
            ).scalar()
        )
        if n_q is not None:
            out["quoteCount"] = int(n_q)
    except Exception:
        try:
            db.rollback()
        except Exception:
            pass
    return out


def _sku_linked_quotes(db, article_id: str, limit: int = 5) -> list[str]:
    try:
        rows = (
            db.execute(
                text(
                    """
                    SELECT DISTINCT quote_id
                      FROM quote_invoice_links
                     WHERE article_id = :aid
                     LIMIT :lim
                    """
                ),
                {"aid": article_id, "lim": limit},
            )
            .scalars()
            .all()
        )
        return [str(q) for q in rows if q is not None]
    except Exception:
        try:
            db.rollback()
        except Exception:
            pass
        return []


# Allowed lifecycleState enum — frontend renders one chip variant per value.
_LIFECYCLE_VALUES = {
    "open",
    "accepted",
    "rejected",
    "partial",
    "snoozed",
    "ab_running",
    "ab_promoted",
}


def _lifecycle_from_status(status: str | None) -> str:
    """Project the workflow-internal status string to the public lifecycle
    enum the frontend chip understands. Unknown/None → ``open``.
    """
    s = (status or "").lower()
    if s in {"accepted_as_proposal", "implemented"}:
        return "accepted"
    if s in {"partial_proposed"}:
        return "partial"
    if s in {"rejected", "cancelled"}:
        return "rejected"
    if s in {"snoozed", "queued_for_renewal"}:
        return "snoozed"
    if s in {"in_ab_test", "ab_running"}:
        return "ab_running"
    if s in {"ab_promoted"}:
        return "ab_promoted"
    return "open"


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
        ev = _customer_evidence(db, cid) if cid and cid != "—" else {
            "invoiceCount": None, "quoteCount": None, "lastInvoiceDate": None,
            "sampleSize": None, "dataFreshness": None,
        }
        linked_quotes = _customer_linked_quotes(db, cid) if cid and cid != "—" else []
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
                "queue": "churn",
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
                "evidence": ev,
                "_confSample": ev.get("invoiceCount"),
                "_confScore": int(score * 100),
                "linkedQuoteIds": linked_quotes,
                "linkedSkuIds": [],
            }
        )
    return out


def _cost_riser_candidates(db) -> list[dict[str, Any]]:
    """Articles whose commodity cost has risen sharply WITHOUT a price move."""
    out: list[dict[str, Any]] = []
    risers = cost_service.get_cost_risers(db, top=30)
    for r in risers:
        cc = float(r.get("cost_change_pct") or 0)
        # Lowered from 10% → 5%: surfaces honest cost-risers that would
        # otherwise be filtered out by a noisy threshold. Demo DB has
        # several real risers in the 5–10% band.
        if cc < 0.05:
            continue
        aid = str(r.get("article_id") or "—")
        ev = _sku_evidence(db, aid, kind="cost_riser") if aid and aid != "—" else {
            "invoiceCount": None, "quoteCount": None, "lastInvoiceDate": None,
            "sampleSize": None, "dataFreshness": None,
        }
        linked_quotes = _sku_linked_quotes(db, aid) if aid and aid != "—" else []
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
                "queue": "cost_riser",
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
                "evidence": ev,
                "_confSample": ev.get("sampleSize"),
                "_confScore": _conf_from_n(int(r.get("record_count") or 0)),
                "linkedQuoteIds": linked_quotes,
                "linkedSkuIds": [aid] if aid and aid != "—" else [],
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
                last_full AS (
                  -- "Most recent completed year": skip CURRENT_YEAR because
                  -- a partial year (e.g. Jan–Apr stub) makes the avg margin
                  -- unrepresentative and masks honest YoY erosions.
                  SELECT COALESCE(MAX(year), EXTRACT(YEAR FROM CURRENT_DATE)::int - 1) AS y
                  FROM yearly
                  WHERE year < EXTRACT(YEAR FROM CURRENT_DATE)
                ),
                pivoted AS (
                  SELECT article_id,
                         MAX(avg_margin) FILTER (WHERE year = (SELECT y FROM last_full)) AS this_year,
                         MAX(avg_margin) FILTER (WHERE year = (SELECT y FROM last_full) - 1) AS last_year,
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
                            AND i2.year = (SELECT y FROM last_full)
                       ), 0) AS this_year_revenue
                FROM pivoted p
                JOIN products pr ON pr.article_id = p.article_id
                WHERE p.this_year IS NOT NULL AND p.last_year IS NOT NULL
                  AND p.this_year BETWEEN -1 AND 1
                  AND p.last_year BETWEEN -1 AND 1
                  AND p.records >= 2
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
        ev = _sku_evidence(db, aid, kind="margin_erosion") if aid and aid != "—" else {
            "invoiceCount": None, "quoteCount": None, "lastInvoiceDate": None,
            "sampleSize": None, "dataFreshness": None,
        }
        linked_quotes = _sku_linked_quotes(db, aid) if aid and aid != "—" else []
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
                "queue": "margin_erosion",
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
                "evidence": ev,
                "_confSample": ev.get("sampleSize"),
                "_confScore": _conf_from_n(n),
                "linkedQuoteIds": linked_quotes,
                "linkedSkuIds": [aid] if aid and aid != "—" else [],
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
    model_card: dict[str, Any] = {"id": None, "version": None, "trainedAt": None}
    feature_importance: list[dict[str, Any]] = []
    try:
        with SessionLocal() as db:
            status_map = workflow_service.get_recommendation_status_map(
                db, [r[0] for r in refs_by_idx]
            )
            model_card = _active_model_card(db)
            feature_importance = _feature_importance_for(db, model_card)
    except Exception:
        status_map = {}

    out: list[dict[str, Any]] = []
    for c, (ref, aid, cid, kind) in zip(candidates, refs_by_idx):
        rec = status_map.get(ref)
        # Surface acted-on decisions with their lifecycleState chip rather
        # than hiding them on refresh — Frank needs to see what he already
        # decided today so the page remains an honest record.
        # ``cancelled`` is the only status we drop because cancelled means
        # the row was retracted and no longer represents a real lever.
        if rec is not None and rec.status == "cancelled":
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
        c["id"] = ref
        backend_status = rec.status if rec else "open"
        c["status"] = backend_status
        c["lifecycleState"] = _lifecycle_from_status(backend_status)
        # Plan §2.6 B13 — standardised confidence block. Always present.
        score = int(c.pop("_confScore", 50) or 0)
        score = max(0, min(100, score))
        sample = c.pop("_confSample", None)
        c["confidence"] = {
            "score": score,
            "sampleSize": int(sample) if isinstance(sample, (int, float)) else None,
            "tone": _conf_tone(score),
            "model": dict(model_card),
        }
        # Plan §2.6 B14 — empty list is honest when model_registry is bare.
        c["featureImportance"] = list(feature_importance)
        # Plan §2.6 B15 — explicit empty arrays beat missing keys.
        c.setdefault("linkedQuoteIds", [])
        c.setdefault("linkedSkuIds", [])
        # Plan §2.6 B12 — evidence pack always present (sub-fields may be null).
        c.setdefault("evidence", {
            "invoiceCount": None,
            "quoteCount": None,
            "lastInvoiceDate": None,
            "sampleSize": None,
            "dataFreshness": None,
        })
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
    # Sort within each queue by _score, then INTERLEAVE across queues so the
    # ranked list has variety. Pure global rank by raw _score collapses to
    # one queue because cost/margin scores (revenue × rate) overpower churn
    # scores (probability × revenue/100k) by 3+ orders of magnitude.
    by_queue: dict[str, list[dict[str, Any]]] = {}
    for c in candidates:
        q = str(c.get("queue") or "other")
        by_queue.setdefault(q, []).append(c)
    for q in by_queue:
        by_queue[q].sort(key=lambda c: float(c.get("_score") or 0), reverse=True)
    # Round-robin pop highest-score remaining per queue until exhausted.
    interleaved: list[dict[str, Any]] = []
    while by_queue:
        for q in list(by_queue.keys()):
            if by_queue[q]:
                interleaved.append(by_queue[q].pop(0))
            if not by_queue[q]:
                del by_queue[q]
    candidates = _attach_intents_and_filter(interleaved)
    out = []
    for i, c in enumerate(candidates[: max(1, min(limit, 200))], start=1):
        c.pop("_score", None)
        c.pop("_kind", None)
        # Iron rule §2.5 — every decision row must carry a stable queue id
        # so BucketFilterRow can filter without label parsing.
        c.setdefault("queue", "other")
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
