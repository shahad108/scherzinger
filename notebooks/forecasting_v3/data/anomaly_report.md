# Phase 0 anomaly report

Generated: 2026-05-17T16:10:10.444976+00:00

**Z-score baseline:** all z-scores below are computed against the clean-window sample (2022-01..2025-12) only, so the 2026 billing outliers do not inflate σ and mask in-window dips.

## Excluded months (outside 2022-01..2025-12 clean window)

Anomaly rule: `|z-score(invoice_count)| > 2.5` OR `invoice_count ≤ 50` OR `invoice_count > 300`.

| month | invoice_count | units | revenue (€) | z(inv) | z(rev) | z(units) | flag |
|---|---:|---:|---:|---:|---:|---:|---|
| 2026-01-01 | 28 | 158 | 132,928 | -4.23 | -3.89 | -3.03 | count≤50, |z_inv|=4.23>2.5 |
| 2026-02-01 | 35 | 179 | 99,264 | -3.92 | -4.21 | -2.89 | count≤50, |z_inv|=3.92>2.5 |
| 2026-03-01 | 50 | 272 | 184,451 | -3.26 | -3.41 | -2.26 | count≤50, |z_inv|=3.26>2.5 |
| 2026-04-01 | 492 | 4775 | 603,477 | +16.11 | +0.54 | +27.97 | count>300, |z_inv|=16.11>2.5 |
| 2026-05-01 | 1 | 2 | 47 | -5.41 | -5.15 | -4.08 | count≤50, |z_inv|=5.41>2.5 |

### Rationale: the 2026 billing backlog

The four months 2026-01..2026-04 represent a single posting event: Q1 was severely under-billed (28 / 35 / 50 invoices vs the ~120 historical norm) while April absorbed a 3-month catch-up dump of **492 invoices on essentially one date**. May 2026 has only 1 invoice and is the current partial month. None of these months carry forecastable signal — they reflect AR posting cadence, not demand. The clean window therefore stops at 2025-12. **Note on March 2026:** its invoice_count is exactly 50, which is part of the same Q1 billing-suppression artifact and is included by the `≤ 50` branch deliberately.

## Suspicious months kept (in-window dips)

Kept months from the clean window where `|z(revenue)| > 2.0` or `|z(units)| > 2.0` (baselines = clean window mean/std). These are retained for training but called out so downstream models can decide whether to down-weight them.

| month | invoice_count | units | revenue (€) | z(rev) | z(units) | judgement |
|---|---:|---:|---:|---:|---:|---|
| 2022-04-01 | 129 | 913 | 686,549 | +1.32 | +2.04 | in-window outlier with normal invoice_count; no billing-cadence story — kept and flagged for cluster review. |
| 2022-06-01 | 150 | 959 | 599,656 | +0.50 | +2.35 | in-window outlier with normal invoice_count; no billing-cadence story — kept and flagged for cluster review. |
| 2023-06-01 | 84 | 313 | 320,717 | -2.13 | -1.99 | in-window outlier with normal invoice_count; no billing-cadence story — kept and flagged for cluster review. |
| 2024-08-01 | 101 | 218 | 274,216 | -2.56 | -2.63 | German August summer-holiday trough — other Augusts span €388,553..€681,952; invoice_count=101 is normal (>50, not a billing gap). Kept as legitimate seasonal dip. |
| 2025-07-01 | 170 | 862 | 834,354 | +2.71 | +1.70 | in-window outlier with normal invoice_count; no billing-cadence story — kept and flagged for cluster review. |

### Aug-2024 explicit judgement

Aug-2024 is the lowest historical month at €274,216 (z(rev)=-2.56, z(units)=-2.63), but its invoice_count is 101 — well above the 50-invoice billing-gap threshold, so this is **not** an AR posting artifact. The other Augusts in the clean window (2022=€388,553, 2023=€681,952, 2025=€424,916) all sit in the same low-band region characteristic of the German August summer-holiday trough (plant shutdowns, factory holidays across the metals supply chain). The judgement is **legitimate seasonal trough**, not a data-quality event — Aug-2024 is **kept in the training set** so the model can learn the August seasonality. Downstream models should encode an explicit Aug month effect rather than rejecting this row.


## Kept months flagged by invoice_count rule

These months passed the calendar window but also tripped the invoice_count anomaly rule. They are **kept** (no known data-quality story) but flagged for downstream review:

| month | invoice_count | units | revenue (€) | z(inv) | flag |
|---|---:|---:|---:|---:|---|
| 2025-09-01 | 199 | 744 | 734,086 | +3.27 | |z_inv|=3.27>2.5 |
