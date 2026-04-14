# Demo-Only Phase 3/4/5 Preview — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add all 23 Phase 3/4/5 tracker features to the `/demo/` build only, using mock data, without changing the real Scherzinger or Avanna INR builds.

**Architecture:** Every new component, page, route, data file, and translation key is gated behind `IS_DEMO` (build-time literal from `src/utils/brand.js`). Vite tree-shakes the demo-only code out of the real bundle. A single mock data file plus a thin getter util feeds every new component. Scenario Lab is the only new page and the only new sidebar entry; the other 16 features attach to existing pages via `{IS_DEMO && <Component />}` mount points.

**Tech Stack:** React 19, Vite 7, Tailwind 4, Recharts 3, motion/react 12, react-countup, existing `ChartCard` / `KPICard` / `DataTable` / `InsightSlideOver` primitives from `src/components/shared/` and `src/components/v2/`.

**Spec:** `frontend/docs/superpowers/specs/2026-04-14-demo-phase45-preview-design.md`

**Timeline:** Client demo is 2026-04-15. Scenario Lab and SKU deep-dive slide-over are the highest-impact surfaces and are built first so that even under time pressure the demo has its wow moments.

---

## File Footprint Summary

**New files (1 page + 21 components + 1 data file + 1 util):**
```
src/pages/ScenarioLab.jsx
src/components/phase45/ShockSlider.jsx
src/components/phase45/MonteCarloHistogram.jsx
src/components/phase45/RegimeToggle.jsx
src/components/phase45/SKUDeepDiveSlideOver.jsx
src/components/phase45/FloorPriceTable.jsx
src/components/phase45/BreakEvenChart.jsx
src/components/phase45/ProfitabilityQuadrant.jsx
src/components/phase45/WTPBands.jsx
src/components/phase45/CLVRanking.jsx
src/components/phase45/CrossSellPanel.jsx
src/components/phase45/QuoteToCashTab.jsx
src/components/phase45/PriceOptimizer.jsx
src/components/phase45/WinProbabilityScorer.jsx
src/components/phase45/ElasticityCurve.jsx
src/components/phase45/CompetitiveMap.jsx
src/components/phase45/LostOpportunitySunburst.jsx
src/components/phase45/ChurnSurvivalCurve.jsx
src/components/phase45/LiveAlertStrip.jsx
src/components/phase45/AnomalyFeedCard.jsx
src/components/phase45/NLHeaderCard.jsx
src/data/mock_phase45.json
src/utils/mockPhase45.js
```

**Modified files:**
```
src/App.jsx                       (add ScenarioLab route)
src/components/Sidebar.jsx        (add Scenario Lab nav item)
src/pages/DashboardOverviewV2.jsx (mount LiveAlertStrip + AnomalyFeedCard)
src/pages/RevenueMargins.jsx      (mount NLHeaderCard)
src/pages/ProductsSKUs.jsx        (mount FloorPriceTable + BreakEvenChart + ProfitabilityQuadrant + intercept row click for SKUDeepDiveSlideOver)
src/pages/Customers.jsx           (mount WTPBands + CLVRanking + CrossSellPanel)
src/pages/Forecasting.jsx         (mount QuoteToCashTab)
src/pages/PricingFX.jsx           (mount PriceOptimizer + WinProbabilityScorer + ElasticityCurve + CompetitiveMap + LostOpportunitySunburst)
src/pages/MLAnalytics.jsx         (mount ChurnSurvivalCurve)
src/pages/AIInsights.jsx          (add phase45 prompt templates)
src/i18n/translations.js          (add phase45.* EN + DE keys)
```

---

## Conventions (apply to every new component)

1. **First line of every new component:** `import { IS_DEMO } from '../../utils/brand';` then `if (!IS_DEMO) return null;` at the top of the function body. This is belt-and-braces — even if somebody forgets to wrap the mount point, the component self-disables in the real build.
2. **Data access:** never import `mock_phase45.json` directly. Always go through `src/utils/mockPhase45.js` getters. In non-demo builds, the getters return `null` arrays/objects so callers degrade gracefully.
3. **Styling:** reuse `colors` from `src/utils/designTokensV2.js`. Primary accent is `#0393da`. Card surface is `colors.surface`. Reuse existing `ChartCard` for any titled chart, existing `KPICard` for any KPI tile, `DataTable` for any row-clickable table.
4. **Translations:** every piece of copy goes through `useLanguage().t('phase45.<key>')`. Add both EN and DE values in Task 2.
5. **No console.log, no eslint-disable.** The existing repo is clean.

---

## Task 1: Capture real-build MD5 baseline

**Goal:** Lock in the hash the real build currently produces, so we can verify at the end that our changes did not perturb it.

**Files:**
- Create: `scripts/verify-real-build.sh`

- [ ] **Step 1.1: Build the real bundle**

Run from `frontend/`:
```bash
npm run build
```
Expected: successful Vite build, `dist/assets/index-*.js` written.

- [ ] **Step 1.2: Capture baseline hashes**

Run:
```bash
md5 dist/assets/index-*.js dist/index.html > /tmp/phase45-baseline.txt
cat /tmp/phase45-baseline.txt
```
Expected: two `MD5 (...) = <hash>` lines. Note these two hashes — they are the immutable baseline for the rest of the work.

- [ ] **Step 1.3: Write the verification script**

Create `scripts/verify-real-build.sh` with:
```bash
#!/usr/bin/env bash
# Gate: the real (base=/) build must match the baseline captured before
# Phase 4/5 work started. If any hash differs, abort.
set -euo pipefail
cd "$(dirname "$0")/.."

npm run build > /tmp/phase45-real-build.log 2>&1

new=$(md5 -q dist/assets/index-*.js 2>/dev/null || md5sum dist/assets/index-*.js | awk '{print $1}')
newHtml=$(md5 -q dist/index.html 2>/dev/null || md5sum dist/index.html | awk '{print $1}')

base=$(grep 'assets/index' /tmp/phase45-baseline.txt | awk -F'= ' '{print $2}')
baseHtml=$(grep 'index.html' /tmp/phase45-baseline.txt | awk -F'= ' '{print $2}')

if [ "$new" != "$base" ] || [ "$newHtml" != "$baseHtml" ]; then
  echo "❌ LEAK: real build hash changed."
  echo "   bundle: baseline=$base new=$new"
  echo "   html:   baseline=$baseHtml new=$newHtml"
  exit 1
fi
echo "✅ Real build unchanged (bundle $new, html $newHtml)"
```

Make it executable: `chmod +x scripts/verify-real-build.sh`.

- [ ] **Step 1.4: Smoke-run the gate once to confirm it passes on a pristine tree**

Run:
```bash
./scripts/verify-real-build.sh
```
Expected: `✅ Real build unchanged`. If it fails on a pristine tree, the hash capture in Step 1.2 was wrong — redo.

- [ ] **Step 1.5: Commit**

```bash
git add -f scripts/verify-real-build.sh
git commit -m "tooling: real-build MD5 verification gate for phase 4/5 work"
```

---

## Task 2: Add phase45 translation keys

**Goal:** Central dictionary for every new piece of copy, both EN and DE. Must come before components so components can reference keys.

**Files:**
- Modify: `src/i18n/translations.js`

- [ ] **Step 2.1: Add EN keys under the `en` object**

In `src/i18n/translations.js`, inside the `en: { ... }` block (at the bottom, before the closing brace), add:

```javascript
// ─── Phase 4/5 preview (demo only) ───
'phase45.nav.scenarioLab': 'Scenario Lab',
'phase45.scenarioLab.title': 'Scenario Lab',
'phase45.scenarioLab.subtitle': 'Stress-test margin under cost and volume shocks',
'phase45.scenarioLab.reset': 'Reset',
'phase45.scenarioLab.material': 'Material cost',
'phase45.scenarioLab.labor': 'Labor cost',
'phase45.scenarioLab.outsourcing': 'Outsourcing cost',
'phase45.scenarioLab.volume': 'Volume',
'phase45.scenarioLab.baselineMargin': 'Baseline margin',
'phase45.scenarioLab.shockedMargin': 'Shocked margin',
'phase45.scenarioLab.monteCarlo': 'Monte Carlo margin distribution',
'phase45.scenarioLab.monteCarloSubtitle': '10,000 simulations — 95% CI shaded',
'phase45.scenarioLab.regime': 'Cost regime',
'phase45.scenarioLab.regime.spike': 'Spike (2022–24)',
'phase45.scenarioLab.regime.plateau': 'Plateau (2024–25)',
'phase45.scenarioLab.breakEven': 'Break-even at current volume',
'phase45.scenarioLab.skuScope': 'Apply to',
'phase45.scenarioLab.skuScope.all': 'All SKUs',
'phase45.scenarioLab.kpi.combined': 'Combined margin impact',
'phase45.scenarioLab.kpi.worst': 'Worst-case outcome (P5)',
'phase45.scenarioLab.kpi.best': 'Best-case outcome (P95)',

'phase45.floorPrice.title': 'Floor price calculator',
'phase45.floorPrice.subtitle': 'Minimum viable price per SKU given full cost + target margin',
'phase45.floorPrice.col.sku': 'SKU',
'phase45.floorPrice.col.name': 'Description',
'phase45.floorPrice.col.cg': 'Commodity',
'phase45.floorPrice.col.hkvoll': 'Full cost',
'phase45.floorPrice.col.floor': 'Floor price',
'phase45.floorPrice.col.current': 'Current price',
'phase45.floorPrice.col.gap': 'Gap',

'phase45.breakEven.title': 'Break-even analysis',
'phase45.breakEven.subtitle': 'Cost-volume-profit per SKU',
'phase45.breakEven.axisVolume': 'Units',
'phase45.breakEven.axisRevenue': 'Revenue / cost (€)',
'phase45.breakEven.labelRevenue': 'Revenue',
'phase45.breakEven.labelCost': 'Total cost',
'phase45.breakEven.labelBreak': 'Break-even',

'phase45.profitability.title': 'Product profitability quadrant',
'phase45.profitability.subtitle': 'Revenue vs margin by SKU',
'phase45.profitability.axisRevenue': 'Annual revenue (€)',
'phase45.profitability.axisMargin': 'DB2 margin',

'phase45.wtp.title': 'Customer willingness-to-pay bands',
'phase45.wtp.subtitle': 'Price tolerance by customer segment',
'phase45.wtp.low': 'Low WTP',
'phase45.wtp.mid': 'Mid WTP',
'phase45.wtp.high': 'High WTP',
'phase45.wtp.current': 'Current price',

'phase45.clv.title': 'Customer lifetime value',
'phase45.clv.subtitle': '12-month forward CLV using BG/NBD + Gamma-Gamma',
'phase45.clv.col.customer': 'Customer',
'phase45.clv.col.clv': 'CLV',
'phase45.clv.col.tier': 'Tier',
'phase45.clv.col.retention': 'Retention prob.',
'phase45.clv.col.months': 'Months active',

'phase45.crossSell.title': 'Cross-sell recommendations',
'phase45.crossSell.subtitle': 'Top product–customer matches by confidence',
'phase45.crossSell.col.sku': 'SKU',
'phase45.crossSell.col.customer': 'Customer',
'phase45.crossSell.col.confidence': 'Confidence',
'phase45.crossSell.col.reason': 'Rationale',

'phase45.quoteToCash.tab': 'Quote-to-cash',
'phase45.quoteToCash.title': 'Quote-to-cash timing predictor',
'phase45.quoteToCash.subtitle': 'Predicted days from quote acceptance to invoice',
'phase45.quoteToCash.median': 'Median',
'phase45.quoteToCash.p25': 'P25',
'phase45.quoteToCash.p75': 'P75',
'phase45.quoteToCash.mean': 'Mean',
'phase45.quoteToCash.drivers': 'Top predictors',

'phase45.priceOptimizer.title': 'Price optimization engine',
'phase45.priceOptimizer.subtitle': 'Suggested price ranges per SKU under elasticity constraints',
'phase45.priceOptimizer.col.sku': 'SKU',
'phase45.priceOptimizer.col.suggested': 'Suggested',
'phase45.priceOptimizer.col.min': 'Min',
'phase45.priceOptimizer.col.max': 'Max',
'phase45.priceOptimizer.col.expectedMargin': 'Expected margin',

'phase45.winProb.title': 'Win probability scorer',
'phase45.winProb.subtitle': 'Logit model on quote features',
'phase45.winProb.col.quote': 'Quote',
'phase45.winProb.col.customer': 'Customer',
'phase45.winProb.col.probability': 'Win probability',

'phase45.elasticity.title': 'Price elasticity curve',
'phase45.elasticity.subtitle': 'Price sensitivity inferred from won/price-lost margin gap',
'phase45.elasticity.axisPrice': 'Price delta %',
'phase45.elasticity.axisWinRate': 'Win rate',

'phase45.competitive.title': 'Competitive positioning',
'phase45.competitive.subtitle': 'Our price vs inferred market range (from PA-coded losses)',
'phase45.competitive.our': 'Our price',
'phase45.competitive.market': 'Market range',

'phase45.lostOpp.title': 'Lost opportunity analysis',
'phase45.lostOpp.subtitle': 'Revenue lost by reason code (2025)',
'phase45.lostOpp.total': 'Total lost revenue',

'phase45.churn.title': 'Customer churn prediction',
'phase45.churn.subtitle': 'Survival curve from RFM + margin trend',
'phase45.churn.axisMonths': 'Months since last order',
'phase45.churn.axisProb': 'Retention probability',
'phase45.churn.drivers': 'Top churn drivers',
'phase45.churn.atRisk': 'At-risk customers',

'phase45.liveAlerts.title': 'Live margin alerts',
'phase45.liveAlerts.subtitle': 'Real-time anomalies in the last 24h',

'phase45.anomalies.title': 'Anomaly feed',
'phase45.anomalies.subtitle': 'Detected via isolation forest on 4yr baselines',
'phase45.anomalies.severity.high': 'High',
'phase45.anomalies.severity.medium': 'Medium',
'phase45.anomalies.severity.low': 'Low',

'phase45.nlHeader.title': 'Quarter summary',

'phase45.skuDeepDive.title': 'SKU deep-dive',
'phase45.skuDeepDive.tab.pricing': 'Pricing',
'phase45.skuDeepDive.tab.breakEven': 'Break-even',
'phase45.skuDeepDive.tab.shock': 'Shock sensitivity',
'phase45.skuDeepDive.tab.anomalies': 'Anomalies',
'phase45.skuDeepDive.tab.crossSell': 'Cross-sell',
```

