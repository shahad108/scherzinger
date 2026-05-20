# Scherzinger Margin Intelligence Platform — Phase 1 Implementation Plan

## Verified Data Profile (from actual file inspection)

### Source Files

| File | Sheets | Total Records | Location |
|------|--------|--------------|----------|
| `Deckungsbeitragsliste_2.xlsx` (Invoices) | 2022, 2023, 2024, 2025 | **5,565** | `Scherzinger_new/Data/` |
| `Angebotsstatistik_3.xlsx` (Quotes) | 2022, 2023, 2024, 2025 | **4,605** | `Scherzinger_new/Data/` |
| `Quotation code interpretation (Angebotsstatistik).xlsx` (Reference) | 1 sheet | **15 codes** | `Scherzinger_new/Data/` |

### Invoice Data — Verified Column Layout (26 columns per sheet)

All sheets (2022–2025) share identical structure:

| Index | Raw Column Name | dtype (observed) | Notes |
|-------|----------------|-------------------|-------|
| 0 | `Rechnung` | int64 | Invoice ID. Example: `6009811` |
| 1 | `Pos.` | int64 | Position. Example: `1` |
| 2 | `Auftrag` | int64 (2022-2024), **float64 (2025)** | Order ID. **2025 has 5 nulls and float format like `3013751.0`**. 2022-2024 are clean int64 |
| 3 | `Datum` | datetime64[ns] (2022-2024), **object (2025)** | Date. **2025 dates are string objects like `"2025-01-28 00:00:00"` — needs pd.to_datetime()** |
| 4 | `Firma` | int64 | Customer ID. Example: `103459` |
| 5 | `BU` | object | Business Unit. Always `"BU001"` |
| 6 | `WG` | object | Commodity Group. 9 unique values: `BKAES, BKAGG, SOPU, BKAIZ, SOPUZK, OFRSCR, MBKUEHL, MBDIV, OFRLMG`. **3 total nulls across all years** |
| 7 | `Artikel` | object | Article ID. Example: `"202427"`, `"201439-A"` |
| 8 | `Zeichnung` | object | Drawing number |
| 9 | `Bezeichnung` | object | Description (product name) |
| 10 | `Kurs` | float64 | Exchange rate. Mostly `1.0` |
| 11 | `Währung` | object | Currency. Mostly `"EUR"` |
| 12 | `Menge` | int64 | Quantity |
| 13 | `Umsatz` | float64 | Revenue (total) |
| 14 | `Umsatz\n/ Stck.` | float64 | Revenue per unit. **Column has literal `\n` in name** |
| 15 | `HKvoll\n/ Stck.` | float64 | Full manufacturing cost per unit. **Literal `\n`** |
| 16 | `HKvar\n/ Stck.` | float64 | Variable manufacturing cost per unit. **Literal `\n`** |
| 17 | `MatAnteil\n/ Stck.` | float64 | Material share per unit. **Literal `\n`** |
| 18 | `FEK\n/ Stck.` | float64 | Direct manufacturing cost per unit. **Literal `\n`** |
| 19 | `davon FV\n/ Stck.` | float64 | Outsourcing share per unit. **Literal `\n`** |
| 20 | `DB I` | float64 | Contribution Margin I (total) |
| 21 | `DB I\n/ Stck.` | float64 | DB I per unit. **Literal `\n`** |
| 22 | `DB I Marge` | float64 | DB I margin. **DECIMAL format** e.g. `0.883`. **Nulls: 2022=3, 2023=0, 2024=4, 2025=13 → total 20** |
| 23 | `DB II` | float64 | Contribution Margin II (total) |
| 24 | `DB II\n/ Stck.` | float64 | DB II per unit. **Literal `\n`** |
| 25 | `DB II Marge` | float64 | DB II margin. **DECIMAL format** e.g. `0.845`. **Nulls match DB I Marge (20 total). Range: -18.94 to 0.92** |

### Invoice Verified Statistics

| Year | Records | Revenue (€) | Avg DB II Margin | DB II Margin Nulls |
|------|---------|-------------|------------------|--------------------|
| 2022 | 1,500 | 6,369,103 | ~0.636 | 3 |
| 2023 | 1,337 | 6,233,961 | ~0.638 | 0 |
| 2024 | 1,320 | 5,793,294 | ~0.622 | 4 |
| 2025 | 1,408 | 6,250,360 | ~0.606 | 13 |
| **Total** | **5,565** | **24,646,718** | **0.6478** | **20** |

Additional:
- **967 unique customers** (Firma)
- **1,223 unique articles** (Artikel)
- **0 duplicate (Rechnung, Pos.) pairs** — good data integrity
- **13 negative margin records** (DB II Marge < 0, min is -18.94)
- **4,795 unique order IDs** (Auftrag) across invoices

### Quote Data — Verified Column Layout (19 columns per sheet)

| Index | Raw Column Name | dtype (observed) | Notes |
|-------|----------------|-------------------|-------|
| 0 | `Angebot` | object | Quote ID. Example: `"AN102237"`, `"AN102273.01"` |
| 1 | `Pos` | int64 (2022,2023,2025), **float64 (2024)** | Position. **2024 has float like `10.0`** — must convert to int |
| 2 | `*` | int64 | Status code. Only values: `4` (Won) and `5` (Lost) |
| 3 | `Datum` | datetime64[ns] | Date. Clean across all sheets |
| 4 | `Firma` | int64 | Customer ID |
| 5 | `Artikel` | object | Article ID |
| 6 | `Zeichnung` | object | Drawing number |
| 7 | `Name` | object | Product/customer name |
| 8 | `BU` | object | Business Unit. Always `"BU001"` |
| 9 | `WG` | object | Commodity Group |
| 10 | `Kurs` | float64 | Exchange rate |
| 11 | `Währung` | object | Currency |
| 12 | `Menge` | int64 | Quantity |
| 13 | `Umsatz` | float64 | Revenue (quoted) |
| 14 | `HKvoll` | float64 | Full manufacturing cost (total, NOT per unit). **Nulls: 2022=32, 2023=27, 2024=19, 2025=18 → total 96** |
| 15 | `DB2` | float64 | Contribution Margin II total. **Nulls match HKvoll (96)** |
| 16 | `DB2%` | float64 | DB2 margin. **PERCENTAGE format** e.g. `73.26` means 73.26%. **Must divide by 100 for storage.** Nulls: 96. Range: -150.49 to 100.00. **802 records have exactly 100.0%** |
| 17 | `Auftrag` | object | Order ID. Present for won quotes. **1,995 non-null total (1,724 won + 271 lost with order)** |
| 18 | `Auftrag Code` | object | Rejection/loss reason code. **1,593 non-null.** |

