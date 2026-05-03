---
title: MD (Geschäftsführer) Persona & Screens — Design Spec
created: 2026-05-03T21:56:51Z
updated: 2026-05-03T21:56:51Z
status: approved
mockup_target: Pryzm_Dashboard_Mockup.html
persona: Geschäftsführer (MD)
related_personas: Pricing Manager (Markus Weber), Sales Rep (Niklas)
---

# MD Persona & Screens — Design Spec

This spec defines the Managing Director (MD / Geschäftsführer) experience for the
Pryzm Dashboard mockup (`Pryzm_Dashboard_Mockup.html`). The Pricing Manager
persona ships today as a full app (Action, Forecast, Studio, Margin, Quotes,
Monday Briefing). This spec extends the MD from a single stub screen to a
complete, persona-grounded executive cockpit.

## 1. Framing decisions (locked)

| Decision | Choice | Rationale |
|---|---|---|
| Product lens | **Pricing-led commercial cockpit** (Option B in framing) | Anchored in pricing/quote/customer data Pryzm actually has, framed as MD's commercial cockpit — credible without inventing P&L data |
| Cadence / depth | **Weekly skim + monthly deep-dive** (Option B) | Matches realistic Mittelstand MD profile: delegates day-to-day, owns the monthly meeting, prepares for quarterly Beirat |
| MD archetype | **3rd-gen owner-operator, professionalized** (Option C) | Most demo-credible: owner-MD with engineering+MBA, modernizing the company, defends decisions to family Beirat |
| Screen architecture | **3 screens + 3 reusable lenses** (Option C) | Solves the "dead-end red flag" problem; drill drawers show summaries (counts/trends/signals), never line items |

## 2. Persona — Dr. Klaus Scherzinger, Geschäftsführender Gesellschafter

### 2.1 Snapshot

- **Age 51**, married, two kids in Gymnasium
- **Role:** Geschäftsführender Gesellschafter (Managing Partner — owner *and* MD, not a hired CEO)
- **Generation:** 3rd-gen owner-operator. Took over from his father in 2019.
- **Education:** Dipl.-Ing. Maschinenbau (TU Karlsruhe) + Executive MBA (Mannheim, 2014)
- **Career path:** 6 years at Bosch Rexroth in product management → 4 years at a Roland-Berger-spinoff strategy boutique → joined Scherzinger as COO 2015 → MD since 2019
- **Lives in:** Renovated farmhouse 12 km from the factory, drives a 5-year-old Audi A6 Avant

### 2.2 What he runs

~150 employees · €52M revenue · EBITDA 11.4% · factory in Furtwangen ·
sales offices in Stuttgart and Lyon · top 30 customers = 78% of revenue ·
top 1 customer (a German Tier-1 automotive) = 14% (gives him heartburn) ·
margin compressed 2.8pp over 4 years from steel/aluminium volatility +
Asian price pressure on legacy SKUs.

### 2.3 Reports to whom

A 5-person **Beirat**: his mother (family seat), his uncle (family seat),
a retired CEO of a Black-Forest precision-engineering firm (chair),
an M&A partner from a Stuttgart firm, a former CFO of a larger pump group.
Meets quarterly. Klaus's father attends as guest.

### 2.4 What he reads / believes

- *Manager Magazin*, *Produktion*, *Handelsblatt* on Saturdays
- Believes in engineering quality, supplier loyalty, paying apprentices well
- Skeptical of "AI" but bought Pryzm because the Beirat chair pushed for "professionalize the commercial side"
- His operating principle to Markus: *"Wenn ich das nicht in einem Satz dem Beirat erklären kann, ist es nutzlos."*

### 2.5 Three jobs-to-be-done

1. **Monday 10-minute skim**: *"Is anything on fire that I'd be embarrassed to be surprised by?"* → **Screen 1**
2. **Monthly management-meeting prep** (last Friday, 20 min): *"What 2 questions do I take into Tuesday's GL-Sitzung that will sharpen the team?"* → **Screen 2**
3. **Quarterly Beirat prep** (45 min): *"Hand me a 3-page narrative I can defend on margin, concentration, and discipline — with confidence bands the M&A guy won't shred."* → **Screen 3**

