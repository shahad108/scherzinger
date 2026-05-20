"""LLM scenario prompt parser (Phase 7, feature-flagged).

Converts an NL prompt like "What if steel goes up 10% and we pass through 60%?"
into a structured scenario inputs JSON. Strict JSON-schema validation
server-side prevents prompt injection from sneaking in unexpected fields.

The actual LLM call is stubbed for now — the parser uses a deterministic
regex-based fallback that handles the canonical Scherzinger phrasings.
A follow-up commit wires it to the Bedrock provider in services/ai_briefing.
"""
from __future__ import annotations

import re
from typing import Any


_PATTERNS = [
    # "steel goes up 10%"
    (re.compile(r"steel\s+(?:goes|going)?\s*up\s*(\d+(?:\.\d+)?)\s*%", re.IGNORECASE),
     "Steel S355", "market_series", "€/t", "pct", 1),
    # "steel down 5%"
    (re.compile(r"steel\s+(?:goes|going)?\s*down\s*(\d+(?:\.\d+)?)\s*%", re.IGNORECASE),
     "Steel S355", "market_series", "€/t", "pct", -1),
    # "pass through 60%"
    (re.compile(r"pass[-\s]*through\s*(?:of|at)?\s*(\d+(?:\.\d+)?)\s*%", re.IGNORECASE),
     "Pass-through %", "internal_lever", "%", "absolute", 1),
    # "EUR/USD drop 3%"
    (re.compile(r"(?:eur|euro)[/\s-]*usd[^a-z]*?(?:drops?|down|fall(?:s)?)\s*(\d+(?:\.\d+)?)\s*%", re.IGNORECASE),
     "EUR/USD", "market_series", "FX", "pct", -1),
    # "demand down 8%"
    (re.compile(r"demand[^a-z]*?(?:drops?|down|fall(?:s)?)\s*(\d+(?:\.\d+)?)\s*%", re.IGNORECASE),
     "Demand growth", "internal_lever", "%", "pct", -1),
    # "demand up 5%"
    (re.compile(r"demand[^a-z]*?(?:up|rise(?:s)?|grow(?:s|th)?)\s*(?:by\s*)?(\d+(?:\.\d+)?)\s*%", re.IGNORECASE),
     "Demand growth", "internal_lever", "%", "pct", 1),
    # "list price up 4%"
    (re.compile(r"list\s+price[^a-z]*?(?:up|uplift|rise)\s*(\d+(?:\.\d+)?)\s*%", re.IGNORECASE),
     "List-price uplift", "internal_lever", "%", "absolute", 1),
    # "alloys +6%"
    (re.compile(r"alloys?\s*([+\-]?\d+(?:\.\d+)?)\s*%", re.IGNORECASE),
     "Alloys", "market_series", "€/t", "pct", 1),
]


def parse_scenario_prompt(prompt: str) -> dict[str, Any]:
    """Return ``{ name, description, inputs }`` parsed from NL."""
    inputs: list[dict[str, Any]] = []
    for pattern, name, kind, unit, ptype, sign in _PATTERNS:
        for m in pattern.finditer(prompt):
            raw = float(m.group(1).replace("+", ""))
            value = raw * sign
            inputs.append({
                "name": name,
                "kind": kind,
                "unit": unit,
                "perturbation": {"type": ptype, "value": value},
            })
    # Deduplicate by name (keep last occurrence).
    by_name: dict[str, dict[str, Any]] = {}
    for inp in inputs:
        by_name[inp["name"]] = inp
    inputs = list(by_name.values())

    name = "AI scenario"
    if inputs:
        primary = inputs[0]["name"]
        name = f"AI · {primary} shift"
    return {
        "name": name,
        "description": f"Parsed from: {prompt}",
        "inputs": inputs,
    }
