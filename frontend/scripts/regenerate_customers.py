"""
Regenerate customers_detail.json from real parquet data — ALL customers, not just top 25.
Run: python3 scripts/regenerate_customers.py
"""
import json, os, sys
import pandas as pd
import numpy as np

DATA_DIR = os.path.join(os.path.dirname(__file__), '..', '..', 'Data', 'cleaned')
OUT_PATH = os.path.join(os.path.dirname(__file__), '..', 'src', 'data', 'customers_detail.json')
YEARS = [2022, 2023, 2024, 2025]

def r0(v): return int(round(float(v)))
def r3(v): return round(float(v), 3) if pd.notna(v) else None

def weighted_mean(values, weights):
    w = weights.fillna(0)
    v = values.fillna(0)
    total_w = w.sum()
    if total_w == 0:
        return 0
    return (v * w).sum() / total_w

print("Loading parquets...")
inv = pd.read_parquet(os.path.join(DATA_DIR, 'invoices_clean.parquet'))
qt = pd.read_parquet(os.path.join(DATA_DIR, 'quotes_clean.parquet'))

print(f"Invoices: {len(inv)} rows, {inv['customer_id'].nunique()} unique customers")
print(f"Quotes: {len(qt)} rows, {qt['customer_id'].nunique()} unique customers")

# ── Risk scoring (same logic as generate_real_data.py) ──
latest_date = inv["date"].max()
cust_stats = inv.groupby("customer_id").agg(
    total_revenue=("revenue", "sum"),
    last_invoice=("date", "max"),
    avg_margin=("db2_margin", "mean"),
).reset_index()

yearly_margins = inv.groupby(["customer_id", "year"])["db2_margin"].mean().reset_index()
margin_trends = {}
for cid, grp in yearly_margins.groupby("customer_id"):
    if len(grp) >= 2:
        years = grp["year"].values.astype(float)
        margins = grp["db2_margin"].values
        slope = np.polyfit(years, margins, 1)[0]
        margin_trends[cid] = slope
    else:
        margin_trends[cid] = 0.0

max_revenue = cust_stats["total_revenue"].max()
risk_scores = {}
for _, row in cust_stats.iterrows():
    cid = row["customer_id"]
    days_since = (latest_date - row["last_invoice"]).days
    recency_score = min(days_since / 730, 1.0)
    slope = margin_trends.get(cid, 0.0)
    trend_score = min(max(-slope * 50, 0), 1.0)
    rev_score = 1.0 - min(row["total_revenue"] / max_revenue, 1.0)
    composite = 0.4 * recency_score + 0.35 * trend_score + 0.25 * rev_score
    composite = min(max(composite, 0.0), 1.0)
    if composite >= 0.75: tier = "critical"
    elif composite >= 0.55: tier = "high"
    elif composite >= 0.30: tier = "medium"
    else: tier = "low"
    risk_scores[cid] = {"score": r3(composite), "tier": tier}

# ── Per-customer aggregates ──
cust_agg = inv.groupby("customer_id").agg(
    total_revenue_eur=("revenue", "sum"),
    total_invoices=("invoice_id", "nunique"),
    first_seen=("date", "min"),
).reset_index()

cust_margin = inv.groupby("customer_id").apply(
    lambda g: weighted_mean(g["db2_margin"], g["revenue"])
).reset_index(name="avg_db2_margin")
cust_agg = cust_agg.merge(cust_margin, on="customer_id", how="left")

# Quote stats
qt_stats = qt.groupby("customer_id").agg(
    total_quotes=("quote_id", "nunique"),
    won_quotes=("is_won", "sum"),
).reset_index()
qt_stats["win_rate"] = qt_stats["won_quotes"] / qt_stats["total_quotes"]
cust_agg = cust_agg.merge(qt_stats[["customer_id", "total_quotes", "win_rate"]], on="customer_id", how="left")
cust_agg["total_quotes"] = cust_agg["total_quotes"].fillna(0).astype(int)
cust_agg["win_rate"] = cust_agg["win_rate"].fillna(0)

# Segment by revenue rank
cust_agg = cust_agg.sort_values("total_revenue_eur", ascending=False).reset_index(drop=True)
n = len(cust_agg)
cust_agg["segment"] = "Occasional"
cust_agg.loc[:int(n * 0.05), "segment"] = "Enterprise"
cust_agg.loc[int(n * 0.05) + 1:int(n * 0.20), "segment"] = "Mid-Market"
cust_agg.loc[int(n * 0.20) + 1:int(n * 0.60), "segment"] = "SME"

