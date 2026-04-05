// Generates revenue_margins_detail.json with commodity + year dimensions
// Run: node scripts/generate_margin_details.js
import fs from 'node:fs';
import path from 'node:path';

const baseQuarterly = [
  { quarter: "2022-Q1", year: 2022, q: 1, quoted: 0.765, actual: 0.616 },
  { quarter: "2022-Q2", year: 2022, q: 2, quoted: 0.747, actual: 0.624 },
  { quarter: "2022-Q3", year: 2022, q: 3, quoted: 0.664, actual: 0.618 },
  { quarter: "2022-Q4", year: 2022, q: 4, quoted: 0.664, actual: 0.682 },
  { quarter: "2023-Q1", year: 2023, q: 1, quoted: 0.690, actual: 0.649 },
  { quarter: "2023-Q2", year: 2023, q: 2, quoted: 0.741, actual: 0.658 },
  { quarter: "2023-Q3", year: 2023, q: 3, quoted: 0.625, actual: 0.608 },
  { quarter: "2023-Q4", year: 2023, q: 4, quoted: 0.666, actual: 0.652 },
  { quarter: "2024-Q1", year: 2024, q: 1, quoted: 0.659, actual: 0.637 },
  { quarter: "2024-Q2", year: 2024, q: 2, quoted: 0.706, actual: 0.626 },
  { quarter: "2024-Q3", year: 2024, q: 3, quoted: 0.701, actual: 0.600 },
  { quarter: "2024-Q4", year: 2024, q: 4, quoted: 0.644, actual: 0.630 },
  { quarter: "2025-Q1", year: 2025, q: 1, quoted: 0.672, actual: 0.601 },
  { quarter: "2025-Q2", year: 2025, q: 2, quoted: 0.679, actual: 0.601 },
  { quarter: "2025-Q3", year: 2025, q: 3, quoted: 0.701, actual: 0.612 },
  { quarter: "2025-Q4", year: 2025, q: 4, quoted: 0.685, actual: 0.623 },
];

// Per-commodity shifts relative to All (in decimal margin points)
// Using db2 averages: BKAES 0.680, BKAGG 0.537, BKAIZ 0.544, MBDIV 0.772, SOPU 0.464
// Base All actual average ≈ 0.630
const commodityShifts = {
  BKAES:  { actual: +0.050, quoted: +0.042, gapScale: 0.70 },
  BKAGG:  { actual: -0.095, quoted: -0.080, gapScale: 1.15 },
  BKAIZ:  { actual: -0.085, quoted: -0.065, gapScale: 1.25 },
  MBDIV:  { actual: +0.140, quoted: +0.118, gapScale: 0.55 },
  SOPU:   { actual: -0.165, quoted: -0.140, gapScale: 1.35 },
};

function makeQuarterly(shift) {
  return baseQuarterly.map(q => {
    const baseGap = q.quoted - q.actual;
    const newGap = baseGap * shift.gapScale;
    const newActual = Math.max(0.05, Math.min(0.95, q.actual + shift.actual));
    const newQuoted = Math.max(0.05, Math.min(0.99, newActual + newGap));
    return {
      quarter: q.quarter,
      year: q.year,
      q: q.q,
      quoted: +newQuoted.toFixed(3),
      actual: +newActual.toFixed(3),
      gap_pp: +((newQuoted - newActual) * 100).toFixed(1),
    };
  });
}

const quarterlyByCommodity = {
  All: baseQuarterly.map(q => ({
    ...q,
    gap_pp: +((q.quoted - q.actual) * 100).toFixed(1),
  })),
  BKAES: makeQuarterly(commodityShifts.BKAES),
  BKAGG: makeQuarterly(commodityShifts.BKAGG),
  BKAIZ: makeQuarterly(commodityShifts.BKAIZ),
  MBDIV: makeQuarterly(commodityShifts.MBDIV),
  SOPU:  makeQuarterly(commodityShifts.SOPU),
};

const commodityGroupMargins = [
  { group: "BKAES", description: "Electric Gear Pumps", db1_margin: 0.762, db2_margin: 0.680, fixed_overhead_pp: 8.2, revenue_eur: 12300000 },
  { group: "BKAGG", description: "Standard Gear Pumps", db1_margin: 0.646, db2_margin: 0.537, fixed_overhead_pp: 10.9, revenue_eur: 5300000 },
  { group: "BKAIZ", description: "Internal Gear Pumps", db1_margin: 0.654, db2_margin: 0.544, fixed_overhead_pp: 11.0, revenue_eur: 564000 },
  { group: "MBDIV", description: "Special Components", db1_margin: 0.821, db2_margin: 0.772, fixed_overhead_pp: 4.9, revenue_eur: 107024 },
  { group: "SOPU",  description: "Screw Pumps", db1_margin: 0.585, db2_margin: 0.464, fixed_overhead_pp: 12.1, revenue_eur: 170000 },
];

