"""Pricing engine v1.4 — production port of the notebook engine.

The math lives in sibling modules (churn_response, cost_demand, ltv,
scorer, monte_carlo, win_prob, conformal). `orchestrator.py` is the
thin adapter that pulls inputs from the production DB and returns a
JSON-serialisable recommendation packet.

Methodology reference: `docs/whitepaper/pryzm_pricing_methodology.tex`
"""
from .orchestrator import score_sku  # noqa: F401
