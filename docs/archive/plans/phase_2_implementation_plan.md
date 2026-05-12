# Scherzinger Margin Intelligence Platform — Phase 2 Implementation Plan

## Phase 2: Forecasting & Risk Intelligence (85% Feasibility)

### What We Have from Phase 1

| Asset | Details |
|-------|---------|
| **PostgreSQL Tables** | `invoices` (5,565), `quotes` (4,539), `customers` (1,438), `products` (1,798), `quote_invoice_links` (1,957), `rejection_codes` (15) |
| **Existing Models** | SQLAlchemy 2.0 ORM — `Invoice`, `Quote`, `Customer`, `Product`, `QuoteInvoiceLink`, `RejectionCode` |
| **API Endpoints** | FastAPI v1: `/margins/*`, `/quotes/*`, `/quality/*`, `/stats` |
| **Services** | `margin_service.py`, `quote_service.py`, `quality_service.py` |
| **Key Metrics** | DB2 margin (mean 0.6478), margin gap (mean 5.4pp, median 1.9pp), win rate (37.6%), linkage rate (89.9%), 9 commodity groups |
| **Data Spans** | 2022–2025 invoices + quotes, rejection codes reliable only from 2025 |

### Data Constraints for Phase 2

These constraints are **critical** — every task must respect them:

1. **Only 4 years of data** (2022–2025). Most time-series models need 3+ seasonal cycles. We have 4 years which is tight for seasonality but workable for basic forecasting.
2. **No external data sources** — no commodity prices, no CPI, no customer financials. All forecasting is purely internal.
3. **Rejection codes reliable only from 2025** — customer risk scoring cannot use rejection patterns from 2022–2024.
4. **802 quotes have DB2% = 100.0** (17.7%) — these are DQ-flagged (`dq_100pct_margin = True`). **Always exclude from model training.**
5. **96 quotes missing HKvoll** — no cost data. **Exclude from cost models.**
6. **20 invoices missing DB II Marge** — flagged `dq_missing_margin`. **Exclude from margin models.**
7. **Margin gap is quote_margin − invoice_margin** — positive means quoted higher than actual (margin erosion), negative means actual exceeded quote.
8. **S-prefix orders** (53 unmatched) are service orders — different margin behavior, may need separate treatment.

---

## Task 2.1: Database Schema Extensions

### New Tables

#### `margin_forecasts`
Stores per-entity margin forecast results.

```sql
CREATE TABLE margin_forecasts (
    id SERIAL PRIMARY KEY,
    entity_type VARCHAR NOT NULL,         -- 'customer', 'product', 'commodity_group'
    entity_id VARCHAR NOT NULL,
    forecast_date DATE NOT NULL,          -- target period start (e.g. 2025-04-01 for April 2025)
    horizon_months INTEGER NOT NULL,      -- 1, 3, 6, 12
    predicted_db2_margin FLOAT,
    prediction_lower FLOAT,               -- 90% CI lower bound
    prediction_upper FLOAT,               -- 90% CI upper bound
    model_type VARCHAR NOT NULL,          -- 'ema', 'linear_trend', 'seasonal_decomp'
    features_used JSONB,                  -- list of features used
    training_r2 FLOAT,                    -- R² on training data
    training_mae FLOAT,                   -- MAE on training data
    created_at TIMESTAMP DEFAULT NOW(),
    UNIQUE(entity_type, entity_id, forecast_date, horizon_months, model_type)
);
CREATE INDEX ix_forecast_entity ON margin_forecasts(entity_type, entity_id);
CREATE INDEX ix_forecast_date ON margin_forecasts(forecast_date);
```

#### `customer_risk_scores`
One row per customer per scoring run.

```sql
CREATE TABLE customer_risk_scores (
    id SERIAL PRIMARY KEY,
    customer_id VARCHAR NOT NULL,
    score_date DATE NOT NULL,              -- date of scoring run
    risk_score FLOAT NOT NULL,            -- 0.0 (safe) to 1.0 (high risk)
    risk_tier VARCHAR NOT NULL,           -- 'low', 'medium', 'high', 'critical'
    margin_trend_component FLOAT,          -- weighted contribution from margin trend
    gap_component FLOAT,                  -- weighted contribution from margin gap
    volume_component FLOAT,               -- weighted contribution from volume trend
    win_rate_component FLOAT,             -- weighted contribution from win rate
    rejection_component FLOAT,             -- weighted contribution from rejection patterns (2025 only)
    explanation JSONB,                     -- human-readable breakdown
    created_at TIMESTAMP DEFAULT NOW(),
    UNIQUE(customer_id, score_date)
);
CREATE INDEX ix_risk_customer ON customer_risk_scores(customer_id);
CREATE INDEX ix_risk_tier ON customer_risk_scores(risk_tier);
CREATE INDEX ix_risk_date ON customer_risk_scores(score_date);
```

#### `product_cost_trends`
Stores computed cost trajectory per product.

```sql
CREATE TABLE product_cost_trends (
    id SERIAL PRIMARY KEY,
    article_id VARCHAR NOT NULL,
    period_start DATE NOT NULL,
    period_end DATE NOT NULL,
    avg_hkvoll_per_unit FLOAT,
    avg_material_per_unit FLOAT,
    avg_fek_per_unit FLOAT,
    avg_fv_per_unit FLOAT,
    cost_change_pct FLOAT,               -- vs previous period
    record_count INTEGER,
    created_at TIMESTAMP DEFAULT NOW(),
    UNIQUE(article_id, period_start)
);
CREATE INDEX ix_cost_article ON product_cost_trends(article_id);
```

#### `seasonal_patterns`
Stores detected seasonal patterns per entity.

```sql
CREATE TABLE seasonal_patterns (
    id SERIAL PRIMARY KEY,
    entity_type VARCHAR NOT NULL,         -- 'overall', 'commodity_group', 'customer'
    entity_id VARCHAR,                    -- NULL for 'overall'
    month INTEGER NOT NULL,               -- 1-12
    seasonal_index FLOAT NOT NULL,        -- 1.0 = average, 1.1 = 10% above, etc.
    avg_margin FLOAT,
    avg_revenue FLOAT,
    sample_count INTEGER,
    years_included INTEGER[],             -- e.g. {2022, 2023, 2024, 2025}
    created_at TIMESTAMP DEFAULT NOW(),
    UNIQUE(entity_type, entity_id, month)
);
CREATE INDEX ix_seasonal_entity ON seasonal_patterns(entity_type, entity_id);
```

#### `commodity_benchmarks`
Per-commodity-group aggregated benchmarks.

```sql
CREATE TABLE commodity_benchmarks (
    id SERIAL PRIMARY KEY,
    commodity_group VARCHAR NOT NULL,
    year INTEGER NOT NULL,
    quarter INTEGER,                      -- NULL for annual
    avg_db2_margin FLOAT,
    weighted_db2_margin FLOAT,
    median_db2_margin FLOAT,
    p25_db2_margin FLOAT,
    p75_db2_margin FLOAT,
    total_revenue FLOAT,
    total_records INTEGER,
    avg_win_rate FLOAT,                   -- from quotes for this commodity
    avg_margin_gap FLOAT,                 -- from linkage
    created_at TIMESTAMP DEFAULT NOW(),
    UNIQUE(commodity_group, year, quarter)
);
CREATE INDEX ix_bench_cg ON commodity_benchmarks(commodity_group);
```

#### `monte_carlo_results`
Stores simulation outputs.

```sql
CREATE TABLE monte_carlo_results (
    id SERIAL PRIMARY KEY,
    simulation_id VARCHAR NOT NULL,       -- UUID per simulation run
    entity_type VARCHAR NOT NULL,
    entity_id VARCHAR NOT NULL,
    horizon_months INTEGER NOT NULL,
    n_simulations INTEGER NOT NULL,       -- typically 10000
    mean_margin FLOAT,
    median_margin FLOAT,
    p5_margin FLOAT,                      -- 5th percentile (worst case)
    p25_margin FLOAT,
    p75_margin FLOAT,
    p95_margin FLOAT,                     -- 95th percentile (best case)
    prob_below_threshold FLOAT,           -- P(margin < threshold)
    threshold_used FLOAT,                 -- the threshold value
    parameters JSONB,                     -- simulation parameters
    created_at TIMESTAMP DEFAULT NOW()
);
CREATE INDEX ix_mc_sim ON monte_carlo_results(simulation_id);
CREATE INDEX ix_mc_entity ON monte_carlo_results(entity_type, entity_id);
```

#### `backtest_results`
Stores forecast accuracy assessments.

