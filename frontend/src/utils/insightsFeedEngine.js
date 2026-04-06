/**
 * Intelligence Feed Engine
 *
 * Rule-based triggers that analyze static data files and produce
 * severity-ranked report objects for the AI Insights page.
 *
 * Architecture (per AI_INSIGHTS_PLAN.md):
 *   - Triggers are deterministic (no LLM hallucination risk)
 *   - Copy is template-based with real data interpolation
 *   - The engine decides WHAT to report; templates decide HOW to say it
 */

import dashboard from '../data/dashboard_data.json';
import customers from '../data/customers_detail.json';
import products from '../data/products.json';
import pipeline from '../data/pipeline.json';
import pricingAnalysis from '../data/pricing_analysis.json';
import forecasting from '../data/forecasting.json';
import cogs from '../data/cogs_detail.json';
import { formatEUR } from './formatters';

// ── Helpers ──

function pct(v) {
  return (v * 100).toFixed(1);
}

function pp(v) {
  return (v * 100).toFixed(1);
}

function yearRevenue(cust, year) {
  return cust.revenue_by_year?.[String(year)] ?? 0;
}

function yearMargin(cust, year) {
  return cust.margin_by_year?.[String(year)] ?? null;
}

// ── Report Generators ──

function generateWeeklyMarginBrief() {
  const annual = dashboard.annual_summary;
  const latest = annual[annual.length - 1];
  const prior = annual.length > 1 ? annual[annual.length - 2] : null;

  if (!latest) return null;

  const currentMargin = latest.avg_db2_margin;
  const marginChange = prior ? (latest.avg_db2_margin - prior.avg_db2_margin) : 0;
  const revenueGrowth = latest.yoy_growth ?? 0;

  // Find commodity group driving the decline
  const commodities = [...dashboard.commodity_group_revenue].sort(
    (a, b) => a.avg_db2_margin - b.avg_db2_margin
  );
  const worstComm = commodities[0];
  const bestComm = commodities[commodities.length - 1];

  // Articles below 45% margin floor
  const belowFloor = products.products.filter(
    (p) => p.margin_2025 != null && p.margin_2025 < 0.45
  );

  // Determine severity
  let severity = 50;
  if (marginChange < -0.01) severity = 75; // declining
  if (marginChange < -0.02) severity = 85; // sharply declining
  if (currentMargin < 0.55) severity = 90; // dangerously low

  return {
    id: 'weekly-margin-brief',
    type: 'Weekly Margin Brief',
    reportType: 'margin',
    severity,
    borderColor: marginChange < -0.005 ? 'red' : marginChange > 0.005 ? 'green' : 'amber',
    frequency: 'weekly',
    title: `DB2 at ${pct(currentMargin)}%, ${marginChange < 0 ? 'down' : 'up'} ${Math.abs(marginChange * 100).toFixed(1)}pp`,
    summary: `DB2 margin at ${pct(currentMargin)}%, ${marginChange < 0 ? 'down' : 'up'} ${Math.abs(marginChange * 100).toFixed(1)}pp YoY. ${worstComm.commodity_group} at ${pct(worstComm.avg_db2_margin)}% is the weakest group. ${belowFloor.length} articles fall below the 45% margin floor. Revenue ${revenueGrowth >= 0 ? 'grew' : 'declined'} ${Math.abs(revenueGrowth * 100).toFixed(1)}% YoY to ${formatEUR(latest.revenue_eur)}.`,
    detail: {
      title: `Margin Erosion — ${Math.abs(marginChange * 100).toFixed(1)}pp YoY ${marginChange < 0 ? 'Decline' : 'Increase'}`,
      subtitle: `DB2 margin: ${pct(currentMargin)}% (FY${latest.Year}). 4-year trend: ${pct(annual[0].avg_db2_margin)}% → ${pct(currentMargin)}%.`,
      metrics: [
        { label: 'Current DB2', value: `${pct(currentMargin)}%`, color: currentMargin < 0.6 ? '#dc2626' : '#10b981' },
        { label: 'YoY Change', value: `${marginChange >= 0 ? '+' : ''}${(marginChange * 100).toFixed(1)}pp`, color: marginChange < 0 ? '#dc2626' : '#10b981' },
        { label: 'Below Floor', value: `${belowFloor.length} articles`, color: belowFloor.length > 0 ? '#d97706' : '#10b981' },
      ],
      chartTitle: 'Annual Margin Progression',
      chartData: annual.map((y) => ({
        name: `FY${y.Year}`,
        value: +(y.avg_db2_margin * 100).toFixed(1),
      })),
      barColor: '#0393da',
      actions: [
        `Review pricing for ${worstComm.commodity_group} (${pct(worstComm.avg_db2_margin)}% margin — lowest across groups)`,
        `Audit ${belowFloor.length} articles below 45% margin floor for repricing or discontinuation`,
        `Protect ${bestComm.commodity_group} margins (${pct(bestComm.avg_db2_margin)}%) — highest margin group`,
        'Set automated alerts when any commodity group dips below 55%',
      ],
    },
    linkPage: '/revenue',
    linkLabel: 'Revenue & Margins',
  };
}

