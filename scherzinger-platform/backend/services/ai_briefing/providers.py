"""Phase 9 P9.T3 — briefing provider abstraction.

Switchable via the ``BRIEFING_PROVIDER`` env var:

    template  — deterministic, no LLM (default; ships in Phase 9)
    llm       — Anthropic-backed; requires ANTHROPIC_API_KEY + the optional
                ``anthropic`` and ``bleach`` packages

The LLM provider is fed a structured snapshot (KPIs, deltas, lost-quote
facts, top movers) plus a strict template; it returns sanitised HTML
paragraphs and a one-line signature. Output is sanitised via ``bleach``
(or a regex-based fallback when bleach isn't available) to a strict
allow-list.

Phase 13: when ANTHROPIC_API_KEY or the ``anthropic`` package is missing,
the LLM branch logs a warning and falls back to the template provider so
the system never raises in production.
"""
from __future__ import annotations

import logging
import os
import re
from typing import Any

from ._seed import load_seed
from .citations import annotate_paragraphs

logger = logging.getLogger(__name__)

# Strict allow-list for memo body HTML (Phase 13 P9.T3 contract).
_ALLOWED_TAGS = ("b", "i", "em", "strong", "br", "p", "span")


def draft_memo(*, scope: str, persona: str, lang: str | None) -> dict[str, Any]:
    provider = os.environ.get("BRIEFING_PROVIDER", "template").lower()
    if provider == "template":
        return _template(scope=scope, persona=persona, lang=lang)
    if provider == "llm":
        return _llm(scope=scope, persona=persona, lang=lang)
    raise ValueError(f"unknown BRIEFING_PROVIDER={provider!r}")


def _template(*, scope: str, persona: str, lang: str | None) -> dict[str, Any]:
    """Deterministic template provider. Today's body is the seeded memo so
    rendering is byte-equal to the canonical mock; later phases swap the
    raw template variables for live KPIs / deltas / lost-quote facts.

    Phase 13: ``lang`` selects the seed variant (``en`` falls back to the
    de-default seed when no en seed is shipped for a given block).
    """
    seed = load_seed(lang)
    memo = dict(seed["memo"])
    memo["scope"] = scope
    memo["persona"] = persona
    if lang:
        memo["lang"] = lang
    # Phase 10 — extract clickable citations per paragraph so the FE can
    # render a "Sources →" chip row beneath each one.
    memo["paragraphs"] = annotate_paragraphs(memo.get("paragraphs") or [])
    return memo


def sanitize_html(html: str) -> str:
    """Strip every tag/attribute outside the allow-list.

    Uses ``bleach`` when available; otherwise a regex fallback that drops
    everything but the allow-listed tags (no attributes preserved).
    """
    try:
        import bleach  # type: ignore

        return bleach.clean(
            html,
            tags=list(_ALLOWED_TAGS),
            attributes={},
            strip=True,
        )
    except ImportError:  # pragma: no cover - exercised only without bleach
        # Regex fallback: keep only the allow-listed tags, drop their attrs,
        # and strip everything else.
        allowed_re = "|".join(_ALLOWED_TAGS)
        keep_re = re.compile(
            rf"</?(?:{allowed_re})(?:\s[^>]*)?>", flags=re.IGNORECASE
        )
        # 1. Collect spans of allow-listed tags via a placeholder shuffle.
        placeholders: list[str] = []
        def _stash(m: re.Match[str]) -> str:
            tag = m.group(0)
            # Drop attributes — keep only `<tag>` or `</tag>`.
            stripped = re.sub(r"\s+[^>]*", "", tag, count=1)
            placeholders.append(stripped)
            return f"\x00{len(placeholders) - 1}\x00"

        with_holders = keep_re.sub(_stash, html)
        # 2. Strip every remaining angle bracket / other tag.
        cleared = re.sub(r"<[^>]*>", "", with_holders)
        # 3. Restore allow-listed tags.
        def _restore(m: re.Match[str]) -> str:
            return placeholders[int(m.group(1))]

        return re.sub(r"\x00(\d+)\x00", _restore, cleared)


def _structured_snapshot(*, persona: str, lang: str | None) -> dict[str, Any]:
    """The KPIs / deltas / lost-quote facts the LLM is grounded on."""
    seed = load_seed(lang)
    return {
        "persona": persona,
        "lang": lang or "de",
        "header": seed["header"],
        "previous_memo_paragraphs": [p["html"] for p in seed["memo"]["paragraphs"]],
        "side_cards": [
            {"title": c.get("title"), "kind": c.get("kind"), "tone": (c.get("tag") or {}).get("tone")}
            for c in seed["sideCards"]
        ],
    }


def _llm(*, scope: str, persona: str, lang: str | None) -> dict[str, Any]:
    """Anthropic-backed provider with graceful fallback.

    Behaviour:
      - Missing ANTHROPIC_API_KEY → fall back to ``_template`` with a warning.
      - Missing ``anthropic`` package → fall back to ``_template`` with a warning.
      - Anthropic call raises → fall back to ``_template`` with a warning.
      - Successful call → return the model paragraphs after running them
        through ``sanitize_html``.
    """
    api_key = os.environ.get("ANTHROPIC_API_KEY")
    if not api_key:
        logger.warning(
            "BRIEFING_PROVIDER=llm but ANTHROPIC_API_KEY is unset — "
            "falling back to template provider"
        )
        return _template(scope=scope, persona=persona, lang=lang)

    try:
        import anthropic  # type: ignore
    except ImportError:
        logger.warning(
            "BRIEFING_PROVIDER=llm but the 'anthropic' package isn't installed — "
            "falling back to template provider"
        )
        return _template(scope=scope, persona=persona, lang=lang)

    snapshot = _structured_snapshot(persona=persona, lang=lang)
    system_prompt = (
        "You write a Monday pricing briefing in the voice of a senior pricing "
        "manager. Output ONLY 3-4 short HTML paragraphs (use <p> + <b>). Do not "
        "include any other tags, scripts, or attributes. Keep claims grounded "
        "in the supplied snapshot."
    )
    if (lang or "").lower().startswith("en"):
        system_prompt += " Respond in English."
    else:
        system_prompt += " Antworte auf Deutsch."

    try:
        client = anthropic.Anthropic(api_key=api_key)
        msg = client.messages.create(
            model=os.environ.get("BRIEFING_MODEL", "claude-haiku-4-5-20251001"),
            max_tokens=800,
            system=system_prompt,
            messages=[
                {"role": "user", "content": f"Snapshot: {snapshot}\n\nWrite the briefing."},
            ],
        )
        # Concatenate text blocks.
        body = "".join(getattr(b, "text", "") for b in (msg.content or []))
    except Exception:  # pragma: no cover - network/transient
        logger.exception("Anthropic call failed — falling back to template provider")
        return _template(scope=scope, persona=persona, lang=lang)

    safe = sanitize_html(body)
    base = _template(scope=scope, persona=persona, lang=lang)
    paragraphs = [{"html": p.strip()} for p in re.split(r"</?p>", safe) if p.strip()]
    # Phase 10 — annotate the LLM output through the same citation pass
    # so /pricing /margin /action-center deep-links stay consistent.
    base["paragraphs"] = annotate_paragraphs(paragraphs)
    base["provider"] = "llm"
    return base