### 2.6 Anti-needs (apply across all screens)

- ❌ Individual quotes, RFQs, recommendations — *"Das ist Markus' Job."*
- ❌ Real-time anything — opens Pryzm 2× per week max
- ❌ "AI insights" / "AI-powered" hype language — *"Sag mir woher die Zahl kommt, dann glaube ich sie."*
- ❌ Score-card gamification, badges, trophies, leaderboard
- ❌ Recommendations without a reason chain
- ❌ Predictions without error bands
- ❌ More than 5 KPIs on one screen
- ❌ Anything that looks like a Salesforce screen (table of rows + filter chips + status pills)

### 2.7 Trigger moments

- Monday 08:30 — coffee, before standup
- Last Friday of the month, 16:00 — prepping the GL-Sitzung
- Two weeks before Beirat — Sunday evening at home
- Inbox events: *"Are you doing something about [customer X]?"* from his Beirat chair

### 2.8 Voice & language

- Plain numbers with units and time frames (`€421K · YTD · vs €380K Plan · +11%`)
- German operational terms (Deckungsbeitrag, Kundenkonzentration, Preisdisziplin) integrated into copy
- Past-tense framing: *"Last 90 days"* beats *"today"*
- Headlines that read like sentences (*"Margin captured €421K — three customers driving 70% of the gap"*) not chart titles
- No exclamation marks. No decorative emoji (functional icons only).

### 2.9 Success criterion

Klaus walks into the next Beirat, opens Pryzm on the boardroom screen for
90 seconds, says four sentences, closes it. The chair nods. The M&A partner
asks one follow-up. Klaus answers it without clicking anywhere.

## 3. Screen architecture overview

```
┌─────────────────────┐  ┌─────────────────────┐  ┌─────────────────────┐
│ Screen 1            │  │ Screen 2            │  │ Screen 3            │
│ Strategic Dashboard │  │ Monthly Review      │  │ Beirat Pack         │
│ (weekly skim)       │  │ (month-end prep)    │  │ (quarterly export)  │
└──────────┬──────────┘  └──────────┬──────────┘  └──────────┬──────────┘
           │                        │                        │
           └────────────────┬───────┴────────────────────────┘
                            ▼
                  ┌────────────────────┐
                  │ Customer Lens      │  ← right-side 400px drawer
                  │ SKU Lens           │  ← summaries only, never line items
                  │ Manager Lens       │  ← max 5 blocks, sticky 2-3 CTA footer
                  └────────────────────┘
```

**Allowed chains**: Manager Lens → Customer Lens, SKU Lens → Customer Lens.
**Disallowed**: any chain back from Customer Lens (depth ≤ 2; prevents rabbit holes).

## 4. Screen 1 — Strategic Dashboard

**Single question this screen answers:** *"Is anything on fire that I'd be embarrassed to be surprised by?"*

**Use moment:** Monday 08:30, 5–10 min, coffee in hand. Default landing page for the MD persona. Also opens on the boardroom screen during ad-hoc Beirat moments for the same view.

### 4.1 Page header

- Crumb: `Strategic Cockpit · Geschäftsführer`
- H1: `Guten Morgen, Klaus. Woche 18.`
- Right-rail buttons: `📤 An Beirat-Vorsitz senden` · `↓ PDF`
- Subtitle (the answer): one sentence, e.g.
  *"Drei rote Flaggen offen. €68K Marge im Q gefährdet. Plan-Marge YTD bestätigt: €421K (+11% vs. Plan)."*

### 4.2 KPI band — exactly 5 tiles, one row

| Tile | Value | Sub | Logic / source |
|---|---|---|---|
| Marge YTD | €421K | vs €380K Plan · +11% | sum of accepted+implemented recs YTD |
| Marge gefährdet (Q) | €68K | 3 rote Flaggen | sum of at-risk items aged >7d |
| Forecast 2026 | €1,2M ±€60K | <5% Walk-forward Fehler | Monte-Carlo-Band, primary scenario |
| Kundenkonzentration | Top-1: 14% / Top-30: 78% | +1.2pp vs Q-1 | concentration trend |
| Preisdisziplin (90T) | 87% | Ziel 92% · −5pp | % quotes within guardrail |

