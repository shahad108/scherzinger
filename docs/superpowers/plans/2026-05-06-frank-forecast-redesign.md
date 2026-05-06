# Frank Forecast Screen — Re-skin Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development to implement this plan task-by-task.

**Goal:** Re-skin `#screen-forecast` inside `Pryzm_Dashboard_Mockup_Frank.html` to use the Pryzm 2026 design language (already established in Frank Action Center). Preserve all forecast data, charts, JS behavior.

**Architecture:** Same scoping rule as Action Center round — append CSS to the existing `<style data-theme="pryzm-2026">` block (body-prefixed); replace markup inside `#screen-forecast`; do not touch other screens.

**Reference:**
- Design language: memory `project_pryzm_design_language.md` and `Pryzm_Dashboard_Mockup_Frank.html` (Frank Action Center as reference impl)
- Source design: `new test2/Pryzm Action Center.html`
- Spec inheritance: same tokens, fonts, components (`.hero-card`, `.round-grid`, `.lq-card`, `.trust-grid`, `.action-card`, `.sku-card`, `.signal-with-trend`, `.fact-list`, `.head-pill`, `.btn-primary-rose`, `.btn-dark`, `.btn-act`)

## Sections in `#screen-forecast` (current → new pattern)

| # | Current | New design pattern |
|---|---------|---------------------|
| 1 | Page head (crumbs + h1 + status-chip + filter-chip + briefing button) | `.crumbs + .page-head` (h1 34px Manrope) + `.page-sub` of `.sub-pill`/`.sub-stat` + `.head-actions` with `.head-pill` filters and `.btn-primary-rose` briefing CTA |
| 2 | `.fc-briefing` collapsible memo | `.lq-card` collapsible. Heading row + actions (Copy / Email / PDF / Close as `.head-pill`). Body keeps contenteditable. |
| 3 | Main forecast chart card with mode toggle, chart, "What changed", movable/locked split, seasonality | `.hero-card` framing. Mode toggle as 3-button pill group (similar to topbar `.lang` pills). Chart canvas inside. Below chart: `.fact-list` of "What changed" rows; the movable/locked toggle becomes a `.signal-with-trend` (rationale + bar pane); seasonality becomes a nested `.lq-card` with 3 fact-rows. |
| 4 | Per-cluster forecast lens (4 cluster cards) | `.round-grid` extended to 4 columns (or 2-col responsive grid of `.round-card`). Each card uses `.rc-title + .round-tags + .round-foot`. SOPU (low-n) card uses amber/red status chip. |
| 5 | Walk-forward backtest panel (chart + 4 stat tiles) | `.lq-card` containing chart + `.trust-grid` of 4 stat tiles (lab/big/cap pattern) |
| 6 | Input cost trajectory (info panel + 4 cost cards + stress-test) | `.lq-card` with info-panel row, then `.trust-grid` of 4 `.trust-tile` (cost-card content). Stress-test strip becomes a `.signal-with-trend` row at the bottom. |
| 7 | Pareto layer · tabs + drill-down tables | `.lq-card` with custom tab-row (use `.head-pill` styling), then `.sku-card` containing `.frank-table` for each pane. Drill-down detail row stays but inner block restyled with `.fact-list`. |
| 8 | Price floor table | `.sku-card` with `.frank-table` (same pattern as Action Center SKU table) |
| 9 | New product forecast (stats + chart + 3 rows) | `.lq-card` with stats row, chart, and `.actions-list` of 3 compact `.action-card` rows (one per new SKU). |
| 10 | Cross-link strip | Compact footer using `.head-pill` links inside a `.lq-card` thin row. |

## Critical constraints

1. All new CSS scoped under `body.pryzm-2026 ` — NEVER unscoped.
2. Keep `data-screen="forecast"` on the section; don't break `setScreen('forecast')` or `initForecast()`.
3. Update Chart.js palette for `forecastChart`, `walkForwardChart`, `newProductTrendChart` to the standard rose/ink palette.
4. Preserve all interactivity: mode toggle, briefing show/hide, tab switching, drill-down expand, info-panel toggles, info-tip tooltips, toasts, cross-screen jumps.
5. Do NOT touch any other screen (`#screen-action-pm`, `#screen-action-md`, `#screen-action-sr`, `#screen-studio`, `#screen-margin`, `#screen-quotes`, `#screen-ai`, `#screen-md-monthly`, `#screen-md-beirat`).
6. The right rail content currently shown on the Action Center screen is global — when forecast screen is active, the right rail should still render. Update its "Sections" jump-list dynamically OR leave it as-is (Action Center anchors). Decision: keep Action Center anchors for now; right-rail-per-screen is out of scope for this round.