### Quote Verified Statistics

| Year | Total | Won | Lost | Win Rate | Nulls in Auftrag | Nulls in Code |
|------|-------|-----|------|----------|-------------------|---------------|
| 2022 | 947 | 346 | 601 | 36.5% | 601 | 927 |
| 2023 | 1,191 | 408 | 783 | 34.3% | 696 | 803 |
| 2024 | 1,176 | 458 | 718 | 38.9% | 628 | 691 |
| 2025 | 1,291 | 521 | 770 | 40.4% | 685 | 591 |
| **Total** | **4,605** | **1,733** | **2,872** | **37.6%** | **2,610** | **3,012** |

### Critical Data Quirks Discovered

1. **Rejection codes have CASE INCONSISTENCY**: The data contains mixed-case codes that must be normalized to uppercase before use:
   - `ka` (833 occurrences) → should map to `KA`
   - `Pa` (15) → should map to `PA`
   - `P` (14) → should map to `PR` (likely abbreviation)
   - `Kd` (16) → should map to `KD`
   - `T` (2) → should map to `TE` (likely abbreviation)
   - `Rz` (2) → should map to `RZ`
   - `Lz` (1) → should map to `LZ`

   **Normalization rule**: uppercase first, then map single-letter abbreviations (`P→PR`, `T→TE`).

2. **Lost quotes CAN have an Auftrag**: 271 lost quotes have a non-null order ID. This means "lost" doesn't always mean "no order placed" — it may mean the order went to a competitor but a reference was still logged. The linkage script should only process won quotes (status_code == 4).

3. **Invoice Auftrag dtype varies by year**: 2022-2024 are int64, 2025 is float64 with 5 nulls. Normalization must handle both: convert all to string, strip `.0` suffix.

4. **Invoice Datum in 2025 is object, not datetime**: Unlike 2022-2024 which parse as datetime64, 2025's `Datum` column comes in as string objects. Must explicitly parse with `pd.to_datetime()`.

5. **Quote Pos in 2024 is float64**: While other years have int64, 2024 has float values like `10.0`. Must convert to int after dropping NaN.

6. **DB2% = 100.0 in 802 records**: These are quotes where HKvoll = 0 (no cost recorded), so DB2 = Umsatz and margin = 100%. These should be flagged as `dq_100pct_margin = True`.

7. **Reference file has 15 codes, not 14**: The actual reference file includes `RZ` (Reaktionszeit / Reaction time) which was listed in the prompt. Count confirmed at 15 rows. One discrepancy: the reference file spells `Exlude` (typo for `Exclude`) for code `LZ`.

8. **S-prefix orders**: 53 of the 169 unmatched won-quote order IDs start with `S` (e.g., `S100544`). These appear to be service orders that don't appear in the invoice file. The remaining ~116 are likely recent orders not yet invoiced.

### Linkage Profile

| Metric | Value |
|--------|-------|
| Won quotes total | 1,733 |
| Won quotes with Auftrag | 1,724 (99.5%) |
| Won quotes without Auftrag | 9 |
| Unique won-quote order IDs | 1,575 |
| Matched to invoice order IDs | **1,406 (89.3%)** |
| Unmatched | 169 (53 S-prefix service orders + ~116 recent/pending) |

---

## TASK 1.1 — Project Setup & Environment

### Objective
Create the full project directory structure, virtual environment, and install all dependencies.

### Directory Structure
```
scherzinger-platform/
├── backend/
│   ├── __init__.py
│   ├── main.py              # FastAPI app entry point
│   ├── database.py           # DB connection, session management
│   ├── config.py             # Settings (env vars, DB URL, etc.)
│   ├── api/
│   │   ├── __init__.py
│   │   └── v1/
│   │       ├── __init__.py
│   │       ├── margins.py    # Margin analysis endpoints
│   │       ├── quotes.py     # Quote performance endpoints
│   │       ├── quality.py    # Data quality endpoints
│   │       └── stats.py      # General statistics
│   ├── models/
│   │   ├── __init__.py
│   │   ├── invoice.py
│   │   ├── quote.py
│   │   ├── customer.py
│   │   ├── product.py
│   │   └── linkage.py
│   ├── schemas/
│   │   ├── __init__.py
│   │   ├── margins.py
│   │   ├── quotes.py
│   │   └── quality.py
│   └── services/
│       ├── __init__.py
│       ├── margin_service.py
│       ├── quote_service.py
│       └── quality_service.py
├── scripts/
│   ├── clean_data.py
│   ├── load_data.py
│   ├── link_quotes_invoices.py
│   └── run_quality_checks.py
├── data/                     # Symlink to Scherzinger_new/Data/
├── frontend/                 # Phase 2 — not implemented yet
│   └── .gitkeep
├── tests/
│   ├── __init__.py
│   ├── test_data_integrity.py
│   ├── test_margin_service.py
│   ├── test_quote_service.py
│   └── test_api.py
├── alembic/                  # Migrations
├── alembic.ini
├── requirements.txt
├── .env.example
├── .env                      # Created from .env.example
├── .gitignore
└── README.md
```

### requirements.txt
```
fastapi==0.109.0
uvicorn[standard]==0.27.0
sqlalchemy==2.0.25
alembic==1.13.1
psycopg2-binary==2.9.9
pandas==2.1.4
openpyxl==3.1.2
python-dotenv==1.0.0
pydantic==2.5.3
pydantic-settings==2.1.0
streamlit==1.30.0
plotly==5.18.0
httpx==0.26.0
pytest==7.4.4
pyarrow==14.0.2
scipy==1.11.4
```

### .env.example / .env
```
DATABASE_URL=postgresql://pryzm:pryzm_dev@localhost:5432/scherzinger_margin_db
API_HOST=0.0.0.0
API_PORT=8000
```

### .gitignore
```
data/*.xlsx
data/cleaned/
.env
__pycache__/
*.pyc
.venv/
*.egg-info/
.pytest_cache/
```