```sql
CREATE TABLE backtest_results (
    id SERIAL PRIMARY KEY,
    model_type VARCHAR NOT NULL,
    entity_type VARCHAR NOT NULL,
    entity_id VARCHAR,                    -- NULL for global backtest
    train_start DATE,
    train_end DATE,
    test_start DATE,
    test_end DATE,
    horizon_months INTEGER NOT NULL,
    mae FLOAT,
    rmse FLOAT,
    mape FLOAT,                           -- mean absolute percentage error
    directional_accuracy FLOAT,           -- % of correct up/down predictions
    n_test_periods INTEGER,
    created_at TIMESTAMP DEFAULT NOW()
);
CREATE INDEX ix_bt_model ON backtest_results(model_type);
```

### SQLAlchemy Models

Create these in `backend/models/`:

**File: `backend/models/forecast.py`**
```python
from sqlalchemy import String, Integer, Float, Date, DateTime, JSON, UniqueConstraint, Index, ARRAY, func
from sqlalchemy.orm import Mapped, mapped_column
from backend.database import Base


class MarginForecast(Base):
    __tablename__ = "margin_forecasts"
    __table_args__ = (
        UniqueConstraint("entity_type", "entity_id", "forecast_date", "horizon_months", "model_type",
                         name="uq_forecast_entity_date_model"),
        Index("ix_forecast_entity", "entity_type", "entity_id"),
        Index("ix_forecast_date", "forecast_date"),
    )

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    entity_type: Mapped[str] = mapped_column(String)
    entity_id: Mapped[str] = mapped_column(String)
    forecast_date: Mapped[Date] = mapped_column(Date)
    horizon_months: Mapped[int] = mapped_column(Integer)
    predicted_db2_margin: Mapped[float | None] = mapped_column(Float, nullable=True)
    prediction_lower: Mapped[float | None] = mapped_column(Float, nullable=True)
    prediction_upper: Mapped[float | None] = mapped_column(Float, nullable=True)
    model_type: Mapped[str] = mapped_column(String)
    features_used: Mapped[dict | None] = mapped_column(JSON, nullable=True)
    training_r2: Mapped[float | None] = mapped_column(Float, nullable=True)
    training_mae: Mapped[float | None] = mapped_column(Float, nullable=True)
    created_at = mapped_column(DateTime, server_default=func.now())
```

**File: `backend/models/risk_score.py`**
```python
from sqlalchemy import String, Integer, Float, Date, DateTime, JSON, UniqueConstraint, Index, func
from sqlalchemy.orm import Mapped, mapped_column
from backend.database import Base


class CustomerRiskScore(Base):
    __tablename__ = "customer_risk_scores"
    __table_args__ = (
        UniqueConstraint("customer_id", "score_date", name="uq_risk_customer_date"),
        Index("ix_risk_customer", "customer_id"),
        Index("ix_risk_tier", "risk_tier"),
        Index("ix_risk_date", "score_date"),
    )

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    customer_id: Mapped[str] = mapped_column(String)
    score_date: Mapped[Date] = mapped_column(Date)
    risk_score: Mapped[float] = mapped_column(Float)
    risk_tier: Mapped[str] = mapped_column(String)
    margin_trend_component: Mapped[float | None] = mapped_column(Float, nullable=True)
    gap_component: Mapped[float | None] = mapped_column(Float, nullable=True)
    volume_component: Mapped[float | None] = mapped_column(Float, nullable=True)
    win_rate_component: Mapped[float | None] = mapped_column(Float, nullable=True)
    rejection_component: Mapped[float | None] = mapped_column(Float, nullable=True)
    explanation: Mapped[dict | None] = mapped_column(JSON, nullable=True)
    created_at = mapped_column(DateTime, server_default=func.now())
```

**File: `backend/models/cost_trend.py`**
```python
from sqlalchemy import String, Integer, Float, Date, DateTime, UniqueConstraint, Index, func
from sqlalchemy.orm import Mapped, mapped_column
from backend.database import Base


class ProductCostTrend(Base):
    __tablename__ = "product_cost_trends"
    __table_args__ = (
        UniqueConstraint("article_id", "period_start", name="uq_cost_article_period"),
        Index("ix_cost_article", "article_id"),
    )

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    article_id: Mapped[str] = mapped_column(String)
    period_start: Mapped[Date] = mapped_column(Date)
    period_end: Mapped[Date] = mapped_column(Date)
    avg_hkvoll_per_unit: Mapped[float | None] = mapped_column(Float, nullable=True)
    avg_material_per_unit: Mapped[float | None] = mapped_column(Float, nullable=True)
    avg_fek_per_unit: Mapped[float | None] = mapped_column(Float, nullable=True)
    avg_fv_per_unit: Mapped[float | None] = mapped_column(Float, nullable=True)
    cost_change_pct: Mapped[float | None] = mapped_column(Float, nullable=True)
    record_count: Mapped[int | None] = mapped_column(Integer, nullable=True)
    created_at = mapped_column(DateTime, server_default=func.now())
```

**File: `backend/models/seasonal.py`**
```python
from sqlalchemy import String, Integer, Float, DateTime, ARRAY, UniqueConstraint, Index, func
from sqlalchemy.orm import Mapped, mapped_column
from backend.database import Base


class SeasonalPattern(Base):
    __tablename__ = "seasonal_patterns"
    __table_args__ = (
        UniqueConstraint("entity_type", "entity_id", "month", name="uq_seasonal_entity_month"),
        Index("ix_seasonal_entity", "entity_type", "entity_id"),
    )

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    entity_type: Mapped[str] = mapped_column(String)
    entity_id: Mapped[str | None] = mapped_column(String, nullable=True)
    month: Mapped[int] = mapped_column(Integer)
    seasonal_index: Mapped[float] = mapped_column(Float)
    avg_margin: Mapped[float | None] = mapped_column(Float, nullable=True)
    avg_revenue: Mapped[float | None] = mapped_column(Float, nullable=True)
    sample_count: Mapped[int | None] = mapped_column(Integer, nullable=True)
    years_included = mapped_column(ARRAY(Integer), nullable=True)
    created_at = mapped_column(DateTime, server_default=func.now())
```

**File: `backend/models/benchmark.py`**
```python
from sqlalchemy import String, Integer, Float, DateTime, UniqueConstraint, Index, func
from sqlalchemy.orm import Mapped, mapped_column
from backend.database import Base


class CommodityBenchmark(Base):
    __tablename__ = "commodity_benchmarks"
    __table_args__ = (
        UniqueConstraint("commodity_group", "year", "quarter", name="uq_bench_cg_year_q"),
        Index("ix_bench_cg", "commodity_group"),
    )

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    commodity_group: Mapped[str] = mapped_column(String)
    year: Mapped[int] = mapped_column(Integer)
    quarter: Mapped[int | None] = mapped_column(Integer, nullable=True)
    avg_db2_margin: Mapped[float | None] = mapped_column(Float, nullable=True)
    weighted_db2_margin: Mapped[float | None] = mapped_column(Float, nullable=True)
    median_db2_margin: Mapped[float | None] = mapped_column(Float, nullable=True)
    p25_db2_margin: Mapped[float | None] = mapped_column(Float, nullable=True)
    p75_db2_margin: Mapped[float | None] = mapped_column(Float, nullable=True)
    total_revenue: Mapped[float | None] = mapped_column(Float, nullable=True)
    total_records: Mapped[int | None] = mapped_column(Integer, nullable=True)
    avg_win_rate: Mapped[float | None] = mapped_column(Float, nullable=True)
    avg_margin_gap: Mapped[float | None] = mapped_column(Float, nullable=True)
    created_at = mapped_column(DateTime, server_default=func.now())
```

**File: `backend/models/monte_carlo.py`**
```python
from sqlalchemy import String, Integer, Float, DateTime, JSON, Index, func
from sqlalchemy.orm import Mapped, mapped_column
from backend.database import Base


class MonteCarloResult(Base):
    __tablename__ = "monte_carlo_results"
    __table_args__ = (
        Index("ix_mc_sim", "simulation_id"),
        Index("ix_mc_entity", "entity_type", "entity_id"),
    )

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    simulation_id: Mapped[str] = mapped_column(String)
    entity_type: Mapped[str] = mapped_column(String)
    entity_id: Mapped[str] = mapped_column(String)
    horizon_months: Mapped[int] = mapped_column(Integer)
    n_simulations: Mapped[int] = mapped_column(Integer)
    mean_margin: Mapped[float | None] = mapped_column(Float, nullable=True)
    median_margin: Mapped[float | None] = mapped_column(Float, nullable=True)
    p5_margin: Mapped[float | None] = mapped_column(Float, nullable=True)
    p25_margin: Mapped[float | None] = mapped_column(Float, nullable=True)
    p75_margin: Mapped[float | None] = mapped_column(Float, nullable=True)
    p95_margin: Mapped[float | None] = mapped_column(Float, nullable=True)
    prob_below_threshold: Mapped[float | None] = mapped_column(Float, nullable=True)
    threshold_used: Mapped[float | None] = mapped_column(Float, nullable=True)
    parameters: Mapped[dict | None] = mapped_column(JSON, nullable=True)
    created_at = mapped_column(DateTime, server_default=func.now())
```

