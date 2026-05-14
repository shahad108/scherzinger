# Frank's Forecasting v2.1 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans. Steps use checkbox (`- [ ]`) syntax.

**Goal:** Ship plan-vs-actual surface + pocket-margin waterfall + prescriptive bridge + bias card + pipeline-implied P50 + 3 quick wins, layered on top of v2 (branch `forecast-redesign-v2`).

**Architecture:** New BFF composers feed optional fields onto `ForecastShell`; new React components render only when fields present (graceful degradation). All changes behind `?layout=v2` (already default). Five new components, four new BFF composers, plus extensions to `HeroForecast`, `ScenarioLibrary`, `PageHead`, and the Drivers accordion.

**Tech Stack:** Same as v2 — React 19 + Vite 7 + Tailwind 4 + Recharts + TanStack Query + FastAPI + Pydantic. New backend dependencies: none.

**Phase commits:** every phase ends with `git add -A && git commit -m "..." && git push`. Per `MEMORY.md` `feedback_phase_commits`.

**Parallel-execution map:**
- Phase 0 sequential (types + plan.json seed).
- **Phases 1A/1B/1C run in parallel** — five independent BFF composers, each in its own file.
- **Phases 2A/2B/2C run in parallel** — four independent React components, each in its own file (no overlap).
- Phase 3 modifies `HeroForecast.tsx` (sequential after 1A composer is in and 2A types match).
- Phase 4 quick wins parallel with 3.
- Phase 5 audits filter propagation across existing cards — sequential, careful.
- Phase 6 reorders `index.tsx` (one-shot diff).
- Phase 7 Playwright + visual baseline refresh.
- Phase 8 review + fix loop.

---

## Phase 0 — Types & plan data scaffold

### Task 0.1: Branch + pull

**Files:** none (verification)

- [ ] Run: `cd /Users/dharmendersingh/Documents/Scherzinger_new && git checkout forecast-redesign-v2 && git pull --rebase`
- [ ] Confirm HEAD ≥ `37e4f98`.

### Task 0.2: Frontend types

**Files:** Modify `frontend-v2/src/types/forecast.ts`

- [ ] **Step 1: Append new v2.1 types**

```ts
// === v2.1 — plan tracking, pocket waterfall, bias, next moves, pipeline P50 ===

export interface PlanPoint {
  month: string;              // YYYY-MM
  plan: number;
  actual: number | null;      // null for future months
}

export interface PlanResetEntry {
  at: string;                 // ISO datetime
  by: string;
  reason: string;
  priorValue: number;
}

export interface PlanVarianceAttribution {
  price: number;
  volume: number;
  mix: number;
  cost: number;
  other?: number;
}

export interface PlanTracking {
  points: PlanPoint[];                  // current FY by month
  cumulativeGapEur: number;             // current YTD
  cumulativeGapPct: number;
  recentMonthAttribution: PlanVarianceAttribution | null;
  resetLog: PlanResetEntry[];
}

export interface PocketStep {
  name: 'list' | 'quoted' | 'booked' | 'invoiced' | 'db2';
  value: number;                        // € per unit OR € total — composer chooses
  leakagePct?: number;
}

export interface PocketClusterBand {
  cluster: string;
  histogram: { bin: string; count: number }[];
  median: number;
  p10: number;
  p90: number;
}

export interface PocketWaterfall {
  steps: PocketStep[];
  perCluster: PocketClusterBand[];
  unit: 'eur_per_unit' | 'eur_total' | 'pct_of_list';
}

export interface BiasRow {
  cluster: string;
  cmeOverMad: number;                   // tracking signal
  hitRatePct: number;                   // within ±5%
  trailing6moDirection: 'over' | 'under' | 'flat';
}

export interface BiasPanel {
  rows: BiasRow[];
  windowMonths: number;
  footnote?: string;
}

export interface NextMove {
  id: string;
  rank: number;
  cluster: string | null;
  headline: string;
  forecastImpactEur: number;
  sourceSignal: string;
  actionIntent: {
    kind: string;                       // matches Action Center intent kinds
    payload: Record<string, unknown>;
  };
}

export interface PipelineImpliedPoint {
  month: string;
  pipelineP50: number;
}

// Extend ForecastSeriesPoint:
//   pipelineP50?: number  (composer merges into hero.series)

// Extend ForecastShell (interface declared at line ~642):
//   planTracking?: PlanTracking;
//   pocketWaterfall?: PocketWaterfall;
//   bias?: BiasPanel;
//   nextMoves?: NextMove[];
//   dataThrough?: string;
//   filterScope?: { tier?: string; family?: string; cluster?: string; scenarioId?: string };
```

- [ ] **Step 2: Add `pipelineP50?: number` to `ForecastSeriesPoint`.** Find the interface (~line 48). Add the optional field.

- [ ] **Step 3: Extend `ForecastShell`** (~line 642). Add the five fields above as optional.

- [ ] **Step 4: Typecheck**

Run: `cd /Users/dharmendersingh/Documents/Scherzinger_new/frontend-v2 && npx tsc --noEmit`
Expected: clean.

### Task 0.3: Seed plan.json

**Files:** Create `scherzinger-platform/backend/data/plan.json`

- [ ] **Step 1: Seed plan**

```json
{
  "fiscal_year": 2026,
  "rows": [
    { "month": "2026-01", "mode": "revenue", "cluster": null, "value": 510000, "reset_log": [] },
    { "month": "2026-02", "mode": "revenue", "cluster": null, "value": 545000, "reset_log": [] },
    { "month": "2026-03", "mode": "revenue", "cluster": null, "value": 470000, "reset_log": [] },
    { "month": "2026-04", "mode": "revenue", "cluster": null, "value": 530000, "reset_log": [{ "at": "2026-02-12T09:00:00Z", "by": "Manuel", "reason": "Steel S355 spike priced in", "prior_value": 510000 }] },
    { "month": "2026-05", "mode": "revenue", "cluster": null, "value": 555000, "reset_log": [] },
    { "month": "2026-06", "mode": "revenue", "cluster": null, "value": 600000, "reset_log": [] },
    { "month": "2026-07", "mode": "revenue", "cluster": null, "value": 580000, "reset_log": [] },
    { "month": "2026-08", "mode": "revenue", "cluster": null, "value": 595000, "reset_log": [] },
    { "month": "2026-09", "mode": "revenue", "cluster": null, "value": 620000, "reset_log": [] },
    { "month": "2026-10", "mode": "revenue", "cluster": null, "value": 640000, "reset_log": [] },
    { "month": "2026-11", "mode": "revenue", "cluster": null, "value": 615000, "reset_log": [] },
    { "month": "2026-12", "mode": "revenue", "cluster": null, "value": 650000, "reset_log": [] }
  ]
}
```