function generatePricingActionSummary() {
  // Find articles with negative or very low margins that need pricing action
  const criticalArticles = products.products.filter(
    (p) => p.margin_2025 != null && p.margin_2025 < 0.30 && p.revenue_2025 > 0
  );
  const atRiskArticles = products.products.filter((p) => p.is_at_risk);

  // Pricing gap analysis
  const gapAnalysis = pricingAnalysis.gap_analysis;
  const overallGap = gapAnalysis?.overall?.mean_gap ?? 0;

  // Recovery potential from persistent losses
  const persistentLosses = pricingAnalysis.persistent_losses?.top_10 ?? [];
  const totalLostRevenue = persistentLosses.reduce((s, p) => s + p.lost_revenue, 0);

  // Pipeline aging — quotes that might be stale
  const pipelineStages = pipeline.pipeline_stages ?? [];
  const quotedStage = pipelineStages.find((s) => s.stage === 'Quoted') || {};

  const severity = criticalArticles.length > 5 ? 70 : criticalArticles.length > 0 ? 55 : 30;

  return {
    id: 'pricing-action-summary',
    type: 'Pricing Action Summary',
    reportType: 'pricing',
    severity,
    borderColor: criticalArticles.length > 5 ? 'red' : 'amber',
    frequency: 'weekly',
    title: `${criticalArticles.length + atRiskArticles.length} SKUs need pricing review`,
    summary: `${criticalArticles.length} critical SKUs below 30% margin with active revenue. ${atRiskArticles.length} at-risk articles flagged. Quoted-to-actual gap: ${pp(overallGap)}pp. Top 10 persistent losses represent ${formatEUR(totalLostRevenue)} in lost revenue. ${quotedStage.count ?? 0} quotes outstanding worth ${formatEUR(quotedStage.value_eur ?? 0)}.`,
    detail: {
      title: `Pricing Action Required — ${criticalArticles.length} Critical SKUs`,
      subtitle: `Articles needing immediate pricing review. Overall quoted-to-actual margin gap: ${pp(overallGap)}pp.`,
      metrics: [
        { label: 'Critical SKUs', value: criticalArticles.length, color: '#dc2626' },
        { label: 'At-Risk Articles', value: atRiskArticles.length, color: '#d97706' },
        { label: 'Lost Revenue (Top 10)', value: formatEUR(totalLostRevenue), color: '#dc2626' },
      ],
      chartTitle: 'Win Rate by Margin Band',
      chartData: (pricingAnalysis.win_rate_by_margin_band ?? []).map((w) => ({
        name: w.band,
        value: +(w.win_rate * 100).toFixed(1),
      })),
      barColor: '#e7a019',
      actions: [
        `Immediately review ${criticalArticles.length} articles below 30% margin`,
        `Reprice at-risk articles — ${atRiskArticles.length} flagged for margin erosion`,
        `Close ${pp(overallGap)}pp quoted-to-actual margin gap through tighter price governance`,
        `Follow up on ${quotedStage.count ?? 0} outstanding quotes (${formatEUR(quotedStage.value_eur ?? 0)})`,
      ],
    },
    linkPage: '/pricing',
    linkLabel: 'Pricing & FX',
  };
}