**File: `backend/models/backtest.py`**
```python
from sqlalchemy import String, Integer, Float, Date, DateTime, Index, func
from sqlalchemy.orm import Mapped, mapped_column
from backend.database import Base


class BacktestResult(Base):
    __tablename__ = "backtest_results"
    __table_args__ = (
        Index("ix_bt_model", "model_type"),
    )

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    model_type: Mapped[str] = mapped_column(String)
    entity_type: Mapped[str] = mapped_column(String)
    entity_id: Mapped[str | None] = mapped_column(String, nullable=True)
    train_start: Mapped[Date | None] = mapped_column(Date, nullable=True)
    train_end: Mapped[Date | None] = mapped_column(Date, nullable=True)
    test_start: Mapped[Date | None] = mapped_column(Date, nullable=True)
    test_end: Mapped[Date | None] = mapped_column(Date, nullable=True)
    horizon_months: Mapped[int] = mapped_column(Integer)
    mae: Mapped[float | None] = mapped_column(Float, nullable=True)
    rmse: Mapped[float | None] = mapped_column(Float, nullable=True)
    mape: Mapped[float | None] = mapped_column(Float, nullable=True)
    directional_accuracy: Mapped[float | None] = mapped_column(Float, nullable=True)
    n_test_periods: Mapped[int | None] = mapped_column(Integer, nullable=True)
    created_at = mapped_column(DateTime, server_default=func.now())
```

### Update `backend/models/__init__.py`

```python
from backend.models.customer import Customer
from backend.models.product import Product
from backend.models.invoice import Invoice
from backend.models.quote import Quote
from backend.models.linkage import QuoteInvoiceLink
from backend.models.rejection_code import RejectionCode
from backend.models.forecast import MarginForecast
from backend.models.risk_score import CustomerRiskScore
from backend.models.cost_trend import ProductCostTrend
from backend.models.seasonal import SeasonalPattern
from backend.models.benchmark import CommodityBenchmark
from backend.models.monte_carlo import MonteCarloResult
from backend.models.backtest import BacktestResult

__all__ = [
    "Customer", "Product", "Invoice", "Quote", "QuoteInvoiceLink", "RejectionCode",
    "MarginForecast", "CustomerRiskScore", "ProductCostTrend", "SeasonalPattern",
    "CommodityBenchmark", "MonteCarloResult", "BacktestResult",
]
```

### Alembic Migration

Generate a new migration:
```bash
cd scherzinger-platform
alembic revision --autogenerate -m "phase_2_forecasting_tables"
alembic upgrade head
```

### Verification

After migration, run:
```sql
SELECT table_name FROM information_schema.tables WHERE table_schema = 'public' ORDER BY table_name;
```
Expected: 13 tables (6 from Phase 1 + 7 new).

---

## Task 2.2: Cost Adjustment Model

### Purpose
Track how manufacturing costs (HKvoll, material, FEK, outsourcing) change over time per product — the foundation for understanding margin drift.

### Script: `scripts/compute_cost_trends.py`

### Logic

1. **Query invoices** grouped by `article_id` and quarter:
```sql
SELECT article_id, year, quarter,
    AVG(hkvoll_per_unit) as avg_hkvoll,
    AVG(material_per_unit) as avg_material,
    AVG(fek_per_unit) as avg_fek,
    AVG(fv_per_unit) as avg_fv,
    COUNT(*) as n
FROM invoices
WHERE hkvoll_per_unit IS NOT NULL
    AND dq_missing_margin = FALSE
    AND dq_negative_margin = FALSE
GROUP BY article_id, year, quarter
HAVING COUNT(*) >= 2
ORDER BY article_id, year, quarter
```

2. **Filter**: Only products with ≥3 quarters of data (enough to compute a trend).

3. **Compute `cost_change_pct`**: For each product-quarter, calculate `(current_avg_hkvoll - previous_avg_hkvoll) / previous_avg_hkvoll`. First quarter for each product gets `NULL`.

4. **Insert into `product_cost_trends`**: One row per product per quarter.

5. **Period dates**: For quarter Q in year Y:
   - `period_start` = first day of quarter (Y-01-01 for Q1, Y-04-01 for Q2, etc.)
   - `period_end` = last day of quarter

### Critical Implementation Notes

- **Exclude negative-margin invoice records** (`dq_negative_margin = FALSE`) — they distort cost averages.
- **The `hkvoll_per_unit` column** in invoices is `HKvoll\n/ Stck.` from raw data — Phase 1 already normalized this to `hkvoll_per_unit` in the DB.
- **Quantity-weight the averages**: Use `SUM(hkvoll_per_unit * quantity) / SUM(quantity)` instead of simple `AVG(hkvoll_per_unit)` for more accurate cost representation when order sizes vary.
- **Handle products with only 1 invoice per quarter**: Set `record_count` but note low confidence — add a `min_records_warning` flag or comment.

### Output Validation

```python
# After insertion, verify:
# 1. No NULL article_id
assert db.execute(text("SELECT COUNT(*) FROM product_cost_trends WHERE article_id IS NULL")).scalar() == 0

# 2. period_start < period_end for all rows
assert db.execute(text("SELECT COUNT(*) FROM product_cost_trends WHERE period_start >= period_end")).scalar() == 0

# 3. Reasonable cost_change_pct range (flag >50% swings)
extreme = db.execute(text("SELECT COUNT(*) FROM product_cost_trends WHERE ABS(cost_change_pct) > 0.5")).scalar()
print(f"WARNING: {extreme} records with >50% cost swing — investigate outliers")
```

---

## Task 2.3: Margin Forecast Score

### Purpose
Predict future DB2 margins at entity level (customer, product, commodity_group) using multiple model approaches, then ensemble them.

### Script: `scripts/compute_forecasts.py`

### Data Preparation

For each entity type, aggregate monthly weighted DB2 margins:

```sql
-- Example for customer level
SELECT customer_id, year, month,
    CASE WHEN SUM(revenue) > 0 THEN SUM(db2_total) / SUM(revenue) ELSE NULL END as weighted_margin,
    SUM(revenue) as total_revenue,
    COUNT(*) as n_records
FROM invoices
WHERE db2_margin IS NOT NULL AND dq_any_issue = FALSE
GROUP BY customer_id, year, month
ORDER BY customer_id, year, month
```

**Minimum data requirement**: At least 12 monthly observations to attempt forecasting. Skip entities with fewer.

### Model 1: Exponential Moving Average (EMA)

Simplest, most robust. Use as the fallback for entities with limited data (12–23 months).

```python
def ema_forecast(series, span=6):
    """
    series: pd.Series of monthly margins, sorted chronologically.
    Returns predicted margin and confidence interval.
    """
    ema = series.ewm(span=span, adjust=False).mean()
    last_ema = ema.iloc[-1]
    residuals = series - ema
    std = residuals.std()
    return {
        "predicted": last_ema,
        "lower": last_ema - 1.645 * std,  # 90% CI
        "upper": last_ema + 1.645 * std,
    }
```

### Model 2: Linear Trend

For entities with 18+ months of data. Fits OLS on monthly margins.

```python
import numpy as np
from scipy import stats

def linear_trend_forecast(series, months_ahead=3):
    """
    series: pd.Series indexed 0..n-1 (monthly).
    """
    x = np.arange(len(series))
    slope, intercept, r_value, p_value, std_err = stats.linregress(x, series.values)
    future_x = len(series) + months_ahead - 1
    predicted = intercept + slope * future_x
    residuals = series.values - (intercept + slope * x)
    residual_std = residuals.std()
    return {
        "predicted": predicted,
        "lower": predicted - 1.645 * residual_std,
        "upper": predicted + 1.645 * residual_std,
        "r2": r_value ** 2,
        "slope": slope,
    }
```

### Model 3: Seasonal Decomposition + Trend

For entities with 24+ months. Decompose monthly margins into trend + seasonal + residual.

