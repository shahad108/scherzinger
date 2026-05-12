# Forecasting + Market Data + Scenario Builder — Jupyter Notebook Plan

**Author audience:** Codex (executing each section) and Shahad (reviewing outputs).
**Goal of this document:** describe a single Jupyter notebook, section by section, that validates the forecasting methodology, market-data pipeline, scenario builder, and tornado sensitivity on real Scherzinger data **before** any of it is encoded into the production backend. The notebook is the de-risking step. Once its outputs are credible, the same logic gets ported into `scherzinger-platform/`.
**Out of scope for this notebook:** UI work, production endpoints, persistence to Postgres, multi-tenant concerns.
**Last revised:** 12 May 2026.

---

## 0. Why a notebook first

Three reasons:

1. **Methodology validation.** Until we know the forecasting model is credible on Scherzinger's own 4 years of data, encoding it in the backend is premature. A notebook lets us see the residuals, the cluster behavior, the model failure modes.
2. **Market-data plumbing risk.** Five external providers (FRED, Destatis, EIA, ECB, Eurostat) each have their own quirks (rate limits, schema, missing data, holiday gaps). Hitting all of them once interactively surfaces the failures before they live in a cron job.
3. **Correlation truth.** We claim "Steel HRC correlates 0.78 with BKAES material cost." That number must be computed end-to-end on actual data once before it appears anywhere in the product. The notebook is where that number gets earned.

The notebook's outputs (one Parquet + several JSON files) become **direct inputs** to the production backend. Each artifact is named so it can be dropped into `scherzinger-platform/backend/seeds/` or `Data/cleaned/` without further transformation.

---

## 1. Deliverable

A single notebook: `notebooks/forecasting_market_scenarios.ipynb` at the repo root (create `notebooks/` if it does not exist). Plus the following side artifacts written by the notebook:

- `notebooks/output/market_series.parquet` — every market observation pulled, one row per (series_id, ts).
- `notebooks/output/correlation_map.json` — commodity_group → top-3 correlated market series with strengths and rationale.
- `notebooks/output/forecast_baseline.json` — per-cluster and per-commodity-group 12-month forecast in the shape the production `/forecast` endpoint will eventually return.
- `notebooks/output/tornado_default.json` — tornado output for the base scenario.
- `notebooks/output/scenarios_seed.json` — three named scenarios (Base, Steel shock +10%, Multi-input shock) for the production scenarios table seed.
- `notebooks/output/methodology.md` — auto-written one-pager describing every model and assumption used, with citations.
- `notebooks/output/validation_report.md` — pass/fail of every acceptance criterion in §15.

The notebook itself should be runnable top-to-bottom with no errors after Section 2 (Setup) succeeds. Failures in later sections should be visible but not abort the run — wrap external-API calls in try/except and report status in a final cell.

---

## 2. Prerequisites

### 2.1 Environment

- Python 3.11+, Jupyter Lab or notebook.
- Packages: `pandas`, `numpy`, `pyarrow`, `scipy`, `statsmodels`, `scikit-learn`, `matplotlib`, `seaborn`, `requests`, `python-dotenv`, `tabulate`. Install in a fresh venv at the start of Section 2.
- Optional: `prophet` if we extend to Bayesian forecasts in §10. Not required for v1.

### 2.2 Secrets

Stored in a `.env` at the repo root (not committed). Required keys:

- `FRED_API_KEY` — provided.
- `DESTATIS_USERNAME` and `DESTATIS_PASSWORD` (the API uses basic auth, not a key) — provided. If the keys are an API token instead, document the actual header format in the notebook's setup cell.
- `EIA_API_KEY` — provided.

No keys needed for ECB Statistical Data Warehouse (SDMX REST) or Eurostat REST.

### 2.3 Input files

- `Data/cleaned/invoices_clean.parquet` — 5,565 rows, 33 cols, Jan 2022 → Dec 2025.
- `Data/cleaned/quotes_clean.parquet` — 4,539 rows.
- `Data/cleaned/customers.parquet` — 1,438 rows.
- `Data/cleaned/products.parquet` — 1,798 rows.
- `Data/cleaned/linkage_report.txt` — for cross-check, not parsing.

All confirmed present and clean from the 11 May audit.

---

## 3. Notebook section structure

