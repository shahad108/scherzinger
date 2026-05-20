# Frank Pricing Studio — Re-skin Plan

**Goal:** Re-skin `#screen-studio` to the Pryzm 2026 design language. Preserve all data, JS, charts, drawer, memo, etc.

**Reference:** `project_pryzm_design_language.md` memory + Frank Action Center / Forecast as reference impls in same file.

**Layout overview:** Pricing Studio is a 2-column workbench: left rail = SKU picker (filters + list), right = workbench with hero + 5 price options + 2-pane body (customer fan-out + cost/history) + comparable-cluster panel + decision footer + memo.

**Scoping:** All new CSS scoped under `body.pryzm-2026 #screen-studio`.

---

## Task PS1: Page head + ws-grid + ws-picker (left rail)

**Files:** `Pryzm_Dashboard_Mockup_Frank.html` style block + `#screen-studio` page-head + ws-picker

- Replace page-head with new `.crumbs + .page-head + .page-sub` pattern. h1 "Pricing Studio". Sub-pills: "SKU pricing workbench", "Predictive Portfolio Pricing". Sub-stats: "10 SKUs flagged", "BKAES leads". head-actions: head-pill links to Action Center / Forecast / Quotes & Guardrails (using `setScreen()`).
- Add scoped CSS for `.ws-grid` (grid: 320px 1fr, gap 14px), `.ws-picker` (lq-card-style left rail), `.ws-picker-head`, `.ws-count`, `.ws-filters` (segmented head-pill row), `.ws-filter` (head-pill style with `.active` rose-bg + ink, others surface), `.ws-list`, `.ws-row` (flex card-on-card, hover surface-soft, .active rose-bg + rose-tint border), `.ws-aid` (mono bold), `.ws-marg` (lo red / mid amber / hi green), `.ws-desc`, `.ws-tag` (chip: floor=red, stale=amber, cost=amber, frame=violet, new=blue), `.ws-clu` (cluster-chip variant), `.ws-locked`.
- Replace existing ws-picker markup (preserve all data attributes `data-aid`, `data-flag`, `data-cluster`, `data-conf`, `data-locked`, `data-new` and all 13 row entries verbatim). Reuse the same JS click handlers (already wired).

Verify: load file, switch to PM persona then Pricing Studio. Left rail renders with rose-active first row (200832-E), filter chips at top, 10 visible SKU rows. Click "New SKUs" filter — 3 new-SKU rows appear. No console errors. Take screenshot `studio-ps1.png`. Commit: `frank-redesign: PS1 studio page head + ws-grid + picker rail`.

---

## Task PS2: ws-hero + ws-options (price options grid)

**Files:** `Pryzm_Dashboard_Mockup_Frank.html` style block + `#screen-studio` ws-bench top section

- Add scoped CSS for `.ws-bench` (no special styling — flex column gap 14px), `.ws-hero` (dark ink card matching `.btn-dark` aesthetic — background `var(--ink)`, color `#fff`, padding 24px 28px, border-radius `var(--r-md)`, with grid for left text + right huge numeric), `.ws-hero-eyebrow` (uppercase muted on dark), `.ws-hero h3` (Manrope 22px white), `.ws-hero-sub` (white 13px line-height 1.6), `.ws-hero-chips` (already inline in markup — minor token swap), `.ws-hero-meta` (white opacity .8 small), `.ws-hero-num` (right-aligned column), `.ws-cur` (Manrope 48px white tabular), `.ws-marg-now` (delta pill: bad=red-bg+red-deep, good=green-bg+green), `.ws-target` (small white).
- Add scoped CSS for `.ws-options-head` (flex justify-between with h4 + sub), `.ws-opts-sub` (muted small with link button), `.ws-options` (grid 5 cols equal, gap 10px; on smaller widths, wrap to 3+2), `.ws-opt` (button: surface white card, border, padding 14px 16px, flex column gap 6px text-align left, transition; hover border-strong + shadow-pop; .active = ink border 2px + rose subtle bg, .hold = neutral, .custom = dashed border, .abtest = violet-bg + violet-deep text), `.ws-opt-lab` (uppercase eyebrow muted), `.ws-opt-price` (Manrope 22px ink), `.ws-opt-delta` (small ink-3), `.ws-opt-impact` (small bold; .neg = red, default green), `.ws-opt-risk` (xs muted), `.ws-custom-input` (inline pill with €+input), `.link-btn` (rose-deep bold link).
- Replace existing `.ws-hero` and `.ws-options-head` + `.ws-options` markup. Preserve all IDs (`wbTitle`, `wbSub`, `wbHeroChips`, `wbMeta`, `wbCur`, `wbMargNow`, `wbTargetTxt`, `wbHoldPrice`, `wbHoldImpact`, `wbFloorPrice`, `wbFloorDelta`, `wbFloorImpact`, `wbFloorRisk`, `wbMarketPrice`, `wbMarketDelta`, `wbMarketImpact`, `wbMarketRisk`, `wbCustomInput`, `wbCustomDelta`, `wbCustomImpact`, `wbCustomRisk`) and all `data-opt` attributes. Hero chips can keep their inline styles but swap colors to use ink-3 / rose-bg / violet-bg / amber-bg tokens.

