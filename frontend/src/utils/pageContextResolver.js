import { getSKUDetail } from './skuDetailEngine';
import { formatEUR } from './formatters';

const ROUTE_META = {
  '/':            { name: 'Dashboard Overview', focus: 'aggregated KPIs, annual trends, category breakdown' },
  '/revenue':     { name: 'Revenue & Margins', focus: 'revenue trends, margin analysis, YoY comparisons' },
  '/products':    { name: 'Products & Articles', focus: 'article-level performance, margin by article' },
  '/customers':   { name: 'Customers', focus: 'segmentation, churn risk, purchase patterns' },
  '/forecasting': { name: 'Forecasting', focus: 'FY26 forecast, model predictions, confidence intervals' },
  '/pricing':     { name: 'Pricing Command Center', focus: 'pricing recommendations, FX sensitivity' },
  '/inventory':   { name: 'Inventory & Costs', focus: 'cost trends, material/labor breakdown, cost optimization' },
  '/ml-analytics':{ name: 'ML Analytics', focus: 'BCG matrix, demand forecasts, portfolio analysis' },
};

function buildSKUSummary(skuCode) {
  if (!skuCode) return null;
  try {
    const detail = getSKUDetail(skuCode);
    if (!detail) return null;
    const parts = [
      `Article ${skuCode}`,
      detail.description && `"${detail.description}"`,
      detail.commodity_group && `Commodity Group: ${detail.commodity_group}`,
      detail.currentMargin != null && `Margin: ${(detail.currentMargin * 100).toFixed(1)}%`,
      detail.totalRevenue != null && `Revenue: ${formatEUR(detail.totalRevenue)}`,
      detail.costTrendDirection && `Cost Trend: ${detail.costTrendDirection}`,
    ].filter(Boolean);
    return parts.join(' | ');
  } catch { return null; }
}

// Helper for Bar/Area onClick — Recharts v3 gives (data, index, event) where data.payload is the row
export function handleChartClick(chartTitle, selectItem, data) {
  const payload = data?.payload;
  if (!payload) return;
  const label = payload.label || payload.name || payload.month || payload.stage || payload.range || payload.scenario || payload.segment || payload.model || chartTitle;
  selectItem({ type: 'chart', id: chartTitle, label: `${chartTitle}: ${label}`, data: payload });
}

// Helper for all chart container clicks — uses activeTooltipIndex to look up data from array
export function handleChartContainerClick(chartTitle, selectItem, dataArray, state) {
  const idx = state?.activeTooltipIndex;
  if (idx == null || !dataArray?.[idx]) return;
  const payload = dataArray[idx];
  const label = payload.label || payload.name || payload.month || payload.stage || payload.range || payload.scenario || payload.segment || payload.model || chartTitle;
  selectItem({ type: 'chart', id: chartTitle, label: `${chartTitle}: ${label}`, data: payload });
}

// Helper for Pie chart click — Pie onClick gives data directly, not wrapped in activePayload
export function handlePieClick(chartTitle, selectItem, data) {
  if (!data?.name) return;
  selectItem({ type: 'chart', id: chartTitle, label: `${chartTitle}: ${data.name}`, data });
}

// Helper for Scatter chart click
export function handleScatterClick(chartTitle, selectItem, data) {
  if (!data) return;
  const id = data.article_id || data.name || chartTitle;
  const label = data.name || data.article_id || chartTitle;
  selectItem({ type: data.article_id ? 'article' : 'chart', id, label: `${chartTitle}: ${label}`, data });
}

export function buildContextLabel(pathname, slideOver, selectedItem) {
  const route = ROUTE_META[pathname];
  const page = route?.name || pathname;
  if (slideOver?.type === 'sku' && slideOver.id) return `${page} · Article: ${slideOver.id}`;
  if (slideOver?.type === 'category' && slideOver.id) return `${page} · Commodity Group: ${slideOver.id}`;
  if (selectedItem?.label || selectedItem?.id) return `${page} · ${selectedItem.label || selectedItem.id}`;
  return page;
}

export function buildContextMessage(pathname, slideOver, selectedItem) {
  // No context injection on login or AI insights pages
  if (pathname === '/login' || pathname === '/ai-insights') return null;

  const route = ROUTE_META[pathname];
  const parts = [];

  if (route) {
    parts.push(`Current context: User is on the ${route.name} page (focus: ${route.focus}).`);
  } else {
    parts.push(`Current context: User is viewing ${pathname}.`);
  }

  if (slideOver?.type === 'sku' && slideOver.id) {
    const summary = buildSKUSummary(slideOver.id);
    parts.push(summary
      ? `The user is currently viewing article detail panel for: ${summary}. Answer questions about THIS specific article.`
      : `The user is currently viewing article detail panel for article ID "${slideOver.id}". Answer questions about THIS specific article.`);
  } else if (slideOver?.type === 'category' && slideOver.id) {
    parts.push(`The user is currently viewing commodity group detail panel for "${slideOver.id}". Answer questions about THIS commodity group.`);
  }

  // Selected item context (only when no slide-over is open — slide-over takes precedence)
  if (!slideOver?.type && selectedItem) {
    if ((selectedItem.type === 'sku' || selectedItem.type === 'article') && selectedItem.id) {
      const summary = buildSKUSummary(selectedItem.id);
      parts.push(summary
        ? `The user has selected/clicked on: ${summary}. Answer questions about THIS specific article.`
        : `The user has selected/clicked on article "${selectedItem.label || selectedItem.id}". Answer questions about THIS specific article.`);
    } else if (selectedItem.type === 'chart' && selectedItem.data) {
      const d = selectedItem.data;
      const dataStr = Object.entries(d).filter(([k, v]) => v != null && k !== 'fill' && k !== 'isShock' && k !== 'isDemandShock').map(([k, v]) => `${k}: ${v}`).join(', ');
      parts.push(`The user clicked on chart "${selectedItem.label}". Data point: {${dataStr}}. Answer questions about THIS data point.`);
    } else {
      const bits = [selectedItem.label || selectedItem.id];
      const d = selectedItem.data;
      if (d) {
        if (d.commodity_group) bits.push(`Commodity Group: ${d.commodity_group}`);
        if (d.segment) bits.push(`Segment: ${d.segment}`);
        if (d.risk_tier) bits.push(`Risk Tier: ${d.risk_tier}`);
        if (d.status) bits.push(`Status: ${d.status}`);
      }
      parts.push(`User has selected ${selectedItem.type}: ${bits.join(' | ')}.`);
    }
  }

  parts.push('Prioritize answers relevant to this context. If the user\'s question is clearly about something else, answer that instead.');

  return parts.join(' ');
}