5 KPIs is the maximum. No 6th.

### 4.3 Red-flag rail — max 3 items

Each card has 4 elements only:
- 🔴 / 🟡 icon + **title** (one sentence)
- One-line evidence (number + time frame)
- Age in days
- Two CTAs: `🔍 Untersuchen` (opens relevant Lens) · `✉ Markus fragen` (mock email toast)

Concrete examples:
- 🔴 *BKAGG-Region — Margenlücke auf −3,9pp ausgeweitet* · 14 Tage offen · 4 Quotes hängen · → **Manager Lens** (T. Hoffmann owns the region; he is the right person to ask)
- 🟡 *Kunde 101580 — Churn-Signal aktiv* · €487K ARR · 12 Tage offen · → **Customer Lens**
- 🟡 *Artikel 200832-E — 539 Guardrail-Brüche in Q1* · −€18,6K/Jahr · 8 Tage offen · → **SKU Lens**

If >3 flags, a 4th line says *"+2 weitere"* and links to a flag list (same 4-element format per item; no Salesforce-table).

### 4.4 12-month forecast band

- Headline: *"Umsatzband · Apr 2026 → Mar 2027"*
- Sub-line: *"<5% Fehler auf Q1-2025-Ist · Walk-forward · Monte-Carlo"*
- One canvas: P10/P50/P90 fan chart, 260px tall
- No interactivity required at this screen

### 4.5 Team performance — last 90 days

- Compact table, 3 rows (Markus / Hoffmann / Becker)
- Columns: Manager · Recs erteilt · Akzeptiert · Implementiert · €Captured · €Verfehlt
- **Click row → Manager Lens**
- Footer link: *"Wie wird das berechnet? →"* opens an inline info-tip (defensibility)

### 4.6 Anti-features (Screen 1)

- ❌ No "today" / real-time metrics
- ❌ No quote / RFQ / activity feed
- ❌ No individual recommendations widget
- ❌ No notification/inbox panel
- ❌ No "AI insights" badge or copy
- ❌ No charts beyond the forecast band (no sparklines on KPI tiles)
- ❌ No leaderboard / badges / score-card framing
- ❌ No filters on this screen

### 4.7 Drill paths from Screen 1

| From | To |
|---|---|
| Red flag (customer) | Customer Lens |
| Red flag (SKU) | SKU Lens |
| Team-perf row | Manager Lens |
| KPI tiles | (read-only, no drill) |

## 5. Screen 2 — Monthly Review

**Single question this screen answers:** *"What 2 sharp questions do I take into Tuesday's GL-Sitzung?"*

**Use moment:** Last Friday of the month, 16:00, ~20 minutes, Klaus alone in his office.

### 5.1 Page header

- Crumb: `Strategic Cockpit · Geschäftsführer · Monatsabschluss`
- H1: `Monatsabschluss April 2026`
- Right-rail: month picker (Apr 2026 ▾) · `↓ PDF für GL-Sitzung`
- Subtitle: *"Letzter Freitag im Monat. 20 Minuten. Zwei Fragen für Dienstag."*

### 5.2 The "2 questions" hero

Dark, prominent card. Two auto-generated, **Klaus-editable** questions for Tuesday's meeting. Each question:
- Grounded in a specific number elsewhere on the screen
- Names the manager who should answer it
- Has a "Warum diese Frage?" link → inline reason chain (sources, time frame, comparator)

Examples:

> **Frage 1 — an Markus & Tobias:**
> *"Warum ist die Preisdisziplin auf Artikel 200832-E im April auf 71% gefallen, obwohl wir im Februar eine Guardrail-Anpassung gemacht haben?"*
> Belegt durch: 539 Brüche Q1 → 187 Brüche allein April · −€18,6K/Jahr Trend
> [Warum diese Frage? →]

> **Frage 2 — an Tobias:**
> *"Sind die −2,1pp Margenverlust in der Region BKAGG strukturell oder ein Effekt von Kunde 101580?"*
> Belegt durch: BKAGG −3,9pp gesamt · Kunde 101580 = 41% des regionalen Umsatzes

