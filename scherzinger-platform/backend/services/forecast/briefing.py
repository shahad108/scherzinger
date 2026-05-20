"""Forecast briefing export (Phase 7, extended in v2.2 Phase I).

Composes a one-page brief from current forecast state + active scenario +
methodology footer. Returns a synthetic ``report_jobs`` row receipt; the
real PDF/HTML rendering reuses the Phase 9 ``report_service`` infra.

v2.2 Phase I — briefing persona toggle (Manuel mode + German):

* ``persona`` selects the tone/length prompt pack:
    - ``manuel_1pager`` — terse one-page BU-lead summary, objective bullets,
      no jargon, one page max.
    - ``analyst_memo`` — full memo (preserves prior behavior).

* ``language`` selects the output language (``de`` | ``en``). German output
  keeps technical pricing terms in English (e.g. EBITDA, P50) but otherwise
  translates fully.

The prompt pack is selected by :func:`_select_prompt_pack` and is attached to
the returned receipt so downstream report renderers / tests can verify the
branch that fired without invoking an actual LLM client.
"""
from __future__ import annotations

import hashlib
from datetime import datetime, timezone
from typing import Any, Literal
from uuid import uuid4

Persona = Literal["manuel_1pager", "analyst_memo"]
Language = Literal["de", "en"]


def _select_prompt_pack(persona: Persona, language: Language) -> dict[str, Any]:
    """Return the LLM prompt-pack metadata for ``persona`` × ``language``.

    Kept local to the briefing module per the v2.2 plan. The returned dict is
    attached to the receipt so renderers / tests can assert the right branch
    was exercised. Pricing terms (EBITDA, P50, MAPE, FVA, …) are preserved
    across languages.
    """
    # Tone / length controlled by persona.
    if persona == "manuel_1pager":
        tone = "terse"
        length = "one_page"
        audience = "bu_lead"
        instructions = (
            "Write a one-page BU-lead summary. Objective bullets only. "
            "No jargon. Maximum one page. Lead with the headline number, "
            "then the three biggest movers, then one risk and one ask."
        )
    else:  # analyst_memo
        tone = "analytical"
        length = "full_memo"
        audience = "pricing_analyst"
        instructions = (
            "Write a full pricing-analyst memo. Cover methodology, drivers, "
            "scenario sensitivity, calibration, and recommended next moves. "
            "Cite assumptions inline."
        )

    # Language controls the output language. Pricing terms stay in English.
    if language == "de":
        language_directive = (
            "Antworte auf Deutsch. Behalte technische Pricing-Begriffe auf "
            "Englisch bei (z. B. EBITDA, P50, MAPE, FVA, Pareto, churn, "
            "list price, pass-through). Übersetze alle übrigen Inhalte."
        )
        preserved_terms = [
            "EBITDA",
            "P50",
            "MAPE",
            "FVA",
            "Pareto",
            "churn",
            "list price",
            "pass-through",
        ]
    else:
        language_directive = (
            "Respond in English. Use standard pricing-analyst terminology."
        )
        preserved_terms = []

    return {
        "persona": persona,
        "language": language,
        "tone": tone,
        "length": length,
        "audience": audience,
        "instructions": instructions,
        "languageDirective": language_directive,
        "preservedTerms": preserved_terms,
    }


def generate_briefing(
    *,
    user_id: str,
    scenario_id: str | None,
    output_format: str,
    recipient: str,
    persona: Persona = "analyst_memo",
    language: Language = "en",
) -> dict[str, Any]:
    """Returns a receipt the FE can render as a share confirmation.

    ``persona`` defaults to ``analyst_memo`` (preserves prior behavior).
    ``language`` defaults to ``en``. The endpoint layer applies the v2.2 UX
    default of flipping to ``de`` when persona = ``manuel_1pager``.
    """
    job_id = str(uuid4())
    ts = datetime.now(timezone.utc).isoformat()
    artifact_url = (
        f"/api/v1/reports/{job_id}.{output_format}"
        if output_format in ("pdf", "html")
        else f"/api/v1/reports/{job_id}.pdf"
    )
    audit_hash = hashlib.sha256(
        f"{user_id}{scenario_id or ''}{ts}{recipient}{persona}{language}".encode("utf-8")
    ).hexdigest()[:16]
    prompt_pack = _select_prompt_pack(persona, language)
    return {
        "jobId": job_id,
        "status": "queued",
        "format": output_format,
        "scenarioId": scenario_id,
        "recipient": recipient,
        "persona": persona,
        "language": language,
        "promptPack": prompt_pack,
        "createdAt": ts,
        "artifactUrl": artifact_url,
        "auditHash": audit_hash,
    }