// Customer seed data (from original revenue_margins_detail.json) with primary_commodity added
// Primary commodity is assigned based on actual_margin band to align with commodity margins
const customerSeeds = [
  { customer_id: "101690", name: "Customer 101690", primary_commodity: "BKAGG", revenue_eur: 1053000, actual_margin: 0.541, quoted_margin: 0.775 },
  { customer_id: "100850", name: "Customer 100850", primary_commodity: "BKAGG", revenue_eur: 187000,  actual_margin: 0.541, quoted_margin: 0.730 },
  { customer_id: "101728", name: "Customer 101728", primary_commodity: "BKAGG", revenue_eur: 299000,  actual_margin: 0.537, quoted_margin: 0.717 },
  { customer_id: "101887", name: "Customer 101887", primary_commodity: "SOPU",  revenue_eur: 312000,  actual_margin: 0.421, quoted_margin: 0.596 },
  { customer_id: "100883", name: "Customer 100883", primary_commodity: "BKAGG", revenue_eur: 847000,  actual_margin: 0.498, quoted_margin: 0.645 },
  { customer_id: "101487", name: "Customer 101487", primary_commodity: "BKAIZ", revenue_eur: 509000,  actual_margin: 0.559, quoted_margin: 0.693 },
  { customer_id: "101531", name: "Customer 101531", primary_commodity: "SOPU",  revenue_eur: 468000,  actual_margin: 0.286, quoted_margin: 0.412 },
  { customer_id: "100989", name: "Customer 100989", primary_commodity: "SOPU",  revenue_eur: 445000,  actual_margin: 0.485, quoted_margin: 0.603 },
  { customer_id: "103466", name: "Customer 103466", primary_commodity: "SOPU",  revenue_eur: 410000,  actual_margin: 0.088, quoted_margin: 0.198 },
  { customer_id: "101755", name: "Customer 101755", primary_commodity: "SOPU",  revenue_eur: 283000,  actual_margin: 0.405, quoted_margin: 0.510 },
  { customer_id: "101900", name: "Customer 101900", primary_commodity: "BKAES", revenue_eur: 551000,  actual_margin: 0.676, quoted_margin: 0.775 },
  { customer_id: "100924", name: "Customer 100924", primary_commodity: "BKAES", revenue_eur: 314000,  actual_margin: 0.648, quoted_margin: 0.741 },
  { customer_id: "101041", name: "Customer 101041", primary_commodity: "BKAGG", revenue_eur: 242000,  actual_margin: 0.484, quoted_margin: 0.574 },
  { customer_id: "101043", name: "Customer 101043", primary_commodity: "BKAGG", revenue_eur: 234000,  actual_margin: 0.445, quoted_margin: 0.530 },
  { customer_id: "101244", name: "Customer 101244", primary_commodity: "BKAES", revenue_eur: 220000,  actual_margin: 0.655, quoted_margin: 0.733 },
  // Extra MBDIV customers (small group)
  { customer_id: "101858", name: "Customer 101858", primary_commodity: "MBDIV", revenue_eur: 195000,  actual_margin: 0.774, quoted_margin: 0.850 },
  { customer_id: "100913", name: "Customer 100913", primary_commodity: "MBDIV", revenue_eur: 128000,  actual_margin: 0.800, quoted_margin: 0.870 },
  // Extra BKAIZ
  { customer_id: "101181", name: "Customer 101181", primary_commodity: "BKAIZ", revenue_eur: 341000,  actual_margin: 0.582, quoted_margin: 0.690 },
  // Extra BKAES
  { customer_id: "100702", name: "Customer 100702", primary_commodity: "BKAES", revenue_eur: 617000,  actual_margin: 0.734, quoted_margin: 0.808 },
  { customer_id: "101708", name: "Customer 101708", primary_commodity: "BKAES", revenue_eur: 453000,  actual_margin: 0.756, quoted_margin: 0.820 },
];

// Year weightings for revenue distribution (approximates monthly_detail trends)
// 2022: 27%, 2023: 25%, 2024: 22%, 2025: 26%
const yearWeights = { 2022: 0.27, 2023: 0.25, 2024: 0.22, 2025: 0.26 };

