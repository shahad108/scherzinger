---
name: Frank Action Center — design re-skin
status: draft
created: 2026-05-06T00:28:02Z
updated: 2026-05-06T00:28:02Z
---

# Frank Action Center — design re-skin

Apply the design language from `new test2/Pryzm Action Center.html` to the Frank PM Action Center inside `Pryzm_Dashboard_Mockup_Frank.html`, preserving all current Frank data, JS behavior, and persona logic.

## Goal

The Frank PM Action Center screen, the shared chrome (top bar, sidebar, right rail, drawer, toast), and Frank-only sections look pixel-close to `new test2/Pryzm Action Center.html`. All other screens (MD, SR, Forecast, Studio, Margin, Quotes, AI, MD-monthly, MD-beirat) are untouched in this round.

## Source files

- **Design source of truth:** `new test2/Pryzm Action Center.html` (single-screen, complete reference design)
- **Target file (single-file edit):** `Pryzm_Dashboard_Mockup_Frank.html`
- **Persona reference:** memory `project_pryzm_personas_vpc.md` — Frank is the Pricing Analyst / Head of Controlling, power user, deep workflows. He analyzes; outputs flow to Heiko (Sales) and Till (MD).

## Design tokens to adopt

Copy verbatim from the source file's `:root`:

```
--canvas:#dcdbd6  --shell:#eeece8  --surface:#ffffff
--surface-soft:#f6f4f0  --surface-sunken:#ecebe6
--ink:#15140f  --ink-2:#2c2a26  --ink-3:#56544f  --muted:#8a877f  --muted-2:#b3b0a8
--border:#e6e4de  --border-strong:#d6d3cc  --hairline:#eae8e2
--rose:#a35a5a  --rose-deep:#874646  --rose-soft:#c98989  --rose-tint:#f1dede  --rose-bg:#f8eded
--green:#2f7d5b  --green-bg:#e3efe6  --amber:#a5701f  --amber-bg:#f5ecd9
--red:#9a3232  --red-bg:#f1dcdc  --violet:#6d4ec5  --violet-bg:#ece4f6
--shadow-card --shadow-pop
--r-sm:8 --r:12 --r-md:14 --r-lg:18 --r-xl:24 --r-2xl:32
```

Fonts: `Manrope` (display 500–800), `Inter` (body 400–700) loaded from Google Fonts.

## Architecture / scoping strategy

- New tokens, shell, and PM-screen styles live in a **single new `<style data-theme="pryzm-2026">` block** appended near the end of the existing `<head>`. Higher specificity wins over the legacy block, so the legacy CSS stays in place and untouched in round 1. (Cleanup is a follow-up, out of scope.)
- All new selectors are scoped under `body.pryzm-2026` (added on `<body>`) so the new design only applies when that class is present. This makes rollback trivial: remove the class.
- The new chrome (topbar, shell with 240/1fr/320 grid, sidebar, right rail) replaces the existing chrome **only when `body.pryzm-2026` is present** — same DOM, restyled.
- Frank-only screen wrapper (`#screen-action-pm`) gets new section markup inside it. MD/SR sections remain in their current markup but are hidden by the existing persona switcher, so they don't visually interfere.

## Layout

```
.app
  .topbar            (logo, search-pill, add-person, notif-with-dot, lang, date-pill, dark Create CTA)
  .shell             (grid: 240px 1fr 320px, rounded-2xl shell with inset highlight)
    aside            (nav-items + Departments + data-status promo + user row + collapse toggle)
    main             (Frank PM content — see Sections)
    .rail            (notifications card, assigned reviewers, sections jump-list)
.drawer + .drawer-scrim   (re-skinned)
.toast                    (re-skinned)
```

## Sections in `main` (Frank PM, ordered)