- [ ] **Step 2: Commit + push**

```bash
git add frontend-v2/src/types/forecast.ts scherzinger-platform/backend/data/plan.json
git commit -m "feat(forecast/v2.1/p0): types + plan.json seed for v2.1 work" -- HEREDOC with Co-Authored-By trailer
git push
```

---

## Phase 1 — BFF composers (run 1A/1B/1C in parallel)

### Phase 1A — Plan tracking + Pocket waterfall

**Files:**
- Create `scherzinger-platform/backend/services/forecast/plan_tracking.py`
- Create `scherzinger-platform/backend/services/forecast/pocket_waterfall.py`
- Create `scherzinger-platform/tests/services/test_plan_tracking.py`
- Create `scherzinger-platform/tests/services/test_pocket_waterfall.py`

- [ ] **Step 1: `plan_tracking.py`**

```python
"""Plan-vs-actual tracking composer.

Reads plan from data/plan.json. Joins with realized monthly revenue from the
invoice service (same source as real_hero.py). Returns cumulative gap + variance
attribution from the existing PVM payload + plan-reset audit log.
"""
from __future__ import annotations
from pathlib import Path
from typing import Any
import json

PLAN_PATH = Path(__file__).resolve().parents[2] / "data" / "plan.json"


def _load_plan(mode: str, cluster: str | None) -> list[dict[str, Any]]:
    if not PLAN_PATH.exists():
        return []
    raw = json.loads(PLAN_PATH.read_text() or "{}")
    rows = raw.get("rows", [])
    return [r for r in rows if r.get("mode") == mode and (r.get("cluster") or None) == cluster]


def build_plan_tracking(
    *,
    mode: str = "revenue",
    cluster: str | None = None,
    actuals_by_month: dict[str, float] | None = None,
    pvm_attribution: dict[str, float] | None = None,
) -> dict[str, Any]:
    plan_rows = _load_plan(mode, cluster)
    actuals = actuals_by_month or {}
    points = []
    cum_plan = 0.0
    cum_actual = 0.0
    last_actual_month: str | None = None
    for r in plan_rows:
        plan_v = float(r["value"])
        actual_v = actuals.get(r["month"])
        points.append({
            "month": r["month"],
            "plan": plan_v,
            "actual": actual_v,
        })
        cum_plan += plan_v
        if actual_v is not None:
            cum_actual += actual_v
            last_actual_month = r["month"]
    gap_eur = cum_actual - cum_plan if last_actual_month else 0.0
    gap_pct = (gap_eur / cum_plan * 100) if cum_plan else 0.0
    reset_log: list[dict[str, Any]] = []
    for r in plan_rows:
        for entry in r.get("reset_log", []):
            reset_log.append({
                "at": entry["at"],
                "by": entry["by"],
                "reason": entry["reason"],
                "priorValue": float(entry["prior_value"]),
            })
    return {
        "points": points,
        "cumulativeGapEur": gap_eur,
        "cumulativeGapPct": gap_pct,
        "recentMonthAttribution": pvm_attribution or None,
        "resetLog": reset_log,
    }
```

- [ ] **Step 2: Test `plan_tracking.py`**

```python
# scherzinger-platform/tests/services/test_plan_tracking.py
import json, tempfile
from pathlib import Path
import pytest
from backend.services.forecast import plan_tracking

@pytest.fixture
def tmp_plan(monkeypatch, tmp_path):
    p = tmp_path / "plan.json"
    p.write_text(json.dumps({
        "fiscal_year": 2026,
        "rows": [
            {"month":"2026-01","mode":"revenue","cluster":None,"value":500,"reset_log":[]},
            {"month":"2026-02","mode":"revenue","cluster":None,"value":600,"reset_log":[{"at":"2026-01-15T00:00:00Z","by":"M","reason":"steel","prior_value":550}]},
            {"month":"2026-03","mode":"revenue","cluster":None,"value":700,"reset_log":[]},
        ],
    }))
    monkeypatch.setattr(plan_tracking, "PLAN_PATH", p)

def test_cumulative_gap(tmp_plan):
    actuals = {"2026-01": 480, "2026-02": 590}
    out = plan_tracking.build_plan_tracking(actuals_by_month=actuals)
    assert out["points"][0]["plan"] == 500 and out["points"][0]["actual"] == 480
    assert out["points"][2]["actual"] is None
    # Cumulative: actual 480+590=1070, plan up to last actual 500+600=1100, gap = -30
    assert out["cumulativeGapEur"] == pytest.approx(-30)
    assert out["cumulativeGapPct"] == pytest.approx(-30/1100*100, abs=1e-6)
    assert len(out["resetLog"]) == 1
    assert out["resetLog"][0]["by"] == "M"

def test_no_actuals(tmp_plan):
    out = plan_tracking.build_plan_tracking()
    assert out["cumulativeGapEur"] == 0
    assert all(p["actual"] is None for p in out["points"])
```

- [ ] **Step 3: `pocket_waterfall.py`** — analogous structure. Build steps from invoice + quote ledgers (use same DB session pattern as `real_hero.py`). For each cluster, build a histogram with bins via numpy if available, or pure-python `Counter` over rounded buckets.

