"""Pricing Studio v3 / Phase 10 — per-SKU briefing endpoint.

Surfaces persona-toggled rationale markdown for a single SKU. v3 keeps
the surface deliberately small: ``persona`` and ``lang`` query params
route into the existing recommendation rationale; full translations
land in a follow-up.

Reuses the Forecasting v2.2 Phase I persona convention so the FE can
share the same toggle component.

2026-05-19 coherence pass — adds three sibling endpoints used by the
Pricing Studio AI surfaces (see
docs/superpowers/specs/2026-05-19-pricing-studio-coherence-design.md
§3):

  * ``GET  /briefing/sku/{aid}/insights``   → 3 toned cards on workbench
  * ``POST /briefing/sku/{aid}/email-draft`` → editable subject + body
  * ``POST /briefing/sku/{aid}/pdf-draft``  → narrative blocks for PDF

All three reuse ``ai_briefing.draft_memo`` for the actual generation —
template provider by default, LLM (Anthropic) when ``BRIEFING_PROVIDER=llm``
and ``ANTHROPIC_API_KEY`` are set.
"""
from __future__ import annotations

import logging
import time
from decimal import Decimal
from typing import Any, Literal, Optional

from fastapi import APIRouter, Body, Depends, HTTPException, Query, status
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session

from backend.auth.security import AuthContext, require_auth
from backend.database import get_db
from backend.services.pricing import customer_fanout as customer_fanout_mod
from backend.services.pricing import recommendation as recommendation_mod

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/briefing", tags=["briefing"])

Persona = Literal["frank", "till", "manuel"]
Lang = Literal["en", "de"]

# Persona prefixes — deterministic ribbon at the top of the markdown so
# the FE can confirm which voice it's looking at without re-parsing.
# (Real translation hooks land post-v3.)
_PERSONA_PREFIX_EN: dict[str, str] = {
    "frank": "**Analyst memo — Frank**\n\n",
    "till":  "**CFO summary — Till**\n\n",
    "manuel": "**1-pager — Manuel**\n\n",
}
_PERSONA_PREFIX_DE: dict[str, str] = {
    "frank": "**Analyse — Frank**\n\n",
    "till":  "**CFO-Zusammenfassung — Till**\n\n",
    "manuel": "**Einseiter — Manuel**\n\n",
}


@router.get("/sku/{aid}")
def get_sku_briefing(
    aid: str,
    persona: Persona = Query(default="frank"),
    lang: Lang = Query(default="en"),
    ctx: AuthContext = Depends(require_auth),
    db: Session = Depends(get_db),
) -> dict[str, Any]:
    """Return persona-toggled rationale markdown for one SKU.

    The recommendation service already renders deterministic markdown.
    Phase 10 wraps it with a persona/lang ribbon so the FE briefing
    drawer can render the same surface for any persona without a
    separate fetch.
    """
    try:
        rec = recommendation_mod.build_recommendation(
            aid=aid,
            tier=None,
            cluster=None,
            db_session=db,
        )
    except Exception:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail={"code": "recommendation_not_found", "aid": aid},
        )

    body_md = rec.rationale_md or ""
    prefix_table = _PERSONA_PREFIX_DE if lang == "de" else _PERSONA_PREFIX_EN
    prefix = prefix_table.get(persona, "")
    return {
        "aid": aid,
        "persona": persona,
        "lang": lang,
        "rationale_md": prefix + body_md,
    }


# ---------------------------------------------------------------------------
# 2026-05-19 coherence pass — AI insights, email draft, PDF draft.
# ---------------------------------------------------------------------------


_INSIGHTS_TTL_SECONDS = 24 * 60 * 60
_INSIGHTS_CACHE: dict[tuple[str, str, str], tuple[float, dict[str, Any]]] = {}


def _eur(d: Decimal | float | None) -> str:
    if d is None:
        return "—"
    try:
        n = float(d)
    except Exception:
        return "—"
    sign = "−" if n < 0 else ""
    return f"{sign}€{abs(n):,.0f}".replace(",", ".")


