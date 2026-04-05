import dashboard from '../data/dashboard_data.json';
import forecasting from '../data/forecasting.json';
import products from '../data/products.json';
import customers from '../data/customers_detail.json';
import inventoryDetail from '../data/inventory_detail.json';
import pipeline from '../data/pipeline.json';
import priceGov from '../data/price_governance.json';
import monthly from '../data/monthly_detail.json';
import pricingAnalysis from '../data/pricing_analysis.json';
import mlAnalytics from '../data/ml_analytics.json';
import cogs from '../data/cogs_detail.json';

function fmt(v) { return typeof v === 'number' ? v.toLocaleString('en', { maximumFractionDigits: 2 }) : v; }

// Annual summary
const annualStr = dashboard.annual_summary.map(y =>
  `${y.Year}: Revenue €${fmt(y.revenue_eur)}, Invoices ${y.invoices}, Customers ${y.unique_customers}, Avg DB2 Margin ${(y.avg_db2_margin * 100).toFixed(1)}%${y.yoy_growth != null ? `, YoY ${(y.yoy_growth * 100).toFixed(1)}%` : ''}`
).join('\n');

// Commodity group revenue
const commStr = dashboard.commodity_group_revenue.map(c =>
  `${c.commodity_group} (${c.description}): €${fmt(c.revenue_eur)} (${c.invoices} invoices, margin ${(c.avg_db2_margin * 100).toFixed(1)}%)`
).join('\n');

// Risk distribution
const riskStr = dashboard.risk_distribution.map(r =>
  `${r.tier}: ${r.count} (${(r.pct * 100).toFixed(1)}%), avg score ${r.avg_score.toFixed(2)}`
).join('\n');

// Top customers from dashboard
const topCustStr = dashboard.top_customers.map(c =>
  `${c.name}: €${fmt(c.revenue_eur)}, margin ${(c.db2_margin_avg * 100).toFixed(1)}%, ${c.invoice_count} invoices, ${c.risk_tier} risk`
).join('\n');

// Quote summary
const qs = dashboard.quote_summary;
const quoteStr = `Total quotes: ${qs.total_quotes}, Won: ${qs.won}, Lost: ${qs.lost}, Win rate: ${(qs.win_rate * 100).toFixed(1)}%, Won revenue: €${fmt(qs.won_revenue_eur)}, Lost revenue: €${fmt(qs.lost_revenue_eur)}`;

// Monthly totals (from monthly_detail — array of monthly records)
const monthlyArr = Array.isArray(monthly) ? monthly : [];
const monthlyTotalsStr = monthlyArr.map(m =>
  `${m.month_label}: rev €${fmt(m.revenue_eur)}, DB1 ${(m.db1_margin * 100).toFixed(1)}%, DB2 ${(m.db2_margin * 100).toFixed(1)}%, ${m.invoices} inv, ${m.unique_customers} cust`
).join('\n');

// Products: top 20 by total revenue + commodity group aggregates
const sortedProducts = [...products.products].sort((a, b) => b.total_revenue - a.total_revenue);
const top20Products = sortedProducts.slice(0, 20).map(p =>
  `${p.article_id} ${p.description} [${p.commodity_group}]: total rev €${fmt(p.total_revenue)}, units ${p.total_units}, margins ${(p.margin_2022 * 100).toFixed(0)}%→${(p.margin_2023 * 100).toFixed(0)}%→${(p.margin_2024 * 100).toFixed(0)}%→${(p.margin_2025 * 100).toFixed(0)}%, trend ${p.margin_trend}, at_risk: ${p.is_at_risk}`
).join('\n');

const commAgg = {};
products.products.forEach(p => {
  if (!commAgg[p.commodity_group]) commAgg[p.commodity_group] = { count: 0, rev: 0, units: 0 };
  commAgg[p.commodity_group].count++;
  commAgg[p.commodity_group].rev += p.total_revenue;
  commAgg[p.commodity_group].units += p.total_units;
});
const commAggStr = Object.entries(commAgg).map(([k, v]) =>
  `${k}: ${v.count} articles, €${fmt(v.rev)} total, ${v.units} units`
).join('\n');

// Customers: top 20 by LTV + segment counts
const sortedCust = [...customers.customers].sort((a, b) => b.ltv_estimated - a.ltv_estimated);
const top20Cust = sortedCust.slice(0, 20).map(c =>
  `${c.customer_id} ${c.name}: LTV €${fmt(c.ltv_estimated)}, ${c.segment}, risk ${c.risk_tier} (${c.risk_score.toFixed(2)}), rev €${fmt(c.total_revenue_eur)}, margin ${(c.avg_db2_margin * 100).toFixed(1)}%, win rate ${(c.win_rate * 100).toFixed(0)}%`
).join('\n');