```python
"""Pocket-margin waterfall composer.

For demo: reads existing invoice + quote ledger via the same DB connection
real_hero.py uses. Computes List → Quoted → Booked → Invoiced → DB2 step values
and per-cluster pocket-price bands. Stubbed-out reasonable defaults if the
DB session is unavailable so screens endpoint never fails because of this card.
"""
from __future__ import annotations
from typing import Any

# Step ordering — must remain stable; frontend renders in this order.
STEP_ORDER = ["list", "quoted", "booked", "invoiced", "db2"]


def _safe_steps(values: dict[str, float]) -> list[dict[str, Any]]:
    out = []
    prev = None
    for name in STEP_ORDER:
        v = float(values.get(name, 0.0))
        leakage = None
        if prev is not None and prev != 0:
            leakage = (prev - v) / prev * 100.0
        out.append({"name": name, "value": v, "leakagePct": leakage})
        prev = v
    return out


def _histogram(prices: list[float], bins: int = 12) -> list[dict[str, Any]]:
    if not prices:
        return []
    lo, hi = min(prices), max(prices)
    if lo == hi:
        return [{"bin": f"{lo:.2f}", "count": len(prices)}]
    step = (hi - lo) / bins
    counts = [0] * bins
    for p in prices:
        idx = min(int((p - lo) / step), bins - 1)
        counts[idx] += 1
    return [{"bin": f"{lo + i*step:.2f}", "count": c} for i, c in enumerate(counts)]


def build_pocket_waterfall(
    *,
    list_price: float = 100.0,
    quoted: float = 88.0,
    booked: float = 80.0,
    invoiced: float = 76.0,
    db2: float = 18.0,
    per_cluster_prices: dict[str, list[float]] | None = None,
) -> dict[str, Any]:
    steps = _safe_steps({
        "list": list_price, "quoted": quoted, "booked": booked,
        "invoiced": invoiced, "db2": db2,
    })
    bands = []
    for cluster, prices in (per_cluster_prices or {}).items():
        if not prices:
            continue
        sorted_p = sorted(prices)
        n = len(sorted_p)
        median = sorted_p[n // 2]
        p10 = sorted_p[max(0, int(n * 0.1) - 1)]
        p90 = sorted_p[min(n - 1, int(n * 0.9))]
        bands.append({
            "cluster": cluster,
            "histogram": _histogram(prices),
            "median": median, "p10": p10, "p90": p90,
        })
    return {
        "steps": steps,
        "perCluster": bands,
        "unit": "pct_of_list" if list_price == 100.0 else "eur_total",
    }
```

- [ ] **Step 4: Test `pocket_waterfall.py`**

```python
import pytest
from backend.services.forecast import pocket_waterfall

def test_steps_have_leakage():
    out = pocket_waterfall.build_pocket_waterfall()
    assert [s["name"] for s in out["steps"]] == ["list","quoted","booked","invoiced","db2"]
    # Leakage from list (100) to quoted (88) = 12%
    assert out["steps"][1]["leakagePct"] == pytest.approx(12.0)
    # First step has no leakage
    assert out["steps"][0]["leakagePct"] is None

def test_per_cluster_band():
    out = pocket_waterfall.build_pocket_waterfall(
        per_cluster_prices={"BKAES": [80, 82, 85, 88, 90, 95]},
    )
    assert len(out["perCluster"]) == 1
    band = out["perCluster"][0]
    assert band["cluster"] == "BKAES"
    assert band["p10"] <= band["median"] <= band["p90"]
    assert sum(h["count"] for h in band["histogram"]) == 6
```

- [ ] **Step 5: Run tests + commit**

```bash
cd /Users/dharmendersingh/Documents/Scherzinger_new/scherzinger-platform && .venv/bin/pytest tests/services/test_plan_tracking.py tests/services/test_pocket_waterfall.py -v
git add -f scherzinger-platform/backend/services/forecast/plan_tracking.py \
            scherzinger-platform/backend/services/forecast/pocket_waterfall.py \
            scherzinger-platform/tests/services/test_plan_tracking.py \
            scherzinger-platform/tests/services/test_pocket_waterfall.py
git commit -m "feat(forecast/v2.1/p1a): plan_tracking + pocket_waterfall composers"
git push
```

### Phase 1B — Bias + Next moves

**Files:**
- Create `scherzinger-platform/backend/services/forecast/bias.py`
- Create `scherzinger-platform/backend/services/forecast/next_moves.py`
- Create matching tests

- [ ] **Step 1: `bias.py`**

```python
"""Forecast bias composer — per-cluster tracking signal."""
from __future__ import annotations
from statistics import mean
from typing import Any


def _direction(values: list[float], threshold: float = 0.5) -> str:
    if not values:
        return "flat"
    avg = mean(values)
    if avg > threshold:
        return "over"
    if avg < -threshold:
        return "under"
    return "flat"


def build_bias(
    *,
    cluster_errors: dict[str, list[float]] | None = None,  # signed forecast errors (forecast - actual)
    window_months: int = 6,
) -> dict[str, Any]:
    cluster_errors = cluster_errors or {}
    rows = []
    for cluster, errs in cluster_errors.items():
        if not errs:
            continue
        cme = sum(errs)
        mad = mean(abs(e) for e in errs) or 1.0
        tracking_signal = cme / mad
        hits = [1 for e in errs if abs(e) <= 5.0]
        hit_rate = (sum(hits) / len(errs)) * 100.0
        rows.append({
            "cluster": cluster,
            "cmeOverMad": tracking_signal,
            "hitRatePct": hit_rate,
            "trailing6moDirection": _direction(errs[-window_months:]),
        })
    return {
        "rows": rows,
        "windowMonths": window_months,
        "footnote": "Tracking signal = cumulative ME / MAD. |value| > 4 conventionally flags bias.",
    }
```

- [ ] **Step 2: Test bias**

```python
import pytest
from backend.services.forecast import bias

def test_persistent_overforecast():
    out = bias.build_bias(cluster_errors={"BKAES": [3.0, 4.0, 5.0, 4.5, 3.8, 4.2]})
    row = next(r for r in out["rows"] if r["cluster"] == "BKAES")
    assert row["cmeOverMad"] > 0
    assert row["trailing6moDirection"] == "over"

def test_balanced_bias():
    out = bias.build_bias(cluster_errors={"MBDIV": [2.0, -2.0, 1.0, -1.0]})
    row = next(r for r in out["rows"] if r["cluster"] == "MBDIV")
    assert abs(row["cmeOverMad"]) < 0.5
    assert row["trailing6moDirection"] == "flat"

def test_hit_rate():
    out = bias.build_bias(cluster_errors={"X": [1.0, 2.0, 6.0, 7.0]})
    row = next(r for r in out["rows"] if r["cluster"] == "X")
    # 2 of 4 within ±5 → 50%
    assert row["hitRatePct"] == 50.0
```