Footer transparency line: *"Pryzm wählt 2 Fragen aus 7 Kandidaten. Alle 7 sehen →"*

### 5.3 Margin-trajectory waterfall (last 6 months)

- Headline: *"Wo die Marge seit Oktober steht"*
- One waterfall: bridge from Oct'25 EBITDA-margin to Apr'26 EBITDA-margin
- Bars labeled: *Volume mix · Preis-Drift · Rohstoff (Stahl/Alu) · Lieferanten · Garantierückstellung · Andere*
- Defensibility footer: *"Quellen: WaWi-Buchungen + Pryzm-Quote-Realisierung · 6-Monats-Rolling"*

### 5.4 Customer concentration — top 10 only

Compact list (not a table). Each row:
- Rank, Kundennummer, ARR, Δ vs Q-1 (color), Marge-pp Δ vs Q-1, status pill (only if at-risk)
- **Click row → Customer Lens**

Footer: *"Top-30 = 78% Umsatz · Top-10 hier · vollständige Top-30 →"* (inline expand, not separate page)

10 rows. 5 columns. No filters. No sort UI. Order fixed by ARR descending.

### 5.5 Segment shifts (2×2 grid)

One small card per segment (Automotive · Chemie/Process · Maschinenbau · Energie). Each card:
- Segment name + share of revenue (%)
- Revenue Δ vs same month LY (pp)
- Marge-pp vs Plan
- One micro-trend sparkline (12 months — only allowed sparkline category on Screen 2)
- One-line interpretation: *"Automotive: −3% Umsatz, −1,2pp Marge. Tier-1-Drift hält an."*

