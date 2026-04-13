/**
 * Intelligence Feed Engine
 *
 * Rule-based triggers that analyze static data files and produce
 * severity-ranked report objects for the AI Insights page.
 *
 * The generators take a `t` translation function so titles, summaries,
 * metric labels, and action items can be rendered in the active language.
 */

import dashboard from '../data/dashboard_data.json';
import customers from '../data/customers_detail.json';
import products from '../data/products.json';
import pipeline from '../data/pipeline.json';
import pricingAnalysis from '../data/pricing_analysis.json';
import cogs from '../data/cogs_detail.json';
import { formatEUR } from './formatters';

// ── Helpers ──

function pct(v) { return (v * 100).toFixed(1); }
function pp(v) { return (v * 100).toFixed(1); }
function yearRevenue(cust, year) { return cust.revenue_by_year?.[String(year)] ?? 0; }

// Identity fallback used when called from a non-React context (e.g. tests).
const identityT = (key) => key;

// ── Report Generators ──

function generateWeeklyMarginBrief(t) {
  const annual = dashboard.annual_summary;
  const latest = annual[annual.length - 1];
  const prior = annual.length > 1 ? annual[annual.length - 2] : null;

  if (!latest) return null;

  const currentMargin = latest.avg_db2_margin;
  const marginChange = prior ? (latest.avg_db2_margin - prior.avg_db2_margin) : 0;
  const revenueGrowth = latest.yoy_growth ?? 0;

  const commodities = [...dashboard.commodity_group_revenue].sort(
    (a, b) => a.avg_db2_margin - b.avg_db2_margin
  );
  const worstComm = commodities[0];
  const bestComm = commodities[commodities.length - 1];

  const belowFloor = products.products.filter(
    (p) => p.margin_2025 != null && p.margin_2025 < 0.45
  );

  let severity = 50;
  if (marginChange < -0.01) severity = 75;
  if (marginChange < -0.02) severity = 85;
  if (currentMargin < 0.55) severity = 90;

  const dirKey = marginChange < 0 ? 'feedReport.dir.down' : 'feedReport.dir.up';
  const verbKey = revenueGrowth >= 0 ? 'feedReport.verb.grew' : 'feedReport.verb.declined';
  const kindKey = marginChange < 0 ? 'feedReport.margin.detail.kind.decline' : 'feedReport.margin.detail.kind.increase';
  const ppValue = Math.abs(marginChange * 100).toFixed(1);

  return {
    id: 'weekly-margin-brief',
    type: t('feedReport.margin.type'),
    reportType: 'margin',
    severity,
    borderColor: marginChange < -0.005 ? 'red' : marginChange > 0.005 ? 'green' : 'amber',
    frequency: 'weekly',
    title: t('feedReport.margin.title', { pct: pct(currentMargin), dir: t(dirKey), pp: ppValue }),
    summary: t('feedReport.margin.summary', {
      pct: pct(currentMargin),
      dir: t(dirKey),
      pp: ppValue,
      worstGroup: worstComm.commodity_group,
      worstPct: pct(worstComm.avg_db2_margin),
      n: belowFloor.length,
      verb: t(verbKey),
      growth: Math.abs(revenueGrowth * 100).toFixed(1),
      revenue: formatEUR(latest.revenue_eur),
    }),
    detail: {
      title: t('feedReport.margin.detail.title', { pp: ppValue, kind: t(kindKey) }),
      subtitle: t('feedReport.margin.detail.subtitle', { pct: pct(currentMargin), year: latest.Year, first: pct(annual[0].avg_db2_margin) }),
      metrics: [
        { label: t('feedReport.margin.metric.current'), value: `${pct(currentMargin)}%`, color: currentMargin < 0.6 ? '#dc2626' : '#10b981' },
        { label: t('feedReport.margin.metric.yoy'), value: `${marginChange >= 0 ? '+' : ''}${(marginChange * 100).toFixed(1)}pp`, color: marginChange < 0 ? '#dc2626' : '#10b981' },
        { label: t('feedReport.margin.metric.belowFloor'), value: t('feedReport.margin.metric.belowFloor.value', { n: belowFloor.length }), color: belowFloor.length > 0 ? '#d97706' : '#10b981' },
      ],
      chartTitle: t('feedReport.margin.chartTitle'),
      chartData: annual.map((y) => ({
        name: `FY${y.Year}`,
        value: +(y.avg_db2_margin * 100).toFixed(1),
      })),
      barColor: '#0393da',
      actions: [
        t('feedReport.margin.action.1', { group: worstComm.commodity_group, pct: pct(worstComm.avg_db2_margin) }),
        t('feedReport.margin.action.2', { n: belowFloor.length }),
        t('feedReport.margin.action.3', { group: bestComm.commodity_group, pct: pct(bestComm.avg_db2_margin) }),
        t('feedReport.margin.action.4'),
      ],
    },
    linkPage: '/revenue',
    linkLabel: t('feedLink.revenue'),
  };
}