```python
from statsmodels.tsa.seasonal import seasonal_decompose

def seasonal_forecast(series, months_ahead=3):
    """
    series: pd.Series with DatetimeIndex, monthly frequency.
    Needs at least 2 full years (24 observations).
    """
    decomp = seasonal_decompose(series, model='additive', period=12, extrapolate_trend='freq')
    # Extrapolate trend linearly
    trend = decomp.trend.dropna()
    x = np.arange(len(trend))
    slope, intercept, _, _, _ = stats.linregress(x, trend.values)
    future_trend = intercept + slope * (len(trend) + months_ahead - 1)
    # Get seasonal component for target month
    target_month = (series.index[-1].month + months_ahead - 1) % 12 + 1
    seasonal_vals = decomp.seasonal.groupby(decomp.seasonal.index.month).mean()
    future_seasonal = seasonal_vals.get(target_month, 0)
    predicted = future_trend + future_seasonal
    residual_std = decomp.resid.dropna().std()
    return {
        "predicted": predicted,
        "lower": predicted - 1.645 * residual_std,
        "upper": predicted + 1.645 * residual_std,
    }
```

### Ensemble Strategy

For entities with enough data for multiple models:
```python
def ensemble_forecast(ema_result, trend_result, seasonal_result=None):
    """Weight by model confidence. EMA=0.3, Trend=0.3, Seasonal=0.4 (if available)."""
    if seasonal_result:
        weights = [0.3, 0.3, 0.4]
        predictions = [ema_result["predicted"], trend_result["predicted"], seasonal_result["predicted"]]
    else:
        weights = [0.5, 0.5]
        predictions = [ema_result["predicted"], trend_result["predicted"]]

    predicted = sum(w * p for w, p in zip(weights, predictions))
    # CI: widest interval across models (conservative)
    all_lowers = [r["lower"] for r in [ema_result, trend_result] + ([seasonal_result] if seasonal_result else [])]
    all_uppers = [r["upper"] for r in [ema_result, trend_result] + ([seasonal_result] if seasonal_result else [])]
    return {
        "predicted": predicted,
        "lower": min(all_lowers),
        "upper": max(all_uppers),
        "model_type": "ensemble_3" if seasonal_result else "ensemble_2",
    }
```

### Forecast Horizons

Generate forecasts for 1, 3, 6, and 12 months ahead.

### Critical Implementation Notes

- **Add `statsmodels>=0.14.0` to requirements.txt** — needed for seasonal decomposition.
- **Clip margin predictions to [-1.0, 1.0]** — don't allow forecasts to go beyond reasonable bounds.
- **Use revenue-weighted margins** at the entity level, not simple averages. An entity that does one €50 order at 80% margin and one €50,000 order at 40% margin has an effective margin of ~40%, not 60%.
- **Store the model selection reason** in `features_used` JSON: `{"data_months": 36, "model_selected": "seasonal", "ema_span": 6}`.
- **Run for all three entity types**: customer (top 200 by revenue), product (top 300 by revenue), all 9 commodity groups.

---

## Task 2.4: Customer Risk Scoring

### Purpose
Assign a composite risk score (0–1) to each customer, identifying those at risk of margin erosion, volume decline, or loss.

### Script: `scripts/compute_risk_scores.py`

### Risk Components (5 signals, weighted)

#### Component 1: Margin Trend (weight: 0.30)

```python
def margin_trend_score(customer_id, db):
    """Lower margin trend = higher risk."""
    rows = db.execute(text("""
        SELECT year, quarter,
            CASE WHEN SUM(revenue) > 0 THEN SUM(db2_total) / SUM(revenue) ELSE NULL END as wt_margin
        FROM invoices
        WHERE customer_id = :cid AND db2_margin IS NOT NULL AND dq_any_issue = FALSE
        GROUP BY year, quarter
        ORDER BY year, quarter
    """), {"cid": customer_id}).fetchall()

    if len(rows) < 4:
        return 0.5  # neutral — not enough data

    margins = [r[2] for r in rows if r[2] is not None]
    # Compare last 4 quarters average vs first 4 quarters average
    recent = np.mean(margins[-4:])
    early = np.mean(margins[:4])
    delta = recent - early

    # Map: delta <= -0.10 → score 1.0 (high risk)
    # delta >= +0.05 → score 0.0 (no risk)
    # Linear interpolation in between
    score = np.clip((0.05 - delta) / 0.15, 0.0, 1.0)
    return float(score)
```

#### Component 2: Margin Gap (weight: 0.25)

```python
def gap_score(customer_id, db):
    """Large positive gap (quoted >> actual) = higher risk of cost/scope creep."""
    row = db.execute(text("""
        SELECT AVG(l.margin_gap), COUNT(*)
        FROM quote_invoice_links l
        JOIN quotes q ON l.quote_id = q.quote_id AND l.quote_position = q.position
        WHERE q.customer_id = :cid AND l.margin_gap IS NOT NULL
    """), {"cid": customer_id}).fetchone()

    if row[1] < 3:
        return 0.5  # neutral

    avg_gap = row[0]
    # Map: avg_gap >= 0.15 → 1.0 (high risk), avg_gap <= 0 → 0.0
    score = np.clip(avg_gap / 0.15, 0.0, 1.0)
    return float(score)
```

#### Component 3: Volume Trend (weight: 0.20)

```python
def volume_score(customer_id, db):
    """Declining order volume = higher risk."""
    rows = db.execute(text("""
        SELECT year, SUM(revenue), COUNT(*)
        FROM invoices
        WHERE customer_id = :cid
        GROUP BY year
        ORDER BY year
    """), {"cid": customer_id}).fetchall()

    if len(rows) < 2:
        return 0.5

    # Compare most recent year to average of prior years
    recent_rev = rows[-1][1]
    prior_avg = np.mean([r[1] for r in rows[:-1]])

    if prior_avg == 0:
        return 0.5

    change = (recent_rev - prior_avg) / prior_avg
    # Map: change <= -0.30 → 1.0, change >= 0.10 → 0.0
    score = np.clip((0.10 - change) / 0.40, 0.0, 1.0)
    return float(score)
```

#### Component 4: Win Rate (weight: 0.15)

```python
def win_rate_score(customer_id, db):
    """Low/declining win rate = higher risk of losing customer."""
    rows = db.execute(text("""
        SELECT year,
            COUNT(*) as total,
            SUM(CASE WHEN is_won THEN 1 ELSE 0 END) as won
        FROM quotes
        WHERE customer_id = :cid
        GROUP BY year
        ORDER BY year
    """), {"cid": customer_id}).fetchall()

    if not rows or sum(r[1] for r in rows) < 5:
        return 0.5

    # Recent win rate
    recent = rows[-1]
    recent_wr = recent[2] / recent[1] if recent[1] > 0 else 0.5

    # Map: wr <= 0.15 → 1.0, wr >= 0.50 → 0.0
    score = np.clip((0.50 - recent_wr) / 0.35, 0.0, 1.0)
    return float(score)
```

#### Component 5: Rejection Pattern (weight: 0.10)

**IMPORTANT**: Only use 2025 data. Pre-2025 rejection codes are unreliable.

```python
def rejection_score(customer_id, db):
    """High price-loss ratio in 2025 = risk signal."""
    row = db.execute(text("""
        SELECT
            COUNT(*) FILTER (WHERE rejection_code IN ('PA', 'PR')) as price_lost,
            COUNT(*) FILTER (WHERE NOT is_won) as total_lost
        FROM quotes
        WHERE customer_id = :cid AND year = 2025
    """), {"cid": customer_id}).fetchone()

    if row[1] < 3:
        return 0.5  # neutral

    price_ratio = row[0] / row[1]
    # Map: ratio >= 0.50 → 1.0, ratio <= 0.10 → 0.0
    score = np.clip((price_ratio - 0.10) / 0.40, 0.0, 1.0)
    return float(score)
```

### Composite Score

```python
WEIGHTS = {
    "margin_trend": 0.30,
    "gap": 0.25,
    "volume": 0.20,
    "win_rate": 0.15,
    "rejection": 0.10,
}

def compute_risk_score(customer_id, db):
    components = {
        "margin_trend": margin_trend_score(customer_id, db),
        "gap": gap_score(customer_id, db),
        "volume": volume_score(customer_id, db),
        "win_rate": win_rate_score(customer_id, db),
        "rejection": rejection_score(customer_id, db),
    }

    composite = sum(WEIGHTS[k] * components[k] for k in WEIGHTS)

    # Tier mapping
    if composite >= 0.75:
        tier = "critical"
    elif composite >= 0.50:
        tier = "high"
    elif composite >= 0.25:
        tier = "medium"
    else:
        tier = "low"

    return {
        "risk_score": round(composite, 4),
        "risk_tier": tier,
        "margin_trend_component": components["margin_trend"],
        "gap_component": components["gap"],
        "volume_component": components["volume"],
        "win_rate_component": components["win_rate"],
        "rejection_component": components["rejection"],
        "explanation": {
            "weights": WEIGHTS,
            "component_scores": components,
            "highest_risk_factor": max(components, key=components.get),
        },
    }
```

### Scope

