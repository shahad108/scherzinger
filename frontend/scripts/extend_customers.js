// Extends customers_detail.json with Mid-Market, SME, and Occasional customers
// so segment filters on the Customers page show meaningful data.
// Run: node scripts/extend_customers.js
import fs from 'node:fs';
import path from 'node:path';

const filePath = path.resolve(path.dirname(new URL(import.meta.url).pathname), '../src/data/customers_detail.json');
const data = JSON.parse(fs.readFileSync(filePath, 'utf8'));

// Keep existing Enterprise customers
const existing = data.customers;
const enterpriseCount = existing.filter((c) => c.segment === 'Enterprise').length;
console.log(`Existing Enterprise customers: ${enterpriseCount}`);

// Determine next customer_id: existing IDs are numeric strings, find max
const maxId = Math.max(...existing.map((c) => parseInt(c.customer_id, 10)));
let nextId = Math.max(maxId + 1, 104000);

// Deterministic pseudo-random via LCG with seed derived from id
function seedRandom(id) {
  let seed = 0;
  for (let i = 0; i < id.length; i++) seed = (seed * 31 + id.charCodeAt(i)) >>> 0;
  return () => {
    seed = (seed * 1664525 + 1013904223) >>> 0;
    return seed / 0xffffffff;
  };
}

function round(n, dec = 3) {
  const f = Math.pow(10, dec);
  return Math.round(n * f) / f;
}

// Per-segment characteristics
const segmentConfig = {
  'Mid-Market': {
    count: 18,
    revenueRange: [35000, 120000],
    marginRange: [0.55, 0.78],
    invoiceRange: [8, 60],
    quoteRange: [3, 20],
    winRateRange: [0.4, 0.85],
    riskWeights: { low: 0.45, medium: 0.30, high: 0.20, critical: 0.05 },
    firstSeenYears: [2022, 2023, 2024],
  },
  'SME': {
    count: 16,
    revenueRange: [8000, 40000],
    marginRange: [0.58, 0.85],
    invoiceRange: [3, 20],
    quoteRange: [1, 8],
    winRateRange: [0.3, 0.9],
    riskWeights: { low: 0.35, medium: 0.30, high: 0.25, critical: 0.10 },
    firstSeenYears: [2022, 2023, 2024, 2025],
  },
  'Occasional': {
    count: 12,
    revenueRange: [1500, 9000],
    marginRange: [0.52, 0.90],
    invoiceRange: [1, 6],
    quoteRange: [0, 4],
    winRateRange: [0.2, 0.85],
    riskWeights: { low: 0.15, medium: 0.25, high: 0.40, critical: 0.20 },
    firstSeenYears: [2022, 2023, 2024, 2025],
  },
};

const commonProducts = [
  '200832-E', '200834-B', '200890-B', '200960', '200965', '201036', '201100-D', '201138',
  '201272', '201389-A', '201456', '201459-I', '201827', '201883', '201883-B', '201885',
  '201924', '201924-F', '201941-J', '201951', '202071', '202084', '202084-A', '202101',
  '202428', '203076', '203092', '203094', '204258', '204285-A', '204361', '204430',
  '204505-A', '204560', '204604', '204604-B', '204616', '204632', '204702-A', '204720',
  '204743', '205111-B', '205165', '205178', '205185-A', '205274-A', '205300-A', '205345-A',
  '205592', '205593', '205593-A', '205593-B', '205601-B', '206028-01', '300143', '120584',
];

function pickRisk(weights, rand) {
  const r = rand();
  let cum = 0;
  for (const [tier, w] of Object.entries(weights)) {
    cum += w;
    if (r <= cum) return tier;
  }
  return 'medium';
}

function range(lo, hi, rand) {
  return lo + rand() * (hi - lo);
}

function makeCustomer(segment, cfg, id, rand) {
  const customer_id = String(id);
  const name = `Customer ${id}`;
  const totalRevenue = Math.round(range(cfg.revenueRange[0], cfg.revenueRange[1], rand));
  const avgMargin = round(range(cfg.marginRange[0], cfg.marginRange[1], rand));
  const invoices = Math.round(range(cfg.invoiceRange[0], cfg.invoiceRange[1], rand));
  const quotes = Math.round(range(cfg.quoteRange[0], cfg.quoteRange[1], rand));
  const winRate = round(range(cfg.winRateRange[0], cfg.winRateRange[1], rand));
  const riskTier = pickRisk(cfg.riskWeights, rand);
  const riskScore = round({
    low: 0.10 + rand() * 0.20,
    medium: 0.30 + rand() * 0.25,
    high: 0.55 + rand() * 0.25,
    critical: 0.80 + rand() * 0.18,
  }[riskTier]);
  const firstYear = cfg.firstSeenYears[Math.floor(rand() * cfg.firstSeenYears.length)];
  const firstSeen = `${firstYear}-${String(Math.ceil(rand() * 12)).padStart(2, '0')}-${String(Math.ceil(rand() * 28)).padStart(2, '0')}`;

  // Distribute revenue across years: newer customers get more weight in recent years
  const years = [2022, 2023, 2024, 2025];
  const weights = years.map((y) => {
    if (y < firstYear) return 0;
    return 0.5 + rand();
  });
  const wSum = weights.reduce((s, w) => s + w, 0);
  const revenue_by_year = {};
  years.forEach((y, i) => {
    revenue_by_year[y] = Math.round((weights[i] / wSum) * totalRevenue);
  });

  // Per-year margin drifts around avg
  const margin_by_year = {};
  years.forEach((y) => {
    const drift = (rand() - 0.5) * 0.10;
    margin_by_year[y] = revenue_by_year[y] > 0 ? round(avgMargin + drift) : null;
  });

  // Pick 1-3 top products
  const productCount = 1 + Math.floor(rand() * 3);
  const picks = new Set();
  while (picks.size < productCount) {
    picks.add(commonProducts[Math.floor(rand() * commonProducts.length)]);
  }

  const ltvEstimated = Math.round(totalRevenue * (1 + rand() * 0.4));

  return {
    customer_id,
    name,
    segment,
    first_seen: firstSeen,
    total_revenue_eur: totalRevenue,
    total_invoices: invoices,
    avg_db2_margin: avgMargin,
    win_rate: winRate,
    total_quotes: quotes,
    risk_tier: riskTier,
    risk_score: riskScore,
    revenue_by_year,
    margin_by_year,
    top_products: [...picks],
    ltv_estimated: ltvEstimated,
  };
}

const synthetic = [];
for (const [segment, cfg] of Object.entries(segmentConfig)) {
  for (let i = 0; i < cfg.count; i++) {
    const id = nextId++;
    const rand = seedRandom(String(id));
    synthetic.push(makeCustomer(segment, cfg, id, rand));
  }
}

data.customers = [...existing, ...synthetic];

// Count per segment for log
const byseg = {};
data.customers.forEach((c) => { byseg[c.segment] = (byseg[c.segment] || 0) + 1; });

fs.writeFileSync(filePath, JSON.stringify(data, null, 2));
console.log(`Wrote ${filePath}`);
console.log(`Customers by segment:`, byseg);
console.log(`Total customers: ${data.customers.length}`);