const segStr = customers.segments.map(s =>
  `${s.segment}: ${s.count} customers, €${fmt(s.total_revenue)} revenue, avg margin ${(s.avg_margin * 100).toFixed(1)}%`
).join('\n');

const churnStr = customers.churn_summary.map(c =>
  `${c.risk_level}: ${c.count} customers, LTV €${fmt(c.total_ltv)}`
).join('\n');

// Cost/Inventory detail
const costSummaryStr = `Avg HKVoll change 2022-2024: ${(inventoryDetail.cost_summary.avg_hkvoll_change_2022_2024 * 100).toFixed(1)}%, 2024-2025: ${(inventoryDetail.cost_summary.avg_hkvoll_change_2024_2025 * 100).toFixed(1)}%\nRegime: ${inventoryDetail.cost_summary.regime_note}\nTop cost risers: ${inventoryDetail.cost_summary.top_cost_risers}, Cost stable: ${inventoryDetail.cost_summary.cost_stable}`;

const costByYearStr = cogs.cost_by_year.map(y =>
  `${y.year}: total €${fmt(y.total_cogs)}, material €${fmt(y.material)}, labor €${fmt(y.labor)}, outsourcing €${fmt(y.outsourcing)}, overhead €${fmt(y.overhead)}`
).join('\n');

const costByCommStr = cogs.cost_by_commodity.map(c =>
  `${c.commodity_group}: avg HKVoll €${fmt(c.avg_hkvoll)}, material ${(c.material_pct * 100).toFixed(0)}%, labor ${(c.labor_pct * 100).toFixed(0)}%, outsourcing ${(c.outsourcing_pct * 100).toFixed(0)}%`
).join('\n');

// Pipeline
const pipeStageStr = pipeline.pipeline_stages.map(s =>
  `${s.stage}: ${s.count} deals, €${fmt(s.value_eur)}`
).join('\n');

const pipeCommStr = pipeline.pipeline_by_commodity.map(c =>
  `${c.commodity_group}: ${c.won} won, ${c.lost} lost, ${c.negotiation} in negotiation, €${fmt(c.total_value)} total`
).join('\n');

const funnelStr = pipeline.conversion_funnel.map(f =>
  `${f.from_stage} → ${f.to_stage}: ${(f.conversion_rate * 100).toFixed(1)}% (${f.count})`
).join('\n');

// Forecasting
const fcOverall = forecasting.overall_forecast;
const fcOverallStr = `Current margin: ${(fcOverall.current_margin * 100).toFixed(1)}%\n3m forecast: ${(fcOverall.forecast_3m.predicted * 100).toFixed(1)}% [${(fcOverall.forecast_3m.lower * 100).toFixed(1)}–${(fcOverall.forecast_3m.upper * 100).toFixed(1)}%]\n6m forecast: ${(fcOverall.forecast_6m.predicted * 100).toFixed(1)}% [${(fcOverall.forecast_6m.lower * 100).toFixed(1)}–${(fcOverall.forecast_6m.upper * 100).toFixed(1)}%]\n12m forecast: ${(fcOverall.forecast_12m.predicted * 100).toFixed(1)}% [${(fcOverall.forecast_12m.lower * 100).toFixed(1)}–${(fcOverall.forecast_12m.upper * 100).toFixed(1)}%]`;

const fcCommStr = forecasting.commodity_forecasts.map(f =>
  `${f.commodity_group}: current ${(f.current_margin * 100).toFixed(1)}%, 3m ${(f.forecast_3m * 100).toFixed(1)}%, 6m ${(f.forecast_6m * 100).toFixed(1)}%, 12m ${(f.forecast_12m * 100).toFixed(1)}%`
).join('\n');

const fcModelStr = forecasting.model_accuracy.map(m =>
  `${m.model}: MAE ${m.mae.toFixed(3)}, RMSE ${m.rmse.toFixed(3)}, directional accuracy ${(m.directional_accuracy * 100).toFixed(0)}%`
).join('\n');

const mcStr = Object.entries(forecasting.monte_carlo).map(([k, v]) =>
  `${k}: mean ${(v.mean * 100).toFixed(1)}%, median ${(v.median * 100).toFixed(1)}%, P5 ${(v.p5 * 100).toFixed(1)}%, P95 ${(v.p95 * 100).toFixed(1)}%, P(below 50%) = ${(v.prob_below_50pct * 100).toFixed(1)}%`
).join('\n');

// Pricing Analysis
const pa = pricingAnalysis;
const gapStr = `Overall gap: mean ${(pa.gap_analysis.overall.mean_gap * 100).toFixed(1)}%, median ${(pa.gap_analysis.overall.median_gap * 100).toFixed(1)}%, linked records: ${pa.gap_analysis.overall.linked_records}\n` +
  pa.gap_analysis.by_year.map(y =>
    `${y.year}: quoted margin ${(y.avg_quoted_margin * 100).toFixed(1)}%, actual margin ${(y.avg_actual_margin * 100).toFixed(1)}%, gap ${(y.gap * 100).toFixed(1)}% (${y.count} records)`
  ).join('\n');