function generateChurnEarlyWarnings() {
  const allCustomers = customers.customers ?? [];
  const warnings = [];

  for (const cust of allCustomers) {
    const rev2022 = yearRevenue(cust, 2022);
    const rev2023 = yearRevenue(cust, 2023);
    const rev2024 = yearRevenue(cust, 2024);
    const rev2025 = yearRevenue(cust, 2025);
    const peakRev = Math.max(rev2022, rev2023);

    if (peakRev === 0) continue;

    // Trigger: revenue drop >50% YoY from peak + declining trajectory
    const latestRev = rev2025 > 0 ? rev2025 : rev2024;
    const dropPct = (peakRev - latestRev) / peakRev;

    if (dropPct > 0.5 && (cust.risk_tier === 'high' || cust.risk_tier === 'critical')) {
      warnings.push({
        customerId: cust.customer_id,
        name: cust.name,
        peakRev,
        latestRev,
        dropPct,
        winRate: cust.win_rate,
        riskScore: cust.risk_score,
        riskTier: cust.risk_tier,
        segment: cust.segment,
        ltv: cust.ltv_estimated ?? 0,
      });
    }
  }

  // Sort by impact (peak revenue * drop)
  warnings.sort((a, b) => (b.peakRev * b.dropPct) - (a.peakRev * a.dropPct));
  const topWarnings = warnings.slice(0, 5);

  if (topWarnings.length === 0) return null;

  const top = topWarnings[0];
  const totalLtvAtRisk = topWarnings.reduce((s, w) => s + w.ltv, 0);
  const severity = topWarnings.length >= 3 ? 85 : topWarnings.length >= 1 ? 70 : 40;

  return {
    id: 'churn-early-warning',
    type: 'Churn Early Warning',
    reportType: 'churn',
    severity,
    borderColor: 'red',
    frequency: 'triggered',
    title: `${topWarnings.length} customers showing churn signals`,
    summary: `${top.name} revenue down ${(top.dropPct * 100).toFixed(0)}% from peak (${formatEUR(top.peakRev)} → ${formatEUR(top.latestRev)}). Win rate: ${pct(top.winRate)}%. ${topWarnings.length} high/critical-risk customers with >50% revenue decline. Combined LTV at risk: ${formatEUR(totalLtvAtRisk)}.`,
    detail: {
      title: `Churn Alert — ${topWarnings.length} Customers at Risk`,
      subtitle: `Customers with >50% revenue decline from peak and high/critical risk scores.`,
      metrics: [
        { label: 'Customers Flagged', value: topWarnings.length, color: '#dc2626' },
        { label: 'LTV at Risk', value: formatEUR(totalLtvAtRisk), color: '#dc2626' },
        { label: 'Worst Drop', value: `${(top.dropPct * 100).toFixed(0)}%`, color: '#dc2626' },
      ],
      chartTitle: 'Revenue Decline — Top Churn Risks',
      chartData: topWarnings.map((w) => ({
        name: w.customerId,
        value: w.peakRev,
        current: w.latestRev,
      })),
      barColor: '#dc2626',
      dataColumns: [
        { key: 'customerId', label: 'Customer' },
        { key: 'peakRev', label: 'Peak Revenue', render: (v) => formatEUR(v) },
        { key: 'latestRev', label: 'Current Revenue', render: (v) => formatEUR(v) },
        { key: 'dropPct', label: 'Decline', render: (v) => `${(v * 100).toFixed(0)}%` },
        { key: 'riskTier', label: 'Risk Tier' },
      ],
      dataRows: topWarnings,
      actions: [
        `Immediate outreach to ${top.name} — ${(top.dropPct * 100).toFixed(0)}% revenue decline`,
        `Schedule account reviews for all ${topWarnings.length} flagged customers`,
        'Prepare competitive analysis — check if displacement is pricing or product-driven',
        `Protect ${formatEUR(totalLtvAtRisk)} in at-risk LTV with retention programs`,
      ],
    },
    linkPage: '/customers',
    linkLabel: 'Customers',
    churnCustomers: topWarnings,
  };
}

