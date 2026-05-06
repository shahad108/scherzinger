# Frank Margin Intelligence — Re-skin Plan

**Goal:** Re-skin `#screen-margin` (lines ~4703–5216) to Pryzm 2026 design language. Preserve all data, charts (`waterfallChart`, `costPriceChart`, `recoveryChart`), tabs, briefing memo, and JS handlers.

**Reference:** `project_pryzm_design_language.md` memory + Action Center / Forecast / Studio re-skin as reference impls.

**Scoping:** All new CSS scoped under `body.pryzm-2026 #screen-margin`.

---

## Task M1: Page head + briefing memo + Margin Health strip + Cluster mini-row + What-shifted strip

Sections 1–5 of `#screen-margin`.

- Replace page-head with new `.crumbs + .page-head + .page-sub` pattern. h1 "Margin Intelligence". Sub-pills: "Predictive Portfolio Pricing", "Diagnostics". Sub-stats: "LTM · refreshed today", "5,565 invoices · 4,605 quotes". head-actions: 3 head-pill filters (Cluster/Family/Tier) + `.btn-primary-rose` "Generate margin briefing →" + 2 head-pill (Branded PDF, Export to deck).
- Briefing memo (`#miBriefing`): convert to `.lq-card` with display:none/block toggle (mirror Forecast F1.3). Wire `miBriefingBtn` onclick to `document.getElementById('miBriefing').style.display=(this.dataset.open==='1'?'none':'block');this.dataset.open=this.dataset.open==='1'?'0':'1'`. Or simpler: just toggle display.
- Margin Health summary strip (`.margin-health`): convert to a `.trust-grid`-like row of 4 `.trust-tile`-style cells. The first cell with the "76 score ring" → restyle the ring to ink/rose/green based on score (76 = amber/Watch). Use Manrope big numbers. The 4th cell ("Closable gap") clickable with rose-deep "€280K" + sub line + auth-split chips.
- Cluster mini-row: replace inline-styled flex with a `.lq-card`-thin row containing label "Margin by cluster →" + 4 head-pill style tag-chips (BKAES green, BKAGG amber, BKAIZ amber, SOPU red). Each onclick → toast.
- What shifted strip (`.ms-shifted`): convert to `.lq-card` containing `.fact-list` of 4 rows. Each row has color-dot left (rose/muted/green/amber), description with delta chips, jump arrow right. The "Net month-over-month: −€14K worse" footer becomes a small line at the bottom.

Add CSS for:
- `body.pryzm-2026 #screen-margin .mh-strip` (4-col grid trust-tile-style)
- `.mh-cell`, `.mh-lab`, `.mh-val`, `.mh-sub`, `.mh-trend`, `.mh-benchmark`, `.mh-score-ring` (round badge using ink color), `.mh-auth-split`, `.ms-yours`, `.ms-md`
- `.cluster-mini-row` (flex with label + 4 chips)
- `.ms-shifted-rows` reuse `.fact-list/.fact-row`; `.ms-d-up`/`.ms-d-down`/`.ms-d-flat` deltas (red/green/ink-3); `.ms-jump` (rose-deep small)

Verify: load file, switch to PM persona then Margin. Take screenshot `margin-m1.png`. Test miBriefingBtn → briefing toggles. Console no errors. Commit: `frank-redesign: M1 margin head + briefing + health strip + clusters + shifted`.

---

## Task M2: Waterfall + Movable-Locked overlay + Lost-Quote + Cost-vs-Price + Recovery

Sections 6–9.