## Acceptance criteria

1. Loading the file with persona PM and switching to Forecast shows the redesigned screen at 1440 width matching the Action Center's visual quality.
2. Removing `pryzm-2026` body class reverts to legacy look.
3. All 10 sections render with their data intact.
4. Charts render with new palette.
5. All interactivity (toggle/tabs/drill-down/briefing/info-panels/toasts/cross-links) works.
6. No console errors.
7. Persona switching unaffected.

---

## Task F1: Page head + briefing memo + main forecast card (sections 1, 2, 3)

**Files:** `Pryzm_Dashboard_Mockup_Frank.html` (style block + `#screen-forecast` first three sections)

- [ ] **Step F1.1 — Append CSS** for the forecast-specific subpatterns to the `<style data-theme="pryzm-2026">` block. Mostly reuse; add only:
  - `body.pryzm-2026 #screen-forecast .fc-mode-toggle` — 3-button segmented pill group: `display:inline-flex; background:var(--surface-sunken); border-radius:10px; padding:3px; gap:2px;` with each `button { padding:7px 14px; border-radius:8px; font-size:12.5px; color:var(--ink-3); font-weight:500; }` and `.active { background:var(--surface); color:var(--ink); box-shadow:var(--shadow-card); font-weight:600; }`
  - Optional `.fc-changed-row` styling reusing `.fact-row` look.
  - `.fc-cluster-card` reusing `.round-card` look (already defined).

- [ ] **Step F1.2 — Replace page-head markup** with new structure:
  ```html
  <div class="crumbs"><span>Cockpit</span><span class="sep">/</span><span>Pricing Analyst · Frank</span><span class="sep">/</span><b>Forecast</b></div>
  <div class="page-head">
    <div>
      <h1 id="fcTitle">Revenue Forecast — Next 12 Months</h1>
      <div class="page-sub">
        <span class="sub-pill">Predictive Portfolio Pricing</span>
        <span class="sub-stat"><b>Updated</b> Mon 06:14</span>
        <span class="sub-stat"><b>Band</b> +€8K WoW</span>
        <span class="sub-stat" id="fcModeCrumb">Revenue mode</span>
      </div>
    </div>
    <div class="head-actions">
      <button class="head-pill">Tier · All ▾</button>
      <button class="head-pill">Family · All ▾</button>
      <button class="head-pill" id="fcClusterLens" onclick="toast('Cluster lens: filter to BKAES / BKAGG / BKAIZ / SOPU')">Cluster lens · All ▾</button>
      <button class="btn-primary-rose" id="fcBriefingBtn" onclick="document.getElementById('fcBriefing').classList.toggle('show')">Generate forecast briefing →</button>
    </div>
  </div>
  ```

- [ ] **Step F1.3 — Replace briefing memo** with `.lq-card` markup:
  ```html
  <div class="lq-card fc-briefing" id="fcBriefing" style="display:none;margin-top:14px">
    <div class="lq-foot" style="border-top:none;padding-top:0;margin-top:0;align-items:center">
      <div class="ftxt"><b>Forecast briefing</b> · auto-drafted, editable</div>
      <div style="display:flex;gap:6px">
        <button class="head-pill" onclick="toast('Briefing copied to clipboard')">Copy</button>
        <button class="head-pill" onclick="toast('Briefing emailed to MD + CFO')">Email to MD</button>
        <button class="head-pill" onclick="toast('Briefing exported as PDF')">PDF</button>
        <button class="head-pill" onclick="document.getElementById('fcBriefing').style.display='none'">× Close</button>
      </div>
    </div>
    <div class="fc-briefing-body" contenteditable="true" style="margin-top:14px;color:var(--ink-3);font-size:13px;line-height:1.6">
      <p><b style="color:var(--ink)">Subject:</b> Forecast model · accuracy &amp; cluster signal · Week 18</p>
      <p>Walk-forward MAPE held at <b style="color:var(--ink)">4.7%</b> on Q1 2025 actuals (target &lt;5%). April actuals came in <b style="color:var(--ink)">−1.7%</b> vs primary band — within tolerance. <b style="color:var(--ink)">Per-cluster confidence diverges:</b> BKAES 82%, BKAGG 74%, BKAIZ 64%, SOPU 38% (low-n — do not auto-act on SOPU).</p>
      <p><b style="color:var(--ink)">Movable-revenue split:</b> €3.88M (62%) on the band is repriceable; €2.37M (38%) sits under multi-year contracts and absorbs cost shock without margin response. Steel S355 <b style="color:var(--ink)">+6.8% by Q3</b> (was +5.2%) → ~<b style="color:var(--ink)">€18–28K compression</b> on the contracted share.</p>
      <p><b style="color:var(--ink)">Action implications:</b> 2 below-floor quotes open (200832-E for 101580; 211094-C for 101900). 1 SKU in active A/B test (<b style="color:var(--ink)">205418-A</b> · day 9 of 21 · trending positive).</p>
      <p style="font-style:italic;color:var(--muted);margin-top:14px">— Frank · Pricing Analyst · drafted by Pryzm · please review before forwarding to MD.</p>
    </div>
  </div>
  ```
  Toggle script: existing `fcBriefingBtn` now toggles `display`. Adjust the `show` class CSS or remove it — switch to display toggle.

