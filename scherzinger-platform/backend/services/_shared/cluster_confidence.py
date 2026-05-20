"""Shared cluster-confidence source.

Both the Action Center decisions composer
(``backend.services.action_center.decisions``) and the Pricing Studio
recommendation composer
(``backend.services.recommendation_service``) need a confidence number
attached to each row, keyed by the row's cluster (commodity_group) or
the customer.

Before Phase B7 each composer rolled its own:

  * decisions.py used a log-scaled sample-size heuristic (_conf_from_n)
  * recommendation_service.py read ``model_registry`` for the
    ``directional_accuracy`` metric on ``entity_type='commodity_group'``

Same aid surfaced in both screens could return wildly different
confidence numbers. This module unifies the source.

Resolution order (per plan §5 B7):
  1. ``model_registry`` row for ``(commodity_group=cluster,
     metric_name='directional_accuracy', n_observations>=3)``.
  2. Sample-size heuristic on invoice/quote count (legacy fallback).

The returned dict reports ``source`` ('model_registry' | 'heuristic' |
'unknown') so callers can log/debug which path produced the score.
"""
from __future__ import annotations

import math
from typing import Any, Optional

from sqlalchemy import text


_MODEL_REGISTRY_SQL = text(
    """
    SELECT model_name, version, trained_at, metric_value, n_observations
      FROM model_registry
     WHERE entity_type = 'commodity_group'
       AND entity_id = :cluster
       AND metric_name = 'directional_accuracy'
       AND metric_value IS NOT NULL
       AND COALESCE(n_observations, 0) >= 3
     ORDER BY trained_at DESC NULLS LAST
     LIMIT 1
    """
)


def _conf_from_n(n: int) -> int:
    """Sample-size → confidence %. Same shape decisions.py used before."""
    if n >= 3:
        return max(45, min(95, int(math.log10(n + 1) * 30 + 35)))
    return max(20, n * 8)


def _conf_tone(score: int) -> str:
    if score >= 75:
        return "high"
    if score >= 50:
        return "mid"
    return "low"


def _empty_model_card() -> dict[str, Any]:
    return {"id": None, "version": None, "trainedAt": None}


def _iso_or_none(value: Any) -> Optional[str]:
    if value is None:
        return None
    if hasattr(value, "isoformat"):
        try:
            return value.isoformat()
        except Exception:
            return None
    return str(value)


def _customer_sample_size(db, customer_id: str) -> Optional[int]:
    try:
        n = db.execute(
            text("SELECT COUNT(*) FROM invoices WHERE customer_id = :cid"),
            {"cid": customer_id},
        ).scalar()
        return int(n) if n is not None else None
    except Exception:
        try:
            db.rollback()
        except Exception:
            pass
        return None


def _aid_sample_size_for_cluster(db, commodity_group: str) -> Optional[int]:
    try:
        n = db.execute(
            text(
                """
                SELECT COUNT(*) FROM invoices i
                  JOIN products p ON p.article_id = i.article_id
                 WHERE p.commodity_group = :cg
                """
            ),
            {"cg": commodity_group},
        ).scalar()
        return int(n) if n is not None else None
    except Exception:
        try:
            db.rollback()
        except Exception:
            pass
        return None


def get_cluster_confidence(
    db,
    *,
    commodity_group: Optional[str] = None,
    customer_id: Optional[str] = None,
) -> dict[str, Any]:
    """Single-source cluster confidence.

    Returns::

        {
          "score":       int (0..100),
          "tone":        'high' | 'mid' | 'low',
          "sample_size": int | None,
          "model":       {"id": str | None, "version": str | None,
                          "trainedAt": iso8601 | None},
          "source":      'model_registry' | 'heuristic' | 'unknown',
        }

    1. If ``commodity_group`` is set and ``model_registry`` has a
       qualifying row, use it. ``score`` is ``metric_value * 100``
       clamped to [0, 100], ``sample_size`` is ``n_observations``,
       ``model`` is filled from the row.
    2. Else fall back to the sample-size heuristic.
    3. Else (no inputs) return a minimal payload tagged ``unknown``.
    """
    model_card: dict[str, Any] = _empty_model_card()

    # 1. Model-registry lookup.
    if commodity_group:
        try:
            row = (
                db.execute(_MODEL_REGISTRY_SQL, {"cluster": commodity_group})
                .mappings()
                .first()
            )
        except Exception:
            try:
                db.rollback()
            except Exception:
                pass
            row = None
        if row is not None:
            metric = row.get("metric_value")
            score: int = 50
            try:
                score = int(max(0.0, min(1.0, float(metric))) * 100)
            except (TypeError, ValueError):
                score = 50
            n_obs_raw = row.get("n_observations")
            try:
                sample_size = int(n_obs_raw) if n_obs_raw is not None else None
            except (TypeError, ValueError):
                sample_size = None
            model_card = {
                "id": (
                    str(row.get("model_name")) if row.get("model_name") else None
                ),
                "version": (str(row.get("version")) if row.get("version") else None),
                "trainedAt": _iso_or_none(row.get("trained_at")),
            }
            return {
                "score": score,
                "tone": _conf_tone(score),
                "sample_size": sample_size,
                "model": model_card,
                "source": "model_registry",
            }

    # 2. Heuristic fallback — count rows we can attribute to the cluster
    # or customer, then run the same log-scaled formula decisions.py
    # used before the unification. We keep this path so sparse model
    # registries don't regress to zero confidence.
    sample_size: Optional[int] = None
    if commodity_group:
        sample_size = _aid_sample_size_for_cluster(db, commodity_group)
    if sample_size is None and customer_id:
        sample_size = _customer_sample_size(db, customer_id)
    if sample_size is not None:
        score = _conf_from_n(sample_size)
        return {
            "score": score,
            "tone": _conf_tone(score),
            "sample_size": sample_size,
            "model": model_card,
            "source": "heuristic",
        }

    # 3. No inputs.
    return {
        "score": 0,
        "tone": "low",
        "sample_size": None,
        "model": model_card,
        "source": "unknown",
    }
