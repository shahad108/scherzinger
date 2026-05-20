"""Realtime collaboration helpers (Pricing Studio v3 / Phase 5).

Currently only houses the ``collab`` channel used for cursor presence
and comment events on a proposal. In-process for v3 — a future phase
swaps in a Redis-backed channel without touching call sites.
"""