- Waterfall card: convert to `.lq-card`. Inside: 2-col grid (chart left + bucket list right). Bucket list: `.fact-list` of 7 rows (Target margin green / 5 leak buckets / Actual margin green). Each leak bucket row: dot color, name + delta chip + small source line, %pp + €amount, jump arrow on right. Click handlers preserved.
- Movable/Locked overlay (inside waterfall card): replace inline-styled gradient bar with rose/muted-2 segmented bar. Label uses var(--ink). Legend dots use var(--green) and var(--muted).
- Lost-Quote Differential: convert to `.lq-card` with `border-left:4px solid var(--violet)`. 3-card stat grid (won/lost/diff) using `.trust-tile`-style with violet accent for diff card. Plain-language interpretation paragraph below in surface-soft block. Source line at bottom.
- Cost-vs-Price card: convert to `.lq-card`. Inside: 2-col `.cp-row` (chart left + side panel right). Side panel: 2 `.lq-card`-style mini-cards (Cost pass-through 61% with progress + un-triggered breakdown; YTD recovery €147K with `recoveryChart`).
- Update Chart.js palettes: `waterfallChart` → rose/ink/green/red; `costPriceChart` → rose primary line for cost, ink for price; `recoveryChart` → rose primary line.

Add CSS for:
- `body.pryzm-2026 #screen-margin .wf-row` (2-col chart + buckets)
- `.wf-chart-wrap`, `.wf-buckets`, `.wf-list`, `.wf-bucket` (fact-row-like), `.wf-bucket.green` (green-bg endpoints), `.wf-dot`, `.wf-name`, `.wf-pct`, `.wf-eur`, `.wf-jump`, `.wf-delta` (up/down/flat with small chips), `.wf-source` (small muted)
- `.cp-row` (grid), `.cp-side`, `.cp-mini-card` (lq-card style; .warn = rose-tinted), `.cp-head`, `.cp-big`, `.cp-sub`, `.cp-progress`, `.cp-progress-fill` (rose)
- `.recovery-wrap` (height 80px)

Verify: Take screenshot `margin-m2.png`. Charts render in new palette, no console errors. Click any waterfall bucket → toast or screen-switch fires. Commit: `frank-redesign: M2 margin waterfall + lost-quote + cost-vs-price + recovery`.

---

## Task M3: Margin tabs (5 panes) + cross-links + QA

Section 10–11.

- Margin tabs block (`#marginTabsBlock`): convert outer to `.lq-card`. Replace `.tabs` with `.fc-tabs` segmented pill group (5 tabs: Cross-Customer / SKU Leakage / Segment / Erosion / Customer trend). Add `.prop-badge` styling (small violet-bg tag-chip).
- Each `.tab-pane`: keep existing tables, wrap each in `.sku-card > .table-wrap > table.frank-table`. Replace inline-styled cluster-chips (`background:#fef3c7;color:#b45309...`) with `.cluster-chip` tokens. Replace `.row-action.primary` and `.row-action` button styles (already defined in forecast scoped block — extend to margin scope or use shared root scope).
- Segment pane: `.seg-tabs` segmented pill group inside (`.seg-tab`). Each `.seg-pane` is a table.
- Erosion pane: keep `.age-bar` styling but tokenize colors (`.age-bar-fill.r` → rose, `.g` → green, default → amber).
- Tab footer (`.tab-footer`): style as small surface-soft strip with icon + text + link.
- Cross-links footer: replace with `.lq-card` thin row + 4 head-pill buttons (Action queue, Cluster forecast, SKU drill, Approval flow).
- QA pass: switch through tabs, switch to seg-tabs subtabs, click drill rows. Take final screenshots `margin-1440-viewport.png`, `margin-1440-bottom.png`, `margin-1920-bottom.png`.

Add CSS for:
- `body.pryzm-2026 #screen-margin .fc-tabs` (reuse pattern), `.tab`, `.prop-badge`
- `.tab-pane`, `.tab-footer`, `.tf-icon`, `.tf-text`, `.tf-link`
- `.seg-tabs`, `.seg-tab` (smaller segmented pill row inside)
- `.age-bar`, `.age-bar-fill` r/g/default
- `.pill` r/a/g + `.rag` (status pills) for customer trend pane

Verify final: switch to margin, take screenshots. Switch all 5 tabs → panes swap. In Segment tab, switch all 4 sub-tabs → panes swap. Take `margin-tabs-seg.png`. No console errors. Switch persona regression. Commit: `frank-redesign: M3 margin tabs + cross-links + QA`.
