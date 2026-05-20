"""Phase 12 — Till + Heiko persona overview composers.

These are intentionally read-only — neither persona mutates state from
their landing page. Both read existing tables (pricing_proposals,
recommendations, ab_tests, notifications, customer_risk_score) so
nothing new is invented for the screen.
"""
from .composer import build_md_overview, build_deal_inbox

__all__ = ["build_md_overview", "build_deal_inbox"]
