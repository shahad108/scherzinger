"""Typed UI action intents emitted by the Action Center composer.

Each composer block attaches an ``action`` (or ``primaryAction`` /
``secondaryAction`` / ``actions.{hold,stop,promote}``) to its payload
items so the frontend can route, mutate, or open a typed drawer
without parsing visible button labels.

Intent shape mirrors ``frontend-v2/src/types/uiActions.ts``:

    {
      "kind":            backend action kind (e.g. accept_recommendation)
      "targetType":      "recommendation" | "ab_test" | "article" | ...
      "targetId":        stable id used by the backend handler
      "body":            extra POST body for the action mutation
      "route":           SPA route (e.g. "/pricing")
      "hash":            URL hash fragment (e.g. "ab-tests")
      "query":           URL query params dict
      "toast":           toast text shown on success
      "toastSeverity":   "info" | "success" | "warning" | "error"
      "drawer":          { title, description?, items?[] } for read-only panels
      "disabledReason":  if present the action is disabled w/ this message
      "recommendationId" / "articleId" / "customerId" / "cluster" /
      "abTestId" / "sourceScreen" / "returnTo" / "focus":
                          Phase-1 context fields used to deep-link
    }
"""
from __future__ import annotations

from typing import Any


def stable_recommendation_ref(kind: str, *parts: str | int | None) -> str:
    """Build a stable source_ref like ``margin_erosion:ART-1234``.

    The same string is later used by ``workflow_service.recommendation_ref``
    when the user accepts/declines, so the recommendation row is keyed by
    this id and survives refresh.
    """
    safe = ":".join(str(p) for p in parts if p not in (None, "", "—"))
    return f"{kind}:{safe}" if safe else kind


def _drawer_context(
    *,
    rec_id: str | None = None,
    article_id: str | None = None,
    customer_id: str | None = None,
    cluster: str | None = None,
    ab_test_id: str | None = None,
    source_kind: str | None = None,
    headline: str | None = None,
    current_price: float | None = None,
    target_price: float | None = None,
) -> dict[str, Any]:
    out: dict[str, Any] = {"sourceScreen": "action-center"}
    if rec_id is not None:
        out["recommendationId"] = rec_id
    if article_id is not None:
        out["articleId"] = article_id
    if customer_id is not None:
        out["customerId"] = customer_id
    if cluster is not None:
        out["cluster"] = cluster
    if ab_test_id is not None:
        out["abTestId"] = ab_test_id
    if source_kind is not None:
        out["sourceKind"] = source_kind
    if headline is not None:
        out["headline"] = headline
    if current_price is not None:
        out["currentPrice"] = current_price
    if target_price is not None:
        out["targetPrice"] = target_price
    return out


def decision_intents(
    *,
    rec_id: str,
    article_id: str | None,
    customer_id: str | None,
    cluster: str | None,
    title: str,
    source_kind: str,
) -> dict[str, dict[str, Any]]:
    """Primary = accept, secondary = open the right downstream surface."""
    base_ctx = {
        "recommendationId": rec_id,
        "articleId": article_id,
        "customerId": customer_id,
        "cluster": cluster,
        "sourceScreen": "action-center",
    }
    accept_body = {
        "recommendation_id": rec_id,
        "source_kind": source_kind,
        "target_type": "recommendation",
        "target_id": rec_id,
        "article_id": article_id,
        "customer_id": customer_id,
        "cluster": cluster,
        "after": {"headline": title},
    }
    primary = {
        **base_ctx,
        "kind": "accept_recommendation",
        "targetType": "recommendation",
        "targetId": rec_id,
        "body": accept_body,
        "toast": f'Accepted "{title}".',
    }
    if source_kind == "churn":
        secondary = {
            **base_ctx,
            "route": "/quotes",
            "query": {"customer": customer_id} if customer_id else None,
            "toast": "Opening customer in Quotes & Guardrails.",
        }
    else:
        secondary = {
            **base_ctx,
            "route": "/pricing",
            "query": {
                "aid": article_id,
                "recommendation": rec_id,
                "source": "action-center",
            },
            "toast": f"Opening {article_id or 'article'} in Pricing Studio.",
        }
    # Drop None query values so the frontend builds a clean URL.
    if secondary.get("query"):
        secondary["query"] = {k: v for k, v in secondary["query"].items() if v not in (None, "")}

    # Phase 3 — `partial` and `snooze` open typed form drawers; submission
    # writes the same recommendation lifecycle event the buttons used to
    # post directly. The drawer carries the recommendation context so the
    # form pre-fills and the audit row stays consistent.
    drawer_ctx = _drawer_context(
        rec_id=rec_id,
        article_id=article_id,
        customer_id=customer_id,
        cluster=cluster,
        source_kind=source_kind,
        headline=title,
    )
    partial = {
        **base_ctx,
        "drawer": {
            "title": "Partial acceptance",
            "description": f"Soft proposal for {article_id or rec_id}.",
            "formKind": "partial_accept",
            "context": drawer_ctx,
        },
    }
    snooze = {
        **base_ctx,
        "drawer": {
            "title": "Snooze recommendation",
            "description": "Hide until a future review window.",
            "formKind": "snooze",
            "context": drawer_ctx,
        },
    }
    slice_ab = {
        **base_ctx,
        "drawer": {
            "title": "Start A/B test",
            "description": f"Slice a measured price test for {article_id or rec_id}.",
            "formKind": "ab_setup",
            "context": _drawer_context(
                article_id=article_id,
                cluster=cluster,
                source_kind=source_kind,
                headline=f"A/B {article_id or rec_id}",
            ),
        },
    }
    return {
        "primaryAction": primary,
        "secondaryAction": secondary,
        "partialAction": partial,
        "snoozeAction": snooze,
        "sliceAbAction": slice_ab,
    }


