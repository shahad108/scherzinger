/**
 * Pricing Command Center Engine
 * Generates enriched article-level recommendations from Scherzinger product,
 * cost, BCG, COGS, and governance data.  Every product gets a risk score,
 * priority tier, pricing action, and approval level.
 *
 * Currency: EUR throughout.  The legacy field `recovery_inr` is aliased to
 * `recovery_eur` so existing UI code keeps working.
 */
import productsData from '../data/products.json';
import inventoryData from '../data/inventory_detail.json';
import mlData from '../data/ml_analytics.json';
import governanceData from '../data/price_governance.json';
import cogsData from '../data/cogs_detail.json';

/* ── Constants ── */
const MARGIN_FLOOR = 0.50; // 50 % DB II floor

/* ── Index lookups ── */
export const productsByArticle = Object.fromEntries(
  (productsData.products || []).map((p) => [p.article_id, p])
);

export const costTrendsByArticle = Object.fromEntries(
  (inventoryData.cost_trends || []).map((c) => [c.article_id, c])
);

const cogsByCommodity = Object.fromEntries(
  (cogsData.cost_by_commodity || []).map((c) => [c.commodity_group, c])
);

const bcgByCommodity = Object.fromEntries(
  (mlData.bcg_matrix || []).map((b) => [b.commodity_group, b])
);

const priceRules = governanceData.price_rules || [];

/* ── Risk Score (0-100) ── */
export function computeRiskScore(product, costTrend) {
  let score = 0;

  // 1. Declining margin trend  (+30 pts)
  if (product?.margin_trend === 'declining') score += 30;

  // 2. Latest margin below 50 % floor  (+20 pts)
  const latestMargin = product?.margin_2025 ?? product?.margin_2024 ?? null;
  if (latestMargin != null && latestMargin < MARGIN_FLOOR) score += 20;

  // 3. Rising cost trend  (+15 pts)
  if (costTrend?.cost_trend === 'rising') score += 15;

  // 4. High revenue weight  (+10 pts)
  const rev = product?.total_revenue || 0;
  if (rev > 200000) score += 10;
  else if (rev > 100000) score += 7;
  else if (rev > 50000) score += 4;

  // 5. At-risk flag  (+15 pts)
  if (product?.is_at_risk) score += 15;

  return Math.min(Math.round(score), 100);
}

/* ── Pricing Action ── */
function computeAction(product) {
  const latestMargin = product?.margin_2025 ?? product?.margin_2024 ?? null;
  if (
    product?.margin_trend === 'declining' ||
    (latestMargin != null && latestMargin < MARGIN_FLOOR)
  ) {
    return 'Increase';
  }
  if (product?.margin_trend === 'stable') return 'Monitor';
  return 'OK';
}

/* ── Priority Tier ── */
export function computePriority(riskScore) {
  if (riskScore > 70) return 'Critical';
  if (riskScore >= 50) return 'High';
  if (riskScore >= 30) return 'Medium';
  return 'Low';
}

/* ── Approval Level based on margin gap to floor ── */
export function getApprovalLevel(gapPct) {
  if (gapPct < 3) return { level: 'Auto', color: 'green' };
  if (gapPct <= 5) return { level: 'Manager', color: 'amber' };
  if (gapPct <= 8) return { level: 'Director', color: 'orange' };
  return { level: 'VP', color: 'red' };
}

/* ── Margin Trajectory (2022-2025) ── */
export function getMarginTrajectory(product) {
  if (!product) return [];
  const points = [];
  if (product.margin_2022 != null) points.push({ year: '2022', margin: product.margin_2022 });
  if (product.margin_2023 != null) points.push({ year: '2023', margin: product.margin_2023 });
  if (product.margin_2024 != null) points.push({ year: '2024', margin: product.margin_2024 });
  if (product.margin_2025 != null) points.push({ year: '2025', margin: product.margin_2025 });
  return points;
}

/* ── Target margin: at least the floor, otherwise prior year ── */
function computeTargetMargin(product) {
  const prev = product?.margin_2024 ?? product?.margin_2023 ?? MARGIN_FLOOR;
  return Math.max(prev, MARGIN_FLOOR);
}

/* ── Recovery EUR ── */
function computeRecoveryEur(product, targetMargin) {
  const currentMargin = product?.margin_2025 ?? product?.margin_2024 ?? 0;
  const gap = targetMargin - currentMargin;
  if (gap <= 0) return 0;
  const latestRevenue = product?.revenue_2025 ?? product?.revenue_2024 ?? 0;
  return Math.round(latestRevenue * gap);
}

/* ══════════════════════════════════════════════════════════════════════════
   PUBLIC API
   ══════════════════════════════════════════════════════════════════════════ */

/**
 * Build enriched recommendations for every product in the catalogue.
 * Derives risk scores, actions, priorities, and approval levels from
 * products + cost trends + BCG + COGS + governance data.
 */
