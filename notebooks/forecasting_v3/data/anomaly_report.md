# Phase 0 anomaly report

Generated: 2026-05-17T15:36:40.294271+00:00

## Excluded months (outside 2022-01..2025-12 clean window)

Anomaly rule: `|z-score(invoice_count)| > 2.5` OR `invoice_count < 50` OR `invoice_count > 300`.

| month | invoice_count | units | revenue (€) | z-score | flag |
|---|---:|---:|---:|---:|---|
| 2026-01-01 | 28 | 158 | 132,928 | -1.57 | count<=50 |
| 2026-02-01 | 35 | 179 | 99,264 | -1.46 | count<=50 |
| 2026-03-01 | 50 | 272 | 184,451 | -1.21 | count<=50 |
| 2026-04-01 | 492 | 4775 | 603,477 | +6.02 | count>300, |z|=6.02>2.5 |
| 2026-05-01 | 1 | 2 | 47 | -2.01 | count<=50 |

### Rationale: the 2026 billing backlog

The four months 2026-01..2026-04 represent a single posting event: Q1 was severely under-billed (28 / 35 / 50 invoices vs the ~120 historical norm) while April absorbed a 3-month catch-up dump of **492 invoices on essentially one date**. May 2026 has only 1 invoice and is the current partial month. None of these months carry forecastable signal — they reflect AR posting cadence, not demand. The clean window therefore stops at 2025-12.

## Suspicious months kept inside the clean window

_None — all 48 months in the clean window pass the rule._