The notebook is organized as 16 sections. Each section below describes: what it does, what it reads, what it writes, and what passes acceptance.

### Section 1 — Header + objective cell

Markdown cell with: notebook purpose, author, last run date, link to this plan, a TL;DR of what the notebook produces.

### Section 2 — Setup + dependency install + secret load

- Install or import the package set from §2.1.
- Load `.env` via `python-dotenv`. Print which keys are present (mask values).
- Set seaborn / matplotlib defaults (size, font) once so plots are consistent.
- Define a single helper for HTTP calls (timeout, retry on 5xx, raise on 4xx) — used by every API section so the retry policy is identical everywhere.
- Define output directory `notebooks/output/` and create if absent.

**Acceptance:** All imports succeed; all three API keys load (mask printed); helper functions defined.

### Section 3 — Load Scherzinger internal data + sanity checks

- Read the four parquet files into named dataframes (`invoices_df`, `quotes_df`, `customers_df`, `products_df`).
- Print row counts and date ranges — expect 5,565 / 4,539 / 1,438 / 1,798 and Jan 2022 → Dec 2025 on invoices/quotes. Fail loudly if not.
- Compute and display data-quality flags from the `dq_*` columns: count of rows with `dq_any_issue`, percentage with `dq_missing_margin`, etc.
- Show first 3 rows of each DF.

**Acceptance:** All four files load; counts match the audit; DQ summary printed.

### Section 4 — Build internal time series (cost, margin, revenue)

The notebook needs Scherzinger time series at the granularity the forecast models will consume.

- Aggregate `invoices_df` to monthly grain along three dimensions in parallel:
  - **Total** (one series): monthly revenue, monthly db1 margin %, monthly db2 margin %, monthly material_per_unit weighted average, monthly hkvar_per_unit weighted average, monthly volume (sum of quantity).
  - **Per commodity_group** (one series per group, expected groups: BKAES, BKAGG, BKAIZ, SOPU and any others present): same metrics.
  - **Per business_unit**: same metrics.
- For each grain, build a "long" dataframe with columns `(grain, key, ts, metric, value)` so downstream code is uniform.
- Persist to `notebooks/output/internal_timeseries.parquet`.
- Plot one chart per grain showing revenue and db2_margin over time. Visually verify trends.

**Acceptance:** Three grains × ~6 metrics × 48 months = ~864+ series rows per grain; charts render; no obvious zeros or NaNs in non-DQ rows.

### Section 5 — Market data fetch: FRED

Series to fetch (starter set — adjust if FRED reorganizes IDs):