Score **all customers with ≥5 invoices** across the dataset (not just top-N). Expected ~400–600 customers qualify.

### Output

Insert one row per customer into `customer_risk_scores` with `score_date = CURRENT_DATE`.

### Verification

```python
# Tier distribution check — expect roughly:
# low: 40-60%, medium: 20-30%, high: 10-20%, critical: 5-10%
for tier in ['low', 'medium', 'high', 'critical']:
    n = db.execute(text(f"SELECT COUNT(*) FROM customer_risk_scores WHERE risk_tier = '{tier}'")).scalar()
    print(f"  {tier}: {n}")

# No NULL risk_score
assert db.execute(text("SELECT COUNT(*) FROM customer_risk_scores WHERE risk_score IS NULL")).scalar() == 0

# All scores in [0, 1]
assert db.execute(text("SELECT COUNT(*) FROM customer_risk_scores WHERE risk_score < 0 OR risk_score > 1")).scalar() == 0
```

---

## Task 2.5: Product Cost Trends

### Purpose
Analyze and store quarterly cost trajectories per product, identifying products with rising costs that compress margins.

This is largely computed in Task 2.2. This task extends it with **aggregation views** and **alert logic**.

### Script: `scripts/analyze_cost_trends.py`

This script runs AFTER `compute_cost_trends.py` and builds additional analytics:

### 1. Top Cost Increasers

```sql
-- Products with highest cost increase in most recent quarter vs year ago
SELECT pct.article_id,
    pct.avg_hkvoll_per_unit as current_cost,
    prev.avg_hkvoll_per_unit as previous_cost,
    pct.cost_change_pct,
    p.description, p.commodity_group
FROM product_cost_trends pct
JOIN product_cost_trends prev ON pct.article_id = prev.article_id
    AND prev.period_start = pct.period_start - INTERVAL '1 year'
JOIN products p ON pct.article_id = p.article_id
WHERE pct.period_start = (SELECT MAX(period_start) FROM product_cost_trends)
ORDER BY pct.cost_change_pct DESC
LIMIT 20
```

### 2. Cost vs Margin Correlation

For each product, compare cost trajectory with margin trajectory:

```python
def cost_margin_correlation(article_id, db):
    """Check if rising costs are compressing margins."""
    rows = db.execute(text("""
        SELECT pct.period_start, pct.avg_hkvoll_per_unit,
            AVG(i.db2_margin) as avg_margin
        FROM product_cost_trends pct
        JOIN invoices i ON pct.article_id = i.article_id
            AND i.year = EXTRACT(YEAR FROM pct.period_start)
            AND i.quarter = EXTRACT(QUARTER FROM pct.period_start)
        WHERE pct.article_id = :aid AND i.db2_margin IS NOT NULL
        GROUP BY pct.period_start, pct.avg_hkvoll_per_unit
        ORDER BY pct.period_start
    """), {"aid": article_id}).fetchall()

    if len(rows) < 4:
        return None

    costs = [r[1] for r in rows]
    margins = [r[2] for r in rows]
    corr, p_val = stats.pearsonr(costs, margins)
    return {"correlation": corr, "p_value": p_val}
```

### 3. Material vs Labor Cost Split

Track the **composition** of cost increases:

```python
# For products with rising HKvoll, identify the driver
# Is it material_per_unit or fek_per_unit (labor)?
# Output: list of products where material is the primary driver vs labor
```

### Output

- Insert trend records into `product_cost_trends` (Task 2.2)
- Print a summary report to console + save as `data/cleaned/cost_trend_report.txt`
- Report includes: top 20 cost risers, top 20 margin-compressed products, material vs labor split

---

## Task 2.6: Seasonal Patterns

### Purpose
Detect and store monthly seasonal patterns in margins and revenue, enabling seasonal-adjusted forecasting.

### Script: `scripts/compute_seasonal_patterns.py`

### Logic

#### Level 1: Overall Seasonality

```python
def compute_overall_seasonal(db):
    """Compute monthly seasonal indices from all invoices."""
    rows = db.execute(text("""
        SELECT month,
            AVG(db2_margin) as avg_margin,
            SUM(revenue) / COUNT(DISTINCT year) as avg_monthly_revenue,
            COUNT(*) as n,
            ARRAY_AGG(DISTINCT year) as years
        FROM invoices
        WHERE db2_margin IS NOT NULL AND dq_any_issue = FALSE
        GROUP BY month
        ORDER BY month
    """)).fetchall()

    # Grand average across all months
    grand_avg_margin = np.mean([r[1] for r in rows])

    patterns = []
    for r in rows:
        seasonal_index = r[1] / grand_avg_margin if grand_avg_margin != 0 else 1.0
        patterns.append({
            "entity_type": "overall",
            "entity_id": None,
            "month": r[0],
            "seasonal_index": seasonal_index,
            "avg_margin": r[1],
            "avg_revenue": r[2],
            "sample_count": r[3],
            "years_included": r[4],
        })
    return patterns
```

#### Level 2: By Commodity Group

Same logic, but grouped by `commodity_group`:

```python
# GROUP BY commodity_group, month
# entity_type = 'commodity_group', entity_id = commodity_group value
```

#### Level 3: By Top Customers

Only for customers with ≥48 invoices (1/month average over 4 years) — ensures enough data per month.

```python
# For each qualifying customer:
# GROUP BY month
# entity_type = 'customer', entity_id = customer_id
```

### Seasonal Index Interpretation

- `seasonal_index = 1.0` → average month
- `seasonal_index = 1.1` → margins are 10% above average in this month
- `seasonal_index = 0.85` → margins are 15% below average

### Critical Notes

- **4 years is borderline** for seasonal detection. Print a confidence warning: "Seasonal patterns based on 4 years of data — treat as indicative, not definitive."
- **Some months may have low sample sizes** in certain commodity groups. Set a minimum threshold of 10 records per month — if below, set `seasonal_index = 1.0` (neutral) and `sample_count` as-is.

### Verification

```python
# 12 months × (1 overall + 9 commodity groups + N customers) rows expected
overall_count = db.execute(text(
    "SELECT COUNT(*) FROM seasonal_patterns WHERE entity_type = 'overall'"
)).scalar()
assert overall_count == 12

# Seasonal indices should average ~1.0 per entity
for entity in ['overall'] + list(commodity_groups):
    avg_idx = db.execute(text("""
        SELECT AVG(seasonal_index) FROM seasonal_patterns
        WHERE entity_type = :etype AND (entity_id = :eid OR entity_id IS NULL)
    """), {"etype": "overall" if entity == "overall" else "commodity_group",
           "eid": None if entity == "overall" else entity}).scalar()
    assert abs(avg_idx - 1.0) < 0.05, f"Seasonal indices for {entity} don't average to ~1.0: {avg_idx}"
```

---

## Task 2.7: Commodity Group Benchmarks

### Purpose
Pre-compute aggregated benchmarks per commodity group per year/quarter, providing reference points for margin evaluation.

### Script: `scripts/compute_benchmarks.py`

### Logic

```python
def compute_benchmarks(db):
    """
    For each commodity group, compute annual and quarterly benchmarks.
    """
    # Annual benchmarks
    annual_rows = db.execute(text("""
        SELECT i.commodity_group, i.year,
            AVG(i.db2_margin) as avg_margin,
            CASE WHEN SUM(i.revenue) > 0 THEN SUM(i.db2_total) / SUM(i.revenue) ELSE 0 END as wt_margin,
            PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY i.db2_margin) as median_margin,
            PERCENTILE_CONT(0.25) WITHIN GROUP (ORDER BY i.db2_margin) as p25,
            PERCENTILE_CONT(0.75) WITHIN GROUP (ORDER BY i.db2_margin) as p75,
            SUM(i.revenue) as total_rev,
            COUNT(*) as n,
            -- Win rate from quotes
            (SELECT CASE WHEN COUNT(*) > 0
                THEN SUM(CASE WHEN q.is_won THEN 1 ELSE 0 END)::float / COUNT(*)
                ELSE NULL END
             FROM quotes q WHERE q.commodity_group = i.commodity_group AND q.year = i.year
            ) as win_rate,
            -- Avg margin gap from linkage
            (SELECT AVG(l.margin_gap)
             FROM quote_invoice_links l
             JOIN quotes q ON l.quote_id = q.quote_id AND l.quote_position = q.position
             WHERE q.commodity_group = i.commodity_group
                AND EXTRACT(YEAR FROM q.date) = i.year
                AND l.margin_gap IS NOT NULL
            ) as avg_gap
        FROM invoices i
        WHERE i.db2_margin IS NOT NULL AND i.commodity_group IS NOT NULL AND NOT i.dq_any_issue
        GROUP BY i.commodity_group, i.year
        ORDER BY i.commodity_group, i.year
    """)).fetchall()

    # Insert annual (quarter = NULL)
    for r in annual_rows:
        # Insert with quarter=None
        pass

    # Quarterly benchmarks (same structure, add quarter to GROUP BY)
    # ...
```