- [ ] **Step 2.2: Mirror DE keys under the `de` object**

Add the same block inside the `de: { ... }` object with German translations. Representative values:

```javascript
'phase45.nav.scenarioLab': 'Szenario-Labor',
'phase45.scenarioLab.title': 'Szenario-Labor',
'phase45.scenarioLab.subtitle': 'Stresstest der Marge bei Kosten- und Volumenschocks',
'phase45.scenarioLab.reset': 'Zurücksetzen',
'phase45.scenarioLab.material': 'Materialkosten',
'phase45.scenarioLab.labor': 'Personalkosten',
'phase45.scenarioLab.outsourcing': 'Fremdleistungen',
'phase45.scenarioLab.volume': 'Volumen',
'phase45.scenarioLab.baselineMargin': 'Basismarge',
'phase45.scenarioLab.shockedMargin': 'Schock-Marge',
'phase45.scenarioLab.monteCarlo': 'Monte-Carlo Margenverteilung',
'phase45.scenarioLab.monteCarloSubtitle': '10.000 Simulationen — 95% KI schattiert',
'phase45.scenarioLab.regime': 'Kostenregime',
'phase45.scenarioLab.regime.spike': 'Spitze (2022–24)',
'phase45.scenarioLab.regime.plateau': 'Plateau (2024–25)',
'phase45.scenarioLab.breakEven': 'Break-even bei aktuellem Volumen',
'phase45.scenarioLab.skuScope': 'Anwenden auf',
'phase45.scenarioLab.skuScope.all': 'Alle Artikel',
'phase45.scenarioLab.kpi.combined': 'Kombinierte Margenwirkung',
'phase45.scenarioLab.kpi.worst': 'Worst Case (P5)',
'phase45.scenarioLab.kpi.best': 'Best Case (P95)',

'phase45.floorPrice.title': 'Preisuntergrenzen-Rechner',
'phase45.floorPrice.subtitle': 'Mindestverkaufspreis je Artikel auf Basis Vollkosten + Zielmarge',
'phase45.floorPrice.col.sku': 'Artikel',
'phase45.floorPrice.col.name': 'Bezeichnung',
'phase45.floorPrice.col.cg': 'Warengruppe',
'phase45.floorPrice.col.hkvoll': 'Vollkosten',
'phase45.floorPrice.col.floor': 'Untergrenze',
'phase45.floorPrice.col.current': 'Aktueller Preis',
'phase45.floorPrice.col.gap': 'Differenz',

'phase45.breakEven.title': 'Break-even-Analyse',
'phase45.breakEven.subtitle': 'Kosten-Volumen-Gewinn je Artikel',
'phase45.breakEven.axisVolume': 'Stück',
'phase45.breakEven.axisRevenue': 'Umsatz / Kosten (€)',
'phase45.breakEven.labelRevenue': 'Umsatz',
'phase45.breakEven.labelCost': 'Gesamtkosten',
'phase45.breakEven.labelBreak': 'Break-even',

'phase45.profitability.title': 'Produktrentabilitäts-Quadrant',
'phase45.profitability.subtitle': 'Umsatz vs. Marge je Artikel',
'phase45.profitability.axisRevenue': 'Jahresumsatz (€)',
'phase45.profitability.axisMargin': 'DB2-Marge',

'phase45.wtp.title': 'Zahlungsbereitschaft der Kunden',
'phase45.wtp.subtitle': 'Preistoleranz nach Kundensegment',
'phase45.wtp.low': 'Niedrige ZB',
'phase45.wtp.mid': 'Mittlere ZB',
'phase45.wtp.high': 'Hohe ZB',
'phase45.wtp.current': 'Aktueller Preis',

'phase45.clv.title': 'Customer Lifetime Value',
'phase45.clv.subtitle': '12-Monats-CLV mit BG/NBD + Gamma-Gamma',
'phase45.clv.col.customer': 'Kunde',
'phase45.clv.col.clv': 'CLV',
'phase45.clv.col.tier': 'Stufe',
'phase45.clv.col.retention': 'Verbleibewahrsch.',
'phase45.clv.col.months': 'Monate aktiv',

'phase45.crossSell.title': 'Cross-Selling Empfehlungen',
'phase45.crossSell.subtitle': 'Beste Produkt-Kunden-Kombinationen nach Konfidenz',
'phase45.crossSell.col.sku': 'Artikel',
'phase45.crossSell.col.customer': 'Kunde',
'phase45.crossSell.col.confidence': 'Konfidenz',
'phase45.crossSell.col.reason': 'Begründung',

'phase45.quoteToCash.tab': 'Angebot bis Zahlung',
'phase45.quoteToCash.title': 'Prognose Angebot-zu-Zahlung',
'phase45.quoteToCash.subtitle': 'Vorhergesagte Tage von Annahme bis Rechnung',
'phase45.quoteToCash.median': 'Median',
'phase45.quoteToCash.p25': 'P25',
'phase45.quoteToCash.p75': 'P75',
'phase45.quoteToCash.mean': 'Mittelwert',
'phase45.quoteToCash.drivers': 'Top-Prädiktoren',

'phase45.priceOptimizer.title': 'Preisoptimierung',
'phase45.priceOptimizer.subtitle': 'Empfohlene Preisbereiche je Artikel unter Elastizitätsnebenbedingungen',
'phase45.priceOptimizer.col.sku': 'Artikel',
'phase45.priceOptimizer.col.suggested': 'Vorschlag',
'phase45.priceOptimizer.col.min': 'Min',
'phase45.priceOptimizer.col.max': 'Max',
'phase45.priceOptimizer.col.expectedMargin': 'Erwartete Marge',

'phase45.winProb.title': 'Gewinnwahrscheinlichkeit',
'phase45.winProb.subtitle': 'Logit-Modell auf Angebotsmerkmalen',
'phase45.winProb.col.quote': 'Angebot',
'phase45.winProb.col.customer': 'Kunde',
'phase45.winProb.col.probability': 'Gewinn-W.',

'phase45.elasticity.title': 'Preiselastizitätskurve',
'phase45.elasticity.subtitle': 'Preissensitivität aus Margen-Gap gewonnen/preislich verloren',
'phase45.elasticity.axisPrice': 'Preisänderung %',
'phase45.elasticity.axisWinRate': 'Gewinnquote',

'phase45.competitive.title': 'Wettbewerbspositionierung',
'phase45.competitive.subtitle': 'Unser Preis vs. inferrierter Marktkorridor (aus PA-Verlusten)',
'phase45.competitive.our': 'Unser Preis',
'phase45.competitive.market': 'Marktspanne',

'phase45.lostOpp.title': 'Verlorene Chancen',
'phase45.lostOpp.subtitle': 'Verlorener Umsatz nach Grund (2025)',
'phase45.lostOpp.total': 'Gesamt verlorener Umsatz',

'phase45.churn.title': 'Abwanderungsprognose',
'phase45.churn.subtitle': 'Überlebenskurve aus RFM + Margentrend',
'phase45.churn.axisMonths': 'Monate seit letzter Bestellung',
'phase45.churn.axisProb': 'Verbleibewahrscheinlichkeit',
'phase45.churn.drivers': 'Top-Abwanderungstreiber',
'phase45.churn.atRisk': 'Gefährdete Kunden',

'phase45.liveAlerts.title': 'Live-Margen-Warnungen',
'phase45.liveAlerts.subtitle': 'Echtzeit-Anomalien der letzten 24h',

'phase45.anomalies.title': 'Anomalie-Feed',
'phase45.anomalies.subtitle': 'Erkannt per Isolation Forest auf 4-Jahres-Baseline',
'phase45.anomalies.severity.high': 'Hoch',
'phase45.anomalies.severity.medium': 'Mittel',
'phase45.anomalies.severity.low': 'Niedrig',

'phase45.nlHeader.title': 'Quartals-Zusammenfassung',

'phase45.skuDeepDive.title': 'Artikel-Deep-Dive',
'phase45.skuDeepDive.tab.pricing': 'Preis',
'phase45.skuDeepDive.tab.breakEven': 'Break-even',
'phase45.skuDeepDive.tab.shock': 'Schock-Sensitivität',
'phase45.skuDeepDive.tab.anomalies': 'Anomalien',
'phase45.skuDeepDive.tab.crossSell': 'Cross-Sell',
```

- [ ] **Step 2.3: Verify EN/DE key parity**

Run:
```bash
node -e "
const t = require('./src/i18n/translations.js');
const en = Object.keys(t.translations.en).filter(k => k.startsWith('phase45.'));
const de = Object.keys(t.translations.de).filter(k => k.startsWith('phase45.'));
const missingDe = en.filter(k => !de.includes(k));
const missingEn = de.filter(k => !en.includes(k));
if (missingDe.length || missingEn.length) {
  console.error('DE missing:', missingDe);
  console.error('EN missing:', missingEn);
  process.exit(1);
}
console.log('OK:', en.length, 'keys in both EN and DE');
"
```
Expected: `OK: <N> keys in both EN and DE`. If the translations file uses ESM, replace the script with `node --input-type=module` and a dynamic `import()`. If it fails for other reasons, just inspect the two blocks by eye.

- [ ] **Step 2.4: Verify real build is still intact**

```bash
./scripts/verify-real-build.sh
```
Expected: `✅ Real build unchanged` — adding dictionary entries does NOT change the real bundle because the keys are only read via `useLanguage().t(...)` from demo-only components that don't exist yet.

- [ ] **Step 2.5: Commit**

```bash
git add -f src/i18n/translations.js
git commit -m "i18n: add phase45.* keys (demo-only preview)"
```

---

## Task 3: Mock data file

**Goal:** Single source of truth for every component's display data. Deterministic so reloads look identical.

**Files:**
- Create: `src/data/mock_phase45.json`

- [ ] **Step 3.1: Create the data file**

Write `src/data/mock_phase45.json`. The structure is fixed — components in later tasks will reference these field names. Use the full structure below. Generate realistic-looking numbers seeded from real Scherzinger metrics (€24.6M revenue, 64.8% DB2, 9 commodity groups).