- [ ] **Step F1.4 — Replace main forecast card** with `.hero-card` framing:
  ```html
  <div class="hero-card" style="margin-top:14px" id="sec-forecast-main">
    <div style="display:flex;justify-content:space-between;align-items:flex-start;gap:14px;flex-wrap:wrap;margin-bottom:14px">
      <div class="fc-mode-toggle" id="fcModeToggle">
        <button class="active" data-mode="revenue">Revenue €</button>
        <button data-mode="margin">Margin %</button>
        <button data-mode="volume">Volume (units)</button>
      </div>
      <span class="tag-chip">Walk-forward · solid line = primary · shaded = envelope</span>
    </div>
    <div style="height:340px;position:relative"><canvas id="forecastChart"></canvas></div>

    <div class="signal-with-trend" style="margin-top:18px">
      <div class="signal-pane">
        <div class="ttl">What changed since last week <span class="ttl-sub">— top 3 movers</span></div>
        <div class="fact-list">
          <div class="fact-row"><div class="fact-l">Band</div><div class="fact-mid"><div class="fact-v green">+€8K WoW</div><div class="fact-s">Driven by <b>102330</b> frame uplift, offset by 101900 cancellations</div></div></div>
          <div class="fact-row"><div class="fact-l">Steel PPI</div><div class="fact-mid"><div class="fact-v red">+1.2pp WoW</div><div class="fact-s">Trajectory steepening (was +5.2% → now +6.8% by Q3)</div></div></div>
          <div class="fact-row"><div class="fact-l">101900 conf.</div><div class="fact-mid"><div class="fact-v amber">High → Medium</div><div class="fact-s">2 customers re-tiered</div></div></div>
        </div>
      </div>
      <div class="trend-pane">
        <div class="lab">Movable / Locked</div>
        <div class="v">62% / 38%</div>
        <div style="display:flex;height:6px;border-radius:4px;overflow:hidden;margin-top:10px;background:var(--surface-soft)">
          <div style="flex:0 0 62%;background:var(--rose)"></div>
          <div style="flex:1;background:var(--ink-3);opacity:.35"></div>
        </div>
        <div style="font-size:11px;color:var(--muted);margin-top:8px;line-height:1.4">€3.88M movable · €2.37M locked (multi-year contracts absorb cost shock)</div>
      </div>
    </div>

    <div class="lq-card" style="margin-top:14px;padding:18px 20px">
      <div class="ttl" style="font-size:12.5px;font-weight:700;color:var(--ink);margin-bottom:12px">Why the band moves <span style="color:var(--muted);font-weight:500">— seasonality annotations · 14 sources</span></div>
      <div class="fact-list">
        <div class="fact-row"><div class="fact-l">Aug</div><div class="fact-mid"><div class="fact-v green">+22%</div><div class="fact-s">Industrial maintenance cycle peak — top 5 customers restock heavy (VDMA / EuroBlech)</div></div></div>
        <div class="fact-row"><div class="fact-l">Dec</div><div class="fact-mid"><div class="fact-v red">−31%</div><div class="fact-s">Plant winter shutdowns — orders drop last 3 weeks</div></div></div>
        <div class="fact-row"><div class="fact-l">Mar</div><div class="fact-mid"><div class="fact-v green">+18%</div><div class="fact-s">German fiscal-year-end inventory builds (IFO-correlated)</div></div></div>
      </div>
    </div>
  </div>
  ```
  Update `forecastChart` Chart.js init: dataset borderColor `#a35a5a`, fill `rgba(163,90,90,0.10)`, secondary line (last quarter backtest) `#15140f` with dash, grid `rgba(0,0,0,0.05)`, ticks `#56544f`, font Inter.