function generatePricingActionSummary(t) {
  const criticalArticles = products.products.filter(
    (p) => p.margin_2025 != null && p.margin_2025 < 0.30 && p.revenue_2025 > 0
  );
  const atRiskArticles = products.products.filter((p) => p.is_at_risk);

  const gapAnalysis = pricingAnalysis.gap_analysis;
  const overallGap = gapAnalysis?.overall?.mean_gap ?? 0;

  const persistentLosses = pricingAnalysis.persistent_losses?.top_10 ?? [];
  const totalLostRevenue = persistentLosses.reduce((s, p) => s + p.lost_revenue, 0);

  const pipelineStages = pipeline.pipeline_stages ?? [];
  const quotedStage = pipelineStages.find((s) => s.stage === 'Quoted') || {};

  const severity = criticalArticles.length > 5 ? 70 : criticalArticles.length > 0 ? 55 : 30;

  return {
    id: 'pricing-action-summary',
    type: t('feedReport.pricing.type'),
    reportType: 'pricing',
    severity,
    borderColor: criticalArticles.length > 5 ? 'red' : 'amber',
    frequency: 'weekly',
    title: t('feedReport.pricing.title', { n: criticalArticles.length + atRiskArticles.length }),
    summary: t('feedReport.pricing.summary', {
      crit: criticalArticles.length,
      atRisk: atRiskArticles.length,
      gap: pp(overallGap),
      lost: formatEUR(totalLostRevenue),
      qCount: quotedStage.count ?? 0,
      qValue: formatEUR(quotedStage.value_eur ?? 0),
    }),
    detail: {
      title: t('feedReport.pricing.detail.title', { n: criticalArticles.length }),
      subtitle: t('feedReport.pricing.detail.subtitle', { gap: pp(overallGap) }),
      metrics: [
        { label: t('feedReport.pricing.metric.crit'), value: criticalArticles.length, color: '#dc2626' },
        { label: t('feedReport.pricing.metric.atRisk'), value: atRiskArticles.length, color: '#d97706' },
        { label: t('feedReport.pricing.metric.lost'), value: formatEUR(totalLostRevenue), color: '#dc2626' },
      ],
      chartTitle: t('feedReport.pricing.chartTitle'),
      chartData: (pricingAnalysis.win_rate_by_margin_band ?? []).map((w) => ({
        name: w.band,
        value: +(w.win_rate * 100).toFixed(1),
      })),
      barColor: '#e7a019',
      actions: [
        t('feedReport.pricing.action.1', { n: criticalArticles.length }),
        t('feedReport.pricing.action.2', { n: atRiskArticles.length }),
        t('feedReport.pricing.action.3', { gap: pp(overallGap) }),
        t('feedReport.pricing.action.4', { n: quotedStage.count ?? 0, value: formatEUR(quotedStage.value_eur ?? 0) }),
      ],
    },
    linkPage: '/pricing',
    linkLabel: t('feedLink.pricing'),
  };
}