export function buildEnrichedRecommendations() {
  const products = productsData.products || [];
  if (products.length === 0) return [];

  return products.map((product) => {
    const costTrend = costTrendsByArticle[product.article_id];
    const cogsInfo = cogsByCommodity[product.commodity_group];
    const bcg = bcgByCommodity[product.commodity_group];

    const currentMargin = product.margin_2025 ?? product.margin_2024 ?? 0;
    const targetMargin = computeTargetMargin(product);
    const gap = targetMargin - currentMargin;
    const gapPct = Math.max(gap * 100, 0);

    const riskScore = computeRiskScore(product, costTrend);
    const action = computeAction(product);
    const priority = computePriority(riskScore);
    const approval = getApprovalLevel(gapPct);
    const marginTrajectory = getMarginTrajectory(product);
    const recoveryEur = computeRecoveryEur(product, targetMargin);
    const costChangePct = costTrend?.cost_change_pct ?? 0;

    return {
      // Identifiers
      article_id: product.article_id,
      description: product.description,
      commodity_group: product.commodity_group,

      // Margin data
      current_margin: currentMargin,
      target_margin: targetMargin,
      gap: gap > 0 ? +gap.toFixed(4) : 0,
      marginTrajectory,
      marginTrend: product.margin_trend || 'unknown',

      // Revenue
      revenue: product.total_revenue || 0,
      revenue_latest: product.revenue_2025 ?? product.revenue_2024 ?? 0,

      // Recovery (EUR) — `recovery_inr` kept as alias for backward UI compat
      recovery_eur: recoveryEur,
      recovery_inr: recoveryEur,

      // Cost
      cost_change_pct: costChangePct,
      cost_trend: costTrend?.cost_trend || 'unknown',
      hkvoll_per_unit: product.hkvoll_per_unit || null,
      material_pct: product.material_pct || costTrend?.material_share || 0,

      // Scoring & classification
      riskScore,
      priority,
      action,
      approval,

      // Flags
      isAtRisk: product.is_at_risk || false,

      // BCG / portfolio context
      bcgQuadrant: bcg?.quadrant || null,

      // COGS context
      commodityAvgHkvoll: cogsInfo?.avg_hkvoll || null,

      // Detail panel fields
      units_latest: product.units_2025 ?? product.units_2024 ?? 0,
      margin_2023: product.margin_2023,
      margin_2024: product.margin_2024,
      margin_2025: product.margin_2025,
    };
  });
}

/**
 * Reactive Recommendations — articles that need a price increase now.
 * Filter: action === 'Increase' OR current margin below 50 % floor.
 * Sorted by risk score descending, then recovery EUR descending.
 */
export function getReactiveRecommendations(enriched) {
  if (!enriched || !Array.isArray(enriched) || enriched.length === 0) return [];
  return enriched
    .filter((r) => r.action === 'Increase' || r.current_margin < MARGIN_FLOOR)
    .sort(
      (a, b) =>
        (b.riskScore || 0) - (a.riskScore || 0) ||
        (b.recovery_eur || 0) - (a.recovery_eur || 0)
    );
}

/**
 * Proactive Alerts — articles to watch before they become reactive.
 *  - Declining margin trend (not already flagged as Increase)
 *  - Approaching floor: margin between 50 % and 55 %
 *  - High cost growth (cost_change_pct > 0.20)
 * Sorted by risk score descending.
 */
export function getProactiveAlerts(enriched) {
  if (!enriched || !Array.isArray(enriched) || enriched.length === 0) return [];
  return enriched
    .filter((r) => {
      if (r.action === 'Increase') return false; // already reactive
      const approachingFloor =
        r.current_margin >= MARGIN_FLOOR && r.current_margin < 0.55;
      const highCostGrowth = (r.cost_change_pct || 0) > 0.20;
      return r.marginTrend === 'declining' || approachingFloor || highCostGrowth;
    })
    .sort((a, b) => (b.riskScore || 0) - (a.riskScore || 0));
}

/**
 * Recommendation Summary — aggregate KPIs consumed by the dashboard.
 */
export function getRecommendationSummary(reactive, proactive) {
  if (!reactive) reactive = [];
  if (!proactive) proactive = [];

  const totalRecovery = reactive.reduce((s, r) => s + (r.recovery_eur || r.recovery_inr || 0), 0);
  const criticalCount = reactive.filter((r) => r.priority === 'Critical').length;
  const highCount = reactive.filter((r) => r.priority === 'High').length;
  const avgRisk = reactive.length
    ? Math.round(reactive.reduce((s, r) => s + (r.riskScore || 0), 0) / reactive.length)
    : 0;
  const revenueAtRisk = reactive.reduce((s, r) => s + (r.revenue || 0), 0);

  return {
    totalCount: reactive.length + proactive.length,
    totalRecovery,
    reactiveCount: reactive.length,
    proactiveCount: proactive.length,
    criticalCount,
    highCount,
    avgRisk,
    revenueAtRisk,
  };
}