- [ ] **Step F1.5 — Verify** at 1440px via Playwright. Confirm: page head, briefing memo opens/closes via "Generate forecast briefing →" button, main forecast card renders with mode toggle as segmented pill, chart in rose, "What changed" fact-list, movable/locked trend pane, seasonality fact-list. No console errors. Mode toggle clicks update title and `fcModeCrumb`.

- [ ] **Step F1.6 — Commit:** `frank-redesign: F1 forecast page head + briefing + main chart card`

---

## Task F2: Per-cluster lens + walk-forward backtest + input cost (sections 4, 5, 6)

**Files:** `Pryzm_Dashboard_Mockup_Frank.html` (style block tweaks + sections inside `#screen-forecast`)

- [ ] **Step F2.1 — Per-cluster lens** as 4-column `.round-grid`:
  ```html
  <div class="section-row" id="sec-fc-clusters">
    <div>
      <h2>Per-cluster forecast lens</h2>
      <div class="sub">Heterogeneous portfolio diagnostics — cluster-level forecast bands &amp; confidence. Click to filter the main chart.</div>
    </div>
    <span class="tag-chip">Heterogeneous portfolio</span>
  </div>
  <div class="round-grid" style="grid-template-columns:repeat(4,1fr)">
    <div class="round-card" onclick="toast('Filtering main chart to BKAES')">
      <div class="rc-title"><h3>BKAES</h3><div class="sub">LTM €12.3M</div></div>
      <div style="font-family:'Manrope',sans-serif;font-size:24px;font-weight:700;color:var(--ink);letter-spacing:-0.02em">€12.7M</div>
      <div style="font-size:11.5px;color:var(--muted)">band ±6% · next 12mo</div>
      <div class="round-tags"><span class="tag-chip status">BKAES 82%</span></div>
    </div>
    <div class="round-card" onclick="toast('Filtering main chart to BKAGG')">
      <div class="rc-title"><h3>BKAGG</h3><div class="sub">LTM €5.3M</div></div>
      <div style="font-family:'Manrope',sans-serif;font-size:24px;font-weight:700;color:var(--ink);letter-spacing:-0.02em">€5.4M</div>
      <div style="font-size:11.5px;color:var(--muted)">band ±9% · next 12mo</div>
      <div class="round-tags"><span class="tag-chip status amber">BKAGG 74%</span></div>
    </div>
    <div class="round-card" onclick="toast('Filtering main chart to BKAIZ')">
      <div class="rc-title"><h3>BKAIZ</h3><div class="sub">LTM €564K</div></div>
      <div style="font-family:'Manrope',sans-serif;font-size:24px;font-weight:700;color:var(--ink);letter-spacing:-0.02em">€581K</div>
      <div style="font-size:11.5px;color:var(--muted)">band ±12% · next 12mo</div>
      <div class="round-tags"><span class="tag-chip status amber">BKAIZ 64%</span></div>
    </div>
    <div class="round-card" onclick="toast('Filtering main chart to SOPU — low-n cluster, manual review recommended')">
      <div class="rc-title"><h3>SOPU</h3><div class="sub">LTM €170K · low-n</div></div>
      <div style="font-family:'Manrope',sans-serif;font-size:24px;font-weight:700;color:var(--ink);letter-spacing:-0.02em">€165K</div>
      <div style="font-size:11.5px;color:var(--muted)">band ±22% · next 12mo</div>
      <div class="round-tags"><span class="tag-chip status red">SOPU 38%</span></div>
    </div>
  </div>
  ```
  If `.tag-chip.status.red` doesn't exist, append:
  `body.pryzm-2026 .tag-chip.status.red::before{ background:var(--red); }`

- [ ] **Step F2.2 — Walk-forward backtest** as `.lq-card` with chart + `.trust-grid`:
  ```html
  <div class="section-row" id="sec-fc-wf">
    <div>
      <h2>Walk-forward backtest · 12-month MAPE</h2>
      <div class="sub">Each Monday's primary forecast tested against next month's actuals. Walk-forward retraining ensures accuracy improves over time.</div>
    </div>
    <span class="tag-chip status">Target &lt;5%</span>
  </div>
  <div class="lq-card">
    <div style="height:180px;position:relative"><canvas id="walkForwardChart"></canvas></div>
  </div>
  <div class="trust-grid" style="margin-top:14px">
    <div class="trust-tile"><div class="lab">Latest MAPE (April)</div><div class="big" style="color:var(--green)">4.7%</div><div class="cap">below target</div></div>
    <div class="trust-tile"><div class="lab">Avg trailing 6mo</div><div class="big" style="color:var(--green)">4.6%</div><div class="cap">stable</div></div>
    <div class="trust-tile"><div class="lab">Best month (Jan)</div><div class="big" style="color:var(--green)">4.4%</div><div class="cap">peak accuracy</div></div>
    <div class="trust-tile"><div class="lab">YoY trend</div><div class="big" style="color:var(--green)">−2.1pp</div><div class="cap">improving</div></div>
  </div>
  ```
  Update `walkForwardChart` palette to ink line + rose target band.