// Year-over-year margin trajectory per commodity (multipliers applied to base actual margin)
const marginYoYTrajectory = {
  BKAES:  { 2022: 1.00, 2023: 0.99, 2024: 0.97, 2025: 0.98 },
  BKAGG:  { 2022: 1.02, 2023: 0.98, 2024: 0.95, 2025: 0.97 },
  BKAIZ:  { 2022: 0.98, 2023: 1.00, 2024: 1.02, 2025: 1.03 },
  MBDIV:  { 2022: 1.00, 2023: 1.01, 2024: 0.99, 2025: 1.02 },
  SOPU:   { 2022: 1.05, 2023: 0.95, 2024: 0.90, 2025: 1.00 },
};

// Gap trajectory per commodity (multipliers)
const gapYoYTrajectory = {
  BKAES:  { 2022: 0.75, 2023: 0.60, 2024: 0.85, 2025: 1.00 },
  BKAGG:  { 2022: 1.20, 2023: 0.90, 2024: 1.10, 2025: 1.00 },
  BKAIZ:  { 2022: 1.30, 2023: 1.10, 2024: 1.00, 2025: 0.80 },
  MBDIV:  { 2022: 0.60, 2023: 0.70, 2024: 0.80, 2025: 1.00 },
  SOPU:   { 2022: 1.15, 2023: 1.30, 2024: 1.40, 2025: 1.00 },
};

function buildYearly(seed) {
  const commodity = seed.primary_commodity;
  const yearly = {};
  const years = [2022, 2023, 2024, 2025];
  const baseActual = seed.actual_margin;
  const baseQuoted = seed.quoted_margin;
  const baseGap = baseQuoted - baseActual;

  years.forEach(year => {
    const actualMult = marginYoYTrajectory[commodity][year];
    const gapMult = gapYoYTrajectory[commodity][year];
    const yearActual = Math.max(0.02, Math.min(0.95, baseActual * actualMult));
    const yearGap = Math.max(0.01, baseGap * gapMult);
    const yearQuoted = Math.min(0.99, yearActual + yearGap);
    const yearRevenue = Math.round(seed.revenue_eur * yearWeights[year]);
    const impact = Math.round(yearRevenue * yearGap);

    // Trend = change in gap from prior year
    let trend = 'flat';
    if (year > 2022) {
      const priorGap = yearly[year - 1].gap_pp;
      const currentGapPp = yearGap * 100;
      if (currentGapPp - priorGap > 0.5) trend = 'up';
      else if (priorGap - currentGapPp > 0.5) trend = 'down';
    }

    yearly[year] = {
      revenue_eur: yearRevenue,
      actual_margin: +yearActual.toFixed(3),
      quoted_margin: +yearQuoted.toFixed(3),
      gap_pp: +(yearGap * 100).toFixed(1),
      impact_eur: impact,
      trend,
    };
  });

  // All-time aggregate (revenue-weighted)
  const totalRev = years.reduce((s, y) => s + yearly[y].revenue_eur, 0);
  const wActual = years.reduce((s, y) => s + yearly[y].actual_margin * yearly[y].revenue_eur, 0) / totalRev;
  const wQuoted = years.reduce((s, y) => s + yearly[y].quoted_margin * yearly[y].revenue_eur, 0) / totalRev;
  const wGap = wQuoted - wActual;
  const totalImpact = Math.round(totalRev * wGap);

  // All-time trend = direction from 2022 to 2025
  const firstGap = yearly[2022].gap_pp;
  const lastGap = yearly[2025].gap_pp;
  let allTimeTrend = 'flat';
  if (lastGap - firstGap > 1.0) allTimeTrend = 'up';
  else if (firstGap - lastGap > 1.0) allTimeTrend = 'down';

  return {
    yearly,
    all_time: {
      revenue_eur: totalRev,
      actual_margin: +wActual.toFixed(3),
      quoted_margin: +wQuoted.toFixed(3),
      gap_pp: +(wGap * 100).toFixed(1),
      impact_eur: totalImpact,
      trend: allTimeTrend,
    },
  };
}

const customerMarginGaps = customerSeeds.map(seed => {
  const { yearly, all_time } = buildYearly(seed);
  return {
    customer_id: seed.customer_id,
    name: seed.name,
    primary_commodity: seed.primary_commodity,
    yearly,
    all_time,
  };
});

const output = {
  last_updated: new Date().toISOString(),
  quarterly_quoted_vs_actual: quarterlyByCommodity,
  commodity_group_margins: commodityGroupMargins,
  customer_margin_gaps: customerMarginGaps,
};

const outPath = path.resolve(path.dirname(new URL(import.meta.url).pathname), '../src/data/revenue_margins_detail.json');
fs.writeFileSync(outPath, JSON.stringify(output, null, 2));
console.log(`Wrote ${outPath}`);
console.log(`  quarterly groups: ${Object.keys(quarterlyByCommodity).length}`);
console.log(`  commodity margins: ${commodityGroupMargins.length}`);
console.log(`  customers: ${customerMarginGaps.length}`);
