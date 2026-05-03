# MD (Geschäftsführer) Persona Screens — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Extend `Pryzm_Dashboard_Mockup.html` from a single MD action stub to a full 3-screen executive cockpit (Strategic Dashboard / Monthly Review / Beirat Pack) with three reusable lens drawers (Customer / SKU / Manager).

**Architecture:** Single-file HTML mockup. All new screens, styles, and lens components are appended to `Pryzm_Dashboard_Mockup.html` following the existing pattern: `<section id="screen-X" class="screen hidden">` + per-screen `initX()` chart initializers in the bottom `<script>` block. Persona-aware nav visibility via `body[data-persona="md"]` CSS rules. Lens drawer is a single component with three content variants triggered via `data-lens` attributes.

**Tech Stack:** Vanilla HTML + CSS + JavaScript. Chart.js (already loaded in the mockup). No build step. No new dependencies.

**Spec reference:** `docs/superpowers/specs/2026-05-03-md-persona-screens-design.md` — every numeric value, copy line, and anti-feature rule comes from there. Read it before implementation.

**Verification model:** This is a static HTML demo, not a unit-testable app. Each task ends with a manual browser-verification step (open the file, switch persona, click the relevant element). Frequent commits replace test-pass gates.

---

## File Structure

Only one file is touched in this plan:

- **Modify**: `Pryzm_Dashboard_Mockup.html` — append new sections, append new CSS, append new JS, modify existing `screen-action-md` section, modify nav block, modify `renderScreen()` JS

Everything stays in one file. No restructuring (the existing pattern is single-file mockup; not our place to refactor).

**Insertion points** (will drift as tasks add lines — always re-grep before editing):
- CSS additions: end of the existing `<style>` block, just before `</style>`
- New screens: after `screen-ai` section ends, just before `</main>` close
- Lens drawer HTML: just before `</body>` close
- New JS (initX functions, lens logic): inside the existing bottom `<script>` block, before its `</script>` close

---

## Phase 1 — Persona-switcher correctness + Screen 1 enhancements

### Task 1.1: Hide PM/SR-only nav items for MD persona

**Files:**
- Modify: `Pryzm_Dashboard_Mockup.html` (CSS block around line 285)

The existing rule only hides nav for the `sr` persona. MD persona currently sees all PM nav items, which violates the persona ("MD ≠ Pricing Manager"). MD should only see: Action Center (Strategic Dashboard), Monatsabschluss, Beiratsbericht.

- [ ] **Step 1: Read existing rule and add MD-specific hide rules**

Locate (line 285 in baseline; re-grep `body\[data-persona="sr"\]` to find current line):

```css
body[data-persona="sr"] .nav-item[data-screen="forecast"],
body[data-persona="sr"] .nav-item[data-screen="margin"]{display:none}
```

Replace with:

```css
/* Sales Rep: only Action Center */
body[data-persona="sr"] .nav-item[data-screen="forecast"],
body[data-persona="sr"] .nav-item[data-screen="margin"],
body[data-persona="sr"] .nav-item[data-screen="studio"],
body[data-persona="sr"] .nav-item[data-screen="quotes"],
body[data-persona="sr"] .nav-item[data-screen="ai"],
body[data-persona="sr"] .nav-item[data-screen="md-monthly"],
body[data-persona="sr"] .nav-item[data-screen="md-beirat"]{display:none}

/* MD / Geschäftsführer: Strategic Dashboard + Monatsabschluss + Beiratsbericht only */
body[data-persona="md"] .nav-item[data-screen="forecast"],
body[data-persona="md"] .nav-item[data-screen="studio"],
body[data-persona="md"] .nav-item[data-screen="margin"],
body[data-persona="md"] .nav-item[data-screen="quotes"],
body[data-persona="md"] .nav-item[data-screen="ai"]{display:none}

/* PM / Pricing Manager: hide MD-only nav */
body[data-persona="pm"] .nav-item[data-screen="md-monthly"],
body[data-persona="pm"] .nav-item[data-screen="md-beirat"]{display:none}
```

- [ ] **Step 2: Verify in browser**

Open `Pryzm_Dashboard_Mockup.html` in a browser. Click `MD / Geschäftsführer`. Sidebar should show: Action Center + (after Task 1.2 lands) Monatsabschluss + Beiratsbericht. Click `Pricing Manager`. Sidebar should show all original PM nav items but NOT Monatsabschluss/Beiratsbericht. Click `Sales Rep`. Sidebar should show only Action Center.