- [ ] **Step F2.3 — Input cost trajectory** as `.lq-card` + `.trust-grid` + `.signal-with-trend`:
  ```html
  <div class="section-row" id="sec-fc-cost">
    <div>
      <h2>Input cost trajectory · next 12 months</h2>
      <div class="sub">Your revenue forecasts are net of these inputs. Pass-through % = how much is contractually indexed; the rest is absorbed in margin.</div>
    </div>
    <span class="tag-chip">LME · VDMA · Bundesnetzagentur</span>
  </div>
  <div class="trust-grid">
    <div class="trust-tile">
      <div class="lab">Steel S355 / S275</div>
      <div class="big">€1,180<span style="font-size:12px;color:var(--muted);font-weight:500;letter-spacing:0">/t</span></div>
      <div class="cap"><b style="color:var(--red)">↑ +6.8%</b> by Q3 → €1,260 · 62% pass-through · WoW <b style="color:var(--red)">+1.6pp accelerating</b></div>
    </div>
    <div class="trust-tile">
      <div class="lab">Alloys (Cr-Mo, Ni)</div>
      <div class="big">€2,840<span style="font-size:12px;color:var(--muted);font-weight:500;letter-spacing:0">/t</span></div>
      <div class="cap"><b style="color:var(--ink-3)">→ +0.4%</b> stable · 28% pass-through · WoW <b>−0.2pp easing</b></div>
    </div>
    <div class="trust-tile">
      <div class="lab">Copper</div>
      <div class="big">€8,420<span style="font-size:12px;color:var(--muted);font-weight:500;letter-spacing:0">/t</span></div>
      <div class="cap"><b style="color:var(--amber)">↑ +3.1%</b> by Q4 → €8,680 · 15% pass-through · WoW <b>+0.2pp drift</b></div>
    </div>
    <div class="trust-tile">
      <div class="lab">Energy (industrial kWh)</div>
      <div class="big">€0.184<span style="font-size:12px;color:var(--muted);font-weight:500;letter-spacing:0">/kWh</span></div>
      <div class="cap"><b style="color:var(--green)">↓ −2.4%</b> by Q2 → €0.180 · 0% pass-through (absorbed) · WoW <b>−0.6pp easing</b></div>
    </div>
  </div>
  <div class="signal-with-trend" style="margin-top:14px">
    <div class="signal-pane">
      <div class="ttl">Stress test <span class="ttl-sub">— worst-case steel +10%</span></div>
      <ul style="margin:0;padding:0;list-style:none;color:var(--ink-3);font-size:12.5px;line-height:1.7">
        <li>Compresses margin by <b style="color:var(--ink)">€42K</b> across 47 SKUs. Floors auto-recalibrate per SKU.</li>
        <li>Headroom on alloys absorbs partially; energy buffer holds.</li>
      </ul>
    </div>
    <div class="trend-pane">
      <div class="lab">Central case</div>
      <div class="v" style="color:var(--red)">€18–28K</div>
      <div style="font-size:11px;color:var(--muted);margin-top:6px;line-height:1.4">compression next quarter (38% of revenue is fixed-price, no pass-through)</div>
    </div>
  </div>
  ```

- [ ] **Step F2.4 — Verify + commit:** `frank-redesign: F2 forecast cluster lens + walk-forward + input cost`

---

## Task F3: Pareto layer · tabs + tables (section 7)

**Files:** `Pryzm_Dashboard_Mockup_Frank.html` (style block + section 7 markup)

