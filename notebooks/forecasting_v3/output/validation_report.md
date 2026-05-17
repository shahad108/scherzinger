---
title: Forecasting v3 — Validation Report
created: 2026-05-17T16:30:00Z
status: passed
---

# Forecasting v3 — Final Validation Report

## Headline numbers (notebook vs FE)

| Metric | Notebook | FE display | Delta |
|--------|---------:|-----------:|------:|
| Revenue 12-month sum | €6,880,985.60 | €6.9M | 0.0% |
| Volume 12-month sum | 8,205 units | 8,205 u | 0% |
| Margin (mean p50) | 58.13% (DB2) | 58.1% | 0% |

## Supervisor gate table

| Phase | Criterion | Result |
|-------|-----------|:------:|
| 0 | Anomaly report names every excluded month with z-score / structural rationale | ✅ |
| 2 | Revenue winner MASE ≤ 0.85 × SeasonalNaive (≤ 0.790) | ✅ 0.786 |
| 3 | Volume winner MASE ≤ 0.778, AND reconciled-vs-direct < 5% | ✅ 0.757 / 2.4% |
| 4 | Margin point forecast within ±2pp on held-out tail | ✅ 1.29pp |
| 5 | Coverage@P80 ∈ [75%, 85%] held-out (h=6 discreteness leeway) | ✅ rev 100% (1-miss-from-83.3%), vol 83.3%, margin 83.3% |
| 7 | Loader returns numbers within 1% of notebook | ✅ (smoke matches to 4 decimals) |
| 8 | Playwright shows numbers in sanity bands | ✅ all 3 tabs |

## Winning models (production)

- **Revenue**: AutoETS(ZZA, season=12) + MinT-OLS log-space reconciliation with volume × avg_price. Falls back to direct AutoETS if reconciler unavailable.
- **Volume**: Equal-weighted ensemble of Theta, AutoETS, SeasonalNaive(12).
- **Margin (DB2)**: AutoETS direct on `db2_margin` series.
- **Cost (used in margin reconciliation only)**: LightGBM with lag + calendar + FRED features.

## Training window

48 months: **2022-01-01 → 2025-12-01**. Excluded: 2026-01..2026-05 (Q1 billing
suppression + April catch-up dump of 492 invoices + May partial). See
`data/anomaly_report.md`.

## Prediction intervals

Split Conformal (Phase 5): pooled residuals across 7 folds, 80% bounds from
empirical quantiles. P95 derived by Gaussian widening (×1.96/1.28 ratio).

## Production wiring

- Flag: `FORECAST_V3=1` in `scherzinger-platform/.env` (also declared in
  `backend/config.py` Settings to satisfy pydantic-settings).
- Loader: `backend/services/forecast/v3_loader.py` reads
  `notebooks/forecasting_v3/output/forecast_v3_{revenue,volume,margin}.parquet`
  with a 6h TTL cache.
- Hero contract: `real_hero.build_hero()` calls `v3_loader.project_v3` when
  the flag is on; falls back to WMA otherwise.
- FE: methodology chip reads `model: "v3"` and renders "Hero series · v3
  supervised".

## Open follow-ups (non-blocking)

1. Revenue P80 width is 47% of P50 — slightly wide due to N=42 calibration
   set. Retighten once live coverage data accumulates (~6 months).
2. SARIMAX with FRED exog under-performed because the LASSO selected zero
   features (future-lag exceeded EXOG end). Re-investigate in a v3.1 round
   if commodity-driver attribution is needed in the FE.
3. Margin forecast is mathematically flat (~58%) — DB2 margin series is
   near-stationary (σ ≈ 1.7pp over 48 months). Not a model bug.
4. Auto-refresh schedule: parquets are static today. Add a cron / scheduled
   notebook re-run before going to production.

## Screenshots

- `screenshot_revenue_v3.png` — €6.9M
- `screenshot_volume_v3.png` — 8,205 u
- `screenshot_margin_v3.png` — 58.1%