### The 9 Commodity Groups

From Phase 1 verification: `BKAES, BKAGG, SOPU, BKAIZ, SOPUZK, OFRSCR, MBKUEHL, MBDIV, OFRLMG`

Each gets annual + quarterly benchmarks = 9 groups × (4 annual + ~16 quarterly) = ~180 records.

### Verification

```python
# Should have records for all 9 commodity groups
cg_count = db.execute(text(
    "SELECT COUNT(DISTINCT commodity_group) FROM commodity_benchmarks"
)).scalar()
assert cg_count == 9, f"Expected 9 commodity groups, got {cg_count}"

# Each commodity group should have 4 annual records (2022-2025)
for cg in ['BKAES', 'BKAGG', 'SOPU', 'BKAIZ', 'SOPUZK', 'OFRSCR', 'MBKUEHL', 'MBDIV', 'OFRLMG']:
    annual = db.execute(text(
        "SELECT COUNT(*) FROM commodity_benchmarks WHERE commodity_group = :cg AND quarter IS NULL"
    ), {"cg": cg}).scalar()
    assert annual == 4, f"{cg} has {annual} annual records, expected 4"
```

---

## Task 2.8: Monte Carlo Simulation

### Purpose
Run margin simulations using historical volatility to produce probability distributions, risk metrics (VaR), and stress-test scenarios.

### Script: `scripts/run_monte_carlo.py`

### Algorithm

```python
import uuid
import numpy as np

def run_simulation(margin_series, n_sims=10000, horizon_months=12, threshold=0.50):
    """
    margin_series: np.array of monthly margins (chronological).
    Returns simulation summary.
    """
    # Compute monthly returns (changes)
    returns = np.diff(margin_series)
    mu = returns.mean()
    sigma = returns.std()

    if sigma == 0:
        # No volatility — return deterministic forecast
        last = margin_series[-1]
        return {
            "mean": last, "median": last,
            "p5": last, "p25": last, "p75": last, "p95": last,
            "prob_below_threshold": 1.0 if last < threshold else 0.0,
        }

    # Simulate paths
    sim_id = str(uuid.uuid4())[:8]
    last_margin = margin_series[-1]
    final_margins = np.zeros(n_sims)

    for i in range(n_sims):
        path = last_margin
        for m in range(horizon_months):
            shock = np.random.normal(mu, sigma)
            path = path + shock
            path = np.clip(path, -1.0, 1.0)  # bound to reasonable range
        final_margins[i] = path

    return {
        "simulation_id": sim_id,
        "n_simulations": n_sims,
        "mean_margin": float(np.mean(final_margins)),
        "median_margin": float(np.median(final_margins)),
        "p5_margin": float(np.percentile(final_margins, 5)),
        "p25_margin": float(np.percentile(final_margins, 25)),
        "p75_margin": float(np.percentile(final_margins, 75)),
        "p95_margin": float(np.percentile(final_margins, 95)),
        "prob_below_threshold": float(np.mean(final_margins < threshold)),
        "threshold_used": threshold,
        "parameters": {
            "mu": float(mu), "sigma": float(sigma),
            "last_margin": float(last_margin),
            "horizon_months": horizon_months,
        },
    }
```

### Entity-Level Simulations

Run for:
1. **Overall** (entity_type='overall', entity_id='all') — aggregate monthly margin series
2. **Per commodity group** (9 groups)
3. **Top 50 customers** by revenue

### Horizons

Run each entity at 3, 6, and 12 months.

### Threshold

Default margin threshold: `0.50` (50% DB2 margin). This represents a "margin floor" below which profitability is at risk. Configurable per entity in future.

### Critical Notes

- **Set random seed** `np.random.seed(42)` for reproducibility.
- **n_sims = 10,000** is the default. For overall and commodity group, sufficient. For per-customer, can reduce to 5,000 for speed.
- **Use monthly weighted margins** not simple averages — same data prep as Task 2.3.
- **If margin_series has < 12 months, skip** — not enough history for meaningful simulation.

### Verification

```python
# All p5 <= p25 <= median <= p75 <= p95
violations = db.execute(text("""
    SELECT COUNT(*) FROM monte_carlo_results
    WHERE NOT (p5_margin <= p25_margin AND p25_margin <= median_margin
              AND median_margin <= p75_margin AND p75_margin <= p95_margin)
""")).scalar()
assert violations == 0, f"{violations} records with inverted percentiles"

# prob_below_threshold is in [0, 1]
assert db.execute(text(
    "SELECT COUNT(*) FROM monte_carlo_results WHERE prob_below_threshold < 0 OR prob_below_threshold > 1"
)).scalar() == 0
```

---

## Task 2.9: Backtest Capability

### Purpose
Evaluate forecast model accuracy by training on historical data and testing on known outcomes (walk-forward validation).

### Script: `scripts/run_backtests.py`

### Walk-Forward Method

```
Training window: expanding (start at 12 months, grow)
Test window: 1 quarter (3 months) at a time
Step: 3 months

Example with 2022-2025 data:
  Round 1: Train on Jan 2022 – Dec 2022, Test on Q1 2023
  Round 2: Train on Jan 2022 – Mar 2023, Test on Q2 2023
  Round 3: Train on Jan 2022 – Jun 2023, Test on Q3 2023
  ...
  Round N: Train on Jan 2022 – Sep 2024, Test on Q4 2024
```

### For Each Round

1. Slice the monthly margin series into train/test
2. Run each model (EMA, Linear Trend, Seasonal if train ≥ 24 months)
3. Compare prediction vs actual (average of test period margins)
4. Record metrics

### Metrics

```python
def compute_backtest_metrics(predicted_values, actual_values):
    """
    predicted_values: list of model predictions per test round
    actual_values: list of actual margins per test round
    """
    errors = np.array(predicted_values) - np.array(actual_values)
    abs_errors = np.abs(errors)

    mae = float(abs_errors.mean())
    rmse = float(np.sqrt((errors ** 2).mean()))

    # MAPE — handle zero actuals
    nonzero_mask = np.array(actual_values) != 0
    if nonzero_mask.sum() > 0:
        mape = float(np.mean(abs_errors[nonzero_mask] / np.abs(np.array(actual_values)[nonzero_mask])))
    else:
        mape = None

    # Directional accuracy: did we correctly predict up/down?
    if len(predicted_values) > 1:
        pred_direction = np.diff(predicted_values) > 0
        actual_direction = np.diff(actual_values) > 0
        dir_acc = float(np.mean(pred_direction == actual_direction))
    else:
        dir_acc = None

    return {
        "mae": mae,
        "rmse": rmse,
        "mape": mape,
        "directional_accuracy": dir_acc,
        "n_test_periods": len(predicted_values),
    }
```

### Backtest Scope