```json
{
  "baseline": {
    "revenueAnnual": 24646717,
    "marginPct": 0.648,
    "matSharePct": 0.32,
    "laborSharePct": 0.28,
    "outsourcingSharePct": 0.12,
    "volumeLeverage": 0.18
  },
  "nlHeader": {
    "en": "Revenue of €6.25M in Q4 2025 held within 0.6pp of plan. Margin softened 0.6pp YoY driven by material cost plateau, while catalog share of orders slipped to 65%. Win rate recovered to 38.5% on the back of PR-coded renegotiations.",
    "de": "Der Umsatz von 6,25 Mio. € im 4. Quartal 2025 lag innerhalb von 0,6 Prozentpunkten vom Plan. Die Marge sank im Jahresvergleich um 0,6 Prozentpunkte, getrieben vom Material-Kostenplateau, während der Katalog-Anteil auf 65% fiel. Die Gewinnquote erholte sich auf 38,5% dank PR-kodierter Nachverhandlungen."
  },
  "liveAlerts": [
    { "id": "LA-001", "severity": "high",   "message": "Material shock detected on MBKUEHL", "delta": "-2.1pp", "ts": "2026-04-14T09:22Z" },
    { "id": "LA-002", "severity": "medium", "message": "Win rate drop on PW commodity group", "delta": "-4.3pp", "ts": "2026-04-14T07:05Z" },
    { "id": "LA-003", "severity": "low",    "message": "New pricing anomaly on PM-014",       "delta": "+6.2%",  "ts": "2026-04-14T04:48Z" },
    { "id": "LA-004", "severity": "high",   "message": "Break-even breached on SKU PS-2241",  "delta": "-3.8pp", "ts": "2026-04-13T22:11Z" }
  ],
  "anomalies": [
    { "id": "AN-001", "sku": "PS-1104", "metric": "DB2 margin",        "zscore": -3.2, "severity": "high",   "note": "Margin collapse on last invoice batch" },
    { "id": "AN-002", "sku": "PS-0882", "metric": "Material cost",     "zscore":  2.8, "severity": "high",   "note": "MatAnteil spiked outside 4yr band" },
    { "id": "AN-003", "sku": "PS-2241", "metric": "Order volume",      "zscore": -2.4, "severity": "medium", "note": "Orders halved vs 3-month trend" },
    { "id": "AN-004", "sku": "PM-0431", "metric": "Unit price",        "zscore":  2.1, "severity": "medium", "note": "Price uptick unexplained" },
    { "id": "AN-005", "sku": "PK-0773", "metric": "Rejection code mix", "zscore": 1.9, "severity": "low",    "note": "PA-share doubled in 2 weeks" },
    { "id": "AN-006", "sku": "MK-0122", "metric": "DB2 margin",        "zscore": -1.8, "severity": "low",    "note": "Gradual drift, still in band" }
  ],
  "floorPrices": [
    { "sku": "PS-1104", "name": "Precision gear pump 1104", "cg": "PW", "hkvoll": 1240, "floor": 1720, "current": 1850, "gap": 130 },
    { "sku": "PS-0882", "name": "Sealed gear pump 0882",    "cg": "PW", "hkvoll": 980,  "floor": 1360, "current": 1280, "gap": -80 },
    { "sku": "PS-2241", "name": "Industrial pump 2241",     "cg": "PM", "hkvoll": 2100, "floor": 2910, "current": 3120, "gap": 210 },
    { "sku": "PM-0431", "name": "Mini metering pump 0431",  "cg": "PM", "hkvoll": 640,  "floor": 890,  "current": 920,  "gap": 30  },
    { "sku": "PK-0773", "name": "Cooling pump 0773",        "cg": "MK", "hkvoll": 1500, "floor": 2080, "current": 2250, "gap": 170 },
    { "sku": "MK-0122", "name": "Compact pump 0122",        "cg": "MK", "hkvoll": 780,  "floor": 1080, "current": 1150, "gap": 70  },
    { "sku": "PW-0555", "name": "High-pressure pump 0555",  "cg": "PW", "hkvoll": 3200, "floor": 4440, "current": 4680, "gap": 240 },
    { "sku": "PW-0661", "name": "Dosing pump 0661",         "cg": "PW", "hkvoll": 1120, "floor": 1550, "current": 1640, "gap": 90  }
  ],
  "breakEven": [
    { "sku": "PS-1104", "fixed": 48000, "variable": 860, "price": 1850, "breakEvenUnits": 49,
      "curve": [
        { "units":   0, "revenue":      0, "cost":  48000 },
        { "units":  20, "revenue":  37000, "cost":  65200 },
        { "units":  40, "revenue":  74000, "cost":  82400 },
        { "units":  49, "revenue":  90650, "cost":  90140 },
        { "units":  60, "revenue": 111000, "cost":  99600 },
        { "units":  80, "revenue": 148000, "cost": 116800 },
        { "units": 100, "revenue": 185000, "cost": 134000 }
      ]
    }
  ],
  "profitability": [
    { "sku": "PS-1104", "revenue": 1240000, "margin": 0.71, "quadrant": "star" },
    { "sku": "PS-0882", "revenue":  420000, "margin": 0.58, "quadrant": "questionmark" },
    { "sku": "PS-2241", "revenue": 2110000, "margin": 0.64, "quadrant": "star" },
    { "sku": "PM-0431", "revenue":  180000, "margin": 0.49, "quadrant": "dog" },
    { "sku": "PK-0773", "revenue":  980000, "margin": 0.72, "quadrant": "cashcow" },
    { "sku": "MK-0122", "revenue":  240000, "margin": 0.41, "quadrant": "dog" },
    { "sku": "PW-0555", "revenue": 1580000, "margin": 0.68, "quadrant": "star" },
    { "sku": "PW-0661", "revenue":  720000, "margin": 0.55, "quadrant": "questionmark" }
  ],
  "wtpBands": [
    { "customer": "Kunde A", "segment": "Automotive",    "lowWTP":  90, "midWTP": 105, "highWTP": 125, "current": 102 },
    { "customer": "Kunde B", "segment": "Chemie",        "lowWTP": 110, "midWTP": 130, "highWTP": 155, "current": 128 },
    { "customer": "Kunde C", "segment": "Maschinenbau",  "lowWTP": 100, "midWTP": 115, "highWTP": 135, "current": 118 },
    { "customer": "Kunde D", "segment": "Lebensmittel",  "lowWTP":  85, "midWTP":  98, "highWTP": 115, "current":  94 },
    { "customer": "Kunde E", "segment": "Pharma",        "lowWTP": 130, "midWTP": 150, "highWTP": 175, "current": 142 }
  ],
  "clvRanking": [
    { "customer": "Kunde A", "clv": 1840000, "tier": "platinum", "retentionProb": 0.94, "monthsActive": 48 },
    { "customer": "Kunde B", "clv": 1210000, "tier": "platinum", "retentionProb": 0.91, "monthsActive": 48 },
    { "customer": "Kunde C", "clv":  880000, "tier": "gold",     "retentionProb": 0.85, "monthsActive": 40 },
    { "customer": "Kunde D", "clv":  620000, "tier": "gold",     "retentionProb": 0.78, "monthsActive": 36 },
    { "customer": "Kunde E", "clv":  410000, "tier": "silver",   "retentionProb": 0.66, "monthsActive": 28 },
    { "customer": "Kunde F", "clv":  240000, "tier": "silver",   "retentionProb": 0.58, "monthsActive": 22 },
    { "customer": "Kunde G", "clv":  130000, "tier": "bronze",   "retentionProb": 0.42, "monthsActive": 14 }
  ],
  "crossSell": [
    { "sku": "PS-1104", "customer": "Kunde A", "confidence": 0.87, "reason": "Owns 3 of 5 complementary SKUs" },
    { "sku": "PS-2241", "customer": "Kunde B", "confidence": 0.81, "reason": "Same commodity group, adjacent spec" },
    { "sku": "PK-0773", "customer": "Kunde C", "confidence": 0.76, "reason": "Seasonal pattern match" },
    { "sku": "PW-0555", "customer": "Kunde A", "confidence": 0.72, "reason": "Upgrade path from PW-0661" },
    { "sku": "PM-0431", "customer": "Kunde D", "confidence": 0.68, "reason": "Collaborative filtering" },
    { "sku": "MK-0122", "customer": "Kunde E", "confidence": 0.64, "reason": "Cluster similarity" }
  ],
  "quoteToCash": {
    "median": 53, "p25": 29, "p75": 93, "mean": 75,
    "drivers": [
      { "name": "Commodity group PW", "coef":  0.42 },
      { "name": "Quoted margin > 70%", "coef": -0.28 },
      { "name": "Quote value > €50k",  "coef":  0.35 },
      { "name": "Customer tier gold+", "coef": -0.22 },
      { "name": "Rejection in last 6m","coef":  0.19 }
    ],
    "timeline": [
      { "day":   0, "pct": 0.00 }, { "day":  10, "pct": 0.08 },
      { "day":  20, "pct": 0.19 }, { "day":  30, "pct": 0.33 },
      { "day":  45, "pct": 0.48 }, { "day":  53, "pct": 0.50 },
      { "day":  60, "pct": 0.58 }, { "day":  75, "pct": 0.66 },
      { "day":  93, "pct": 0.75 }, { "day": 120, "pct": 0.88 },
      { "day": 150, "pct": 0.95 }
    ]
  },
  "priceOptimizer": [
    { "sku": "PS-1104", "current": 1850, "suggested": 1940, "min": 1860, "max": 2020, "expectedMargin": 0.73 },
    { "sku": "PS-0882", "current": 1280, "suggested": 1360, "min": 1320, "max": 1420, "expectedMargin": 0.62 },
    { "sku": "PS-2241", "current": 3120, "suggested": 3240, "min": 3150, "max": 3340, "expectedMargin": 0.67 },
    { "sku": "PM-0431", "current":  920, "suggested":  970, "min":  940, "max": 1010, "expectedMargin": 0.53 },
    { "sku": "PK-0773", "current": 2250, "suggested": 2380, "min": 2300, "max": 2450, "expectedMargin": 0.74 },
    { "sku": "MK-0122", "current": 1150, "suggested": 1210, "min": 1170, "max": 1260, "expectedMargin": 0.45 },
    { "sku": "PW-0555", "current": 4680, "suggested": 4920, "min": 4750, "max": 5100, "expectedMargin": 0.71 },
    { "sku": "PW-0661", "current": 1640, "suggested": 1720, "min": 1660, "max": 1790, "expectedMargin": 0.60 }
  ],
  "winProbability": [
    { "quoteId": "Q-2541", "customer": "Kunde A", "probability": 0.82 },
    { "quoteId": "Q-2542", "customer": "Kunde B", "probability": 0.66 },
    { "quoteId": "Q-2543", "customer": "Kunde C", "probability": 0.74 },
    { "quoteId": "Q-2544", "customer": "Kunde D", "probability": 0.38 },
    { "quoteId": "Q-2545", "customer": "Kunde E", "probability": 0.91 },
    { "quoteId": "Q-2546", "customer": "Kunde F", "probability": 0.55 },
    { "quoteId": "Q-2547", "customer": "Kunde G", "probability": 0.22 },
    { "quoteId": "Q-2548", "customer": "Kunde H", "probability": 0.78 }
  ],
  "elasticity": {
    "points": [
      { "priceDelta": -15, "winRate": 0.72 }, { "priceDelta": -10, "winRate": 0.64 },
      { "priceDelta":  -5, "winRate": 0.52 }, { "priceDelta":   0, "winRate": 0.41 },
      { "priceDelta":   5, "winRate": 0.29 }, { "priceDelta":  10, "winRate": 0.18 },
      { "priceDelta":  15, "winRate": 0.11 }, { "priceDelta":  20, "winRate": 0.06 }
    ]
  },
  "competitive": [
    { "sku": "PS-1104", "our": 1850, "marketLow": 1740, "marketHigh": 1980, "position": "mid" },
    { "sku": "PS-0882", "our": 1280, "marketLow": 1260, "marketHigh": 1420, "position": "below-mid" },
    { "sku": "PS-2241", "our": 3120, "marketLow": 3060, "marketHigh": 3280, "position": "mid" },
    { "sku": "PM-0431", "our":  920, "marketLow":  880, "marketHigh": 1060, "position": "below-mid" },
    { "sku": "PK-0773", "our": 2250, "marketLow": 2150, "marketHigh": 2380, "position": "mid" },
    { "sku": "PW-0555", "our": 4680, "marketLow": 4500, "marketHigh": 4920, "position": "mid" }
  ],
  "lostOpportunity": {
    "total": 1904000,
    "byReason": [
      { "code": "PA", "label": "Preis zu hoch",       "amount": 541000, "count": 69 },
      { "code": "PR", "label": "Preisverhandlung",    "amount":  63000, "count": 16 },
      { "code": "KE", "label": "Keine Entscheidung",  "amount": 428000, "count": 54 },
      { "code": "TE", "label": "Technisch",           "amount": 186000, "count": 22 },
      { "code": "LZ", "label": "Lieferzeit",          "amount": 295000, "count": 38 },
      { "code": "KA", "label": "Kein Angabe",         "amount": 391000, "count": 51 }
    ]
  },
  "churn": {
    "survivalCurve": [
      { "months":  0, "retention": 1.00 }, { "months":  3, "retention": 0.95 },
      { "months":  6, "retention": 0.88 }, { "months":  9, "retention": 0.79 },
      { "months": 12, "retention": 0.68 }, { "months": 15, "retention": 0.55 },
      { "months": 18, "retention": 0.42 }, { "months": 21, "retention": 0.31 },
      { "months": 24, "retention": 0.22 }
    ],
    "drivers": [
      { "name": "Recency > 9 months", "coef": 0.48 },
      { "name": "Margin trend negative", "coef": 0.34 },
      { "name": "Only 1 SKU purchased", "coef": 0.27 },
      { "name": "Rejection in last quote", "coef": 0.21 }
    ],
    "atRisk": [
      { "customer": "Kunde F", "churnProb": 0.72, "lastOrder": "2025-09-04" },
      { "customer": "Kunde G", "churnProb": 0.68, "lastOrder": "2025-10-21" },
      { "customer": "Kunde H", "churnProb": 0.61, "lastOrder": "2025-11-15" },
      { "customer": "Kunde I", "churnProb": 0.55, "lastOrder": "2025-12-02" }
    ]
  },
  "monteCarloHistogram": [
    { "margin": 0.55, "count":  40 }, { "margin": 0.57, "count": 110 },
    { "margin": 0.59, "count": 280 }, { "margin": 0.61, "count": 510 },
    { "margin": 0.63, "count": 820 }, { "margin": 0.65, "count": 1120 },
    { "margin": 0.67, "count": 1380 }, { "margin": 0.69, "count": 1510 },
    { "margin": 0.71, "count": 1380 }, { "margin": 0.73, "count": 1120 },
    { "margin": 0.75, "count":  820 }, { "margin": 0.77, "count":  510 },
    { "margin": 0.79, "count":  280 }, { "margin": 0.81, "count":  110 },
    { "margin": 0.83, "count":   40 }
  ],
  "regimeCurves": {
    "spike":   [{"m":1,"v":0.68},{"m":2,"v":0.67},{"m":3,"v":0.66},{"m":4,"v":0.64},{"m":5,"v":0.62},{"m":6,"v":0.60},{"m":7,"v":0.58},{"m":8,"v":0.57},{"m":9,"v":0.56},{"m":10,"v":0.55},{"m":11,"v":0.54},{"m":12,"v":0.53}],
    "plateau": [{"m":1,"v":0.65},{"m":2,"v":0.65},{"m":3,"v":0.64},{"m":4,"v":0.64},{"m":5,"v":0.64},{"m":6,"v":0.63},{"m":7,"v":0.63},{"m":8,"v":0.63},{"m":9,"v":0.62},{"m":10,"v":0.62},{"m":11,"v":0.62},{"m":12,"v":0.61}]
  }
}
```

