# Pryzm × Scherzinger — Data Onboarding Checklist

**Status:** v1, sent 12 May 2026
**Audience:** Scherzinger data/IT owner (cc Frank, Till)
**Goal:** turn the Pryzm pilot from "honest heuristic on shared snapshots" into
"defensible recommendations on real contract + market data" within the next
ramp window.

---

## 0. What we have today — please confirm

Loaded from the existing snapshots into the pilot DB:

| Source                            | Rows  | Date range            | Status         |
|-----------------------------------|-------|-----------------------|----------------|
| `Deckungsbeitragsliste_2.xlsx`    | 5,565 | 2022-01-10 → 2025-12-17 | Loaded as `invoices` (4 yrs ≈ 48 mo) |
| `Angebotsstatistik_3.xlsx`        | 4,539 | 2022-01-04 → 2025-12-23 | Loaded as `quotes` (4 yrs ≈ 48 mo, win flag + rejection code) |
| Quotation-code interpretation     | 15    | —                       | Loaded as `rejection_codes`         |

**One confirmation request:**
- Is invoice 2025-12-17 / quote 2025-12-23 the latest you can share, or do
  you have a more recent monthly extract we should layer in for the demo?

---

## 1. What we need next — ranked by demo impact

Each item below is gated by **what it unblocks in the Pryzm UI**. Skipping
items is fine — we will keep clearly labelled pilot heuristics in their
place. Sending them lets us replace those heuristics with real signals.

### 1.1 Contracts table  (highest impact)

**Unblocks:** the Movable-vs-locked split on every screen. Today the
Action-Center hero shows "€1.32M movable revenue (pilot heuristic — based on
cost movement and active A/B tests)". A real contracts table replaces that
heuristic with an auditable "this revenue is contractually locked through
DD.MM.YYYY".

**Format:** CSV / parquet / Excel — whichever is cheapest for your team.

**Columns we need, per (customer × article) row:**
| Field                       | Type      | Notes                                                |
|-----------------------------|-----------|------------------------------------------------------|
| `customer_id`               | string    | matches `customers.customer_id`                      |
| `article_id`                | string    | matches `products.article_id`                        |
| `contract_start`            | date      | inclusive                                            |
| `contract_end`              | date      | inclusive — leave blank for evergreen contracts      |
| `price_basis`               | enum      | `fixed_price` / `cost_plus` / `index_linked` / `framework` |
| `is_movable`                | bool      | optional — true if the contract permits in-period repricing |
| `repricing_notice_days`     | int       | optional — days of notice needed to change the price |
| `comments`                  | string    | optional — anything the analyst should see          |

**Volume estimate:** anything from "a few hundred named customers" up to "all
1,438 customers with framework agreements"; either works.

### 1.2 Commodity / raw-material price history  (high impact)

**Unblocks:** the Negotiation Cockpit and the Forecast page's input-cost
trajectory. Today these read internally-computed cost trends; the demo can
show them but we have to flag the indices as internal-only.

**Format:** one row per (commodity, month). We can pre-load LME, ICE, EEX
ourselves if you tell us *which* indices Scherzinger tracks contractually.

**Columns:**
| Field            | Type   | Notes                                                  |
|------------------|--------|--------------------------------------------------------|
| `commodity_code` | string | e.g. `LME_CU`, `ICE_BRENT`, `EEX_DE_POWER`             |
| `period_start`   | date   | first day of the month                                 |
| `period_end`     | date   | last day of the month                                  |
| `price`          | float  | nominal price                                          |
| `currency`       | string | ISO 4217                                               |
| `unit`           | string | e.g. `EUR/t`, `EUR/MWh`                                |
| `source`         | string | data vendor / publication name                         |

**Volume estimate:** ~60 months × ~10 commodities ≈ 600 rows. Tiny.

**Stretch:** a mapping of `article_id → primary_commodity_code` so the
Negotiation Cockpit can wire commodity moves directly to specific SKUs
without us guessing.

### 1.3 Customer & article master enrichment  (medium impact)

**Unblocks:** cluster definitions on every page. Today we cluster by
`commodity_group` from `invoices`; richer master fields let us segment more
honestly.

**Customer master (per customer_id):**
- `industry` / NACE code
- `region` (DE / EU / Non-EU at minimum)
- `account_owner` (sales rep — used for Heiko's deferred screens)
- `customer_tier` (A / B / C if you already classify)
- `payment_terms_days`

**Article master (per article_id):**
- `make_or_buy` flag
- `lifecycle_stage` (new / mature / phase-out)
- `is_kit` / parent-child relationships for assemblies
- `competing_articles` (optional cross-references, internal-only)

### 1.4 Longer history if available  (low impact, high credibility)

We have 48 months of invoices + quotes. The forecast page asks for at least
24, the per-cluster confidence drawer asks for at least 36 to stabilise
seasonal_decomp. If 5+ years exist in your ERP, we'd happily take more —
purely to improve the Trust strip's per-cluster sample sizes (currently
some clusters are flagged amber/red on the coverage badges for n < 100).

---

## 2. How to send it

In order of preference:
1. SFTP / S3 bucket drop — we set up a one-off endpoint, you push, we
   ingest and confirm row counts within 24h.
2. Email-and-encrypt — fine for the contracts and commodity files, less
   ideal for the master enrichment because of size.
3. Direct DB export — if you have a read-only replica we can connect to
   for a one-off pull, we'll handle the rest.

Either way: please anonymise nothing. Frank's persona explicitly rewards
seeing raw customer names; the pilot DB is single-tenant on infra we
control end-to-end. Anonymisation can be re-applied at the UI layer
if needed downstream.

---

## 3. What you will see in the pilot once each arrives

| Send us…                          | …and the next demo cut will show                                                   |
|-----------------------------------|------------------------------------------------------------------------------------|
| Contracts table                   | Movable hero relabelled "€X.XM movable revenue · {N} contracts expiring < 90d"      |
| Commodity index history           | Negotiation Cockpit shows live index direction + per-SKU exposure                  |
| Customer / article master         | Per-cluster confidence drawer broadens from EMA-only to enriched cluster definitions|
| 5+ years of invoices              | Trust-strip badges flip from amber to green on more clusters                        |

---

## 4. Pre-emptive questions

- *Will Pryzm see PII?*  Customer names yes. Personal data of contacts (rep
  emails, etc.) — no, we don't need them for any pricing analysis.
- *Can we share a subset first?*  Yes. Contracts for the top 50 customers
  alone unlocks ~90% of the demo value.
- *What if a field is missing?*  Send what you have. The pilot's coverage
  badges will mark the affected screens amber rather than fail.
- *How quickly does it land in the UI?*  Once the file is on our side: <1
  working day for contracts and commodity; ~2 days for master enrichment
  (we re-cluster downstream).

---

## 5. Open items on our side (Pryzm)

These are *not* asks of Scherzinger; logged here so the next round of
this checklist isn't duplicative.

- [ ] Wire `contracts` table into `movable_hero.build()` once received.
- [ ] Add `commodity_benchmarks` external-source ingest path.
- [ ] Extend `customers` and `products` schemas with the enrichment fields.
- [ ] Re-run `compute_forecasts.py` + `build_model_registry.py` after each
      data delivery so the Trust drawer reflects the new sample sizes.

— Pryzm pilot team