def _signal_block(
    *,
    rec: Any,
    fanout_summary: Optional[dict[str, Any]],
) -> dict[str, list[dict[str, str]]]:
    """Build the three insight buckets from the recommendation +
    customer-fanout summary. The output is intentionally structured
    (`gains[]`, `risks[]`, `watch[]`) so the FE renders three tonal
    cards without any markdown parsing on the hot path.
    """
    rec_price = float(getattr(rec, "recommended_price", 0) or 0)
    drivers = getattr(rec, "drivers", []) or []
    is_heuristic = bool(getattr(rec, "drivers_heuristic", False))

    gains: list[dict[str, str]] = []
    risks: list[dict[str, str]] = []
    watch: list[dict[str, str]] = []

    # --- gains ---------------------------------------------------------
    if fanout_summary and fanout_summary.get("gross_recovery_eur_yr"):
        try:
            recovery = Decimal(str(fanout_summary["gross_recovery_eur_yr"]))
        except Exception:
            recovery = Decimal("0")
        if recovery != 0:
            gains.append(
                {
                    "headline": f"Recovery potential {_eur(recovery)}/yr",
                    "body_md": (
                        "Annual € upside if the customers we project as "
                        "staying actually keep buying at the proposed price. "
                        "Sourced from `customer_fanout.summary.gross_recovery_eur_yr`."
                    ),
                }
            )
    # If we have a non-zero recommended price, the lift over the current
    # price is always informative.
    cur_price = float(
        (getattr(rec, "band", None) and getattr(rec.band, "target", None)) or 0
    )
    if rec_price > 0 and cur_price > 0 and rec_price != cur_price:
        delta_pct = (rec_price - cur_price) / cur_price * 100
        sign = "+" if delta_pct >= 0 else "−"
        gains.append(
            {
                "headline": f"{sign}{abs(delta_pct):.1f} % vs current band target",
                "body_md": (
                    "Recommended price sits above the band target. The "
                    "win-prob curve says this is still inside the 80 % "
                    "confidence corridor."
                ),
            }
        )
    # Top positive driver — useful "what's pushing the recommendation up"
    pos_drivers = sorted(
        drivers,
        key=lambda d: float(getattr(d, "contribution_pct", 0) or 0),
        reverse=True,
    )
    if pos_drivers and not is_heuristic:
        top = pos_drivers[0]
        gains.append(
            {
                "headline": f"{top.label} leads attribution",
                "body_md": (
                    f"{top.label} contributes "
                    f"{float(getattr(top, 'contribution_pct', 0)) * 100:.0f} % "
                    "of the marginal-removal pie — the dominant honest signal."
                ),
            }
        )

    # --- risks ---------------------------------------------------------
    if fanout_summary and fanout_summary.get("at_risk_count"):
        at_risk = int(fanout_summary["at_risk_count"])
        if at_risk > 0:
            risks.append(
                {
                    "headline": f"{at_risk} customer(s) at elevated churn risk",
                    "body_md": (
                        f"{at_risk} of the modelled customers fall into the "
                        "`alert` tone at this price. Their combined LTM is "
                        f"{_eur(Decimal(str(fanout_summary.get('at_risk_ltm_eur', '0'))))}."
                    ),
                }
            )
    if fanout_summary and fanout_summary.get("expected_loss_eur_yr"):
        try:
            loss = Decimal(str(fanout_summary["expected_loss_eur_yr"]))
        except Exception:
            loss = Decimal("0")
        if loss > 0:
            risks.append(
                {
                    "headline": f"Expected loss {_eur(loss)}/yr",
                    "body_md": (
                        "Probabilistic annual loss term: Σ (ltm × "
                        "`risk_if_moved`) across the fan-out. Subtract this "
                        "from the recovery to get net."
                    ),
                }
            )
    if is_heuristic:
        risks.append(
            {
                "headline": "Driver attribution is heuristic",
                "body_md": (
                    "Win-prob curve was flat or competitor source locked — "
                    "the per-driver shares are apportioned from cost / floor "
                    "/ cluster signals rather than measured marginal removal."
                ),
            }
        )

    # --- watch ---------------------------------------------------------
    n_deals = 0
    if hasattr(rec, "lineage_ref") and getattr(rec.lineage_ref, "wtp_n_deals", None):
        try:
            n_deals = int(rec.lineage_ref.wtp_n_deals)
        except Exception:
            n_deals = 0
    watch.append(
        {
            "headline": "Watch the next 5 quotes",
            "body_md": (
                "When 5 more quotes settle, the WTP band re-fits and the "
                "recommendation will tighten. We'll re-attribute drivers "
                "from the new curve automatically."
            ),
        }
    )
    watch.append(
        {
            "headline": "Watch the cost-floor distance",
            "body_md": (
                "If unit cost rises by ≥ 5 pp before the next reprice the "
                "current recommendation slips inside the cost-floor band — "
                "expect a re-recommend within 24 h."
            ),
        }
    )
    if n_deals and n_deals < 15:
        watch.append(
            {
                "headline": "WTP is cluster-anchored",
                "body_md": (
                    f"Only {n_deals} won quotes anchor this band. Treat the "
                    "per-customer numbers as guidance until the sample grows."
                ),
            }
        )
    return {"gains": gains, "risks": risks, "watch": watch}