- [ ] **Step 3.2: Verify real build still intact**

```bash
./scripts/verify-real-build.sh
```
Expected: `✅`. A new unused JSON file under `src/data/` is not imported anywhere yet, so the real bundle must still be identical.

- [ ] **Step 3.3: Commit**

```bash
git add -f src/data/mock_phase45.json
git commit -m "data: mock phase 4/5 dataset for demo-only preview"
```

---

## Task 4: Mock data getter util

**Goal:** Central accessor so no component imports `mock_phase45.json` directly. Gates every getter on `IS_DEMO`.

**Files:**
- Create: `src/utils/mockPhase45.js`

- [ ] **Step 4.1: Write the util**

Create `src/utils/mockPhase45.js` with the full content:

```javascript
// Demo-only Phase 4/5 data accessors.
//
// Every getter is guarded by IS_DEMO. In the real Scherzinger build
// IS_DEMO is false at build time, so Vite's dead-code elimination
// drops the dynamic-import branch entirely and the JSON blob is
// never pulled into dist/.
//
// In demo builds the JSON is imported eagerly (small, ~10KB) so
// components don't have to deal with async loading.

import { IS_DEMO } from './brand';
import raw from '../data/mock_phase45.json';

const data = IS_DEMO ? raw : null;

const empty = { list: [], obj: {} };

export function getBaseline()            { return data ? data.baseline            : null; }
export function getNLHeader()            { return data ? data.nlHeader             : null; }
export function getLiveAlerts()          { return data ? data.liveAlerts           : []; }
export function getAnomalies()           { return data ? data.anomalies            : []; }
export function getFloorPrices()         { return data ? data.floorPrices          : []; }
export function getBreakEven()           { return data ? data.breakEven            : []; }
export function getProfitability()       { return data ? data.profitability        : []; }
export function getWTPBands()            { return data ? data.wtpBands             : []; }
export function getCLVRanking()          { return data ? data.clvRanking           : []; }
export function getCrossSell()           { return data ? data.crossSell            : []; }
export function getQuoteToCash()         { return data ? data.quoteToCash          : null; }
export function getPriceOptimizer()      { return data ? data.priceOptimizer       : []; }
export function getWinProbability()      { return data ? data.winProbability       : []; }
export function getElasticity()          { return data ? data.elasticity           : null; }
export function getCompetitive()         { return data ? data.competitive          : []; }
export function getLostOpportunity()     { return data ? data.lostOpportunity      : null; }
export function getChurn()               { return data ? data.churn                : null; }
export function getMonteCarloHistogram() { return data ? data.monteCarloHistogram  : []; }
export function getRegimeCurves()        { return data ? data.regimeCurves         : null; }

// Scenario Lab — single source of truth for the closed-form shock formula.
// Positive shock on a cost component REDUCES margin proportional to that
// component's share. Positive volume shock INCREASES margin via fixed-cost
// dilution (captured by volumeLeverage).
export function computeShockedMargin({ material, labor, outsourcing, volume }) {
  if (!data) return 0;
  const b = data.baseline;
  return (
    b.marginPct
    - b.matSharePct          * (material    / 100)
    - b.laborSharePct        * (labor       / 100)
    - b.outsourcingSharePct  * (outsourcing / 100)
    + b.volumeLeverage       * (volume      / 100)
  );
}

// Per-SKU lookups for the SKU deep-dive slide-over.
// `findBySku` returns whatever fields exist for that SKU across the dataset.
export function findSKUDetail(sku) {
  if (!data) return null;
  return {
    floorPrice:  data.floorPrices.find(r => r.sku === sku)        || null,
    breakEven:   data.breakEven.find(r => r.sku === sku)          || null,
    optimizer:   data.priceOptimizer.find(r => r.sku === sku)     || null,
    anomalies:   data.anomalies.filter(r => r.sku === sku),
    crossSell:   data.crossSell.filter(r => r.sku === sku),
    competitive: data.competitive.find(r => r.sku === sku)        || null,
  };
}
```

- [ ] **Step 4.2: Verify real build unchanged**

Because `mockPhase45.js` is not yet imported anywhere, the bundle must be byte-identical.

```bash
./scripts/verify-real-build.sh
```
Expected: `✅`.

- [ ] **Step 4.3: Commit**

```bash
git add -f src/utils/mockPhase45.js
git commit -m "data: phase 4/5 mock-data accessors with IS_DEMO gate"
```

---

## Task 5: ShockSlider component

**Goal:** Reusable slider with label, value readout, and `#0393da` accent bar. Used four times inside Scenario Lab (material / labor / outsourcing / volume).

**Files:**
- Create: `src/components/phase45/ShockSlider.jsx`

- [ ] **Step 5.1: Write the component**

```jsx
import { IS_DEMO } from '../../utils/brand';

export default function ShockSlider({ label, value, onChange, accent = '#0393da' }) {
  if (!IS_DEMO) return null;
  const pct = ((value + 30) / 60) * 100;
  return (
    <div className="space-y-1.5">
      <div className="flex items-center justify-between">
        <span className="text-xs font-semibold uppercase tracking-wider" style={{ color: '#525252' }}>{label}</span>
        <span
          className="text-sm font-bold tabular-nums"
          style={{ color: value === 0 ? '#737373' : value > 0 ? '#dc2626' : '#16a34a' }}
        >
          {value > 0 ? '+' : ''}{value}%
        </span>
      </div>
      <div className="relative h-2 rounded-full" style={{ background: '#f1f5f9' }}>
        <div
          className="absolute top-0 bottom-0 rounded-full"
          style={{
            left: `${Math.min(50, pct)}%`,
            width: `${Math.abs(pct - 50)}%`,
            background: `linear-gradient(90deg, ${accent}, ${accent}aa)`,
          }}
        />
        <input
          type="range"
          min={-30}
          max={30}
          step={1}
          value={value}
          onChange={(e) => onChange(Number(e.target.value))}
          className="absolute inset-0 w-full opacity-0 cursor-pointer"
        />
      </div>
    </div>
  );
}
```

- [ ] **Step 5.2: Verify real build unchanged**

```bash
./scripts/verify-real-build.sh
```
Expected: `✅` (component not imported yet).

- [ ] **Step 5.3: Commit**

```bash
git add -f src/components/phase45/ShockSlider.jsx
git commit -m "phase45: ShockSlider"
```

---

## Task 6: MonteCarloHistogram component

**Goal:** Recharts BarChart rendering the pre-computed Monte Carlo distribution from `getMonteCarloHistogram()`. Shaded 95% CI band via secondary fill.

**Files:**
- Create: `src/components/phase45/MonteCarloHistogram.jsx`

- [ ] **Step 6.1: Write the component**

```jsx
import { BarChart, Bar, ResponsiveContainer, XAxis, YAxis, Tooltip, ReferenceArea } from 'recharts';
import { IS_DEMO } from '../../utils/brand';
import { getMonteCarloHistogram } from '../../utils/mockPhase45';
import ChartCard from '../shared/ChartCard';
import { useLanguage } from '../../context/LanguageContext';

export default function MonteCarloHistogram() {
  if (!IS_DEMO) return null;
  const { t } = useLanguage();
  const data = getMonteCarloHistogram();
  return (
    <ChartCard
      title={t('phase45.scenarioLab.monteCarlo')}
      subtitle={t('phase45.scenarioLab.monteCarloSubtitle')}
    >
      <ResponsiveContainer width="100%" height={260}>
        <BarChart data={data}>
          <XAxis
            dataKey="margin"
            tickFormatter={(v) => `${Math.round(v * 100)}%`}
            tick={{ fontSize: 11, fill: '#737373' }}
          />
          <YAxis tick={{ fontSize: 11, fill: '#737373' }} />
          <Tooltip
            formatter={(v) => [v.toLocaleString(), 'runs']}
            labelFormatter={(v) => `${Math.round(v * 100)}% margin`}
          />
          <ReferenceArea x1={0.59} x2={0.77} fill="#0393da" fillOpacity={0.08} />
          <Bar dataKey="count" fill="#0393da" radius={[4, 4, 0, 0]} />
        </BarChart>
      </ResponsiveContainer>
    </ChartCard>
  );
}
```

- [ ] **Step 6.2: Verify real build unchanged**

```bash
./scripts/verify-real-build.sh
```
Expected: `✅`.

- [ ] **Step 6.3: Commit**

```bash
git add -f src/components/phase45/MonteCarloHistogram.jsx
git commit -m "phase45: MonteCarloHistogram"
```

---

## Task 7: RegimeToggle component

**Goal:** Segmented two-option toggle (spike vs plateau) returning a string key via `onChange`. Controlled component, parent owns state.

**Files:**
- Create: `src/components/phase45/RegimeToggle.jsx`

- [ ] **Step 7.1: Write the component**

```jsx
import { IS_DEMO } from '../../utils/brand';
import { useLanguage } from '../../context/LanguageContext';

export default function RegimeToggle({ value, onChange }) {
  if (!IS_DEMO) return null;
  const { t } = useLanguage();
  const options = [
    { key: 'spike',   label: t('phase45.scenarioLab.regime.spike') },
    { key: 'plateau', label: t('phase45.scenarioLab.regime.plateau') },
  ];
  return (
    <div className="inline-flex items-center gap-1 p-1 bg-slate-100 rounded-lg">
      {options.map((o) => (
        <button
          key={o.key}
          onClick={() => onChange(o.key)}
          className={`px-3 py-1 text-xs font-medium rounded-md transition-all ${
            value === o.key ? 'bg-white text-[#0393da] shadow-sm font-bold' : 'text-slate-500 hover:text-slate-900'
          }`}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}
```

- [ ] **Step 7.2: Verify real build unchanged**

```bash
./scripts/verify-real-build.sh
```

- [ ] **Step 7.3: Commit**

```bash
git add -f src/components/phase45/RegimeToggle.jsx
git commit -m "phase45: RegimeToggle"
```

---

## Task 8: ScenarioLab page

**Goal:** The wow page. Four sliders control a live margin curve; Monte Carlo histogram and regime toggle sit below; three KPI tiles at top summarize the combined impact.

**Files:**
- Create: `src/pages/ScenarioLab.jsx`

- [ ] **Step 8.1: Write the page**