def sku_action(*, article_id: str, status: str) -> dict[str, Any]:
    if status == "abtest":
        return {
            "articleId": article_id,
            "sourceScreen": "action-center",
            "route": "/pricing",
            "hash": "ab-tests",
            "query": {"aid": article_id},
            "toast": f"Opening A/B test for {article_id}.",
        }
    if status == "locked":
        # Phase 3 — Locked SKUs land in the queue_renewal form drawer so
        # the analyst captures the renewal window + owner + contract ref
        # in a single typed submission.
        return {
            "articleId": article_id,
            "sourceScreen": "action-center",
            "drawer": {
                "title": f"Queue renewal · {article_id}",
                "description": "Schedule the contract renewal review for this SKU.",
                "formKind": "queue_renewal",
                "context": _drawer_context(
                    article_id=article_id,
                    headline=f"Renewal queue · {article_id}",
                ),
            },
        }
    return {
        "articleId": article_id,
        "sourceScreen": "action-center",
        "route": "/pricing",
        "query": {"aid": article_id, "source": "action-center"},
        "toast": f"Opening {article_id} in Pricing Studio.",
    }


def noop_intent() -> dict[str, Any]:
    """Typed no-op intent emitted for the pinned "All" filter chip.

    The frontend dispatcher recognises ``noop: True`` and short-circuits;
    nothing routes, nothing mutates. We still emit a typed object (rather
    than ``None``) so callers can rely on ``queueRoute`` being non-null
    — plan §4 iron rule 7.
    """
    return {
        "sourceScreen": "action-center",
        "noop": True,
    }


def queue_route_intent(queue_id: str, label: str) -> dict[str, Any]:
    """Open a specific decision queue in Pricing Studio.

    Used by the BucketFilterRow chips (cmd-click / right-click) to escape
    out of the in-page filter into the full queue view.
    """
    return {
        "sourceScreen": "action-center",
        "route": "/pricing",
        "query": {"queue": queue_id, "source": "action-center"},
        "toast": f"Opening {label} queue in Pricing Studio.",
    }


def bucket_action(bucket_id: str) -> dict[str, Any]:
    if bucket_id == "locked":
        return {
            "sourceScreen": "action-center",
            "route": "/forecasting",
            "query": {"queue": "renewals"},
            "toast": "Opening renewal candidates in Forecasting.",
        }
    return {
        "sourceScreen": "action-center",
        "cluster": bucket_id,
        "route": "/pricing",
        "query": {"filter": bucket_id, "source": "action-center"},
        "toast": f"Opening {bucket_id} bucket in Pricing Studio.",
    }


def trust_action(label: str, value: str, caption: str) -> dict[str, Any]:
    return {
        "sourceScreen": "action-center",
        "drawer": {
            "title": f"{label} details",
            "description": caption,
            "items": [
                {"label": "Current value", "value": value},
                {
                    "label": "History",
                    "value": (
                        "Training and feature-importance history attaches "
                        "from the model registry."
                    ),
                },
                {"label": "Owner", "value": "Frank reviews exceptions before rollout."},
            ],
        },
        "toast": f"{label} transparency opened",
        "toastSeverity": "info",
    }


