"""Shared error type for Pricing Studio block builders.

History: this module used to also expose ``load_seed`` which read
``backend/seeds/screens/studio.json`` as a runtime fallback when live
data was missing. That seed-fallback path was removed in Phase A3 of
the Pricing Studio hardening plan (`docs/PRICING_STUDIO_PLAN.md` §5
Phase A) — a block must either return live data, an empty value
(composer classifies ``empty``), or raise :class:`StudioBlockError`
(composer classifies ``degraded``). It must never fabricate synthetic
rows.

Mirrors :class:`backend.services.action_center._seed.ActionCenterBlockError`
intentionally — both screens share the same status-metadata contract.
"""
from __future__ import annotations


class StudioBlockError(RuntimeError):
    """Raised when a Studio block cannot produce trustworthy live data.

    The composer/workbench builder maps this exception to
    ``status: 'degraded'`` with the supplied ``reason`` string surfaced
    to the user. Do NOT raise this when the block is legitimately empty
    (e.g. no recommendations yet for this aid) — leave the field absent
    / return an empty list and the composer emits ``empty`` instead.
    """

    def __init__(self, block: str, reason: str):
        super().__init__(reason)
        self.block = block
        self.reason = reason
