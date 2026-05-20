# Pryzm Design System — 2026

Canonical reference for every visual decision in the Pryzm pricing-decision
cockpit. The source of truth for **what we do and don't ship**. Read this
file before writing any UI code. Every claim in this document is enforced
in `frontend-v2/src/styles/tokens.css`, `frontend-v2/src/styles/globals.css`,
and the reference implementation in `Pryzm_Dashboard_Mockup_Frank.html`.

> Bake into your reflexes: rounded rectangle by default, hairline borders,
> warm-cool neutral surface, steel-blue rose accent, Manrope display +
> Inter body, no AI slop, no decorative gradients, no purple buttons.

---

## 1. Product Context

- **What this is:** Pryzm is an AI pricing-decision cockpit for industrial
  manufacturers. Frank (Pricing Analyst) opens it Monday morning, sees the
  highest-value actions, drills into one SKU in the Pricing Studio,
  accepts or escalates, and the audit trail captures the rationale.
- **Who it's for:** B2B pricing analysts, sales KAMs, and managing directors
  at industrial portfolios (10–200 SKUs in the daily work surface,
  1,000–10,000 in the catalog).
- **Space/industry:** Industrial pricing software (peers: Pricefx, Zilliant,
  Vendavo, PROS, Conga). Pryzm differentiates by being explicitly
  decision-oriented and explainable rather than a generic dashboard.
- **Project type:** Data-dense decision web app with a marketing-quality
  Action Center, a workbench-style Pricing Studio, and a memo/proposal
  flow with PDF export.

## 2. Aesthetic Direction

- **Direction:** Warm-modernist data tool. Neutral canvas, restrained
  accent, generous hairline borders, dense but breathing. Closer to a
  high-end financial newspaper than a SaaS dashboard.
- **Decoration level:** Minimal. Typography and surface hierarchy do
  the work. No gradients, no decorative blobs, no rounded-2xl
  everything, no glow effects.
- **Mood:** Frank's cockpit feels like the front page of a respected
  trade journal that happens to be interactive — serious, clear,
  trustworthy. Decisions read as decisions, not as marketing.
- **Reference implementation:** `Pryzm_Dashboard_Mockup_Frank.html`
  (the source of truth for components). Frontend implementation:
  `frontend-v2/`.

## 3. Typography

- **Display / Hero:** `Manrope` (Google Fonts, weights 500–800). Used
  for h1–h5, big numerics (prices, KPI tiles), the "Pricing Studio"
  page title, and tag-chip uppercase tracking.
- **Body / UI:** `Inter` (Google Fonts, weights 400–700). Used for
  paragraph copy, button labels, form inputs, table cells.
- **Data / Tables:** Same Inter, with `font-variant-numeric: tabular-nums`
  applied to any numeric column. Never use proportional digits in
  data tables.
- **Code (rare — lineage refs, IDs):** `JetBrains Mono`.
- **Loading:** Google Fonts via `<link>` in `index.html`. Self-hosting
  is acceptable but not required for v2.
- **Default size:** body 13.5px / 1.5 line-height / -0.005em letter-spacing,
  antialiased. Display headings -0.022em letter-spacing, 700 weight.
- **Modular scale:**
  - h1 / hero price: 40px / 700 / -0.03em / Manrope
  - h2 / section title: 24px / 700 / -0.022em / Manrope
  - h3 / card title: 16px / 700 / Manrope
  - h4 / eyebrow uppercase: 11.5px / 700 / 0.06em-0.08em tracking / Inter or Manrope
  - body: 13.5px / 1.5 / Inter
  - micro / chip / cell: 11.5–12px / 500–600 / Inter

**Font blacklist (NEVER recommend, EVER):** Papyrus, Comic Sans, Lobster,
Impact, Jokerman, Bleeding Cowboys, Permanent Marker, Bradley Hand, Brush
Script, Hobo, Trajan, Raleway, Clash Display, Courier New (for body).

**Banned for Pryzm (use only if explicitly approved):** Inter as a display
font (use Manrope), Poppins, Montserrat, Lato. They feel generic-SaaS
and dilute the editorial mood.

## 4. Color

- **Approach:** Restrained. Two hues do all the work — warm-cool neutrals
  (`--canvas` through `--ink`) carry structure; a single steel-blue rose
  carries primary actions and lineage. Semantic colors (green, amber, red,
  violet) appear only in chips, dots, and the hero margin rectangle —
  never as decorative fills.
- **Brand — steel-rose (NOT pink):**
  - `--rose: #5a7da3` — primary brand fill (CTA, lineage, hero price).
  - `--rose-deep: #3e5d80` — hover state.
  - `--rose-soft: #9eb6ce` — secondary tint for low-emphasis surfaces.
  - `--rose-tint: #dde7f1` — for ribbons and confidence-band fills.
  - `--rose-bg: #edf3f9` — soft tint (active rail rows, primary chips).
  - `--rose-border: #c5d4e3` — focus rings, soft chip outlines.
