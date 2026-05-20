"""At-Risk Revenue aggregation — v2.2 Phase F.

Roll the already-composed ``payload["pareto"]`` (per-customer tier + 12-month
forecast) and ``payload["customers"]`` (per-customer ``pChurn4Q`` /
``pMajorDecline``) up into a per-tier stacked-bar payload Frank can drop
straight into a board deck:

    Forecast next 12mo, split by tier (A/B/C/D), with the at-risk slice
    shaded — at-risk = forecast × max(pChurn4Q, pMajorDecline).

The backend keeps all the parsing/clamping here so the FE only has to render
the bars. ``build_at_risk_revenue`` is pure (no DB) — composer.py passes the
already-filtered upstream blocks in as ``payload``.
"""
from __future__ import annotations

from typing import Any


_TIERS = ("A", "B", "C", "D")


def _parse_eur(value: Any) -> float:
    """Parse a formatted euro string back into a float.

    real_pareto formats forecasts as ``€2.1M``, ``€420 K``, ``€420 000`` (with
    NBSPs or thin spaces). Returns 0.0 when the string is unparseable.
    Numbers pass through.
    """
    if isinstance(value, (int, float)):
        return float(value)
    if not isinstance(value, str):
        return 0.0
    s = (
        value.replace("€", "")
        .replace("\xa0", "")
        .replace(" ", "")
        .replace(" ", "")
        .replace(",", "")
        .strip()
    )
    if not s:
        return 0.0
    try:
        if s.endswith("M") or s.endswith("m"):
            return float(s[:-1]) * 1_000_000
        if s.endswith("K") or s.endswith("k"):
            return float(s[:-1]) * 1_000
        return float(s)
    except (ValueError, TypeError):
        return 0.0


def _risk_prob_for(customer_id: str, risk_by_id: dict[str, float]) -> float:
    """Look up ``max(pChurn4Q, pMajorDecline)`` for a customer.

    Returns 0.0 when the customer is not in the at-risk block (we treat
    unknown customers as safe — the at-risk block only covers the top-N
    riskiest customers).
    """
    raw = risk_by_id.get(str(customer_id), 0.0)
    # Defensive clamp — if upstream produced something malformed, treat as
    # zero risk rather than blow up the chart.
    try:
        p = float(raw)
    except (TypeError, ValueError):
        return 0.0
    if p != p:  # NaN
        return 0.0
    return max(0.0, min(p, 1.0))


def _augment_risk_from_db(
    risk_by_id: dict[str, float],
    customer_ids: list[str],
    db: Any | None,
) -> None:
    """D10: enrich risk_by_id with canonical customer_risk_scores for the
    pareto customer ids that aren't covered by ``topAtRisk``.

    Without this overlay, pareto's top-revenue customers (who are usually
    NOT in the top-N at-risk list) score 0% risk on the tier roll-up, so
    every tier shows '0% at-risk' even when Action Center says some of
    those customers are high/critical risk. We map risk_tier and
    risk_score onto a churn-probability proxy.
    """
    if db is None or not customer_ids:
        return
    missing = [c for c in customer_ids if c not in risk_by_id]
    if not missing:
        return
    try:
        from sqlalchemy import text as _text

        rows = (
            db.execute(
                _text(
                    """
                    SELECT DISTINCT ON (customer_id)
                           customer_id, risk_score, risk_tier
                      FROM customer_risk_scores
                     WHERE customer_id = ANY(:ids)
                     ORDER BY customer_id, score_date DESC
                    """
                ),
                {"ids": missing},
            )
            .fetchall()
        )
        # Map risk_tier → fallback probability so even rows with NULL
        # risk_score still contribute. risk_score is in [0,1] already.
        tier_floor = {
            "critical": 0.85,
            "high": 0.65,
            "medium": 0.40,
            "low": 0.15,
        }
        for r in rows:
            cid = str(r[0])
            score = float(r[1]) if r[1] is not None else 0.0
            tier = (r[2] or "").strip().lower()
            floor_val = tier_floor.get(tier, 0.0)
            risk_by_id[cid] = max(0.0, min(1.0, max(score, floor_val)))
    except Exception:
        # If the table is missing or query fails, leave risk_by_id alone.
        pass


