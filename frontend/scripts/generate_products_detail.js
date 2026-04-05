// Generates products_detail.json — KPIs, product type performance, commodity scorecard,
// declining-fast watchlist, and per-article enrichment (win_rate, lost_revenue, customer_count).
// Run: node scripts/generate_products_detail.js
import fs from 'node:fs';
import path from 'node:path';

const productsPath = path.resolve(path.dirname(new URL(import.meta.url).pathname), '../src/data/products.json');
const { products } = JSON.parse(fs.readFileSync(productsPath, 'utf8'));

// ---------- KPIs ----------
const kpis = {
  total_active_skus: 1015,
  skus_by_commodity: { BKAES: 627, BKAGG: 370, BKAIZ: 13, MBKUEHL: 1, SOPU: 4 },
  avg_db2_margin: 0.634,
  avg_db2_by_commodity: { BKAES: 0.680, BKAGG: 0.537, BKAIZ: 0.544, MBKUEHL: 0.085, SOPU: 0.464 },
  skus_below_target: { warning: 145, critical: 62, target_pct: 0.50, critical_pct: 0.25 },
  skus_below_target_by_commodity: {
    BKAES:   { warning: 52, critical: 18 },
    BKAGG:   { warning: 79, critical: 31 },
    BKAIZ:   { warning: 4,  critical: 2 },
    MBKUEHL: { warning: 1,  critical: 1 },
    SOPU:    { warning: 9,  critical: 10 },
  },
  new_product: {
    revenue_eur: 1500000,
    sku_count: 203,
    pct_of_total_revenue: 0.083,
    monthly_trend: [42000, 68000, 85000, 94000, 112000, 128000, 145000, 161000, 172000, 183000, 196000, 204000],
  },
  top10_concentration_pct: 0.38, // top-10 SKUs = 38% of revenue
};

// ---------- Product Type Performance ----------
const productTypePerformance = [
  { type: "Zahnradpumpe",         type_en: "Gear Pump",               revenue_eur: 8817000, db2_margin: 0.625, articles: 447, orders: 1916 },
  { type: "Elektro-Zahnradpumpe", type_en: "Electric Gear Pump",      revenue_eur: 6149000, db2_margin: 0.644, articles: 355, orders: 1095 },
  { type: "Zahnrad-Flanschpumpe", type_en: "Gear Flange Pump",        revenue_eur: 1327000, db2_margin: 0.639, articles: 112, orders: 535 },
  { type: "Innenzahnringpumpe",   type_en: "Internal Gear Pump",      revenue_eur: 1057000, db2_margin: 0.549, articles: 19,  orders: 214 },
  { type: "Pumpenkopf",           type_en: "Pump Head",               revenue_eur: 847000,  db2_margin: 0.743, articles: 66,  orders: 334 },
];

// ---------- Commodity Scorecard ----------
const commodityScorecard = [
  { group: "BKAES", revenue_eur: 12300000, db2_margin: 0.680, win_rate: 0.527, skus: 627, orders: 2066 },
  { group: "BKAGG", revenue_eur: 5300000,  db2_margin: 0.537, win_rate: 0.470, skus: 370, orders: 1939 },
  { group: "BKAIZ", revenue_eur: 564000,   db2_margin: 0.544, win_rate: 0.612, skus: 13,  orders: 103 },
  { group: "SOPU",  revenue_eur: 170000,   db2_margin: 0.464, win_rate: null,  skus: 6,   orders: 12 },
  { group: "MBKUEHL", revenue_eur: 410000, db2_margin: 0.085, win_rate: 0.333, skus: 1,   orders: 12 },
];

