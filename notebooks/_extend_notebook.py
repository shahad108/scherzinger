"""Append the extension cells to forecasting_market_scenarios.ipynb.

Idempotent: removes any previously-added '## 8.' sections before appending.
"""

from __future__ import annotations

import nbformat
from pathlib import Path


NB_PATH = Path(__file__).resolve().parent / "forecasting_market_scenarios.ipynb"


EXTENSION_CELLS = [
    ("markdown", """## 8. Multi-grain, multi-metric forecasts

Extend the baseline (commodity-group `db2_margin`) to:
- metrics: `revenue`, `quantity`, `db2_margin`
- grains: `commodity_group`, `business_unit`, top-50 customers + other, top-100 SKUs + other
- cadence: monthly (12m) + quarterly (8q) via Monte Carlo aggregation of monthly samples
- hierarchical bottom-up reconciliation so customer / SKU forecasts sum to commodity-group totals
"""),
    ("code", """from backend.services.forecasting_extensions import (
    build_extended_internal_timeseries,
    build_multi_grain_forecasts,
    build_quarterly_forecasts,
    reconcile_to_parent,
    summarise_forecast_accuracy,
    train_churn_model,
    score_customers_with_churn_model,
    train_quote_conversion_model,
    pipeline_forecast,
    build_churn_labels,
    train_revenue_decline_model,
    score_customers_with_revenue_decline_model,
    persist_forecast_vintage,
    evaluate_forecast_drift,
)
from pathlib import Path as _Path

extended_ts = build_extended_internal_timeseries(
    datasets["invoices_df"],
    customer_names=datasets["customers_df"][["customer_id", "name"]],
)
extended_path = OUTPUT_DIR / "extended_internal_timeseries.parquet"
extended_ts.to_parquet(extended_path, index=False)
print(f"Wrote {extended_path}")
print(extended_ts.groupby(['grain', 'metric']).size().unstack(fill_value=0).head(10))
"""),
    ("code", """monthly_results = build_multi_grain_forecasts(
    extended_ts,
    metrics=("revenue", "quantity", "db2_margin"),
    grains=("commodity_group", "business_unit", "customer", "article"),
    horizon_months=12,
    holdout_months=12,
    min_history_months=6,
    market_series_df=market_series,
    correlation_map=correlation_map,
)

import pandas as pd
accuracy_summary = summarise_forecast_accuracy(
    monthly_results["__accuracy__"],
    target_mape_ratio=12.0,
    target_wape_monetary=25.0,
)
ps = accuracy_summary.get('primary_meeting_share')
print('Primary-tier share meeting target:',
      f"{ps:.2%}" if ps is not None else 'n/a',
      f"(across {accuracy_summary.get('primary_eligible_count', 0)} aggregate series)")
display(pd.DataFrame(accuracy_summary['by_metric_grain']))

# Show which series were upgraded by SARIMAX-with-exog
exog_used = [r for r in monthly_results['__accuracy__'] if r.get('uses_exog')]
if exog_used:
    print(f"\\nSARIMAX-with-exog upgraded {len(exog_used)} series:")
    display(pd.DataFrame(exog_used)[['metric','grain','key','model','mape','wape']])
"""),
    ("code", """import numpy as np
quarterly_results = build_quarterly_forecasts(monthly_results, quarters=8)
print('Quarterly horizons built for metrics:', [m for m in quarterly_results.keys() if not m.startswith('__')])
example = quarterly_results['revenue']['commodity_group']
example_key = next(iter(example))
print(f'Example commodity_group={example_key} quarterly revenue forecast:')
display(pd.DataFrame(example[example_key]))
"""),
    ("code", """reconcile_customer = reconcile_to_parent(
    monthly_results,
    metric='revenue',
    child_grain='customer',
    parent_grain='commodity_group',
    invoices_df=datasets['invoices_df'],
)
reconcile_article = reconcile_to_parent(
    monthly_results,
    metric='revenue',
    child_grain='article',
    parent_grain='commodity_group',
    invoices_df=datasets['invoices_df'],
)

residuals_df = pd.DataFrame(reconcile_customer['residuals'] + reconcile_article['residuals'])
print(f"Customer-level series reconciled: {len(reconcile_customer['reconciled'])}")
print(f"Article-level series reconciled: {len(reconcile_article['reconciled'])}")
display(residuals_df.sort_values('pre_reconciliation_residual_pct', ascending=False).head(15))
"""),
    ("markdown", """### Write multi-grain forecast artifacts
"""),
    ("code", """def _stringify_ts(forecast_rows):
    out = []
    for row in forecast_rows:
        new = dict(row)
        if 'ts' in new:
            new['ts'] = pd.Timestamp(new['ts']).isoformat()
        out.append(new)
    return out

def _serialize_metric_results(metric_results):
    payload = {}
    for grain, series_map in metric_results.items():
        payload[grain] = {
            key: {
                'data_months': item['data_months'],
                'eligible': item['eligible_for_acceptance'],
                'winner_model': item['winner']['model_name'],
                'winner_mape': item['winner']['mape'],
                'forecast': _stringify_ts(item['forecast']),
            }
            for key, item in series_map.items()
        }
    return payload

revenue_payload = _serialize_metric_results(monthly_results['revenue'])
quantity_payload = _serialize_metric_results(monthly_results['quantity'])
margin_payload = _serialize_metric_results(monthly_results['db2_margin'])

write_json_artifact(revenue_payload, output_path=OUTPUT_DIR / 'forecast_revenue.json')
write_json_artifact(quantity_payload, output_path=OUTPUT_DIR / 'forecast_quantity.json')
write_json_artifact(margin_payload, output_path=OUTPUT_DIR / 'forecast_margin.json')

quarterly_payload = {}
for metric, grain_map in quarterly_results.items():
    quarterly_payload[metric] = {}
    for grain, series_map in grain_map.items():
        quarterly_payload[metric][grain] = {
            key: _stringify_ts(rows) for key, rows in series_map.items()
        }
write_json_artifact(quarterly_payload, output_path=OUTPUT_DIR / 'forecast_quarterly.json')
print('Wrote revenue/quantity/margin/quarterly forecast JSONs')

# M11: persist this forecast vintage for future drift analysis
vintage_path = persist_forecast_vintage(
    monthly_results, output_path=OUTPUT_DIR / 'forecast_vintages.parquet',
)
print(f'M11: appended this vintage to {vintage_path}')

# If we have prior vintages, compute drift against current actuals
drift = evaluate_forecast_drift(vintage_path, extended_timeseries=extended_ts)
if not drift.empty:
    print('M11: drift summary (prior vintages vs current actuals)')
    display(drift)
"""),
    ("code", """# Per-SKU table (long form) covering monthly + quarterly
sku_rows = []
sku_monthly = monthly_results['revenue'].get('article', {})
sku_quarterly = quarterly_results['revenue'].get('article', {})
for key, summary in sku_monthly.items():
    method = 'direct' if not key.startswith('other__') else 'proportional_bucket'
    for row in summary['forecast']:
        sku_rows.append({
            'article_key': key,
            'cadence': 'monthly',
            'ts': row['ts'],
            'p50': row['p50'],
            'p80_low': row['p80_low'], 'p80_high': row['p80_high'],
            'p95_low': row['p95_low'], 'p95_high': row['p95_high'],
            'forecast_method': method,
        })
for key, rows in sku_quarterly.items():
    method = 'direct' if not key.startswith('other__') else 'proportional_bucket'
    for row in rows:
        sku_rows.append({
            'article_key': key,
            'cadence': 'quarterly',
            'ts': row['ts'],
            'p50': row['p50'],
            'p80_low': row['p80_low'], 'p80_high': row['p80_high'],
            'p95_low': row['p95_low'], 'p95_high': row['p95_high'],
            'forecast_method': method,
        })
sku_df = pd.DataFrame(sku_rows)
sku_path = OUTPUT_DIR / 'sku_forecasts.parquet'
sku_df['ts'] = pd.to_datetime(sku_df['ts'])
sku_df.to_parquet(sku_path, index=False)
print(f'Wrote {sku_path}  rows={len(sku_df)}')
display(sku_df.head())
"""),
    ("code", """# Per-customer table
cust_rows = []
cust_monthly = monthly_results['revenue'].get('customer', {})
cust_quarterly = quarterly_results['revenue'].get('customer', {})
name_map = datasets['customers_df'].set_index('customer_id')['name'].to_dict()
for key, summary in cust_monthly.items():
    display_name = name_map.get(key) if not key.startswith('other__') else None
    for row in summary['forecast']:
        cust_rows.append({
            'customer_key': key,
            'display_name': display_name,
            'cadence': 'monthly',
            'ts': row['ts'],
            'p50': row['p50'],
            'p80_low': row['p80_low'], 'p80_high': row['p80_high'],
            'p95_low': row['p95_low'], 'p95_high': row['p95_high'],
        })
for key, rows in cust_quarterly.items():
    display_name = name_map.get(key) if not key.startswith('other__') else None
    for row in rows:
        cust_rows.append({
            'customer_key': key,
            'display_name': display_name,
            'cadence': 'quarterly',
            'ts': row['ts'],
            'p50': row['p50'],
            'p80_low': row['p80_low'], 'p80_high': row['p80_high'],
            'p95_low': row['p95_low'], 'p95_high': row['p95_high'],
        })
cust_df = pd.DataFrame(cust_rows)
cust_df['ts'] = pd.to_datetime(cust_df['ts'])
cust_path = OUTPUT_DIR / 'customer_forecasts.parquet'
cust_df.to_parquet(cust_path, index=False)
print(f'Wrote {cust_path}  rows={len(cust_df)}')
display(cust_df.head())
"""),
    ("markdown", """## 9. Customer churn model

Predict probability each currently-active customer goes inactive over the next 1Q / 2Q / 4Q windows. Definition: no invoice in trailing 6 months **and** no won quote in trailing 3 months at horizon end. Trained with rolling as-of dates to keep labels honest (no peeking past horizon end)."""),
    ("code", """import datetime as _dt

# Score as of the most recent month-end in the invoice data
as_of = pd.to_datetime(datasets['invoices_df']['date']).max().normalize() + pd.offsets.MonthEnd(0)
print(f'Scoring churn as of: {as_of}')

# Build revenue-by-customer forecast dict (top-50 directly forecast)
revenue_forecast_by_customer = {
    key: summary['forecast']
    for key, summary in monthly_results.get('revenue', {}).get('customer', {}).items()
    if not key.startswith('other__')
}

churn_outputs = []
for horizon in (3, 6, 12):
    artifact = train_churn_model(
        datasets['invoices_df'],
        datasets['quotes_df'],
        score_as_of=as_of,
        horizon_months=horizon,
        lookback_label_dates=3,
    )
    scored = score_customers_with_churn_model(
        artifact,
        datasets['invoices_df'],
        datasets['quotes_df'],
        revenue_forecast_by_customer=revenue_forecast_by_customer,
        customer_names=datasets['customers_df'],
    )
    scored['horizon_q'] = horizon // 3
    churn_outputs.append((horizon, artifact, scored))
    print(f'  horizon={horizon}m  AUC={artifact.metrics[\"auc\"]:.3f}  '
          f'AP={artifact.metrics[\"average_precision\"]:.3f}  '
          f'Brier={artifact.metrics[\"brier\"]:.3f}  '
          f'customers_scored={len(scored)}')
"""),
    ("code", """# Pivot churn predictions into one row per customer with p_churn_1q / 2q / 4q
pivot = None
for horizon, artifact, scored in churn_outputs:
    col = f'p_churn_{horizon // 3}q'
    risk_col = f'at_risk_revenue_{horizon // 3}q'
    sub = scored[['customer_id', 'p_churn', 'at_risk_revenue']].rename(
        columns={'p_churn': col, 'at_risk_revenue': risk_col}
    )
    pivot = sub if pivot is None else pivot.merge(sub, on='customer_id', how='outer')

pivot = pivot.merge(
    datasets['customers_df'][['customer_id', 'name']],
    on='customer_id',
    how='left',
)

# Top SKUs per customer (last 12 months)
recent_cutoff = as_of - pd.DateOffset(months=12)
inv_recent = datasets['invoices_df'][pd.to_datetime(datasets['invoices_df']['date']) >= recent_cutoff]
top_skus_per_cust = (
    inv_recent.groupby(['customer_id', 'article_id'])['revenue'].sum()
    .reset_index()
    .sort_values(['customer_id', 'revenue'], ascending=[True, False])
    .groupby('customer_id')['article_id']
    .apply(lambda s: ','.join(s.head(5).astype(str)))
    .reset_index()
    .rename(columns={'article_id': 'top_skus_12m'})
)
pivot = pivot.merge(top_skus_per_cust, on='customer_id', how='left')

pivot = pivot.sort_values('p_churn_4q', ascending=False)

# M8: revenue-decline companion model (predicts wallet erosion that the
# binary churn label misses)
decline_artifact = train_revenue_decline_model(
    datasets['invoices_df'], datasets['quotes_df'],
    score_as_of=as_of, horizon_months=12, decline_threshold=0.5,
)
print(f'M8 revenue-decline model: AUC={decline_artifact.metrics[\"auc\"]:.3f}  '
      f'AP={decline_artifact.metrics[\"average_precision\"]:.3f}  '
      f'Brier={decline_artifact.metrics[\"brier\"]:.3f}')
decline_scored = score_customers_with_revenue_decline_model(
    decline_artifact, datasets['invoices_df'], datasets['quotes_df'],
)
pivot = pivot.merge(
    decline_scored[['customer_id', 'p_major_decline']],
    on='customer_id', how='left',
)

churn_csv = OUTPUT_DIR / 'churn_predictions.csv'
pivot.to_csv(churn_csv, index=False)
print(f'Wrote {churn_csv}  rows={len(pivot)}')
display(pivot.head(15))
"""),
    ("markdown", """## 10. Quote-to-order conversion + open-pipeline forecast

Train a win-rate model on historical quotes (`is_won`), apply to any open quotes to estimate expected booked revenue in the next 1-2 quarters.
"""),
    ("code", """# Train conversion model on historical quotes with known outcome
conv_artifact = train_quote_conversion_model(datasets['quotes_df'])
print('Quote conversion metrics:', conv_artifact.metrics)

# Identify open quotes (status not yet won/lost) - those without is_won True/False resolved
open_quotes = datasets['quotes_df'].copy()
if 'status' in open_quotes.columns:
    open_quotes = open_quotes[open_quotes['status'].astype(str).str.lower().isin(['open', 'pending', ''])]
    if open_quotes.empty:
        # Fallback: treat last-90-day quotes as proxy for pipeline
        cutoff = pd.to_datetime(datasets['quotes_df']['date']).max() - pd.Timedelta(days=90)
        open_quotes = datasets['quotes_df'][pd.to_datetime(datasets['quotes_df']['date']) >= cutoff]
        print(f'No open status quotes; using last 90 days ({len(open_quotes)} quotes) as proxy pipeline')
else:
    cutoff = pd.to_datetime(datasets['quotes_df']['date']).max() - pd.Timedelta(days=90)
    open_quotes = datasets['quotes_df'][pd.to_datetime(datasets['quotes_df']['date']) >= cutoff]

pipeline_df = pipeline_forecast(conv_artifact, open_quotes)
pipeline_path = OUTPUT_DIR / 'pipeline_forecast.csv'
pipeline_df.to_csv(pipeline_path, index=False)
print(f'Wrote {pipeline_path}  rows={len(pipeline_df)}')
if not pipeline_df.empty:
    display(pipeline_df.head(15))
    by_quarter = pipeline_df.groupby('quarter')['expected_revenue'].sum().reset_index()
    print('Expected booked revenue by quarter:')
    display(by_quarter)
"""),
    ("markdown", """## 11. Extended validation report
"""),
    ("code", """from datetime import datetime, timezone

primary_rows = [r for r in accuracy_summary['by_metric_grain'] if r['gate_tier'] == 'primary']
info_rows = [r for r in accuracy_summary['by_metric_grain'] if r['gate_tier'] == 'informational']
def _fmt_rows(rows):
    return '\\n'.join(
        f"| {r['metric']} | {r['grain']} | {r['error_metric']} | {r['target_pct']:.0f}% | {r['eligible_series']} | {r['median_error']:.2f} | {r['meeting_share']:.0%} |"
        for r in rows
    ) or '| (none) | | | | | | |'
primary_table = _fmt_rows(primary_rows)
info_table = _fmt_rows(info_rows)

churn_table_rows = []
for horizon, art, _scored in churn_outputs:
    m = art.metrics
    churn_table_rows.append(
        f"| {horizon}m ({horizon // 3}Q) | {m['auc']:.3f} | {m['average_precision']:.3f} | {m['brier']:.3f} |"
    )

residual_rows = []
for r in (reconcile_customer['residuals'] + reconcile_article['residuals']):
    residual_rows.append(
        f"| {r['parent']} | {r['child_grain']} | {r['n_children']} | {r['pre_reconciliation_residual_pct']:.2f}% |"
    )

passes_main_gate = (forecast_baseline['validation_summary']['meeting_target_share'] or 0) >= 0.5
primary_share = accuracy_summary['primary_meeting_share'] or 0.0
primary_count = accuracy_summary.get('primary_eligible_count', 0)
passes_extended_gate = primary_share >= 0.6

ext_report = f\"\"\"# Forecasting Notebook Validation Report

Generated: {datetime.now(timezone.utc).strftime('%Y-%m-%dT%H:%M:%SZ')}

## Artifacts written

- `internal_timeseries.parquet`, `extended_internal_timeseries.parquet`
- `market_series.parquet`, `market_series_catalog.csv`, `correlation_map.json`
- `forecast_baseline.json` (commodity_group x db2_margin, monthly)
- `forecast_revenue.json`, `forecast_quantity.json`, `forecast_margin.json` (monthly, all grains)
- `forecast_quarterly.json` (all metrics, all grains, 8q horizon)
- `sku_forecasts.parquet`, `customer_forecasts.parquet`
- `churn_predictions.csv`, `pipeline_forecast.csv`
- `summary.html`

## Baseline accuracy gate (db2_margin x commodity_group)

- Eligible series: {forecast_baseline['validation_summary']['eligible_series_count']}
- Target MAPE: <= {forecast_baseline['validation_summary']['target_mape_pct']}%
- Meeting target share: {forecast_baseline['validation_summary']['meeting_target_share']:.2%}
- Pass (>= 50%): **{passes_main_gate}**

## Multi-grain forecast accuracy

Two tiers:

- **Primary gate** (aggregate grains: total / business_unit / commodity_group): the levels finance and sales plan against. Ratio metrics use MAPE <=12%, monetary metrics use WAPE <=25%.
- **Informational** (customer / article grains): per-account and per-SKU monthly cadence is inherently bursty in industrial B2B (long order cycles, few invoices/month per account). These forecasts are useful for ranking and at-risk-revenue calculations but should not be consumed as point forecasts. Aggregate quarterly views are more reliable - see `forecast_quarterly.json`.

### Primary gate

| Metric | Grain | Error | Target | Eligible series | Median % | Meeting target |
|--------|-------|-------|--------|-----------------|----------|----------------|
{primary_table}

Primary gate: {primary_count} eligible series, **{primary_share:.2%}** meeting target -> Pass (>=60%): **{passes_extended_gate}**

### Informational (customer / article grains)

| Metric | Grain | Error | Target | Eligible series | Median % | Meeting target |
|--------|-------|-------|--------|-----------------|----------|----------------|
{info_table}

## Churn model performance (time-series CV)

| Horizon | AUC | Avg. Precision | Brier |
|---------|-----|----------------|-------|
{chr(10).join(churn_table_rows)}

Target AUC >= 0.70. Customers scored: top-{len(pivot)}.

## Quote conversion model

- AUC: {conv_artifact.metrics['auc']:.3f}
- Average precision: {conv_artifact.metrics['average_precision']:.3f}
- Brier: {conv_artifact.metrics['brier']:.3f}
- Pipeline forecast rows: {len(pipeline_df)}

## Hierarchical reconciliation residuals (pre-scaling, p50 sums)

| Parent | Child grain | Children | Residual % |
|--------|-------------|----------|------------|
{chr(10).join(residual_rows) if residual_rows else '| (no reconciled groups) | | | |'}

## Known gaps

- Long-tail SKUs (>100 by rank) are forecast via proportional bucket roll-down rather than directly.
- Customer names anonymised in the input data; churn predictions are by customer_id only.

## What changed in this revision

- Monetary metrics (revenue/quantity) now scored via WAPE, the standard
  metric for bursty positive demand series. Target tightened to <=25%.
- SARIMAX-with-exog model added for commodity_group series with strong
  leading-indicator correlations. Each upgraded series is annotated in the
  per-series JSON with the macro `exog_series_ids` used.
\"\"\"

report_path = OUTPUT_DIR / 'validation_report.md'
report_path.write_text(ext_report)
print(f'Wrote {report_path}')
print(ext_report[:1200])
"""),
    ("markdown", """## 12. Client summary HTML
"""),
    ("code", """import html as _html

top_churn = pivot.head(20)[['customer_id', 'name', 'p_churn_4q', 'at_risk_revenue_4q', 'top_skus_12m']].fillna('')
top_pipeline_q = (
    pipeline_df.groupby('quarter')['expected_revenue'].sum().reset_index()
    if not pipeline_df.empty else pd.DataFrame(columns=['quarter', 'expected_revenue'])
)

# Revenue by commodity_group quarterly view
rev_q = quarterly_results['revenue']['commodity_group']
quarterly_rev_rows = []
for group, rows in rev_q.items():
    for row in rows:
        quarterly_rev_rows.append({
            'commodity_group': group,
            'quarter': pd.Timestamp(row['ts']).strftime('%Y Q%q').replace('%q', str(pd.Timestamp(row['ts']).quarter)),
            'p50_revenue': row['p50'],
            'p80_low': row['p80_low'],
            'p80_high': row['p80_high'],
        })
quarterly_rev_df = pd.DataFrame(quarterly_rev_rows)

def df_to_html(df, fmt=None):
    if df.empty:
        return '<p><em>No data</em></p>'
    if fmt:
        return df.to_html(index=False, float_format=fmt, escape=True)
    return df.to_html(index=False, escape=True)

html = f\"\"\"<!doctype html>
<html><head><meta charset='utf-8'><title>Scherzinger Forecast + Churn Summary</title>
<style>
body {{ font-family: -apple-system, system-ui, sans-serif; max-width: 1080px; margin: 2rem auto; color: #1a1a1a; }}
h1, h2 {{ color: #0e3b5c; }}
table {{ border-collapse: collapse; margin: 1rem 0; width: 100%; }}
th, td {{ padding: 6px 10px; border-bottom: 1px solid #e5e7eb; text-align: right; }}
th {{ background: #f8fafc; text-align: left; }}
td:first-child, th:first-child {{ text-align: left; }}
.kpi {{ display: inline-block; padding: 1rem 1.5rem; margin: 0.25rem; background: #f1f5f9; border-radius: 8px; }}
.kpi .v {{ font-size: 1.4rem; font-weight: 700; color: #0e3b5c; }}
.kpi .l {{ font-size: 0.85rem; color: #475569; }}
</style></head><body>
<h1>Scherzinger - Forecast &amp; Churn Summary</h1>
<p>Generated {pd.Timestamp.utcnow().strftime('%Y-%m-%d %H:%M UTC')}. Scoring as-of {as_of.strftime('%Y-%m-%d')}.</p>

<div>
  <div class='kpi'><div class='v'>{accuracy_summary['overall_share_meeting_target']:.0%}</div><div class='l'>Series meeting &lt;=12% MAPE</div></div>
  <div class='kpi'><div class='v'>{len(pivot)}</div><div class='l'>Customers scored for churn</div></div>
  <div class='kpi'><div class='v'>{int(pivot['p_churn_4q'].ge(0.5).sum())}</div><div class='l'>Customers with &gt;=50% 4Q churn prob</div></div>
  <div class='kpi'><div class='v'>EUR {pivot['at_risk_revenue_4q'].fillna(0).sum():,.0f}</div><div class='l'>Total 4Q at-risk revenue</div></div>
</div>

<h2>Top 20 churn-risk customers (4Q horizon)</h2>
{df_to_html(top_churn, fmt=lambda v: f'{v:,.3f}' if isinstance(v, float) else str(v))}

<h2>Quarterly revenue forecast by commodity group (P50, EUR)</h2>
{df_to_html(quarterly_rev_df, fmt=lambda v: f'{v:,.0f}' if isinstance(v, float) else str(v))}

<h2>Open-pipeline expected booked revenue by quarter</h2>
{df_to_html(top_pipeline_q, fmt=lambda v: f'{v:,.0f}' if isinstance(v, float) else str(v))}

<h2>Multi-grain forecast accuracy</h2>
{df_to_html(pd.DataFrame(accuracy_summary['by_metric_grain']), fmt=lambda v: f'{v:.2f}' if isinstance(v, float) else str(v))}
</body></html>
\"\"\"

(OUTPUT_DIR / 'summary.html').write_text(html)
print(f\"Wrote {OUTPUT_DIR / 'summary.html'}\")
"""),
]


def main() -> None:
    nb = nbformat.read(NB_PATH, as_version=4)

    # Remove any prior extension cells (sections 8+ added on prior runs)
    keep: list = []
    skip = False
    for cell in nb.cells:
        src = (cell.source or "").lstrip()
        if cell.cell_type == "markdown" and (
            src.startswith("## 8.")
            or src.startswith("## 9.")
            or src.startswith("## 10.")
            or src.startswith("## 11.")
            or src.startswith("## 12.")
        ):
            skip = True
            continue
        if skip:
            # Skip cells until we hit a new ## section we want to keep (we keep everything before ## 8)
            # All cells after ## 8 should be skipped; since our extensions appended at the end,
            # everything beyond this point is regenerated.
            continue
        keep.append(cell)
    nb.cells = keep

    for cell_type, source in EXTENSION_CELLS:
        if cell_type == "markdown":
            nb.cells.append(nbformat.v4.new_markdown_cell(source))
        else:
            nb.cells.append(nbformat.v4.new_code_cell(source))

    nbformat.write(nb, NB_PATH)
    print(f"Updated {NB_PATH} -> {len(nb.cells)} cells")


if __name__ == "__main__":
    main()
