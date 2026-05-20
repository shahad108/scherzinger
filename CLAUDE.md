# CLAUDE.md — Agent Guidance for the Pryzm Repo

This file is read by Claude Code and other AI agents before they start
work in this repository. Keep it short. Link to the deeper docs.

## Design System

Always read `DESIGN.md` before making any visual or UI decisions.

All font choices, colors, spacing, border radii, motion rules,
component patterns (buttons, chips, drawers, popovers), and data
coherence rules are defined there. Do not deviate without explicit
user approval.

When reviewing UI code:
- Flag any code that uses `rounded-2xl` or `rounded-full` for buttons
  by default — the rule is rectangle, not pill.
- Flag any popover that doesn't have all three exits (X + Escape +
  click-outside).
- Flag any UI string that should be live engine output but is
  hardcoded placeholder copy.
- Flag any numeric "current price" or delta that disagrees with the
  same number elsewhere on the screen.
- Flag any AI slop patterns: purple/violet gradients on CTAs, three-
  column icon grid with colored circles, gradient backgrounds,
  decorative blobs, hover-flip cards.

## Pricing Engine

The current production engine is the v1.4 calibrated engine (see
`docs/whitepaper/pryzm_pricing_methodology.pdf` for the full
methodology). Activated behind `PRYZM_ENGINE_V2=on`. When working in
`scherzinger-platform/backend/services/pricing/` or `frontend-v2/src/
features/pricing-studio/`, read the whitepaper before making any
scoring or recommendation changes.

## Product Direction

Read `docs/PRODUCT_END_GOAL_AND_ROADMAP.md` before any plan/feature
work in this repo. It defines what Pryzm is and isn't.

## Frontend

The canonical frontend is `frontend-v2/` (React 19 + Vite 7 + Tailwind 4).
The legacy `frontend/` was retired 2026-05-20 — do not reintroduce it.

## Numbers Coherence Rule

If a number appears in two places on one screen, the two values must
agree. The hero showing €798 while the picker shows €837 is a bug,
not "different views of the same thing." Pick one canonical source
(engine_v2 when active) and pipe it through every surface. See
DESIGN.md §12 for the enforced pattern.