### Steps
1. Create the full directory tree with all `__init__.py` files
2. Write `requirements.txt`, `.env.example`, `.gitignore`
3. Copy `.env.example` → `.env`
4. Symlink `data/` → `Scherzinger_new/Data/` (or copy the xlsx files)
5. Create Python venv: `python3 -m venv .venv && source .venv/bin/activate`
6. Install: `pip install -r requirements.txt`
7. Initialize git: `git init && git add . && git commit -m "Initial project structure"`

### Verification
- `ls -R` shows complete tree
- `python -c "import fastapi, sqlalchemy, pandas; print('OK')"` succeeds

---

## TASK 1.2 — PostgreSQL Database Setup

### Objective
Create the PostgreSQL database, user, and configure SQLAlchemy connection.

### Database Setup
```sql
CREATE USER pryzm WITH PASSWORD 'pryzm_dev';
CREATE DATABASE scherzinger_margin_db OWNER pryzm;
GRANT ALL PRIVILEGES ON DATABASE scherzinger_margin_db TO pryzm;
```

### backend/config.py
```python
from pydantic_settings import BaseSettings

class Settings(BaseSettings):
    DATABASE_URL: str = "postgresql://pryzm:pryzm_dev@localhost:5432/scherzinger_margin_db"
    API_HOST: str = "0.0.0.0"
    API_PORT: int = 8000

    class Config:
        env_file = ".env"

settings = Settings()
```