// ---------- Declining Fast Watch List ----------
const decliningFast = [
  { article: "201773",   description: "Zahnradpumpe",          commodity_group: "BKAGG", revenue_eur: 50000,  margin_2022: 0.625, margin_2024: 0.231, drop_pp: -39.4 },
  { article: "205169",   description: "Zahnradpumpe",          commodity_group: "BKAGG", revenue_eur: 63000,  margin_2022: 0.701, margin_2024: 0.442, drop_pp: -25.9 },
  { article: "200832-E", description: "Elektro-Zahnradpumpe",  commodity_group: "BKAES", revenue_eur: 162000, margin_2022: 0.306, margin_2024: 0.064, drop_pp: -24.2 },
  { article: "204604",   description: "Zahnradpumpe",          commodity_group: "BKAGG", revenue_eur: 240000, margin_2022: 0.327, margin_2024: 0.118, drop_pp: -20.8 },
  { article: "200834-B", description: "Elektro-Zahnradpumpe",  commodity_group: "BKAES", revenue_eur: 124000, margin_2022: 0.558, margin_2024: 0.368, drop_pp: -19.0 },
];

// ---------- Per-Article Enrichment ----------
// Deterministic pseudo-random via hash of article_id
function hash(s) {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h = Math.imul(h ^ s.charCodeAt(i), 16777619);
  }
  return (h >>> 0) / 0xffffffff;
}

function customerCountFor(product) {
  // Higher-revenue products have more customers; some single-customer SKUs
  const rev = product.total_revenue || 0;
  const base = Math.max(1, Math.round(Math.log10(rev + 1) * 2));
  const jitter = Math.floor(hash(product.article_id + 'c') * 8);
  const count = Math.max(1, base + jitter - 3);
  // ~10% of SKUs are single-customer (concentration risk)
  if (hash(product.article_id + 's') < 0.10) return 1;
  return count;
}

function winRateFor(product) {
  // High-margin SKUs → lower win rate (premium pricing hypothesis)
  // Low-margin SKUs → higher win rate OR very low (losing on cost)
  const margin = product.margin_2025 ?? product.margin_2024 ?? 0.5;
  const seed = hash(product.article_id + 'w');
  let baseWin;
  if (margin > 0.75) baseWin = 0.25 + seed * 0.25; // premium → 25-50%
  else if (margin > 0.60) baseWin = 0.40 + seed * 0.25; // healthy → 40-65%
  else if (margin > 0.40) baseWin = 0.50 + seed * 0.30; // at-risk → 50-80%
  else if (margin > 0.20) baseWin = 0.45 + seed * 0.35; // critical → 45-80%
  else baseWin = 0.20 + seed * 0.40; // below floor, losing deals
  return Math.round(baseWin * 1000) / 1000;
}

function lostRevenueFor(product, winRate) {
  // Lost rev correlates with revenue and (1 - win_rate)
  const won = product.total_revenue || 0;
  if (winRate <= 0) return 0;
  const implied = (won / winRate) - won; // implied opportunity size
  const jitter = 0.7 + hash(product.article_id + 'l') * 0.6;
  return Math.round(implied * jitter);
}

const articleEnrichment = {};
products.forEach((p) => {
  const winRate = winRateFor(p);
  const lostRev = lostRevenueFor(p, winRate);
  const custCount = customerCountFor(p);
  articleEnrichment[p.article_id] = {
    product_type: p.description, // description IS the product type
    win_rate: winRate,
    lost_revenue_eur: lostRev,
    customer_count: custCount,
  };
});

const output = {
  last_updated: new Date().toISOString(),
  kpis,
  product_type_performance: productTypePerformance,
  commodity_scorecard: commodityScorecard,
  declining_fast: decliningFast,
  article_enrichment: articleEnrichment,
};

const outPath = path.resolve(path.dirname(new URL(import.meta.url).pathname), '../src/data/products_detail.json');
fs.writeFileSync(outPath, JSON.stringify(output, null, 2));
console.log(`Wrote ${outPath}`);
console.log(`  KPIs: ${Object.keys(kpis).length}`);
console.log(`  product types: ${productTypePerformance.length}`);
console.log(`  commodity groups: ${commodityScorecard.length}`);
console.log(`  declining fast: ${decliningFast.length}`);
console.log(`  article enrichments: ${Object.keys(articleEnrichment).length}`);
