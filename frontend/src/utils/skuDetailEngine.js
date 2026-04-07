import productsData from '../data/products.json';
import inventoryData from '../data/inventory_detail.json';
import pricingAnalysis from '../data/pricing_analysis.json';
import salesData from '../data/sales_transactions.json';
import monthlyData from '../data/monthly_detail.json';
import mlData from '../data/ml_analytics.json';
import cogsData from '../data/cogs_detail.json';
import governanceData from '../data/price_governance.json';
import forecastingData from '../data/forecasting.json';
import customersData from '../data/customers_detail.json';
import articleQuotesData from '../data/article_quotes.json';
import articleCustomersData from '../data/article_customers.json';

// ── Lookup indexes ──

// products.json is a flat array; key by article_id
const productMap = Object.fromEntries(
  (Array.isArray(productsData) ? productsData : productsData.products || [])
    .map(p => [p.article_id, p])
);

// inventory_detail.json → cost_trends array, keyed by article_id
const costTrendMap = Object.fromEntries(
  (inventoryData.cost_trends || []).map(i => [i.article_id, i])
);

// cogs_detail.json → cost_by_commodity array, keyed by commodity_group
const cogsByCommodityMap = Object.fromEntries(
  (cogsData.cost_by_commodity || []).map(c => [c.commodity_group, c])
);

// pricing_analysis.json → gap_analysis.by_year (array of yearly gaps)
const gapAnalysisByYear = pricingAnalysis.gap_analysis?.by_year || [];
const gapAnalysisOverall = pricingAnalysis.gap_analysis?.overall || {};

// pricing_analysis.json → win_rate_by_margin_band (array, not keyed by SKU)
const winRateByMarginBand = pricingAnalysis.win_rate_by_margin_band || [];

// ml_analytics.json → bcg_matrix is at TOP level, keyed by commodity_group
const bcgMap = Object.fromEntries(
  (Array.isArray(mlData.bcg_matrix) ? mlData.bcg_matrix : [])
    .map(b => [b.commodity_group, b])
);

// price_governance.json → price_rules (flat list, not keyed by commodity)
const priceRules = governanceData.price_rules || [];
const priceHistory = governanceData.price_history || [];
const conversionTiming = governanceData.conversion_timing || {};

// customers_detail.json → keyed by customer_id
const customerMap = Object.fromEntries(
  (Array.isArray(customersData) ? customersData : customersData.customers || [])
    .map(c => [c.customer_id, c])
);

// All products flat array for rankings & related SKUs
const allProducts = Array.isArray(productsData) ? productsData : productsData.products || [];

// Pre-compute margin rankings within each commodity group
const marginRankByGroup = (() => {
  const groups = {};
  allProducts.forEach(p => {
    const grp = p.commodity_group;
    if (!grp) return;
    if (!groups[grp]) groups[grp] = [];
    const margin = p.margin_2025 ?? p.margin_2024 ?? null;
    if (margin != null) groups[grp].push({ article_id: p.article_id, margin });
  });
  // Sort descending by margin within each group
  Object.keys(groups).forEach(grp => {
    groups[grp].sort((a, b) => b.margin - a.margin);
  });
  return groups;
})();

