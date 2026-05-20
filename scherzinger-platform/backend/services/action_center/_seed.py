"""Shared error type for Action Center block builders.

History: this module used to also expose ``load_seed`` which read
``backend/seeds/screens/action-center.json`` as a runtime fallback when
live data was missing. That seed-fallback path was removed in the Task 2
cleanup (docs/ACTION_CENTER_PLAN.md §4 iron rule 7): a block must
either return live data, an empty value (composer classifies ``empty``),
or raise :class:`ActionCenterBlockError` (composer classifies
``degraded``). It must never fabricate synthetic rows.

The file keeps its original name so existing intra-package imports
(``from ._seed import ActionCenterBlockError``) keep working without a
churn-only rename. New callers should import from this module by name.
"""
from __future__ import annotations


class ActionCenterBlockError(RuntimeError):
    """Raised when a block cannot produce trustworthy live data.

    The composer maps this exception to ``status: 'degraded'`` with the
    supplied ``reason`` string surfaced to the user. Do NOT raise this
    when the block is legitimately empty (e.g. cleared queue) — return
    an empty list / dict in that case so the composer emits ``empty``
    instead.
    """

    def __init__(self, block: str, reason: str):
        super().__init__(reason)
        self.block = block
        self.reason = reason