- [ ] **Step F3.1 — Append CSS** for the tab pill group (similar to fc-mode-toggle) and drill-down inner card:
  ```css
  body.pryzm-2026 #screen-forecast .fc-tabs{
    display:inline-flex; background:var(--surface-sunken); border-radius:10px; padding:3px; gap:2px;
    margin-bottom:14px;
  }
  body.pryzm-2026 #screen-forecast .fc-tabs .tab{
    padding:7px 14px; border-radius:8px; font-size:12.5px; color:var(--ink-3); font-weight:500;
    cursor:pointer; user-select:none;
  }
  body.pryzm-2026 #screen-forecast .fc-tabs .tab.active{
    background:var(--surface); color:var(--ink); box-shadow:var(--shadow-card); font-weight:600;
  }
  body.pryzm-2026 #screen-forecast .drill-detail-inner{
    background:var(--surface-soft); border:1px solid var(--hairline); border-radius:11px;
    padding:14px 16px; margin:8px 0;
  }
  body.pryzm-2026 #screen-forecast .sku-mix-row{
    display:grid; grid-template-columns:90px 1fr 80px 80px 110px; gap:12px; align-items:center;
    padding:8px 0; border-top:1px solid var(--hairline); font-size:12.5px; color:var(--ink-2);
  }
  body.pryzm-2026 #screen-forecast .sku-mix-row:first-of-type{ border-top:none; }
  body.pryzm-2026 #screen-forecast .sm-aid{ font-weight:700; color:var(--ink); font-variant-numeric:tabular-nums; }
  body.pryzm-2026 #screen-forecast .sm-action{ color:var(--rose-deep); font-weight:600; cursor:pointer; }
  body.pryzm-2026 #screen-forecast .tier-chip{
    display:inline-flex; align-items:center; justify-content:center;
    width:18px; height:18px; border-radius:5px; font-size:10px; font-weight:700; color:#fff; margin-right:6px;
  }
  body.pryzm-2026 #screen-forecast .tier-chip.A{ background:var(--rose); }
  body.pryzm-2026 #screen-forecast .tier-chip.B{ background:var(--ink-3); }
  body.pryzm-2026 #screen-forecast .tier-chip.C{ background:var(--amber); }
  body.pryzm-2026 #screen-forecast .tier-chip.D{ background:var(--red); }
  body.pryzm-2026 #screen-forecast .conf-chip{
    display:inline-flex; align-items:center; gap:5px;
    padding:3px 8px; border-radius:6px; font-size:11px; font-weight:600;
    background:var(--surface-sunken); color:var(--ink-2);
  }
  body.pryzm-2026 #screen-forecast .conf-chip .ck{ width:6px; height:6px; border-radius:50%; background:var(--green); }
  body.pryzm-2026 #screen-forecast .conf-chip.m .ck{ background:var(--amber); }
  body.pryzm-2026 #screen-forecast .conf-chip.t .ck{ background:var(--red); }
  body.pryzm-2026 #screen-forecast .booked-bar{ display:flex; align-items:center; gap:8px; margin-top:4px; }
  body.pryzm-2026 #screen-forecast .booked-track{ flex:1; height:4px; background:var(--surface-sunken); border-radius:2px; overflow:hidden; max-width:80px; }
  body.pryzm-2026 #screen-forecast .booked-fill{ height:100%; background:var(--rose); border-radius:2px; }
  body.pryzm-2026 #screen-forecast .booked-text{ font-size:10.5px; color:var(--muted); white-space:nowrap; }
  body.pryzm-2026 #screen-forecast .trend-arrow.up{ color:var(--green); font-weight:600; }
  body.pryzm-2026 #screen-forecast .trend-arrow.down{ color:var(--red); font-weight:600; }
  body.pryzm-2026 #screen-forecast .trend-arrow.flat{ color:var(--ink-3); font-weight:600; }
  body.pryzm-2026 #screen-forecast .vp-split{ display:block; font-size:10.5px; color:var(--muted); margin-top:2px; }
  body.pryzm-2026 #screen-forecast .cluster-chip{
    display:inline-flex; align-items:center; padding:2px 7px; border-radius:5px;
    font-size:10.5px; font-weight:600; color:var(--ink-2); background:var(--surface-sunken); margin-left:6px;
  }
  body.pryzm-2026 #screen-forecast .cluster-chip[data-conf="green"]{ background:var(--green-bg); color:var(--green); }
  body.pryzm-2026 #screen-forecast .cluster-chip[data-conf="amber"]{ background:var(--amber-bg); color:var(--amber); }
  body.pryzm-2026 #screen-forecast .cluster-chip[data-conf="red"], body.pryzm-2026 #screen-forecast .cluster-chip.lown{ background:var(--rose-bg); color:var(--rose-deep); }
  body.pryzm-2026 #screen-forecast .row-action{
    background:var(--surface); border:1px solid var(--border); border-radius:8px;
    padding:6px 10px; font-size:11.5px; color:var(--ink-2); font-weight:500; cursor:pointer;
  }
  body.pryzm-2026 #screen-forecast .row-action:hover{ background:#fafaf7; border-color:var(--border-strong); }
  body.pryzm-2026 #screen-forecast .row-action.primary{ background:var(--ink); color:#fff; border-color:var(--ink); }
  body.pryzm-2026 #screen-forecast .row-action.queue{ background:var(--rose-bg); color:var(--rose-deep); border-color:var(--rose-tint); }
  body.pryzm-2026 #screen-forecast .footer-note{ font-size:11.5px; color:var(--muted); margin-top:10px; }
  ```