| # | Section | New-design pattern | Data source (kept from current Frank) |
|---|---------|-------------------|----------------------------------------|
| 1 | Crumbs + page-head | `.crumbs` + `.page-head` (h1 34px) | `Cockpit / Pricing Analyst · Frank / Action Center`, `Good morning, Frank.`, Wk 18 · 1,313 records · 1,015 SKUs · 4 commodity groups |
| 2 | Movable revenue hero | `.hero-card` with `.hero-grid` (left: headline + 3-col split + bar + CTA; right: sparkline) — **compact 3-column split adopted as-is** | €3.88M / +9.2% vs Wk 17, €6.25M total, 62% movable, 628/1015 SKUs, €2.37M locked |
| 3 | Movable / Locked round cards | `.round-grid` of two `.round-card` | "Movable bucket" 808 SKUs · €3.88M open · BKAES leads / "Locked bucket" 207 SKUs · 18 contracts · earliest renew Q3 '26 · €2.37M |
| 4 | Today's analyst decisions | `.section-row` + `.actions-list` of `.action-card` rendered by JS from the existing actions data | Existing actions array (200832-E margin collapse, 204604 BKAGG, etc.). Action cards include rank, title, chips, 4-col meta grid, signal-with-trend block, feedback buttons, secondary + rose primary CTA |
| 5 | Model trust strip | `.trust-grid` of 4 `.trust-tile` with sparklines | 0.76 F1, <5% forecast error, 33 anomalies, 99.2% data coverage |
| 6 | Lost-quote margin differential | `.lq-card` with stats, bars, sig-pill, footnote, rose CTA | 70.6% / 72.4% / +1.8pp · p=0.006 |
| 7 | SKU pricing engine | `.sku-card` with `.frank-table` restyled | 6 existing SKU rows (200832-E, 204604, 205169, 200834-B, 201773, 205418-A) |
| 8 | Heterogeneous portfolio diagnostics | **Redesigned** as a card with new tokens — title row + `.heatmap` (recolored to rose/amber/green) + scorecard chips below using `.tag-chip` | Existing data |
| 9 | Long-tail coverage | **Redesigned** as 3 `.trust-tile`-style stat tiles + restyled stack-bar using `--rose / --amber / --muted` segments | 38% / 207 / 203 |
| 10 | Annual list-price negotiation cockpit | **Redesigned** as collapsible `.lq-card` style with `.signal-with-trend` for the trend chart, `.fact-list` for commodity trajectory, list for market direction | Existing |
| 11 | A/B Test Tracker | **Redesigned** as `.action-card`-style rows (rank, title, meta grid, status chip, primary CTA) | Existing 2 tests |
| 12 | Why we lose · rejection codes | **Redesigned** as `.actions-list` of compact `.action-card` rows ranked by revenue lost | Existing |
| 13 | Audit trail | **Redesigned** as a `.lq-card` containing a vertical timeline using hairline dividers + `.fact-row` styling | Existing 6 entries |
| 14 | Generate branded report | **Redesigned** as a `.round-card`-style card with rose primary CTA + secondary | Existing |

## JS behavior preserved

- `setScreen()`, persona switching (`data-persona`), `toast()`, drawer open/close, all Chart.js charts (`heroSpark`, `frankPriceTrend`, sparklines), `actions-list` rendering, `frankHideLocked` toggle, A/B promote, model-trust drawer.
- Chart palettes updated to use `--rose`, `--ink`, `--green`, `--amber`, `--red` tokens for visual cohesion.

## Right rail content (Frank-specific)

- **Notifications** (3): "PRO mode activated", "New SKU recommendation 205418-A entered A/B", "Phase deadline soon".
- **Assigned reviewers**: HM (Heiko), TI (Till), TH, NB, +5 — reflects Frank's cross-functional pricing panel.
- **Sections jump-list**: anchored to all 14 sections above with concise meta (`Movable revenue · €3.88M`, `Today's decisions · 3 ranked`, etc.).

## Out of scope (round 1)

- Other screens (forecast, studio, margin, quotes, ai, md-monthly, md-beirat, action-md, action-sr).
- Removing legacy Frank CSS / dead rules.
- Mobile/responsive tuning beyond the existing `@media` rules in the source design.
- Real charting changes beyond color tokens.

## Acceptance criteria

1. Loading the file with `body.pryzm-2026` (default for Frank) shows the Action Center matching the source design within reasonable visual tolerance at 1440px viewport.
2. Removing `pryzm-2026` from `<body>` reverts to the current look (rollback works).
3. All Frank PM data is present (no numbers lost). All 14 sections render.
4. Persona switcher still hides/shows MD and SR screens correctly.
5. All buttons/toasts/drawer interactions still function.
6. No console errors. Charts render.
7. Playwright screenshots at 1440 and 1920 widths look clean (no overlap, no overflow).

## Execution sequence (one subagent per task, sequential)

1. **T1 — Foundation.** Add `<style data-theme="pryzm-2026">` block with all tokens + shell + topbar + sidebar + right rail + drawer/toast restyle. Add `pryzm-2026` class to `<body>`. Wrap existing top bar/sidebar/main/rail in the new `.app > .shell` structure for the PM screen.
2. **T2 — Hero + round cards + page head.** Replace section 1–3 markup. Wire `heroSpark` Chart.js to new canvas with rose styling.
3. **T3 — Analyst decisions list.** Update `actions-list` JS renderer to emit new `.action-card` markup with rank, chips, 4-col meta, signal-with-trend, feedback buttons, dual CTA.
4. **T4 — Trust strip + lost-quote + SKU table.** Sections 5–7.
5. **T5 — Frank-only redesigned sections.** Sections 8–14 redesigned into new design patterns.
6. **T6 — QA pass.** Drawer + toast restyle verification, chart palette sweep, Playwright screenshots, fix any overflow/spacing issues.

Each task verified visually before next starts. All commits scoped to one task.