print(f"\nSegment distribution:")
print(cust_agg["segment"].value_counts().to_string())

# Revenue/margin by year
rev_by_year = inv.groupby(["customer_id", "year"])["revenue"].sum().unstack(fill_value=0)
margin_by_year = inv.groupby(["customer_id", "year"]).apply(
    lambda g: weighted_mean(g["db2_margin"], g["revenue"])
).unstack()

# Top products per customer
top_prods = inv.groupby(["customer_id", "article_id"])["revenue"].sum().reset_index()

# ── Build ALL customers (not just top 25) ──
print(f"\nBuilding detail for ALL {n} customers...")
customers = []
for _, row in cust_agg.iterrows():
    cid = row["customer_id"]
    rs = risk_scores.get(cid, {"score": 0.5, "tier": "medium"})

    rby = {}
    for yr in YEARS:
        rby[str(yr)] = r0(rev_by_year.loc[cid, yr]) if cid in rev_by_year.index and yr in rev_by_year.columns else 0

    mby = {}
    for yr in YEARS:
        if cid in margin_by_year.index and yr in margin_by_year.columns:
            val = margin_by_year.loc[cid, yr]
            mby[str(yr)] = r3(val) if pd.notna(val) else None
        else:
            mby[str(yr)] = None

    cp = top_prods[top_prods["customer_id"] == cid].sort_values("revenue", ascending=False).head(3)
    tp = cp["article_id"].tolist()

    years_active = max(1, len([y for y in YEARS if rby.get(str(y), 0) > 0]))
    ltv = r0(row["total_revenue_eur"] * (4 / years_active))

    customers.append({
        "customer_id": cid,
        "name": f"Customer {cid}",
        "segment": row["segment"],
        "first_seen": row["first_seen"].strftime("%Y-%m-%d") if pd.notna(row["first_seen"]) else "2022-01-01",
        "total_revenue_eur": r0(row["total_revenue_eur"]),
        "total_invoices": int(row["total_invoices"]),
        "avg_db2_margin": r3(row["avg_db2_margin"]),
        "win_rate": r3(row["win_rate"]),
        "total_quotes": int(row["total_quotes"]),
        "risk_tier": rs["tier"],
        "risk_score": rs["score"],
        "revenue_by_year": rby,
        "margin_by_year": mby,
        "top_products": tp,
        "ltv_estimated": ltv,
    })

# Segment aggregates
seg_agg = cust_agg.groupby("segment").agg(
    count=("customer_id", "count"),
    total_revenue=("total_revenue_eur", "sum"),
    avg_margin=("avg_db2_margin", "mean"),
).reset_index()
segments = []
for _, row in seg_agg.iterrows():
    segments.append({
        "segment": row["segment"],
        "count": int(row["count"]),
        "total_revenue": r0(row["total_revenue"]),
        "avg_margin": r3(row["avg_margin"]),
    })

# Churn summary
churn = []
for tier_name, display_name in [("low", "Low"), ("medium", "Medium"), ("high", "High"), ("critical", "Critical")]:
    tier_custs = [cid for cid, rs in risk_scores.items() if rs["tier"] == tier_name]
    tier_df = cust_agg[cust_agg["customer_id"].isin(tier_custs)]
    years_active_map = {}
    for cid in tier_custs:
        ya = 0
        for yr in YEARS:
            if cid in rev_by_year.index and yr in rev_by_year.columns and rev_by_year.loc[cid, yr] > 0:
                ya += 1
        years_active_map[cid] = max(1, ya)
    total_ltv = sum(
        (tier_df[tier_df["customer_id"] == cid]["total_revenue_eur"].sum() * (4 / years_active_map.get(cid, 1)))
        for cid in tier_custs if cid in tier_df["customer_id"].values
    )
    churn.append({
        "risk_level": display_name,
        "count": len(tier_custs),
        "total_ltv": r0(total_ltv),
    })

output = {
    "customers": customers,
    "segments": segments,
    "churn_summary": churn,
}

with open(OUT_PATH, 'w') as f:
    json.dump(output, f)

print(f"\nWrote {OUT_PATH}")
print(f"Total customers: {len(customers)}")
print(f"Segments: {[(s['segment'], s['count']) for s in segments]}")
print(f"File size: {os.path.getsize(OUT_PATH) / 1024:.1f} KB")
