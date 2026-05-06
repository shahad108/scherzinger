# Frank Action Center — Re-skin Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Re-skin the Frank PM Action Center inside `Pryzm_Dashboard_Mockup_Frank.html` to match the design language of `new test2/Pryzm Action Center.html`, preserving all data and JS behavior.

**Architecture:** Single-file HTML mockup. New tokens + chrome + screen-PM styles are added in a scoped `<style data-theme="pryzm-2026">` block at end of `<head>`. A `pryzm-2026` class on `<body>` activates them; without the class, legacy look is preserved. DOM is restructured for the topbar/sidebar/main/right-rail to match the new shell, but the existing `<section>` IDs, persona switcher, and JS hooks are kept intact.

**Tech Stack:** Plain HTML / CSS / vanilla JS, Chart.js 4 (already loaded), Inter + Manrope fonts (Google Fonts, added). Verification via direct browser load + Playwright MCP screenshots.

**Source files:**
- Reference design: `new test2/Pryzm Action Center.html`
- Target: `Pryzm_Dashboard_Mockup_Frank.html`
- Spec: `docs/superpowers/specs/2026-05-06-frank-action-center-redesign-design.md`

**Conventions:**
- All new selectors are scoped under `body.pryzm-2026` to avoid breaking other personas/screens.
- Commit after each task (subject prefix: `frank-redesign:`).
- After each visible task, take a screenshot at 1440px viewport via Playwright MCP and confirm against the reference before moving on.

---

## File Structure

| File | Role | Change |
|------|------|--------|
| `Pryzm_Dashboard_Mockup_Frank.html` | The mockup | All edits land here |
| `new test2/Pryzm Action Center.html` | Read-only design source | Copy CSS + markup patterns from |
| `docs/superpowers/specs/2026-05-06-frank-action-center-redesign-design.md` | Spec | Reference, no edits |

Anchors in target file (current line numbers, may drift):
- `</head>` at line 1547 — append new `<style data-theme="pryzm-2026">` block immediately before this
- `<body>` at line 1548 — add `class="pryzm-2026"` (preserve `data-persona` attribute and any existing classes)
- `#screen-action-pm` at line 1606
- `actions-list` div at line 1703
- `ACTIONS` data + `renderActions()` JS at lines 4887 and 4911

---

## Task 1: Foundation — tokens, fonts, body class, scoped style block

**Files:**
- Modify: `Pryzm_Dashboard_Mockup_Frank.html` (`<head>`, `<body>` opening)

- [ ] **Step 1.1: Read current `<head>` last 30 lines and `<body>` opening line**

Run: read lines 1517–1555 of `Pryzm_Dashboard_Mockup_Frank.html` to confirm exact structure before editing.

- [ ] **Step 1.2: Add Google Fonts link inside `<head>`**

Find any existing `<link rel="stylesheet">` in head (or the line just before `</head>`) and insert immediately before `</head>`:

```html
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&family=Manrope:wght@500;600;700;800&display=swap" rel="stylesheet">
```

- [ ] **Step 1.3: Add scoped style block immediately before `</head>`**

Insert this exact block before `</head>`. Token values are copied verbatim from `new test2/Pryzm Action Center.html` lines 20–65.

```html
<style data-theme="pryzm-2026">
body.pryzm-2026{
  --canvas:#dcdbd6; --shell:#eeece8; --surface:#ffffff;
  --surface-soft:#f6f4f0; --surface-sunken:#ecebe6;
  --ink:#15140f; --ink-2:#2c2a26; --ink-3:#56544f; --muted:#8a877f; --muted-2:#b3b0a8;
  --border:#e6e4de; --border-strong:#d6d3cc; --hairline:#eae8e2;
  --rose:#a35a5a; --rose-deep:#874646; --rose-soft:#c98989; --rose-tint:#f1dede; --rose-bg:#f8eded;
  --green:#2f7d5b; --green-bg:#e3efe6;
  --amber:#a5701f; --amber-bg:#f5ecd9;
  --red:#9a3232; --red-bg:#f1dcdc;
  --violet:#6d4ec5; --violet-bg:#ece4f6;
  --shadow-card: 0 1px 0 rgba(20,16,12,.04), 0 1px 2px rgba(20,16,12,.04);
  --shadow-pop:  0 12px 28px -14px rgba(20,16,12,.14), 0 2px 6px rgba(20,16,12,.05);
  --r-sm:8px; --r:12px; --r-md:14px; --r-lg:18px; --r-xl:24px; --r-2xl:32px;
  font-family:'Inter',-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;
  background:var(--canvas); color:var(--ink);
  font-size:13.5px; line-height:1.5; letter-spacing:-0.005em;
  -webkit-font-smoothing:antialiased; text-rendering:optimizeLegibility;
}
body.pryzm-2026 h1,
body.pryzm-2026 h2,
body.pryzm-2026 h3,
body.pryzm-2026 h4,
body.pryzm-2026 h5{
  font-family:'Manrope','Inter',sans-serif; margin:0; color:var(--ink);
  letter-spacing:-0.022em; font-weight:700;
}
</style>
```

- [ ] **Step 1.4: Add `pryzm-2026` class to `<body>`**

Locate `<body ...>` (currently line 1548). Add `pryzm-2026` to its `class` attribute (create the attribute if missing). Preserve all other attributes (`data-persona`, etc.).

Example before: `<body data-persona="pm">`
Example after: `<body class="pryzm-2026" data-persona="pm">`

- [ ] **Step 1.5: Verify load**

Open `Pryzm_Dashboard_Mockup_Frank.html` in a browser via Playwright MCP. Take a screenshot. Page should load without console errors. Background changes to warm gray; fonts switch to Inter/Manrope. Layout will look broken (no shell yet) — that's expected.

- [ ] **Step 1.6: Commit**

```bash
git add Pryzm_Dashboard_Mockup_Frank.html
git commit -m "frank-redesign: T1 foundation — tokens, fonts, body class"
```

---

## Task 2: Shell layout — `.app > .topbar + .shell(grid) > aside + main + .rail`

**Files:**
- Modify: `Pryzm_Dashboard_Mockup_Frank.html` (the `<style data-theme="pryzm-2026">` block from Task 1, plus DOM wrapper around existing topbar/sidebar/main/rail)

This task adds the shell CSS and wraps the existing markup. We do NOT delete the existing topbar/sidebar/rail markup yet — we restyle it via the new selectors.

- [ ] **Step 2.1: Identify existing chrome boundaries**

Run: in the target file, find the opening tags for the current top bar, sidebar, main content area, and right rail. Note their exact selectors and immediate parents. Use Grep for `class="app"`, `class="topbar"`, `<aside`, `<main`, `class="rail"` (or whatever the current names are).

- [ ] **Step 2.2: Append shell CSS to the `<style data-theme="pryzm-2026">` block**

Add (before the closing `</style>`) the layout rules. Copy structurally from `new test2/Pryzm Action Center.html` lines 86–290 but scoped under `body.pryzm-2026`:

```css
body.pryzm-2026 .app{ min-height:100vh; padding:18px; display:flex; flex-direction:column; gap:14px; }
body.pryzm-2026 .topbar{ display:flex; align-items:center; gap:8px; padding:6px 8px; flex-wrap:wrap; }
body.pryzm-2026 .shell{
  background:var(--shell); border-radius:var(--r-2xl); flex:1;
  display:grid; grid-template-columns:240px 1fr 320px; gap:0;
  padding:18px; min-height:0;
  box-shadow:inset 0 0 0 1px rgba(255,255,255,.4);
}
body.pryzm-2026 .shell > aside{ display:flex; flex-direction:column; padding:6px 4px 6px 0; gap:2px; min-width:0; }
body.pryzm-2026 .shell > main{ padding:6px 22px; overflow-y:auto; overflow-x:hidden; min-width:0; scrollbar-width:thin; }
body.pryzm-2026 .shell > main::-webkit-scrollbar{ width:8px; }
body.pryzm-2026 .shell > main::-webkit-scrollbar-thumb{ background:rgba(0,0,0,.1); border-radius:4px; }
body.pryzm-2026 .shell > .rail{ padding:6px 0 6px 12px; display:flex; flex-direction:column; gap:14px; min-width:0; }
```

- [ ] **Step 2.3: Wrap existing chrome in `.app` and `.shell`**

The current Frank file has its own top bar / sidebar / main / right rail. Determine which tags they live in, then:

1. Open a `<div class="app">` immediately after `<body class="pryzm-2026" ...>`.
2. Move the existing top bar to be the first child of `.app` (no markup change to its inner content yet — re-skin happens in Task 3).
3. Open a `<div class="shell">` after the top bar and before the existing sidebar.
4. Make sure the existing sidebar (an `<aside>`), the existing `<main>`, and the existing right rail (`<div class="rail">` or equivalent) are direct children of `.shell` in that order.
5. Close `.shell` after the right rail. Close `.app` after `.shell`. Keep the drawer/toast outside `.app` (they're absolutely positioned).

If the current file already uses an `.app` / `.shell` wrapper, just verify the grid columns line up and skip wrapper creation; otherwise add them.

- [ ] **Step 2.4: Verify shell renders**

Reload via Playwright. Confirm: warm gray canvas, rounded shell with light fill, three columns (sidebar / main / rail). Inner widgets will look unstyled (still legacy) — that's fine.

- [ ] **Step 2.5: Commit**

```bash
git add Pryzm_Dashboard_Mockup_Frank.html
git commit -m "frank-redesign: T1.b shell layout (.app + 240/1fr/320 grid)"
```

---

## Task 3: Re-skin top bar + sidebar + drawer + toast

**Files:**
- Modify: `Pryzm_Dashboard_Mockup_Frank.html` (style block + topbar/sidebar inner markup)

- [ ] **Step 3.1: Append topbar styles**

Copy from source lines 92–145 into the `<style data-theme="pryzm-2026">` block, scoped under `body.pryzm-2026`. Selectors: `.topbar .search-pill`, `.logo`, `.pill`, `.pill-icon`, `.lang`, `.date-pill`, `.btn-dark`. Keep the exact CSS — only prefix selectors with `body.pryzm-2026 `.

- [ ] **Step 3.2: Replace topbar inner markup**

Replace the current top bar contents (preserving any persona-switcher controls) with the markup from source lines 1144–1156:

```html
<div class="logo" aria-label="Pryzm">
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round" stroke-linecap="round"><path d="M12 3 4 9v6l8 6 8-6V9z"/><path d="M12 3v18M4 9l8 6 8-6"/></svg>
</div>
<button class="pill search-pill"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="11" cy="11" r="7"/><path d="m20 20-3.5-3.5"/></svg> <span>Search SKUs, customers, clusters…</span></button>
<button class="pill"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="9" cy="8" r="4"/><path d="M3 21a6 6 0 0 1 12 0M19 8v6M22 11h-6"/></svg> Add person</button>
<button class="pill has-dot"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M18 8a6 6 0 1 0-12 0c0 7-3 9-3 9h18s-3-2-3-9M13.7 21a2 2 0 0 1-3.4 0"/></svg> Notifications</button>
<button class="pill-icon" title="More"><svg viewBox="0 0 24 24" fill="currentColor"><circle cx="6" cy="12" r="1.7"/><circle cx="12" cy="12" r="1.7"/><circle cx="18" cy="12" r="1.7"/></svg></button>
<div class="grow"></div>
<!-- KEEP existing persona-switcher controls here so MD/SR toggling still works -->
<button class="lang">En <span class="arr">▾</span></button>
<div class="date-pill"><svg class="ic" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="4" width="18" height="18" rx="2"/><path d="M16 2v4M8 2v4M3 10h18"/></svg> May 6, 2026</div>
<button class="btn-dark">Create <span class="arr">→</span></button>
```

If a persona switcher exists in the current top bar, keep its element(s) in place inside the `<div class="grow"></div>` boundary or before `.lang`, restyled as a `.pill` if reasonable.

- [ ] **Step 3.3: Append sidebar styles**

Copy from source lines 160–280 (`.nav-title`, `.nav-item`, `.nav-divider`, `.nav-sub-title`, `.dept-item`, `.dept-swatch`, `.promo`, `.data-status`, `.user-row`, `.avatar`, `.logout`) into the style block, all prefixed with `body.pryzm-2026 `.

- [ ] **Step 3.4: Replace sidebar inner markup**

Replace the existing `<aside>` contents (the one inside `.shell`) with the markup from source lines 1163–1238 verbatim. Critical: keep the `data-screen` attributes on each `.nav-item` (`action`, `forecast`, `studio`, `margin`, `quotes`, `ai`, `settings`) so persona-aware nav still works. Also re-add the `md-monthly` and `md-beirat` items if your existing nav had them, with the same pattern:

```html
<div class="nav-item" data-screen="md-monthly">
  <span class="ico"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M3 3h18v18H3z"/></svg></span>
  <span class="label">Monatsabschluss</span>
</div>
<div class="nav-item" data-screen="md-beirat">
  <span class="ico"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M4 4h16v16H4z"/></svg></span>
  <span class="label">Beiratsbericht</span>
</div>
```

The `setScreen()` JS attaches click handlers to `.nav-item[data-screen]`, so behavior is preserved by data-attr alone. Verify by clicking each nav item in browser.

- [ ] **Step 3.5: Append drawer + toast restyle**

Append, scoped under `body.pryzm-2026`, drawer & toast styles. Copy from source lines later in the file (search for `.drawer` and `.toast` definitions in the source's `<style>` block) — paste verbatim with the body-class prefix.

- [ ] **Step 3.6: Verify**

Playwright screenshot at 1440px. Confirm: top bar matches source (rose-dotted notifications pill, dark Create button), sidebar nav items render with rose active state on "Action Center", departments + data-status promo + user row visible, "FK / Frank Keller / frank@scherzinger.de" shown.

- [ ] **Step 3.7: Commit**

```bash
git add Pryzm_Dashboard_Mockup_Frank.html
git commit -m "frank-redesign: T1.c topbar + sidebar + drawer + toast"
```

---

## Task 4: Page-head + hero card + round cards (Sections 1–3)

**Files:**
- Modify: `Pryzm_Dashboard_Mockup_Frank.html` (style block + `#screen-action-pm` first three sections)

- [ ] **Step 4.1: Append page-head + hero + round-card styles**

Copy verbatim, body-prefixed, from source lines 294–525 (`.crumbs`, `.page-head`, `.page-sub`, `.head-actions`, `.head-pill`, `.hero-card`, `.hero-grid`, `.hero-headline`, `.hero-sub`, `.hero-split`, `.hero-bar`, `.hero-cta-row`, `.hero-spark-wrap`, `.hero-spark-meta`, `.hero-chart-box`, `.hero-spark`, `.hero-spark-axis`, `.round-grid`, `.round-card`, `.round-tags`, `.tag-chip`, `.round-foot`, `.avatars`, `.btn-act`, `.section-row`, `.icon-btn-sq`).

- [ ] **Step 4.2: Replace markup in `#screen-action-pm` for Sections 1–3**

In `#screen-action-pm` (line ~1606), replace the current page-head (lines 1607–1617), hero (lines 1638–1646), and insert round cards. Use the markup from source lines 1244–1375 with Frank data. Final block:

```html
<div class="crumbs">
  <span>Cockpit</span>
  <span class="sep">/</span>
  <span>Pricing Analyst · Frank</span>
  <span class="sep">/</span>
  <b>Action Center</b>
</div>

<div class="page-head">
  <div>
    <h1>Good morning, Frank.</h1>
    <div class="page-sub">
      <span class="sub-pill"><b>Week 18</b> · Apr 27 – May 3, 2026</span>
      <span class="sub-stat"><b>1,313</b> records</span>
      <span class="sub-stat"><b>1,015</b> SKUs</span>
      <span class="sub-stat"><b>4</b> commodity groups</span>
    </div>
  </div>
  <div class="head-actions">
    <button class="head-pill"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="6 9 12 15 18 9"/></svg> All Departments</button>
    <button class="head-pill"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4M7 10l5 5 5-5M12 15V3"/></svg> Export</button>
    <button class="head-pill"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M22 3H2l8 9v7l4 2v-9z"/></svg> Filter</button>
  </div>
</div>

<div class="hero-card" id="sec-movable">
  <div class="hero-grid">
    <div>
      <div class="eyebrow">
        <span class="lbl">Movable revenue</span>
        <span class="info" title="Pilot estimate · refined weekly per cluster">i</span>
      </div>
      <div class="hero-headline">
        <span class="num">€3.88M</span>
        <span class="delta">
          <svg viewBox="0 0 12 12" fill="none"><path d="M6 10V2M6 2L2.5 5.5M6 2L9.5 5.5" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/></svg>
          +9.2% vs Wk 17
        </span>
      </div>
      <p class="hero-sub">of <b>€6.25M</b> total revenue this week — <b>62% open to repricing</b>.</p>
      <div class="hero-split">
        <div class="split-stat">
          <div class="split-label"><span class="swatch"></span>Movable share</div>
          <div class="split-value">62%<span class="pct">of revenue</span></div>
        </div>
        <div class="split-stat">
          <div class="split-label">SKUs in scope</div>
          <div class="split-value">628<span class="pct">of 1,015</span></div>
        </div>
        <div class="split-stat locked">
          <div class="split-label"><span class="swatch"></span>Locked</div>
          <div class="split-value">€2.37M<span class="pct">38%</span></div>
        </div>
      </div>
      <div class="hero-bar"><div class="seg-mov"></div><div class="seg-lock"></div></div>
      <div class="hero-cta-row">
        <span class="footnote">Movable share refined per cluster — see Heterogeneous Portfolio.</span>
        <button class="btn-primary" onclick="toast && toast('Opening repricing queue')">
          Open repricing queue
          <svg viewBox="0 0 12 12" fill="none"><path d="M2.5 6h7M6 2.5L9.5 6 6 9.5" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/></svg>
        </button>
      </div>
    </div>
    <div class="hero-spark-wrap">
      <div class="hero-spark-meta"><span>Movable revenue trend</span><span class="scale">€M</span></div>
      <div class="hero-chart-box"><canvas id="heroSpark" class="hero-spark"></canvas></div>
      <div class="hero-spark-axis"><span>Wk 6</span><span>Wk 12</span><span style="color:var(--rose);font-weight:600">Wk 18 · €3.88M</span></div>
    </div>
  </div>
</div>

<div class="round-grid">
  <div class="round-card">
    <div class="rc-title">
      <h3>Movable bucket</h3>
      <div class="sub">808 SKUs · 4 commodity groups · BKAES leads</div>
    </div>
    <div class="round-tags">
      <span class="tag-chip">€3.88M open</span>
      <span class="tag-chip status">Movable</span>
    </div>
    <div class="round-foot">
      <div class="avatars">
        <div class="a" style="background:#dcd1c4">FK</div>
        <div class="a" style="background:#cdb6f0">HM</div>
        <div class="a" style="background:#f4cdb1">TH</div>
        <div class="a r">+5</div>
      </div>
      <button class="btn-act" onclick="toast && toast('Open SKU list')">View SKUs <span class="arr">→</span></button>
    </div>
  </div>
  <div class="round-card">
    <div class="rc-title">
      <h3>Locked bucket</h3>
      <div class="sub">207 SKUs · 18 contracts · earliest renew Q3 '26</div>
    </div>
    <div class="round-tags">
      <span class="tag-chip">€2.37M locked</span>
      <span class="tag-chip status amber">In renewal queue</span>
    </div>
    <div class="round-foot">
      <div class="avatars">
        <div class="a" style="background:#cdc6b4">MD</div>
        <div class="a" style="background:#d8b4b4">TI</div>
        <div class="a r">+3</div>
      </div>
      <button class="btn-act" onclick="toast && toast('Open renewal queue')">View renewals <span class="arr">→</span></button>
    </div>
  </div>
</div>
```

- [ ] **Step 4.3: Add `.btn-primary` styles**

The `.btn-primary` inside the hero is dark, not rose. Append to style block:

```css
body.pryzm-2026 .btn-primary{
  background:var(--ink); color:#fff; border:none; border-radius:8px;
  padding:9px 14px; font-size:12.5px; font-weight:600; cursor:pointer;
  display:inline-flex; align-items:center; gap:6px;
  transition:background .15s, transform .1s;
}
body.pryzm-2026 .btn-primary:hover{ background:#000; }
body.pryzm-2026 .btn-primary svg{ width:11px; height:11px; }
```

- [ ] **Step 4.4: Update `heroSpark` Chart.js styling**

Find the existing `heroSpark` chart init JS (search the file for `heroSpark`). Update the dataset options:

```js
borderColor: '#a35a5a',
backgroundColor: 'rgba(163,90,90,0.10)',
borderWidth: 2,
fill: true,
tension: 0.35,
pointRadius: 0,
```

If the chart was originally a different type or used different options, make minimum changes to swap colors only.

- [ ] **Step 4.5: Verify**

Playwright screenshot at 1440px. Hero card matches source: large `€3.88M` headline, green `+9.2% vs Wk 17` delta, three-column split, 6px progress bar (62% rose / 38% gray), dark CTA button on right of CTA row, sparkline with rose fill on the right column. Two round cards below.

- [ ] **Step 4.6: Commit**

```bash
git add Pryzm_Dashboard_Mockup_Frank.html
git commit -m "frank-redesign: T2 page-head + hero + round cards"
```

---

## Task 5: Today's analyst decisions — re-render `actions-list` with `.action-card`

**Files:**
- Modify: `Pryzm_Dashboard_Mockup_Frank.html` (style block + `renderActions()` JS at line ~4911)

- [ ] **Step 5.1: Append action-card + section-row + signal-with-trend + feedback styles**

Copy from source lines 526–730, body-prefixed: `.section-row`, `.icon-btn-sq`, `.actions-list`, `.action-card`, `.ac-section`, `.ac-head`, `.ac-rank`, `.ac-title`, `.ac-tools`, `.grip`, `.ac-chips`, `.ac-meta-grid`, `.meta-block`, `.select-pill`, `.input-pill`, `.signal-block`, `.signal-with-trend`, `.signal-pane`, `.trend-pane`, `.fact-list`, `.fact-row`, `.fact-l`, `.fact-mid`, `.fact-v`, `.fact-s`, `.ac-feedback`, `.fb-group`, `.fbtn`, `.fb-pop`, `.ac-cta-row`, `.btn-secondary`, `.btn-primary-rose`.

- [ ] **Step 5.2: Replace section-row markup before `actions-list`**

Replace lines ~1697–1702 (the current `.between` block) with:

```html
<div class="section-row" id="sec-decisions">
  <div>
    <h2>Today's analyst decisions</h2>
    <div class="sub">Ranked by impact. Frank analyzes; outputs flow to Heiko (Sales) and Till (MD). Generated Mon 8:00 · reranks daily.</div>
  </div>
  <div class="section-tools">
    <button class="icon-btn-sq" title="Add"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M12 5v14M5 12h14"/></svg></button>
    <button class="icon-btn-sq" title="More"><svg viewBox="0 0 24 24" fill="currentColor"><circle cx="6" cy="12" r="1.6"/><circle cx="12" cy="12" r="1.6"/><circle cx="18" cy="12" r="1.6"/></svg></button>
  </div>
</div>
```

- [ ] **Step 5.3: Replace `renderActions()` (line ~4911) — emit new `.action-card` markup**

Replace the entire `renderActions()` function with the version below. The data array `ACTIONS` (line ~4887) is preserved as-is.

```js
function renderActions(){
  const list = document.getElementById('actions-list');
  list.innerHTML = ACTIONS.map((a,i)=>{
    const clusterChip = a.cluster
      ? `<span class="tag-chip"><span style="display:inline-block;width:6px;height:6px;border-radius:50%;background:${a.cluster.confidence>=80?'var(--green)':a.cluster.confidence>=60?'var(--amber)':'var(--red)'};margin-right:4px"></span>Cluster ${a.cluster.label} · ${a.cluster.confidence}% (n=${a.cluster.n})</span>`
      : '';
    const contractChip = a.contract==='locked'
      ? `<span class="tag-chip status amber">Locked</span>`
      : a.contract==='movable'
      ? `<span class="tag-chip status">Movable</span>` : '';
    return `
    <div class="action-card" data-aid="${a.id}">
      <div class="ac-section">
        <div class="ac-head">
          <div class="ac-rank">${i+1}</div>
          <div class="ac-title">
            <div class="h">${a.headline}</div>
            <div class="t">${a.tag} · ${ageLabel(a.daysOpen)} · ${a.authorityLabel}</div>
          </div>
          <div class="ac-tools">
            <button class="b" title="Snooze"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/></svg></button>
            <button class="b" title="More"><svg viewBox="0 0 24 24" fill="currentColor"><circle cx="6" cy="12" r="1.6"/><circle cx="12" cy="12" r="1.6"/><circle cx="18" cy="12" r="1.6"/></svg></button>
            <span class="grip" title="Drag"><svg viewBox="0 0 24 24" fill="currentColor"><circle cx="9" cy="6" r="1.4"/><circle cx="15" cy="6" r="1.4"/><circle cx="9" cy="12" r="1.4"/><circle cx="15" cy="12" r="1.4"/><circle cx="9" cy="18" r="1.4"/><circle cx="15" cy="18" r="1.4"/></svg></span>
          </div>
        </div>
        <div class="ac-chips" style="display:flex;gap:6px;flex-wrap:wrap">
          ${clusterChip}${contractChip}
          <span class="tag-chip">${a.tag}</span>
        </div>
      </div>
      <div class="ac-section">
        <div class="ac-meta-grid">
          <div class="meta-block"><div class="lab">Expected impact</div><div class="val green">${a.impact}</div></div>
          <div class="meta-block"><div class="lab">Confidence</div><div class="val">${a.conf}</div></div>
          <div class="meta-block"><div class="lab">Customer</div><div class="val">${a.cust}</div></div>
          <div class="meta-block"><div class="lab">Article / SKU</div><div class="val">${a.sku}</div></div>
        </div>
        <div class="signal-with-trend">
          <div class="signal-pane">
            <div class="ttl">Why this surfaced <span class="ttl-sub">— rationale</span></div>
            <ul style="margin:0;padding:0;list-style:none;color:var(--ink-3);font-size:12.5px;line-height:1.7"><li>${a.rationale}</li></ul>
          </div>
          <div class="trend-pane">
            <div class="lab">Margin trend</div>
            <div class="v">${a.impact}</div>
          </div>
        </div>
      </div>
      <div class="ac-section">
        <div class="ac-feedback" data-fb="${a.id}">
          <button class="fbtn acc" data-act="acc"><span class="ic">✓</span>Accept &amp; Implement</button>
          <button class="fbtn nim" data-act="nim"><span class="ic">◐</span>Accept, Not Implemented</button>
          <button class="fbtn par" data-act="par"><span class="ic">◑</span>Accept, Partial</button>
          <button class="fbtn rej" data-act="rej"><span class="ic">✗</span>Reject</button>
          <button class="fbtn ab" data-act="ab"><span class="ic">🧪</span>Slice as A/B test</button>
        </div>
        <div class="extra" data-extra="par-${a.id}" style="display:none;margin-top:10px">
          <label class="muted small">Actual value implemented (€)</label>
          <input class="input-pill" type="text" placeholder="e.g. 8,400" />
        </div>
        <div class="extra" data-extra="rej-${a.id}" style="display:none;margin-top:10px">
          <label class="muted small">Reason for rejection</label>
          <select class="select-pill">
            <option>— Select reason —</option>
            <option>Customer relationship</option>
            <option>Market conditions</option>
            <option>Strategic decision</option>
            <option>Pricing already addressed</option>
            <option>Other</option>
          </select>
        </div>
        <div class="ac-cta-row">
          <button class="btn-secondary">Route to Heiko (Sales)</button>
          <button class="btn-primary-rose">Open in Studio →</button>
        </div>
      </div>
    </div>`;
  }).join('');

  // hooks (preserve existing behavior)
  list.querySelectorAll('.ac-feedback').forEach(fb=>{
    fb.querySelectorAll('.fbtn').forEach(btn=>{
      btn.addEventListener('click',()=>{
        fb.querySelectorAll('.fbtn').forEach(b=>b.classList.remove('selected'));
        btn.classList.add('selected');
        const card = fb.closest('.action-card');
        card.querySelectorAll('.extra').forEach(e=>{ e.style.display='none'; });
        const act = btn.dataset.act;
        if (act==='par'){ const ex = card.querySelector(`[data-extra="par-${fb.dataset.fb}"]`); if(ex) ex.style.display='block'; }
        if (act==='rej'){ const ex = card.querySelector(`[data-extra="rej-${fb.dataset.fb}"]`); if(ex) ex.style.display='block'; }
      });
    });
  });
}
```

- [ ] **Step 5.4: Verify**

Reload via Playwright. Three action cards render with: numbered rank pill (1, 2, 3), title block with headline + meta, chips row, 4-column meta grid, signal-with-trend split panel, five feedback buttons, secondary + rose primary CTAs at bottom. Click "Accept, Partial" — input field appears. Click "Reject" — select dropdown appears.

- [ ] **Step 5.5: Commit**

```bash
git add Pryzm_Dashboard_Mockup_Frank.html
git commit -m "frank-redesign: T3 today's analyst decisions (action-card pattern)"
```

---

## Task 6: Trust strip + lost-quote + SKU table (Sections 5–7)

**Files:**
- Modify: `Pryzm_Dashboard_Mockup_Frank.html` (style block + sections inside `#screen-action-pm`)

- [ ] **Step 6.1: Append styles**

Copy from source: `.trust-grid`, `.trust-tile`, `.trust-spark-wrap`, `.lq-card`, `.lq-grid`, `.lq-stats`, `.lq-stat`, `.lq-foot`, `.sig-pill`, `.lq-bar-wrap`, `.lq-bar`, `.sku-card`, `.frank-table`, `.cluster-conf`, `.cc-dot`, `.contract-chip`, `.row-btn`. All body-prefixed.

- [ ] **Step 6.2: Replace Sections 3 (Trust), 4 (Lost-Quote), 6 (SKU Table) markup in `#screen-action-pm`**

Currently in the file: Trust at lines 1648–1674, Lost-Quote at 1676–1694, SKU Table at 1706–1733. Re-order to match source (Trust, Lost-Quote, SKU Table all come AFTER actions-list). Use this markup:

```html
<div class="section-row" id="sec-trust">
  <div>
    <h2>Model trust · transparency strip</h2>
    <div class="sub">Click any tile for feature importance &amp; training history.</div>
  </div>
</div>
<div class="trust-grid">
  <div class="trust-tile" data-trust="churn">
    <div class="lab">Churn model F1</div>
    <div class="big">0.76</div>
    <div class="cap">precision 0.72 · recall 0.81 · n=827 customers</div>
  </div>
  <div class="trust-tile" data-trust="forecast">
    <div class="lab">Forecast error</div>
    <div class="big">&lt;5%</div>
    <div class="cap">Q1 2025 actuals · walk-forward retraining · MC bands</div>
  </div>
  <div class="trust-tile" data-trust="anomaly">
    <div class="lab">Anomalies caught</div>
    <div class="big">33</div>
    <div class="cap">15 negative-margin · 18 missing-data · €342K exposure</div>
  </div>
  <div class="trust-tile" data-trust="coverage">
    <div class="lab">Data coverage</div>
    <div class="big">99.2%</div>
    <div class="cap">Invoices 99.2% · Margin 89.4% · Quote 73.1% (gap)</div>
  </div>
</div>

<div class="section-row" id="sec-lost">
  <div>
    <h2>Lost-quote margin differential</h2>
    <div class="sub">Sales is systematically losing the highest-margin deals. Statistically significant across 1,313 linked records.</div>
  </div>
</div>
<div class="lq-card">
  <div class="lq-grid">
    <div>
      <div class="lq-stats">
        <div class="lq-stat"><div class="num">70.6%</div><div class="lab">Won deals avg margin</div></div>
        <div class="lq-stat"><div class="num">72.4%</div><div class="lab">Lost deals avg margin</div></div>
        <div class="lq-stat diff"><div class="num">+1.8pp</div><div class="lab">Differential (LOST higher!)</div></div>
        <span class="sig-pill">p = 0.006 · significant</span>
      </div>
      <div class="lq-bar-wrap">
        <div class="lq-bar"><span class="l">Won</span><span class="t"><span class="f" style="width:70.6%"></span></span><span class="v">70.6%</span></div>
        <div class="lq-bar lost"><span class="l">Lost</span><span class="t"><span class="f" style="width:72.4%"></span></span><span class="v">72.4%</span></div>
      </div>
      <p style="margin:14px 0 0;color:var(--ink-3);font-size:12.5px;line-height:1.6;max-width:60ch">
        Customers walk away from premium-margin quotes. <b style="color:var(--ink)">Implication:</b> pricing logic on premium tier is leaving deals on the table.
      </p>
    </div>
  </div>
  <div class="lq-foot">
    <div class="ftxt">Shared with <b>Heiko</b> · <b>Till</b> · last refresh 8:00</div>
    <button class="btn-primary-rose lq-cta" onclick="setScreen && setScreen('margin')">Open lost-quote analysis →</button>
  </div>
</div>

<div class="section-row" id="sec-sku">
  <div>
    <h2>SKU pricing engine</h2>
    <div class="sub">Item-level view — cluster confidence and contract status disclosed per row.</div>
  </div>
  <label class="row gap-8" style="font-size:12.5px;color:var(--muted);cursor:pointer">
    <input type="checkbox" id="frankHideLocked" />
    <span>Hide contract-locked items</span>
  </label>
</div>
<div class="sku-card">
  <div class="table-wrap">
    <table class="frank-table">
      <thead>
        <tr><th>Article</th><th>Description</th><th>Commodity</th><th>Cluster conf.</th><th>Margin Δ</th><th>Status</th><th>Action</th></tr>
      </thead>
      <tbody>
        <tr data-status="movable"><td><b>200832-E</b></td><td>Elektro-Zahnradpumpe</td><td>BKAES</td><td><span class="cluster-conf high"><span class="cc-dot"></span>82%</span></td><td>30.6% → <b style="color:var(--red)">6.4%</b></td><td><span class="contract-chip movable">Movable</span></td><td><button class="row-btn" onclick="setScreen && setScreen('studio')">Open in Studio</button></td></tr>
        <tr data-status="movable"><td><b>204604</b></td><td>Zahnradpumpe</td><td>BKAGG</td><td><span class="cluster-conf mid"><span class="cc-dot"></span>74%</span></td><td>32.7% → <b style="color:var(--red)">11.8%</b></td><td><span class="contract-chip movable">Movable</span></td><td><button class="row-btn" onclick="setScreen && setScreen('studio')">Open in Studio</button></td></tr>
        <tr data-status="locked"><td><b>205169</b></td><td>Zahnradpumpe</td><td>BKAGG</td><td><span class="cluster-conf mid"><span class="cc-dot"></span>74%</span></td><td>70.1% → <b style="color:var(--amber)">44.2%</b></td><td><span class="contract-chip locked">Locked Q3</span></td><td><button class="row-btn" onclick="toast && toast('Queue renewal')">Queue renewal</button></td></tr>
        <tr data-status="movable"><td><b>200834-B</b></td><td>Elektro-Zahnradpumpe</td><td>BKAES</td><td><span class="cluster-conf high"><span class="cc-dot"></span>82%</span></td><td>55.8% → <b>36.8%</b></td><td><span class="contract-chip movable">Movable</span></td><td><button class="row-btn" onclick="setScreen && setScreen('studio')">Open in Studio</button></td></tr>
        <tr data-status="locked"><td><b>201773</b></td><td>Zahnradpumpe</td><td>BKAGG</td><td><span class="cluster-conf mid"><span class="cc-dot"></span>74%</span></td><td>62.5% → <b style="color:var(--amber)">23.1%</b></td><td><span class="contract-chip locked">Locked Q1</span></td><td><button class="row-btn" onclick="toast && toast('Queue renewal')">Queue renewal</button></td></tr>
        <tr data-status="abtest"><td><b>205418-A</b></td><td>Coupling B</td><td>BKAES</td><td><span class="cluster-conf high"><span class="cc-dot"></span>82%</span></td><td>—</td><td><span class="contract-chip abtest">A/B</span></td><td><button class="row-btn primary" onclick="toast && toast('A/B test detail')">View test →</button></td></tr>
      </tbody>
    </table>
  </div>
</div>
```

- [ ] **Step 6.3: Verify**

Playwright screenshot. Trust strip = 4 tiles with large numbers. Lost-quote = stats row + two bars + sig-pill + footer with rose CTA. SKU table = clean rows with cluster confidence pills, contract chips.

- [ ] **Step 6.4: Commit**

```bash
git add Pryzm_Dashboard_Mockup_Frank.html
git commit -m "frank-redesign: T4 trust strip + lost-quote + SKU table"
```

---

## Task 7: Right rail — notifications, reviewers, sections jump-list

**Files:**
- Modify: `Pryzm_Dashboard_Mockup_Frank.html` (style block + `.rail` markup)

- [ ] **Step 7.1: Append rail styles**

Copy from source: `.rail-card`, `.notif-card`, `.notif`, `.notif-ic`, `.notif-body`, `.notif-title`, `.notif-sub`, `.notif-arr`, `.notif-foot`, `.rail-h`, `.arrow-btn`, `.add-section`, `.sec-list`, `.sec-row`, `.sec-arr`. Body-prefixed.

- [ ] **Step 7.2: Replace `.rail` inner markup**

Replace the existing right-rail contents (inside `<div class="rail">`) with source lines 1494–1572. Keep section anchors (`#sec-movable`, `#sec-decisions`, `#sec-trust`, `#sec-lost`, `#sec-sku` — all already added in Tasks 4 / 5 / 6).

- [ ] **Step 7.3: Verify**

Playwright. Right rail shows: 3 notifications card with rose unread dots, "Assigned reviewers" with 5 avatars (HM/TI/TH/NB/+5), "Sections" jump-list with 5 anchors. Clicking any sec-row scrolls main to that section.

- [ ] **Step 7.4: Commit**

```bash
git add Pryzm_Dashboard_Mockup_Frank.html
git commit -m "frank-redesign: T4.b right rail (notifications + reviewers + sections)"
```

---

## Task 8: Frank-only sections redesigned (Sections 8–14)

**Files:**
- Modify: `Pryzm_Dashboard_Mockup_Frank.html` (style block + sections 8–14 inside `#screen-action-pm`)

These seven sections exist in Frank but not in the source design. Each gets redesigned into a new-design pattern. Markup is provided per sub-step. Add styles only as needed (most reuse existing `.lq-card`, `.round-card`, `.action-card`, `.tag-chip` patterns).

- [ ] **Step 8.1: Section 8 — Heterogeneous portfolio diagnostics → `.lq-card`**

Replace existing markup (currently lines 1735–1742) with:

```html
<div class="section-row" id="sec-portfolio">
  <div>
    <h2>Heterogeneous portfolio diagnostics</h2>
    <div class="sub">Win-rate by margin band × commodity group. Low-n cells flagged — do not auto-act.</div>
  </div>
</div>
<div class="lq-card">
  <div class="heatmap" id="frankHeatmap" style="display:grid;grid-template-columns:repeat(6,1fr);gap:6px"></div>
  <div class="commodity-scorecards" id="frankScorecards" style="display:flex;flex-wrap:wrap;gap:8px;margin-top:14px"></div>
</div>
```

Update the JS that renders heatmap cells (search for `frankHeatmap` in the file). Change cell colors to use the new tokens: low n → `--surface-sunken` border-dashed; high win → `--green-bg` text `--green`; mid → `--amber-bg` text `--amber`; low → `--rose-bg` text `--rose-deep`.

Update `frankScorecards` cell template to use `.tag-chip` styling.

- [ ] **Step 8.2: Section 9 — Long-tail coverage → `.trust-grid` + redesigned stack-bar**

Replace existing markup (lines 1744–1758) with:

```html
<div class="section-row" id="sec-longtail">
  <div>
    <h2>Long-tail coverage · B and C products</h2>
    <div class="sub">C-tier coverage gap — 47 SKUs price-frozen &gt;9 months.</div>
  </div>
</div>
<div class="trust-grid">
  <div class="trust-tile"><div class="lab">Top-10 SKU concentration</div><div class="big">38%</div><div class="cap">of revenue</div></div>
  <div class="trust-tile"><div class="lab">SKUs below DB-II target</div><div class="big">207</div><div class="cap">warning 145 + critical 62</div></div>
  <div class="trust-tile"><div class="lab">New products (last 12mo)</div><div class="big">203</div><div class="cap">€1.5M revenue · 8.3% of total</div></div>
  <div class="trust-tile"><div class="lab">C-tier price-frozen</div><div class="big">47</div><div class="cap">SKUs untouched &gt;9 months</div></div>
</div>
<div class="lq-card" style="margin-top:14px;padding:18px 20px">
  <div style="font-size:11px;color:var(--muted);text-transform:uppercase;letter-spacing:.06em;font-weight:600;margin-bottom:8px">Revenue mix · A / B / C</div>
  <div style="display:flex;height:10px;border-radius:6px;overflow:hidden;background:var(--surface-soft)">
    <div style="flex:0 0 38%;background:var(--rose)" title="A · 38%"></div>
    <div style="flex:0 0 35%;background:var(--amber)" title="B · 35%"></div>
    <div style="flex:1;background:var(--muted-2)" title="C · 27%"></div>
  </div>
  <div style="display:flex;justify-content:space-between;font-size:11.5px;color:var(--muted);margin-top:8px">
    <span><b style="color:var(--ink-2)">A · 38%</b> top 10% (well-covered)</span>
    <span><b style="color:var(--ink-2)">B · 35%</b> mid 40% (partial)</span>
    <span><b style="color:var(--ink-2)">C · 27%</b> bottom 50% (gap)</span>
  </div>
</div>
```

- [ ] **Step 8.3: Section 10 — Annual list-price negotiation cockpit → collapsible `.lq-card`**

Replace existing markup (lines 1760–1794) with:

```html
<div class="section-row" id="sec-neg">
  <div>
    <h2>Annual list-price negotiation cockpit</h2>
    <div class="sub">Synthesized prep — list vs quoted, commodity trajectory, market direction.</div>
  </div>
  <button class="head-pill" id="negToggle">Expand <span style="font-size:9px;color:var(--muted)">▾</span></button>
</div>
<div class="lq-card" id="negCockpit" style="display:none">
  <div class="signal-with-trend">
    <div class="signal-pane">
      <div class="ttl">4-year price/margin trend <span class="ttl-sub">— list vs quoted average · discount narrowing 32.4% → 17.4%</span></div>
      <div style="height:200px;margin-top:10px"><canvas id="frankPriceTrend"></canvas></div>
    </div>
    <div class="trend-pane">
      <div class="lab">Discount gap</div>
      <div class="v">17.4% <span class="down" style="color:var(--green)">−15pp</span></div>
    </div>
  </div>
  <div style="margin-top:14px">
    <div class="ttl" style="font-size:12.5px;font-weight:700;color:var(--ink);margin-bottom:10px">8-commodity trajectory</div>
    <div class="fact-list">
      <div class="fact-row"><div class="fact-l">Steel</div><div class="fact-mid"><div class="fact-v green">+5.8% YTD</div><div class="fact-s">pass-through 3pp behind cost</div></div></div>
      <div class="fact-row"><div class="fact-l">Aluminum</div><div class="fact-mid"><div class="fact-v green">+2.1%</div></div></div>
      <div class="fact-row"><div class="fact-l">Copper</div><div class="fact-mid"><div class="fact-v red">−1.4%</div></div></div>
      <div class="fact-row"><div class="fact-l">Brass</div><div class="fact-mid"><div class="fact-v green">+3.2%</div></div></div>
      <div class="fact-row"><div class="fact-l">Cast iron</div><div class="fact-mid"><div class="fact-v green">+0.9%</div></div></div>
      <div class="fact-row"><div class="fact-l">Plastic resin</div><div class="fact-mid"><div class="fact-v red">−0.6%</div></div></div>
      <div class="fact-row"><div class="fact-l">Stainless</div><div class="fact-mid"><div class="fact-v green">+4.1%</div></div></div>
      <div class="fact-row"><div class="fact-l">Electronics</div><div class="fact-mid"><div class="fact-v green">+1.7%</div></div></div>
    </div>
  </div>
  <div style="margin-top:14px">
    <div class="ttl" style="font-size:12.5px;font-weight:700;color:var(--ink);margin-bottom:8px">Market direction summary</div>
    <ul style="margin:0;padding:0;list-style:none;color:var(--ink-3);font-size:12.5px;line-height:1.7">
      <li>Steel pass-through 3pp behind cost</li>
      <li>Raw materials moderating</li>
      <li><b style="color:var(--ink)">Negotiation window: Sep–Nov 2026</b></li>
    </ul>
  </div>
</div>
<script>
(function(){
  const t=document.getElementById('negToggle'); const c=document.getElementById('negCockpit');
  if(t&&c) t.addEventListener('click',()=>{ const open=c.style.display==='block'; c.style.display=open?'none':'block'; t.firstChild.textContent=open?'Expand ':'Collapse '; });
})();
</script>
```

Update Chart.js `frankPriceTrend` colors: dataset 1 `borderColor:'#a35a5a'` (rose); dataset 2 `borderColor:'#15140f'` (ink); grid lines `color:'rgba(0,0,0,0.05)'`; tick color `'#56544f'`.

- [ ] **Step 8.4: Section 11 — A/B Test Tracker → `.actions-list` of `.action-card`**

Replace existing markup (lines 1796–1822) with:

```html
<div class="section-row" id="sec-ab">
  <div>
    <h2>A/B Test Tracker</h2>
    <div class="sub">Test before broad rollout. Frank's first-class workflow.</div>
  </div>
  <button class="head-pill" onclick="toast && toast('A/B wizard opened')">+ Start new A/B test</button>
</div>
<div class="actions-list">
  <div class="action-card">
    <div class="ac-section">
      <div class="ac-head">
        <div class="ac-rank">A</div>
        <div class="ac-title"><div class="h">205418-A · Coupling B</div><div class="t">slice 12% · day 9 of 21</div></div>
        <div class="ac-tools"><span class="tag-chip status">trending positive</span></div>
      </div>
      <div class="ac-meta-grid" style="margin-top:14px">
        <div class="meta-block"><div class="lab">Pre margin</div><div class="val">24.0%</div></div>
        <div class="meta-block"><div class="lab">Post margin (n=18)</div><div class="val green">27.3%</div></div>
        <div class="meta-block"><div class="lab">Lift</div><div class="val green">+3.3pp</div></div>
        <div class="meta-block"><div class="lab">Status</div><div class="val">Day 9 / 21</div></div>
      </div>
      <div class="ac-cta-row" style="margin-top:14px">
        <button class="btn-secondary">Hold</button>
        <button class="btn-primary-rose" onclick="toast && toast('Promoted')">Promote to full rollout →</button>
      </div>
    </div>
  </div>
  <div class="action-card">
    <div class="ac-section">
      <div class="ac-head">
        <div class="ac-rank">B</div>
        <div class="ac-title"><div class="h">211094-C · Bearing housing</div><div class="t">slice 8% · day 3 of 14</div></div>
        <div class="ac-tools"><span class="tag-chip status amber">too few samples</span></div>
      </div>
      <div class="ac-meta-grid" style="margin-top:14px">
        <div class="meta-block"><div class="lab">Pre margin</div><div class="val">22.0%</div></div>
        <div class="meta-block"><div class="lab">Post margin (n=4)</div><div class="val">21.5%</div></div>
        <div class="meta-block"><div class="lab">Lift</div><div class="val">−0.5pp</div></div>
        <div class="meta-block"><div class="lab">Status</div><div class="val">Day 3 / 14</div></div>
      </div>
      <div class="ac-cta-row" style="margin-top:14px">
        <button class="btn-secondary" onclick="toast && toast('Holding for more data')">Hold for more data</button>
        <button class="btn-secondary">Stop test</button>
      </div>
    </div>
  </div>
</div>
<div class="muted" style="margin-top:6px;font-style:italic;font-size:11.5px;color:var(--muted)">demo data — A/B workflow scaffold; real tests start in pilot week 4.</div>
```

- [ ] **Step 8.5: Section 12 — Why we lose / rejection codes → compact `.actions-list`**

Replace existing markup (lines 1824–1829) with:

```html
<div class="section-row" id="sec-rej">
  <div>
    <h2>Why we lose · ranked by revenue lost</h2>
    <div class="sub">Rejection codes from the lost-quote pipeline. KA dominates — data-quality issue you should drive.</div>
  </div>
</div>
<div class="actions-list" id="frankRejections"></div>
```

Update the `frankRejections` JS renderer (search the file for `frankRejections`). Replace each row template with:

```js
`<div class="action-card"><div class="ac-section"><div class="ac-head">
  <div class="ac-rank">${idx+1}</div>
  <div class="ac-title"><div class="h">${r.code} · ${r.label}</div><div class="t">${r.count} quotes · ${r.share}% of losses</div></div>
  <div class="ac-tools"><span class="tag-chip status ${r.severity==='high'?'red':r.severity==='mid'?'amber':''}">€${r.lost} lost</span></div>
</div></div></div>`
```

If the existing data shape differs, adapt the field names while keeping the same visual layout.

- [ ] **Step 8.6: Section 13 — Audit trail → `.lq-card` timeline using `.fact-row`**

Replace existing markup (lines 1831–1843) with:

```html
<div class="section-row" id="sec-audit">
  <div>
    <h2>Audit trail · last 30 days</h2>
    <div class="sub">Author · timestamp · change · pre→post. Audit-ready.</div>
  </div>
</div>
<div class="lq-card">
  <div class="fact-list">
    <div class="fact-row"><div class="fact-l">2026-04-30 14:22</div><div class="fact-mid"><div class="fact-v">Frank — Updated rule "Min DB II margin 45%"</div><div class="fact-s">pre: 42% → post: <b>45%</b> · 531 violations affected</div></div></div>
    <div class="fact-row"><div class="fact-l">2026-04-28 09:15</div><div class="fact-mid"><div class="fact-v">System — Churn model retrained</div><div class="fact-s">2022-Q1 to 2024-Q3 · 827 customers · F1 0.74→<b>0.76</b></div></div></div>
    <div class="fact-row"><div class="fact-l">2026-04-26 16:48</div><div class="fact-mid"><div class="fact-v">Frank — Adjusted catalog price 200832-E</div><div class="fact-s">€4.10 → <b>€4.38</b> · A/B initiated</div></div></div>
    <div class="fact-row"><div class="fact-l">2026-04-22 11:03</div><div class="fact-mid"><div class="fact-v">M. Becker — Approved discount exception</div><div class="fact-s">Customer 102330 · −12% (justified)</div></div></div>
    <div class="fact-row"><div class="fact-l">2026-04-15 08:30</div><div class="fact-mid"><div class="fact-v">System — Anomaly detection retrained</div><div class="fact-s">monthly · 18,462 invoices</div></div></div>
    <div class="fact-row"><div class="fact-l">2026-04-10 15:55</div><div class="fact-mid"><div class="fact-v">Frank — Added cluster definition BKAGG sub-cluster "Standard pumps"</div><div class="fact-s">n=287</div></div></div>
  </div>
</div>
```

- [ ] **Step 8.7: Section 14 — Generate branded report → `.round-card` style**

Replace existing markup (lines 1845–1854) with:

```html
<div class="section-row" id="sec-report">
  <div>
    <h2>Generate branded report</h2>
    <div class="sub">Auto-generated in Scherzinger corporate design. Audit trail attached. Reports persisted for board review.</div>
  </div>
</div>
<div class="round-grid">
  <div class="round-card">
    <div class="rc-title"><h3>Branded PDF</h3><div class="sub">Corporate design · audit trail attached</div></div>
    <div class="round-tags"><span class="tag-chip">PDF</span><span class="tag-chip">Audit-ready</span></div>
    <div class="round-foot">
      <div></div>
      <button class="btn-act" onclick="toast && toast('Branded PDF queued')">Generate PDF <span class="arr">→</span></button>
    </div>
  </div>
  <div class="round-card">
    <div class="rc-title"><h3>Send to Till</h3><div class="sub">Board pack · synthesizes Frank's outputs for upward communication</div></div>
    <div class="round-tags"><span class="tag-chip">Board pack</span><span class="tag-chip status">Forwardable</span></div>
    <div class="round-foot">
      <div></div>
      <button class="btn-act" onclick="toast && toast('Sent to Till')">Send to Till <span class="arr">→</span></button>
    </div>
  </div>
</div>
```

- [ ] **Step 8.8: Verify**

Playwright screenshot full page at 1440px. All 14 sections render in order, no overflow, no broken charts, no console errors.

- [ ] **Step 8.9: Commit**

```bash
git add Pryzm_Dashboard_Mockup_Frank.html
git commit -m "frank-redesign: T5 redesign Frank-only sections 8-14"
```

---

## Task 9: QA pass — chart palette sweep, drawer/toast verify, screenshots

**Files:**
- Modify: `Pryzm_Dashboard_Mockup_Frank.html` (Chart.js init code, drawer markup if needed)

- [ ] **Step 9.1: Chart palette sweep**

Search the file for every `new Chart(` invocation. For each chart in `#screen-action-pm`, ensure dataset colors come from the new palette:
- Primary line: `#a35a5a` (rose)
- Secondary line: `#15140f` (ink)
- Positive: `#2f7d5b` (green)
- Warning: `#a5701f` (amber)
- Negative: `#9a3232` (red)
- Grid: `rgba(0,0,0,0.05)`
- Ticks: `#56544f`
- Family on tick fonts: `Inter`

Charts to update: `heroSpark` (already done T2), `frankPriceTrend` (already done T8), any sparklines in trust-tiles (if they exist), commodity-trajectory mini-sparks.

- [ ] **Step 9.2: Verify drawer**

Click any `.trust-tile` (e.g., the churn one). Drawer opens. Confirm: drawer chrome uses new tokens (white surface, border `--border`, headline Manrope, close button restyled). If not, append drawer overrides:

```css
body.pryzm-2026 .frank-drawer{ background:var(--surface); border-left:1px solid var(--border); box-shadow:var(--shadow-pop); font-family:'Inter',sans-serif; }
body.pryzm-2026 .frank-drawer h3{ font-family:'Manrope',sans-serif; color:var(--ink); }
body.pryzm-2026 .fd-close{ color:var(--muted); }
body.pryzm-2026 .fd-close:hover{ color:var(--ink); }
```

- [ ] **Step 9.3: Verify toast**

Trigger any toast (click "Open repricing queue" in hero). Toast should be dark `#15140f` rounded pill. If not, append:

```css
body.pryzm-2026 .toast{ background:var(--ink); color:#fff; border-radius:12px; padding:11px 16px; font-family:'Inter',sans-serif; font-size:12.5px; box-shadow:var(--shadow-pop); }
```

- [ ] **Step 9.4: Take final screenshots**

Via Playwright MCP at viewports 1440x900 and 1920x1080. Save as:
- `frank-redesign-1440-full.png` (full page scroll)
- `frank-redesign-1440-viewport.png` (above the fold)
- `frank-redesign-1920-full.png`

Compare each side-by-side with the source design `new test2/Pryzm Action Center.html` rendered at the same viewport. Note any visual deltas.

- [ ] **Step 9.5: Persona switcher regression check**

Switch to MD persona via the persona switcher. Confirm: `#screen-action-md` shows (legacy look — that's expected for round 1), nav items hide/show correctly, no JS errors. Switch to SR — same check. Switch back to PM — Frank screen renders correctly.

- [ ] **Step 9.6: Address any deltas inline**

For each visual delta from Step 9.4, fix in the style block. Common likely issues: hero card padding, round-card avatar overlap, lq-card stat alignment. Re-screenshot to confirm.

- [ ] **Step 9.7: Commit**

```bash
git add Pryzm_Dashboard_Mockup_Frank.html
git commit -m "frank-redesign: T6 QA pass — chart palette + drawer/toast + screenshots"
```

---

## Self-review checklist (run before handoff)

- [x] Spec § "Design tokens to adopt" → Task 1 covers all tokens.
- [x] Spec § "Layout" → Task 2 covers `.app/.shell/aside/main/.rail`.
- [x] Spec sections 1–14 → Tasks 4 (1–3), 5 (4), 6 (5–7), 7 (right rail), 8 (8–14).
- [x] Spec § "JS behavior preserved" → Tasks 5 and 9 preserve hooks; persona switcher untouched.
- [x] Spec § "Right rail content" → Task 7.
- [x] Spec § "Acceptance criteria" 1–7 → Task 9 verifies via screenshots + persona regression.
- No "TBD" / placeholder steps.
- Method/property names consistent: `renderActions`, `ACTIONS`, `setScreen`, `toast`, `frankHideLocked`, `frankPriceTrend`, `frankHeatmap`, `frankRejections`, `heroSpark` — all match what's in the existing file.

---

**Plan complete and saved to `docs/superpowers/plans/2026-05-06-frank-action-center-redesign.md`. Two execution options:**

**1. Subagent-Driven (recommended)** — I dispatch a fresh subagent per task, review between tasks, fast iteration.

**2. Inline Execution** — Execute tasks in this session using executing-plans, batch execution with checkpoints.

**Which approach?**