- **Surface stack (light, warm-cool):**
  - `--canvas: #cdd5de` — page background behind the shell.
  - `--shell: #eef1f5` — the rounded card that holds the app.
  - `--surface: #ffffff` — cards, drawers, modals.
  - `--surface-soft: #f3f5f8` — inset panels, sub-stat pills,
    signal-with-trend background.
  - `--surface-sunken: #e7eaef` — sub-pills, chips, ac-rank squares,
    grey-circle avatars.
  - `--surface-overlay: rgba(15, 20, 28, 0.4)` — drawer backdrop.
- **Ink (text):**
  - `--ink: #101418` — primary body text (NOT pure black, NOT
    `#000`). Use this for the dark CTA background too.
  - `--ink-2: #1f2530` — slightly lighter body.
  - `--ink-3: #4a5360` — eyebrow / secondary text.
  - `--muted: #64748b` — tertiary text. **Note (WCAG AA):** deepened
    from `#7d8693` to meet 4.5:1 vs `#fff`. Don't go lighter.
  - `--muted-2: #aab2bd` — dividers, very low-emphasis labels.
- **Borders:**
  - `--hairline: #eaedf1` — internal dividers, table rules.
  - `--border: #dde1e7` — card outlines.
  - `--border-strong: #c8cdd4` — emphasis outlines, active card.
- **Semantic palette (softened, never neon):**
  - Success: `--green: #2f7d5b`, bg `--green-bg: #e3efe6`, border
    `--green-border: #b9d4c3`, deep `--green-deep: #1f5a40` (for small
    text on green-bg per WCAG).
  - Warning: `--amber: #a5701f`, bg `--amber-bg: #f5ecd9`, border
    `--amber-border: #e0caa3`, deep `--amber-deep: #6f4a14`.
  - Error: `--red: #9a3232`, bg `--red-bg: #f1dcdc`, border
    `--red-border: #d8a9a9`.
  - Info / accent: `--violet: #6d4ec5`, bg `--violet-bg: #ece4f6`.
  - Use the SOLID dot for status indicators, not the bg fill. The bg
    fill is reserved for icon squares and the hero "+x.x%" rectangle.
- **Dark mode:** not in v2 scope. If/when added: redesign surfaces from
  scratch, drop saturation 10–20%, don't algorithmic-invert.

## 5. Spacing

- **Base unit:** 4px. All multiples land on this grid.
- **Density:** Comfortable. Frank's pages are dense (a lot of data per
  screen) but never claustrophobic — generous internal padding inside
  cards, tight chip padding, hairline dividers between rows.
- **Scale:**
  - 2xs: 2px (chip inner gap)
  - xs: 4px (icon-to-label gap, dot-to-text)
  - sm: 8px (compact gap, intra-card row gap)
  - md: 16px (card internal padding, button column gap)
  - lg: 24px (between card sections, section header to body)
  - xl: 32px (between top-level sections on a page)
  - 2xl: 48px (page top margin, hero block separator)
  - 3xl: 64px (rare — used for large empty states only)

## 6. Layout

- **Approach:** Grid-disciplined for the workbench, lightly editorial
  for the Action Center hero. The app lives inside a single rounded
  shell on a `--canvas` page, with a fixed left nav and a workbench
  main panel. Tables and KPI strips align to the same 12-column rhythm.
- **Grid:** 12 columns, 16px gutters, 24px outer padding inside the shell.
- **Max content width:** 1440px for the shell. The shell hugs at narrower
  viewports.
- **Border radius (CRITICAL — never default to `rounded-2xl`):**
  - Cards (hero, round, action, lq, sku, trust): `14` (`--r-md`)
  - signal-with-trend, notif row, sec-row: `11`
  - `btn-act` (dark CTA with arrow): `11`
  - `btn-primary-rose`, `btn-secondary`, head-pill, date-pill: `12`
  - Decision rank, ac-tools, grip, notif-ic: `9–11`
  - `btn-primary` (dark, no arrow): `8` (Tailwind `rounded-lg`)
  - Chips (`tag-chip`), sub-pill, sub-stat: `7`
  - Topbar pills (search, persona, lang): `9999` (full pill) — these ARE
    the only pills in the system, by design
  - Topbar logo, `persona-active` inner: `11`
  - **The default answer for "should this button be a pill or a
    rectangle?" is RECTANGLE.** The only fully-round things are:
    avatar circles, status dots, topbar search/persona/lang/notification
    icon buttons.

## 7. Motion