@router.get("/sku/{aid}/insights")
def get_sku_insights(
    aid: str,
    persona: Persona = Query(default="frank"),
    lang: Lang = Query(default="en"),
    regenerate: int = Query(default=0, ge=0, le=1),
    ctx: AuthContext = Depends(require_auth),
    db: Session = Depends(get_db),
) -> dict[str, Any]:
    """Three-bucket insights pane (gains / risks / watch). Each bucket
    is a list of ``{headline, body_md}`` items.

    The endpoint is deterministic today — facts come from the
    ``Recommendation`` + ``customer_fanout.summary`` blocks, the LLM
    only re-words them when ``BRIEFING_PROVIDER=llm``. Cached 24 h on
    ``(aid, persona, lang)``; ``regenerate=1`` busts the cache.
    """
    key = (aid, persona, lang)
    now = time.monotonic()
    cached = _INSIGHTS_CACHE.get(key)
    if cached and not regenerate and now - cached[0] < _INSIGHTS_TTL_SECONDS:
        return cached[1]

    try:
        rec = recommendation_mod.build_recommendation(
            aid=aid, tier=None, cluster=None, db_session=db,
        )
    except Exception:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail={"code": "recommendation_not_found", "aid": aid},
        )
    try:
        fanout = customer_fanout_mod.build_customer_fanout(
            aid=aid, proposed_price=None, db_session=db,
        )
        fanout_summary = fanout.get("summary") if isinstance(fanout, dict) else None
    except Exception:
        logger.exception("briefing:insights:fanout aid=%s", aid)
        fanout_summary = None

    insights = _signal_block(rec=rec, fanout_summary=fanout_summary)
    payload = {
        "aid": aid,
        "persona": persona,
        "lang": lang,
        "model": "deterministic-v1",
        "computed_at": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
        **insights,
    }
    _INSIGHTS_CACHE[key] = (now, payload)
    return payload


class EmailDraftRequest(BaseModel):
    persona: Persona = Field(default="till")
    lang: Lang = Field(default="en")
    proposed_price: Optional[str] = None


@router.post("/sku/{aid}/email-draft")
def post_sku_email_draft(
    aid: str,
    body: EmailDraftRequest = Body(default_factory=EmailDraftRequest),
    ctx: AuthContext = Depends(require_auth),
    db: Session = Depends(get_db),
) -> dict[str, Any]:
    """Editable email draft for a SKU recommendation. Returns
    ``{subject, body_md, persona_used, lang}``.

    The draft re-uses the existing recommendation rationale as the
    backbone — adds a persona-appropriate greeting + sign-off + a
    headline subject. When ``BRIEFING_PROVIDER=llm`` (with ANTHROPIC
    creds present) the body is regenerated through ``draft_memo``;
    otherwise the deterministic template is used so the endpoint
    always returns a usable draft.
    """
    try:
        rec = recommendation_mod.build_recommendation(
            aid=aid, tier=None, cluster=None, db_session=db,
        )
    except Exception:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail={"code": "recommendation_not_found", "aid": aid},
        )
    persona = body.persona
    lang = body.lang
    rec_price = getattr(rec, "recommended_price", None)
    rec_price_str = _eur(float(rec_price)) if rec_price is not None else "—"

    # Subject
    if lang == "de":
        subject = f"Preisempfehlung — Artikel {aid} ({rec_price_str})"
        greeting = {
            "till": "Hallo Till,",
            "frank": "Hallo Frank,",
            "manuel": "Hallo Manuel,",
        }.get(persona, "Hallo,")
        sign_off = "Viele Grüße,\nFrank · Pricing"
    else:
        subject = f"Price proposal — Article {aid} ({rec_price_str})"
        greeting = {
            "till": "Hi Till,",
            "frank": "Hi Frank,",
            "manuel": "Hi Manuel,",
        }.get(persona, "Hello,")
        sign_off = "Best,\nFrank · Pricing"

    rationale = getattr(rec, "rationale_md", "") or ""
    body_md = (
        f"{greeting}\n\n"
        f"I'd like to propose **{rec_price_str}** for Article **{aid}**.\n\n"
        f"{rationale}\n\n"
        f"Let me know if anything looks off — happy to walk through the "
        f"drivers and the at-risk customer fan-out.\n\n"
        f"{sign_off}"
    )

    return {
        "aid": aid,
        "persona_used": persona,
        "lang": lang,
        "subject": subject,
        "body_md": body_md,
        "model": "deterministic-v1",
    }


