export const TOOLTIPS = {
  // Dashboard
  revenue_ytd: 'Total invoiced revenue for the calendar year to date, in EUR.',
  gross_margin: 'Average DB II margin across all transactions — (Revenue − HKvoll) / Revenue.',
  active_customers: 'Customers with at least one order in the selected period.',
  fy26_forecast_p50: 'Median (50th percentile) revenue forecast for FY 2026 based on ensemble model.',

  // Forecasting
  wmape: 'Weighted Mean Absolute Percentage Error — measures forecast accuracy weighted by actual revenue. Lower is better.',
  p10: 'Conservative estimate — 90% chance actual revenue will exceed this value.',
  p50: 'Best estimate (median) — equally likely to be above or below.',
  p90: 'Optimistic estimate — only 10% chance actual revenue exceeds this value.',
  p10_p90_range: 'The P10–P90 range represents 80% confidence. 10% chance below P10, 10% chance above P90.',
  models_tested: 'Number of distinct forecasting models evaluated during model selection.',
  pipeline_value: 'Total value of open pipeline deals excluding Won and Lost.',
  seasonal_index: 'Ratio of monthly revenue to average. >1 means above-average month, <1 means below.',
  shock_detection: 'Months where revenue deviated more than 2\u03c3 from trend, flagged as demand shocks.',

  // Cost Intelligence
  total_skus: 'Total number of unique article IDs (Artikelnummern) tracked in the system.',
  total_cogs: 'Total cost of goods sold (HKvoll) across all products for the period.',
  material_share: 'Percentage of total production cost attributable to raw materials.',
  labor_share: 'Percentage of total production cost attributable to labor (Fertigungseinzelkosten).',
  outsourcing_share: 'Percentage of total production cost from outsourced manufacturing steps.',
  hkvoll: 'Herstellkosten Voll — full manufacturing cost per unit including material, labor, outsourcing, and overhead.',
  hkvar: 'Herstellkosten Variabel — variable manufacturing cost per unit excluding fixed overhead.',
  fek: 'Fertigungseinzelkosten — direct manufacturing labor cost per unit.',
  fv: 'Fertigungsgemeinkosten — manufacturing overhead allocated per unit.',
  cost_trend: 'Direction of HKvoll cost change over the last 3 years — increasing, decreasing, or stable.',

  // Customers
  ltv: 'Customer Lifetime Value — total revenue attributed to this customer over the relationship.',
  enterprise_midmarket_pct: 'Share of total revenue contributed by Enterprise and Mid-Market segment customers.',
  churn_risk: 'ML-predicted likelihood the customer will stop purchasing. Based on RFM signals and inactivity.',
  avg_order_value: 'Average revenue per invoice across all customers.',
  rfm: 'Recency-Frequency-Monetary segmentation model used to classify customer health.',
  days_inactive: 'Number of days since the customer\'s last invoice.',
  customer_concentration: 'Revenue share held by the top 1% of customers — higher means more risk.',

  // Products
  margin_floor: 'Governance-mandated minimum DB II margin of 50%. SKUs below this need pricing action.',
  margin_target: 'Target DB II margin of 55%. SKUs between 50-55% are considered at-risk.',
  margin_trend: 'Direction of margin change over the last 3 years — up, down, or stable.',
  bcg_quadrant: 'Boston Consulting Group matrix position based on sales velocity and margin.',

  // Pricing & Quotes
  recovery_potential: 'Estimated margin uplift if all below-floor SKUs are brought to target margin.',
  margin_floor_breach: 'Number of SKUs currently below the 50% DB II margin governance floor.',
  governance_compliance: 'Percentage of transactions meeting the 50% margin floor governance rule.',
  cogs: 'Cost of Goods Sold (HKvoll) — full manufacturing cost including material, labor, outsourcing, and overhead.',
  cv: 'Coefficient of Variation — standard deviation / mean of selling prices. Higher = more inconsistent.',
  risk_score: 'Composite risk score (0-100) combining margin gap, cost trend, and volume.',
  reactive_vs_proactive: 'Reactive: already below floor. Proactive: trending toward floor or cost-exposed.',
  approval_level: 'Required approval authority based on pricing deviation from governance rules.',
  win_rate: 'Percentage of quotes converted to orders — Won / Total Quotes.',
  conversion_days: 'Average number of days from quote creation to order confirmation.',
  price_cost_gap: 'Difference between quoted margin and actual realized margin.',

  // ML Analytics
  churn_warnings: 'Number of customers flagged by ML churn model for proactive outreach.',
  revenue_at_risk: 'Total revenue from customers with high churn probability.',
  customer_segments: 'K-Means clustering output — groups customers by purchasing behavior.',
  abc_xyz: 'ABC (revenue rank) x XYZ (demand variability) classification for inventory and pricing.',
  clv: 'Customer Lifetime Value prediction using ML regression on historical transactions.',
  win_probability: 'ML-estimated likelihood of closing the deal, based on stage, age, and deal attributes.',

  // Column headers
  col_article_id: 'Unique article identifier (Artikelnummer) in the Scherzinger ERP system.',
  col_description: 'Product or article description.',
  col_commodity_group: 'Warengruppe — product commodity group classification.',
  col_hkvoll: 'Per-unit full manufacturing cost (HKvoll) in EUR.',
  col_db2_margin: 'DB II margin — (Revenue - HKvoll) / Revenue.',

  // Charts
  monthly_revenue_trend: 'Historical monthly revenue from 2022 to present.',
  commodity_revenue_mix: 'Revenue breakdown by Warengruppe (commodity group) for the period.',
  cost_breakdown: 'Distribution of manufacturing costs across material, labor, outsourcing, and overhead.',
  forecast_vs_actuals: '2025 actual revenue overlaid with FY 2026 forecast and P10/P90 confidence band.',
  monthly_forecast: 'FY 2026 month-by-month P50 forecast with P10 and P90 bounds.',
  seasonal_indices: 'Monthly seasonal multipliers — values >1 indicate above-average months.',
  commodity_forecasts: 'H1 2026 monthly revenue forecast broken down by commodity group.',
  model_comparison: 'Holdout and walk-forward wMAPE for each candidate forecast model.',
  revenue_margin_performance: 'Monthly revenue bars with DB II margin % line overlay.',
  margin_distribution: 'Histogram showing how SKU margins are distributed across ranges.',
  margin_gap: 'Difference between quoted margin (at deal won) and actual margin (at invoice). Revenue-weighted average across the selected period.',
  db1_margin: 'Deckungsbeitrag I — contribution margin before fixed manufacturing overhead. DB I minus fixed overhead = DB II.',
  quoted_vs_actual_trend: 'Quarterly quoted margin on won quotes vs. actual invoiced margin. Shaded band shows the leakage gap.',
  margin_by_commodity: 'DB II margin per commodity group (Warengruppe). Color: red <50%, amber 50-55%, green >60%.',
  db1_db2_breakdown: 'DB I and DB II margins side by side per commodity group. Gap = fixed overhead burden.',
  customer_margin_gaps: 'Customers with the largest gap between quoted and actual margin, ranked by € impact (Revenue × Gap).',
  skus_below_target: 'SKUs with margin below operational target (50%, warning) or emergency floor (25%, critical).',
  new_product_revenue: 'Revenue contribution from SKUs introduced in the last year, with monthly ramp trend.',
  product_type_performance: 'DB II margin by product type (Warenart). Cuts across commodity groups — product type often drives margin more than group.',
  commodity_scorecard: 'Summary metrics per commodity group: revenue, margin, win rate, SKU count, orders. Click a row to filter the page.',
  declining_fast: 'Articles with steepest YoY margin drop. 200832-E at 6.4% DB2 is losing on full-cost basis.',
  win_rate: 'Share of quotes converted to invoices for this article.',
  lost_revenue: 'Revenue from quotes that did not convert — implied opportunity size.',
  customer_count: 'Number of unique customers buying this SKU. Single-customer SKUs = concentration risk.',
  impact_eur: '(Target Margin − Actual Margin) × Revenue = unrealized margin if lifted to target.',
  retention_rate: 'Annual retention rate — share of active customers from the prior year who invoiced again this year. Churn = no invoice in 12 months.',
  customer_movement: 'Customer flow over the last 12 months: churned (no invoice), retained (invoiced in both periods), new (first invoice this period).',
  growing_declining: 'Top customers by revenue delta 2022 → 2024. Growers indicate expansion; decliners need investigation (project end vs. competitive loss).',
  action_list: 'Top customers ranked by composite signal: margin slope decline, lost quote revenue, LTV at risk, inactivity. Monday-morning call list.',
  margin_trend_slope: 'Average pp change in DB II margin per year (2022 → 2025 trajectory).',
  last_order: 'Date of most recent invoice. Flags customers going dormant.',
  bcg_portfolio: 'Boston Consulting Group matrix — Stars, Cash Cows, Question Marks, Dogs.',
  clv_by_segment: 'Aggregate predicted CLV grouped by customer segment.',
  yoy_comparison: 'Monthly revenue lines for 2022, 2023, 2024, and 2025 side by side.',
  sku_margin_vs_revenue: 'Bubble chart of SKUs: x=revenue, y=margin, size=units. Red line = 50% floor.',
};