**No click-through on segment cards** (segments don't have a lens — anti-feature discipline).

### 5.6 Preisdisziplin-Trend

- Headline: *"Quotes innerhalb Guardrail · 12 Monate"*
- Single line chart, % over 12 months, target line at 92% (dashed grey)
- Below: 3 SKUs driving the most violations (rank · article · count · € impact)
- **Click SKU row → SKU Lens**
- Footer: *"Wie wird Disziplin gemessen? →"* opens info-tip

### 5.7 Anti-features (Screen 2)

- ❌ No team-performance table (lives on Screen 1, never duplicated)
- ❌ No forecast (lives on Screen 1; Screen 2 is rear-looking by design)
- ❌ No quote / RFQ / recommendation list
- ❌ No segment drill (no segment lens — by design)
- ❌ No filter chips, no date range picker beyond month selector
- ❌ No "compare to last year" toggle (deltas pre-computed; no live recalculation)
- ❌ No more than 1 sparkline category + 1 line chart

### 5.8 Drill paths from Screen 2

| From | To |
|---|---|
| Top-10 customer row | Customer Lens |
| Price-discipline SKU row | SKU Lens |
| "Warum diese Frage?" | Inline reason-chain modal (NOT a lens) |
| "Alle 7 [candidates] sehen" | Inline expand |
| "Vollständige Top-30" | Inline expand |

## 6. Screen 3 — Beirat Pack

**Single question this screen answers:** *"Hand me a 3-page narrative I can defend on margin, concentration, and discipline — with confidence bands the M&A partner won't shred."*

**Two use moments:**
- **Prep**: Sunday evening, 45 min, two weeks before the Beirat.
- **Present**: Tuesday Beirat morning, on the boardroom screen.

Single screen, two states via `Vortragsmodus` (presentation mode) toggle.

### 6.1 Page header

- Crumb: `Strategic Cockpit · Geschäftsführer · Beiratsbericht`
- H1: `Beiratsbericht Q1/2026` (quarter selector ▾)
- Right-rail buttons:
  - `🔒 Zahlen einfrieren am ___` (locks data snapshot to a date)
  - `🖥 Vortragsmodus`
  - `↓ PDF (3 Seiten + Anhang)`
- Subtitle: *"Stand: 28. April 2026 · gesperrt · Quellen unten."*

### 6.2 Executive narrative — the headline feature

Three short paragraphs, machine-drafted, **Klaus-editable, version-tracked**. One paragraph per Beirat lens (matches research: Controlling / Risk / Governance).

**§1 — Margenentwicklung (Controlling-Sicht)**
> *"Die EBITDA-Marge hat sich über die letzten sechs Monate von 11,4% auf 10,8% reduziert. Der größte Treiber ist Rohstoff-Drift (Stahl +5,8% YTD, Pass-through 3pp im Verzug). Pryzm-Empfehlungen haben €421K YTD gehalten (+11% vs. Plan). Die Forecast-Bandbreite für 2026 liegt bei €1,15M – €1,25M (Walk-forward-Fehler <5% auf Q1-2025-Ist)."*

**§2 — Kundenkonzentration (Risiko-Sicht)**
> *"Top-1-Konzentration ist auf 14% gestiegen (+1,2pp ggü. Q-1). Kunde 101580 (Tier-1 Automotive, €487K ARR) zeigt seit 12 Tagen ein Churn-Signal; ein Retentionsangebot über €48K liegt vor. Top-30 = 78% Umsatz, stabil ggü. Q-1."*

**§3 — Preisdisziplin (Governance-Sicht)**
> *"Quotes innerhalb Guardrail liegen im April bei 87% (Ziel 92%). Drei Artikel verursachen 62% aller Brüche, davon Artikel 200832-E mit 539 Brüchen in Q1. Pricing Manager hat 47 von 75 Empfehlungen akzeptiert; 28 sind akzeptiert, aber nicht umgesetzt (€187K). Implementierungsfriktion ist Thema im nächsten 1:1."*

Each paragraph has:
- ✏ inline edit button (drawer with markdown editor + version history)
- 🔗 "Quellen ansehen" link (lists every cell/query feeding the paragraph)

Each paragraph is exactly **4 sentences** (matches Klaus's stated success criterion).

### 6.3 Three quantitative panels (one per Beirat lens)

Single column, full-width, ~280px tall each. Order matches narrative paragraphs.

**Panel A — Margenentwicklung**
- Compact 6-month waterfall (locked-to-date)
- Right-side mini-band: 2026 forecast P10/P50/P90
- Defensibility footer: *"Walk-forward-Fehler: 4,7% auf Q1-2025 Ist · Monte-Carlo n=10.000 · Modellversion v3.2 · letzter Re-Train 2026-04-15"*

**Panel B — Kundenkonzentration**
- Top-10 ARR list (max 5 columns: name/number, ARR, Δ vs Q-1, Marge-pp, Risiko-Status)
- Pareto micro-chart on right showing Top-30 = 78%
- Click customer → Customer Lens (**prep mode only**)

**Panel C — Preisdisziplin**
- 12-month line: % within guardrail with target line
- Below: 3 SKUs driving violations (rank · article · count · € impact)
- Click SKU → SKU Lens (**prep mode only**)

### 6.4 Anhang — methodology page (always page 4 of PDF)

- Glossary: Deckungsbeitrag, Marge-Realisierung, Walk-forward-Fehler, Guardrail, Pareto, Monte-Carlo
- Data sources: SAP-Modul, Pryzm-Snapshot-Datum, Beirat-relevante Felder
- Model card: forecast version, train date, error history (last 4 quarters)
- Change log: what changed since last Beiratsbericht

### 6.5 Vortragsmodus behavior

- Hides all edit/drill affordances
- Type scaled ~140% (readable from 4m)
- Hover/click disabled except quarter selector
- Footer shows: *"Stand: __ · gesperrt · Quellen im Anhang"*
- Single keyboard control: `←/→` to switch between narrative § / Panel A / B / C / Anhang as 5 "slides"

Same URL, toggled state. **Not a separate screen. Not a PowerPoint export.**

### 6.6 Anti-features (Screen 3)

- ❌ No "AI" / "AI-generated" wording (would be shredded by M&A partner — narrative is "Pryzm-generierter Entwurf, durch GF freigegeben")
- ❌ No team-performance table (this is owner-level, not management-level)
- ❌ No live data after `Zahlen einfrieren` (frozen until next quarter or explicit re-lock)
- ❌ No "what-if" scenarios (Beirat is rear-looking + forward-banded, not interactive)
- ❌ No comments/discussion threads/approval workflows (Klaus owns the document; family Beirat is not a software user)
- ❌ No third-party benchmarks (no defensible source; lying to Beirat ends his career)
- ❌ No charts beyond the 3 panels' canonical visuals
- ❌ No filters

### 6.7 Drill paths from Screen 3

| From | To | Mode |
|---|---|---|
| Panel B customer row | Customer Lens | prep mode only |
| Panel C SKU row | SKU Lens | prep mode only |
| Narrative ✏ edit | Inline drawer (markdown + version history) | prep mode only |
| 🔗 Quellen ansehen | Modal listing source queries | prep mode only |

## 7. The three lenses — universal rules

- **Right-side drawer**, 400px wide, slides in over current screen, backdrop click / ESC closes
- **Header strip** identifies entity + shows source/snapshot date (`Quelle: SAP+Pryzm · Stand: 2026-04-28 09:00`)
- **Body**: max **5 blocks**, vertically stacked, scrollable
- **Footer**: 2–3 sticky CTAs only
- **NO line items anywhere** — counts, trends, signals, summaries; never individual quotes/RFQs/contacts/transactions
- **No filters, no date pickers, no toggles** inside a lens (time frames fixed: 90T / 24M / Q)
- **No actions that mutate data** — only outcomes are: email someone, mark as discussed (toast), or chain to a deeper lens (per the chain rules)

### 7.1 Lens 1 — Customer Lens

**Opens from**: Screen 1 red flag, Screen 2 top-10, Screen 3 Panel B (prep mode only).

**Header strip**:
- `Kunde 101580 · Continental AG (Tier-1 Automotive)`
- `Region: BKAGG · Account: T. Hoffmann · seit 2011`
- `Quelle: SAP+Pryzm · Stand: 2026-04-28 09:00`

**Body — 5 blocks**:

1. **ARR-Trend (24 Monate)** — line chart 80px, current-quarter dot highlighted. Below: `€487K ARR · −€32K vs. Q-1 · −6,2%`
2. **Marge-Trend (24 Monate)** — line chart, margin-pp, target dashed. Below: `9,1pp · −2,4pp vs. 24M-Schnitt`
3. **Drei Risiko-Signale** — three binary tiles in one row:
   - 🔴 **Churn-Signal aktiv** · *"Bestellfrequenz seit 2026-Q1 −38%"*
   - 🟡 **Konzentrations-Risiko** · *"14% Top-1-Anteil · +1,2pp vs. Q-1"*
   - 🟢 **Zahlungs-Signal stabil** · *"DSO 41T, im Korridor"*
4. **Quote-Aktivität (90 Tage) — nur Aggregate**: `5 Quotes gewonnen · 2 verloren · 1 offen · Win-Rate 71% · Marge-Realisierung 84%`
5. **Empfehlungs-Verlauf (90 Tage)**: `4 erteilt → 3 akzeptiert → 2 implementiert · €18K gehalten · €7K verpasst`

**CTAs (3)**: `✉ Markus fragen` · `✉ Hoffmann fragen` · `✓ Als besprochen markieren`

**Anti-features**: no quote list, no contact list, no article breakdown for this customer, no operator actions, no comparison to other customers.

### 7.2 Lens 2 — SKU Lens

**Opens from**: Screen 1 red flag (SKU), Screen 2 price-discipline row, Screen 3 Panel C (prep mode only).

**Header strip**:
- `Artikel 200832-E · Zahnradpumpe (Precision shaft)`
- `Familie: Automotive · Stückzahl 24M: 8.430 · Status: aktiv`
- `Quelle: SAP+Pryzm · Stand: 2026-04-28 09:00`

**Body — 5 blocks**:

1. **Inputkosten vs. Realisiertem Preis (24 Monate)** — single chart, two indexed lines (cost + price both indexed to 100). Below: `Pass-through-Lücke: 3,2pp · Stahl +5,8% YTD · Preis +2,6%`
2. **Kunden-Footprint — nur Aggregate**: `verkauft an 47 Kunden · Top-3: 41% des Volumens · Top-10: 78%`. Top-3 chips → **Customer Lens** (chained).
3. **Governance — Guardrail-Brüche**: `539 Brüche in Q1 · 187 allein April · €18,6K/Jahr Trend` + 12-month sparkline of monthly violations.
4. **Empfehlungs-Verlauf (90 Tage)**: `12 erteilt → 9 akzeptiert → 5 implementiert · €4K gehalten`
5. **Letzte Preisanpassung**: `2025-11-14 · +€1,80/Stk · von Markus · Genehmigt durch Klaus`

**CTAs (2)**: `✉ Markus fragen` · `✓ Als besprochen markieren`

**Anti-features**: no transaction list, no quote list, no order book, no "create new price" or "adjust guardrail" actions, no BOM, no supplier breakdown, no customer-by-customer pricing matrix, no competitor benchmarks.

### 7.3 Lens 3 — Manager Lens

**Opens from**: Screen 1 team-performance row.

**Header strip**:
- `M. Weber · Pricing Manager · Span: 47 Kunden, 312 SKUs`
- `Im Unternehmen seit 2018 · letzter 1:1: 2026-04-09`
- `Quelle: Pryzm · Stand: 2026-04-28 09:00`

**Body — 5 blocks**:

1. **Empfehlungs-Funnel (90 Tage)** — three big numbers in horizontal funnel: `75 erteilt → 47 akzeptiert (63%) → 38 implementiert (51%)`. Below: *"Implementierungs-Lücke: 9 Empfehlungen akzeptiert, aber nicht umgesetzt — €187K offen"*
2. **€ Captured · Wochen-Trend (90 Tage)** — line chart, weekly buckets, 80px. Below: `€421K gesamt · €38K letzte Woche · vs €32K Schnitt`
3. **€ Verfehlt — Top-3 Gründe (nur Aggregate)**:
   - `1. Zeitlich verzögert · 28 Fälle · €112K`
   - `2. Guardrail überschritten · 12 Fälle · €48K`
   - `3. Markt-Ablehnung · 7 Fälle · €27K`
4. **Top-3 Kunden im Span — mit Marge-Δ**: `Continental AG · −2,4pp · 🔴` / `Bosch Mobility · +0,3pp · 🟢` / `Webasto · −0,8pp · 🟡`. Each row → **Customer Lens** (chained).
5. **Quartals-Ziele**: `Marge-Capture €450K · Status: bei €421K · 94% nach 17 Wochen · on-track`

**CTAs (3)**: `📅 1:1 ansetzen` · `✉ Markus anschreiben` · `✓ Als besprochen markieren`

**Anti-features**: NO HR data (no salary, rating, PIP, leave, performance review history), no team org chart, no individual rec/quote/decision audit list, no leaderboard/score/ranking, no "edit goals"/"set targets" UI flow, no badges/streaks/kudos.

### 7.4 Drill matrix

| Source | Opens | Mode constraint |
|---|---|---|
| Screen 1 red flag (customer) | Customer Lens | always |
| Screen 1 red flag (SKU) | SKU Lens | always |
| Screen 1 team row | Manager Lens | always |
| Screen 2 top-10 row | Customer Lens | always |
| Screen 2 price-discipline SKU row | SKU Lens | always |
| Screen 3 Panel B customer row | Customer Lens | prep mode only |
| Screen 3 Panel C SKU row | SKU Lens | prep mode only |
| SKU Lens — top-3 customer chips | Customer Lens | chained |
| Manager Lens — top-3 customers | Customer Lens | chained |
| Customer Lens | (no chain — keeps depth ≤ 2) | — |

## 8. Implementation notes for the mockup

### 8.1 What exists today

- `screen-action-md` section (lines 1521–1591 of `Pryzm_Dashboard_Mockup.html`)
- Hero band, 3 KPI counters, 3 alert cards with mock email buttons, 12-month forecast canvas, team-performance table
- Persona switcher logic (`body[data-persona="md"]` etc.) hides irrelevant nav items

### 8.2 What changes for Screen 1

- Rename section: keep `screen-action-md` ID, retitle H1 to *"Guten Morgen, Klaus. Woche 18."*
- Add 2 KPI tiles to existing 3 (Kundenkonzentration, Preisdisziplin) — total 5
- Convert alert cards: add `🔍 Untersuchen` CTA alongside existing `✉ Markus fragen`
- Make team-perf rows clickable → Manager Lens drawer
- Subtitle updated to one-sentence "answer to anything-on-fire"

### 8.3 What's new (net-new sections)

- `screen-md-monthly` (Screen 2)
- `screen-md-beirat` (Screen 3)
- Lens drawer component (single component, three content variants by entity type)
- Inline reason-chain modal (Screen 2 "Warum diese Frage?")
- Markdown narrative editor drawer (Screen 3)

### 8.4 MD nav additions

Current MD nav shows only `Action` (mapped to the existing screen). Add:
- `Action / Strategic Dashboard` (existing, retitled in MD persona)
- `Monatsabschluss`
- `Beiratsbericht`

Other Pricing-Manager nav items remain hidden for the MD persona (forecast, studio, margin, quotes, ai/Monday Briefing).

### 8.5 Data continuity with existing mockup

All numbers carried forward from existing mockup data so the demo tells one coherent story:
- €421K YTD captured, €68K at risk, €1.2M 2026 forecast (existing)
- BKAGG region −3.9pp gap, 4 quotes hanging (existing)
- Customer 101580 churn signal, €487K ARR, €48K retention offer (existing)
- Article 200832-E with 539 governance violations Q1 (existing)
- 47/75 recommendations accepted, 28 not implemented = €187K (existing)
- M. Weber / T. Hoffmann / M. Becker as the three managers (existing)

New data introduced:
- Customer concentration: Top-1 14%, Top-30 78%, +1.2pp vs Q-1
- Pricing discipline: 87% in April, target 92%
- Walk-forward error: 4.7% on Q1-2025 actuals
- Segment shares: 4 segments with Δ vs LY and margin Δ vs Plan
- Six-month margin waterfall components

## 9. Phased implementation outline

(Detailed phase-by-phase plan to be produced in the writing-plans skill, after this spec is approved.)

**Phase 1**: Persona-switcher correctness + Screen 1 enhancements (5 KPIs, red-flag CTAs, team-row clickability)
**Phase 2**: Lens drawer component (reusable shell + 3 content variants)
**Phase 3**: Screen 2 (Monthly Review) — header, "2 questions" hero, waterfall, top-10, segments, discipline trend
**Phase 4**: Screen 3 (Beirat Pack) — header, 3 narrative paragraphs (with edit drawer), 3 panels, methodology Anhang, Vortragsmodus toggle
**Phase 5**: Polish pass — copy review against persona voice, defensibility footer audit, anti-feature audit (every section reviewed against the screen's anti-feature list)

## 10. Open items / risks

- **Editable narrative version history** (Screen 3): scope of "version history" — full audit log or just "previous version" toggle? Default: previous version + current, no full log.
- **Walk-forward error number**: hard-coded to 4.7% in mockup; consumer of demo should be told this is mocked.
- **Segment names**: Automotive / Chemie/Process / Maschinenbau / Energie chosen as plausible Scherzinger-style segments. If the demo audience is segment-specific, adjust.
- **"AI" word audit**: full text-search of Screens 1–3 + lenses to confirm zero occurrences of "AI", "KI", "intelligent", "smart", "powered by" in user-facing copy. Pryzm's name is fine; the technology label is not.

## 11. Sources

- [Scherzinger Pumpen company page](https://www.scherzinger-pumps.com/en/the-company/)
- [Scherzinger NorthData entry](https://www.northdata.com/Scherzinger+Pumpen+GmbH+&+Co.+KG,+Furtwangen+i.+Schwarzwald/Amtsgericht+Freiburg+HRA+610295)
- [94% of Mittelstand still without AI](https://www.barchart.com/story/news/37278487/new-report-finds-94-of-german-mittelstand-firms-still-without-ai-implementation)
- [Mittelstand AI strategy gap](https://bebensee.it/en/blog/ai-in-the-german-mittelstand-strategy-gap-facts-and-a-framework-for-action/index.html)
- [Pump distributor 2026 price war](https://www.streampumps.com/pump-solutions/pump-distributors-avoid-price-war-2026.html)
- [Mittelstand succession crisis](https://zumera.com/en/blog/the-ticking-time-bomb-germanys-mittelstand-succession-crisis/)
