# Phase 2.5 Visual Audit

Side-by-side parity check between the Frank reference mockup and the rebuilt
`frontend-v2` shell after Tasks 1–6.

## Capture targets (1440×900 viewport)

| File | Source | Notes |
| --- | --- | --- |
| `mockup-action.png` | `http://localhost:8765/Pryzm_Dashboard_Mockup_Frank.html` | Run `setScreen('action')` in DevTools console first. `body.pryzm-2026` is auto-applied. |
| `mockup-margin.png` | `http://localhost:8765/Pryzm_Dashboard_Mockup_Frank.html` | Run `setScreen('margin')` in DevTools console first. |
| `v2-action.png` | `http://localhost:5174/action-center` | Vite dev server (port 5174). |
| `v2-margin.png` | `http://localhost:5174/margin` | Vite dev server (port 5174). |

The parent controller will run the headless capture via Playwright MCP.

## Visual parity criteria (Step 6.6)

Compare each pair against these six criteria:

1. **Canvas color** — warm grey (`--canvas: #cdd5de`), not white.
2. **Rounded shell** — `pz-shell` card with `border-radius: var(--r-2xl)` and the
   inset highlight + drop shadow stack.
3. **Top bar** — logo / search pill / Add person / Notifications (with rose dot) /
   More / persona switcher / EN / date pill / Create CTA (8 controls).
4. **Sidebar** — Workspace label, 6 nav items + Settings, Departments with 3 swatches,
   "Data fresh" promo card, Frank Keller user card.
5. **Right rail** — 3 notifications (PRO mode / SKU / Phase deadline), Assigned
   reviewers card with avatar stack, Sections list (5 entries).
6. **Hero accent** — Action Center "Movable revenue" sparkline now renders in
   steel-rose (`--rose-soft` stroke + gradient, `--rose` endpoint dot), not the
   former emerald `#34d399` / coral `#fb7185`.

## Sign-off

- [ ] mockup-action ↔ v2-action
- [ ] mockup-margin ↔ v2-margin
- [ ] All six criteria pass

Failures are logged as Phase 2.5 follow-up issues; not fixed in this commit.