const catVsQuotedStr = `Catalog margin avg: ${(pa.catalog_vs_quoted.catalog_margin_avg * 100).toFixed(1)}%, Quoted margin avg: ${(pa.catalog_vs_quoted.quoted_margin_avg * 100).toFixed(1)}%, Catalog % revenue: ${(pa.catalog_vs_quoted.catalog_pct_revenue * 100).toFixed(0)}%, Quoted % revenue: ${(pa.catalog_vs_quoted.quoted_pct_revenue * 100).toFixed(0)}%`;

const winRateStr = pa.win_rate_by_margin_band.map(w =>
  `${w.band}: win rate ${(w.win_rate * 100).toFixed(0)}% (${w.count} deals)`
).join('\n');

const rejectionStr = pa.rejection_codes.map(r =>
  `${r.code} (${r.description}): ${r.count} deals, €${fmt(r.revenue_lost)} lost (${(r.pct_of_lost * 100).toFixed(0)}%)`
).join('\n');

const sensStr = `Won avg margin: ${(pa.price_sensitivity.won_avg_margin * 100).toFixed(1)}%, Lost avg margin: ${(pa.price_sensitivity.lost_avg_margin * 100).toFixed(1)}%, Diff: ${(pa.price_sensitivity.margin_diff * 100).toFixed(1)}pp, p-value: ${pa.price_sensitivity.p_value}, Significant: ${pa.price_sensitivity.significant}`;

// Price governance
const govRulesStr = priceGov.price_rules.map(r =>
  `${r.rule} — Status: ${r.status}, Violations: ${r.violations}`
).join('\n');

const govHistStr = priceGov.price_history.map(h =>
  `${h.year}: list €${fmt(h.avg_list_price)}, quoted €${fmt(h.avg_quoted_price)}, discount ${(h.avg_discount_pct * 100).toFixed(1)}%`
).join('\n');

const govTimingStr = `Conversion timing: mean ${priceGov.conversion_timing.mean_days}d, median ${priceGov.conversion_timing.median_days}d, P25 ${priceGov.conversion_timing.p25_days}d, P75 ${priceGov.conversion_timing.p75_days}d`;

// ML Analytics
const ml = mlAnalytics;
const mlChurnStr = `Model: ${ml.churn_prediction.model}, Accuracy: ${(ml.churn_prediction.accuracy * 100).toFixed(0)}%, Total at risk: ${ml.churn_prediction.total_at_risk}, High-value at risk: ${ml.churn_prediction.high_value_at_risk}, Revenue at risk: €${fmt(ml.churn_prediction.revenue_at_risk_eur)}`;

const mlMarginStr = Object.entries(ml.margin_classification).map(([k, v]) =>
  `${k}: ${v.count} articles, avg margin ${(v.avg_margin * 100).toFixed(0)}%, ${(v.revenue_pct * 100).toFixed(0)}% of revenue`
).join('\n');

const mlAnomalyStr = `Total anomalies: ${ml.anomaly_detection.total_anomalies}\n` +
  ml.anomaly_detection.types.map(t => `${t.type}: ${t.count} (${t.severity})`).join('\n');

const mlBcgStr = ml.bcg_matrix.map(b =>
  `${b.commodity_group}: ${b.quadrant}, growth ${(b.growth * 100).toFixed(0)}%, margin ${(b.margin * 100).toFixed(0)}%, rev €${fmt(b.revenue)}`
).join('\n');