```jsx
import { useState, useMemo } from 'react';
import { motion } from 'motion/react';
import { LineChart, Line, ResponsiveContainer, XAxis, YAxis, Tooltip, CartesianGrid, Legend } from 'recharts';
import { IS_DEMO } from '../utils/brand';
import { useLanguage } from '../context/LanguageContext';
import ChartCard from '../components/shared/ChartCard';
import KPICard from '../components/shared/KPICard';
import ShockSlider from '../components/phase45/ShockSlider';
import MonteCarloHistogram from '../components/phase45/MonteCarloHistogram';
import RegimeToggle from '../components/phase45/RegimeToggle';
import { computeShockedMargin, getRegimeCurves, getBaseline } from '../utils/mockPhase45';

export default function ScenarioLab() {
  if (!IS_DEMO) return null;
  const { t } = useLanguage();
  const [material, setMaterial]       = useState(0);
  const [labor, setLabor]             = useState(0);
  const [outsourcing, setOutsourcing] = useState(0);
  const [volume, setVolume]           = useState(0);
  const [regime, setRegime]           = useState('plateau');

  const baseline = getBaseline();
  const curves = getRegimeCurves();

  const shockedMargin = useMemo(
    () => computeShockedMargin({ material, labor, outsourcing, volume }),
    [material, labor, outsourcing, volume]
  );

  const chartData = useMemo(() => {
    const base = curves[regime];
    const delta = shockedMargin - baseline.marginPct;
    return base.map((p) => ({
      month: `M${p.m}`,
      baseline: p.v,
      shocked: Math.max(0, Math.min(1, p.v + delta)),
    }));
  }, [curves, regime, shockedMargin, baseline]);

  const deltaPP = ((shockedMargin - baseline.marginPct) * 100);

  const reset = () => { setMaterial(0); setLabor(0); setOutsourcing(0); setVolume(0); };

  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3 }}
      className="space-y-8 p-8"
    >
      {/* Header */}
      <div className="flex items-end justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight" style={{ fontFamily: "'Manrope', sans-serif", color: '#1a1a2e' }}>
            {t('phase45.scenarioLab.title')}
          </h1>
          <p className="text-sm mt-1" style={{ color: '#737373' }}>{t('phase45.scenarioLab.subtitle')}</p>
        </div>
        <button
          onClick={reset}
          className="px-4 py-2 text-xs font-semibold uppercase tracking-wider rounded-lg transition-colors hover:bg-slate-100"
          style={{ color: '#525252', border: '1px solid #e5e5e5' }}
        >
          {t('phase45.scenarioLab.reset')}
        </button>
      </div>

      {/* KPI strip */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <KPICard
          label={t('phase45.scenarioLab.kpi.combined')}
          value={`${deltaPP >= 0 ? '+' : ''}${deltaPP.toFixed(1)}pp`}
          accent={deltaPP >= 0 ? 'positive' : 'negative'}
        />
        <KPICard label={t('phase45.scenarioLab.kpi.worst')} value={`${((shockedMargin - 0.06) * 100).toFixed(1)}%`} accent="warning" />
        <KPICard label={t('phase45.scenarioLab.kpi.best')}  value={`${((shockedMargin + 0.06) * 100).toFixed(1)}%`} accent="positive" />
      </div>

      {/* Sliders + live chart */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Sliders panel */}
        <div className="lg:col-span-1 p-6 rounded-2xl bg-white" style={{ boxShadow: '0 1px 3px rgba(26,26,46,0.04)' }}>
          <div className="flex items-center justify-between mb-6">
            <h3 className="text-sm font-bold uppercase tracking-wider" style={{ color: '#1a1a2e' }}>Shocks</h3>
            <RegimeToggle value={regime} onChange={setRegime} />
          </div>
          <div className="space-y-5">
            <ShockSlider label={t('phase45.scenarioLab.material')}    value={material}    onChange={setMaterial} />
            <ShockSlider label={t('phase45.scenarioLab.labor')}       value={labor}       onChange={setLabor} />
            <ShockSlider label={t('phase45.scenarioLab.outsourcing')} value={outsourcing} onChange={setOutsourcing} />
            <ShockSlider label={t('phase45.scenarioLab.volume')}      value={volume}      onChange={setVolume} accent="#16a34a" />
          </div>
        </div>

        {/* Live chart */}
        <div className="lg:col-span-2">
          <ChartCard
            title={`${t('phase45.scenarioLab.baselineMargin')} vs ${t('phase45.scenarioLab.shockedMargin')}`}
            subtitle={t('phase45.scenarioLab.regime')}
          >
            <ResponsiveContainer width="100%" height={320}>
              <LineChart data={chartData}>
                <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                <XAxis dataKey="month" tick={{ fontSize: 11, fill: '#737373' }} />
                <YAxis tickFormatter={(v) => `${Math.round(v * 100)}%`} tick={{ fontSize: 11, fill: '#737373' }} domain={[0.4, 0.9]} />
                <Tooltip formatter={(v) => `${(v * 100).toFixed(1)}%`} />
                <Legend wrapperStyle={{ fontSize: 12 }} />
                <Line type="monotone" dataKey="baseline" name={t('phase45.scenarioLab.baselineMargin')} stroke="#94a3b8" strokeWidth={2} dot={false} />
                <Line type="monotone" dataKey="shocked"  name={t('phase45.scenarioLab.shockedMargin')}  stroke="#0393da" strokeWidth={2.5} dot={false} />
              </LineChart>
            </ResponsiveContainer>
          </ChartCard>
        </div>
      </div>

      {/* Monte Carlo */}
      <MonteCarloHistogram />
    </motion.div>
  );
}
```

- [ ] **Step 8.2: Verify real build unchanged**

```bash
./scripts/verify-real-build.sh
```
Expected: `✅`. (Still no import from a real-build entry point — the page is not wired yet.)

- [ ] **Step 8.3: Commit**

```bash
git add -f src/pages/ScenarioLab.jsx
git commit -m "phase45: ScenarioLab page (sliders + live margin curve + MC histogram)"
```

---

## Task 9: Wire ScenarioLab into route + sidebar

**Goal:** Add the only new sidebar entry and the only new route. Both gated on `IS_DEMO`.

**Files:**
- Modify: `src/App.jsx`
- Modify: `src/components/Sidebar.jsx`

- [ ] **Step 9.1: Add route in `src/App.jsx`**

Add near the other route imports:
```jsx
import ScenarioLab from './pages/ScenarioLab';
import { IS_DEMO } from './utils/brand';
```

Inside the `<Route element={<ProtectedRoute><Layout /></ProtectedRoute>}>` block, after the `/ai-insights` route, add:
```jsx
{IS_DEMO && <Route path="/scenario-lab" element={<ScenarioLab />} />}
```

- [ ] **Step 9.2: Add sidebar nav item in `src/components/Sidebar.jsx`**

At the top, add:
```jsx
import { FlaskConical } from 'lucide-react';
import { IS_DEMO } from '../utils/brand';
```

Change the `navItems` constant to a function so it can include the demo item conditionally:
```jsx
const baseNavItems = [
  { to: '/', tKey: 'nav.dashboard', icon: LayoutDashboard },
  { to: '/revenue', tKey: 'nav.revenue', icon: TrendingUp },
  { to: '/products', tKey: 'nav.products', icon: Package },
  { to: '/customers', tKey: 'nav.customers', icon: Users },
  { to: '/forecasting', tKey: 'nav.forecasting', icon: LineChart },
  { to: '/pricing', tKey: 'nav.pricing', icon: DollarSign },
  { to: '/ml-analytics', tKey: 'nav.ml', icon: Brain },
  { to: '/ai-insights', tKey: 'nav.aiInsights', icon: Sparkles },
];

const navItems = IS_DEMO
  ? [...baseNavItems, { to: '/scenario-lab', tKey: 'phase45.nav.scenarioLab', icon: FlaskConical }]
  : baseNavItems;
```

Leave the rendering loop unchanged — it already iterates over `navItems`.

- [ ] **Step 9.3: Verify real build still clean**

```bash
./scripts/verify-real-build.sh
```

This is the **first task that touches a file imported by the real build.** The real build MUST remain byte-identical because:
- `IS_DEMO` is a literal `false` in the real build.
- `{IS_DEMO && <Route .../>}` compiles to `{false && ...}` → `false`.
- `IS_DEMO ? [...baseNavItems, X] : baseNavItems` → Vite folds to `baseNavItems`.
- The `ScenarioLab` import is still eagerly evaluated, but the page itself has `if (!IS_DEMO) return null;` and its transitive imports (`mockPhase45.js`, `mock_phase45.json`) only get pulled in because the import is unconditional.

⚠️ **If the gate fails here, the problem is likely the eager `import ScenarioLab` pulling the mock JSON into the real bundle.** Fix by converting to a dynamic import inside the route element, e.g.:
```jsx
import { lazy, Suspense } from 'react';
const ScenarioLab = IS_DEMO ? lazy(() => import('./pages/ScenarioLab')) : null;
// ...
{IS_DEMO && (
  <Route path="/scenario-lab" element={
    <Suspense fallback={null}><ScenarioLab /></Suspense>
  } />
)}
```
This forces the chunk to be a separate async chunk that the real build will tree-shake or at worst ship as an unreachable async chunk (still acceptable, the `index-*.js` hash stays the same).

Run the gate again after applying the fix:
```bash
./scripts/verify-real-build.sh
```
Expected: `✅`. Do not proceed until this passes.

- [ ] **Step 9.4: Commit**

```bash
git add -f src/App.jsx src/components/Sidebar.jsx
git commit -m "phase45: wire ScenarioLab route + sidebar entry (demo only)"
```

---

## Task 10: Products & SKUs — FloorPriceTable + BreakEvenChart + ProfitabilityQuadrant

**Goal:** Three new sections at the bottom of the Products & SKUs page. Each a standalone component so they can be built and committed independently.

**Files:**
- Create: `src/components/phase45/FloorPriceTable.jsx`
- Create: `src/components/phase45/BreakEvenChart.jsx`
- Create: `src/components/phase45/ProfitabilityQuadrant.jsx`
- Modify: `src/pages/ProductsSKUs.jsx`

- [ ] **Step 10.1: Write `FloorPriceTable.jsx`**

```jsx
import { IS_DEMO } from '../../utils/brand';
import { getFloorPrices } from '../../utils/mockPhase45';
import DataTable from '../shared/DataTable';
import { useLanguage } from '../../context/LanguageContext';
import { formatEUR } from '../../utils/formatters';

export default function FloorPriceTable() {
  if (!IS_DEMO) return null;
  const { t } = useLanguage();
  const data = getFloorPrices();
  const columns = [
    { key: 'sku',     label: t('phase45.floorPrice.col.sku'),     sortable: true },
    { key: 'name',    label: t('phase45.floorPrice.col.name') },
    { key: 'cg',      label: t('phase45.floorPrice.col.cg'),      sortable: true },
    { key: 'hkvoll',  label: t('phase45.floorPrice.col.hkvoll'),  sortable: true, render: (r) => formatEUR(r.hkvoll) },
    { key: 'floor',   label: t('phase45.floorPrice.col.floor'),   sortable: true, render: (r) => formatEUR(r.floor) },
    { key: 'current', label: t('phase45.floorPrice.col.current'), sortable: true, render: (r) => formatEUR(r.current) },
    {
      key: 'gap',
      label: t('phase45.floorPrice.col.gap'),
      sortable: true,
      render: (r) => (
        <span style={{ color: r.gap >= 0 ? '#16a34a' : '#dc2626', fontWeight: 600 }}>
          {r.gap >= 0 ? '+' : ''}{formatEUR(r.gap)}
        </span>
      ),
    },
  ];
  return (
    <DataTable
      title={t('phase45.floorPrice.title')}
      subtitle={t('phase45.floorPrice.subtitle')}
      columns={columns}
      data={data}
      rowKey="sku"
    />
  );
}
```

(If `DataTable` rejects any of these props — `subtitle`, `render`, `rowKey` — inspect `src/components/shared/DataTable.jsx` and adjust to match the actual API. Do NOT invent new props.)

- [ ] **Step 10.2: Write `BreakEvenChart.jsx`**

```jsx
import { LineChart, Line, ResponsiveContainer, XAxis, YAxis, Tooltip, CartesianGrid, Legend, ReferenceLine } from 'recharts';
import { IS_DEMO } from '../../utils/brand';
import { getBreakEven } from '../../utils/mockPhase45';
import ChartCard from '../shared/ChartCard';
import { useLanguage } from '../../context/LanguageContext';

export default function BreakEvenChart() {
  if (!IS_DEMO) return null;
  const { t } = useLanguage();
  const [first] = getBreakEven();
  if (!first) return null;
  return (
    <ChartCard title={t('phase45.breakEven.title')} subtitle={`${first.sku} — ${t('phase45.breakEven.subtitle')}`}>
      <ResponsiveContainer width="100%" height={280}>
        <LineChart data={first.curve}>
          <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
          <XAxis dataKey="units" label={{ value: t('phase45.breakEven.axisVolume'), position: 'insideBottom', offset: -4, fill: '#737373', fontSize: 11 }} tick={{ fontSize: 11, fill: '#737373' }} />
          <YAxis tickFormatter={(v) => `€${(v / 1000).toFixed(0)}k`} tick={{ fontSize: 11, fill: '#737373' }} />
          <Tooltip formatter={(v) => `€${v.toLocaleString()}`} />
          <Legend wrapperStyle={{ fontSize: 12 }} />
          <Line type="monotone" dataKey="revenue" name={t('phase45.breakEven.labelRevenue')} stroke="#0393da" strokeWidth={2.5} dot={false} />
          <Line type="monotone" dataKey="cost"    name={t('phase45.breakEven.labelCost')}    stroke="#dc2626" strokeWidth={2} dot={false} />
          <ReferenceLine x={first.breakEvenUnits} stroke="#16a34a" strokeDasharray="4 4" label={{ value: t('phase45.breakEven.labelBreak'), fill: '#16a34a', fontSize: 11 }} />
        </LineChart>
      </ResponsiveContainer>
    </ChartCard>
  );
}
```