def ab_actions(*, test_id: str, aid: str) -> dict[str, dict[str, Any]]:
    base = {
        "abTestId": test_id,
        "articleId": aid,
        "sourceScreen": "action-center",
        "targetType": "ab_test",
        "targetId": test_id,
    }
    drawer_ctx = _drawer_context(
        ab_test_id=test_id,
        article_id=aid,
        headline=f"A/B test {aid}",
    )
    # Phase 3 — Hold + Promote require explicit reasoning (hold) or
    # MD-approval acknowledgement (promote), so they open typed forms.
    # Stop is a quick destructive action and stays a direct mutation.
    return {
        "hold": {
            **base,
            "drawer": {
                "title": f"Hold A/B test · {aid}",
                "description": "Pause the experiment without ending it.",
                "formKind": "ab_hold",
                "context": drawer_ctx,
            },
        },
        "stop": {
            **base,
            "kind": "stop_ab_test",
            "body": {"test_id": test_id, "aid": aid},
            "toast": f"A/B test {aid} stopped.",
            "toastSeverity": "warning",
        },
        "promote": {
            **base,
            "drawer": {
                "title": f"Promote A/B test · {aid}",
                "description": "Promote the treatment to a rollout proposal.",
                "formKind": "ab_promote",
                "context": drawer_ctx,
            },
        },
    }


def ab_setup_intent(*, article_id: str | None, current_price: float | None = None) -> dict[str, Any]:
    """Used by the Action Center "Start new A/B test" CTA."""
    return {
        "articleId": article_id,
        "sourceScreen": "action-center",
        "drawer": {
            "title": "Start A/B test",
            "description": "Slice a measured price test against an article.",
            "formKind": "ab_setup",
            "context": _drawer_context(
                article_id=article_id,
                current_price=current_price,
                headline=f"A/B {article_id}" if article_id else "A/B setup",
            ),
        },
    }


def movable_hero_action() -> dict[str, Any]:
    return {
        "sourceScreen": "action-center",
        "route": "/pricing",
        "query": {"queue": "repricing", "source": "action-center"},
        "toast": "Opening the repricing queue in Pricing Studio.",
    }


def lost_quote_action() -> dict[str, Any]:
    return {
        "sourceScreen": "action-center",
        "route": "/margin",
        "query": {"focus": "lost_quote", "source": "action-center"},
        "toast": "Opening lost-quote margin analysis.",
    }


def scroll_intent(anchor: str, *, query: dict[str, Any] | None = None) -> dict[str, Any]:
    """In-page smooth-scroll intent.

    The frontend dispatcher reads ``scroll`` and calls
    ``document.querySelector(anchor)?.scrollIntoView({ behavior: 'smooth' })``
    instead of routing. Optional ``query`` lets the dispatcher push a
    filter (e.g. ``?queue=margin``) into the URL without navigating away.
    """
    intent: dict[str, Any] = {
        "sourceScreen": "action-center",
        "scroll": anchor,
    }
    if query:
        intent["query"] = query
    return intent


def summary_tile_actions(
    *,
    trust_headline_label: str,
    trust_headline_value: str,
    trust_headline_caption: str,
) -> dict[str, dict[str, Any]]:
    """Typed intents for every TodaySummaryStrip tile so the frontend
    never invents fallbacks. Plan §2.3:

      - movable_revenue → scroll to ``#sec-movable``
      - open_actions    → scroll to ``#sec-decisions``
      - recoverable_margin → scroll to ``#sec-decisions`` + filter queue=margin
      - blocked_quotes  → route to /quotes?status=blocked&source=action-center
      - model_trust     → reuse TrustDrawer via :func:`trust_action`
    """
    return {
        "movable_revenue": scroll_intent("#sec-movable"),
        "open_actions": scroll_intent("#sec-decisions"),
        "recoverable_margin": scroll_intent(
            "#sec-decisions", query={"queue": "margin"}
        ),
        "blocked_quotes": {
            "sourceScreen": "action-center",
            "route": "/quotes",
            "query": {"status": "blocked", "source": "action-center"},
            "toast": "Opening blocked quotes.",
        },
        "model_trust": trust_action(
            trust_headline_label,
            trust_headline_value,
            trust_headline_caption,
        ),
    }