- [ ] **Step 3: `next_moves.py`**

```python
"""Next-cycle moves composer — 3-5 ranked recommendations for Frank."""
from __future__ import annotations
from typing import Any


def build_next_moves(
    *,
    cluster_signals: dict[str, dict[str, Any]] | None = None,
    top_n: int = 5,
) -> list[dict[str, Any]]:
    """cluster_signals example:
      {
        "BKAGG": {
          "skus_below_floor": 12,
          "forecast_impact_eur": 420000,
          "signal": "cost crossing list price",
        },
        ...
      }
    """
    cluster_signals = cluster_signals or {}
    moves: list[dict[str, Any]] = []
    for cluster, sig in cluster_signals.items():
        impact = float(sig.get("forecast_impact_eur", 0))
        moves.append({
            "id": f"move-{cluster.lower()}",
            "rank": 0,  # filled after sort
            "cluster": cluster,
            "headline": _headline_for(cluster, sig),
            "forecastImpactEur": impact,
            "sourceSignal": sig.get("signal", "anomaly"),
            "actionIntent": {
                "kind": sig.get("intent_kind", "open_studio"),
                "payload": {
                    "cluster": cluster,
                    "context": sig.get("intent_context", "next-cycle"),
                },
            },
        })
    moves.sort(key=lambda m: m["forecastImpactEur"], reverse=True)
    moves = moves[:top_n]
    for i, m in enumerate(moves):
        m["rank"] = i + 1
    return moves


def _headline_for(cluster: str, sig: dict[str, Any]) -> str:
    n = sig.get("skus_below_floor")
    if n:
        return f"{cluster} cluster: {n} SKUs at risk · €{int(sig.get('forecast_impact_eur', 0))/1000:.0f}k next-12mo impact"
    return f"{cluster}: {sig.get('signal', 'review recommended')}"
```

- [ ] **Step 4: Test next_moves**

```python
def test_ranks_by_impact():
    from backend.services.forecast import next_moves
    out = next_moves.build_next_moves(cluster_signals={
        "A": {"forecast_impact_eur": 100000, "signal": "x"},
        "B": {"forecast_impact_eur": 300000, "signal": "y"},
        "C": {"forecast_impact_eur": 200000, "signal": "z"},
    })
    assert [m["cluster"] for m in out] == ["B","C","A"]
    assert out[0]["rank"] == 1 and out[2]["rank"] == 3

def test_top_n():
    from backend.services.forecast import next_moves
    out = next_moves.build_next_moves(
        cluster_signals={f"C{i}": {"forecast_impact_eur": i} for i in range(10)},
        top_n=3,
    )
    assert len(out) == 3
```

- [ ] **Step 5: Commit + push**

```bash
cd /Users/dharmendersingh/Documents/Scherzinger_new/scherzinger-platform && .venv/bin/pytest tests/services/test_bias.py tests/services/test_next_moves.py -v
git add -f scherzinger-platform/backend/services/forecast/bias.py \
            scherzinger-platform/backend/services/forecast/next_moves.py \
            scherzinger-platform/tests/services/test_bias.py \
            scherzinger-platform/tests/services/test_next_moves.py
git commit -m "feat(forecast/v2.1/p1b): bias + next_moves composers"
git push
```

### Phase 1C — Pipeline P50 + composer wiring

**Files:**
- Create `scherzinger-platform/backend/services/forecast/pipeline_p50.py` + test
- Modify `scherzinger-platform/backend/services/forecast/composer.py` to attach all five new fields onto the shell

- [ ] **Step 1: `pipeline_p50.py`**

```python
"""Pipeline-implied P50 composer — open-quote book × win_prob × close-month."""
from __future__ import annotations
from typing import Any

TIER_WIN_PROB_DEFAULT = {"A": 0.65, "B": 0.45, "C": 0.25, "D": 0.10}


def build_pipeline_p50(*, open_quotes: list[dict[str, Any]] | None = None) -> list[dict[str, Any]]:
    """open_quotes example: [{ 'close_month': '2026-08', 'value': 24000, 'win_prob': 0.4, 'tier': 'B' }]"""
    open_quotes = open_quotes or []
    by_month: dict[str, float] = {}
    for q in open_quotes:
        month = q.get("close_month")
        if not month:
            continue
        value = float(q.get("value", 0))
        win_prob = q.get("win_prob")
        if win_prob is None:
            win_prob = TIER_WIN_PROB_DEFAULT.get(q.get("tier", "C"), 0.25)
        by_month[month] = by_month.get(month, 0.0) + value * float(win_prob)
    return [{"month": m, "pipelineP50": v} for m, v in sorted(by_month.items())]
```

- [ ] **Step 2: Test pipeline_p50**

```python
def test_aggregates_by_month():
    from backend.services.forecast import pipeline_p50
    out = pipeline_p50.build_pipeline_p50(open_quotes=[
        {"close_month":"2026-08","value":10000,"win_prob":0.5,"tier":"A"},
        {"close_month":"2026-08","value":20000,"win_prob":0.25,"tier":"C"},
        {"close_month":"2026-09","value":40000,"tier":"B"},  # uses default 0.45
    ])
    aug = next(p for p in out if p["month"] == "2026-08")
    assert aug["pipelineP50"] == 10000*0.5 + 20000*0.25
    sep = next(p for p in out if p["month"] == "2026-09")
    assert sep["pipelineP50"] == 40000*0.45
```

- [ ] **Step 3: Wire into `composer.py`**

Read `scherzinger-platform/backend/services/forecast/composer.py`. Locate the function that builds `ForecastShell` (probably `build_forecast_shell` or similar — `grep -n "def build" composer.py`). After the existing assembly, append:

```python
# v2.1 additions — all optional, render only when supplied
try:
    actuals_by_month = _actuals_by_month_for(mode, cluster)  # helper that reuses real_hero
    pvm_attr = shell.get("pvm", {}).get("attribution") if isinstance(shell.get("pvm"), dict) else None
    shell["planTracking"] = build_plan_tracking(
        mode=mode, cluster=cluster,
        actuals_by_month=actuals_by_month, pvm_attribution=pvm_attr,
    )
except Exception as e:
    log.warning("plan_tracking compose failed: %s", e)

try:
    shell["pocketWaterfall"] = build_pocket_waterfall(
        # in absence of full ledger join, use safe defaults from `safe_steps`
        # plus per-cluster prices from existing pareto_sku rows
    )
except Exception as e:
    log.warning("pocket_waterfall compose failed: %s", e)

try:
    errors = _per_cluster_errors_from_backtest(...)  # reuse real_backtest panel
    shell["bias"] = build_bias(cluster_errors=errors)
except Exception as e:
    log.warning("bias compose failed: %s", e)

try:
    signals = _next_move_signals(shell)  # mine cost-decomposition + pareto rows
    shell["nextMoves"] = build_next_moves(cluster_signals=signals)
except Exception as e:
    log.warning("next_moves compose failed: %s", e)

try:
    open_quotes = _open_quotes_payload(...)
    pp50 = build_pipeline_p50(open_quotes=open_quotes)
    pp50_map = {p["month"]: p["pipelineP50"] for p in pp50}
    for point in shell.get("hero", {}).get("series", []):
        if point.get("month") in pp50_map:
            point["pipelineP50"] = pp50_map[point["month"]]
except Exception as e:
    log.warning("pipeline_p50 compose failed: %s", e)

# Canonical freshness signal
shell["dataThrough"] = _resolve_data_through(shell)

# Filter scope (so frontend can render badges)
shell["filterScope"] = {
    "tier": tier, "family": family, "cluster": cluster, "scenarioId": scenario_id,
}
```

The helpers (`_actuals_by_month_for`, `_per_cluster_errors_from_backtest`, `_next_move_signals`, `_open_quotes_payload`, `_resolve_data_through`) reuse existing code. If exact field names diverge, **prefer null-safe shims** that emit the new fields with `None`/empty values rather than failing — graceful degradation is the contract.

- [ ] **Step 4: Test integration**

Run: existing screens contract test exercising `/api/v1/screens/forecast`. Confirm new fields are present in the response (`grep -n "planTracking\|pocketWaterfall\|bias\|nextMoves" backend/tests/contract`). Add an assertion if missing.

- [ ] **Step 5: Commit + push**

```bash
git add -f scherzinger-platform/backend/services/forecast/pipeline_p50.py \
            scherzinger-platform/backend/services/forecast/composer.py \
            scherzinger-platform/tests/services/test_pipeline_p50.py
git commit -m "feat(forecast/v2.1/p1c): pipeline_p50 + composer wiring for v2.1 fields"
git push
```

---

## Phase 2 — New React components (run 2A/2B/2C in parallel)

### Phase 2A — PlanTrackingStrip + PocketWaterfallCard

**Files:**
- Create `frontend-v2/src/features/forecasting/components/PlanTrackingStrip.tsx` + test
- Create `frontend-v2/src/features/forecasting/components/PocketWaterfallCard.tsx` + test

- [ ] **Step 1: PlanTrackingStrip**

Recharts `ComposedChart` with two `Area` lines (plan = neutral, actual = rose-deep), plus a gap-fill `Area` between them, plus the variance chip strip on the right.