function generateCostAlerts() {
  // Articles with negative or dangerously low margins due to cost
  const negativeMarginArticles = products.products.filter(
    (p) => p.margin_2025 != null && p.margin_2025 < 0.05 && p.revenue_2025 > 0
  );

  // Articles with high material cost percentage
  const highMaterialCost = products.products.filter(
    (p) => p.material_pct > 0.45 && p.revenue_2025 > 0
  );

  // COGS trend
  const costByYear = cogs.cost_by_year ?? [];
  const latestCost = costByYear[costByYear.length - 1];
  const priorCost = costByYear.length > 1 ? costByYear[costByYear.length - 2] : null;
  const costGrowth = latestCost && priorCost
    ? (latestCost.total_cogs - priorCost.total_cogs) / priorCost.total_cogs
    : 0;

  const severity = negativeMarginArticles.length > 3 ? 80 : negativeMarginArticles.length > 0 ? 60 : 35;

  return {
    id: 'cost-alert',
    type: 'Cost Alert',
    reportType: 'cost',
    severity,
    borderColor: negativeMarginArticles.length > 0 ? 'red' : 'amber',
    frequency: 'triggered',
    title: `${negativeMarginArticles.length} articles at negative/near-zero margin`,
    summary: `${negativeMarginArticles.length} articles with <5% margin in current period. ${highMaterialCost.length} articles have material costs >45% of revenue. COGS ${costGrowth >= 0 ? 'grew' : 'declined'} ${Math.abs(costGrowth * 100).toFixed(1)}% YoY. ${negativeMarginArticles.length > 0 ? 'Supplier renegotiation or discontinuation recommended for worst performers.' : 'Cost regime stabilizing.'}`,
    detail: {
      title: `Cost Alert — ${negativeMarginArticles.length} Articles Below 5% Margin`,
      subtitle: `Articles where cost inflation has eroded margins to unsustainable levels.`,
      metrics: [
        { label: 'Near-Zero Margin', value: negativeMarginArticles.length, color: '#dc2626' },
        { label: 'High Material %', value: highMaterialCost.length, color: '#d97706' },
        { label: 'COGS YoY', value: `${costGrowth >= 0 ? '+' : ''}${(costGrowth * 100).toFixed(1)}%`, color: costGrowth > 0.05 ? '#dc2626' : '#10b981' },
      ],
      chartTitle: 'Annual COGS Trend',
      chartData: costByYear.map((y) => ({
        name: `FY${y.year}`,
        value: y.total_cogs,
      })),
      barColor: '#d97706',
      actions: [
        `Review ${negativeMarginArticles.length} articles below 5% margin — discontinue or reprice`,
        `Renegotiate supplier contracts for ${highMaterialCost.length} high material-cost articles`,
        'Evaluate make-vs-buy for outsourcing-heavy SKUs',
        'Set automated cost monitoring alerts for articles crossing 40% material threshold',
      ],
    },
    linkPage: '/products',
    linkLabel: 'Products & SKUs',
  };
}