### backend/database.py
Use **synchronous** SQLAlchemy (not async — simpler, and Streamlit doesn't support async well):

```python
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker, DeclarativeBase

engine = create_engine(
    settings.DATABASE_URL,
    pool_size=10,
    max_overflow=20,
    pool_pre_ping=True
)

SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)

class Base(DeclarativeBase):
    pass

def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()
```

### Verification
Run `SELECT 1` through SQLAlchemy to confirm connectivity.

---

## TASK 1.3 — Database Schema & Models

### Objective
Create all 6 SQLAlchemy 2.0 ORM models, set up Alembic migrations, and seed reference data.

### Table 1: `customers`
```
customer_id     : String, PK (from Firma — stored as string e.g. "103459")
name            : String, nullable (placeholder for future enrichment)
first_seen_date : Date (earliest date across invoices and quotes for this customer)
created_at      : DateTime, server default utcnow
```

### Table 2: `products`
```
article_id      : String, PK (from Artikel e.g. "202427", "201439-A")
drawing         : String, nullable (from Zeichnung)
description     : String, nullable (from Bezeichnung in invoices, Name in quotes)
business_unit   : String (from BU — always "BU001" in current data)
commodity_group : String, nullable (from WG — 9 groups: BKAES, BKAGG, SOPU, BKAIZ, SOPUZK, OFRSCR, MBKUEHL, MBDIV, OFRLMG)
created_at      : DateTime, server default utcnow
```

### Table 3: `invoices`
```
id               : Integer, PK, autoincrement
invoice_id       : String, index (from Rechnung — e.g. "6009811")
position         : Integer (from Pos.)
order_id         : String, index, nullable (from Auftrag — NORMALIZED: all converted to string, ".0" stripped. 5 nulls in 2025)
date             : Date, index (from Datum — 2025 needs explicit pd.to_datetime parsing)
customer_id      : String, FK → customers.customer_id
article_id       : String, FK → products.article_id
business_unit    : String
commodity_group  : String, nullable (3 nulls total)
currency         : String (from Währung)
exchange_rate    : Float (from Kurs)
quantity         : Integer (from Menge)
revenue          : Float (from Umsatz)
revenue_per_unit : Float (from "Umsatz\n/ Stck.")
hkvoll_per_unit  : Float (from "HKvoll\n/ Stck.")
hkvar_per_unit   : Float (from "HKvar\n/ Stck.")
material_per_unit: Float (from "MatAnteil\n/ Stck.")
fek_per_unit     : Float (from "FEK\n/ Stck.")
fv_per_unit      : Float (from "davon FV\n/ Stck.")
db1_total        : Float (from "DB I")
db1_per_unit     : Float (from "DB I\n/ Stck.")
db1_margin       : Float (from "DB I Marge" — DECIMAL format, e.g. 0.883. 20 nulls total)
db2_total        : Float (from "DB II")
db2_per_unit     : Float (from "DB II\n/ Stck.")
db2_margin       : Float (from "DB II Marge" — DECIMAL format, e.g. 0.845. 20 nulls total. Range: -18.94 to 0.92)
year             : Integer (derived from date)
quarter          : Integer (derived from date, 1-4)
month            : Integer (derived from date, 1-12)
dq_missing_margin: Boolean, default False (db2_margin is NaN — 20 records)
dq_negative_margin: Boolean, default False (db2_margin < 0 — 13 records)
dq_low_margin    : Boolean, default False (0 <= db2_margin < 0.10)
dq_any_issue     : Boolean, default False (any of the above)

UNIQUE CONSTRAINT: (invoice_id, position)
INDEXES: (customer_id, date), (article_id), (order_id), (year, month)
```

### Table 4: `quotes`
```
id                     : Integer, PK, autoincrement
quote_id               : String, index (from Angebot — e.g. "AN102237", "AN102273.01")
position               : Integer (from Pos — NOTE: 2024 sheet has float64 dtype, must convert to int)
status_code            : Integer (from * — values: 4 or 5 only)
status                 : String (derived: "won" if 4, "lost" if 5)
is_won                 : Boolean (derived: True if status_code == 4)
date                   : Date, index (from Datum)
customer_id            : String, FK → customers.customer_id
article_id             : String, FK → products.article_id
business_unit          : String
commodity_group        : String, nullable
currency               : String
exchange_rate          : Float
quantity               : Integer (from Menge)
revenue                : Float (from Umsatz — quoted revenue)
hkvoll                 : Float, nullable (from HKvoll — total cost, NOT per unit. 96 nulls)
db2_total              : Float, nullable (from DB2. 96 nulls)
db2_margin             : Float, nullable (from DB2% — **MUST DIVIDE BY 100**. Raw value 73.26 → stored as 0.7326. 96 nulls)
order_id               : String, nullable, index (from Auftrag — 1,995 non-null: 1,724 won + 271 lost)
rejection_code         : String, nullable (from "Auftrag Code" — **MUST NORMALIZE CASE**: uppercase all, then map P→PR, T→TE)
rejection_code_reliable: Boolean (derived: True if year >= 2025)
year                   : Integer (derived)
quarter                : Integer (derived)
month                  : Integer (derived)
dq_missing_cost        : Boolean, default False (HKvoll is NaN or 0 — 96 NaN + additional zeros)
dq_100pct_margin       : Boolean, default False (raw DB2% == 100.0 — 802 records)
dq_any_issue           : Boolean, default False

UNIQUE CONSTRAINT: (quote_id, position)
INDEXES: (customer_id, date), (article_id), (order_id), (year, is_won), (rejection_code)
```

### Table 5: `quote_invoice_links`
```
id                : Integer, PK, autoincrement
quote_id          : String, index
quote_position    : Integer
invoice_id        : String, index
invoice_position  : Integer
order_id          : String, index (the Auftrag linking them)
match_type        : String (always "direct_auftrag")
quoted_db2_margin : Float
actual_db2_margin : Float
margin_gap        : Float (quoted - actual, in decimal e.g. 0.039 = 3.9pp)
days_to_invoice   : Integer, nullable (invoice_date - quote_date in days)
created_at        : DateTime, server default utcnow

INDEXES: (order_id), (quote_id), (invoice_id)
```

### Table 6: `rejection_codes` (reference table)
```
code             : String, PK
description_de   : String (German description from Beschreibung column)
description_en   : String (English meaning from Meaning column)
interpretation   : String (from Interpretation column)
use_for_pricing  : String (from "Usage for price elasticity?" column — values: "Use", "Cautious", "Exclude")
```

**Seed data — from the actual reference file (15 codes):**

| Code | description_de | description_en | use_for_pricing |
|------|---------------|----------------|-----------------|
| AN | Anfrage | Inquiry | Cautious |
| DO | Dokumentation / Zertifikate | Compliance / certificates | Exclude |
| FI | Firmenimage | Company image | Cautious |
| KA | Keine Angabe (they suppose; unsure) | No information | Exclude |
| KD | Kunde nicht kontaktiert | We did not follow up | Exclude |
| KE | Keine Reaktion Endkunde | No reaction from end customer | Cautious |
| KN | Kundenprojekt nicht realisiert | Project cancelled | Cautious |
| KR | Keine Reaktion | Unknown (No Response) | Cautious |
| LZ | Lieferzeit | Delivery time too long | Exclude |
| PA | Parallelangebot | Competitor was cheaper | Use |
| PR | Preis | Too expensive (price) | Use |
| QS | Qualität | Quality concerns | Cautious |
| RZ | Reaktionszeit | Reaction time | Exclude |
| SL | Systemlieferant | System supplier preferred | Exclude |
| TE | Lösung techn. Nicht passend | Technical rejection | Exclude |

### Alembic Setup Steps
1. `alembic init alembic`
2. Edit `alembic.ini`: set `sqlalchemy.url` to read from env
3. Edit `alembic/env.py`: import Base and all models, set `target_metadata = Base.metadata`
4. `alembic revision --autogenerate -m "initial_schema"`
5. `alembic upgrade head`
6. Seed `rejection_codes` with 15 rows
7. Verify: `SELECT table_name FROM information_schema.tables WHERE table_schema='public'`

---

## TASK 1.4 — Data Cleaning Pipeline

### Objective
Create `scripts/clean_data.py` that reads raw Excel files and produces clean, validated parquet files.

### Invoice Cleaning Function: `clean_invoices()`

**Step 1: Read and concatenate all 4 sheets**
```python
sheets = ['2022', '2023', '2024', '2025']
frames = []
for sheet in sheets:
    df = pd.read_excel(invoice_file, sheet_name=sheet)
    df['_sheet_year'] = int(sheet)
    frames.append(df)
raw = pd.concat(frames, ignore_index=True)
```

**Step 2: Normalize column names**
The Excel columns contain literal `\n` characters. Build a mapping dict:
```python
column_map = {
    'Rechnung': 'invoice_id',
    'Pos.': 'position',
    'Auftrag': 'order_id',
    'Datum': 'date',
    'Firma': 'customer_id',
    'BU': 'business_unit',
    'WG': 'commodity_group',
    'Artikel': 'article_id',
    'Zeichnung': 'drawing',
    'Bezeichnung': 'description',
    'Kurs': 'exchange_rate',
    'Währung': 'currency',
    'Menge': 'quantity',
    'Umsatz': 'revenue',
    'Umsatz\n/ Stck.': 'revenue_per_unit',
    'HKvoll\n/ Stck.': 'hkvoll_per_unit',
    'HKvar\n/ Stck.': 'hkvar_per_unit',
    'MatAnteil\n/ Stck.': 'material_per_unit',
    'FEK\n/ Stck.': 'fek_per_unit',
    'davon FV\n/ Stck.': 'fv_per_unit',
    'DB I': 'db1_total',
    'DB I\n/ Stck.': 'db1_per_unit',
    'DB I Marge': 'db1_margin',
    'DB II': 'db2_total',
    'DB II\n/ Stck.': 'db2_per_unit',
    'DB II Marge': 'db2_margin',
}
```
**IMPORTANT**: Before applying the map, normalize raw column names by stripping leading/trailing whitespace. The actual column names in the file have the literal `\n` embedded — match them exactly.

**Step 3: Type conversions**
```python
df['invoice_id'] = df['invoice_id'].astype(str)
df['position'] = df['position'].astype(int)
df['customer_id'] = df['customer_id'].astype(str)
df['article_id'] = df['article_id'].astype(str)

# CRITICAL: Auftrag normalization
# 2022-2024: int64 (e.g. 3007707) — convert to str → "3007707"
# 2025: float64 (e.g. 3013751.0) with 5 nulls — convert to str, strip ".0"
df['order_id'] = df['order_id'].apply(
    lambda x: str(int(x)) if pd.notna(x) else None
)

# Date parsing — 2025 comes as object strings
df['date'] = pd.to_datetime(df['date'], errors='coerce')
```

**Step 4: Derive time columns**
```python
df['year'] = df['date'].dt.year
df['month'] = df['date'].dt.month
df['quarter'] = df['date'].dt.quarter
```

**Step 5: Data quality flags**
```python
df['dq_missing_margin'] = df['db2_margin'].isna()        # Expected: 20
df['dq_negative_margin'] = df['db2_margin'] < 0           # Expected: 13
df['dq_low_margin'] = (df['db2_margin'] >= 0) & (df['db2_margin'] < 0.10)
df['dq_any_issue'] = df['dq_missing_margin'] | df['dq_negative_margin'] | df['dq_low_margin']
```

**Step 6: Validation**
- Assert no duplicate (invoice_id, position) pairs → already verified: 0 duplicates
- Drop rows where date is NaT after coercion (should be 0)
- Assert revenue and quantity are numeric
- Print summary

### Quote Cleaning Function: `clean_quotes()`

**Step 1: Read and concatenate**
Same pattern as invoices, 4 sheets.

**Step 2: Column mapping**
```python
column_map = {
    'Angebot': 'quote_id',
    'Pos': 'position',
    '*': 'status_code',
    'Datum': 'date',
    'Firma': 'customer_id',
    'Artikel': 'article_id',
    'Zeichnung': 'drawing',
    'Name': 'customer_name',
    'BU': 'business_unit',
    'WG': 'commodity_group',
    'Kurs': 'exchange_rate',
    'Währung': 'currency',
    'Menge': 'quantity',
    'Umsatz': 'revenue',
    'HKvoll': 'hkvoll',
    'DB2': 'db2_total',
    'DB2%': 'db2_pct_raw',   # Keep raw for DQ flag, then convert
    'Auftrag': 'order_id',
    'Auftrag Code': 'rejection_code',
}
```

**Step 3: Type conversions**
```python
df['quote_id'] = df['quote_id'].astype(str)
df['position'] = df['position'].astype(float).astype(int)  # Handle 2024 float dtype
df['status_code'] = df['status_code'].astype(int)
df['customer_id'] = df['customer_id'].astype(str)
df['article_id'] = df['article_id'].astype(str)
df['order_id'] = df['order_id'].apply(lambda x: str(x).strip() if pd.notna(x) else None)

# CRITICAL: DB2% conversion — percentage to decimal
df['db2_margin'] = df['db2_pct_raw'] / 100.0  # 73.26 → 0.7326

# CRITICAL: Rejection code normalization
# Step A: Uppercase everything
df['rejection_code'] = df['rejection_code'].str.upper().str.strip()
# Step B: Map single-letter abbreviations to full codes
code_fix = {'P': 'PR', 'T': 'TE'}
df['rejection_code'] = df['rejection_code'].replace(code_fix)
# Step C: NaN stays NaN
```

**Step 4: Derived columns**
```python
df['status'] = df['status_code'].map({4: 'won', 5: 'lost'})
df['is_won'] = df['status_code'] == 4
df['rejection_code_reliable'] = df['year'] >= 2025
df['year'] = df['date'].dt.year
df['month'] = df['date'].dt.month
df['quarter'] = df['date'].dt.quarter
```

**Step 5: Data quality flags**
```python
df['dq_missing_cost'] = df['hkvoll'].isna() | (df['hkvoll'] == 0)
df['dq_100pct_margin'] = df['db2_pct_raw'] == 100.0  # Flag BEFORE dividing by 100
df['dq_any_issue'] = df['dq_missing_cost'] | df['dq_100pct_margin']
```

**Step 6: Drop the raw column**
```python
df.drop(columns=['db2_pct_raw', 'customer_name', '_sheet_year'], inplace=True, errors='ignore')
```

### Helper Functions

**`extract_customers(invoices_df, quotes_df)`**
- Union all unique customer_id from both DataFrames
- For each customer, find the earliest date across both datasets → `first_seen_date`
- Return DataFrame: `customer_id, name (None), first_seen_date`
- Expected: **~967 unique customers** (invoice customers dominate, quotes may add a few more)

**`extract_products(invoices_df, quotes_df)`**
- Union all unique article_id from both DataFrames
- For each article, take the first non-null drawing, description, business_unit, commodity_group
- Prefer invoice data (has `Bezeichnung` which is more descriptive)
- Return DataFrame: `article_id, drawing, description, business_unit, commodity_group`
- Expected: **~1,223+ unique products**

### Output Files
```
data/cleaned/invoices_clean.parquet   # 5,565 rows
data/cleaned/quotes_clean.parquet     # 4,605 rows
data/cleaned/customers.parquet        # ~967+ rows
data/cleaned/products.parquet         # ~1,223+ rows
```

### Summary Report (printed to console)
```
=== INVOICE CLEANING SUMMARY ===
Total records: 5,565
  2022: 1,500
  2023: 1,337
  2024: 1,320
  2025: 1,408
Quality flags:
  Missing margin: 20 (0.36%)
  Negative margin: 13 (0.23%)
  Low margin (<10%): X
  Any issue: X

=== QUOTE CLEANING SUMMARY ===
Total records: 4,605
  2022: 947 (won: 346, lost: 601, rate: 36.5%)
  2023: 1,191 (won: 408, lost: 783, rate: 34.3%)
  2024: 1,176 (won: 458, lost: 718, rate: 38.9%)
  2025: 1,291 (won: 521, lost: 770, rate: 40.4%)
Quality flags:
  Missing cost (HKvoll null/0): X
  100% margin: 802 (17.4%)
  Any issue: X

2025 Rejection Code Distribution (after normalization):
  KR: 267+
  AN: 135+
  KE: 75
  PA: 69+15+14 = ~98 (after merging Pa→PA, P→PR... wait, P→PR not PA)
  ... (full distribution)

Unique customers: ~967+
Unique products: ~1,223+
```

---

## TASK 1.5 — Data Loading Pipeline

### Objective
Create `scripts/load_data.py` that loads cleaned parquet files into PostgreSQL.

### Loading Order (FK-safe)
1. `rejection_codes` (if not already seeded — check count first)
2. `customers` (from `customers.parquet`)
3. `products` (from `products.parquet`)
4. `invoices` (from `invoices_clean.parquet`)
5. `quotes` (from `quotes_clean.parquet`)

### CLI Interface
```bash
python scripts/load_data.py --all           # Load all tables in order
python scripts/load_data.py --table invoices # Load single table
python scripts/load_data.py --all --force    # Truncate and reload
```

### Per-Table Logic
```python
def load_table(session, model_class, df, table_name, force=False):
    existing = session.query(model_class).count()
    if existing > 0 and not force:
        print(f"  {table_name}: already has {existing} records, skipping (use --force)")
        return
    if existing > 0 and force:
        session.execute(text(f"TRUNCATE TABLE {table_name} CASCADE"))
        session.commit()

    records = df.to_dict('records')
    session.execute(insert(model_class), records)
    session.commit()
    print(f"  {table_name}: loaded {len(records)} records")
```

### Special Handling
- **NaN → None**: Parquet preserves NaN for floats. Before inserting, convert NaN to None for nullable columns (especially `order_id`, `commodity_group`, `rejection_code`, margins).
- **Boolean columns**: Parquet stores as bool, SQLAlchemy expects Python bool — should work directly.
- **Date columns**: Parquet stores as datetime64, SQLAlchemy needs Python date — convert with `.dt.date` or let SQLAlchemy handle it.

### Post-Load Verification Queries
```sql
SELECT 'customers' as tbl, COUNT(*) FROM customers
UNION ALL SELECT 'products', COUNT(*) FROM products
UNION ALL SELECT 'invoices', COUNT(*) FROM invoices
UNION ALL SELECT 'quotes', COUNT(*) FROM quotes
UNION ALL SELECT 'rejection_codes', COUNT(*) FROM rejection_codes;

-- FK integrity check
SELECT COUNT(*) FROM invoices i
LEFT JOIN customers c ON i.customer_id = c.customer_id
WHERE c.customer_id IS NULL;  -- Should be 0

SELECT COUNT(*) FROM quotes q
LEFT JOIN customers c ON q.customer_id = c.customer_id
WHERE c.customer_id IS NULL;  -- Should be 0
```

### Expected Counts After Loading
| Table | Expected Count |
|-------|---------------|
| customers | ~967+ |
| products | ~1,223+ |
| invoices | 5,565 |
| quotes | 4,605 |
| rejection_codes | 15 |

---

## TASK 1.6 — Quote-to-Invoice Linkage

### Objective
Build the `quote_invoice_links` table by joining won quotes to invoices on `order_id`.

### Algorithm
```
1. SELECT all won quotes (is_won = True) WHERE order_id IS NOT NULL
   → Expected: 1,724 records with 1,575 unique order_ids

2. SELECT all invoices grouped by order_id
   → Expected: 4,795 unique order_ids

3. JOIN quotes to invoices ON quotes.order_id = invoices.order_id
   → This is a many-to-many join (one quote order can match multiple invoice lines)

4. For each matched pair, calculate:
   margin_gap = quote.db2_margin - invoice.db2_margin
   days_to_invoice = (invoice.date - quote.date).days
   match_type = "direct_auftrag"

5. INSERT into quote_invoice_links
```

### Important: Join is Many-to-Many
A single order_id can have:
- Multiple quote positions (e.g., AN106134 pos 10, AN106134 pos 20)
- Multiple invoice positions (e.g., invoice 6018978 pos 1, pos 2)

The link table should contain all position-level pairs that share an order_id. For margin gap analysis, we compare **position-level** margins where possible, or **order-level averages** if positions don't align.

**Recommended approach**: Join on order_id only (not position), creating cross-product of positions per order. Each link row captures one quote-position ↔ invoice-position pair.

### Linkage Report
```
=== LINKAGE REPORT ===
Won quotes total: 1,733
Won quotes with order_id: 1,724
Unique won order_ids: 1,575
Matched to invoices: ~1,406 unique order_ids (89.3%)
Unmatched: ~169
  - S-prefix (service orders): ~53
  - Recent/pending: ~116

Links created: [total link rows — will be > 1,406 due to position-level cross-join]

Margin Gap Analysis (all links):
  Mean gap: ~3.9pp (0.039 in decimal)
  Median gap: X
  Std dev: X

Gap by Year:
  2022: ~2.3pp
  2023: ~X
  2024: ~4.3pp
  2025: ~4.6pp

Days to Invoice:
  Mean: ~62 days
  Median: ~46 days
  P25: X days
  P75: X days

Gap Distribution:
  Negative (actual > quoted): X links
  0-5pp: X links
  5-10pp: X links
  >10pp: X links
```

### Output
- Insert all links into `quote_invoice_links` table
- Save report to `data/cleaned/linkage_report.txt`
- Print full report to console

---

## TASK 1.7 — FastAPI Backend

### Objective
Create the full REST API with all analytical endpoints.

### backend/main.py
- FastAPI app: title="Scherzinger Margin Intelligence API", version="1.0.0"
- CORS middleware (allow all origins for dev)
- Include routers: stats, margins, quotes, quality (all under `/api/v1/`)
- Startup event: verify DB connection
- `GET /health` → `{"status": "ok"}`

### Endpoint Specification

#### `/api/v1/stats` — General Statistics
```
GET /api/v1/stats
Response: {
  invoices: int,
  quotes: int,
  customers: int,
  products: int,
  links: int,
  date_range: { min: "2022-01-05", max: "2025-12-..." }
}
```

#### `/api/v1/margins/` — Margin Analysis

**GET `/api/v1/margins/summary`**
- Query params: `year` (optional int), `customer_id` (optional str), `commodity_group` (optional str)
- Returns: overall DB1 and DB2 margins (avg, median, revenue-weighted avg), total revenue, total DB2
- Revenue-weighted margin = SUM(db2_total) / SUM(revenue)

**GET `/api/v1/margins/by-year`**
- Returns array of 4 objects (2022-2025), each with: year, revenue, db2_total, db2_margin_avg, db2_margin_weighted, record_count

**GET `/api/v1/margins/by-customer`**
- Query params: `top` (default 20), `year` (optional)
- Returns: top N customers by revenue. Fields: customer_id, revenue, db2_margin_avg, db2_total, invoice_count, quote_count (join to quotes table)

**GET `/api/v1/margins/by-product`**
- Query params: `top` (default 20), `year` (optional)
- Same structure as by-customer but for products

**GET `/api/v1/margins/by-commodity-group`**
- Returns: metrics per commodity_group (9 groups). Fields: commodity_group, revenue, db2_margin_avg, db2_margin_weighted, record_count

**GET `/api/v1/margins/gap-analysis`**
- Query params: `year` (optional)
- Uses `quote_invoice_links` table
- Returns per year: year, avg_quoted_margin, avg_actual_margin, avg_gap, link_count
- Overall: same aggregated
- **This is the KEY endpoint** — proves the ~3.9pp margin erosion

**GET `/api/v1/margins/catalog-vs-quoted`**
- Query params: `year` (optional)
- Split invoices into:
  - "quoted": invoice.order_id exists in quotes table (joined via order_id)
  - "catalog": invoice.order_id does NOT exist in quotes table
- Per category: count, revenue, avg_db2_margin
- Expected: catalog = 63-82% of orders, lower margins than quoted

**GET `/api/v1/margins/trend`**
- Query params: `granularity` (monthly|quarterly, default monthly)
- Returns time series: period, revenue, db2_margin (weighted), db1_margin (weighted), record_count

#### `/api/v1/quotes/` — Quote Performance

**GET `/api/v1/quotes/summary`**
- Query params: `year` (optional)
- Returns: total_quotes, won_count, lost_count, win_rate, total_quoted_revenue, won_revenue, lost_revenue

**GET `/api/v1/quotes/win-rate-by-year`**
- Returns per year: year, total, won, lost, win_rate, won_revenue, lost_revenue

**GET `/api/v1/quotes/win-rate-by-deal-size`**
- Revenue bands: <€1K, €1-5K, €5-10K, €10-50K, >€50K
- Per band: band_label, count, won, lost, win_rate, total_revenue

**GET `/api/v1/quotes/win-rate-by-customer`**
- Query params: `top` (default 20)
- Returns: customer_id, total_quotes, won, lost, win_rate, total_revenue

**GET `/api/v1/quotes/rejection-codes`**
- Query params: `year` (default 2025)
- Returns per code: code, description_de, description_en, interpretation, use_for_pricing, count, revenue, pct_of_lost
- **Add warning field** if year < 2025: `"warning": "Rejection codes unreliable before 2025"`

**GET `/api/v1/quotes/price-sensitivity`**
- Query params: `year` (default 2025)
- Compare DB2 margins of:
  - Won quotes (status_code == 4)
  - Price-lost quotes (rejection_code IN ('PA', 'PR'))
  - Non-price-lost quotes (all other lost)
- Returns: three groups each with avg_margin, median_margin, count, revenue
- Include: t-test p-value comparing won vs price-lost
- Expected: price-lost ~78.9% vs won ~73.7%, p≈0.003

**GET `/api/v1/quotes/conversion-timing`**
- From quote_invoice_links: stats on days_to_invoice
- Returns: mean, median, p25, p75, min, max
- Grouped by year and optionally by deal size band

#### `/api/v1/data-quality/` — Data Quality

**GET `/api/v1/data-quality/summary`**
- Returns: invoice_quality_pct, quote_quality_pct, linkage_rate_pct, rejection_code_coverage_pct (2025 only)

**GET `/api/v1/data-quality/issues`**
- Query params: `issue_type` (optional filter)
- Returns: list of records with dq_any_issue = True. Fields: record_type, record_id, issue_type, details

**GET `/api/v1/data-quality/completeness`**
- Returns: per-field completeness % for invoices and quotes
- E.g., `{"invoices": {"db2_margin": 99.64, "commodity_group": 99.95, ...}, "quotes": {"hkvoll": 97.91, ...}}`

### Pydantic Schemas
Create response models in `backend/schemas/` for all endpoints. Use `Optional` fields where values may be null. Use consistent naming (snake_case).

### Service Layer
Create service functions in `backend/services/`:
- `margin_service.py`: All margin-related queries
- `quote_service.py`: All quote-related queries
- `quality_service.py`: Data quality queries

Each service takes a `Session` and returns Python dicts or lists. The API layer converts to Pydantic models.

### Testing the API
```bash
uvicorn backend.main:app --reload --port 8000
# In another terminal:
curl http://localhost:8000/health
curl http://localhost:8000/api/v1/stats
curl http://localhost:8000/api/v1/margins/summary
curl http://localhost:8000/api/v1/margins/gap-analysis
curl http://localhost:8000/api/v1/quotes/summary
curl http://localhost:8000/api/v1/quotes/rejection-codes?year=2025
curl http://localhost:8000/api/v1/quotes/price-sensitivity?year=2025
curl http://localhost:8000/api/v1/data-quality/summary
```

---

## TASK 1.8 — Testing & Data Verification

### Objective
Create comprehensive tests to validate data integrity and API correctness.

### tests/test_data_integrity.py
```python
# Test exact record counts
def test_invoice_count():
    assert count(Invoice) == 5565

def test_quote_count():
    assert count(Quote) == 4605

def test_won_lost_counts():
    assert count(Quote, is_won=True) == 1733
    assert count(Quote, is_won=False) == 2872

def test_win_rate_by_year():
    # 2022: 36.5%, 2023: 34.3%, 2024: 38.9%, 2025: 40.4%
    rates = {2022: 0.365, 2023: 0.343, 2024: 0.389, 2025: 0.404}
    for year, expected in rates.items():
        actual = won_count(year) / total_count(year)
        assert abs(actual - expected) < 0.01

def test_revenue_by_year():
    expected = {2022: 6_369_103, 2023: 6_233_961, 2024: 5_793_294, 2025: 6_250_360}
    for year, expected_rev in expected.items():
        actual = sum_revenue(year)
        assert abs(actual - expected_rev) < 100  # Allow small float rounding

def test_linkage_rate():
    # ~89.3% of unique won order_ids matched
    matched = count_distinct_matched_orders()
    total = count_distinct_won_order_ids()
    assert abs(matched / total - 0.893) < 0.02

def test_rejection_codes_exist():
    assert count(RejectionCode) == 15

def test_no_orphaned_fks():
    orphan_inv = count_invoices_without_customer()
    orphan_qt = count_quotes_without_customer()
    assert orphan_inv == 0
    assert orphan_qt == 0
```

### tests/test_margin_service.py
```python
def test_margin_gap_overall():
    gap = get_avg_margin_gap()
    assert abs(gap - 0.039) < 0.01  # ~3.9pp

def test_margin_by_year_returns_4():
    result = get_margin_by_year()
    assert len(result) == 4

def test_catalog_majority():
    catalog_pct = get_catalog_pct()
    assert catalog_pct > 0.60  # Catalog > 60% of invoices
```

### tests/test_quote_service.py
```python
def test_win_rate_overall():
    rate = get_win_rate()
    assert abs(rate - 0.376) < 0.02

def test_deal_size_bands():
    bands = get_deal_size_bands()
    assert len(bands) == 5

def test_rejection_codes_2025_only():
    result = get_rejection_codes(year=2025)
    assert len(result) > 0
    assert all(r['count'] > 0 for r in result)

def test_price_sensitivity():
    won_margin = get_won_margin(2025)
    price_lost_margin = get_price_lost_margin(2025)
    assert price_lost_margin > won_margin  # Price-lost has higher margin
```

### tests/test_api.py
```python
# Test all endpoints return 200
endpoints = [
    "/health",
    "/api/v1/stats",
    "/api/v1/margins/summary",
    "/api/v1/margins/by-year",
    "/api/v1/margins/by-customer",
    "/api/v1/margins/by-product",
    "/api/v1/margins/by-commodity-group",
    "/api/v1/margins/gap-analysis",
    "/api/v1/margins/catalog-vs-quoted",
    "/api/v1/margins/trend",
    "/api/v1/quotes/summary",
    "/api/v1/quotes/win-rate-by-year",
    "/api/v1/quotes/win-rate-by-deal-size",
    "/api/v1/quotes/win-rate-by-customer",
    "/api/v1/quotes/rejection-codes?year=2025",
    "/api/v1/quotes/price-sensitivity?year=2025",
    "/api/v1/quotes/conversion-timing",
    "/api/v1/data-quality/summary",
    "/api/v1/data-quality/issues",
    "/api/v1/data-quality/completeness",
]

@pytest.mark.parametrize("endpoint", endpoints)
def test_endpoint_200(client, endpoint):
    response = client.get(endpoint)
    assert response.status_code == 200
```

### Run Command
```bash
pytest tests/ -v --tb=short
```

---

## TASK 1.9 — Documentation & Deployment

### README.md
- Project overview, architecture diagram
- Quick start guide (setup, load, run)
- Data overview
- Link to Swagger docs at `/docs`

### docs/database_schema.md
- Mermaid ER diagram
- Table descriptions
- Key notes on data format conversions

### docs/data_dictionary.md
- Full German→English column mapping for both files
- Type information, examples
- Rejection code reference table with all 15 codes

### docker-compose.yml
```yaml
services:
  postgres:
    image: postgres:16
    environment:
      POSTGRES_USER: pryzm
      POSTGRES_PASSWORD: pryzm_dev
      POSTGRES_DB: scherzinger_margin_db
    ports: ["5432:5432"]
    volumes: [pgdata:/var/lib/postgresql/data]
  api:
    build: .
    ports: ["8000:8000"]
    depends_on: [postgres]
    environment:
      DATABASE_URL: postgresql://pryzm:pryzm_dev@postgres:5432/scherzinger_margin_db

volumes:
  pgdata:
```

### scripts/start.sh
```bash
#!/bin/bash
set -e
alembic upgrade head
python scripts/load_data.py --all
python scripts/link_quotes_invoices.py
uvicorn backend.main:app --host 0.0.0.0 --port 8000
```

---

## Execution Order & Dependencies

| Step | Task | Est. Time | Depends On | Key Output |
|------|------|-----------|------------|------------|
| 1 | 1.1 — Project Setup | 10 min | — | Directory tree, venv, deps |
| 2 | 1.2 — PostgreSQL Setup | 10 min | 1.1 | DB + user created, connection verified |
| 3 | 1.3 — Schema & Models | 30 min | 1.2 | 6 tables created via Alembic, 15 rejection codes seeded |
| 4 | 1.4 — Data Cleaning | 30 min | 1.1 | 4 parquet files in data/cleaned/ |
| 5 | 1.5 — Data Loading | 20 min | 1.3 + 1.4 | All tables populated |
| 6 | 1.6 — Linkage | 20 min | 1.5 | quote_invoice_links populated, linkage report |
| 7 | 1.7 — FastAPI Backend | 45 min | 1.5 + 1.6 | All 20 endpoints working |
| 8 | 1.8 — Testing | 20 min | 1.7 | All tests green |
| 9 | 1.9 — Docs & Deploy | 15 min | All | README, data dict, docker-compose |

**Total: ~3.5 hours**

---

## Critical Implementation Notes (For Claude Code)

### 1. Auftrag (Order ID) Normalization
Invoice `Auftrag`: int64 in 2022-2024, float64 in 2025 (with 5 nulls). Example: `3013751.0`
Quote `Auftrag`: object/string. Example: `"3015259"`
**Rule**: Convert everything to string. For numeric values: `str(int(x))` to strip `.0`. For null: `None`.

### 2. Margin Format Difference
Invoice `DB II Marge`: **decimal** (0.709 = 70.9%). Store as-is.
Quote `DB2%`: **percentage** (73.26 = 73.26%). **Divide by 100** before storing. Store as 0.7326.
Both stored as decimal in DB. All comparisons and gap calculations use decimal format.

### 3. Column Names with Newlines
Invoice Excel has columns like `"Umsatz\n/ Stck."` — the `\n` is a literal newline character embedded in the cell header. Use exact string matching or normalize with `.str.replace('\n', ' ')` before mapping.

### 4. Rejection Code Case Normalization
Raw data has inconsistent casing: `ka`, `Pa`, `P`, `Kd`, `T`, `Rz`, `Lz`
**Normalization**:
1. Uppercase all: `ka→KA`, `Pa→PA`, `Kd→KD`, `Rz→RZ`, `Lz→LZ`
2. Map abbreviations: `P→PR`, `T→TE`

### 5. Rejection Code Reliability
Only 2025 data has meaningful codes. Pre-2025 is dominated by `KA` (no information — 833 occurrences).
**Always filter to year >= 2025** for rejection code analysis. Add `rejection_code_reliable` boolean flag.

### 6. 2024 Quote Position as Float
The 2024 quotes sheet has `Pos` as float64 (values like `10.0`). Convert to int: `.astype(float).astype(int)`.

### 7. 2025 Invoice Date as Object
Unlike other years, 2025's `Datum` column reads as string objects, not datetime. Explicitly parse with `pd.to_datetime(df['date'], errors='coerce')`.

### 8. Status Codes: 4 = Won, 5 = Lost (CONFIRMED)
Verified: 1,733 records with code 4, 2,872 with code 5. Only these two values exist.

### 9. Lost Quotes Can Have Auftrag
271 lost quotes have a non-null order_id. These should NOT be included in linkage — only use won quotes (status_code == 4) for the quote_invoice_links table.

### 10. S-Prefix Service Orders
53 unmatched won-quote order IDs start with `S` (e.g., `S100544`). These are service/special orders that don't appear in the standard invoice file. They contribute to the ~10.7% unmatch rate and can be noted but not treated as errors.