1. `WPU101` — PPI: Steel mill products (US, monthly).
2. `PCOPPUSDM` — Global price of copper, USD/metric ton, monthly.
3. `PALUMUSDM` — Global price of aluminum, USD/metric ton, monthly.
4. `DEXUSEU` — US/Euro exchange rate (we'll invert to EUR/USD), daily.
5. `PRINTO01DEM657S` — German industrial production index, monthly.
6. `IRLTLT01DEM156N` — German 10Y bund yield, monthly.
7. `DCOILBRENTEU` — Brent crude oil, daily.
8. `PNRGINDEXM` — Global energy index, monthly.
9. `CPIAUCSL` — US CPI (proxy reference), monthly.
10. `INDPRO` — US industrial production (proxy reference), monthly.

For each series:

- Call FRED's `series/observations` endpoint with the API key, `observation_start=2018-01-01` (to give us pre-2022 context for correlation), `file_type=json`.
- Normalize: `series_id`, `ts` (datetime), `value` (float, NaN where "."), `source='fred'`, `unit` (from `series` metadata call), `freq` from metadata.
- Resample daily series to month-end where the rest are monthly so everything aligns on month boundaries.
- Concatenate into one long dataframe.
- Display: per-series row count, first/last date, mean value, missing percentage.

**Acceptance:** All 10 series return data; coverage ≥ 95% over Jan 2018 → today; chart of two-row grid showing series. Failures don't abort — log and continue.

### Section 6 — Market data fetch: Destatis Genesis-Online

Series to fetch (Genesis codes — confirm in Destatis dictionary at runtime; example codes below are common ones, the notebook should make them configurable):

1. `61221-0002` (or current equivalent) — PPI machinery & equipment (DESTATIS_FAMILY = "Erzeugerpreisindex gewerblicher Produkte, Maschinenbau"), monthly.
2. `42153-0001` — Production index, manufacture of machinery & equipment, monthly.
3. `42351-0001` — Order intake index, machinery & equipment, monthly.
4. `81000-0001` — Wholesale price index (broader inflation), monthly.

For each:

- Call Genesis-Online REST endpoint `tablefile?name={code}&format=csv` with basic-auth header.
- Parse the CSV (Destatis CSVs are semicolon-delimited, German number format — commas as decimal). Convert to long format `(series_id, ts, value)` with `source='destatis'`.
- Concatenate into the same long dataframe from §5.

**Acceptance:** All 4 series return data (or notebook explicitly notes "Destatis series X 404 — table renamed, please update code"); coverage ≥ 90%.

### Section 7 — Market data fetch: EIA

Series to fetch (EIA series IDs are stable):

1. `NG.RNGWHHD.D` — Henry Hub natural gas spot price (USD/MMBtu), daily — proxy for global gas trend.
2. `PET.RBRTE.D` — Europe Brent spot FOB (USD/bbl), daily — redundant with FRED Brent, kept as cross-check.
3. `ELEC.PRICE.US-ALL.M` — US average electricity retail price, monthly — proxy for electricity trend (German EEX is paid; we use US as broad signal).
4. `STEO.WTIPUUS.M` — WTI crude oil monthly forecast (STEO) — for forward-looking energy context.

For each:

- Call EIA v2 API: `https://api.eia.gov/v2/{series_path}?api_key={key}` with appropriate facets.
- Normalize to the long dataframe.
- Resample daily to month-end.

**Acceptance:** All 4 series return data; coverage ≥ 95%.

### Section 8 — Market data fetch: ECB SDW (no key)

Series to fetch (SDMX REST codes):

1. `EXR.D.USD.EUR.SP00.A` — EUR/USD reference rate, daily.
2. `EXR.D.CHF.EUR.SP00.A` — EUR/CHF, daily.
3. `EXR.D.GBP.EUR.SP00.A` — EUR/GBP, daily.
4. `EXR.D.JPY.EUR.SP00.A` — EUR/JPY, daily (optional, low priority).
5. `ICP.M.U2.N.000000.4.ANR` — HICP Eurozone inflation, monthly.

For each:

- Call `https://data-api.ecb.europa.eu/service/data/{flow}/{key}?format=csvdata`.
- Parse, normalize, resample to month-end.

**Acceptance:** EUR/USD, EUR/CHF, EUR/GBP all return data; HICP returns data.

### Section 9 — Market data fetch: Eurostat (no key)

Series to fetch (Eurostat dataset codes):

1. `sts_inpr_m` — Industrial production index (NACE C, manufacturing), Germany filter, monthly.
2. `sts_inppd_m` — Domestic producer price index, Germany filter, monthly.
3. `sts_intv4_m` — Industrial turnover index (NACE C28 machinery), Germany filter, monthly.

For each:

- Call `https://ec.europa.eu/eurostat/api/dissemination/statistics/1.0/data/{code}?format=JSON&geo=DE&...` with appropriate filters.
- Normalize.

**Acceptance:** All 3 datasets return data for Germany; coverage ≥ 90% over the 4-year Scherzinger window.

### Section 10 — Consolidate + persist market data

- Concatenate the long dataframes from §5–9 into one.
- Deduplicate any overlapping series (e.g. Brent appears in both FRED and EIA — keep FRED, drop EIA's, log the choice).
- Write `notebooks/output/market_series.parquet`.
- Write `notebooks/output/market_series_catalog.csv` — one row per unique series_id with `source`, `name`, `unit`, `freq`, `first_ts`, `last_ts`, `row_count`, `missing_pct`.
- Plot a single grid (4×6 small-multiples) of every series in `market_series.parquet` so anyone reviewing the notebook can eyeball coverage and shapes.

**Acceptance:** ≥ 24 series in the consolidated catalog; coverage and shapes look reasonable in the small-multiples; Parquet file < 50 MB.

### Section 11 — Correlation analysis (the Frank-defensibility step)

This is the section that produces the "Steel HRC correlates 0.78 with BKAES material cost" line.

For each commodity_group time series from §4 (metrics: `material_per_unit`, `hkvar_per_unit`, `db2_margin`):

- Align with each market series on month-end, forward-fill at most 1 month for daily-origin series resampled to monthly.
- Compute three correlation statistics: Pearson, Spearman, and rolling 24-month Pearson (to see if correlation is stable or just one-off).
- Compute lagged correlations at lags 0, 1, 2, 3 months — market data usually leads internal costs.
- Filter: keep only series-pair correlations where (a) |best-lag Pearson| ≥ 0.4, (b) p-value < 0.05, (c) the rolling 24-month correlation has stdev < 0.3 (i.e. the correlation is stable, not a fluke).
- For each commodity_group, rank the surviving series by best-lag Pearson and keep the top 3.
- Produce `notebooks/output/correlation_map.json` with structure:
  ```
  { commodity_group: [
      { series_id, source, name, lag_months, pearson, spearman, rolling_24m_stdev, p_value, rationale }
  ] }
  ```
  `rationale` is auto-generated text e.g. "Steel HRC (FRED WPU101) leads BKAES material cost by 1 month with Pearson 0.78 (rolling-24m stdev 0.12, p<0.001)."

**Acceptance:** Each commodity_group has at least one surviving market series. The single highest correlation across all pairs is printed for review.

### Section 12 — Forecasting models

For each commodity_group + total grain, build three forecasts on `db2_margin` and `revenue`:

1. **EMA** (exponential moving average, span=6 months) — already used by `scripts/compute_forecasts.py` in the backend; replicate so notebook outputs match what the production cron will produce.
2. **Linear trend** with statsmodels OLS on a time index plus monthly seasonal dummies.
3. **Seasonal-decomposition + ETS** — `statsmodels.tsa.holtwinters.ExponentialSmoothing` with monthly seasonality.

For each model, produce:

- 12-month-ahead point forecast.
- P50 (= point), P80 lower/upper, P95 lower/upper based on the residual standard deviation × normal quantile multipliers (matching what backend does — see `_P95_MULTIPLIER` in `forecast/blocks.py`).
- Walk-forward backtest: train on months 1..t, forecast month t+1, walk forward one month at a time over the last 18 months. Collect per-month MAPE and per-month signed error. Compute aggregate MAPE.

For each commodity_group, pick the **winner model** by lowest 18-month walk-forward MAPE. Persist:

- `notebooks/output/forecast_baseline.json` with structure mirroring the existing `forecast.json` mock so the production backend can ingest it without shape changes. Include per-cluster forecast, walk-forward series, MAPE numbers, and which model won per cluster.

Plot per-commodity-group: historical actuals (last 24 months) + winner-model forecast band (12 months ahead) on one chart.

**Acceptance:** All commodity_groups have a winner model; aggregate MAPE on db2_margin ≤ 8% on at least 50% of groups; charts render and look smooth.

### Section 13 — Scenario builder framework

Define the perturbation framework that the production backend will use later:

- A **scenario** is a dict of `{input_name: perturbation}` pairs.
- An **input** is one of: a market series (steel, copper, EUR/USD, etc. — names mapped from the correlation_map), an internal lever (`list_price_uplift_pct`, `pass_through_pct`, `volume_growth_pct`), or a commodity-group override.
- A **perturbation** is one of: `{ type: 'multiplicative', value: 0.10 }` (steel × 1.10), `{ type: 'additive_pct', value: 3.0 }` (raise list price by 3pp), or `{ type: 'set_value', value: X }` (override the series to a specific level).

The notebook does **not** build a UI — it builds the function `apply_scenario(base_forecast, scenario) -> perturbed_forecast` that:

1. Walks the scenario inputs.
2. For market-series inputs: shifts the market series, then reruns the part of the forecast model that depends on that series. (For the EMA/linear/ETS baseline this is approximated by adjusting the cost-trajectory input that feeds the margin model — explicit math in the docstring.)
3. For internal levers: applies them as post-hoc adjustments to the forecast.
4. Returns the same shape as `forecast_baseline.json` but with `db2_margin`, `revenue`, etc. recomputed.

**Acceptance:** The function runs in < 200 ms on a single scenario; result shape matches baseline; sanity check — a +10% steel scenario should reduce forecast db2_margin for steel-heavy commodity groups, not raise it.

### Section 14 — Tornado sensitivity

For each input variable defined in the scenario framework (§13), compute the tornado:

- For each input: hold all other inputs at base values, perturb that single input by ±1σ (one historical standard deviation of monthly changes; computed from the market series itself or from the metric's history for internal levers).
- Run `apply_scenario` twice (positive and negative perturbation).
- Record the resulting €-impact on the 12-month revenue and the percentage-point impact on db2_margin.
- Sort by `|impact_eur|` descending.

Persist to `notebooks/output/tornado_default.json` with structure:

```
{
  base_scenario_id: null,
  computed_at: <ts>,
  bars: [
    { input: 'steel_hrc', unit: '%', perturb_pos: +12.4, perturb_neg: -12.4,
      delta_revenue_eur_pos: -82000, delta_revenue_eur_neg: +78000,
      delta_db2_margin_pp_pos: -0.6, delta_db2_margin_pp_neg: +0.5,
      cluster_breakdown: { BKAES: ..., BKAGG: ..., ... } }
  ]
}
```

Plot the tornado as a horizontal bar chart, sorted, with positive perturbation in one color and negative in another. This is the headline visual that will become `TornadoCard.tsx` later.

**Acceptance:** ≥ 6 inputs in the tornado; sort order is stable; the top input is consistent with the strongest correlations from §11 (sanity check — if EUR/USD has 0.05 correlation it shouldn't lead the tornado).

### Section 15 — Named scenarios (seed for production)

Define three named scenarios using the scenario framework and run each through `apply_scenario`:

1. **Base case.** All perturbations zero. Reference point.
2. **Steel shock +10%.** Steel HRC × 1.10, everything else base. Use this to verify that high-steel commodity groups (BKAES expected) compress more than low-steel groups.
3. **Multi-input shock.** Steel +10%, EUR/USD −5%, German PMI −3 index points. Mimics a "global industrial slowdown + currency strength" stress test that Till will ask about.

For each scenario, save the **inputs** and the **resulting per-cluster forecast** to `notebooks/output/scenarios_seed.json` so the production `scenarios` table can be seeded.

Plot a side-by-side comparison: 12-month revenue forecast under Base vs Steel shock vs Multi-input shock, one line per scenario, with the band shaded under each.

**Acceptance:** Steel shock produces a measurable margin compression on at least one commodity_group; Multi-input shock produces a larger compression than Steel shock alone; chart renders.

### Section 16 — Validation report + methodology export

Two automated cells:

- **`validation_report.md`** — programmatically write a markdown file at `notebooks/output/validation_report.md` that lists every acceptance criterion from Sections 3–15 and a ✅/❌ next to each, with the actual measured value. This becomes the gate before any of this gets into the backend.
- **`methodology.md`** — programmatically write `notebooks/output/methodology.md` that documents: which models were used, why each was chosen, the correlation map summary, the scenario definitions, every external data source with URL and date fetched, license attribution where applicable. This file will later be ingested as the source for the production "Methodology" panel on the forecasting page.

**Acceptance:** Both files exist, are non-empty, and pass a manual read.

---

## 4. Validation acceptance criteria (overall gate)

The notebook is considered "ready to hand to backend" only if:

1. All 4 internal parquets load with expected row counts and date ranges.
2. ≥ 24 market series successfully fetched and persisted.
3. Correlation map has at least one strong (|r| ≥ 0.4, p < 0.05, stable) external series per commodity_group.
4. At least 50% of commodity_groups have a forecasting winner model with walk-forward MAPE ≤ 8% on db2_margin.
5. Scenario builder runs in < 200 ms; sanity-check directional behavior holds (steel up ⇒ margin down on steel-heavy groups).
6. Tornado has ≥ 6 inputs and sort order is consistent with correlation strengths.
7. All five output artifacts (`market_series.parquet`, `correlation_map.json`, `forecast_baseline.json`, `tornado_default.json`, `scenarios_seed.json`) exist and pass schema validation against the shapes described in §3.

If any criterion fails, the notebook prints which one and stops at the failing section. The `validation_report.md` records the failure.

---

## 5. Output artifacts (the handoff to production)

When the notebook passes §4, these five files are the contract for the production backend:

| File | Becomes |
|---|---|
| `market_series.parquet` | First seed of the `market_observations` Postgres table. |
| `correlation_map.json` | First seed of the `commodity_to_market_map` table + the "Tracking: …" footnote text on every forecast block. |
| `forecast_baseline.json` | The shape `/api/v1/screens/forecast` returns. The production `compose_forecast` service will recompute live, but its output must match this shape byte-for-byte. |
| `tornado_default.json` | The shape `/api/v1/screens/forecast/tornado` returns. |
| `scenarios_seed.json` | Initial rows for the `scenarios` Postgres table — the three named scenarios visible to every user on day one. |
| `methodology.md` | Source text for the production Methodology panel on the forecasting page. |

The handoff is mechanical: each file maps to either a Postgres seed or an API response contract.

---

## 6. Open decisions to settle before Codex starts

These five questions should be answered (in chat, not in the notebook) before kickoff. Defaults below are my recommendations.

1. **Correlation strength floor.** Default `|r| ≥ 0.4`. Raise to 0.5 if too many low-signal series clutter the map.
2. **Lag window.** Default 0–3 months. Extend to 6 months if industry has long lead times — confirm with Frank.
3. **Tornado perturbation size.** Default ±1σ historical volatility per input. Alternative: fixed ±10% for consistency. Default wins on defensibility; fixed wins on visual simplicity.
4. **Walk-forward window.** Default 18 months. Shorter is less robust; longer eats into training data on a 48-month history.
5. **Scenario-perturbation math.** Default: market-series perturbations propagate through the cost-trajectory channel only (steel up → material_per_unit up → margin down). Volume / demand response is **not** modeled in v1 — flag this honestly in the methodology and revisit only after a real elasticity model exists. Trying to fake an elasticity model on 4 years of data will fail Frank's persona test.

---

## 7. What this notebook is NOT

So scope creep doesn't happen mid-execution:

- **Not a backend.** No FastAPI, no SQLAlchemy, no Alembic. Outputs are flat files.
- **Not a UI.** No streamlit, no plotly dashboards. Matplotlib for static plots is enough.
- **Not a productionized ETL.** No cron, no error monitoring, no schema migrations. The production ETL (`scripts/fetch_market_data.py`) is built later, informed by what worked here.
- **Not a churn / elasticity / LLM-scenario layer.** Those are future scope. The notebook strictly covers: forecasting + market correlation + tornado + named scenarios.
- **Not Till's or Heiko's data.** Frank's analyst cockpit only.

---

## 8. What happens after the notebook passes

1. The five output files are committed under `notebooks/output/` and tagged as the contract.
2. A new branch starts the backend work: migration `p19a_market_and_scenarios`, the `services/market_service.py`, the `services/forecast/tornado.py`, the `services/scenario_service.py`, plus the `scripts/fetch_market_data.py` and `scripts/compute_correlations.py` scripts. Each backend module is built to *match* what the notebook produced.
3. Frontend work (`TornadoCard`, `ScenarioLibrary`, `ScenarioBuilder`, `MarketTilesStrip`, `CorrelationFootnote`) starts only after the backend endpoints return the same shapes as the notebook's JSON outputs.
4. A `validation_report.md` regenerated from the production backend on real data should match the notebook's validation report within tolerance. If it doesn't, the production code is wrong, not the notebook.

---

## 9. Estimated effort

- Sections 1–4 (setup + internal data): ~1 hour.
- Sections 5–10 (five market-data sources + consolidation): ~3–4 hours. Most variance comes from Destatis quirks.
- Section 11 (correlations): ~1 hour.
- Section 12 (forecasting models + walk-forward): ~2 hours.
- Sections 13–14 (scenarios + tornado): ~2 hours.
- Section 15 (named scenarios): ~30 minutes.
- Section 16 (validation + methodology): ~1 hour.

Total: roughly one focused working day for Codex, plus a half-day of human review of the outputs before promoting to the contract.

---

## 10. Sources

- FRED API: <https://fred.stlouisfed.org/docs/api/fred/>
- Destatis Genesis-Online: <https://www-genesis.destatis.de/genesis/online>
- EIA Open Data v2: <https://www.eia.gov/opendata/>
- ECB Statistical Data Warehouse: <https://data.ecb.europa.eu/help/api/overview>
- Eurostat REST: <https://ec.europa.eu/eurostat/data/web-services>
- Pricefx Copilot launch (Jan 2026), Buynomics simulation engine, Vendavo SAP-BTP AI Pricing Assistant (April 2026), McKinsey "B2B pricing & AI" 2026 piece — for the methodology grounding.