// Commodity group descriptions for pie chart hover tooltips
export const CATEGORY_DESCRIPTIONS = {
  // Scherzinger Warengruppen (commodity groups)
  'BKAES': 'Electric Gear Pumps (Elektro-Zahnradpumpen) — high-volume core product line with strong margins.',
  'BKAGG': 'Gear Flange Pumps (Zahnrad-Flanschpumpen) — standard industrial pump range.',
  'SOPU': 'Screw Pumps (Schraubenpumpen) — precision pumps for demanding applications.',
  'BKAIZ': 'Internal Gear Pumps (Innenzahnradpumpen) — compact design for tight installations.',
  'SOPUZK': 'Cooling Pumps (Kuehlmittelpumpen) — specialized for thermal management systems.',
  'OFRSCR': 'Pump Heads (Pumpenkopfe) — replacement and OEM pump head assemblies.',
  'MBKUEHL': 'Hydraulic Pumps (Hydraulikpumpen) — high-pressure industrial hydraulic systems.',
  'MBDIV': 'Special Pump Components (Sonderbauteile) — custom and low-volume specialty parts.',
  'OFRLMG': 'Pump Accessories (Pumpenzubehor) — seals, fittings, and ancillary components.',

  // Recovery breakdown
  'Margin Recovery': 'Revenue uplift from bringing below-floor SKUs to target DB II margin.',
  'Cost Optimization': 'Savings from optimizing manufacturing cost structure and supplier negotiations.',
  'Price Standardization': 'Uplift from harmonizing inconsistent customer pricing across segments.',
  'Governance Compliance': 'Recovery from enforcing 50% DB II margin floor across transactions.',
  'Segment Alignment': 'Value from aligning customer pricing to correct segment-based discounts.',
};