// ── Build full SKU detail ──
export function getSKUDetail(skuCode) {
  const product = productMap[skuCode];
  if (!product) return null;

  const costTrend = costTrendMap[skuCode];
  const gapEntry = gapAnalysisOverall;
  const bcg = bcgMap[product.commodity_group];
  const gov = { rules: priceRules, history: priceHistory, timing: conversionTiming };
  const cogsCommodity = cogsByCommodityMap[product.commodity_group];
  const currentMarginVal = product.margin_2025 ?? product.margin_2024;

  // ── Revenue by year ──
  const revenueByYear = [
    { year: '2022', revenue: product.revenue_2022, margin: product.margin_2022 },
    { year: '2023', revenue: product.revenue_2023, margin: product.margin_2023 },
    { year: '2024', revenue: product.revenue_2024, margin: product.margin_2024 },
    { year: '2025', revenue: product.revenue_2025, margin: product.margin_2025 },
  ].filter(y => y.revenue != null);

  // YoY growth
  const prevRevenue = revenueByYear.length >= 2 ? revenueByYear[revenueByYear.length - 2].revenue : null;
  const yoyGrowth = revenueByYear.length >= 2 && prevRevenue && prevRevenue !== 0
    ? ((revenueByYear[revenueByYear.length - 1].revenue - prevRevenue) / prevRevenue) * 100
    : null;

  // ── Margin trajectory for sparkline ──
  const marginTrajectory = revenueByYear
    .map(y => ({ year: y.year, margin: y.margin }))
    .filter(m => m.margin != null);

  // ── Monthly margin data (flat array, no per-SKU data) ──
  const monthlyMargins = (Array.isArray(monthlyData) ? monthlyData : [])
    .sort((a, b) => (a.Year - b.Year) || (a.Month - b.Month))
    .map(m => ({
      period: `${m.Year}-${String(m.Month).padStart(2, '0')}`,
      label: m.month_label || `${['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'][m.Month - 1]} ${String(m.Year).slice(-2)}`,
      margin: m.db2_margin,
      revenue: m.revenue_eur,
      db1Margin: m.db1_margin,
      invoices: m.invoices,
      uniqueCustomers: m.unique_customers,
      avgRevenuePerInvoice: m.avg_revenue_per_invoice,
    }));

  // ── Customer purchases for this SKU via recent_invoices ──
  const invoicesBySku = (salesData.recent_invoices || [])
    .filter(t => t.article_id === skuCode);

  // Aggregate by customer
  const customerAgg = {};
  invoicesBySku.forEach(t => {
    const custKey = t.customer_id;
    if (!customerAgg[custKey]) {
      customerAgg[custKey] = {
        customer_id: custKey,
        customer_name: t.customer_name,
        totalValue: 0,
        txnCount: 0,
        margins: [],
        lastDate: null,
      };
    }
    const c = customerAgg[custKey];
    c.totalValue += t.revenue_eur || 0;
    c.txnCount += 1;
    c.margins.push(t.db2_margin);
    if (!c.lastDate || t.date > c.lastDate) c.lastDate = t.date;
  });

  const customerPurchases = Object.values(customerAgg)
    .map(c => {
      const custDetail = customerMap[c.customer_id];
      const validMargins = c.margins.filter(m => m != null);
      const avgMargin = validMargins.length > 0
        ? validMargins.reduce((s, m) => s + m, 0) / validMargins.length
        : null;
      return {
        customer_id: c.customer_id,
        customer_name: c.customer_name,
        segment: custDetail?.segment || '—',
        totalValue: c.totalValue,
        avgMargin,
        txnCount: c.txnCount,
        lastDate: c.lastDate,
        riskTier: custDetail?.risk_tier || '—',
        riskScore: custDetail?.risk_score ?? null,
        ltvEstimated: custDetail?.ltv_estimated ?? null,
      };
    })
    .sort((a, b) => b.totalValue - a.totalValue);

  // ── Quote Performance (from article_quotes.json) ──
  const articleQuote = articleQuotesData[skuCode] || null;
  const quotePerformance = articleQuote ? {
    win: articleQuote.win,
    loss: articleQuote.loss,
    total: articleQuote.total,
    winRate: articleQuote.win_rate,
    lostRevenue: articleQuote.lost_revenue,
    wonAvgMargin: articleQuote.won_avg_margin,
    lostAvgMargin: articleQuote.lost_avg_margin,
  } : null;

  // ── Article-level customer data (from article_customers.json) ──
  const articleCust = articleCustomersData[skuCode] || null;
  const articleCustomerCount = articleCust?.customer_count ?? customerPurchases.length;
  const articleConcentration = articleCust?.concentration || null;
  const articleTopCustomerShare = articleCust?.top_customer_share ?? null;
  // Enrich article_customers with detail from customerMap
  const articleCustomerList = (articleCust?.customers || []).map(ac => {
    const custDetail = customerMap[ac.customer_id];
    return {
      ...ac,
      customer_name: custDetail?.customer_name || `Customer ${ac.customer_id}`,
      segment: custDetail?.segment || '—',
      riskTier: custDetail?.risk_tier || '—',
      avgMargin: custDetail?.avg_db2_margin ?? null,
    };
  });

  // ── Order Frequency & Recency ──
  const orderDates = invoicesBySku.map(t => t.date).filter(Boolean).sort();
  const lastOrderDate = orderDates.length > 0 ? orderDates[orderDates.length - 1] : null;
  const firstOrderDate = orderDates.length > 0 ? orderDates[0] : null;
  const totalOrders = invoicesBySku.length;
  const orderYears = firstOrderDate && lastOrderDate
    ? Math.max(1, (new Date(lastOrderDate) - new Date(firstOrderDate)) / (365.25 * 86400000))
    : 1;
  const avgOrdersPerYear = totalOrders > 0 ? totalOrders / orderYears : 0;
  const monthsSinceLastOrder = lastOrderDate
    ? Math.round((Date.now() - new Date(lastOrderDate).getTime()) / (30.44 * 86400000))
    : null;
  const orderActivity = {
    lastOrderDate,
    firstOrderDate,
    totalOrders,
    avgOrdersPerYear: Math.round(avgOrdersPerYear * 10) / 10,
    monthsSinceLastOrder,
    isInactive: monthsSinceLastOrder != null && monthsSinceLastOrder > 6,
    status: monthsSinceLastOrder == null ? 'No data'
      : monthsSinceLastOrder <= 3 ? 'Active'
      : monthsSinceLastOrder <= 6 ? 'Slowing'
      : 'Inactive',
  };

  // ── Margin Rank within commodity group ──
  const groupRankings = marginRankByGroup[product.commodity_group] || [];
  const rankIndex = groupRankings.findIndex(r => r.article_id === skuCode);
  const marginRank = rankIndex >= 0 ? {
    rank: rankIndex + 1,
    total: groupRankings.length,
    percentile: Math.round(((groupRankings.length - rankIndex) / groupRankings.length) * 100),
  } : null;

  // ── Related / Similar SKUs ──
  const basePrefix = skuCode.replace(/-[A-Z0-9]+$/, '');
  const relatedSkus = allProducts
    .filter(p => p.article_id !== skuCode)
    .map(p => {
      const isVariant = p.article_id.startsWith(basePrefix + '-') || p.article_id === basePrefix;
      const sameGroup = p.commodity_group === product.commodity_group;
      const revRatio = product.total_revenue > 0 ? p.total_revenue / product.total_revenue : 0;
      const similarRevenue = revRatio >= 0.5 && revRatio <= 1.5;
      const margin = p.margin_2025 ?? p.margin_2024 ?? null;
      const marginDiff = margin != null && currentMarginVal != null ? Math.abs(margin - currentMarginVal) : 1;
      let relevance = 0;
      if (isVariant) relevance += 100;
      if (sameGroup) relevance += 30;
      if (similarRevenue) relevance += 20;
      relevance -= marginDiff * 10;
      return {
        article_id: p.article_id,
        description: p.description,
        commodity_group: p.commodity_group,
        revenue: p.total_revenue,
        margin,
        marginTrend: p.margin_trend,
        isVariant,
        relevance,
      };
    })
    .filter(p => p.relevance > 0)
    .sort((a, b) => b.relevance - a.relevance)
    .slice(0, 5);

  // ── Price vs Cost per year ──
  const priceCostByYear = revenueByYear
    .filter(y => y.revenue > 0)
    .map(y => {
      const units = product[`units_${y.year}`] || product.total_units / Math.max(revenueByYear.length, 1);
      const hkvoll = costTrend?.[`hkvoll_${y.year}`] ?? null;
      const pricePerUnit = units > 0 ? y.revenue / units : null;
      return {
        year: y.year,
        pricePerUnit,
        costPerUnit: hkvoll,
        margin: y.margin,
        units,
      };
    });
  // Cost pass-through rate
  const costPassThrough = (() => {
    if (priceCostByYear.length < 2) return null;
    const first = priceCostByYear[0];
    const last = priceCostByYear[priceCostByYear.length - 1];
    if (!first.costPerUnit || !last.costPerUnit || !first.pricePerUnit || !last.pricePerUnit) return null;
    const costChange = last.costPerUnit - first.costPerUnit;
    const priceChange = last.pricePerUnit - first.pricePerUnit;
    if (costChange === 0) return null;
    return Math.round((priceChange / costChange) * 100) / 100;
  })();

  // ── Article-specific Gap Analysis (quoted vs actual from sales_transactions) ──
  const skuQuotes = (salesData.recent_quotes || []).filter(q => q.article_id === skuCode);
  const wonQuotes = skuQuotes.filter(q => q.status === 'Won' && q.db2_margin != null);
  const lostQuotes = skuQuotes.filter(q => q.status === 'Lost' && q.db2_margin != null);
  const avgQuotedMargin = skuQuotes.length > 0
    ? skuQuotes.filter(q => q.db2_margin != null).reduce((s, q) => s + q.db2_margin, 0) / skuQuotes.filter(q => q.db2_margin != null).length
    : null;
  const actualMarginVal = currentMarginVal;
  const articleGap = avgQuotedMargin != null && actualMarginVal != null
    ? { quoted: avgQuotedMargin, actual: actualMarginVal, gap: avgQuotedMargin - actualMarginVal }
    : null;

  // ── Pricing intelligence ──
  // cost_trends has hkvoll_2022-2025, cost_change_pct, material_share, etc.
  const hkvollPerUnit = product.hkvoll_per_unit ?? null;

  // price_recommendations, fx_sensitivity, price_consistency don't exist - return null/empty
  const targetMargin = gov?.target_margin || 0.55;

  // ── Cost trend metrics ──
  const costChangePct = costTrend?.cost_change_pct ?? null;
  const costTrendDirection = costTrend?.cost_trend ?? null;
  const materialShare = costTrend?.material_share ?? null;
  const laborShare = costTrend?.labor_share ?? null;
  const outsourcingShare = costTrend?.outsourcing_share ?? null;

  return {
    // Identity
    article_id: skuCode,
    description: product.description,
    commodity_group: product.commodity_group,
    isAtRisk: product.is_at_risk,

    // Revenue & Units
    totalRevenue: product.total_revenue,
    totalUnits: product.total_units,
    revenueByYear,
    yoyGrowth,

    // Margins
    currentMargin: currentMarginVal,
    marginTrend: product.margin_trend,
    marginTrajectory,
    monthlyMargins,

    // Cost breakdown (from products)
    hkvollPerUnit: hkvollPerUnit,
    materialPct: product.material_pct ?? null,
    fekPct: product.fek_pct ?? null,
    fvPct: product.fv_pct ?? null,

    // Cost trends (from inventory_detail → cost_trends)
    costChangePct,
    costTrendDirection,
    materialShare,
    laborShare,
    outsourcingShare,
    hkvoll2022: costTrend?.hkvoll_2022 ?? null,
    hkvoll2023: costTrend?.hkvoll_2023 ?? null,
    hkvoll2024: costTrend?.hkvoll_2024 ?? null,
    hkvoll2025: costTrend?.hkvoll_2025 ?? null,

    // Pricing (price_recommendations, fx_sensitivity, price_consistency don't exist)
    pricingAction: null,
    targetMargin,
    marginGap: gapEntry?.gap ?? null,
    isBelowFloor: false,
    landedCost: null,
    currentAvgPrice: null,
    recommendedPrice: null,
    priceIncreasePct: null,
    approvalLevel: null,
    approvalColor: null,

    // Price consistency - not available
    priceConsistency: null,

    // FX exposure - not available
    fxRisk: null,
    fxCurrentGM: null,

    // Gap analysis (from pricing_analysis)
    gapAnalysis: gapEntry || null,

    // Price sensitivity (from pricing_analysis)
    priceSensitivity: pricingAnalysis.price_sensitivity || null,

    // Win rate by margin band
    winRateByMarginBand,

    // ML / Portfolio - BCG is by commodity_group
    bcgQuadrant: bcg?.quadrant || null,
    bcgGrowth: bcg?.growth ?? null,
    bcgMargin: bcg?.margin ?? null,
    bcgRevenue: bcg?.revenue ?? null,

    // No demand_forecasts - removed
    demandTrend: null,
    abcClass: null,
    monthlyVelocity: null,
    forecastable: false,

    // Churn / anomaly from ml_analytics
    churnPrediction: mlData.churn_prediction || null,
    marginClassification: mlData.margin_classification || null,
    anomalyDetection: mlData.anomaly_detection || null,

    // Governance (from price_governance → price_rules)
    governance: gov || null,
    priceHistory: governanceData.price_history || null,
    conversionTiming: governanceData.conversion_timing || null,

    // COGS by commodity (from cogs_detail → cost_by_commodity)
    cogsCommodity: cogsCommodity || null,
    costBreakdown: cogsData.cost_breakdown || null,
    costByYear: cogsData.cost_by_year || null,
    costTrendQuarterly: cogsData.cost_trend_quarterly || null,

    // Customer breakdown (enriched with article_customers.json)
    customerPurchases,
    uniqueCustomers: articleCustomerCount,
    articleCustomerList,
    articleConcentration,
    articleTopCustomerShare,

    // Quote Performance
    quotePerformance,

    // Order Activity
    orderActivity,

    // Margin Rank within commodity group
    marginRank,

    // Related / Similar SKUs
    relatedSkus,

    // Price vs Cost by year
    priceCostByYear,
    costPassThrough,

    // Article-specific Gap Analysis (quoted vs actual)
    articleGap,

    // Portfolio-level gap for comparison reference
    portfolioGap: gapEntry || null,

    // COGS history - not available per-SKU in new schema
    cogsHistory: [],
  };
}