def build_at_risk_revenue(
    payload: dict[str, Any], *, db: Any | None = None
) -> dict[str, Any]:
    """Per-tier forecast vs at-risk € totals.

    Consumes ``payload["pareto"]["customer"]["rows"]`` (each row carries a
    ``tier`` letter and a ``forecast`` euro string) and
    ``payload["customers"]["topAtRisk"]`` (each row carries
    ``pChurn4Q`` / ``pMajorDecline``). Customers in the pareto block but not
    in the at-risk block default to 0% risk.

    Output shape:

    ```
    {
      "tiers": [
        {"tier": "A", "forecastEur": ..., "atRiskEur": ...,
         "safeEur": ..., "atRiskShare": ..., "customerCount": int},
        ...
      ],
      "totalForecastEur": float,
      "totalAtRiskEur": float,
    }
    ```

    All four tiers (A/B/C/D) are always present — empty tiers report
    zeroes. ``atRiskEur`` is bounded to ``0 ≤ atRiskEur ≤ forecastEur``.
    """
    pareto = payload.get("pareto") if isinstance(payload, dict) else None
    customers = payload.get("customers") if isinstance(payload, dict) else None

    cust_rows: list[dict[str, Any]] = []
    if isinstance(pareto, dict):
        cust_block = pareto.get("customer") or {}
        if isinstance(cust_block, dict):
            rows = cust_block.get("rows") or []
            if isinstance(rows, list):
                cust_rows = [r for r in rows if isinstance(r, dict)]

    # Build {customerId: max(pChurn4Q, pMajorDecline)} from the customers payload.
    risk_by_id: dict[str, float] = {}
    if isinstance(customers, dict):
        risk_rows = customers.get("topAtRisk") or []
        if isinstance(risk_rows, list):
            for r in risk_rows:
                if not isinstance(r, dict):
                    continue
                cid = r.get("customerId")
                if cid is None:
                    continue
                try:
                    pc = float(r.get("pChurn4Q") or 0)
                except (TypeError, ValueError):
                    pc = 0.0
                try:
                    pd = float(r.get("pMajorDecline") or 0)
                except (TypeError, ValueError):
                    pd = 0.0
                risk_by_id[str(cid)] = max(pc, pd)

    # D10: enrich with canonical customer_risk_scores for any pareto
    # customer not already covered by topAtRisk so tier roll-ups reflect
    # the same risk source as Action Center decisions.
    if db is not None:
        pareto_cids = [
            str(r.get("customerId"))
            for r in cust_rows
            if r.get("customerId") is not None
        ]
        _augment_risk_from_db(risk_by_id, pareto_cids, db)

    # Aggregate per tier.
    tier_acc: dict[str, dict[str, float | int]] = {
        t: {"forecastEur": 0.0, "atRiskEur": 0.0, "customerCount": 0}
        for t in _TIERS
    }

    for row in cust_rows:
        tier = str(row.get("tier") or "").strip().upper()
        if tier not in tier_acc:
            continue
        forecast_eur = _parse_eur(row.get("forecast"))
        if forecast_eur <= 0:
            # Still count the customer (informational), but no € contribution.
            tier_acc[tier]["customerCount"] = int(tier_acc[tier]["customerCount"]) + 1
            continue
        cid = row.get("customerId")
        p_risk = _risk_prob_for(str(cid) if cid is not None else "", risk_by_id)
        at_risk = forecast_eur * p_risk
        # Defensive clamp: 0 ≤ at_risk ≤ forecast.
        if at_risk < 0:
            at_risk = 0.0
        if at_risk > forecast_eur:
            at_risk = forecast_eur
        tier_acc[tier]["forecastEur"] = float(tier_acc[tier]["forecastEur"]) + forecast_eur
        tier_acc[tier]["atRiskEur"] = float(tier_acc[tier]["atRiskEur"]) + at_risk
        tier_acc[tier]["customerCount"] = int(tier_acc[tier]["customerCount"]) + 1

    tiers_out: list[dict[str, Any]] = []
    total_forecast = 0.0
    total_at_risk = 0.0
    for t in _TIERS:
        forecast_eur = float(tier_acc[t]["forecastEur"])
        at_risk_eur = float(tier_acc[t]["atRiskEur"])
        # Final bound at the tier level (paranoid — already bounded per-row).
        if at_risk_eur < 0:
            at_risk_eur = 0.0
        if at_risk_eur > forecast_eur:
            at_risk_eur = forecast_eur
        safe_eur = forecast_eur - at_risk_eur
        share = (at_risk_eur / forecast_eur) if forecast_eur > 0 else 0.0
        tiers_out.append({
            "tier": t,
            "forecastEur": round(forecast_eur, 2),
            "atRiskEur": round(at_risk_eur, 2),
            "safeEur": round(safe_eur, 2),
            "atRiskShare": round(share, 4),
            "customerCount": int(tier_acc[t]["customerCount"]),
        })
        total_forecast += forecast_eur
        total_at_risk += at_risk_eur

    # Final outer bound: total at risk cannot exceed total forecast.
    if total_at_risk > total_forecast:
        total_at_risk = total_forecast
    if total_at_risk < 0:
        total_at_risk = 0.0

    return {
        "tiers": tiers_out,
        "totalForecastEur": round(total_forecast, 2),
        "totalAtRiskEur": round(total_at_risk, 2),
    }