- [ ] **Step 10.3: Write `ProfitabilityQuadrant.jsx`**

```jsx
import { ScatterChart, Scatter, ResponsiveContainer, XAxis, YAxis, Tooltip, CartesianGrid, ReferenceLine } from 'recharts';
import { IS_DEMO } from '../../utils/brand';
import { getProfitability } from '../../utils/mockPhase45';
import ChartCard from '../shared/ChartCard';
import { useLanguage } from '../../context/LanguageContext';

const quadrantColor = { star: '#16a34a', cashcow: '#0393da', questionmark: '#d97706', dog: '#dc2626' };

export default function ProfitabilityQuadrant() {
  if (!IS_DEMO) return null;
  const { t } = useLanguage();
  const data = getProfitability().map((d) => ({ ...d, fill: quadrantColor[d.quadrant] }));
  const medianRev    = data.map((d) => d.revenue).sort((a, b) => a - b)[Math.floor(data.length / 2)];
  const medianMargin = 0.62;
  return (
    <ChartCard title={t('phase45.profitability.title')} subtitle={t('phase45.profitability.subtitle')}>
      <ResponsiveContainer width="100%" height={320}>
        <ScatterChart margin={{ top: 10, right: 24, bottom: 24, left: 24 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
          <XAxis
            dataKey="revenue"
            type="number"
            tickFormatter={(v) => `€${(v / 1e6).toFixed(1)}M`}
            tick={{ fontSize: 11, fill: '#737373' }}
            label={{ value: t('phase45.profitability.axisRevenue'), position: 'insideBottom', offset: -6, fill: '#737373', fontSize: 11 }}
          />
          <YAxis
            dataKey="margin"
            type="number"
            domain={[0.3, 0.8]}
            tickFormatter={(v) => `${Math.round(v * 100)}%`}
            tick={{ fontSize: 11, fill: '#737373' }}
            label={{ value: t('phase45.profitability.axisMargin'), angle: -90, position: 'insideLeft', fill: '#737373', fontSize: 11 }}
          />
          <Tooltip formatter={(v, name) => name === 'margin' ? `${(v * 100).toFixed(1)}%` : `€${v.toLocaleString()}`} />
          <ReferenceLine x={medianRev} stroke="#cbd5e1" strokeDasharray="4 4" />
          <ReferenceLine y={medianMargin} stroke="#cbd5e1" strokeDasharray="4 4" />
          <Scatter data={data} />
        </ScatterChart>
      </ResponsiveContainer>
    </ChartCard>
  );
}
```

- [ ] **Step 10.4: Mount the three components on `ProductsSKUs.jsx`**

Open `src/pages/ProductsSKUs.jsx`. Add near the top of the imports:
```jsx
import { IS_DEMO } from '../utils/brand';
import FloorPriceTable from '../components/phase45/FloorPriceTable';
import BreakEvenChart from '../components/phase45/BreakEvenChart';
import ProfitabilityQuadrant from '../components/phase45/ProfitabilityQuadrant';
```

Find the JSX section right after the existing `<DataTable ... />` block (around line 815, the closing of "Row 4 — Product Table") but BEFORE the final closing tags of the page's root wrapper. Insert:
```jsx
{IS_DEMO && (
  <motion.div variants={cardVariants} className="space-y-6 mt-6">
    <FloorPriceTable />
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
      <BreakEvenChart />
      <ProfitabilityQuadrant />
    </div>
  </motion.div>
)}
```