Key features (use the template from the spec's "Visual / UX details"):
- Default rendering when `data.planTracking?.points` is empty → render placeholder text "Plan tracking not yet wired".
- Variance attribution chip strip pulled from `recentMonthAttribution`.
- "Plan reset history" button → modal (re-use the project's modal pattern; look at how `BriefingButton` does it).
- Render the cumulative gap headline: `"Cumulative gap: ±€X (±Y%)"` with tone (emerald if ≥0, amber/rose if <0).

Skeleton:

```tsx
import { ComposedChart, Area, Line, XAxis, YAxis, Tooltip, ResponsiveContainer } from 'recharts';
import type { PlanTracking } from '@/types/forecast';
import { FilterScopeBadge } from './FilterScopeBadge';

interface Props { data: PlanTracking | undefined; }

export function PlanTrackingStrip({ data }: Props) {
  if (!data || data.points.length === 0) return null;
  // ...compose chart + chips + button
}
```

- [ ] **Step 2: Test PlanTrackingStrip**

Vitest — assert renders empty when no data, renders headline gap, renders chip count from attribution.

- [ ] **Step 3: PocketWaterfallCard**

Reuse `computeWaterfall` from PVMWaterfall.tsx for the step-range bars. Add the per-cluster histogram grid below.

```tsx
import type { PocketWaterfall } from '@/types/forecast';
// ...
interface Props { data: PocketWaterfall | undefined; }
export function PocketWaterfallCard({ data }: Props) {
  if (!data) return null;
  // Stacked-range bars for steps; histogram grid for perCluster
}
```

- [ ] **Step 4: Test PocketWaterfallCard**

Assert: arithmetic correctness of step deltas; histogram render count = perCluster.length; per-cluster band has p10 ≤ median ≤ p90.

- [ ] **Step 5: Commit + push**

```bash
cd /Users/dharmendersingh/Documents/Scherzinger_new/frontend-v2 && npx tsc --noEmit && npm test -- PlanTrackingStrip PocketWaterfallCard
git add frontend-v2/src/features/forecasting/components/PlanTrackingStrip.{tsx,test.tsx} \
        frontend-v2/src/features/forecasting/components/PocketWaterfallCard.{tsx,test.tsx} \
        frontend-v2/src/features/forecasting/components/FilterScopeBadge.{tsx,test.tsx}   # if created in 2A
git commit -m "feat(forecast/v2.1/p2a): PlanTrackingStrip + PocketWaterfallCard"
git push
```

### Phase 2B — BiasCard + NextCycleMovesStrip

**Files:**
- Create `frontend-v2/src/features/forecasting/components/BiasCard.tsx` + test
- Create `frontend-v2/src/features/forecasting/components/NextCycleMovesStrip.tsx` + test

- [ ] **Step 1: BiasCard**

Table layout like `CalibrationCard`. Per-cluster row: cluster · tracking signal · hit rate · direction chip with arrow icon.

```tsx
import type { BiasPanel } from '@/types/forecast';
interface Props { data: BiasPanel | undefined; }
export function BiasCard({ data }: Props) {
  if (!data || data.rows.length === 0) return null;
  // ...
}
```

Tracking signal tone: |value| > 4 → red, > 2 → amber, else neutral.

- [ ] **Step 2: Test BiasCard**

Assert: row count = rows.length, direction chip text matches, tone class applied for high tracking signal.

- [ ] **Step 3: NextCycleMovesStrip**

Horizontal flex of cards, overflow scroll. Each card 320px. Click "Open" → emits `actionIntent` via `useUiAction()`.

```tsx
import { useUiAction } from '@/hooks/useUiAction'; // confirm exact path
import type { NextMove } from '@/types/forecast';
interface Props { moves: NextMove[] | undefined; }
export function NextCycleMovesStrip({ moves }: Props) {
  const dispatch = useUiAction();
  if (!moves || moves.length === 0) return null;
  // render cards, onClick → dispatch(move.actionIntent)
}
```

- [ ] **Step 4: Test NextCycleMovesStrip**

Mock `useUiAction`. Assert: cards render in rank order, click dispatches the matching intent.

- [ ] **Step 5: Commit + push**

```bash
npx tsc --noEmit && npm test -- BiasCard NextCycleMovesStrip
git add frontend-v2/src/features/forecasting/components/BiasCard.{tsx,test.tsx} \
        frontend-v2/src/features/forecasting/components/NextCycleMovesStrip.{tsx,test.tsx}
git commit -m "feat(forecast/v2.1/p2b): BiasCard + NextCycleMovesStrip"
git push
```

### Phase 2C — FilterScopeBadge + DiagnosticsAccordionToggle

**Files:**
- Create `frontend-v2/src/features/forecasting/components/FilterScopeBadge.tsx` + test
- Create `frontend-v2/src/features/forecasting/components/DiagnosticsAccordionToggle.tsx` + test

- [ ] **Step 1: FilterScopeBadge**

Small inline pill. Two variants:
- `unfiltered`: amber background, text "(unfiltered — all clusters)".
- `scoped`: muted background, text "(scope: cluster=BKAES, tier=A)".

```tsx
interface Props {
  unfiltered?: boolean;
  scope?: { tier?: string; family?: string; cluster?: string; scenarioId?: string };
}
export function FilterScopeBadge({ unfiltered, scope }: Props) { /* ... */ }
```

- [ ] **Step 2: DiagnosticsAccordionToggle**

Small disclosure inside the Drivers accordion: `[+ Show diagnostics (4)]` → expands its children. Closed by default.

```tsx
import { useState } from 'react';
interface Props { count: number; children: React.ReactNode; }
export function DiagnosticsAccordionToggle({ count, children }: Props) { /* ... */ }
```

- [ ] **Step 3: Tests + commit + push**

```bash
git add frontend-v2/src/features/forecasting/components/FilterScopeBadge.{tsx,test.tsx} \
        frontend-v2/src/features/forecasting/components/DiagnosticsAccordionToggle.{tsx,test.tsx}
git commit -m "feat(forecast/v2.1/p2c): FilterScopeBadge + DiagnosticsAccordionToggle primitives"
git push
```

---

## Phase 3 — HeroForecast pipeline P50 + Hero KPI tile + (parallel with Phase 4)

**Files:**
- Modify `frontend-v2/src/features/forecasting/components/HeroForecast.tsx`
- Modify `frontend-v2/src/features/forecasting/components/HeroForecast.test.tsx`

- [ ] **Step 1: Add pipeline P50 line**

In `HeroForecast`, after the P50 `<Line dataKey="p50">`, add a second:

```tsx
<Line
  type="monotone"
  dataKey="pipelineP50"
  stroke="var(--rose-soft)"
  strokeWidth={1.5}
  strokeDasharray="6 4"
  dot={false}
  activeDot={false}
  isAnimationActive={false}
  name="Pipeline P50"
  connectNulls={false}
/>
```

- [ ] **Step 2: Tooltip diff**

Extend the tooltip formatter to show both lines when both are defined, plus a `Δ` percentage.

- [ ] **Step 3: Test**

Add a test that the line appears when at least one `series` point has `pipelineP50`, and is omitted otherwise.

- [ ] **Step 4: Typecheck + commit + push**

```bash
npx tsc --noEmit && npm test -- HeroForecast
git add frontend-v2/src/features/forecasting/components/HeroForecast.tsx \
        frontend-v2/src/features/forecasting/components/HeroForecast.test.tsx
git commit -m "feat(forecast/v2.1/p3): pipeline-implied P50 second line on HeroForecast"
git push
```

---

## Phase 4 — Quick wins (parallel with Phase 3)

### Task 4.1: Scenario presets

**Files:** Modify `frontend-v2/src/features/forecasting/components/ScenarioLibrary.tsx`

- [ ] **Step 1: Define preset bodies**

At top of file:

```ts
const SCENARIO_PRESETS = [
  { name: 'Steel S355 +20%, pass-through 60%', body: { commodity: { steel_s355: { delta_pct: 0.20, pass_through: 0.60 } } } },
  { name: '+3% list price, 50% capture', body: { price: { list_uplift_pct: 0.03, capture: 0.50 } } },
  { name: 'Lose top-3 customer in BKAGG', body: { churn: { cluster: 'BKAGG', top_n: 3 } } },
  { name: 'Win 5pp more of price-lost quotes', body: { quotes: { recapture_price_lost_pct: 0.05 } } },
  { name: 'Industrial recession −10% volume', body: { macro: { volume_delta_pct: -0.10 } } },
];
```

- [ ] **Step 2: Render preset row**

Above the existing saved-scenarios list, render a horizontal row of 5 chip cards. Each `Apply` button writes `?scenario_id=preset:<index>` and dispatches via the existing scenario-apply mutation (the BFF stub for preset:N is a follow-up — for this PR, the click writes the URL param and the BFF can pick it up; if not yet ready, the click no-ops gracefully).

- [ ] **Step 3: Test**

Assert preset count = 5, each card has Apply button.

### Task 4.2: Traffic-light freshness chip

**Files:** Modify `frontend-v2/src/features/forecasting/components/PageHead.tsx`

- [ ] **Step 1: Add freshness chip**

Helper:

```ts
function freshnessTone(iso?: string): 'green' | 'amber' | 'rose' {
  if (!iso) return 'amber';
  const ageHours = (Date.now() - new Date(iso).getTime()) / 3_600_000;
  if (ageHours <= 24) return 'green';
  if (ageHours <= 72) return 'amber';
  return 'rose';
}
```

Render a tiny pill next to "Updated" using `data.dataThrough` (passed in as a prop or read from the existing data shape).

- [ ] **Step 2: Test (vitest)**

Assert: green pill renders for ≤24h, amber for ≤72h, rose for >72h.

### Task 4.3: Drivers accordion reorder + diagnostics toggle

**Files:** Modify `frontend-v2/src/features/forecasting/index.tsx` (Phase 6 will also touch this; keep the modification minimal here — just the Drivers block).

- [ ] **Step 1: Reorder inside the Drivers Accordion**

In `AggregateViewV2`, reorder the cards inside `<Accordion title="Drivers & accuracy">`. Place top-visible cards first:
- `WalkForward`
- `CalibrationCard`
- `BiasCard` ← new, render only when `data.bias` is present
- `TornadoCard`
- `DistributionGrid`
- `QuoteToRevenueBridge`
- `MarginTrajectoryCard`

Then wrap the last four in `<DiagnosticsAccordionToggle count={4}>`:
- `SeasonalOverlayCard`
- `CommodityTrajectoriesCard`
- `CostDecompositionCard`
- `InputCostTrajectory`

- [ ] **Step 2: Typecheck + commit + push (end of Phase 4)**

```bash
npx tsc --noEmit && npm test
git add frontend-v2/src/features/forecasting/components/ScenarioLibrary.tsx \
        frontend-v2/src/features/forecasting/components/PageHead.tsx \
        frontend-v2/src/features/forecasting/index.tsx
git commit -m "feat(forecast/v2.1/p4): scenario presets + freshness traffic-light + drivers reorder"
git push
```

---

## Phase 5 — Filter propagation audit

**Files:** Modify the cards listed below.

The goal: every card that renders data which *could* be cluster/tier/family-scoped either (a) actually filters its data, or (b) shows a `<FilterScopeBadge unfiltered scope={...} />`.

- [ ] **Step 1: Audit list**

For each of: `MarginTrajectoryCard`, `CostDecompositionCard`, `SeasonalOverlayCard`, `CommodityTrajectoriesCard`, `InputCostTrajectory`, `QuoteToRevenueBridge`, `WalkForward`, `CalibrationCard`, `TornadoCard`, `DistributionGrid`:
  - Open the file.
  - Search for whether its data prop varies with `cluster`/`tier`/`family` URL params (often it doesn't — the BFF composer is what filters).
  - If it doesn't honor the filter, **add a header-level `<FilterScopeBadge unfiltered scope={data.filterScope} />`** if `data.filterScope` indicates an active filter.

For cards that DO filter (e.g., `ClusterLens` if a cluster is selected, the page already narrows): no change.

- [ ] **Step 2: Wire `filterScope` through**

Pass `data.filterScope` (from the new `ForecastShell.filterScope` field) into each card that needs to display the badge. Most existing cards take a single data prop — add an optional `filterScope` prop and surface the badge in the card header.

- [ ] **Step 3: Per-card tests**

For each modified card, add a single test: "renders unfiltered badge when filterScope is active and card doesn't honor cluster filter".

- [ ] **Step 4: Commit + push**

```bash
npx tsc --noEmit && npm test
git add -A frontend-v2/src/features/forecasting/components/
git commit -m "feat(forecast/v2.1/p5): filter-scope audit — unfiltered badges on cards that don't honor cluster/tier/family"
git push
```

---

## Phase 6 — Final reorder of `index.tsx`

**Files:** Modify `frontend-v2/src/features/forecasting/index.tsx`

- [ ] **Step 1: Final V2 order**

Apply the spec's exact top→bottom order to `AggregateViewV2`:

```tsx
function AggregateViewV2({ data, article, mode, showAll }: Omit<AggregateProps, 'layoutV2'>) {
  const [clusterParams] = useSearchParams();
  const activeCluster = clusterParams.get('cluster') ?? null;
  // (compute KPI derivations as today)
  return (
    <>
      <PlanTrackingStrip data={data.planTracking} />              {/* NEW */}
      <HeroKPIStrip ... />
      <HeroForecast hero={data.hero} mode={mode} cluster={activeCluster} enableActualEntry />
      <NextCycleMovesStrip moves={data.nextMoves} />             {/* NEW */}
      {data.pvm && <PVMWaterfall ... />}
      <PocketWaterfallCard data={data.pocketWaterfall} />        {/* NEW */}
      {data.pareto?.sku?.rows?.length ? <TopSKUsForecastTable ... /> : null}
      <ClusterLens clusters={data.clusters} />
      {data.activeScenarioId && <ScenarioActiveBanner ... />}
      <Accordion title="Drivers & accuracy" defaultOpen={false}>
        <WalkForward panel={data.walkForward} />
        {data.calibration && <CalibrationCard data={data.calibration} />}
        <BiasCard data={data.bias} />                            {/* NEW */}
        {data.tornado && <TornadoCard tornado={data.tornado} />}
        {data.distributions && <DistributionGrid ... />}
        {data.quoteToRevenue && <QuoteToRevenueBridge data={data.quoteToRevenue} />}
        {data.marginTrajectory && <MarginTrajectoryCard data={data.marginTrajectory} />}
        <DiagnosticsAccordionToggle count={4}>
          {data.seasonalOverlay && <SeasonalOverlayCard data={data.seasonalOverlay} />}
          {data.commodityTrajectories && <CommodityTrajectoriesCard data={data.commodityTrajectories} />}
          {data.costDecomposition && <CostDecompositionCard data={data.costDecomposition} />}
          <InputCostTrajectory data={data.inputCost} />
        </DiagnosticsAccordionToggle>
      </Accordion>
      <Accordion title="Renewals & new product" id="block-renewals" defaultOpen={false}>
        <div data-focus-target="renewals">
          <PriceFloor rows={data.priceFloor} footnote={data.priceFloorFootnote} highlightArticle={article} />
        </div>
        <NewProductForecast data={data.newProduct} />
      </Accordion>
      <ParetoLayer data={data.pareto} showAll={showAll} />
      <OverrideLog />
      {data.methodology && <>
        <AssumptionsFooter assumptions={data.methodology.assumptions} dataThrough={data.dataThrough} />
        <MethodologyPanel methodology={data.methodology} />
      </>}
    </>
  );
}
```

- [ ] **Step 2: AssumptionsFooter consumes canonical `data.dataThrough`** — drop the previous `assumptions.find(label === 'Data-through')` lookup; use the canonical field with fallback to the old lookup for graceful degradation.

- [ ] **Step 3: Typecheck + tests + commit + push**

```bash
npx tsc --noEmit && npm test
git add frontend-v2/src/features/forecasting/index.tsx
git commit -m "feat(forecast/v2.1/p6): final V2 reorder — plan-first + prescriptive bridge + diagnostics toggle"
git push
```

---

## Phase 7 — Playwright + visual baselines

- [ ] **Step 1: New spec `frontend-v2/tests/e2e/forecasting-v2-1.spec.ts`**

```ts
import { test, expect } from '@playwright/test';
import { installForecastMocks, gotoForecasting } from './_helpers/mock-api';

test.describe('Forecasting v2.1', () => {
  test.beforeEach(async ({ page }) => { await installForecastMocks(page); });

  test('plan-tracking strip renders above HeroForecast', async ({ page }) => {
    await gotoForecasting(page, { layout: 'v2' });
    // PlanTrackingStrip renders before HeroForecast
    const planY = await page.getByTestId('plan-tracking-strip').first().boundingBox();
    const heroY = await page.getByTestId('hero-kpi-strip').first().boundingBox();
    expect(planY?.y ?? 0).toBeLessThan(heroY?.y ?? 9999);
  });

  test('next-cycle move card dispatches ActionIntent', async ({ page }) => {
    await gotoForecasting(page, { layout: 'v2' });
    await page.getByTestId('next-cycle-move-card').first().click();
    await expect(page.getByTestId('action-drawer')).toBeVisible();
  });

  test('drivers accordion: diagnostics toggle hides 4 deep cards by default', async ({ page }) => {
    await gotoForecasting(page, { layout: 'v2' });
    await page.getByRole('button', { name: /Drivers & accuracy/i }).click();
    await expect(page.getByTestId('seasonal-overlay-card')).toHaveCount(0);
    await page.getByRole('button', { name: /Show diagnostics/i }).click();
    await expect(page.getByTestId('seasonal-overlay-card')).toBeVisible();
  });
});
```

The mock helper (`tests/e2e/_helpers/mock-api.ts`) needs the new fields (`planTracking`, `pocketWaterfall`, `bias`, `nextMoves`, `dataThrough`, `filterScope`) added to its mocked forecast payload. Reusable sample fixtures should live in `tests/e2e/_helpers/v2-1-fixtures.ts`.

- [ ] **Step 2: Update visual baselines**

Run: `cd /Users/dharmendersingh/Documents/Scherzinger_new/frontend-v2 && npx playwright test forecasting-visual.spec.ts --update-snapshots`.

Commit refreshed PNGs.

- [ ] **Step 3: Run full Playwright suite**

`npx playwright test --reporter=list` — all green.

- [ ] **Step 4: Commit + push**

```bash
git add frontend-v2/tests/e2e/forecasting-v2-1.spec.ts \
        frontend-v2/tests/e2e/_helpers/v2-1-fixtures.ts \
        frontend-v2/tests/e2e/_helpers/mock-api.ts \
        frontend-v2/tests/e2e/forecasting-visual.spec.ts-snapshots/
git commit -m "test(forecast/v2.1/p7): Playwright spec + refreshed visual baselines for v2.1"
git push
```

---

## Phase 8 — Independent review + bugfix loop

- [ ] **Step 1: Dispatch `feature-dev:code-reviewer` agent over `git diff 193162c..HEAD`**

Prompt focus: new BFF endpoints' input validation; new React components' accessibility (NextCycleMovesStrip is a horizontal scroller — keyboard navigability); HeroForecast Recharts perf with the new line; filter-scope plumbing correctness; type safety; test coverage gaps.

- [ ] **Step 2: Triage findings**

🔴 must-fix → fix immediately. 🟡 should-fix → fix unless requires major rework. 🟢 nice-to-have → note as follow-up.

- [ ] **Step 3: Per-fix commit**

`fix(forecast/v2.1/p8): <finding>` pattern. Push.

- [ ] **Step 4: Re-run all gates**

```bash
cd /Users/dharmendersingh/Documents/Scherzinger_new/scherzinger-platform && .venv/bin/pytest tests/services/ tests/api/ -v
cd /Users/dharmendersingh/Documents/Scherzinger_new/frontend-v2 && npx tsc --noEmit && npm test
cd /Users/dharmendersingh/Documents/Scherzinger_new/frontend-v2 && npx playwright test --reporter=list
```

All green → ready for PR.

---

## Spec Coverage Self-Check

| Spec requirement | Phase |
|---|---|
| PlanTrackingStrip | 1A (composer) + 2A (component) + 6 (mount) |
| Filter propagation guarantee | 2C (badge primitive) + 5 (audit) |
| PocketWaterfallCard | 1A (composer) + 2A (component) + 6 (mount) |
| NextCycleMovesStrip | 1B (composer) + 2B (component) + 6 (mount) |
| BiasCard | 1B (composer) + 2B (component) + 6 (mount inside accordion) |
| Pipeline-implied P50 lane | 1C (composer + composer wiring) + 3 (HeroForecast) |
| Scenario presets | 4.1 |
| Traffic-light freshness | 1C (composer attaches dataThrough) + 4.2 (PageHead) |
| Drivers reorder + diagnostics toggle | 2C (toggle primitive) + 4.3 + 6 (final order) |
| Phase commits + push | every phase tail |
| Playwright + visual baselines | 7 |
| Independent review | 8 |

## Open follow-ups (out of scope of this plan)

- WinLossDriverCard (PA/PR rejection-code lens)
- List-price erosion projection
- Annotation / comment layer
- Briefing persona toggle (Manuel mode)
- At-Risk Revenue tier-stacked bar
- FVA override drill-down
- Cutting `PerCustomerTab` or `ScenarioCompareView` (needs discussion)
- Pricing-studio + margin-cockpit filter-propagation fixes (separate plan; same FilterScopeBadge primitive can be reused)
- Real ML retrain on `forecast:retrain-requested`
- JSON store → warehouse table for overrides AND plan.json