function generateWinRateSignal() {
  const quarterly = pricingAnalysis.quarterly_win_rates ?? [];
  if (quarterly.length < 2) return null;

  const latest = quarterly[quarterly.length - 1];
  const prior = quarterly[quarterly.length - 2];
  const earliest = quarterly[0];

  const change = latest.overall - prior.overall;
  const isRecovery = change > 0.05;
  const isDecline = change < -0.05;

  // Find the trough (lowest point)
  const trough = quarterly.reduce((min, q) => q.overall < min.overall ? q : min, quarterly[0]);

  // Determine overall trend (latest vs earliest)
  const longTermChange = latest.overall - earliest.overall;

  const severity = isDecline ? 65 : isRecovery ? 45 : 30;
  const borderColor = isDecline ? 'red' : isRecovery ? 'green' : 'amber';

  return {
    id: 'win-rate-signal',
    type: 'Win Rate Signal',
    reportType: 'winrate',
    severity,
    borderColor,
    frequency: 'triggered',
    title: `Win rate ${isRecovery ? 'recovered to' : isDecline ? 'dropped to' : 'at'} ${pct(latest.overall)}% in ${latest.quarter}`,
    summary: `Win rate ${change >= 0 ? 'up' : 'down'} ${Math.abs(change * 100).toFixed(1)}pp to ${pct(latest.overall)}% in ${latest.quarter}. BKAES at ${pct(latest.bkaes)}%, BKAGG at ${pct(latest.bkagg)}%. ${isRecovery ? `Strongest recovery since trough of ${pct(trough.overall)}% in ${trough.quarter}.` : ''} Long-term trend: ${longTermChange >= 0 ? '+' : ''}${(longTermChange * 100).toFixed(1)}pp from ${earliest.quarter}.`,
    detail: {
      title: `Win Rate ${isRecovery ? 'Recovery' : isDecline ? 'Decline' : 'Update'} — ${pct(latest.overall)}%`,
      subtitle: `Quarterly win rate progression: ${pct(earliest.overall)}% (${earliest.quarter}) → ${pct(latest.overall)}% (${latest.quarter})`,
      metrics: [
        { label: 'Current', value: `${pct(latest.overall)}%`, color: latest.overall > 0.4 ? '#10b981' : '#dc2626' },
        { label: 'QoQ Change', value: `${change >= 0 ? '+' : ''}${(change * 100).toFixed(1)}pp`, color: change >= 0 ? '#10b981' : '#dc2626' },
        { label: 'Trough', value: `${pct(trough.overall)}% (${trough.quarter})`, color: '#d97706' },
      ],
      chartTitle: 'Quarterly Win Rate Trend',
      chartType: 'line',
      chartData: quarterly.map((q) => ({
        name: q.quarter.replace('20', "'"),
        overall: +(q.overall * 100).toFixed(1),
        bkaes: +(q.bkaes * 100).toFixed(1),
        bkagg: +(q.bkagg * 100).toFixed(1),
      })),
      chartSeries: [
        { key: 'overall', color: '#0393da', label: 'Overall' },
        { key: 'bkaes', color: '#10b981', label: 'BKAES' },
        { key: 'bkagg', color: '#e7a019', label: 'BKAGG' },
      ],
      barColor: '#0393da',
      actions: [
        isRecovery
          ? `Maintain momentum — win rate at ${pct(latest.overall)}%, best since ${trough.quarter} trough`
          : `Investigate win rate ${isDecline ? 'decline' : 'stagnation'} — ${pct(latest.overall)}%`,
        `BKAGG at ${pct(latest.bkagg)}% — ${latest.bkagg > latest.bkaes ? 'outperforming' : 'underperforming'} BKAES (${pct(latest.bkaes)}%)`,
        'Analyze lost deals by rejection code to identify pricing vs. product issues',
        'Compare win rates across margin bands to optimize pricing sweet spots',
      ],
    },
    linkPage: '/pricing',
    linkLabel: 'Pricing & FX',
  };
}