Run backtests for:
1. **Global** (overall margin) — all three models
2. **Per commodity group** — all three models (where data permits)
3. **Sample of 20 high-revenue customers** — EMA and linear trend only (most won't have enough data for seasonal)

### Output

Insert into `backtest_results` table. Also generate a console report:

```
=== BACKTEST RESULTS ===
Global:
  EMA:       MAE=0.032, RMSE=0.045, Dir.Acc=68%
  Linear:    MAE=0.029, RMSE=0.041, Dir.Acc=72%
  Seasonal:  MAE=0.027, RMSE=0.038, Dir.Acc=75%

Best model overall: Seasonal (lowest MAE)

Per Commodity Group:
  BKAES: Best=Linear (MAE=0.025)
  BKAGG: Best=EMA (MAE=0.041)
  ...
```

### Verification

```python
# All MAE values should be positive
assert db.execute(text("SELECT COUNT(*) FROM backtest_results WHERE mae < 0")).scalar() == 0

# All directional_accuracy in [0, 1] where not null
assert db.execute(text(
    "SELECT COUNT(*) FROM backtest_results WHERE directional_accuracy IS NOT NULL AND (directional_accuracy < 0 OR directional_accuracy > 1)"
)).scalar() == 0

# At least one backtest per model type
for model in ['ema', 'linear_trend', 'seasonal_decomp']:
    n = db.execute(text("SELECT COUNT(*) FROM backtest_results WHERE model_type = :m"), {"m": model}).scalar()
    assert n > 0, f"No backtest results for {model}"
```

---

## Task 2.10: Phase 2 API Endpoints

### New Service Files

**File: `backend/services/forecast_service.py`**

```python
# Functions:
# - get_margin_forecast(db, entity_type, entity_id, horizon_months=None)
#     → returns latest forecast(s) for the entity
# - get_forecast_comparison(db, entity_type, entity_id)
#     → returns all model forecasts side-by-side for comparison
# - get_forecast_accuracy(db, model_type=None)
#     → returns backtest results summary
```

**File: `backend/services/risk_service.py`**

```python
# Functions:
# - get_risk_scores(db, tier=None, top=50)
#     → returns risk scores, filterable by tier
# - get_risk_detail(db, customer_id)
#     → returns full risk breakdown for one customer
# - get_risk_distribution(db)
#     → returns tier counts and avg scores per tier
```

**File: `backend/services/cost_service.py`**

```python
# Functions:
# - get_cost_trends(db, article_id=None, top=20)
#     → returns cost trend data, optionally for specific product
# - get_cost_risers(db, top=20)
#     → products with biggest cost increases
# - get_seasonal_patterns(db, entity_type='overall', entity_id=None)
#     → returns seasonal patterns for entity
```

**File: `backend/services/benchmark_service.py`**

```python
# Functions:
# - get_benchmarks(db, commodity_group=None, year=None)
#     → returns benchmark data
# - get_entity_vs_benchmark(db, entity_type, entity_id)
#     → compares entity performance against commodity group benchmark
```

**File: `backend/services/simulation_service.py`**

```python
# Functions:
# - get_simulation_results(db, entity_type, entity_id, horizon_months=None)
#     → returns latest Monte Carlo results
# - get_simulation_distribution(db, simulation_id)
#     → returns full distribution for one simulation run
```

### New API Routers

**File: `backend/api/v1/forecasts.py`**

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/api/v1/forecasts/{entity_type}/{entity_id}` | GET | Get margin forecast for entity |
| `/api/v1/forecasts/{entity_type}/{entity_id}/compare` | GET | Compare all models for entity |
| `/api/v1/forecasts/accuracy` | GET | Get backtest results summary |
| `/api/v1/forecasts/accuracy/{model_type}` | GET | Get backtest results for specific model |

**File: `backend/api/v1/risk.py`**

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/api/v1/risk/scores` | GET | List customer risk scores (filterable by tier, paginated) |
| `/api/v1/risk/scores/{customer_id}` | GET | Get detailed risk breakdown for customer |
| `/api/v1/risk/distribution` | GET | Get risk tier distribution |

**File: `backend/api/v1/costs.py`**

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/api/v1/costs/trends` | GET | Get product cost trends (top N or specific product) |
| `/api/v1/costs/risers` | GET | Get products with biggest cost increases |
| `/api/v1/costs/seasonal` | GET | Get seasonal patterns (by entity type) |

**File: `backend/api/v1/benchmarks.py`**

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/api/v1/benchmarks` | GET | Get commodity group benchmarks |
| `/api/v1/benchmarks/{commodity_group}` | GET | Get benchmarks for specific group |
| `/api/v1/benchmarks/compare/{entity_type}/{entity_id}` | GET | Compare entity vs benchmark |

**File: `backend/api/v1/simulations.py`**

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/api/v1/simulations/{entity_type}/{entity_id}` | GET | Get Monte Carlo results |
| `/api/v1/simulations/run` | POST | Trigger new simulation (optional, for on-demand) |

### Register Routers in `main.py`

```python
from backend.api.v1 import stats, margins, quotes, quality, forecasts, risk, costs, benchmarks, simulations

# Add after existing routers:
app.include_router(forecasts.router, prefix="/api/v1", tags=["forecasts"])
app.include_router(risk.router, prefix="/api/v1", tags=["risk"])
app.include_router(costs.router, prefix="/api/v1", tags=["costs"])
app.include_router(benchmarks.router, prefix="/api/v1", tags=["benchmarks"])
app.include_router(simulations.router, prefix="/api/v1", tags=["simulations"])
```

### Pydantic Response Schemas

**File: `backend/schemas/forecasts.py`**
```python
from pydantic import BaseModel
from typing import Optional
from datetime import date

class ForecastResponse(BaseModel):
    entity_type: str
    entity_id: str
    forecast_date: date
    horizon_months: int
    predicted_db2_margin: Optional[float]
    prediction_lower: Optional[float]
    prediction_upper: Optional[float]
    model_type: str
    training_r2: Optional[float]
    training_mae: Optional[float]

class BacktestSummary(BaseModel):
    model_type: str
    entity_type: str
    avg_mae: Optional[float]
    avg_rmse: Optional[float]
    avg_directional_accuracy: Optional[float]
    n_backtests: int
```

**File: `backend/schemas/risk.py`**
```python
from pydantic import BaseModel
from typing import Optional
from datetime import date

class RiskScoreResponse(BaseModel):
    customer_id: str
    score_date: date
    risk_score: float
    risk_tier: str
    margin_trend_component: Optional[float]
    gap_component: Optional[float]
    volume_component: Optional[float]
    win_rate_component: Optional[float]
    rejection_component: Optional[float]

class RiskDistribution(BaseModel):
    tier: str
    count: int
    avg_score: float
    pct_of_total: float
```

---

## Task 2.11: Dependencies & Configuration

### requirements.txt additions

```
statsmodels>=0.14.0
numpy>=1.24.0
```

Note: `scipy` and `numpy` are already in requirements.txt from Phase 1. Add `statsmodels` for seasonal decomposition.

### Configuration

Add to `backend/config.py`:
```python
class Settings(BaseSettings):
    DATABASE_URL: str = "postgresql://pryzm:pryzm_dev@localhost:5432/scherzinger_margin_db"
    API_HOST: str = "0.0.0.0"
    API_PORT: int = 8000

    # Phase 2 settings
    FORECAST_MIN_MONTHS: int = 12
    RISK_MIN_INVOICES: int = 5
    MONTE_CARLO_SIMS: int = 10000
    MONTE_CARLO_THRESHOLD: float = 0.50
    SEASONAL_MIN_PER_MONTH: int = 10
    COST_MIN_QUARTERS: int = 3

    class Config:
        env_file = ".env"
```

---

## Task 2.12: Tests

### File: `tests/test_forecasts.py`

```python
# Test cases:
# 1. test_forecast_ema_basic — verify EMA produces reasonable output for synthetic series
# 2. test_forecast_linear_trend — verify linear model on simple increasing series
# 3. test_forecast_seasonal — verify seasonal decomp on 24+ month series with known pattern
# 4. test_forecast_ensemble — verify ensemble weights and output bounds
# 5. test_forecast_min_data — verify skip when < 12 months
# 6. test_forecast_clip — verify predictions clipped to [-1, 1]
# 7. test_api_forecast_endpoint — verify GET /api/v1/forecasts/{type}/{id} returns 200
# 8. test_api_forecast_accuracy — verify GET /api/v1/forecasts/accuracy returns data
```

### File: `tests/test_risk.py`

```python
# Test cases:
# 1. test_risk_score_range — all scores in [0, 1]
# 2. test_risk_tier_mapping — verify tier boundaries (0.25, 0.50, 0.75)
# 3. test_risk_component_weights — verify weights sum to 1.0
# 4. test_risk_neutral_on_insufficient_data — verify 0.5 returned for < min data
# 5. test_api_risk_scores — verify GET /api/v1/risk/scores returns list
# 6. test_api_risk_detail — verify GET /api/v1/risk/scores/{customer_id} returns components
# 7. test_api_risk_distribution — verify tier counts sum to total scored customers
```

### File: `tests/test_costs.py`

```python
# Test cases:
# 1. test_cost_trend_no_nulls — no NULL article_id in product_cost_trends
# 2. test_cost_period_validity — period_start < period_end
# 3. test_cost_change_first_period_null — first period per product has NULL cost_change_pct
# 4. test_api_cost_trends — verify GET /api/v1/costs/trends returns data
# 5. test_api_cost_risers — verify GET /api/v1/costs/risers returns sorted list
```

### File: `tests/test_seasonal.py`

```python
# Test cases:
# 1. test_seasonal_12_months — verify 12 rows for overall
# 2. test_seasonal_index_average — verify indices average ~1.0 per entity
# 3. test_seasonal_all_commodity_groups — verify 9 groups present
# 4. test_api_seasonal — verify GET /api/v1/costs/seasonal returns data
```

### File: `tests/test_benchmarks.py`

```python
# Test cases:
# 1. test_benchmark_all_groups — 9 commodity groups present
# 2. test_benchmark_annual_records — 4 annual records per group
# 3. test_benchmark_percentiles_ordered — p25 <= median <= p75
# 4. test_api_benchmarks — verify GET /api/v1/benchmarks returns data
# 5. test_api_benchmark_compare — verify compare endpoint
```

### File: `tests/test_monte_carlo.py`

```python
# Test cases:
# 1. test_mc_percentiles_ordered — p5 <= p25 <= median <= p75 <= p95
# 2. test_mc_prob_range — prob_below_threshold in [0, 1]
# 3. test_mc_reproducible — same seed produces same results
# 4. test_mc_zero_volatility — deterministic output when sigma=0
# 5. test_api_simulation — verify GET /api/v1/simulations/{type}/{id} returns data
```

### File: `tests/test_backtests.py`

```python
# Test cases:
# 1. test_backtest_mae_positive — all MAE >= 0
# 2. test_backtest_dir_acc_range — directional_accuracy in [0, 1]
# 3. test_backtest_all_models — at least one backtest per model type
# 4. test_backtest_walk_forward — verify train_end < test_start for all records
```

### Expected Total

~35–40 new tests. Combined with Phase 1's 38, target: **73–78 total tests passing**.

---

## Task 2.13: Computation Pipeline Script

### File: `scripts/run_phase2.py`

Master script that runs all Phase 2 computations in correct order:

```python
#!/usr/bin/env python3
"""Run all Phase 2 computations."""

import sys, os, time
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

def main():
    start = time.time()

    print("=" * 60)
    print("PHASE 2: FORECASTING & RISK INTELLIGENCE")
    print("=" * 60)

    # Step 1: Cost Trends
    print("\n[1/6] Computing product cost trends...")
    from scripts.compute_cost_trends import main as cost_trends
    cost_trends()

    # Step 2: Seasonal Patterns
    print("\n[2/6] Computing seasonal patterns...")
    from scripts.compute_seasonal_patterns import main as seasonal
    seasonal()

    # Step 3: Commodity Benchmarks
    print("\n[3/6] Computing commodity benchmarks...")
    from scripts.compute_benchmarks import main as benchmarks
    benchmarks()

    # Step 4: Margin Forecasts
    print("\n[4/6] Computing margin forecasts...")
    from scripts.compute_forecasts import main as forecasts
    forecasts()

    # Step 5: Customer Risk Scores
    print("\n[5/6] Computing customer risk scores...")
    from scripts.compute_risk_scores import main as risk
    risk()

    # Step 6: Monte Carlo Simulations
    print("\n[6/6] Running Monte Carlo simulations...")
    from scripts.run_monte_carlo import main as monte_carlo
    monte_carlo()

    # Step 7: Backtests (can run in parallel with step 6, but sequential for simplicity)
    print("\n[7/7] Running backtests...")
    from scripts.run_backtests import main as backtests
    backtests()

    elapsed = time.time() - start
    print(f"\n{'=' * 60}")
    print(f"Phase 2 complete in {elapsed:.1f}s")
    print(f"{'=' * 60}")

if __name__ == "__main__":
    main()
```

### Execution Order Rationale

1. **Cost Trends first** — independent, computes product-level cost data
2. **Seasonal Patterns** — independent, computes monthly indices
3. **Commodity Benchmarks** — independent aggregate stats
4. **Margin Forecasts** — can use seasonal patterns for seasonal model
5. **Customer Risk Scores** — uses margin trends (from invoices, not forecasts)
6. **Monte Carlo** — uses historical margin series
7. **Backtests** — evaluates forecast models, should run last

---

## Task 2.14: Documentation

### Update `README.md`

Add Phase 2 section documenting:
- New tables and their purpose
- New API endpoints with example requests/responses
- How to run the computation pipeline
- How to interpret risk scores and forecast confidence intervals

### File: `docs/phase_2_models.md`

Document the mathematical models:
- EMA formula and parameter choice
- Linear trend regression
- Seasonal decomposition approach
- Monte Carlo simulation methodology
- Risk score component weights and thresholds
- Backtest walk-forward methodology

---

## Execution Order Summary

| Step | Task | Script/File | Dependencies |
|------|------|-------------|-------------|
| 1 | Add `statsmodels` to requirements | `requirements.txt` | None |
| 2 | Create new model files | `backend/models/*.py` | None |
| 3 | Update model `__init__.py` | `backend/models/__init__.py` | Step 2 |
| 4 | Generate Alembic migration | `alembic revision --autogenerate` | Steps 2-3 |
| 5 | Run migration | `alembic upgrade head` | Step 4 |
| 6 | Write cost trends script | `scripts/compute_cost_trends.py` | Step 5 |
| 7 | Write seasonal patterns script | `scripts/compute_seasonal_patterns.py` | Step 5 |
| 8 | Write benchmarks script | `scripts/compute_benchmarks.py` | Step 5 |
| 9 | Write forecasts script | `scripts/compute_forecasts.py` | Step 5 |
| 10 | Write risk scores script | `scripts/compute_risk_scores.py` | Step 5 |
| 11 | Write Monte Carlo script | `scripts/run_monte_carlo.py` | Step 5 |
| 12 | Write backtest script | `scripts/run_backtests.py` | Step 9 |
| 13 | Write pipeline runner | `scripts/run_phase2.py` | Steps 6-12 |
| 14 | Create service files | `backend/services/*.py` | Steps 2-3 |
| 15 | Create API routers | `backend/api/v1/*.py` | Step 14 |
| 16 | Create schemas | `backend/schemas/*.py` | None |
| 17 | Register routers in `main.py` | `backend/main.py` | Step 15 |
| 18 | Update config | `backend/config.py` | None |
| 19 | Write tests | `tests/test_*.py` | Steps 14-17 |
| 20 | Run all tests | `pytest tests/ -v` | Step 19 |
| 21 | Run pipeline | `python scripts/run_phase2.py` | Steps 5, 13 |
| 22 | Run tests again (with live data) | `pytest tests/ -v` | Step 21 |
| 23 | Documentation | `README.md`, `docs/` | All |

---

## New Files Created in Phase 2

```
scherzinger-platform/
├── backend/
│   ├── models/
│   │   ├── forecast.py          (NEW)
│   │   ├── risk_score.py        (NEW)
│   │   ├── cost_trend.py        (NEW)
│   │   ├── seasonal.py          (NEW)
│   │   ├── benchmark.py         (NEW)
│   │   ├── monte_carlo.py       (NEW)
│   │   ├── backtest.py          (NEW)
│   │   └── __init__.py          (MODIFIED)
│   ├── services/
│   │   ├── forecast_service.py  (NEW)
│   │   ├── risk_service.py      (NEW)
│   │   ├── cost_service.py      (NEW)
│   │   ├── benchmark_service.py (NEW)
│   │   └── simulation_service.py (NEW)
│   ├── api/v1/
│   │   ├── forecasts.py         (NEW)
│   │   ├── risk.py              (NEW)
│   │   ├── costs.py             (NEW)
│   │   ├── benchmarks.py        (NEW)
│   │   └── simulations.py       (NEW)
│   ├── schemas/
│   │   ├── forecasts.py         (NEW)
│   │   └── risk.py              (NEW)
│   ├── main.py                  (MODIFIED)
│   └── config.py                (MODIFIED)
├── scripts/
│   ├── compute_cost_trends.py   (NEW)
│   ├── compute_seasonal_patterns.py (NEW)
│   ├── compute_benchmarks.py    (NEW)
│   ├── compute_forecasts.py     (NEW)
│   ├── compute_risk_scores.py   (NEW)
│   ├── run_monte_carlo.py       (NEW)
│   ├── run_backtests.py         (NEW)
│   └── run_phase2.py            (NEW)
├── tests/
│   ├── test_forecasts.py        (NEW)
│   ├── test_risk.py             (NEW)
│   ├── test_costs.py            (NEW)
│   ├── test_seasonal.py         (NEW)
│   ├── test_benchmarks.py       (NEW)
│   ├── test_monte_carlo.py      (NEW)
│   └── test_backtests.py        (NEW)
├── docs/
│   └── phase_2_models.md        (NEW)
├── alembic/versions/
│   └── xxxx_phase_2_forecasting_tables.py (NEW)
└── requirements.txt             (MODIFIED)
```

Total: **27 new files**, **4 modified files**.

---

## Success Criteria

| Metric | Target |
|--------|--------|
| All Phase 1 tests still pass | 38/38 |
| New Phase 2 tests pass | ≥35/35 |
| Total tests | ≥73 |
| New DB tables created | 7 |
| New API endpoints | 14 |
| Forecast coverage (customers) | Top 200 by revenue |
| Forecast coverage (products) | Top 300 by revenue |
| Forecast coverage (commodity groups) | All 9 |
| Risk scores computed | ≥400 customers |
| Monte Carlo simulations | ≥60 entities × 3 horizons |
| Backtest results | ≥30 (3 models × 10+ entities) |
| No formula/computation errors | 0 |
| All migration applied cleanly | ✓ |