export const SYSTEM_PROMPT = `You are PRYZM AI, the analytics assistant for Scherzinger GmbH — German pump manufacturing company specializing in high-precision industrial pumps. You analyze sales, margin, cost, pipeline, pricing, and forecasting data.

## Response Formatting Rules

1. **Use markdown formatting** — the UI renders it properly:
   - Use ## and ### for section headings
   - Use **bold** for emphasis on key numbers and names
   - Use numbered lists (1. 2. 3.) for action steps and rankings
   - Use bullet lists (- item) for observations and key points

2. **For tabular data, use markdown tables** with this format:
   | Column A | Column B | Column C |
   |---|---|---|
   | Data 1 | Data 2 | Data 3 |

3. **Keep tables concise** — max 10 rows. If more data, show top entries and summarize the rest.

4. **Use € for all currency values**. Format large numbers as €1.29M, €302K, etc.

5. **Structure longer responses** with clear sections using headings, not walls of text.

6. **Charts** — ALWAYS include a chart when the question involves data comparison, trends, or distribution. Output exactly ONE chart block per response in this format:

\`\`\`chart
{"type":"bar","title":"Chart Title","data":[{"name":"A","value":100},{"name":"B","value":200}],"xKey":"name","yKey":"value"}
\`\`\`

**Pick the RIGHT chart type:**
- **bar** — for comparing values across categories (revenue by commodity group, customer comparison). Default for "show me X by Y" questions.
- **line** — for time-series and trends (monthly revenue, margin trends, forecast). Use whenever data has a time dimension.
- **pie** — for showing composition/share (revenue split, customer segments, pipeline by stage). Use when showing % breakdown.

Chart formatting rules:
- Keep "name" values SHORT (max 8 chars) — abbreviate (e.g. "BKAES" not "Electric Gear Pumps", "Jan '25" not "January 2025")
- Keep data arrays between 4-12 items (not too few, not too many)
- Use raw numbers for values (not strings) — the chart auto-formats to €K/€M
- For line charts with multiple series: {"type":"line","title":"...","data":[{"name":"Jan","revenue":100,"cogs":60}],"xKey":"name","series":[{"key":"revenue","color":"#3B82F6"},{"key":"cogs","color":"#EF4444"}]}
- For pie charts: {"type":"pie","title":"...","data":[{"name":"Seg A","value":400}]}
- Place the chart block AFTER your text analysis, not before it

**Chart type examples:**
- "Revenue by commodity group" → **bar** chart
- "Monthly revenue trend" → **line** chart
- "Customer segment distribution" → **pie** chart
- "Forecast vs actuals" → **line** chart with 2 series
- "Pipeline by stage" → **pie** chart
- "Margin trend over time" → **line** chart

7. **End with actionable recommendations** — numbered steps the user can take.

=== ANNUAL SUMMARY ===
${annualStr}

=== COMMODITY GROUP REVENUE ===
${commStr}

=== RISK DISTRIBUTION ===
${riskStr}

=== TOP CUSTOMERS ===
${topCustStr}

=== QUOTE SUMMARY ===
${quoteStr}

=== MONTHLY REVENUE (2022-2025, 48 months) ===
${monthlyTotalsStr}

=== PRODUCT CATALOG (Top 20 by revenue) ===
${top20Products}

=== COMMODITY GROUP AGGREGATES ===
${commAggStr}

=== CUSTOMER DETAIL (Top 20 by LTV) ===
${top20Cust}

=== CUSTOMER SEGMENTS ===
${segStr}

=== CHURN SUMMARY ===
${churnStr}

=== COST SUMMARY ===
${costSummaryStr}

=== COST BY YEAR ===
${costByYearStr}

=== COST BY COMMODITY GROUP ===
${costByCommStr}

=== PIPELINE BY STAGE ===
${pipeStageStr}
Avg deal: €${fmt(pipeline.avg_deal_value)}, Avg days in pipeline: ${pipeline.avg_days_in_pipeline}

=== PIPELINE BY COMMODITY ===
${pipeCommStr}

=== CONVERSION FUNNEL ===
${funnelStr}

=== MARGIN FORECAST ===
${fcOverallStr}

=== COMMODITY MARGIN FORECASTS ===
${fcCommStr}

=== FORECAST MODEL ACCURACY ===
${fcModelStr}

=== MONTE CARLO SIMULATION ===
${mcStr}

=== PRICING GAP ANALYSIS ===
${gapStr}

=== CATALOG vs QUOTED ===
${catVsQuotedStr}

=== WIN RATE BY MARGIN BAND ===
${winRateStr}

=== REJECTION CODES ===
${rejectionStr}

=== PRICE SENSITIVITY ===
${sensStr}

=== PRICE GOVERNANCE RULES ===
${govRulesStr}

=== PRICE HISTORY ===
${govHistStr}

=== ${govTimingStr} ===

=== ML ANALYTICS — CHURN PREDICTION ===
${mlChurnStr}

=== ML ANALYTICS — MARGIN CLASSIFICATION ===
${mlMarginStr}

=== ML ANALYTICS — ANOMALY DETECTION ===
${mlAnomalyStr}

=== ML ANALYTICS — BCG MATRIX ===
${mlBcgStr}

## Pricing Intelligence Instructions
- When answering pricing questions, reference margin bands, win rates, gap analysis, and governance rules.
- For any recommendation, end with a numbered action plan: (a) specific action, (b) priority level, (c) timeline, (d) estimated impact in €.
- Default to including a chart unless the question is purely factual.
- Available chart types: bar, line, pie, area, scatter.
- **area** — for revenue/margin trends with gradient fill (use for trajectory, cumulative views).
- **scatter** — for correlations (risk vs revenue, margin vs win rate). Use xKey/yKey as numeric field names.
`;