function generateChurnEarlyWarnings(t) {
  const allCustomers = customers.customers ?? [];
  const warnings = [];

  for (const cust of allCustomers) {
    const rev2022 = yearRevenue(cust, 2022);
    const rev2023 = yearRevenue(cust, 2023);
    const rev2024 = yearRevenue(cust, 2024);
    const rev2025 = yearRevenue(cust, 2025);
    const peakRev = Math.max(rev2022, rev2023);

    if (peakRev === 0) continue;

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

  warnings.sort((a, b) => (b.peakRev * b.dropPct) - (a.peakRev * a.dropPct));
  const topWarnings = warnings.slice(0, 5);

  if (topWarnings.length === 0) return null;

  const top = topWarnings[0];
  const totalLtvAtRisk = topWarnings.reduce((s, w) => s + w.ltv, 0);
  const severity = topWarnings.length >= 3 ? 85 : topWarnings.length >= 1 ? 70 : 40;

  return {
    id: 'churn-early-warning',
    type: t('feedReport.churn.type'),
    reportType: 'churn',
    severity,
    borderColor: 'red',
    frequency: 'triggered',
    title: t('feedReport.churn.title', { n: topWarnings.length }),
    summary: t('feedReport.churn.summary', {
      name: top.name,
      drop: (top.dropPct * 100).toFixed(0),
      peak: formatEUR(top.peakRev),
      latest: formatEUR(top.latestRev),
      wr: pct(top.winRate),
      n: topWarnings.length,
      ltv: formatEUR(totalLtvAtRisk),
    }),
    detail: {
      title: t('feedReport.churn.detail.title', { n: topWarnings.length }),
      subtitle: t('feedReport.churn.detail.subtitle'),
      metrics: [
        { label: t('feedReport.churn.metric.flagged'), value: topWarnings.length, color: '#dc2626' },
        { label: t('feedReport.churn.metric.ltv'), value: formatEUR(totalLtvAtRisk), color: '#dc2626' },
        { label: t('feedReport.churn.metric.worst'), value: `${(top.dropPct * 100).toFixed(0)}%`, color: '#dc2626' },
      ],
      chartTitle: t('feedReport.churn.chartTitle'),
      chartData: topWarnings.map((w) => ({
        name: w.customerId,
        value: w.peakRev,
        current: w.latestRev,
      })),
      barColor: '#dc2626',
      dataColumns: [
        { key: 'customerId', label: t('feedReport.churn.col.customer') },
        { key: 'peakRev', label: t('feedReport.churn.col.peak'), render: (v) => formatEUR(v) },
        { key: 'latestRev', label: t('feedReport.churn.col.current'), render: (v) => formatEUR(v) },
        { key: 'dropPct', label: t('feedReport.churn.col.decline'), render: (v) => `${(v * 100).toFixed(0)}%` },
        { key: 'riskTier', label: t('feedReport.churn.col.tier') },
      ],
      dataRows: topWarnings,
      actions: [
        t('feedReport.churn.action.1', { name: top.name, drop: (top.dropPct * 100).toFixed(0) }),
        t('feedReport.churn.action.2', { n: topWarnings.length }),
        t('feedReport.churn.action.3'),
        t('feedReport.churn.action.4', { ltv: formatEUR(totalLtvAtRisk) }),
      ],
    },
    linkPage: '/customers',
    linkLabel: t('feedLink.customers'),
    churnCustomers: topWarnings,
  };
}

function generateCostAlerts(t) {
  const negativeMarginArticles = products.products.filter(
    (p) => p.margin_2025 != null && p.margin_2025 < 0.05 && p.revenue_2025 > 0
  );

  const highMaterialCost = products.products.filter(
    (p) => p.material_pct > 0.45 && p.revenue_2025 > 0
  );

  const costByYear = cogs.cost_by_year ?? [];
  const latestCost = costByYear[costByYear.length - 1];
  const priorCost = costByYear.length > 1 ? costByYear[costByYear.length - 2] : null;
  const costGrowth = latestCost && priorCost
    ? (latestCost.total_cogs - priorCost.total_cogs) / priorCost.total_cogs
    : 0;

  const severity = negativeMarginArticles.length > 3 ? 80 : negativeMarginArticles.length > 0 ? 60 : 35;
  const verbKey = costGrowth >= 0 ? 'feedReport.verb.grew' : 'feedReport.verb.declined';
  const tailKey = negativeMarginArticles.length > 0 ? 'feedReport.cost.tail.action' : 'feedReport.cost.tail.stable';

  return {
    id: 'cost-alert',
    type: t('feedReport.cost.type'),
    reportType: 'cost',
    severity,
    borderColor: negativeMarginArticles.length > 0 ? 'red' : 'amber',
    frequency: 'triggered',
    title: t('feedReport.cost.title', { n: negativeMarginArticles.length }),
    summary: t('feedReport.cost.summary', {
      neg: negativeMarginArticles.length,
      high: highMaterialCost.length,
      verb: t(verbKey),
      growth: Math.abs(costGrowth * 100).toFixed(1),
      tail: t(tailKey),
    }),
    detail: {
      title: t('feedReport.cost.detail.title', { n: negativeMarginArticles.length }),
      subtitle: t('feedReport.cost.detail.subtitle'),
      metrics: [
        { label: t('feedReport.cost.metric.neg'), value: negativeMarginArticles.length, color: '#dc2626' },
        { label: t('feedReport.cost.metric.high'), value: highMaterialCost.length, color: '#d97706' },
        { label: t('feedReport.cost.metric.cogs'), value: `${costGrowth >= 0 ? '+' : ''}${(costGrowth * 100).toFixed(1)}%`, color: costGrowth > 0.05 ? '#dc2626' : '#10b981' },
      ],
      chartTitle: t('feedReport.cost.chartTitle'),
      chartData: costByYear.map((y) => ({
        name: `FY${y.year}`,
        value: y.total_cogs,
      })),
      barColor: '#d97706',
      actions: [
        t('feedReport.cost.action.1', { n: negativeMarginArticles.length }),
        t('feedReport.cost.action.2', { n: highMaterialCost.length }),
        t('feedReport.cost.action.3'),
        t('feedReport.cost.action.4'),
      ],
    },
    linkPage: '/products',
    linkLabel: t('feedLink.products'),
  };
}

function generateWinRateSignal(t) {
  const quarterly = pricingAnalysis.quarterly_win_rates ?? [];
  if (quarterly.length < 2) return null;

  const latest = quarterly[quarterly.length - 1];
  const prior = quarterly[quarterly.length - 2];
  const earliest = quarterly[0];

  const change = latest.overall - prior.overall;
  const isRecovery = change > 0.05;
  const isDecline = change < -0.05;

  const trough = quarterly.reduce((min, q) => q.overall < min.overall ? q : min, quarterly[0]);
  const longTermChange = latest.overall - earliest.overall;

  const severity = isDecline ? 65 : isRecovery ? 45 : 30;
  const borderColor = isDecline ? 'red' : isRecovery ? 'green' : 'amber';

  const titleKey = isRecovery
    ? 'feedReport.winrate.title.recovery'
    : isDecline ? 'feedReport.winrate.title.decline' : 'feedReport.winrate.title.flat';
  const detailTitleKey = isRecovery
    ? 'feedReport.winrate.detail.title.recovery'
    : isDecline ? 'feedReport.winrate.detail.title.decline' : 'feedReport.winrate.detail.title.flat';
  const dirKey = change >= 0 ? 'feedReport.dir.up' : 'feedReport.dir.down';

  return {
    id: 'win-rate-signal',
    type: t('feedReport.winrate.type'),
    reportType: 'winrate',
    severity,
    borderColor,
    frequency: 'triggered',
    title: t(titleKey, { pct: pct(latest.overall), q: latest.quarter }),
    summary: t('feedReport.winrate.summary', {
      dir: t(dirKey),
      pp: Math.abs(change * 100).toFixed(1),
      pct: pct(latest.overall),
      q: latest.quarter,
      bkaes: pct(latest.bkaes),
      bkagg: pct(latest.bkagg),
      tail: isRecovery ? t('feedReport.winrate.tail.recovery', { pct: pct(trough.overall), q: trough.quarter }) : '',
      ltSign: longTermChange >= 0 ? '+' : '',
      lt: (longTermChange * 100).toFixed(1),
      first: earliest.quarter,
    }),
    detail: {
      title: t(detailTitleKey, { pct: pct(latest.overall) }),
      subtitle: t('feedReport.winrate.detail.subtitle', {
        firstPct: pct(earliest.overall),
        firstQ: earliest.quarter,
        pct: pct(latest.overall),
        q: latest.quarter,
      }),
      metrics: [
        { label: t('feedReport.winrate.metric.current'), value: `${pct(latest.overall)}%`, color: latest.overall > 0.4 ? '#10b981' : '#dc2626' },
        { label: t('feedReport.winrate.metric.qoq'), value: `${change >= 0 ? '+' : ''}${(change * 100).toFixed(1)}pp`, color: change >= 0 ? '#10b981' : '#dc2626' },
        { label: t('feedReport.winrate.metric.trough'), value: t('feedReport.winrate.metric.trough.value', { pct: pct(trough.overall), q: trough.quarter }), color: '#d97706' },
      ],
      chartTitle: t('feedReport.winrate.chartTitle'),
      chartType: 'line',
      chartData: quarterly.map((q) => ({
        name: q.quarter.replace('20', "'"),
        overall: +(q.overall * 100).toFixed(1),
        bkaes: +(q.bkaes * 100).toFixed(1),
        bkagg: +(q.bkagg * 100).toFixed(1),
      })),
      chartSeries: [
        { key: 'overall', color: '#0393da', label: t('feedReport.winrate.legend.overall') },
        { key: 'bkaes', color: '#10b981', label: 'BKAES' },
        { key: 'bkagg', color: '#e7a019', label: 'BKAGG' },
      ],
      barColor: '#0393da',
      actions: [
        isRecovery
          ? t('feedReport.winrate.action.recovery', { pct: pct(latest.overall), q: trough.quarter })
          : isDecline
            ? t('feedReport.winrate.action.investigate.decline', { pct: pct(latest.overall) })
            : t('feedReport.winrate.action.investigate.flat', { pct: pct(latest.overall) }),
        latest.bkagg > latest.bkaes
          ? t('feedReport.winrate.action.bkagg.out', { bkagg: pct(latest.bkagg), bkaes: pct(latest.bkaes) })
          : t('feedReport.winrate.action.bkagg.under', { bkagg: pct(latest.bkagg), bkaes: pct(latest.bkaes) }),
        t('feedReport.winrate.action.3'),
        t('feedReport.winrate.action.4'),
      ],
    },
    linkPage: '/pricing',
    linkLabel: t('feedLink.pricing'),
  };
}

function generatePipelineAlert(t) {
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

  const severity = totalOpenCount > 100 ? 55 : 40;

  return {
    id: 'pipeline-alert',
    type: t('feedReport.pipeline.type'),
    reportType: 'pipeline',
    severity,
    borderColor: 'amber',
    frequency: 'weekly',
    title: t('feedReport.pipeline.title', { value: formatEUR(totalOpen), n: totalOpenCount }),
    summary: t('feedReport.pipeline.summary', {
      value: formatEUR(totalOpen),
      n: totalOpenCount,
      qn: quotedStage.count ?? 0,
      qv: formatEUR(quotedStage.value_eur ?? 0),
      nn: negotiationStage.count ?? 0,
      nv: formatEUR(negotiationStage.value_eur ?? 0),
      wr: pct(overallWinRate),
      days: avgDays,
    }),
    detail: {
      title: t('feedReport.pipeline.detail.title', { value: formatEUR(totalOpen) }),
      subtitle: t('feedReport.pipeline.detail.subtitle', { n: totalOpenCount, days: avgDays }),
      metrics: [
        { label: t('feedReport.pipeline.metric.open'), value: formatEUR(totalOpen), color: '#0393da' },
        { label: t('feedReport.pipeline.metric.wr'), value: `${pct(overallWinRate)}%`, color: overallWinRate > 0.4 ? '#10b981' : '#d97706' },
        { label: t('feedReport.pipeline.metric.cycle'), value: t('feedReport.pipeline.metric.cycle.value', { n: avgDays }), color: avgDays > 60 ? '#d97706' : '#0393da' },
      ],
      chartTitle: t('feedReport.pipeline.chartTitle'),
      chartData: stages
        .filter((s) => s.stage !== 'Won' && s.stage !== 'Lost')
        .map((s) => ({ name: s.stage, value: s.value_eur })),
      horizontal: true,
      barColor: '#0393da',
      actions: [
        t('feedReport.pipeline.action.1', { n: negotiationStage.count ?? 0 }),
        t('feedReport.pipeline.action.2', { n: quotedStage.count ?? 0, value: formatEUR(quotedStage.value_eur ?? 0) }),
        t('feedReport.pipeline.action.3', { pct: pct(overallWinRate) }),
        t('feedReport.pipeline.action.4', { days: avgDays }),
      ],
    },
    linkPage: '/pricing',
    linkLabel: t('feedLink.pricing'),
  };
}

// ── Main Feed Generator ──

export function generateIntelligenceFeed(tArg) {
  const t = tArg || identityT;
  const reports = [
    generateWeeklyMarginBrief(t),
    generatePricingActionSummary(t),
    generateChurnEarlyWarnings(t),
    generateCostAlerts(t),
    generateWinRateSignal(t),
    generatePipelineAlert(t),
  ].filter(Boolean);

  reports.sort((a, b) => b.severity - a.severity);

  return reports;
}

/**
 * Get severity category for a report. Accepts a `t` function so the label
 * can be translated. Falls back to English if no translator is provided.
 */
export function getSeverityCategory(report, tArg) {
  const t = tArg || identityT;
  if (report.severity >= 75) return { level: 'critical', color: '#dc2626', label: t('feedSeverity.critical') };
  if (report.severity >= 55) return { level: 'action', color: '#f97316', label: t('feedSeverity.action') };
  if (report.severity >= 35) return { level: 'brief', color: '#eab308', label: t('feedSeverity.brief') };
  return { level: 'positive', color: '#10b981', label: t('feedSeverity.positive') };
}