- [ ] **Step F3.2 — Replace Pareto markup** keeping tables and drill-down logic intact, restyling outer wrapper as `.lq-card` with new tab pill group. Section structure:
  ```html
  <div class="section-row" id="sec-fc-pareto">
    <div>
      <h2>Pareto layer · top 10 customers + SKUs</h2>
      <div class="sub">The aggregate forecast above rolls up from these. Each row carries its own band, confidence, and assumption.</div>
    </div>
    <span class="tag-chip">80% of revenue</span>
  </div>
  <div class="lq-card">
    <div class="fc-tabs" id="forecastTabs">
      <div class="tab active" data-fctab="cust"><span class="tab-label">By customer · top 10</span></div>
      <div class="tab" data-fctab="sku"><span class="tab-label">By SKU · top 10</span></div>
    </div>
    <!-- Customer pane: keep the existing <div class="tab-pane fc-cust-pane" data-fcpane="cust"> ... </div> with tier-legend + table + drill-detail rows. Wrap the table in .sku-card if needed for new look. -->
    <!-- SKU pane: same — keep the existing <div class="tab-pane fc-sku-pane hidden" data-fcpane="sku"> ... </div> -->
  </div>
  ```
  Inside each pane: replace the existing `<table>` markup with `<div class="sku-card"><div class="table-wrap"><table class="frank-table">...</table></div></div>` and keep all rows (don't lose the drill-down details).
  Tier-legend at the top of customer pane should be restyled as a row of small `.tag-chip` items.

- [ ] **Step F3.3 — Verify + commit:** `frank-redesign: F3 forecast pareto layer + tabs + tables`

---

## Task F4: Price floor + new product forecast + cross-link strip (sections 8, 9, 10)

**Files:** `Pryzm_Dashboard_Mockup_Frank.html` (style block + sections 8, 9, 10 markup)

- [ ] **Step F4.1 — Price floor** as `.sku-card` + `.frank-table`:
  ```html
  <div class="section-row" id="sec-fc-floor">
    <div>
      <h2>Price floor · per customer × SKU</h2>
      <div class="sub">Forecast-informed minimums for negotiation prep. Below-floor quotes auto-flag in Quotes &amp; Guardrails.</div>
    </div>
    <div style="display:flex;gap:6px">
      <button class="head-pill">Top 10 ▾</button>
      <button class="head-pill">All customers ▾</button>
      <button class="head-pill">Export</button>
    </div>
  </div>
  <div class="sku-card">
    <div class="table-wrap">
      <table class="frank-table">
        <!-- KEEP existing thead and tbody verbatim — only the wrapper changes -->
      </table>
    </div>
  </div>
  <p class="footer-note" style="font-size:11.5px;color:var(--muted);margin-top:10px"><b style="color:var(--red)">2 quotes below floor this week</b> · €1.50/unit at risk on 1,680 units.</p>
  ```

- [ ] **Step F4.2 — New product forecast** as `.lq-card` with stats row + chart + `.actions-list`:
  ```html
  <div class="section-row" id="sec-fc-newproduct">
    <div>
      <h2>New product forecast · comparable cluster</h2>
      <div class="sub">Frank's job: price new products without a historical baseline. Model assigns each new SKU to its closest cluster.</div>
    </div>
    <span class="tag-chip">Predictive Portfolio Pricing</span>
  </div>
  <div class="lq-card">
    <div style="display:flex;gap:32px;flex-wrap:wrap;margin-bottom:12px">
      <div class="lq-stat"><div class="num">203</div><div class="lab">new SKUs (last 12mo)</div></div>
      <div class="lq-stat"><div class="num">€1.5M</div><div class="lab">revenue</div></div>
      <div class="lq-stat"><div class="num">8.3%</div><div class="lab">of total</div></div>
    </div>
    <div style="height:160px;position:relative"><canvas id="newProductTrendChart"></canvas></div>
  </div>
  <div class="actions-list" style="margin-top:14px">
    <div class="action-card">
      <div class="ac-section">
        <div class="ac-head">
          <div class="ac-rank">1</div>
          <div class="ac-title"><div class="h">218812-K · Sleeve variant</div><div class="t">cluster <b>BKAES</b> (n=627) · forecast €42K ± 18%</div></div>
          <div class="ac-tools"><span class="tag-chip status">BKAES 76%</span></div>
        </div>
        <div class="ac-cta-row" style="margin-top:14px">
          <button class="btn-secondary">View cluster average</button>
          <button class="btn-primary-rose" onclick="toast('Assigning 218812-K to comparable cluster BKAES — band copied from cluster average')">Assign to cluster →</button>
        </div>
      </div>
    </div>
    <div class="action-card">
      <div class="ac-section">
        <div class="ac-head">
          <div class="ac-rank">2</div>
          <div class="ac-title"><div class="h">220114-A · Bearing housing variant</div><div class="t">cluster <b>BKAGG</b> (n=370) · forecast €28K ± 24%</div></div>
          <div class="ac-tools"><span class="tag-chip status amber">BKAGG 68%</span></div>
        </div>
        <div class="ac-cta-row" style="margin-top:14px">
          <button class="btn-secondary">View cluster average</button>
          <button class="btn-primary-rose" onclick="toast('Assigning 220114-A to comparable cluster BKAGG — band copied from cluster average')">Assign to cluster →</button>
        </div>
      </div>
    </div>
    <div class="action-card">
      <div class="ac-section">
        <div class="ac-head">
          <div class="ac-rank">3</div>
          <div class="ac-title"><div class="h">221305 · Custom pump</div><div class="t">cluster <b>SOPU</b> (n=6) · forecast €11K ± 38% · <span style="color:var(--red)">⚠ low-n cluster, manual review</span></div></div>
          <div class="ac-tools"><span class="tag-chip status red">SOPU 38%</span></div>
        </div>
        <div class="ac-cta-row" style="margin-top:14px">
          <button class="btn-secondary">View cluster sample</button>
          <button class="btn-secondary" onclick="toast('221305 routed to manual review — SOPU cluster has only 6 SKUs')">Manual review →</button>
        </div>
      </div>
    </div>
  </div>
  ```
  Update `newProductTrendChart` palette to rose primary line.

- [ ] **Step F4.3 — Cross-link strip** restyled:
  ```html
  <div class="lq-card" style="margin-top:14px;padding:14px 18px;display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:10px">
    <div class="ftxt" style="font-size:12px;color:var(--muted)">Where to act on this:</div>
    <div style="display:flex;gap:6px;flex-wrap:wrap">
      <button class="head-pill" onclick="setScreen('action')">Action queue → Action Center</button>
      <button class="head-pill" onclick="setScreen('action')">Negotiation cockpit → Action Center</button>
      <button class="head-pill" onclick="setScreen('studio')">SKU drill → Pricing Studio</button>
    </div>
  </div>
  ```

- [ ] **Step F4.4 — Verify + commit:** `frank-redesign: F4 forecast price-floor + new-product + cross-link`

---

## Task F5: QA pass — chart palette sweep, drawer/toast sanity, screenshots

**Files:** `Pryzm_Dashboard_Mockup_Frank.html`

- [ ] **Step F5.1 — Chart palette sweep:** Verify `forecastChart`, `walkForwardChart`, `newProductTrendChart` all use the standard rose/ink palette per the design language memory.
- [ ] **Step F5.2 — Mode toggle / tab / drill-down regression:** Click each `.fc-mode-toggle` button, switch tabs, click drill-down arrow on customer 101580 row → confirms expanded SKU mix shows. Briefing toggle works.
- [ ] **Step F5.3 — Persona regression:** Switch to MD then SR then back to PM. Switch screens between Action Center, Forecast, Pricing Studio (legacy), back to Forecast — Forecast should always show the new design.
- [ ] **Step F5.4 — Screenshots at 1440×900 and 1920×1080** (viewport + fullPage). Save as `frank-forecast-1440-viewport.png`, `frank-forecast-1440-full.png`, `frank-forecast-1920-full.png`.
- [ ] **Step F5.5 — Address visual deltas** if any (overflow, alignment, table column widths).
- [ ] **Step F5.6 — Commit:** `frank-redesign: F5 forecast QA pass — palette + screenshots`

---

**Done.** All 10 forecast sections re-skinned to the Pryzm 2026 design language.