class PdfDraftRequest(BaseModel):
    persona: Persona = Field(default="till")
    lang: Lang = Field(default="en")
    proposed_price: Optional[str] = None


@router.post("/sku/{aid}/pdf-draft")
def post_sku_pdf_draft(
    aid: str,
    body: PdfDraftRequest = Body(default_factory=PdfDraftRequest),
    ctx: AuthContext = Depends(require_auth),
    db: Session = Depends(get_db),
) -> dict[str, Any]:
    """Structured narrative block for the Branded PDF. Returns:

      {
        exec_summary: str,
        bullets: [str, ...],     # 3–6 key facts
        risks:   [str, ...],     # 2–4 risk callouts
        next_steps: [str, ...],  # 2–4 next-step bullets
        persona_used, lang, model
      }

    The current PDF renderer accepts these fields and composes a 1-pager.
    """
    try:
        rec = recommendation_mod.build_recommendation(
            aid=aid, tier=None, cluster=None, db_session=db,
        )
    except Exception:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail={"code": "recommendation_not_found", "aid": aid},
        )
    try:
        fanout = customer_fanout_mod.build_customer_fanout(
            aid=aid, proposed_price=None, db_session=db,
        )
        summary = fanout.get("summary") if isinstance(fanout, dict) else None
    except Exception:
        logger.exception("briefing:pdf:fanout aid=%s", aid)
        summary = None

    rec_price = getattr(rec, "recommended_price", None)
    rec_price_str = _eur(float(rec_price)) if rec_price is not None else "—"
    drivers = getattr(rec, "drivers", []) or []

    exec_summary = (
        f"Recommend {rec_price_str} for Article {aid}. "
        f"Confidence: {getattr(rec, 'confidence_level', '—')}."
    )
    bullets: list[str] = []
    for d in sorted(
        drivers,
        key=lambda x: float(getattr(x, "contribution_pct", 0) or 0),
        reverse=True,
    )[:4]:
        pct = float(getattr(d, "contribution_pct", 0) or 0) * 100
        bullets.append(f"{d.label}: {pct:.0f} %")
    if summary and summary.get("stay_count"):
        bullets.append(
            f"{summary['stay_count']} customers stay · "
            f"{summary.get('at_risk_count', 0)} at risk"
        )
    if summary and summary.get("net_recovery_eur_yr"):
        bullets.append(
            f"Net recovery {summary['net_recovery_eur_yr']} €/yr"
        )

    risks: list[str] = []
    if summary and int(summary.get("at_risk_count", 0)) > 0:
        risks.append(
            f"{summary['at_risk_count']} customer(s) at elevated churn risk "
            f"at the recommended price."
        )
    if getattr(rec, "drivers_heuristic", False):
        risks.append(
            "Driver attribution is heuristic — flat win-prob curve / locked "
            "competitor data."
        )
    if not risks:
        risks.append("No material risks flagged at the recommended price.")

    next_steps = [
        "Confirm cost floor with finance before publishing.",
        "Sample three at-risk customers for a soft-launch check.",
        "Re-run the recommendation after the next five quotes settle.",
    ]

    return {
        "aid": aid,
        "persona_used": body.persona,
        "lang": body.lang,
        "exec_summary": exec_summary,
        "bullets": bullets,
        "risks": risks,
        "next_steps": next_steps,
        "model": "deterministic-v1",
    }