- **Approach:** Minimal-functional. Motion exists to confirm a state
  change (a drawer slid in, a row updated, a value tweened to its new
  position). It never decorates.
- **Easing:**
  - Enter (drawers, popovers, dropdowns): `cubic-bezier(0.16, 1, 0.3, 1)`
    (ease-out, spring-feel, never bouncy)
  - Exit: `ease-in`, slightly faster than enter
  - State move (tween counters, slider): `ease-in-out`
- **Duration:**
  - Micro (hover, focus ring): 50–100ms
  - Short (chip toggle, dropdown open): 150–250ms
  - Medium (drawer in/out, modal): 250–400ms
  - Long (tween big numbers, never UI chrome): 400–700ms
- **What we don't do:** scroll-jacking, parallax, decorative
  scroll-driven animations, hover-flip cards, animated gradients,
  any motion that survives `prefers-reduced-motion: reduce`.

## 8. Components — Buttons

- **Dark CTA (`btn-primary` in mockup):** `#101418` background (NOT
  `#000`, NOT `var(--ink)` — those are darker than the spec). White
  text 12.5px / 600 weight. Padding `9/14`. Radius `8`. Hover →
  `#252a33` (action strip) or `#000` (page-level). Arrow icon `11×11`
  when used as `btn-act`.
- **Dark with-arrow CTA (`btn-act`):** Same `#101418`, but height 36,
  padding `0/16`, radius `11`, gap `12` between text and arrow, font
  weight medium (NOT semibold). Used on bucket round-cards and the
  Decision Footer.
- **Primary rose (`btn-primary-rose`):** `var(--rose)` bg, white 13px /
  600. Radius `12`. Padding `11/18`. Hover → `var(--rose-deep)` with a
  soft glow shadow `0 6px 16px -8px rgba(90, 125, 163, 0.55)`. Always
  paired `flex: 1` with `btn-secondary` in a 50/50 horizontal pair on
  decision cards.
- **Secondary outlined (`btn-secondary`):** white bg, `1px solid
  var(--border)`, radius `12`, padding `11/18`, font medium 13 ink.
  Hover bg `#f7f9fb`. Never `var(--surface-soft)` on hover — too dark.
- **Tertiary / ghost:** transparent bg, ink-3 text, hover `--surface-soft`
  with `var(--hairline)` border. Use for low-emphasis verbs (Cancel,
  Snooze, Dismiss).
- **Icon-only buttons:** Always have an `aria-label`. Default size 32px
  square, radius `9`, bg `--surface-sunken` (or transparent if inline).
- **Forbidden:** gradients on any button, colored shadows except the
  steel-rose glow, fully-rounded primary buttons, all-caps button labels
  (chips and eyebrows do that, not buttons).

## 9. Components — Chips, Pills, Tags

- **Tag chip (`tag-chip`):** Radius `7`, padding `5/9`, font 11.5px /
  500. Surface-sunken bg by default; status variants use the matching
  bg token (e.g. `--green-bg`).
- **Sub-pill / sub-stat:** Same shape as tag-chip but `--surface-soft`
  bg.
- **Status dot:** 8px circle, solid fill of the semantic color. Used in
  rails to indicate Movable/Locked/A-B status. Never use the bg fill
  alone for status — always the solid dot.
- **Pill (fully-rounded):** ONLY topbar persona/search/lang/notifications
  and avatar circles. Nothing else.

## 10. Components — Cards, Drawers, Popovers

- **Cards:** white bg, `var(--shadow-card)`, radius `14` (`--r-md`),
  internal padding 24px (lg), 16px (md), 12px (compact). Hairline
  borders only — never thick borders.
- **Drawer (`<Drawer>` in `frontend-v2/src/components/ui/Drawer.tsx`):**
  Right-side, 480–560px wide, Radix Dialog under the hood. **Always**
  has a built-in X close button (top-right, 16px X icon,
  `aria-label="Close"`), backdrop `var(--surface-overlay)`, and Escape
  to close. Never build a drawer without these three exits.
- **Popover:** Absolutely positioned, `var(--shadow-pop)`, radius 10,
  border `1px solid var(--hairline)`. **Must have:** an explicit close
  affordance (X button OR a Cancel button), an Escape-key listener,
  AND a click-outside-to-close listener. **Three exits, not fewer.**
  See `frontend-v2/src/features/pricing-studio/components/DecisionFooter.tsx`
  Branded-PDF popover for the canonical pattern.
- **Modal (full overlay):** Use only when blocking is genuinely required
  (destructive confirm). Has X close + Escape + click-outside. Preserves
  scroll position behind it.

## 11. Components — Memo, Recommendation Hero, Workbench