// ── Build Category (commodity_group) Detail ──
export function getCategoryDetail(categoryName) {
  const categoryProducts = allProducts.filter(p => p.commodity_group === categoryName);
  if (categoryProducts.length === 0) return null;

  const gov = { rules: priceRules, history: priceHistory, timing: conversionTiming };

  // Aggregate metrics
  const totalRevenue = categoryProducts.reduce((s, p) => s + (p.total_revenue || 0), 0);
  const avgMargin = categoryProducts.reduce((s, p) => s + (p.margin_2025 || p.margin_2024 || 0), 0) / categoryProducts.length;
  const atRiskCount = categoryProducts.filter(p => p.is_at_risk).length;
  const decliningCount = categoryProducts.filter(p => p.margin_trend === 'declining').length;
  const belowFloorCount = categoryProducts.filter(p => {
    const m = p.margin_2025 ?? p.margin_2024;
    return m != null && m < 0.50;
  }).length;

  // SKU breakdown sorted by revenue (article_id instead of sku)
  const skuBreakdown = categoryProducts
    .map(p => ({
      article_id: p.article_id,
      description: p.description,
      revenue: p.total_revenue,
      margin: p.margin_2025 ?? p.margin_2024,
      trend: p.margin_trend,
      isAtRisk: p.is_at_risk,
      units: p.total_units,
    }))
    .sort((a, b) => b.revenue - a.revenue);

  // Revenue by year
  const revenueByYear = [
    { year: '2022', revenue: categoryProducts.reduce((s, p) => s + (p.revenue_2022 || 0), 0) },
    { year: '2023', revenue: categoryProducts.reduce((s, p) => s + (p.revenue_2023 || 0), 0) },
    { year: '2024', revenue: categoryProducts.reduce((s, p) => s + (p.revenue_2024 || 0), 0) },
    { year: '2025', revenue: categoryProducts.reduce((s, p) => s + (p.revenue_2025 || 0), 0) },
  ];

  // Margin distribution
  const marginDistribution = categoryProducts
    .map(p => ({ article_id: p.article_id, margin: p.margin_2025 ?? p.margin_2024, revenue: p.total_revenue }))
    .filter(m => m.margin != null)
    .sort((a, b) => a.margin - b.margin);

  // Cost trends for this commodity_group
  const categoryCostTrends = (inventoryData.cost_trends || [])
    .filter(ct => ct.commodity_group === categoryName);

  // BCG entry for this commodity_group
  const bcg = bcgMap[categoryName];

  // Commodity forecast (forecasting.json → commodity_forecasts)
  const commodityForecast = (forecastingData.commodity_forecasts || [])
    .find(f => f.commodity_group === categoryName) || null;

  // COGS by commodity
  const cogsCommodity = cogsByCommodityMap[categoryName] || null;

  // Recovery potential - price_recommendations don't exist, so no recovery calc
  const totalRecovery = 0;
  const pricingActions = 0;

  return {
    commodity_group: categoryName,
    skuCount: categoryProducts.length,
    totalRevenue,
    avgMargin,
    atRiskCount,
    decliningCount,
    belowFloorCount,
    skuBreakdown,
    revenueByYear,
    marginDistribution,
    costTrends: categoryCostTrends,
    cogsCommodity,
    bcg: bcg || null,
    forecast: commodityForecast,
    governance: gov || null,
    totalRecovery,
    pricingActions,
  };
}