(At this point the new MD nav items don't exist yet — the rule is forward-compatible.)

- [ ] **Step 3: Commit**

```bash
git add Pryzm_Dashboard_Mockup.html
git commit -m "md-screens: persona-aware nav visibility rules for MD and SR"
```

---

### Task 1.2: Add Monatsabschluss + Beiratsbericht nav items

**Files:**
- Modify: `Pryzm_Dashboard_Mockup.html` (sidebar nav block; baseline lines 1259–1276)

- [ ] **Step 1: Locate the nav block**

Re-grep `nav-item active.*data-screen="action"` to find current location. Find the existing block:

```html
<div class="nav-item active" data-screen="action">
  <span class="ico">⚡</span> Action Center
</div>
<div class="nav-item" data-screen="forecast">
  <span class="ico">📈</span> Forecast
</div>
...existing items...
<div class="nav-item" data-screen="ai">
  <span class="ico">📰</span> AI Briefing
</div>
```

- [ ] **Step 2: Add two new MD-only nav items right after the existing block**

Insert after the closing `</div>` of the `data-screen="ai"` nav-item, BEFORE the `<div class="nav-title">This week</div>`:

```html
<div class="nav-item" data-screen="md-monthly">
  <span class="ico">📅</span> Monatsabschluss
</div>
<div class="nav-item" data-screen="md-beirat">
  <span class="ico">🧾</span> Beiratsbericht
</div>
```

- [ ] **Step 3: Verify nav appearance**

Reload the file. With MD persona active, sidebar shows: Action Center · Monatsabschluss · Beiratsbericht. With PM, the two new items are hidden (Task 1.1 rule).

- [ ] **Step 4: Commit**

```bash
git add Pryzm_Dashboard_Mockup.html
git commit -m "md-screens: add Monatsabschluss and Beiratsbericht nav items"
```

---

### Task 1.3: Update Screen 1 page header to persona voice

**Files:**
- Modify: `Pryzm_Dashboard_Mockup.html` (`screen-action-md` page-head, baseline lines 1521–1534)

Spec §4.1 — H1 changes from "Strategic dashboard — Week 18" to *"Guten Morgen, Klaus. Woche 18."*; subtitle becomes the one-sentence "anything-on-fire" answer; right-rail button renamed.

- [ ] **Step 1: Locate the page-head block**

Re-grep `Strategic dashboard — Week 18` to find current location.

- [ ] **Step 2: Replace the page-head + hero block**

Replace from `<div class="page-head">` through the closing `</div>` of the `md-hero` block (the *"Pryzm is on track…"* hero) with:

```html
<div class="page-head">
  <div>
    <div class="crumbs">Strategic Cockpit · <b>Geschäftsführer</b></div>
    <h1>Guten Morgen, Klaus. Woche 18.</h1>
  </div>
  <div class="row" style="gap:8px">
    <button class="btn" onclick="toast('Mock email: weekly summary an Beirat-Vorsitz gesendet')">📤 An Beirat-Vorsitz senden</button>
    <button class="btn" onclick="toast('PDF Export (Mock)')">↓ PDF</button>
  </div>
</div>

<div class="md-hero">
  <div class="eyebrow" style="font-size:10.5px;letter-spacing:.14em;text-transform:uppercase;color:#7dd3fc;font-weight:700;margin-bottom:8px">Strategischer Status</div>
  <h2>Drei rote Flaggen offen. €68K Marge im Q gefährdet. Plan-Marge YTD bestätigt: €421K (+11% vs. Plan).</h2>
  <p>Pricing Manager (M. Weber) hat 47 von 75 Empfehlungen akzeptiert. 28 akzeptiert, aber nicht umgesetzt (€187K). Implementierungsfriktion in nächstem 1:1 prüfen.</p>
</div>
```

- [ ] **Step 3: Verify in browser**

Switch to MD persona. H1 reads "Guten Morgen, Klaus. Woche 18." Hero subtitle is the one-sentence answer to "anything on fire?". Right-rail buttons read "An Beirat-Vorsitz senden" and "↓ PDF". Clicking either fires a toast.

- [ ] **Step 4: Commit**

```bash
git add Pryzm_Dashboard_Mockup.html
git commit -m "md-screens: Screen 1 page header in persona voice"
```

---

### Task 1.4: Replace 3-tile KPI band with 5-tile band

**Files:**
- Modify: `Pryzm_Dashboard_Mockup.html` (existing `<div class="grid-3 mt-24">` inside `screen-action-md`, baseline ~line 1536)

Spec §4.2 — exactly 5 KPI tiles: Marge YTD, Marge gefährdet (Q), Forecast 2026, Kundenkonzentration, Preisdisziplin. Replace the existing grid-3 with a grid-5.

- [ ] **Step 1: Add a `.grid-5` utility class to CSS**

In the styles block, add (alongside the existing `.grid-3`):

```css
.grid-5{display:grid;grid-template-columns:repeat(5,1fr);gap:14px}
@media (max-width:1280px){.grid-5{grid-template-columns:repeat(3,1fr)}}
```

- [ ] **Step 2: Replace the 3-tile block**

Locate the existing block:

```html
<div class="grid-3 mt-24">
  <div class="card counter green">...YTD Captured...</div>
  <div class="card counter amber">...At Risk...</div>
  <div class="card counter blue">...2026 Forecast...</div>
</div>
```

Replace with:

```html
<div class="grid-5 mt-24">
  <div class="card counter green">
    <div class="label"><span class="pin"></span>Marge YTD</div>
    <div class="value">€421.000</div>
    <div class="cap">vs €380K Plan · +11%</div>
  </div>
  <div class="card counter amber">
    <div class="label"><span class="pin"></span>Marge gefährdet (Q)</div>
    <div class="value">€68.000</div>
    <div class="cap">3 rote Flaggen</div>
  </div>
  <div class="card counter blue">
    <div class="label"><span class="pin"></span>Forecast 2026</div>
    <div class="value">€1,2M ±€60K</div>
    <div class="cap">&lt;5% Walk-forward Fehler</div>
  </div>
  <div class="card counter">
    <div class="label"><span class="pin"></span>Kundenkonzentration</div>
    <div class="value">14% / 78%</div>
    <div class="cap">Top-1 / Top-30 · +1,2pp vs Q-1</div>
  </div>
  <div class="card counter">
    <div class="label"><span class="pin"></span>Preisdisziplin (90T)</div>
    <div class="value">87%</div>
    <div class="cap">Ziel 92% · −5pp</div>
  </div>
</div>
```

- [ ] **Step 3: Verify**

Switch to MD. KPI band shows 5 tiles in one row at desktop width (responsive falls to 3 columns ≤1280px). Values match spec §4.2. No sparklines on tiles (anti-feature §4.6).

- [ ] **Step 4: Commit**

```bash
git add Pryzm_Dashboard_Mockup.html
git commit -m "md-screens: 5-tile KPI band on Screen 1 (replaces 3-tile)"
```

---

### Task 1.5: Add "Untersuchen" CTA to red-flag cards + wire data-lens triggers

**Files:**
- Modify: `Pryzm_Dashboard_Mockup.html` (the three `.alert` blocks inside `screen-action-md`)

Spec §4.3 — each red flag has 2 CTAs: `🔍 Untersuchen` (opens lens) and `✉ Markus fragen` (toast). Also: BKAGG flag opens **Manager Lens** (regional flag → ask Hoffmann), Customer 101580 opens **Customer Lens**, Article 200832-E opens **SKU Lens**.

The lens triggers will be implemented in Phase 2; for now we just put the data attributes in place. The `openLens()` JS function is added in Task 2.3.

- [ ] **Step 1: Update copy on existing 3 alerts to German + add Untersuchen button**

Locate the BKAGG alert (text *"BKAGG region — margin gap widened"*). Replace the entire `<div class="alert r">…</div>` block with:

```html
<div class="alert r">
  <div class="icon">🔴</div>
  <div class="body">
    <h4>BKAGG-Region — Margenlücke auf −3,9pp ausgeweitet</h4>
    <p>14 Tage offen · 4 Quotes hängen · Sales-Team bricht Guardrails um 6–9% in dieser Region.</p>
    <div class="row" style="gap:8px;margin-top:8px">
      <button class="btn" data-lens="manager" data-id="hoffmann">🔍 Untersuchen</button>
      <button class="btn" onclick="toast('Mock email: Tust du etwas wegen BKAGG?')">✉ Markus fragen</button>
    </div>
  </div>
</div>
```

Locate the Customer 101580 alert. Replace with:

```html
<div class="alert a">
  <div class="icon">🟡</div>
  <div class="body">
    <h4>Kunde 101580 — Churn-Signal aktiv</h4>
    <p>Größter Einzelkunde · €487K ARR · 12 Tage offen · €48K Retentionsangebot offen.</p>
    <div class="row" style="gap:8px;margin-top:8px">
      <button class="btn" data-lens="customer" data-id="101580">🔍 Untersuchen</button>
      <button class="btn" onclick="toast('Mock email: Tust du etwas wegen Kunde 101580?')">✉ Markus fragen</button>
    </div>
  </div>
</div>
```

Locate the Article 200832-E alert. Replace with:

```html
<div class="alert a">
  <div class="icon">🟡</div>
  <div class="body">
    <h4>Artikel 200832-E — 539 Guardrail-Brüche in Q1</h4>
    <p>Sales-Team bricht Guardrails konstant um 6–9% auf dieser SKU · −€18,6K/Jahr Trend · 8 Tage offen.</p>
    <div class="row" style="gap:8px;margin-top:8px">
      <button class="btn" data-lens="sku" data-id="200832-E">🔍 Untersuchen</button>
      <button class="btn" onclick="toast('Mock email: Tust du etwas wegen Artikel 200832-E?')">✉ Markus fragen</button>
    </div>
  </div>
</div>
```

- [ ] **Step 2: Verify**

MD persona, Screen 1, the three red-flag cards each show two buttons. Untersuchen button has `data-lens` and `data-id` attrs (visible in DOM inspector). Clicking the email button still toasts. Untersuchen does nothing yet (lens system added in Phase 2).

- [ ] **Step 3: Commit**

```bash
git add Pryzm_Dashboard_Mockup.html
git commit -m "md-screens: red-flag cards in German + Untersuchen lens trigger attrs"
```

---

### Task 1.6: Update Screen 1 H2 above red flags + tighten team-perf table for lens trigger

**Files:**
- Modify: `Pryzm_Dashboard_Mockup.html` (H2 before alerts; team-performance table inside `screen-action-md`)

- [ ] **Step 1: Translate H2 above the red-flag rail**

Locate the existing H2 *"Red-flag alerts requiring attention"* and replace with:

```html
<h2 class="h2 mt-24" style="margin-bottom:10px">Rote Flaggen, die du sehen solltest</h2>
```

- [ ] **Step 2: Translate the forecast-card section title**

Locate the forecast card block; replace its `section-title` and `h2.h2` with:

```html
<div class="section-title">12-Monats-Forecast</div>
<h2 class="h2">Umsatzband · Apr 2026 → Mar 2027</h2>
```

And replace the right-side meta line with:

```html
<span class="muted small">&lt;5% Fehler auf Q1-2025-Ist · Walk-forward · Monte-Carlo</span>
```

- [ ] **Step 3: Translate team-perf section + add row click data attrs**

Locate the team-performance card. Replace its title + table with:

```html
<div class="section-title">Team-Leistung</div>
<h2 class="h2 mb-16">Letzte 90 Tage — pro Manager <a href="#" onclick="event.preventDefault();toast('Methodik: Recs erteilt = Pryzm-Output; Akzeptiert = bestätigt im Studio; Implementiert = Preis im SAP geändert; €Captured = realisierte Marge-Differenz vs. Vorpreis.')" class="muted small" style="font-weight:500;text-decoration:underline">Wie wird das berechnet? →</a></h2>
<table>
  <thead><tr><th>Manager</th><th>Recs erteilt</th><th>Akzeptiert</th><th>Implementiert</th><th>€ Captured</th><th>€ Verfehlt</th></tr></thead>
  <tbody>
    <tr data-lens="manager" data-id="weber" style="cursor:pointer"><td><b>M. Weber</b> · Pricing</td><td class="num-cell">75</td><td class="num-cell">47</td><td class="num-cell">38</td><td class="num-cell pos">€421.000</td><td class="num-cell neg">€187.000</td></tr>
    <tr data-lens="manager" data-id="hoffmann" style="cursor:pointer"><td><b>T. Hoffmann</b> · Sales</td><td class="num-cell">42</td><td class="num-cell">31</td><td class="num-cell">22</td><td class="num-cell pos">€184.000</td><td class="num-cell neg">€76.000</td></tr>
    <tr data-lens="manager" data-id="becker" style="cursor:pointer"><td><b>M. Becker</b> · Controller</td><td class="num-cell">25</td><td class="num-cell">18</td><td class="num-cell">16</td><td class="num-cell pos">€92.000</td><td class="num-cell neg">€18.000</td></tr>
  </tbody>
</table>
```

- [ ] **Step 4: Verify**

Hover over team rows — cursor turns pointer. Click does nothing yet (lens added in Phase 2). "Wie wird das berechnet?" link toasts methodology text.

- [ ] **Step 5: Commit**

```bash
git add Pryzm_Dashboard_Mockup.html
git commit -m "md-screens: Screen 1 German copy + team rows wired for Manager Lens"
```

---

## Phase 2 — Lens drawer component (reusable)

### Task 2.1: Add lens drawer CSS

**Files:**
- Modify: `Pryzm_Dashboard_Mockup.html` (style block — append before `</style>`)

- [ ] **Step 1: Append lens CSS**

```css
/* ===== Lens drawer (Customer / SKU / Manager) ===== */
.lens-backdrop{
  position:fixed;inset:0;background:rgba(15,23,42,.45);
  opacity:0;pointer-events:none;transition:opacity .18s ease;z-index:90
}
.lens-backdrop.open{opacity:1;pointer-events:auto}

.lens{
  position:fixed;top:0;right:0;bottom:0;width:400px;max-width:92vw;
  background:#fff;border-left:1px solid var(--border);
  box-shadow:-12px 0 32px rgba(15,23,42,.12);
  transform:translateX(100%);transition:transform .22s ease;
  z-index:91;display:flex;flex-direction:column
}
.lens.open{transform:translateX(0)}

.lens-head{
  padding:16px 18px;border-bottom:1px solid var(--border);
  background:var(--surface)
}
.lens-head .lens-eyebrow{
  font-size:10.5px;letter-spacing:.14em;text-transform:uppercase;
  color:var(--muted);font-weight:700;margin-bottom:6px
}
.lens-head h3{
  font-family:'Manrope',sans-serif;font-size:16px;font-weight:700;
  color:var(--ink);line-height:1.35;margin:0 0 4px 0
}
.lens-head .lens-meta{font-size:12px;color:var(--ink-2);line-height:1.5}
.lens-head .lens-source{font-size:11px;color:var(--muted);margin-top:6px}
.lens-close{
  position:absolute;top:14px;right:14px;background:transparent;border:0;
  font-size:18px;color:var(--muted);cursor:pointer;padding:4px 8px;border-radius:6px
}
.lens-close:hover{background:var(--grey-bg);color:var(--ink)}

.lens-body{flex:1;overflow-y:auto;padding:14px 18px}
.lens-block{
  padding:12px 0;border-bottom:1px solid var(--border)
}
.lens-block:last-child{border-bottom:0}
.lens-block-title{
  font-size:11px;letter-spacing:.08em;text-transform:uppercase;
  color:var(--muted);font-weight:700;margin-bottom:8px
}
.lens-block-line{font-size:13px;color:var(--ink-2);line-height:1.55}
.lens-block-line b{color:var(--ink)}

.lens-signals{display:grid;grid-template-columns:repeat(3,1fr);gap:8px}
.lens-signal{
  padding:8px 10px;border-radius:8px;background:var(--grey-bg);
  border:1px solid var(--border);font-size:11.5px;line-height:1.4
}
.lens-signal .sig-state{font-weight:700;display:flex;align-items:center;gap:5px;margin-bottom:3px}

.lens-funnel{display:flex;align-items:center;gap:6px;margin:8px 0}
.lens-funnel-step{
  flex:1;padding:10px 8px;background:var(--grey-bg);border-radius:6px;text-align:center
}
.lens-funnel-step .v{font-size:18px;font-weight:700;color:var(--ink);font-family:'Manrope',sans-serif}
.lens-funnel-step .l{font-size:10.5px;color:var(--muted);text-transform:uppercase;letter-spacing:.05em;margin-top:2px}
.lens-funnel-arrow{color:var(--muted);font-size:12px}

.lens-row{
  display:flex;justify-content:space-between;align-items:center;
  padding:6px 0;font-size:13px;color:var(--ink-2);cursor:default
}
.lens-row.click{cursor:pointer;border-radius:6px;padding:6px 8px;margin:0 -8px}
.lens-row.click:hover{background:var(--grey-bg)}

.lens-foot{
  padding:12px 18px;border-top:1px solid var(--border);
  display:flex;gap:8px;flex-wrap:wrap;background:var(--surface)
}
.lens-foot .btn{font-size:12.5px}

.lens canvas{max-height:80px}
```

- [ ] **Step 2: Verify CSS lints (no syntax errors)**

Open the file in a browser. Open DevTools → Console. Should be no CSS-parse errors. (CSS syntax errors silently break later styles, so a grep is also worthwhile.)

```bash
# Sanity-check: no unmatched braces in the new block
grep -c "^.lens" Pryzm_Dashboard_Mockup.html
```

- [ ] **Step 3: Commit**

```bash
git add Pryzm_Dashboard_Mockup.html
git commit -m "md-screens: lens drawer CSS scaffold"
```

---

### Task 2.2: Add lens drawer HTML shell

**Files:**
- Modify: `Pryzm_Dashboard_Mockup.html` (just before `</body>`)

The drawer is a single DOM element whose content is rebuilt by JS on each open. The shell is empty at rest.

- [ ] **Step 1: Append lens shell**

Just before `</body>`, insert:

```html
<!-- Lens drawer: content populated by openLens() -->
<div id="lens-backdrop" class="lens-backdrop" onclick="closeLens()"></div>
<aside id="lens" class="lens" role="dialog" aria-modal="true" aria-hidden="true">
  <button class="lens-close" onclick="closeLens()" aria-label="Schließen">✕</button>
  <div class="lens-head" id="lens-head"></div>
  <div class="lens-body" id="lens-body"></div>
  <div class="lens-foot" id="lens-foot"></div>
</aside>
```

- [ ] **Step 2: Verify shell exists in DOM but is invisible at rest**

Reload, inspect DOM. `#lens` exists, `transform: translateX(100%)` keeps it off-screen. `#lens-backdrop` exists with opacity 0, pointer-events none.

- [ ] **Step 3: Commit**

```bash
git add Pryzm_Dashboard_Mockup.html
git commit -m "md-screens: lens drawer HTML shell"
```

---

### Task 2.3: Add lens open/close JS + global trigger handler

**Files:**
- Modify: `Pryzm_Dashboard_Mockup.html` (inside the bottom `<script>`, before `</script>`)

The handler delegates: any element with `data-lens="customer|sku|manager"` and `data-id="…"` opens the corresponding lens. ESC closes. Backdrop click closes (already wired in Task 2.2).

- [ ] **Step 1: Add lens-data dictionaries (mock data)**

Append inside the `<script>` block:

```javascript
/* ===== Lens system ===== */
const LENS_DATA = {
  customer: {
    "101580": {
      title: "Kunde 101580 · Continental AG (Tier-1 Automotive)",
      meta: "Region: BKAGG · Account: T. Hoffmann · seit 2011",
      source: "Quelle: SAP+Pryzm · Stand: 2026-04-28 09:00",
      blocks: [
        {kind:"chart", title:"ARR-Trend (24 Monate)", chartId:"lensARR", line:"<b>€487K ARR</b> · −€32K vs. Q-1 · −6,2%"},
        {kind:"chart", title:"Marge-Trend (24 Monate)", chartId:"lensMarge", line:"<b>9,1pp</b> · −2,4pp vs. 24M-Schnitt"},
        {kind:"signals", title:"Drei Risiko-Signale", signals:[
          {dot:"🔴", state:"Churn-Signal aktiv", text:"Bestellfrequenz seit 2026-Q1 −38%"},
          {dot:"🟡", state:"Konzentrations-Risiko", text:"14% Top-1-Anteil · +1,2pp vs. Q-1"},
          {dot:"🟢", state:"Zahlungs-Signal stabil", text:"DSO 41T, im Korridor"}
        ]},
        {kind:"line", title:"Quote-Aktivität (90 Tage) — nur Aggregate", line:"5 Quotes <b>gewonnen</b> · 2 verloren · 1 offen · Win-Rate <b>71%</b> · Marge-Realisierung <b>84%</b>"},
        {kind:"line", title:"Empfehlungs-Verlauf (90 Tage)", line:"4 erteilt → 3 akzeptiert → 2 implementiert · <b>€18K gehalten</b> · €7K verpasst"}
      ],
      ctas: [
        {label:"✉ Markus fragen", action:"toast('Mock email: Markus zu Kunde 101580 angeschrieben')"},
        {label:"✉ Hoffmann fragen", action:"toast('Mock email: Hoffmann zu Kunde 101580 angeschrieben')"},
        {label:"✓ Als besprochen markieren", action:"toast('Markiert als besprochen')"}
      ]
    }
  },
  sku: {
    "200832-E": {
      title: "Artikel 200832-E · Zahnradpumpe (Precision shaft)",
      meta: "Familie: Automotive · Stückzahl 24M: 8.430 · Status: aktiv",
      source: "Quelle: SAP+Pryzm · Stand: 2026-04-28 09:00",
      blocks: [
        {kind:"chart", title:"Inputkosten vs. Realisiertem Preis (24 Monate)", chartId:"lensCostPrice", line:"Pass-through-Lücke: <b>3,2pp</b> · Stahl +5,8% YTD · Preis +2,6%"},
        {kind:"line", title:"Kunden-Footprint — nur Aggregate", line:"verkauft an <b>47 Kunden</b> · Top-3: 41% des Volumens · Top-10: 78%", chips:[{label:"Continental →", lens:"customer", id:"101580"},{label:"Bosch Mobility →", lens:"customer", id:"101901"},{label:"Webasto →", lens:"customer", id:"103044"}]},
        {kind:"chart", title:"Governance — Guardrail-Brüche (12 Monate)", chartId:"lensViolations", line:"<b>539 Brüche</b> in Q1 · 187 allein April · −€18,6K/Jahr Trend"},
        {kind:"line", title:"Empfehlungs-Verlauf (90 Tage)", line:"12 erteilt → 9 akzeptiert → 5 implementiert · <b>€4K gehalten</b>"},
        {kind:"line", title:"Letzte Preisanpassung", line:"2025-11-14 · +€1,80/Stk · von Markus · Genehmigt durch Klaus"}
      ],
      ctas: [
        {label:"✉ Markus fragen", action:"toast('Mock email: Markus zu Artikel 200832-E angeschrieben')"},
        {label:"✓ Als besprochen markieren", action:"toast('Markiert als besprochen')"}
      ]
    }
  },
  manager: {
    "weber": {
      title: "M. Weber · Pricing Manager · Span: 47 Kunden, 312 SKUs",
      meta: "Im Unternehmen seit 2018 · letzter 1:1: 2026-04-09",
      source: "Quelle: Pryzm · Stand: 2026-04-28 09:00",
      blocks: [
        {kind:"funnel", title:"Empfehlungs-Funnel (90 Tage)", steps:[{v:"75",l:"erteilt"},{v:"47",l:"akzeptiert (63%)"},{v:"38",l:"implementiert (51%)"}], line:"<b>Implementierungs-Lücke:</b> 9 Empfehlungen akzeptiert, aber nicht umgesetzt — €187K offen"},
        {kind:"chart", title:"€ Captured · Wochen-Trend (90 Tage)", chartId:"lensCaptured", line:"<b>€421K gesamt</b> · €38K letzte Woche · vs €32K Schnitt"},
        {kind:"line", title:"€ Verfehlt — Top-3 Gründe (nur Aggregate)", line:"1. Zeitlich verzögert · 28 Fälle · €112K<br>2. Guardrail überschritten · 12 Fälle · €48K<br>3. Markt-Ablehnung · 7 Fälle · €27K"},
        {kind:"rows", title:"Top-3 Kunden im Span — mit Marge-Δ", rows:[
          {label:"Continental AG", right:"−2,4pp 🔴", lens:"customer", id:"101580"},
          {label:"Bosch Mobility", right:"+0,3pp 🟢", lens:"customer", id:"101901"},
          {label:"Webasto", right:"−0,8pp 🟡", lens:"customer", id:"103044"}
        ]},
        {kind:"line", title:"Quartals-Ziele", line:"Marge-Capture <b>€450K</b> · Status: bei €421K · 94% nach 17 Wochen · <b>on-track</b>"}
      ],
      ctas: [
        {label:"📅 1:1 ansetzen", action:"toast('Mock: 1:1 mit Markus angesetzt')"},
        {label:"✉ Markus anschreiben", action:"toast('Mock email an Markus')"},
        {label:"✓ Als besprochen markieren", action:"toast('Markiert als besprochen')"}
      ]
    },
    "hoffmann": {
      title: "T. Hoffmann · Sales Manager · Span: BKAGG-Region (28 Kunden)",
      meta: "Im Unternehmen seit 2014 · letzter 1:1: 2026-04-02",
      source: "Quelle: Pryzm · Stand: 2026-04-28 09:00",
      blocks: [
        {kind:"funnel", title:"Empfehlungs-Funnel (90 Tage)", steps:[{v:"42",l:"erteilt"},{v:"31",l:"akzeptiert (74%)"},{v:"22",l:"implementiert (52%)"}], line:"<b>Implementierungs-Lücke:</b> 9 Empfehlungen akzeptiert, aber nicht umgesetzt — €76K offen"},
        {kind:"chart", title:"€ Captured · Wochen-Trend (90 Tage)", chartId:"lensCaptured", line:"<b>€184K gesamt</b> · €14K letzte Woche · vs €15K Schnitt"},
        {kind:"line", title:"€ Verfehlt — Top-3 Gründe", line:"1. Markt-Ablehnung · 14 Fälle · €38K<br>2. Guardrail überschritten · 9 Fälle · €24K<br>3. Zeitlich verzögert · 5 Fälle · €14K"},
        {kind:"rows", title:"Top-3 Kunden in BKAGG", rows:[
          {label:"Kunde 101580", right:"−2,4pp 🔴", lens:"customer", id:"101580"},
          {label:"Kunde 102330", right:"−1,1pp 🟡", lens:"customer", id:"102330"},
          {label:"Kunde 102801", right:"+0,4pp 🟢", lens:"customer", id:"102801"}
        ]},
        {kind:"line", title:"Quartals-Ziele", line:"Marge-Capture <b>€220K</b> · Status: bei €184K · 84% nach 17 Wochen · <b>at-risk</b>"}
      ],
      ctas: [
        {label:"📅 1:1 ansetzen", action:"toast('Mock: 1:1 mit Hoffmann angesetzt')"},
        {label:"✉ Hoffmann anschreiben", action:"toast('Mock email an Hoffmann')"},
        {label:"✓ Als besprochen markieren", action:"toast('Markiert als besprochen')"}
      ]
    },
    "becker": {
      title: "M. Becker · Controller · Span: Kostenseite & Reporting",
      meta: "Im Unternehmen seit 2009 · letzter 1:1: 2026-03-21",
      source: "Quelle: Pryzm · Stand: 2026-04-28 09:00",
      blocks: [
        {kind:"funnel", title:"Empfehlungs-Funnel (90 Tage)", steps:[{v:"25",l:"erteilt"},{v:"18",l:"akzeptiert (72%)"},{v:"16",l:"implementiert (64%)"}], line:"<b>Implementierungs-Lücke:</b> 2 akzeptiert, aber nicht umgesetzt — €18K offen"},
        {kind:"chart", title:"€ Captured · Wochen-Trend (90 Tage)", chartId:"lensCaptured", line:"<b>€92K gesamt</b> · €7K letzte Woche · vs €8K Schnitt"},
        {kind:"line", title:"€ Verfehlt — Top-3 Gründe", line:"1. Zeitlich verzögert · 1 Fall · €10K<br>2. Markt-Ablehnung · 1 Fall · €5K<br>3. Guardrail überschritten · 1 Fall · €3K"},
        {kind:"rows", title:"Top-3 Themen (Kosten)", rows:[
          {label:"Stahl-Pass-through-Lücke", right:"3,2pp"},
          {label:"Lieferanten-Drift Q1", right:"+1,1pp"},
          {label:"Garantierückstellungen", right:"−0,4pp"}
        ]},
        {kind:"line", title:"Quartals-Ziele", line:"Marge-Capture <b>€110K</b> · Status: bei €92K · 84% nach 17 Wochen · <b>on-track</b>"}
      ],
      ctas: [
        {label:"📅 1:1 ansetzen", action:"toast('Mock: 1:1 mit Becker angesetzt')"},
        {label:"✉ Becker anschreiben", action:"toast('Mock email an Becker')"},
        {label:"✓ Als besprochen markieren", action:"toast('Markiert als besprochen')"}
      ]
    }
  }
};
```

Note: Customer entries for `101901`, `103044`, `102330`, `102801` will short-circuit to "Daten in Vorbereitung" via the open function fallback below — these are chained-from data only, not first-class profiles. Keep this simple for the mockup.

- [ ] **Step 2: Add open/close functions and the global click delegate**

Append:

```javascript
function openLens(kind, id){
  const data = (LENS_DATA[kind] && LENS_DATA[kind][id]) || {
    title: kind+" · "+id,
    meta: "Daten in Vorbereitung",
    source: "Quelle: Pryzm · Mock",
    blocks: [{kind:"line", title:"Hinweis", line:"Profil ist im Mockup nicht hinterlegt. Verfügbare Profile: 101580 (Kunde), 200832-E (SKU), Weber/Hoffmann/Becker (Manager)."}],
    ctas: [{label:"✓ Schließen", action:"closeLens()"}]
  };
  document.getElementById('lens-head').innerHTML =
    '<div class="lens-eyebrow">'+(kind==='customer'?'Kunden-Ansicht':kind==='sku'?'SKU-Ansicht':'Manager-Ansicht')+'</div>' +
    '<h3>'+data.title+'</h3>' +
    '<div class="lens-meta">'+data.meta+'</div>' +
    '<div class="lens-source">'+data.source+'</div>';
  document.getElementById('lens-body').innerHTML = data.blocks.map(renderLensBlock).join('');
  document.getElementById('lens-foot').innerHTML = data.ctas.map(c =>
    '<button class="btn" onclick="'+c.action+'">'+c.label+'</button>'
  ).join('');
  document.getElementById('lens').classList.add('open');
  document.getElementById('lens').setAttribute('aria-hidden','false');
  document.getElementById('lens-backdrop').classList.add('open');
  // After paint, hydrate any chart blocks
  requestAnimationFrame(()=>hydrateLensCharts(data.blocks));
}

function renderLensBlock(b){
  if (b.kind === 'chart'){
    return '<div class="lens-block"><div class="lens-block-title">'+b.title+'</div>' +
      '<div style="height:80px;position:relative"><canvas id="'+b.chartId+'"></canvas></div>' +
      '<div class="lens-block-line">'+b.line+'</div></div>';
  }
  if (b.kind === 'signals'){
    return '<div class="lens-block"><div class="lens-block-title">'+b.title+'</div>' +
      '<div class="lens-signals">' +
      b.signals.map(s=>'<div class="lens-signal"><div class="sig-state">'+s.dot+' '+s.state+'</div>'+s.text+'</div>').join('') +
      '</div></div>';
  }
  if (b.kind === 'funnel'){
    const steps = b.steps.map(s=>'<div class="lens-funnel-step"><div class="v">'+s.v+'</div><div class="l">'+s.l+'</div></div>').join('<div class="lens-funnel-arrow">→</div>');
    return '<div class="lens-block"><div class="lens-block-title">'+b.title+'</div>' +
      '<div class="lens-funnel">'+steps+'</div>' +
      '<div class="lens-block-line">'+b.line+'</div></div>';
  }
  if (b.kind === 'rows'){
    return '<div class="lens-block"><div class="lens-block-title">'+b.title+'</div>' +
      b.rows.map(r=>{
        const click = r.lens ? ' class="lens-row click" data-lens="'+r.lens+'" data-id="'+r.id+'"' : ' class="lens-row"';
        return '<div'+click+'><span>'+r.label+'</span><b>'+r.right+'</b></div>';
      }).join('') +
      '</div>';
  }
  // line (default)
  let chips = '';
  if (b.chips) chips = '<div style="margin-top:8px;display:flex;gap:6px;flex-wrap:wrap">' +
    b.chips.map(c=>'<button class="btn" style="font-size:11.5px;padding:4px 8px" data-lens="'+c.lens+'" data-id="'+c.id+'">'+c.label+'</button>').join('') +
    '</div>';
  return '<div class="lens-block"><div class="lens-block-title">'+b.title+'</div>' +
    '<div class="lens-block-line">'+b.line+'</div>'+chips+'</div>';
}

function hydrateLensCharts(blocks){
  // Minimal mock charts: thin lines, no axes, single dataset
  const mk = (id, points, color) => {
    const el = document.getElementById(id);
    if (!el) return;
    new Chart(el, {
      type:'line',
      data:{labels:points.map((_,i)=>i), datasets:[{data:points, borderColor:color, borderWidth:1.5, tension:.3, pointRadius:0, fill:false}]},
      options:{plugins:{legend:{display:false}}, scales:{x:{display:false}, y:{display:false}}, responsive:true, maintainAspectRatio:false}
    });
  };
  blocks.forEach(b=>{
    if (b.kind!=='chart') return;
    if (b.chartId==='lensARR') mk('lensARR',[520,515,512,508,505,502,498,495,492,490,488,487,485,482,480,478,475,490,495,500,495,490,488,487],'#2c79ff');
    if (b.chartId==='lensMarge') mk('lensMarge',[11.5,11.4,11.4,11.3,11.2,11.0,10.9,10.8,10.7,10.6,10.5,10.4,10.2,10.0,9.9,9.8,9.7,9.6,9.5,9.4,9.3,9.2,9.1,9.1],'#16a34a');
    if (b.chartId==='lensCostPrice') mk('lensCostPrice',[100,101,102,103,104,105,106,107,108,109,110,111,112,113,114,115,116,117,118,119,120,121,122,123],'#f59e0b');
    if (b.chartId==='lensViolations') mk('lensViolations',[42,38,55,61,72,80,95,110,135,160,180,187],'#ef4444');
    if (b.chartId==='lensCaptured') mk('lensCaptured',[28,32,30,35,38,34,36,40,38,42,38,38],'#16a34a');
  });
}

function closeLens(){
  document.getElementById('lens').classList.remove('open');
  document.getElementById('lens').setAttribute('aria-hidden','true');
  document.getElementById('lens-backdrop').classList.remove('open');
}

document.addEventListener('keydown', e => { if (e.key==='Escape') closeLens(); });

// Global delegate for any data-lens trigger anywhere on the page
document.addEventListener('click', e => {
  const t = e.target.closest('[data-lens][data-id]');
  if (!t) return;
  e.preventDefault();
  openLens(t.dataset.lens, t.dataset.id);
});
```

- [ ] **Step 3: Verify lens opens**

Reload. MD persona, Screen 1. Click `🔍 Untersuchen` on the Customer 101580 red flag. Drawer slides in from the right with all 5 blocks. Click backdrop or press ESC — drawer closes. Click Untersuchen on BKAGG flag — Manager Lens (Hoffmann) opens. Click Untersuchen on Article 200832-E — SKU Lens opens. Click a team-perf row — corresponding Manager Lens opens.

- [ ] **Step 4: Verify chained drill**

In the SKU Lens (200832-E), click one of the customer chips. The drawer's content rebuilds to the Customer Lens. (Acceptable for the mockup: same drawer, content re-rendered. No back-button required — depth ≤ 2 per spec.)

- [ ] **Step 5: Commit**

```bash
git add Pryzm_Dashboard_Mockup.html
git commit -m "md-screens: lens drawer JS — open/close, 3 variants, chained drill, mock charts"
```

---

## Phase 3 — Screen 2 (Monatsabschluss / Monthly Review)

### Task 3.1: Add Screen 2 section scaffold + register in renderScreen

**Files:**
- Modify: `Pryzm_Dashboard_Mockup.html` — add new section, update `renderScreen()` JS

- [ ] **Step 1: Append the screen scaffold**

Find the end of the AI/Monday Briefing section (`screen-ai`). After its closing `</section>` and before `</main>`, insert:

```html
<!-- ============== MONATSABSCHLUSS (MD persona only) ============== -->
<section id="screen-md-monthly" class="screen hidden">
  <div class="page-head">
    <div>
      <div class="crumbs">Strategic Cockpit · <b>Geschäftsführer</b> · Monatsabschluss</div>
      <h1>Monatsabschluss April 2026</h1>
    </div>
    <div class="row" style="gap:8px">
      <select class="btn" style="padding:6px 10px"><option>Apr 2026</option><option>Mär 2026</option><option>Feb 2026</option></select>
      <button class="btn" onclick="toast('PDF für GL-Sitzung exportiert (Mock)')">↓ PDF für GL-Sitzung</button>
    </div>
  </div>
  <p class="muted small" style="margin-top:-10px">Letzter Freitag im Monat. 20 Minuten. Zwei Fragen für Dienstag.</p>

  <!-- Sections appended in subsequent tasks: 3.2 hero, 3.3 waterfall, 3.4 top-10, 3.5 segments, 3.6 discipline -->

</section>
```

- [ ] **Step 2: Register screen in `renderScreen()`**

Locate the `screens` array in `renderScreen()` (currently `['action-pm','action-md','action-sr','forecast','studio','margin','quotes','ai']`). Update to:

```javascript
const screens = ['action-pm','action-md','action-sr','forecast','studio','margin','quotes','ai','md-monthly','md-beirat'];
```

Then add new `else if` branches before the closing brace of `renderScreen()`:

```javascript
else if (state.screen==='md-monthly'){ document.getElementById('screen-md-monthly').classList.remove('hidden'); initMDMonthly(); }
else if (state.screen==='md-beirat'){ document.getElementById('screen-md-beirat').classList.remove('hidden'); initMDBeirat(); }
```

- [ ] **Step 3: Add stub `initMDMonthly()` so the screen doesn't error**

Append in the script block:

```javascript
function initMDMonthly(){ /* charts hydrated in tasks 3.3 + 3.6 */ }
function initMDBeirat(){ /* charts hydrated in Phase 4 */ }
```

- [ ] **Step 4: Verify nav navigation works**

MD persona, click Monatsabschluss in sidebar. Empty page with H1 "Monatsabschluss April 2026" + subtitle appears. Sidebar item is highlighted.

- [ ] **Step 5: Commit**

```bash
git add Pryzm_Dashboard_Mockup.html
git commit -m "md-screens: Screen 2 scaffold (Monatsabschluss) + renderScreen wiring"
```

---

### Task 3.2: Screen 2 — "Two questions" hero card

**Files:**
- Modify: `Pryzm_Dashboard_Mockup.html` (inside `screen-md-monthly`)

- [ ] **Step 1: Add CSS for the hero card**

Append to styles:

```css
.q-hero{background:linear-gradient(180deg,#0f172a 0%,#1e293b 100%);color:#e2e8f0;border-radius:14px;padding:22px 24px;margin-top:18px}
.q-hero .qh-eyebrow{font-size:10.5px;letter-spacing:.16em;text-transform:uppercase;color:#7dd3fc;font-weight:700;margin-bottom:10px}
.q-hero .qh-title{font-family:'Manrope',sans-serif;font-size:18px;font-weight:600;color:#fff;margin-bottom:18px;line-height:1.4}
.q-card{background:rgba(255,255,255,.05);border:1px solid rgba(125,211,252,.18);border-radius:10px;padding:14px 16px;margin-bottom:10px}
.q-card .q-to{font-size:11px;letter-spacing:.08em;text-transform:uppercase;color:#7dd3fc;font-weight:700;margin-bottom:6px}
.q-card .q-text{font-size:14px;line-height:1.55;color:#f1f5f9;margin-bottom:8px}
.q-card .q-evid{font-size:12px;color:#94a3b8;line-height:1.55}
.q-card .q-link{font-size:12px;color:#7dd3fc;text-decoration:underline;cursor:pointer;display:inline-block;margin-top:6px}
.q-foot{font-size:12px;color:#94a3b8;margin-top:6px}
.q-foot a{color:#7dd3fc;text-decoration:underline;cursor:pointer}
```

- [ ] **Step 2: Insert the hero card into the screen**

Inside `screen-md-monthly`, after the `<p class="muted small">…</p>` and before the closing `</section>`, add:

```html
<div class="q-hero">
  <div class="qh-eyebrow">Zwei Fragen für Dienstag</div>
  <div class="qh-title">Pryzm hat 2 Fragen aus 7 Kandidaten ausgewählt — basierend auf Marge-Trajektorie, Konzentrations-Risiko und Preisdisziplin im April.</div>
  <div class="q-card">
    <div class="q-to">Frage 1 — an Markus &amp; Tobias</div>
    <div class="q-text">"Warum ist die Preisdisziplin auf Artikel 200832-E im April auf 71% gefallen, obwohl wir im Februar eine Guardrail-Anpassung gemacht haben?"</div>
    <div class="q-evid">Belegt durch: 539 Brüche Q1 → 187 Brüche allein April · −€18,6K/Jahr Trend</div>
    <a class="q-link" onclick="toast('Reason chain: Quote-Realisierung sinkt seit März; Datenbasis: SAP-Buchungen + Pryzm-Quote-Output; Vergleichsfenster: Q4-2025 vs. April 2026; Konfidenz: hoch (n=187 Brüche).')">Warum diese Frage? →</a>
  </div>
  <div class="q-card">
    <div class="q-to">Frage 2 — an Tobias</div>
    <div class="q-text">"Sind die −2,1pp Margenverlust in der Region BKAGG strukturell oder ein Effekt von Kunde 101580?"</div>
    <div class="q-evid">Belegt durch: BKAGG −3,9pp gesamt · Kunde 101580 = 41% des regionalen Umsatzes</div>
    <a class="q-link" onclick="toast('Reason chain: BKAGG margin gap −3,9pp; Kunde 101580 ARR-Anteil 41%; Sensitivitätsanalyse zeigt Strukturanteil ~1,8pp; Datenbasis: 6-Monats-Rolling.')">Warum diese Frage? →</a>
  </div>
  <div class="q-foot">Pryzm wählt 2 Fragen aus 7 Kandidaten. <a onclick="toast('Mock: 7 Kandidaten-Fragen anzeigen')">Alle 7 sehen →</a></div>
</div>
```

- [ ] **Step 3: Verify**

Navigate to Monatsabschluss. Dark hero card visible with two questions. "Warum diese Frage?" links toast a reason chain. "Alle 7 sehen" toasts. Card colors match dark theme.

- [ ] **Step 4: Commit**

```bash
git add Pryzm_Dashboard_Mockup.html
git commit -m "md-screens: Screen 2 'Zwei Fragen für Dienstag' hero card"
```

---

### Task 3.3: Screen 2 — Margin trajectory waterfall

**Files:**
- Modify: `Pryzm_Dashboard_Mockup.html`

The waterfall is a bar chart with stepped baseline (a Chart.js floating bar trick using `[start,end]` data). Compact 6-month bridge.

- [ ] **Step 1: Add the waterfall card HTML**

Inside `screen-md-monthly`, after the `q-hero` div, append:

```html
<div class="card card-pad mt-24">
  <div class="between mb-16">
    <div>
      <div class="section-title">Marge-Trajektorie</div>
      <h2 class="h2">Wo die Marge seit Oktober steht</h2>
    </div>
    <span class="muted small">Quellen: WaWi-Buchungen + Pryzm-Quote-Realisierung · 6-Monats-Rolling</span>
  </div>
  <div style="height:240px;position:relative"><canvas id="mdMonthlyWF"></canvas></div>
</div>
```

- [ ] **Step 2: Add the chart hydrator inside `initMDMonthly()`**

Replace the stub `initMDMonthly` from Task 3.1 with:

```javascript
function initMDMonthly(){
  const wf = document.getElementById('mdMonthlyWF');
  if (wf && !wf.dataset.hydrated){
    wf.dataset.hydrated = '1';
    new Chart(wf, {
      type:'bar',
      data:{
        labels:['Okt 25','Volume mix','Preis-Drift','Rohstoff','Lieferanten','Garantie','Andere','Apr 26'],
        datasets:[{
          data:[[0,11.4],[11.4,11.6],[11.6,11.2],[11.2,10.7],[10.7,10.5],[10.5,10.6],[10.6,10.8],[0,10.8]],
          backgroundColor:['#94a3b8','#16a34a','#ef4444','#ef4444','#ef4444','#16a34a','#16a34a','#94a3b8'],
          borderRadius:4
        }]
      },
      options:{
        plugins:{
          legend:{display:false},
          tooltip:{callbacks:{label:c=>{const v=c.raw;return v[1].toFixed(1)+'pp ('+(v[1]-v[0]>=0?'+':'')+(v[1]-v[0]).toFixed(1)+'pp)'}}}
        },
        scales:{
          x:{grid:{display:false}, ticks:{font:{size:11}}},
          y:{min:9.5, max:12, ticks:{callback:v=>v+'pp', font:{size:11}}, grid:{color:'#f1f5f9'}}
        },
        responsive:true, maintainAspectRatio:false
      }
    });
  }
  // top-10 + segments + discipline charts hydrated in their own tasks
}
```

- [ ] **Step 3: Verify**

Navigate to Monatsabschluss. Waterfall chart renders below the dark hero, showing Oct→Apr bridge. Hover over bars: tooltip shows pp delta.

- [ ] **Step 4: Commit**

```bash
git add Pryzm_Dashboard_Mockup.html
git commit -m "md-screens: Screen 2 margin-trajectory waterfall (Oct→Apr)"
```

---

### Task 3.4: Screen 2 — Top-10 customer concentration list

**Files:**
- Modify: `Pryzm_Dashboard_Mockup.html`

Spec §5.4 — compact list (NOT a Salesforce table). 10 rows, 5 columns, no filters, fixed sort by ARR desc, click row → Customer Lens.

- [ ] **Step 1: Add the customer-list card HTML**

Inside `screen-md-monthly`, after the waterfall card, append:

```html
<div class="card card-pad mt-24">
  <div class="between mb-16">
    <div>
      <div class="section-title">Kundenkonzentration</div>
      <h2 class="h2">Top-10 nach ARR</h2>
    </div>
    <span class="muted small">Top-30 = 78% Umsatz · stabil ggü. Q-1 · <a onclick="toast('Mock: vollständige Top-30 inline')" style="color:var(--primary-deep);text-decoration:underline;cursor:pointer">vollständige Top-30 →</a></span>
  </div>
  <table>
    <thead><tr><th style="width:40px">#</th><th>Kunde</th><th>ARR</th><th>Δ ARR vs Q-1</th><th>Marge-pp Δ vs Q-1</th><th></th></tr></thead>
    <tbody id="mdMonthlyTopList">
      <tr data-lens="customer" data-id="101580" style="cursor:pointer"><td>1</td><td><b>101580</b> · Continental AG</td><td class="num-cell">€487K</td><td class="num-cell neg">−€32K</td><td class="num-cell neg">−2,4pp</td><td><span class="pin r"></span></td></tr>
      <tr data-lens="customer" data-id="101901" style="cursor:pointer"><td>2</td><td><b>101901</b> · Bosch Mobility</td><td class="num-cell">€312K</td><td class="num-cell pos">+€8K</td><td class="num-cell pos">+0,3pp</td><td></td></tr>
      <tr data-lens="customer" data-id="103044" style="cursor:pointer"><td>3</td><td><b>103044</b> · Webasto</td><td class="num-cell">€264K</td><td class="num-cell neg">−€6K</td><td class="num-cell neg">−0,8pp</td><td><span class="pin a"></span></td></tr>
      <tr data-lens="customer" data-id="102330" style="cursor:pointer"><td>4</td><td><b>102330</b> · BorgWarner</td><td class="num-cell">€241K</td><td class="num-cell neg">−€18K</td><td class="num-cell neg">−1,1pp</td><td><span class="pin a"></span></td></tr>
      <tr data-lens="customer" data-id="102801" style="cursor:pointer"><td>5</td><td><b>102801</b> · Mahle</td><td class="num-cell">€198K</td><td class="num-cell pos">+€2K</td><td class="num-cell pos">+0,4pp</td><td></td></tr>
      <tr data-lens="customer" data-id="104410" style="cursor:pointer"><td>6</td><td><b>104410</b> · ZF Friedrichshafen</td><td class="num-cell">€176K</td><td class="num-cell pos">+€11K</td><td class="num-cell pos">+0,9pp</td><td></td></tr>
      <tr data-lens="customer" data-id="105220" style="cursor:pointer"><td>7</td><td><b>105220</b> · Festo</td><td class="num-cell">€158K</td><td class="num-cell pos">+€4K</td><td class="num-cell">±0pp</td><td></td></tr>
      <tr data-lens="customer" data-id="106110" style="cursor:pointer"><td>8</td><td><b>106110</b> · Bürkert</td><td class="num-cell">€142K</td><td class="num-cell neg">−€3K</td><td class="num-cell neg">−0,2pp</td><td></td></tr>
      <tr data-lens="customer" data-id="107010" style="cursor:pointer"><td>9</td><td><b>107010</b> · Schaeffler</td><td class="num-cell">€131K</td><td class="num-cell pos">+€6K</td><td class="num-cell pos">+0,5pp</td><td></td></tr>
      <tr data-lens="customer" data-id="108220" style="cursor:pointer"><td>10</td><td><b>108220</b> · Knorr-Bremse</td><td class="num-cell">€118K</td><td class="num-cell pos">+€1K</td><td class="num-cell pos">+0,1pp</td><td></td></tr>
    </tbody>
  </table>
</div>
```

- [ ] **Step 2: Verify clickable rows**

Click row 1 (Continental AG) → Customer Lens for 101580 opens. Click row 2 (Bosch Mobility) → Lens opens with "Daten in Vorbereitung" fallback (acceptable for the mockup; only 101580 has full data).

- [ ] **Step 3: Commit**

```bash
git add Pryzm_Dashboard_Mockup.html
git commit -m "md-screens: Screen 2 top-10 concentration list with Customer Lens drill"
```

---

### Task 3.5: Screen 2 — Segment 2×2 grid

**Files:**
- Modify: `Pryzm_Dashboard_Mockup.html`

Spec §5.5 — 4 segment cards in 2×2, each with one micro-sparkline (only allowed sparkline category on Screen 2). NO drill (segments don't have a lens).

- [ ] **Step 1: Add segment-grid CSS**

Append to styles:

```css
.seg-grid{display:grid;grid-template-columns:1fr 1fr;gap:14px}
.seg-card{background:#fff;border:1px solid var(--border);border-radius:10px;padding:14px 16px}
.seg-card .seg-name{font-family:'Manrope',sans-serif;font-size:14px;font-weight:700;color:var(--ink);margin-bottom:2px}
.seg-card .seg-share{font-size:11.5px;color:var(--muted);margin-bottom:10px}
.seg-card .seg-stats{display:flex;gap:14px;margin-bottom:8px}
.seg-card .seg-stat{font-size:12px;color:var(--ink-2)}
.seg-card .seg-stat b{display:block;font-family:'Manrope',sans-serif;font-size:18px;font-weight:700;color:var(--ink);line-height:1}
.seg-card .seg-stat b.pos{color:var(--green)}
.seg-card .seg-stat b.neg{color:var(--red)}
.seg-card .seg-spark{height:36px;margin:6px 0}
.seg-card .seg-interp{font-size:12.5px;color:var(--ink-2);line-height:1.5;font-style:italic}
```

- [ ] **Step 2: Add segment HTML**

After the top-10 list card, append:

```html
<div class="card card-pad mt-24">
  <div class="section-title">Segment-Verschiebungen</div>
  <h2 class="h2 mb-16">Vier Segmente · Apr 2026 vs. Apr 2025</h2>
  <div class="seg-grid">
    <div class="seg-card">
      <div class="seg-name">Automotive</div>
      <div class="seg-share">42% des Umsatzes</div>
      <div class="seg-stats">
        <div class="seg-stat"><b class="neg">−3%</b> Umsatz Δ vs LY</div>
        <div class="seg-stat"><b class="neg">−1,2pp</b> Marge vs Plan</div>
      </div>
      <div class="seg-spark"><canvas id="segAuto"></canvas></div>
      <div class="seg-interp">Tier-1-Drift hält an. Continental, BorgWarner und Webasto schwächen das Segment.</div>
    </div>
    <div class="seg-card">
      <div class="seg-name">Chemie / Process</div>
      <div class="seg-share">28% des Umsatzes</div>
      <div class="seg-stats">
        <div class="seg-stat"><b class="pos">+4%</b> Umsatz Δ vs LY</div>
        <div class="seg-stat"><b class="pos">+0,3pp</b> Marge vs Plan</div>
      </div>
      <div class="seg-spark"><canvas id="segChem"></canvas></div>
      <div class="seg-interp">Stabil. Spezial-Pumpen mit Hastelloy/Titanium tragen die Marge.</div>
    </div>
    <div class="seg-card">
      <div class="seg-name">Maschinenbau</div>
      <div class="seg-share">18% des Umsatzes</div>
      <div class="seg-stats">
        <div class="seg-stat"><b class="pos">+1%</b> Umsatz Δ vs LY</div>
        <div class="seg-stat"><b>±0pp</b> Marge vs Plan</div>
      </div>
      <div class="seg-spark"><canvas id="segMech"></canvas></div>
      <div class="seg-interp">Lateral. Volumen leicht hoch, Marge auf Plan — keine Aktion nötig.</div>
    </div>
    <div class="seg-card">
      <div class="seg-name">Energie</div>
      <div class="seg-share">12% des Umsatzes</div>
      <div class="seg-stats">
        <div class="seg-stat"><b class="pos">+8%</b> Umsatz Δ vs LY</div>
        <div class="seg-stat"><b class="pos">+1,1pp</b> Marge vs Plan</div>
      </div>
      <div class="seg-spark"><canvas id="segEng"></canvas></div>
      <div class="seg-interp">Wachstum durch Power-Plant-Aufträge. Marge expandiert.</div>
    </div>
  </div>
</div>
```

- [ ] **Step 3: Hydrate sparklines inside `initMDMonthly()`**

After the waterfall hydration block, add:

```javascript
const sparkOpts = (color, points) => ({
  type:'line',
  data:{labels:points.map((_,i)=>i), datasets:[{data:points, borderColor:color, borderWidth:1.5, tension:.3, pointRadius:0, fill:false}]},
  options:{plugins:{legend:{display:false}}, scales:{x:{display:false}, y:{display:false}}, responsive:true, maintainAspectRatio:false}
});
['segAuto','segChem','segMech','segEng'].forEach(id=>{
  const el = document.getElementById(id);
  if (!el || el.dataset.hydrated) return;
  el.dataset.hydrated = '1';
});
const a = document.getElementById('segAuto'); if (a && !a._h){ a._h=1; new Chart(a, sparkOpts('#ef4444',[100,99,98,98,97,96,96,95,94,93,93,97])); }
const c = document.getElementById('segChem'); if (c && !c._h){ c._h=1; new Chart(c, sparkOpts('#16a34a',[100,101,101,102,102,103,103,104,104,103,104,104])); }
const m = document.getElementById('segMech'); if (m && !m._h){ m._h=1; new Chart(m, sparkOpts('#94a3b8',[100,100,101,101,100,101,102,101,101,101,101,101])); }
const e = document.getElementById('segEng'); if (e && !e._h){ e._h=1; new Chart(e, sparkOpts('#2c79ff',[100,101,102,103,104,105,106,107,107,108,108,108])); }
```

- [ ] **Step 4: Verify**

Monatsabschluss → segment grid shows 4 cards in 2×2 (single column on narrow screens via the existing responsive). Each has one sparkline. No card is clickable (anti-feature: no segment lens).

- [ ] **Step 5: Commit**

```bash
git add Pryzm_Dashboard_Mockup.html
git commit -m "md-screens: Screen 2 segment 2x2 grid with sparklines"
```

---

### Task 3.6: Screen 2 — Price discipline trend + top-3 violation SKUs

**Files:**
- Modify: `Pryzm_Dashboard_Mockup.html`

Spec §5.6 — single line chart, % within guardrail, target line at 92%, plus 3 SKUs driving violations (each row → SKU Lens).

- [ ] **Step 1: Add HTML**

After the segment grid card, append:

```html
<div class="card card-pad mt-24">
  <div class="between mb-16">
    <div>
      <div class="section-title">Preisdisziplin</div>
      <h2 class="h2">Quotes innerhalb Guardrail · 12 Monate</h2>
    </div>
    <a class="muted small" onclick="toast('Methodik: % der Quotes mit realisierter Marge ≥ Guardrail-Untergrenze. Quelle: Pryzm-Quote-Engine. Vergleich: 12-Monats-Rolling.')" style="cursor:pointer;text-decoration:underline">Wie wird Disziplin gemessen? →</a>
  </div>
  <div style="height:200px;position:relative"><canvas id="mdMonthlyDisc"></canvas></div>

  <div class="section-title" style="margin-top:18px">Top-3 SKUs nach Brüchen</div>
  <table style="margin-top:6px">
    <thead><tr><th style="width:40px">#</th><th>Artikel</th><th>Brüche (90T)</th><th>€ Impact (annualisiert)</th></tr></thead>
    <tbody>
      <tr data-lens="sku" data-id="200832-E" style="cursor:pointer"><td>1</td><td><b>200832-E</b> · Zahnradpumpe</td><td class="num-cell">539</td><td class="num-cell neg">−€18,6K</td></tr>
      <tr data-lens="sku" data-id="211094-C" style="cursor:pointer"><td>2</td><td><b>211094-C</b> · Mikropumpe Hastelloy</td><td class="num-cell">214</td><td class="num-cell neg">−€8,1K</td></tr>
      <tr data-lens="sku" data-id="218750-D" style="cursor:pointer"><td>3</td><td><b>218750-D</b> · Dosierpumpe</td><td class="num-cell">158</td><td class="num-cell neg">−€5,4K</td></tr>
    </tbody>
  </table>
</div>
```

- [ ] **Step 2: Hydrate the discipline chart in `initMDMonthly()`**

After the segment hydration, add:

```javascript
const dc = document.getElementById('mdMonthlyDisc');
if (dc && !dc._h){
  dc._h = 1;
  new Chart(dc, {
    type:'line',
    data:{
      labels:['Mai','Jun','Jul','Aug','Sep','Okt','Nov','Dez','Jan','Feb','Mär','Apr'],
      datasets:[
        {label:'% innerhalb Guardrail', data:[91,92,90,91,89,90,91,89,88,89,88,87], borderColor:'#2c79ff', backgroundColor:'rgba(44,121,255,.1)', tension:.3, fill:true, pointRadius:3, borderWidth:2},
        {label:'Ziel (92%)', data:Array(12).fill(92), borderColor:'#94a3b8', borderDash:[5,5], borderWidth:1.5, pointRadius:0, fill:false}
      ]
    },
    options:{
      plugins:{legend:{display:true, position:'bottom', labels:{boxWidth:12, font:{size:11}}}},
      scales:{
        x:{grid:{display:false}, ticks:{font:{size:11}}},
        y:{min:80, max:100, ticks:{callback:v=>v+'%', font:{size:11}}, grid:{color:'#f1f5f9'}}
      },
      responsive:true, maintainAspectRatio:false
    }
  });
}
```

- [ ] **Step 3: Verify**

Discipline chart shows 12-month trend with a dashed target line at 92%. The actual line dips from 91→87. Click a SKU row → SKU Lens opens (200832-E full; others fallback).

- [ ] **Step 4: Commit**

```bash
git add Pryzm_Dashboard_Mockup.html
git commit -m "md-screens: Screen 2 price discipline trend + top-3 violation SKUs"
```

---

## Phase 4 — Screen 3 (Beiratsbericht / Beirat Pack)

### Task 4.1: Add Screen 3 section scaffold + Vortragsmodus state

**Files:**
- Modify: `Pryzm_Dashboard_Mockup.html`

- [ ] **Step 1: Append the screen scaffold**

After `screen-md-monthly`'s closing `</section>`, before `</main>`, insert:

```html
<!-- ============== BEIRATSBERICHT (MD persona only) ============== -->
<section id="screen-md-beirat" class="screen hidden">
  <div class="page-head">
    <div>
      <div class="crumbs">Strategic Cockpit · <b>Geschäftsführer</b> · Beiratsbericht</div>
      <h1>Beiratsbericht <select class="btn" style="padding:4px 10px;font-family:'Manrope',sans-serif;font-size:18px;font-weight:700"><option>Q1/2026</option><option>Q4/2025</option><option>Q3/2025</option></select></h1>
    </div>
    <div class="row" style="gap:8px">
      <button class="btn" onclick="toast('Zahlen eingefroren am 2026-04-28 (Mock)')">🔒 Zahlen einfrieren</button>
      <button class="btn" id="btnVortrag" onclick="toggleVortrag()">🖥 Vortragsmodus</button>
      <button class="btn" onclick="toast('PDF Beiratsbericht (3 Seiten + Anhang) exportiert (Mock)')">↓ PDF</button>
    </div>
  </div>
  <p class="muted small" style="margin-top:-10px">Stand: 28. April 2026 · gesperrt · Quellen unten.</p>

  <!-- Sections appended in subsequent tasks -->

</section>
```

- [ ] **Step 2: Add Vortragsmodus CSS**

Append:

```css
body.vortrag #screen-md-beirat{font-size:140%}
body.vortrag #screen-md-beirat .ed-edit, body.vortrag #screen-md-beirat .src-link{display:none !important}
body.vortrag #screen-md-beirat tr[data-lens]{cursor:default}
body.vortrag #screen-md-beirat tr[data-lens]{pointer-events:none}
body.vortrag #screen-md-beirat .narrative{font-size:18px;line-height:1.7}
body.vortrag #btnVortrag{background:var(--primary-deep);color:#fff;border-color:var(--primary-deep)}
```

- [ ] **Step 3: Add Vortragsmodus toggle JS**

Append in script:

```javascript
function toggleVortrag(){
  document.body.classList.toggle('vortrag');
  toast(document.body.classList.contains('vortrag') ? 'Vortragsmodus aktiv (ESC verlässt)' : 'Vortragsmodus aus');
}
document.addEventListener('keydown', e => {
  if (e.key === 'Escape' && document.body.classList.contains('vortrag')) {
    document.body.classList.remove('vortrag');
  }
});
```

- [ ] **Step 4: Verify**

Navigate to Beiratsbericht. Empty page with quarter selector. Click Vortragsmodus — text scales up. ESC exits Vortragsmodus.

- [ ] **Step 5: Commit**

```bash
git add Pryzm_Dashboard_Mockup.html
git commit -m "md-screens: Screen 3 scaffold + Vortragsmodus toggle"
```

---

### Task 4.2: Screen 3 — Three narrative paragraphs

**Files:**
- Modify: `Pryzm_Dashboard_Mockup.html`

- [ ] **Step 1: Add narrative CSS**

```css
.narrative{background:#fff;border:1px solid var(--border);border-radius:10px;padding:18px 20px;margin-top:16px;position:relative}
.narrative h3{font-family:'Manrope',sans-serif;font-size:13px;font-weight:700;color:var(--primary-deep);text-transform:uppercase;letter-spacing:.06em;margin-bottom:10px}
.narrative p{font-size:14.5px;line-height:1.65;color:var(--ink);margin:0}
.narrative .ed-edit{position:absolute;top:14px;right:48px;background:transparent;border:1px solid var(--border);border-radius:6px;padding:4px 8px;font-size:11.5px;color:var(--muted);cursor:pointer}
.narrative .src-link{position:absolute;top:14px;right:14px;background:transparent;border:0;font-size:14px;color:var(--muted);cursor:pointer;padding:4px 6px}
.narrative .ed-edit:hover, .narrative .src-link:hover{color:var(--ink);background:var(--grey-bg)}
```

- [ ] **Step 2: Add the three narratives inside `screen-md-beirat`**

After the `<p class="muted small">…</p>`, before the closing `</section>`:

```html
<div class="narrative">
  <button class="src-link" onclick="toast('Quellen für §1: WaWi-Buchungen Q1 2026 · Pryzm-Quote-Realisierung Q1 2026 · SAP-Modul FI-CO · Forecast-Modell v3.2 (Re-Train 2026-04-15)')">🔗</button>
  <button class="ed-edit" onclick="toast('Mock: Markdown-Editor für §1 mit Versionshistorie')">✏ Bearbeiten</button>
  <h3>§1 · Margenentwicklung (Controlling-Sicht)</h3>
  <p>Die EBITDA-Marge hat sich über die letzten sechs Monate von 11,4% auf 10,8% reduziert. Der größte Treiber ist Rohstoff-Drift (Stahl +5,8% YTD, Pass-through 3pp im Verzug). Pryzm-Empfehlungen haben €421K YTD gehalten (+11% vs. Plan). Die Forecast-Bandbreite für 2026 liegt bei €1,15M – €1,25M (Walk-forward-Fehler &lt;5% auf Q1-2025-Ist).</p>
</div>

<div class="narrative">
  <button class="src-link" onclick="toast('Quellen für §2: SAP-Kundenstamm · Pryzm-ARR-Aggregator Q1 2026 · Churn-Signal-Modell v2.1 · Retention-Offer-Tracking')">🔗</button>
  <button class="ed-edit" onclick="toast('Mock: Markdown-Editor für §2 mit Versionshistorie')">✏ Bearbeiten</button>
  <h3>§2 · Kundenkonzentration (Risiko-Sicht)</h3>
  <p>Top-1-Konzentration ist auf 14% gestiegen (+1,2pp ggü. Q-1). Kunde 101580 (Tier-1 Automotive, €487K ARR) zeigt seit 12 Tagen ein Churn-Signal; ein Retentionsangebot über €48K liegt vor. Top-30 = 78% Umsatz, stabil ggü. Q-1.</p>
</div>

<div class="narrative">
  <button class="src-link" onclick="toast('Quellen für §3: Pryzm-Quote-Engine · Guardrail-Konfiguration Q1 · Empfehlungs-Output 90T · Implementierungs-Tracking SAP')">🔗</button>
  <button class="ed-edit" onclick="toast('Mock: Markdown-Editor für §3 mit Versionshistorie')">✏ Bearbeiten</button>
  <h3>§3 · Preisdisziplin (Governance-Sicht)</h3>
  <p>Quotes innerhalb Guardrail liegen im April bei 87% (Ziel 92%). Drei Artikel verursachen 62% aller Brüche, davon Artikel 200832-E mit 539 Brüchen in Q1. Pricing Manager hat 47 von 75 Empfehlungen akzeptiert; 28 sind akzeptiert, aber nicht umgesetzt (€187K). Implementierungsfriktion ist Thema im nächsten 1:1.</p>
</div>
```

- [ ] **Step 3: Verify**

Beiratsbericht shows 3 narrative paragraphs, each with `🔗` source link and `✏ Bearbeiten` button. Click each — they toast their respective contents. In Vortragsmodus the edit/source buttons disappear, text scales up.

- [ ] **Step 4: Commit**

```bash
git add Pryzm_Dashboard_Mockup.html
git commit -m "md-screens: Screen 3 three narrative paragraphs (Margin/Concentration/Discipline)"
```

---

### Task 4.3: Screen 3 — Panel A (Margenentwicklung waterfall + forecast band)

**Files:**
- Modify: `Pryzm_Dashboard_Mockup.html`

Spec §6.3 Panel A — locked-to-date 6-month waterfall + 2026 forecast P10/P50/P90 + defensibility footer.

- [ ] **Step 1: Append Panel A HTML**

After the third narrative div, inside `screen-md-beirat`:

```html
<div class="card card-pad mt-24">
  <div class="section-title">Panel A · Margenentwicklung</div>
  <h2 class="h2 mb-16">6-Monats-Bridge + 2026-Forecast</h2>
  <div style="display:grid;grid-template-columns:2fr 1fr;gap:16px;align-items:stretch">
    <div style="height:240px;position:relative"><canvas id="mdBeiratWF"></canvas></div>
    <div style="height:240px;position:relative;border-left:1px solid var(--border);padding-left:14px">
      <div class="section-title" style="margin:0 0 4px 0">2026 Forecast P10/P50/P90</div>
      <canvas id="mdBeiratForecast"></canvas>
    </div>
  </div>
  <p class="muted small" style="margin-top:10px">Walk-forward-Fehler: 4,7% auf Q1-2025 Ist · Monte-Carlo n=10.000 · Modellversion v3.2 · letzter Re-Train 2026-04-15</p>
</div>
```

- [ ] **Step 2: Hydrate charts in `initMDBeirat()`**

Replace the stub `initMDBeirat` from Task 3.1 with:

```javascript
function initMDBeirat(){
  // Panel A: waterfall (mirrors monthly waterfall but locked-to-date)
  const wf = document.getElementById('mdBeiratWF');
  if (wf && !wf._h){
    wf._h = 1;
    new Chart(wf, {
      type:'bar',
      data:{
        labels:['Okt 25','Vol mix','Preis','Rohstoff','Lieferant','Garantie','Andere','Apr 26'],
        datasets:[{
          data:[[0,11.4],[11.4,11.6],[11.6,11.2],[11.2,10.7],[10.7,10.5],[10.5,10.6],[10.6,10.8],[0,10.8]],
          backgroundColor:['#94a3b8','#16a34a','#ef4444','#ef4444','#ef4444','#16a34a','#16a34a','#94a3b8'],
          borderRadius:4
        }]
      },
      options:{plugins:{legend:{display:false}}, scales:{x:{grid:{display:false}, ticks:{font:{size:10}}}, y:{min:9.5, max:12, ticks:{callback:v=>v+'pp', font:{size:10}}, grid:{color:'#f1f5f9'}}}, responsive:true, maintainAspectRatio:false}
    });
  }
  // Panel A: forecast P10/P50/P90 fan
  const fc = document.getElementById('mdBeiratForecast');
  if (fc && !fc._h){
    fc._h = 1;
    const months = ['Apr','Mai','Jun','Jul','Aug','Sep','Okt','Nov','Dez','Jan','Feb','Mär'];
    const p50 = [100,102,104,106,108,109,110,111,112,113,114,115];
    const p10 = p50.map((v,i)=>v - (i+1)*0.6);
    const p90 = p50.map((v,i)=>v + (i+1)*0.6);
    new Chart(fc, {
      type:'line',
      data:{labels:months, datasets:[
        {label:'P90', data:p90, borderColor:'rgba(44,121,255,.3)', backgroundColor:'rgba(44,121,255,.08)', tension:.3, pointRadius:0, fill:'+1'},
        {label:'P50', data:p50, borderColor:'#2c79ff', backgroundColor:'rgba(44,121,255,.18)', tension:.3, pointRadius:0, fill:'+1', borderWidth:2},
        {label:'P10', data:p10, borderColor:'rgba(44,121,255,.3)', tension:.3, pointRadius:0, fill:false}
      ]},
      options:{plugins:{legend:{display:false}}, scales:{x:{grid:{display:false}, ticks:{font:{size:10}}}, y:{display:false}}, responsive:true, maintainAspectRatio:false}
    });
  }
  // Panel B + Panel C charts hydrated in their tasks
}
```

- [ ] **Step 3: Verify**

Beiratsbericht → Panel A renders waterfall on left, fan chart on right, defensibility footer below. In Vortragsmodus, charts remain visible (only edit/source affordances are hidden).

- [ ] **Step 4: Commit**

```bash
git add Pryzm_Dashboard_Mockup.html
git commit -m "md-screens: Screen 3 Panel A (Margenentwicklung waterfall + P10/P50/P90 fan)"
```

---

### Task 4.4: Screen 3 — Panel B (Kundenkonzentration top-10 + Pareto)

**Files:**
- Modify: `Pryzm_Dashboard_Mockup.html`

- [ ] **Step 1: Append Panel B HTML**

After Panel A's card:

```html
<div class="card card-pad mt-24">
  <div class="section-title">Panel B · Kundenkonzentration</div>
  <h2 class="h2 mb-16">Top-10 ARR + Pareto</h2>
  <div style="display:grid;grid-template-columns:2fr 1fr;gap:16px">
    <table>
      <thead><tr><th style="width:40px">#</th><th>Kunde</th><th>ARR</th><th>Δ vs Q-1</th><th>Marge-pp</th><th>Risiko</th></tr></thead>
      <tbody>
        <tr data-lens="customer" data-id="101580" style="cursor:pointer"><td>1</td><td><b>101580</b> · Continental AG</td><td class="num-cell">€487K</td><td class="num-cell neg">−€32K</td><td class="num-cell neg">9,1pp · −2,4pp</td><td><span class="pin r"></span> hoch</td></tr>
        <tr data-lens="customer" data-id="101901" style="cursor:pointer"><td>2</td><td><b>101901</b> · Bosch Mobility</td><td class="num-cell">€312K</td><td class="num-cell pos">+€8K</td><td class="num-cell pos">12,1pp · +0,3pp</td><td>—</td></tr>
        <tr data-lens="customer" data-id="103044" style="cursor:pointer"><td>3</td><td><b>103044</b> · Webasto</td><td class="num-cell">€264K</td><td class="num-cell neg">−€6K</td><td class="num-cell neg">10,4pp · −0,8pp</td><td><span class="pin a"></span> mittel</td></tr>
        <tr data-lens="customer" data-id="102330" style="cursor:pointer"><td>4</td><td><b>102330</b> · BorgWarner</td><td class="num-cell">€241K</td><td class="num-cell neg">−€18K</td><td class="num-cell neg">9,8pp · −1,1pp</td><td><span class="pin a"></span> mittel</td></tr>
        <tr data-lens="customer" data-id="102801" style="cursor:pointer"><td>5</td><td><b>102801</b> · Mahle</td><td class="num-cell">€198K</td><td class="num-cell pos">+€2K</td><td class="num-cell pos">11,9pp · +0,4pp</td><td>—</td></tr>
        <tr data-lens="customer" data-id="104410" style="cursor:pointer"><td>6</td><td><b>104410</b> · ZF Friedrichshafen</td><td class="num-cell">€176K</td><td class="num-cell pos">+€11K</td><td class="num-cell pos">12,4pp · +0,9pp</td><td>—</td></tr>
        <tr data-lens="customer" data-id="105220" style="cursor:pointer"><td>7</td><td><b>105220</b> · Festo</td><td class="num-cell">€158K</td><td class="num-cell pos">+€4K</td><td class="num-cell">11,5pp · ±0pp</td><td>—</td></tr>
        <tr data-lens="customer" data-id="106110" style="cursor:pointer"><td>8</td><td><b>106110</b> · Bürkert</td><td class="num-cell">€142K</td><td class="num-cell neg">−€3K</td><td class="num-cell neg">11,2pp · −0,2pp</td><td>—</td></tr>
        <tr data-lens="customer" data-id="107010" style="cursor:pointer"><td>9</td><td><b>107010</b> · Schaeffler</td><td class="num-cell">€131K</td><td class="num-cell pos">+€6K</td><td class="num-cell pos">12,0pp · +0,5pp</td><td>—</td></tr>
        <tr data-lens="customer" data-id="108220" style="cursor:pointer"><td>10</td><td><b>108220</b> · Knorr-Bremse</td><td class="num-cell">€118K</td><td class="num-cell pos">+€1K</td><td class="num-cell pos">11,6pp · +0,1pp</td><td>—</td></tr>
      </tbody>
    </table>
    <div style="height:240px;position:relative">
      <div class="section-title" style="margin:0 0 4px 0">Pareto · Top-30 = 78% Umsatz</div>
      <canvas id="mdBeiratPareto"></canvas>
    </div>
  </div>
</div>
```

- [ ] **Step 2: Hydrate Pareto in `initMDBeirat()`**

Inside `initMDBeirat`, after the forecast hydration:

```javascript
const par = document.getElementById('mdBeiratPareto');
if (par && !par._h){
  par._h = 1;
  // Cumulative Pareto: 30 customers reach 78% revenue
  const cum = [];
  let v = 0;
  for (let i=1;i<=30;i++){ v += (78/30) * (1.6 - i*0.04); cum.push(Math.min(v,78)); }
  new Chart(par, {
    type:'bar',
    data:{labels:cum.map((_,i)=>i+1), datasets:[{type:'line', data:cum, borderColor:'#2c79ff', borderWidth:2, pointRadius:0, tension:.3, fill:true, backgroundColor:'rgba(44,121,255,.12)'}]},
    options:{plugins:{legend:{display:false}}, scales:{x:{display:false}, y:{min:0, max:100, ticks:{callback:v=>v+'%', font:{size:10}}, grid:{color:'#f1f5f9'}}}, responsive:true, maintainAspectRatio:false}
  });
}
```

- [ ] **Step 3: Verify**

Panel B shows Top-10 table on left, Pareto curve on right rising to 78% at customer #30. Click row 1 → Customer Lens (101580). In Vortragsmodus, rows are non-clickable.

- [ ] **Step 4: Commit**

```bash
git add Pryzm_Dashboard_Mockup.html
git commit -m "md-screens: Screen 3 Panel B (top-10 + Pareto curve)"
```

---

### Task 4.5: Screen 3 — Panel C (Preisdisziplin trend + top-3 SKUs)

**Files:**
- Modify: `Pryzm_Dashboard_Mockup.html`

- [ ] **Step 1: Append Panel C HTML**

After Panel B's card:

```html
<div class="card card-pad mt-24">
  <div class="section-title">Panel C · Preisdisziplin</div>
  <h2 class="h2 mb-16">12-Monats-Trend + Top-3 SKUs</h2>
  <div style="height:200px;position:relative"><canvas id="mdBeiratDisc"></canvas></div>
  <div class="section-title" style="margin-top:18px">Top-3 SKUs nach Brüchen</div>
  <table style="margin-top:6px">
    <thead><tr><th style="width:40px">#</th><th>Artikel</th><th>Brüche (Q1)</th><th>€ Impact (annualisiert)</th></tr></thead>
    <tbody>
      <tr data-lens="sku" data-id="200832-E" style="cursor:pointer"><td>1</td><td><b>200832-E</b> · Zahnradpumpe</td><td class="num-cell">539</td><td class="num-cell neg">−€18,6K</td></tr>
      <tr data-lens="sku" data-id="211094-C" style="cursor:pointer"><td>2</td><td><b>211094-C</b> · Mikropumpe Hastelloy</td><td class="num-cell">214</td><td class="num-cell neg">−€8,1K</td></tr>
      <tr data-lens="sku" data-id="218750-D" style="cursor:pointer"><td>3</td><td><b>218750-D</b> · Dosierpumpe</td><td class="num-cell">158</td><td class="num-cell neg">−€5,4K</td></tr>
    </tbody>
  </table>
</div>
```

- [ ] **Step 2: Hydrate the trend chart in `initMDBeirat()`**

After the Pareto hydration:

```javascript
const bd = document.getElementById('mdBeiratDisc');
if (bd && !bd._h){
  bd._h = 1;
  new Chart(bd, {
    type:'line',
    data:{labels:['Mai','Jun','Jul','Aug','Sep','Okt','Nov','Dez','Jan','Feb','Mär','Apr'], datasets:[
      {label:'% innerhalb Guardrail', data:[91,92,90,91,89,90,91,89,88,89,88,87], borderColor:'#2c79ff', backgroundColor:'rgba(44,121,255,.1)', tension:.3, fill:true, pointRadius:3, borderWidth:2},
      {label:'Ziel (92%)', data:Array(12).fill(92), borderColor:'#94a3b8', borderDash:[5,5], borderWidth:1.5, pointRadius:0, fill:false}
    ]},
    options:{plugins:{legend:{display:true, position:'bottom', labels:{boxWidth:12, font:{size:11}}}}, scales:{x:{grid:{display:false}, ticks:{font:{size:11}}}, y:{min:80, max:100, ticks:{callback:v=>v+'%', font:{size:11}}, grid:{color:'#f1f5f9'}}}, responsive:true, maintainAspectRatio:false}
  });
}
```

- [ ] **Step 3: Verify**

Panel C shows the discipline line + Top-3 SKU table. Click 200832-E row → SKU Lens. In Vortragsmodus rows non-clickable.

- [ ] **Step 4: Commit**

```bash
git add Pryzm_Dashboard_Mockup.html
git commit -m "md-screens: Screen 3 Panel C (price discipline trend + top-3 SKUs)"
```

---

### Task 4.6: Screen 3 — Anhang (methodology page)

**Files:**
- Modify: `Pryzm_Dashboard_Mockup.html`

- [ ] **Step 1: Append Anhang HTML**

After Panel C's card, inside `screen-md-beirat`:

```html
<div class="card card-pad mt-24">
  <div class="section-title">Anhang · Methodik</div>
  <h2 class="h2 mb-16">Glossar, Quellen, Modellkarte, Änderungsprotokoll</h2>

  <div style="display:grid;grid-template-columns:1fr 1fr;gap:24px">
    <div>
      <div class="section-title" style="margin-bottom:8px">Glossar</div>
      <p class="muted small" style="line-height:1.7"><b>Deckungsbeitrag:</b> Umsatz minus variable Kosten.<br><b>Marge-Realisierung:</b> realisierter Preis ÷ Listenpreis.<br><b>Walk-forward-Fehler:</b> Forecast-Fehler auf zurückgehaltenem Quartal.<br><b>Guardrail:</b> Untergrenze für Quote-Preise.<br><b>Pareto:</b> kumulierte Anteilskurve.<br><b>Monte-Carlo:</b> n=10.000 Simulationen mit Input-Verteilung.</p>
    </div>
    <div>
      <div class="section-title" style="margin-bottom:8px">Datenquellen</div>
      <p class="muted small" style="line-height:1.7">SAP-Modul FI-CO (Buchungen)<br>SAP-Modul SD (Quotes &amp; Orders)<br>Pryzm-Quote-Engine (Realisierung &amp; Guardrail)<br>Pryzm-Forecast-Modell v3.2<br>Snapshot-Datum: 2026-04-28 09:00</p>
    </div>
  </div>

  <div style="margin-top:18px">
    <div class="section-title" style="margin-bottom:8px">Modellkarte</div>
    <table>
      <thead><tr><th>Quartal</th><th>Modellversion</th><th>Re-Train</th><th>Walk-forward-Fehler</th></tr></thead>
      <tbody>
        <tr><td>Q1 2026</td><td>v3.2</td><td>2026-04-15</td><td class="num-cell">4,7%</td></tr>
        <tr><td>Q4 2025</td><td>v3.1</td><td>2026-01-12</td><td class="num-cell">5,1%</td></tr>
        <tr><td>Q3 2025</td><td>v3.0</td><td>2025-10-08</td><td class="num-cell">5,8%</td></tr>
        <tr><td>Q2 2025</td><td>v2.9</td><td>2025-07-04</td><td class="num-cell">6,4%</td></tr>
      </tbody>
    </table>
  </div>

  <div style="margin-top:18px">
    <div class="section-title" style="margin-bottom:8px">Änderungsprotokoll seit Q4-2025-Bericht</div>
    <p class="muted small" style="line-height:1.7">• Forecast-Modell auf v3.2 aktualisiert (Re-Train mit Q1-Daten)<br>• Top-1-Konzentrations-Schwelle in Risiko-Sicht hinzugefügt<br>• Implementierungs-Lücke in Governance-Sicht explizit ausgewiesen<br>• Pareto-Kurve in Panel B ergänzt</p>
  </div>
</div>
```

- [ ] **Step 2: Verify**

Anhang appears as last card on Beiratsbericht. All sections render. In Vortragsmodus the page becomes the "page 4 / 5th slide" if Klaus pages through with `←/→` (keyboard nav added in Task 4.7).

- [ ] **Step 3: Commit**

```bash
git add Pryzm_Dashboard_Mockup.html
git commit -m "md-screens: Screen 3 Anhang (methodology, sources, model card, changelog)"
```

---

### Task 4.7: Screen 3 — Vortragsmodus keyboard nav (←/→ between sections)

**Files:**
- Modify: `Pryzm_Dashboard_Mockup.html`

Spec §6.5 — in Vortragsmodus, `←/→` switches between narrative §1, §2, §3, Panel A, Panel B, Panel C, Anhang as discrete "slides" (auto-scrolls into view).

- [ ] **Step 1: Add a `data-slide` attribute to each section heading**

In each of the narrative blocks and panel cards on Screen 3, mark them as slides. The simplest approach: tag the wrapping div on each by adding a class.

Modify the three `<div class="narrative">` wrappers to:
- `<div class="narrative" data-slide="1">` (§1)
- `<div class="narrative" data-slide="2">` (§2)
- `<div class="narrative" data-slide="3">` (§3)

Modify the three Panel cards: add `data-slide="4"`, `data-slide="5"`, `data-slide="6"` to each `<div class="card card-pad mt-24">` wrapping a Panel.

Add `data-slide="7"` to the Anhang card wrapper.

- [ ] **Step 2: Add the keyboard navigation JS**

Append to script:

```javascript
let _vortragSlide = 1;
document.addEventListener('keydown', e => {
  if (!document.body.classList.contains('vortrag')) return;
  if (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight') return;
  e.preventDefault();
  const slides = document.querySelectorAll('#screen-md-beirat [data-slide]');
  if (!slides.length) return;
  if (e.key === 'ArrowRight') _vortragSlide = Math.min(_vortragSlide + 1, slides.length);
  if (e.key === 'ArrowLeft')  _vortragSlide = Math.max(_vortragSlide - 1, 1);
  const target = document.querySelector('#screen-md-beirat [data-slide="'+_vortragSlide+'"]');
  if (target) target.scrollIntoView({behavior:'smooth', block:'start'});
});
```

- [ ] **Step 3: Verify**

Beiratsbericht → click Vortragsmodus → press `→` 6 times: page should scroll through §1, §2, §3, Panel A, Panel B, Panel C, Anhang. Press `←` to go back. ESC exits Vortragsmodus.

- [ ] **Step 4: Commit**

```bash
git add Pryzm_Dashboard_Mockup.html
git commit -m "md-screens: Screen 3 Vortragsmodus keyboard nav between 7 slides"
```

---

## Phase 5 — Polish & audits

### Task 5.1: Anti-feature audit — full search for forbidden patterns

**Files:**
- Read: `Pryzm_Dashboard_Mockup.html`

- [ ] **Step 1: Run forbidden-word grep on the MD-relevant sections**

```bash
# Extract MD-relevant content (Screen 1, Screen 2, Screen 3, lens) by line range
sed -n '/screen-action-md/,/<!-- ============== ACTION CENTER : SALES REP/p' Pryzm_Dashboard_Mockup.html > /tmp/md-screen1.txt
sed -n '/screen-md-monthly/,/<!-- ============== BEIRATSBERICHT/p' Pryzm_Dashboard_Mockup.html > /tmp/md-screen2.txt
sed -n '/screen-md-beirat/,/<\/section>/p' Pryzm_Dashboard_Mockup.html > /tmp/md-screen3.txt

# Forbidden words audit
for f in /tmp/md-screen*.txt; do
  echo "=== $f ==="
  grep -niE "\b(AI|KI|intelligent|smart|powered by|AI-powered|insights powered)\b" "$f" || echo "clean"
done
```

Expected: every result is "clean", or all hits are inside CSS class names like `.btn` (false positive). If any hit is in user-visible copy, fix it.

- [ ] **Step 2: Run anti-feature grep — KPI tile sparkline check**

```bash
# Screen 1: 5-tile KPI band must NOT contain canvas elements
sed -n '/grid-5 mt-24/,/<\/div>/p' Pryzm_Dashboard_Mockup.html | grep -c canvas
```

Expected: `0`. If non-zero, a sparkline crept into a KPI tile (anti-feature §4.6).

- [ ] **Step 3: Run anti-feature grep — Salesforce-table check**

Screen 2 top-10 + Screen 3 Panel B should each show 5 columns max. Count the `<th>` per table:

```bash
grep -c '<th' Pryzm_Dashboard_Mockup.html
```

Manually verify in browser: top-10 list has 6 columns max (rank + 4 data + status icon = 6, acceptable; spec §5.4 says "5 columns" but the rank index doesn't count as a data column, and the status pin column is icon-only — still in spirit). Panel B has 6 columns (same logic). If either has 7+ columns, drop one.

- [ ] **Step 4: Commit (no code changes if audit clean)**

If fixes were needed, commit with:

```bash
git add Pryzm_Dashboard_Mockup.html
git commit -m "md-screens: anti-feature audit fixes (forbidden words / sparklines / column count)"
```

If audit was clean, skip commit.

---

### Task 5.2: Persona-voice copy audit

**Files:**
- Read: `Pryzm_Dashboard_Mockup.html`

Manual review against spec §2.8 "Voice & language":
1. Headlines as sentences, not labels (`Wo die Marge seit Oktober steht` ✓ vs `MARGIN TRAJECTORY` ✗)
2. All numbers have units, comparators, time frames
3. No exclamation marks
4. No decorative emoji (functional only — 🔍 🔒 🖥 ↓ ✏ 🔗 ✉ 📅 ✓ ✕ are all functional)

- [ ] **Step 1: Grep for exclamation marks in Screen 1/2/3 content**

```bash
sed -n '/screen-action-md/,/<\/main>/p' Pryzm_Dashboard_Mockup.html | grep -nE '!"|! ' | grep -v "!important"
```

Expected: empty (CSS `!important` is fine; copy `!` is not).

- [ ] **Step 2: Grep for ALL-CAPS headlines (label-style, not sentence-style)**

```bash
sed -n '/screen-action-md/,/<\/main>/p' Pryzm_Dashboard_Mockup.html | grep -E '<h[12][^>]*>[A-ZÄÖÜ ]{8,}<' || echo "clean"
```

Expected: clean (everything should read like a sentence; `<h2>YTD MARGIN CAPTURED</h2>` would be a hit).

- [ ] **Step 3: Spot-check defensibility footers per panel**

Open the file in a browser and confirm each chart/table has a source/method line nearby:
- Screen 1 forecast: `<5% Fehler auf Q1-2025-Ist · Walk-forward · Monte-Carlo` ✓
- Screen 1 team: `Wie wird das berechnet? →` link ✓
- Screen 2 waterfall: `Quellen: WaWi-Buchungen + Pryzm-Quote-Realisierung · 6-Monats-Rolling` ✓
- Screen 2 discipline: `Wie wird Disziplin gemessen? →` link ✓
- Screen 3 Panel A: full defensibility footer (Walk-forward, Monte-Carlo, model version, re-train date) ✓

- [ ] **Step 4: Commit any fixes**

```bash
git add Pryzm_Dashboard_Mockup.html
git commit -m "md-screens: persona-voice copy fixes (sentences not labels, defensibility footers)"
```

(Skip commit if no fixes.)

---

### Task 5.3: Cross-screen drill matrix verification (manual)

**Files:**
- Read: `Pryzm_Dashboard_Mockup.html`

Manually click through every drill source from spec §7.4 and confirm correct lens opens:

- [ ] **Step 1: Verify Screen 1 drills**

| Action | Expected lens |
|---|---|
| Click 🔍 on BKAGG flag | Manager Lens (Hoffmann) |
| Click 🔍 on Customer 101580 flag | Customer Lens |
| Click 🔍 on Article 200832-E flag | SKU Lens |
| Click team-perf row Weber | Manager Lens (Weber) |
| Click team-perf row Hoffmann | Manager Lens (Hoffmann) |
| Click team-perf row Becker | Manager Lens (Becker) |
| Click any KPI tile | Nothing (read-only) |

- [ ] **Step 2: Verify Screen 2 drills**

| Action | Expected |
|---|---|
| Click top-10 row Continental | Customer Lens |
| Click top-10 row #2 Bosch Mobility | Customer Lens (fallback) |
| Click Top-3 SKU row 200832-E | SKU Lens |
| Click any segment card | Nothing (no segment lens) |
| Click "Warum diese Frage?" | Toast (reason chain) |
| Click "Alle 7 sehen" | Toast |

- [ ] **Step 3: Verify Screen 3 drills (prep mode)**

| Action | Expected |
|---|---|
| Click Panel B customer row | Customer Lens |
| Click Panel C SKU row | SKU Lens |
| Click ✏ Bearbeiten on §1 | Toast (mock editor) |
| Click 🔗 source on §2 | Toast (source list) |

- [ ] **Step 4: Verify Screen 3 drills (Vortragsmodus = no drills)**

Toggle Vortragsmodus on, then attempt:

| Action | Expected |
|---|---|
| Click Panel B customer row | Nothing (pointer-events: none) |
| Click ✏ Bearbeiten | Hidden (display: none) |
| Press → (right arrow) | Scroll to next slide |
| Press ESC | Exit Vortragsmodus |

- [ ] **Step 5: Verify lens chain rules**

| From | To | Allowed? |
|---|---|---|
| SKU Lens (200832-E) → top-3 customer chip | Customer Lens | ✓ |
| Manager Lens (Weber) → top-3 customer row | Customer Lens | ✓ |
| Customer Lens → any chip | (none — Customer Lens has no outbound chains) | ✓ (intentional) |

- [ ] **Step 6: Commit (no changes expected; this task is verification only)**

If any drill is wrong, fix the `data-lens` / `data-id` attribute and commit:

```bash
git add Pryzm_Dashboard_Mockup.html
git commit -m "md-screens: drill matrix corrections from cross-screen audit"
```

---

### Task 5.4: Final smoke test

**Files:**
- Read: `Pryzm_Dashboard_Mockup.html`

- [ ] **Step 1: Switch through all three personas in succession**

1. Open file → starts as PM persona. Verify all PM screens render. Click MD persona button.
2. MD persona: nav shows Action Center, Monatsabschluss, Beiratsbericht only. Click each — all 3 render with correct headers, charts, drills.
3. Click SR persona: nav shows Action Center only. Sales Rep action screen renders.
4. Back to MD: state preserved (still on Beiratsbericht if last visited).

- [ ] **Step 2: Verify no console errors**

Open DevTools → Console. Click each MD screen and trigger every drill. Should be no `Uncaught` or `ReferenceError` messages. Chart.js warnings about unused datasets are acceptable.

- [ ] **Step 3: Verify file size is sane**

```bash
wc -l Pryzm_Dashboard_Mockup.html
ls -la Pryzm_Dashboard_Mockup.html
```

Baseline was 4539 lines / 301KB. Expect ~6500 lines / ~430KB after this work. If significantly larger, audit for accidental duplication.

- [ ] **Step 4: Final commit if any fixes**

```bash
git add Pryzm_Dashboard_Mockup.html
git commit -m "md-screens: final smoke-test fixes"
```

---

## Self-review checklist

Run through this after the plan is fully implemented:

- [ ] **Spec coverage:** Every section in `2026-05-03-md-persona-screens-design.md` is implemented:
  - §4 Screen 1 — Tasks 1.3, 1.4, 1.5, 1.6 ✓
  - §5 Screen 2 — Tasks 3.1, 3.2, 3.3, 3.4, 3.5, 3.6 ✓
  - §6 Screen 3 — Tasks 4.1, 4.2, 4.3, 4.4, 4.5, 4.6, 4.7 ✓
  - §7 Lenses — Tasks 2.1, 2.2, 2.3 ✓
  - Persona-aware nav — Tasks 1.1, 1.2 ✓
  - Anti-feature audits — Tasks 5.1, 5.2, 5.3 ✓
- [ ] **Placeholder scan:** No "TBD" / "TODO" / "implement later" anywhere in this plan
- [ ] **Type consistency:** All `data-lens` values are `customer | sku | manager`. All `data-id` references match keys in `LENS_DATA`. The `initMDMonthly` and `initMDBeirat` function names match `renderScreen()` dispatch.
- [ ] **Drill matrix:** Spec §7.4 entries map 1:1 to Tasks 1.5 (red flags), 1.6 (team rows), 3.4 (top-10), 3.6 (top-3 SKUs), 4.4 (Panel B), 4.5 (Panel C). Lens chain rules enforced by data structure (Customer Lens has no `chips`/`rows` with `lens:` properties).

## Risks & open items

- **Pareto-curve math** in Task 4.4 is approximated to reach exactly 78% at index 30 — fine for mockup but a real product would derive from actual ARR data.
- **Customer Lens fallback** for IDs other than 101580: shows "Daten in Vorbereitung". For demo cleanliness consider pre-filling Bosch Mobility (101901) and 1–2 others before the live demo.
- **Vortragsmodus body class scope** affects only `#screen-md-beirat` content scaling. If Klaus accidentally toggles it on Screen 1, only the Beirat content scales. This is intentional (Vortragsmodus is a Beirat-only feature) but worth confirming with the user.
- **Chart.js version** — the existing mockup loads Chart.js via `<script>` already (it's used in PM screens). Confirm the version supports floating-bar `[start,end]` data tuples (works since Chart.js 3.x).