(`cardVariants` is already in scope — the file uses it for every other row. If it's not, use `<div className="space-y-6 mt-6">` instead.)

- [ ] **Step 10.5: Verify real build unchanged**

```bash
./scripts/verify-real-build.sh
```
Expected: `✅`. The three components and the `{IS_DEMO && ...}` JSX fold to `false` in the real build.

- [ ] **Step 10.6: Commit**

```bash
git add -f src/components/phase45/FloorPriceTable.jsx src/components/phase45/BreakEvenChart.jsx src/components/phase45/ProfitabilityQuadrant.jsx src/pages/ProductsSKUs.jsx
git commit -m "phase45: products page — floor price, break-even, profitability quadrant"
```

---

## Task 11: SKUDeepDiveSlideOver

**Goal:** Five-tab slide-over reused across Products table row clicks. Pulls per-SKU data from `findSKUDetail`.

**Files:**
- Create: `src/components/phase45/SKUDeepDiveSlideOver.jsx`
- Modify: `src/pages/ProductsSKUs.jsx` (intercept row click in demo mode)

- [ ] **Step 11.1: Write `SKUDeepDiveSlideOver.jsx`**

Model the structure on `src/components/v2/InsightSlideOver.jsx` (AnimatePresence + backdrop + panel). Tabs are local state.

```jsx
import { useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { X } from 'lucide-react';
import { LineChart, Line, ResponsiveContainer, XAxis, YAxis, Tooltip, CartesianGrid, BarChart, Bar } from 'recharts';
import { IS_DEMO } from '../../utils/brand';
import { findSKUDetail } from '../../utils/mockPhase45';
import { useLanguage } from '../../context/LanguageContext';
import { formatEUR } from '../../utils/formatters';
import { colors } from '../../utils/designTokensV2';

const tabs = ['pricing', 'breakEven', 'shock', 'anomalies', 'crossSell'];

export default function SKUDeepDiveSlideOver({ sku, onClose }) {
  if (!IS_DEMO || !sku) return null;
  const { t } = useLanguage();
  const [tab, setTab] = useState('pricing');
  const detail = findSKUDetail(sku);
  if (!detail) return null;

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="fixed inset-0 bg-black/30 z-40"
        onClick={onClose}
      />
      <motion.div
        initial={{ x: '100%' }}
        animate={{ x: 0 }}
        exit={{ x: '100%' }}
        transition={{ type: 'spring', damping: 30, stiffness: 300 }}
        className="fixed right-0 top-0 h-screen w-[640px] max-w-[90vw] z-50 flex flex-col overflow-hidden"
        style={{ background: colors.surface, boxShadow: '0 0 60px rgba(26,26,46,0.12)' }}
      >
        {/* Header */}
        <div className="flex-shrink-0 px-6 py-5 flex items-start justify-between" style={{ borderBottom: '1px solid #f8fafc' }}>
          <div>
            <span className="px-2.5 py-1 rounded text-[10px] font-bold uppercase tracking-wider" style={{ background: '#eff6ff', color: '#2563eb' }}>
              {t('phase45.skuDeepDive.title')}
            </span>
            <h2 className="text-lg font-bold mt-2" style={{ fontFamily: "'Manrope', sans-serif", color: colors.darkNavy }}>
              {detail.floorPrice?.name || sku}
            </h2>
            <p className="text-xs mt-1" style={{ color: '#737373' }}>{sku}</p>
          </div>
          <button onClick={onClose} className="p-2 rounded-lg hover:bg-[#f8f9fa] transition-colors" style={{ color: '#a3a3a3' }}>
            <X size={20} />
          </button>
        </div>

        {/* Tabs */}
        <div className="flex-shrink-0 px-6 pt-4 flex items-center gap-1" style={{ borderBottom: '1px solid #f8fafc' }}>
          {tabs.map((k) => (
            <button
              key={k}
              onClick={() => setTab(k)}
              className="px-3 py-2 text-xs font-semibold uppercase tracking-wider transition-colors"
              style={{
                color: tab === k ? '#0393da' : '#737373',
                borderBottom: tab === k ? '2px solid #0393da' : '2px solid transparent',
              }}
            >
              {t(`phase45.skuDeepDive.tab.${k}`)}
            </button>
          ))}
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto px-6 py-5">
          {tab === 'pricing' && (
            <div className="space-y-4">
              {detail.optimizer ? (
                <>
                  <MetricRow label="Current" value={formatEUR(detail.optimizer.current)} />
                  <MetricRow label="Suggested" value={formatEUR(detail.optimizer.suggested)} emphasis />
                  <MetricRow label="Range" value={`${formatEUR(detail.optimizer.min)} – ${formatEUR(detail.optimizer.max)}`} />
                  <MetricRow label="Expected margin" value={`${(detail.optimizer.expectedMargin * 100).toFixed(1)}%`} />
                </>
              ) : <p className="text-sm text-slate-500">No optimizer data for this SKU.</p>}
              {detail.floorPrice && (
                <>
                  <div className="h-px bg-slate-100 my-3" />
                  <MetricRow label="Floor price" value={formatEUR(detail.floorPrice.floor)} />
                  <MetricRow label="Full cost"   value={formatEUR(detail.floorPrice.hkvoll)} />
                </>
              )}
            </div>
          )}

          {tab === 'breakEven' && (
            detail.breakEven ? (
              <ResponsiveContainer width="100%" height={280}>
                <LineChart data={detail.breakEven.curve}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                  <XAxis dataKey="units" tick={{ fontSize: 11, fill: '#737373' }} />
                  <YAxis tickFormatter={(v) => `€${(v / 1000).toFixed(0)}k`} tick={{ fontSize: 11, fill: '#737373' }} />
                  <Tooltip formatter={(v) => `€${v.toLocaleString()}`} />
                  <Line type="monotone" dataKey="revenue" stroke="#0393da" strokeWidth={2.5} dot={false} />
                  <Line type="monotone" dataKey="cost"    stroke="#dc2626" strokeWidth={2}   dot={false} />
                </LineChart>
              </ResponsiveContainer>
            ) : <p className="text-sm text-slate-500">No break-even data.</p>
          )}

          {tab === 'shock' && (
            <ResponsiveContainer width="100%" height={240}>
              <BarChart data={[
                { name: 'Material',    delta: -2.1 },
                { name: 'Labor',       delta: -1.4 },
                { name: 'Outsourcing', delta: -0.9 },
                { name: 'Volume',      delta:  1.8 },
              ]}>
                <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                <XAxis dataKey="name" tick={{ fontSize: 11, fill: '#737373' }} />
                <YAxis tickFormatter={(v) => `${v}pp`} tick={{ fontSize: 11, fill: '#737373' }} />
                <Tooltip formatter={(v) => `${v}pp`} />
                <Bar dataKey="delta" radius={[4, 4, 0, 0]}>
                  {[
                    <rect key="0" />,
                  ]}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          )}

          {tab === 'anomalies' && (
            detail.anomalies.length ? (
              <ul className="space-y-3">
                {detail.anomalies.map((a) => (
                  <li key={a.id} className="p-3 rounded-lg" style={{ background: '#f8f9fa' }}>
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-bold uppercase" style={{ color: a.severity === 'high' ? '#dc2626' : a.severity === 'medium' ? '#d97706' : '#737373' }}>
                        {a.severity}
                      </span>
                      <span className="text-xs font-mono" style={{ color: '#737373' }}>z={a.zscore}</span>
                    </div>
                    <p className="text-sm mt-1">{a.metric}: {a.note}</p>
                  </li>
                ))}
              </ul>
            ) : <p className="text-sm text-slate-500">No anomalies detected.</p>
          )}

          {tab === 'crossSell' && (
            detail.crossSell.length ? (
              <ul className="space-y-3">
                {detail.crossSell.map((r) => (
                  <li key={r.customer} className="p-3 rounded-lg" style={{ background: '#f8f9fa' }}>
                    <div className="flex items-center justify-between">
                      <span className="text-sm font-semibold">{r.customer}</span>
                      <span className="text-xs font-bold" style={{ color: '#0393da' }}>{(r.confidence * 100).toFixed(0)}%</span>
                    </div>
                    <p className="text-xs mt-1" style={{ color: '#737373' }}>{r.reason}</p>
                  </li>
                ))}
              </ul>
            ) : <p className="text-sm text-slate-500">No cross-sell candidates.</p>
          )}
        </div>
      </motion.div>
    </AnimatePresence>
  );
}

function MetricRow({ label, value, emphasis }) {
  return (
    <div className="flex items-center justify-between py-2">
      <span className="text-xs uppercase tracking-wider" style={{ color: '#737373' }}>{label}</span>
      <span className="text-sm tabular-nums" style={{ color: emphasis ? '#0393da' : '#1a1a2e', fontWeight: emphasis ? 700 : 500 }}>{value}</span>
    </div>
  );
}
```

- [ ] **Step 11.2: Intercept row click on Products page**

Open `src/pages/ProductsSKUs.jsx`. Add imports:
```jsx
import SKUDeepDiveSlideOver from '../components/phase45/SKUDeepDiveSlideOver';
```

Add state near the top of the component:
```jsx
const [phase45SKU, setPhase45SKU] = useState(null);
```

Change the `onRowClick` handler of the existing `<DataTable ...>` to:
```jsx
onRowClick={(row) => {
  if (IS_DEMO) {
    setPhase45SKU(row.ArticleID);
    return;
  }
  selectItem({ type: 'article', id: row.ArticleID, label: row.description, data: row });
  openSKUDetail(row.ArticleID);
}}
```

Mount the slide-over at the end of the page's JSX tree (just before the root closing tag):
```jsx
{IS_DEMO && <SKUDeepDiveSlideOver sku={phase45SKU} onClose={() => setPhase45SKU(null)} />}
```

- [ ] **Step 11.3: Verify real build unchanged**

```bash
./scripts/verify-real-build.sh
```

The `IS_DEMO && ...` inside `onRowClick` evaluates `if (false) { ... return; }` — dead-code eliminated. The slide-over mount point folds to `false`. Gate must stay green.

- [ ] **Step 11.4: Commit**

```bash
git add -f src/components/phase45/SKUDeepDiveSlideOver.jsx src/pages/ProductsSKUs.jsx
git commit -m "phase45: SKU deep-dive slide-over (5 tabs) + products row-click intercept"
```

---

## Task 12: Pricing page — 5 Phase 3 components

**Goal:** Add PriceOptimizer, WinProbabilityScorer, ElasticityCurve, CompetitiveMap, LostOpportunitySunburst in that order. Mount all five at the bottom of `PricingFX.jsx`.

**Files:**
- Create: `src/components/phase45/PriceOptimizer.jsx`
- Create: `src/components/phase45/WinProbabilityScorer.jsx`
- Create: `src/components/phase45/ElasticityCurve.jsx`
- Create: `src/components/phase45/CompetitiveMap.jsx`
- Create: `src/components/phase45/LostOpportunitySunburst.jsx`
- Modify: `src/pages/PricingFX.jsx`

- [ ] **Step 12.1: `PriceOptimizer.jsx`** — `DataTable` over `getPriceOptimizer()` with columns `sku`, `current`, `suggested`, `min`, `max`, `expectedMargin`. Use `formatEUR` for price columns; render `expectedMargin` as percentage. Column labels from `phase45.priceOptimizer.col.*`. Card title from `phase45.priceOptimizer.title`. Guard `if (!IS_DEMO) return null;` at top. Imports mirror FloorPriceTable.

- [ ] **Step 12.2: `WinProbabilityScorer.jsx`** — `DataTable` over `getWinProbability()`. Three columns: `quoteId`, `customer`, `probability` (rendered as a horizontal progress bar from 0–100% colored by value). Probability bar code:
```jsx
render: (r) => (
  <div className="flex items-center gap-2">
    <div className="flex-1 h-2 rounded-full bg-slate-100">
      <div
        className="h-full rounded-full"
        style={{
          width: `${r.probability * 100}%`,
          background: r.probability > 0.7 ? '#16a34a' : r.probability > 0.4 ? '#d97706' : '#dc2626',
        }}
      />
    </div>
    <span className="text-xs tabular-nums w-10 text-right">{(r.probability * 100).toFixed(0)}%</span>
  </div>
)
```

- [ ] **Step 12.3: `ElasticityCurve.jsx`** — `ChartCard` wrapping a `LineChart` on `getElasticity().points`. X axis `priceDelta` (formatted `${v}%`), Y axis `winRate` (formatted `${v*100}%`). Area under curve shaded. One `Line` with stroke `#0393da`. Card title `phase45.elasticity.title`, subtitle `phase45.elasticity.subtitle`. Height 280.

- [ ] **Step 12.4: `CompetitiveMap.jsx`** — `ChartCard` wrapping a custom horizontal bar per row of `getCompetitive()`. Each row shows SKU label on left and a horizontal bar spanning `marketLow → marketHigh` in light gray with a `#0393da` dot at `our`. Implement with plain divs + absolute positioning (no Recharts), ~40 lines:
```jsx
const all = getCompetitive();
const min = Math.min(...all.flatMap(r => [r.marketLow, r.our]));
const max = Math.max(...all.flatMap(r => [r.marketHigh, r.our]));
const pct = (v) => ((v - min) / (max - min)) * 100;
// return <ChartCard ...> {all.map(r => <div key={r.sku} className="flex items-center gap-3 py-2">
//   <span className="w-16 text-xs font-mono">{r.sku}</span>
//   <div className="relative flex-1 h-6">
//     <div className="absolute top-1/2 -translate-y-1/2 h-1.5 rounded-full bg-slate-200"
//          style={{ left: `${pct(r.marketLow)}%`, width: `${pct(r.marketHigh) - pct(r.marketLow)}%` }} />
//     <div className="absolute top-1/2 -translate-y-1/2 size-3 rounded-full bg-[#0393da] ring-2 ring-white"
//          style={{ left: `calc(${pct(r.our)}% - 6px)` }} />
//   </div>
//   <span className="w-16 text-xs tabular-nums text-right">{formatEUR(r.our)}</span>
// </div>)} </ChartCard>
```

- [ ] **Step 12.5: `LostOpportunitySunburst.jsx`** — reuse Recharts `PieChart` with inner radius (donut). Data is `getLostOpportunity().byReason`. Value is `amount`. Legend on right listing `code – label` with amount. Big total in the center (`formatEUR(getLostOpportunity().total)` + subtitle "Total lost revenue" from `phase45.lostOpp.total`).

- [ ] **Step 12.6: Mount in `PricingFX.jsx`**

Add imports:
```jsx
import { IS_DEMO } from '../utils/brand';
import PriceOptimizer from '../components/phase45/PriceOptimizer';
import WinProbabilityScorer from '../components/phase45/WinProbabilityScorer';
import ElasticityCurve from '../components/phase45/ElasticityCurve';
import CompetitiveMap from '../components/phase45/CompetitiveMap';
import LostOpportunitySunburst from '../components/phase45/LostOpportunitySunburst';
```

At the bottom of the page's main JSX (after the last existing row, before the outer `</div>`):
```jsx
{IS_DEMO && (
  <div className="space-y-6 mt-8">
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
      <ElasticityCurve />
      <CompetitiveMap />
    </div>
    <PriceOptimizer />
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
      <WinProbabilityScorer />
      <LostOpportunitySunburst />
    </div>
  </div>
)}
```

- [ ] **Step 12.7: Verify real build unchanged**

```bash
./scripts/verify-real-build.sh
```
Expected: `✅`.

- [ ] **Step 12.8: Commit**

```bash
git add -f src/components/phase45/PriceOptimizer.jsx src/components/phase45/WinProbabilityScorer.jsx src/components/phase45/ElasticityCurve.jsx src/components/phase45/CompetitiveMap.jsx src/components/phase45/LostOpportunitySunburst.jsx src/pages/PricingFX.jsx
git commit -m "phase45: pricing page — 5 phase-3 preview components"
```

---

## Task 13: Customers page — WTP + CLV + Cross-sell

**Goal:** Three stacked sections at the bottom of `Customers.jsx`.

**Files:**
- Create: `src/components/phase45/WTPBands.jsx`
- Create: `src/components/phase45/CLVRanking.jsx`
- Create: `src/components/phase45/CrossSellPanel.jsx`
- Modify: `src/pages/Customers.jsx`

- [ ] **Step 13.1: `WTPBands.jsx`** — horizontal bar rows per customer from `getWTPBands()`. Three band segments (`lowWTP`, `midWTP`, `highWTP`) colored light-to-dark blue, with a vertical marker at `current`. Same implementation pattern as `CompetitiveMap` (plain divs, `ChartCard` wrapper).

- [ ] **Step 13.2: `CLVRanking.jsx`** — `DataTable` on `getCLVRanking()`. Columns: `customer`, `clv` (formatted EUR, sortable), `tier` (colored badge), `retentionProb` (rendered as horizontal bar), `monthsActive`. Tier → badge color map: platinum `#1a1a2e` / gold `#d97706` / silver `#94a3b8` / bronze `#b45309`.

- [ ] **Step 13.3: `CrossSellPanel.jsx`** — `DataTable` on `getCrossSell()`. Columns: `sku`, `customer`, `confidence` (horizontal progress bar like WinProbabilityScorer), `reason`.

- [ ] **Step 13.4: Mount in `Customers.jsx`**

Add imports + `IS_DEMO`. Mount at the bottom:
```jsx
{IS_DEMO && (
  <div className="space-y-6 mt-8">
    <WTPBands />
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
      <CLVRanking />
      <CrossSellPanel />
    </div>
  </div>
)}
```

- [ ] **Step 13.5: Verify + commit**

```bash
./scripts/verify-real-build.sh
git add -f src/components/phase45/WTPBands.jsx src/components/phase45/CLVRanking.jsx src/components/phase45/CrossSellPanel.jsx src/pages/Customers.jsx
git commit -m "phase45: customers page — WTP bands, CLV ranking, cross-sell panel"
```

---

## Task 14: Dashboard — LiveAlertStrip + AnomalyFeedCard

**Files:**
- Create: `src/components/phase45/LiveAlertStrip.jsx`
- Create: `src/components/phase45/AnomalyFeedCard.jsx`
- Modify: `src/pages/DashboardOverviewV2.jsx`

- [ ] **Step 14.1: `LiveAlertStrip.jsx`** — horizontal scrollable row of pills from `getLiveAlerts()`. Each pill: severity-colored dot (high `#dc2626`, medium `#d97706`, low `#0393da`) + message + delta + relative time. Wrap in a compact bordered card with title `phase45.liveAlerts.title`.

- [ ] **Step 14.2: `AnomalyFeedCard.jsx`** — `ChartCard` wrapping a list of `getAnomalies()`. Each row: severity badge, SKU (mono), metric name, z-score (mono, colored by sign), short note.

- [ ] **Step 14.3: Mount at top of `DashboardOverviewV2.jsx`**

Add imports + `IS_DEMO`. Right after the page header (before the existing KPI row), insert:
```jsx
{IS_DEMO && <LiveAlertStrip />}
```
And at the very bottom of the page, before the closing tag:
```jsx
{IS_DEMO && <AnomalyFeedCard />}
```

- [ ] **Step 14.4: Verify + commit**

```bash
./scripts/verify-real-build.sh
git add -f src/components/phase45/LiveAlertStrip.jsx src/components/phase45/AnomalyFeedCard.jsx src/pages/DashboardOverviewV2.jsx
git commit -m "phase45: dashboard — live alert strip + anomaly feed card"
```

---

## Task 15: Revenue — NLHeaderCard

**Files:**
- Create: `src/components/phase45/NLHeaderCard.jsx`
- Modify: `src/pages/RevenueMargins.jsx`

- [ ] **Step 15.1: `NLHeaderCard.jsx`** — single rounded card with an icon (Sparkles from lucide-react), a title from `phase45.nlHeader.title`, and the current-language summary text from `getNLHeader()[lang]`. Read `lang` from `useLanguage()`:

```jsx
import { Sparkles } from 'lucide-react';
import { IS_DEMO } from '../../utils/brand';
import { useLanguage } from '../../context/LanguageContext';
import { getNLHeader } from '../../utils/mockPhase45';

export default function NLHeaderCard() {
  if (!IS_DEMO) return null;
  const { t, lang } = useLanguage();
  const nl = getNLHeader();
  if (!nl) return null;
  return (
    <div className="p-6 rounded-2xl mb-6" style={{ background: 'linear-gradient(135deg, #f0f9ff, #ffffff)', border: '1px solid #e0f2fe' }}>
      <div className="flex items-start gap-4">
        <div className="size-10 rounded-xl flex items-center justify-center flex-shrink-0" style={{ background: 'rgba(3,147,218,0.12)', color: '#0393da' }}>
          <Sparkles size={18} />
        </div>
        <div>
          <h3 className="text-xs font-bold uppercase tracking-wider" style={{ color: '#0393da' }}>{t('phase45.nlHeader.title')}</h3>
          <p className="text-sm mt-2" style={{ color: '#1a1a2e', lineHeight: 1.6 }}>{nl[lang] || nl.en}</p>
        </div>
      </div>
    </div>
  );
}
```

Check `src/context/LanguageContext.jsx` to confirm that `useLanguage()` exposes `lang`. If the property name is different (e.g. `language` or `currentLang`), use that name.

- [ ] **Step 15.2: Mount in `RevenueMargins.jsx`**

Add import + `IS_DEMO`. Place `{IS_DEMO && <NLHeaderCard />}` as the first child inside the page's main content wrapper (above the existing year-filter row).

- [ ] **Step 15.3: Verify + commit**

```bash
./scripts/verify-real-build.sh
git add -f src/components/phase45/NLHeaderCard.jsx src/pages/RevenueMargins.jsx
git commit -m "phase45: revenue page — NL quarter-summary header card"
```

---

## Task 16: Forecasting — QuoteToCashTab

**Files:**
- Create: `src/components/phase45/QuoteToCashTab.jsx`
- Modify: `src/pages/Forecasting.jsx`

- [ ] **Step 16.1: `QuoteToCashTab.jsx`** — two-column layout. Left: four KPI tiles (median, p25, p75, mean) from `getQuoteToCash()`, each using `KPICard`. Right: a cumulative distribution line from `timeline` (`day` x, `pct` y). Below: horizontal bar chart of `drivers` (coef, positive vs negative colors).

- [ ] **Step 16.2: Mount in `Forecasting.jsx`**

Inspect the file to find its existing tab/section pattern. Two acceptable approaches:

**(a) If Forecasting.jsx already has tabs:** add a new tab key `quoteToCash` conditionally inside `{IS_DEMO && ...}`, and render `<QuoteToCashTab />` when selected.

**(b) If it doesn't have tabs:** append the component as a new section at the bottom, wrapped in `{IS_DEMO && <QuoteToCashTab />}`.

Either is fine — pick whichever preserves the existing code shape best. Use the `phase45.quoteToCash.tab` translation key for the tab label if approach (a).

- [ ] **Step 16.3: Verify + commit**

```bash
./scripts/verify-real-build.sh
git add -f src/components/phase45/QuoteToCashTab.jsx src/pages/Forecasting.jsx
git commit -m "phase45: forecasting page — quote-to-cash predictor tab"
```

---

## Task 17: ML Analytics — ChurnSurvivalCurve

**Files:**
- Create: `src/components/phase45/ChurnSurvivalCurve.jsx`
- Modify: `src/pages/MLAnalytics.jsx`

- [ ] **Step 17.1: `ChurnSurvivalCurve.jsx`** — `ChartCard` wrapping an area chart on `getChurn().survivalCurve`. Below the chart: two side-by-side columns — left shows "Top churn drivers" as a bar list (`drivers` coef), right shows "At-risk customers" as a list of rows (customer, churnProb as colored pill, lastOrder).

- [ ] **Step 17.2: Mount at bottom of `MLAnalytics.jsx`**

```jsx
{IS_DEMO && <ChurnSurvivalCurve />}
```

- [ ] **Step 17.3: Verify + commit**

```bash
./scripts/verify-real-build.sh
git add -f src/components/phase45/ChurnSurvivalCurve.jsx src/pages/MLAnalytics.jsx
git commit -m "phase45: ML analytics — churn survival curve + drivers + at-risk list"
```

---

## Task 18: AI Insights — phase45 prompt templates

**Goal:** Extend the existing suggested-prompts list in demo mode so AI chat shows phase 4/5-themed starters.

**Files:**
- Modify: `src/pages/AIInsights.jsx`

- [ ] **Step 18.1: Locate the prompts array**

The existing prompt generator is in `src/utils/dynamicPrompts.js` keyed by `prompts.static.1` through `prompts.static.8`. Either:
- Add six new keys `phase45.prompt.1` through `phase45.prompt.6` in Task 2's dictionary (go back and extend if needed), or
- Keep them inline in `AIInsights.jsx` under a `{IS_DEMO && ...}` branch.

Simpler: inline. Inside `AIInsights.jsx`, find where prompts are rendered and append:

```jsx
{IS_DEMO && (
  <>
    <PromptChip text={t('phase45.prompt.1') || 'Run a +5% material shock on commodity group PW'} />
    <PromptChip text={t('phase45.prompt.2') || 'Which customers have CLV > €1M and retention < 80%?'} />
    <PromptChip text={t('phase45.prompt.3') || 'Show me the top 5 SKUs below their floor price'} />
    <PromptChip text={t('phase45.prompt.4') || 'Explain why win rate dropped in PW last week'} />
    <PromptChip text={t('phase45.prompt.5') || 'What is the break-even volume for PS-2241 at current cost?'} />
    <PromptChip text={t('phase45.prompt.6') || 'List all anomalies from the last 24 hours with severity high'} />
  </>
)}
```

(Use whatever the existing prompt-rendering component is — grep for `PromptChip` or `suggestedPrompt` in the file.)

- [ ] **Step 18.2: Verify + commit**

```bash
./scripts/verify-real-build.sh
git add -f src/pages/AIInsights.jsx
git commit -m "phase45: AI insights — six phase-4/5 starter prompts (demo only)"
```

---

## Task 19: Full local smoke test

**Goal:** Build the demo bundle, preview it locally, walk every page in both languages.

- [ ] **Step 19.1: Build the demo bundle**

```bash
npm run build -- --base=/demo/
```
Expected: successful build, `dist/` overwritten with a `/demo/`-based bundle. (Note: this overwrites the real-build `dist/` — that's fine because we've already captured the baseline hashes.)

- [ ] **Step 19.2: Preview locally**

```bash
npx vite preview --base /demo/ --port 4173
```
Open `http://localhost:4173/demo/` in a browser. Demo auth auto-seeds, so no login required.

- [ ] **Step 19.3: Walk every page in EN**

Confirm the following renders without errors (check browser console):
- [ ] Dashboard: LiveAlertStrip + original KPIs + AnomalyFeedCard at bottom
- [ ] Revenue & Margins: NLHeaderCard at top + existing content
- [ ] Products & SKUs: existing content + FloorPriceTable + BreakEvenChart + ProfitabilityQuadrant. Click a SKU row → deep-dive slide-over opens with all 5 tabs working.
- [ ] Customers: existing content + WTPBands + CLVRanking + CrossSellPanel
- [ ] Forecasting: existing content + QuoteToCashTab
- [ ] Pricing: existing content + 5 new phase 3 sections
- [ ] ML Analytics: existing content + ChurnSurvivalCurve
- [ ] AI Insights: existing prompts + 6 new ones
- [ ] Scenario Lab: sliders drag smoothly, margin curve responds within one frame, regime toggle switches baseline, MC histogram renders

- [ ] **Step 19.4: Switch language to DE and walk every page again**

Use the language toggle in the header. Every new section must show German copy.

- [ ] **Step 19.5: Re-run real-build gate**

```bash
./scripts/verify-real-build.sh
```
Expected: `✅ Real build unchanged`. This re-builds the real bundle (overwriting the demo bundle) and confirms the hash matches the baseline. Do NOT skip this — the demo preview step in 19.1 overwrote `dist/`, and we need to prove the real bundle is still clean.

- [ ] **Step 19.6: Rebuild the demo bundle for deploy**

```bash
rm -rf dist-demo
mkdir -p dist-demo
npm run build -- --base=/demo/
mv dist dist-demo
```

Now `dist-demo/` holds the demo bundle and `dist/` no longer exists.

- [ ] **Step 19.7: Final verification of demo bundle**

```bash
ls -lh dist-demo/assets/index-*.js
md5 dist-demo/assets/index-*.js
```
Note the new hash. Copy it into `/tmp/phase45-demo-hash.txt` for the deploy step.

---

## Task 20: STOP — show user, wait for approval

**Goal:** Hard gate before any rsync. No automatic deploy.

- [ ] **Step 20.1: Summarize local verification results to the user**

Report:
- Every page walked in EN + DE
- Scenario Lab sliders live
- SKU slide-over tabs
- Real-build MD5 still matches baseline (from Step 19.5)
- Demo bundle size
- Link to local preview

End the message with: *"Ready to rsync to Avanna demo server. Confirm to deploy."*

- [ ] **Step 20.2: Wait for user "push it"**

Do not proceed until the user explicitly approves. If the user finds any visual issue, fix it, re-run Tasks 19 and 20.

---

## Task 21: Deploy to Avanna demo server

**Goal:** Swap in the new demo bundle behind a timestamped backup so rollback is one SSH command.

- [ ] **Step 21.1: Back up existing demo bundle on server**

```bash
ssh -i ~/Documents/Scherzinger_new/pryzm_avana_demo.pem ec2-user@3.76.141.43 \
  "cd ~/pryzm/frontend && cp -r dist-demo dist-demo.bak.$(date +%s)"
```
Expected: success, new `dist-demo.bak.<epoch>` directory visible in `ls`.

- [ ] **Step 21.2: Rsync new bundle**

```bash
rsync -avz --delete \
  -e "ssh -i ~/Documents/Scherzinger_new/pryzm_avana_demo.pem" \
  dist-demo/ \
  ec2-user@3.76.141.43:~/pryzm/frontend/dist-demo/
```
Expected: `sent ... received ... bytes/sec` output, no errors.

- [ ] **Step 21.3: Smoke test live URL**

Open `https://demo.pryzm-solutions.com/demo/` in a browser. Confirm:
- Language toggle still works
- Scenario Lab sidebar entry visible and page loads
- Every Phase 4/5 section renders
- Real INR build at `https://demo.pryzm-solutions.com/` still loads identically (this is on the same server but a different dist directory — touching `dist-demo/` must not have affected `dist/`)

- [ ] **Step 21.4: Confirm server-side real-bundle file is untouched**

```bash
ssh -i ~/Documents/Scherzinger_new/pryzm_avana_demo.pem ec2-user@3.76.141.43 \
  "md5sum ~/pryzm/frontend/dist/assets/index-*.js"
```
Compare with the known INR real-build hash from the previous deploy's log. Must match.

- [ ] **Step 21.5: Report deploy result to user, ask for green light to commit code**

Report live URL + smoke test results + backup path. Ask: *"Live demo verified. OK to commit all the new code to git?"*

- [ ] **Step 21.6: Wait for user approval**

Do not commit and push until the user confirms the live demo works end-to-end.

---

## Task 22: Push code to git

- [ ] **Step 22.1: Confirm every commit from Tasks 1–18 is on `main`**

```bash
git log --oneline -30
```
Expected: commits titled `tooling:`, `i18n:`, `data:`, `phase45:`, one per task.

- [ ] **Step 22.2: Push to origin**

```bash
git push origin main
```
Expected: fast-forward push success.

- [ ] **Step 22.3: Report to user**

Report: push hash, commit count, link to GitHub compare view.

---

## Risks revisited

- **If Task 9 / Task 10 / Task 11 leak into the real build** (real-build MD5 changes): the cause is almost always that `IS_DEMO` is being treated as runtime instead of build-time. Check that `src/utils/brand.js` exports `IS_DEMO` as `const IS_DEMO = import.meta.env.BASE_URL === '/demo/'` (it does today). If the issue persists, switch the Sidebar/App imports to `import.meta.env.BASE_URL === '/demo/'` inlined — Vite is guaranteed to constant-fold that.
- **If building with `--base=/demo/` fails** because of a new Recharts API call: Recharts 3 is strict about axis types. Double-check `dataKey` names match the mock JSON exactly.
- **If Scenario Lab sliders feel laggy:** `useMemo` in Task 8 already prevents recomputing chart data on every render, but if the LineChart is still slow, downsample `regimeCurves` to 6 months per line.
- **If the user asks to cut scope under time pressure:** build order is already priority-sorted. Dropping any task from 14 onward leaves the demo still coherent because the Scenario Lab, SKU slide-over, Pricing, and Customers features are landed first.

## Self-review

- [ ] **Spec coverage:** 23 feature rows in the spec × tasks above: 3.1–3.7 → Task 12 (Pricing). 4.1–4.5 → Task 8 (Scenario Lab ShockSlider instances + derived combined curve). 4.6 → Task 6 (MonteCarloHistogram). 4.7 → Task 10 (BreakEvenChart). 4.8 → Task 7 (RegimeToggle). 5.1 → Task 16 (QuoteToCashTab). 5.2 → Task 13 (CLVRanking). 5.3 → Task 10 (ProfitabilityQuadrant). 5.4 → Task 14 (LiveAlertStrip). 5.5 → Task 17 (ChurnSurvivalCurve). 5.6 → Task 13 (CrossSellPanel) + Task 11 (SKU slide-over cross-sell tab). 5.7 → Task 15 (NLHeaderCard) + Task 18 (AI prompts). 5.8 → Task 14 (AnomalyFeedCard) + Task 11 (SKU slide-over anomalies tab). All 23 ✅.
- [ ] **Placeholder scan:** no TBDs, no "implement later", no "similar to Task N" without explicit code.
- [ ] **Type consistency:** JSON field names (`marketLow`, `marketHigh`, `priceDelta`, `breakEvenUnits`, `retentionProb`, `churnProb`, `monthsActive`) used identically in Tasks 10, 12, 13, 17.
- [ ] **Real-build gate:** verification script runs after every structural task (1, 2, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19).
- [ ] **Deploy gates:** Task 20 blocks on user approval before rsync. Task 21.5 blocks on user approval before git push.