- **Recommendation hero card:** big rose price (40px Manrope), inline
  delta chip (12px tabular-nums), "Today €X" sub-line, single inline
  "Why this price?" expander. **Never two CTAs to the same lineage** —
  the price itself is a button, the expander expands rationale inline.
  The historical "Why this price?" pill in the top-right was removed
  2026-05-19 because it duplicated the expander.
- **Memo callouts (`RationaleMemo`):** wording must be **conditional on
  the sign of the underlying number**. Never hardcode the comparator
  word ("exceeds", "is below"). When net loss exceeds recovery, flip
  the headline to "Review required at €X" with a rose warning
  treatment. Hardcoded "exceeds" was the v1.0 bug; the rule is now
  enforced in code and codified here.
- **Price option cards (HOLD, COST-FLOOR, MARKET-ANCHOR, CUSTOM):**
  The CUSTOM card MUST replace its placeholder text with **live engine
  output** as the user types — debounced 350ms call to
  `/pricing/v2/score_at_price`. Never ship the card with hardcoded
  strings like "€recovery · per-unit" or "churn risk modelled on
  commit"; those are the v1.0 lie.

## 12. Data Coherence Rules (NEW v1.4 — never regress)

- **One source per number.** If the picker shows "€837 → €901 (+7.6%)"
  and the hero says "€900.52 · Δ +12.8%", that's a bug — they must
  agree. Every surface that renders a "current price" must read from
  the same canonical source (engine_v2.current_price when the flag is
  on, falling back to PriceState.current_price otherwise). See
  `frontend-v2/src/features/pricing-studio/index.tsx` for the override
  pattern and `backend/services/studio/composer.py` for the BFF
  override.
- **Engine version visible.** When `PRYZM_ENGINE_V2=on`, surface an
  "Engine v1.4 · calibrated · k=1.179" badge on the SimulationDrawer
  banner so the user can see which engine produced the recommendation
  on screen. Without this badge the v2 promotion is invisible and the
  user assumes legacy.
- **Locked vs Pilot vs Live:** Lockable data sources (competitor signal,
  ERP push, contract & rebate status, per-customer WTP) render as
  amber-bordered cards with a 🔒 prefix and a "Unlocks when …" hint.
  Pilot features render as a violet "Pilot" pill. Live data is
  unmarked. Never silently render synthetic data without one of these
  three labels.
- **Confidence labels.** Every numeric recommendation carries
  `confidence: low | medium | high` from the engine. Surface as a chip
  next to the headline number. Below 80% `P(score>0)` from the Monte
  Carlo band, the recommendation surfaces as "Review required" not
  "Accept".

## 13. Decisions Log

| Date | Decision | Rationale |
|------|----------|-----------|
| 2026-05-06 | Pryzm 2026 design language adopted for v2 | Greenfield rebuild at `frontend-v2/`, Frank Action Center is reference impl. |
| 2026-05-07 | Steel-blue rose (`#5a7da3`) replaces warm rose (`#a35a5a`) | Earlier warm rose read as pink in dense data screens; steel-blue holds up at small chip sizes and pairs with the warm-cool neutral surface. |
| 2026-05-07 | Strict radius scale (7/8/11/12/14) | Earlier Tailwind defaults (`rounded-2xl`, `rounded-full`) produced overly-round buttons and mismatched chips. The scale matches the Frank mockup 1:1. |
| 2026-05-19 | Drop duplicate "Why this price?" pill on hero | Two CTAs to the same lineage on `RecommendationHero`. Inline expander wins; the price itself remains clickable. |
| 2026-05-19 | All popovers must have X + Escape + click-outside | Branded-PDF picker had only click-outside, which was unfindable. Three exits is the rule. |
| 2026-05-19 | `RationaleMemo` wording conditional on net sign | Hardcoded "exceeds" was a lie when net was negative. Now picks "exceeds" / "is below" and swaps to a "Review required" warning state when loss > recovery. |
| 2026-05-19 | Custom card live engine preview (debounced 350ms) | Placeholder strings "€recovery · per-unit" were not real numbers. Replaced with live `/pricing/v2/score_at_price` output. |
| 2026-05-19 | Engine v2 packet attached to workbench BFF behind `PRYZM_ENGINE_V2` flag | Default-off rollout; v0 picker behaviour preserved for non-beta tenants. |
| 2026-05-20 | One canonical "current price" source per UI region | Picker (€837) and hero (€798) disagreed. All surfaces now read from `engine_v2.current_price` when the flag is on. |
| 2026-05-20 | Picker margin chip reads from `engine_v2.current_price` too | Closes the last coherence gap so picker meta, picker margin, hero price, hero delta, and hero "Today €X" all derive from the same baseline. |
| 2026-05-20 | DESIGN.md formalized as the single canonical source | Earlier rules lived in two memory files + tokens.css + globals.css + Frank mockup. Now one file, one read. |