Verify: hero renders dark, 5 price option cards in a row (Hold / Cost-floor active / Market anchor / Custom / 🧪 A/B), click each opt → active state moves. Take screenshot `studio-ps2.png`. Commit: `frank-redesign: PS2 studio hero + price-options`.

---

## Task PS3: ws-body (fan-out + cost/history) + comparable-cluster + explainability drawer

**Files:** `Pryzm_Dashboard_Mockup_Frank.html` style block + ws-body and supporting markup

- Add scoped CSS for `.ws-body` (grid 1fr 1fr gap 14px), `.ws-pane` (lq-card style), `.ws-pane h4` (Manrope 14.5px ink), `.ws-pane-sub` (muted small inline), `.ws-fanout` (flex column gap 6px), `.ws-fan-row` (grid 18px 1fr 90px 80px 1fr gap 10px, padding 8px 10px, border-radius 8px, font-size 12px; .alert = rose-bg, .warn = amber-bg, default = surface-soft), `.ws-fan-cust` (b ink + sub muted block), `.ws-fan-num` (Manrope 14px ink + small muted block), `.ws-fan-churn` (number + label stacked, .n.r = red 700, .n.g = green 700, .l muted xs), `.ws-fan-rec` (small rose-deep), `.ws-fan-note` (muted small footer).
- For cost composition: `.ws-cost` (gap 6px), `.ws-cost-row` (grid 80px 1fr 40px), `.ws-cost-name` (small ink-2), `.ws-cost-bar` (h 8 surface-sunken radius 4 overflow hidden), `.ws-cost-fill` with material=rose, labor=ink-3, outsourcing=amber, overhead=muted-2. `.ws-cost-pct` (small bold ink, tabular). `.ws-cost-foot` (small muted with link).
- For history: `.ws-history` (column gap 4px), `.ws-hist-row` (grid 80px 1fr 80px 1fr gap 10px, font 12px ink-3, padding 6px 0, border-top hairline), `.ws-hist-date` (mono ink), `.ws-hist-move` (b ink), `.ws-hist-vol` (.up green / .down red / .flat ink-3), `.ws-hist-by` (small muted with code).
- Inline 4-yr cost trajectory svg block: keep markup but swap stroke colors `#dc2626` → `var(--rose)` and `#1e3a8a` → `var(--ink)`.
- Comparable-cluster panel `#wsComparablePanel`: replace inline-styled inner markup with new `.lq-card` containing 3 `.trust-tile`-style cards (Target SKU / Cluster benchmark / Suggested price band) + tag-chip row for other new SKUs.
- Explainability drawer `#explainDrawer`: restyle outer to use `.lq-card`-like white surface with rose-deep header bar instead of `#1e3a8a`. Inline `<style>` block inside `#explainDrawer` keeps its `.explain-*` classes but swap `#1e3a8a` → `var(--rose)` and `#6d28d9` → `var(--rose-deep)`.

Verify: Body shows 2-column pane (fan-out + cost), 6 fan-out rows with colored backgrounds, cost bars colored by category, history rows below. Click "🔍 Why this price?" link → drawer opens with rose header. Take screenshot `studio-ps3.png` (and `studio-ps3-drawer.png` with drawer open). Commit: `frank-redesign: PS3 studio body fan-out + cost + comparable + drawer`.

---

## Task PS4: ws-decision + ws-memo + cross-links + studio QA pass

**Files:** `Pryzm_Dashboard_Mockup_Frank.html` style block + decision/memo/cross-links + final QA

- Add scoped CSS for `.ws-decision` (lq-card style), `.ws-decision-summary` (line-height 1.7 ink-3, b ink), `.ws-decision-controls` (grid 2 cols gap 8px font 12.5px ink-2), `.ws-decision-controls label` (flex align-center gap 8px), `.ws-decision-buttons` (flex gap 8px wrap; primary = btn-primary-rose; dark = btn-dark; default = btn-secondary).
- For memo: `.ws-memo` (lq-card style), `.ws-memo-head` (flex align-center gap 8px), `.ws-memo-title` (b ink), `.ws-memo-edit` (muted xs italic), `.ws-memo-body` (font 13px ink-3 line-height 1.7, p+p margin-top 10px, b ink, code rose-deep mono).
- Replace markup for `.ws-decision` and `.ws-memo` blocks. Preserve all IDs (`wbDecPrice`, `wbDecAid`, `wbDecMargin`, `wbDecRecovery`, `wbDecRisk`, `wbAbToggle`, `wbMemoBody`) and all onclick handlers.
- Cross-links footer: replace with `.lq-card` thin row containing 4 head-pill buttons (Action queue, Cluster forecast, Approval flow, Margin trajectory).
- Studio QA: switch persona PM → MD → SR → PM. Switch screens. Test SKU picker click → workbench updates (existing JS handles `wsRowClick`). Click each price option → active toggles. Click "🔍 Why this price?" → drawer opens. Click "Push to quoting" → toast. No console errors. Screenshots at 1440 viewport + bottom + at 1920 viewport. Files: `studio-1440-viewport.png`, `studio-1440-bottom.png`, `studio-1920-viewport.png`.
- Commit: `frank-redesign: PS4 studio decision + memo + cross-links + QA`.