function generatePipelineAlert() {
  const stages = pipeline.pipeline_stages ?? [];
  const totalOpen = stages
    .filter((s) => s.stage !== 'Won' && s.stage !== 'Lost')
    .reduce((sum, s) => sum + s.value_eur, 0);
  const totalOpenCount = stages
    .filter((s) => s.stage !== 'Won' && s.stage !== 'Lost')
    .reduce((sum, s) => sum + s.count, 0);

  const quotedStage = stages.find((s) => s.stage === 'Quoted') || {};
  const negotiationStage = stages.find((s) => s.stage === 'Negotiation') || {};
  const overallWinRate = pricingAnalysis.overall_win_rate?.current ?? dashboard.quote_summary?.win_rate ?? 0;
  const avgDays = pipeline.avg_days_in_pipeline ?? 0;

  // Quarterly pipeline trend
  const quarterlyPipeline = pipeline.quarterly_pipeline ?? [];

  const severity = totalOpenCount > 100 ? 55 : 40;

  return {
    id: 'pipeline-alert',
    type: 'Pipeline Alert',
    reportType: 'pipeline',
    severity,
    borderColor: 'amber',
    frequency: 'weekly',
    title: `${formatEUR(totalOpen)} in open pipeline, ${totalOpenCount} active quotes`,
    summary: `${formatEUR(totalOpen)} in open pipeline across ${totalOpenCount} quotes. ${quotedStage.count ?? 0} quotes pending response (${formatEUR(quotedStage.value_eur ?? 0)}). ${negotiationStage.count ?? 0} in negotiation (${formatEUR(negotiationStage.value_eur ?? 0)}). Overall win rate: ${pct(overallWinRate)}%. Avg pipeline cycle: ${avgDays} days.`,
    detail: {
      title: `Pipeline Overview — ${formatEUR(totalOpen)} Open Value`,
      subtitle: `${totalOpenCount} active deals across all stages. Average cycle: ${avgDays} days.`,
      metrics: [
        { label: 'Open Pipeline', value: formatEUR(totalOpen), color: '#0393da' },
        { label: 'Win Rate', value: `${pct(overallWinRate)}%`, color: overallWinRate > 0.4 ? '#10b981' : '#d97706' },
        { label: 'Avg Cycle', value: `${avgDays} days`, color: avgDays > 60 ? '#d97706' : '#0393da' },
      ],
      chartTitle: 'Pipeline by Stage',
      chartData: stages
        .filter((s) => s.stage !== 'Won' && s.stage !== 'Lost')
        .map((s) => ({ name: s.stage, value: s.value_eur })),
      horizontal: true,
      barColor: '#0393da',
      actions: [
        `Accelerate ${negotiationStage.count ?? 0} deals in Negotiation — highest conversion probability`,
        `Follow up on ${quotedStage.count ?? 0} Quoted deals (${formatEUR(quotedStage.value_eur ?? 0)}) — prevent pipeline aging`,
        `Improve win rate from ${pct(overallWinRate)}% — target 45%`,
        `Reduce ${avgDays}-day average cycle by streamlining quote-to-close process`,
      ],
    },
    linkPage: '/pricing',
    linkLabel: 'Pricing & FX',
  };
}

// ── Main Feed Generator ──

export function generateIntelligenceFeed() {
  const reports = [
    generateWeeklyMarginBrief(),
    generatePricingActionSummary(),
    generateChurnEarlyWarnings(),
    generateCostAlerts(),
    generateWinRateSignal(),
    generatePipelineAlert(),
  ].filter(Boolean);

  // Sort by severity (highest first), then by report type for stable ordering
  reports.sort((a, b) => b.severity - a.severity);

  return reports;
}

/**
 * Get severity category for a report.
 * Maps to the feed ranking from the plan:
 *   1. critical (red)   — churn warning, cost alert with negative margin
 *   2. action   (orange) — pricing overdue, pipeline aging
 *   3. brief    (yellow) — weekly margin, pricing summary
 *   4. positive (green)  — win rate recovery, new revenue signals
 */
export function getSeverityCategory(report) {
  if (report.severity >= 75) return { level: 'critical', color: '#dc2626', label: 'Critical' };
  if (report.severity >= 55) return { level: 'action', color: '#f97316', label: 'Action Required' };
  if (report.severity >= 35) return { level: 'brief', color: '#eab308', label: 'Weekly Brief' };
  return { level: 'positive', color: '#10b981', label: 'Positive Signal' };
}
