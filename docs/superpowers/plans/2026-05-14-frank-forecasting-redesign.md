# Frank's Forecasting Redesign — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Rebuild Frank's forecasting page so the forecast (HeroForecast + KPIs) is first, top SKUs are second, and Frank can click any month → enter an actual → see it persisted as a diamond-marked override that feeds back to the model on next retrain.

**Architecture:** Two layers. Frontend: reorder `AggregateView` in `frontend-v2/src/features/forecasting/index.tsx`; revise `HeroForecast` to Hyndman two-band fan chart with click-to-edit; new components `HeroKPIStrip`, `PVMWaterfall`, `TopSKUsForecastTable`, `ActualEntryPanel`, `OverrideLog`, `DriversAccuracyAccordion`, `RenewalsNewProductAccordion`. Backend: FastAPI `/forecast/overrides` CRUD endpoints in `scherzinger-platform/backend/services/forecast/overrides.py`, JSON-backed at `scherzinger-platform/backend/data/forecast-overrides.json`. Gated behind `?layout=v2` URL flag for safe rollout.

**Tech Stack:** React 19 + Vite 7 + TypeScript + Tailwind 4 + Recharts (fan chart), TanStack Query (override mutations), Vitest + React Testing Library (integration), Playwright (E2E + visual regression), FastAPI + Pydantic + JSON file (overrides backend).

**Phase commit policy:** End of every phase → `git add -A && git commit -m "feat(forecast/redesign/pN): ..." && git push`. Per `MEMORY.md` `feedback_phase_commits`, no asking.

**Parallel-execution map:**
- Phase 1 (backend) and Phase 2 (shell reorder) can run in parallel.
- Phase 3 must precede Phase 4 (panel hangs off Hero).
- Phase 5 (PVM + SKU table) can run in parallel with Phase 3/4.
- Phase 6 depends on Phases 1+4 (needs overrides API + entry panel wired).
- Phase 7 waits on 2–6 to land.
- Phase 8 is sequential.

---

## Phase 0 — Scaffold & Setup

### Task 0.1: Confirm clean working tree & branch

**Files:** none (verification only)

- [ ] **Step 1: Verify branch and status**

Run: `git status && git branch --show-current`
Expected: `demo-phase45`, clean tree (untracked `forecasting-snapshot.yml`, `notebooks/`, `snapshot-01-overview.yml` are pre-existing).

- [ ] **Step 2: Create feature branch from current HEAD**

Run: `git checkout -b forecast-redesign-v2`
Expected: switched to new branch.

### Task 0.2: Install Playwright

**Files:**
- Create: `frontend-v2/playwright.config.ts`
- Modify: `frontend-v2/package.json`

- [ ] **Step 1: Install Playwright**

Run from `frontend-v2/`:
```bash
npm install -D @playwright/test
npx playwright install --with-deps chromium
```
Expected: chromium installed, `@playwright/test` in devDependencies.

- [ ] **Step 2: Create playwright config**

```ts
// frontend-v2/playwright.config.ts
import { defineConfig } from '@playwright/test';
export default defineConfig({
  testDir: './tests/e2e',
  timeout: 30_000,
  expect: { timeout: 5_000 },
  reporter: [['list'], ['html', { open: 'never' }]],
  use: {
    baseURL: 'http://localhost:5173',
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    viewport: { width: 1440, height: 900 },
  },
  webServer: {
    command: 'npm run dev',
    url: 'http://localhost:5173',
    reuseExistingServer: !process.env.CI,
    timeout: 60_000,
  },
});
```

- [ ] **Step 3: Add npm scripts**

In `frontend-v2/package.json` scripts block, add:
```json
"test:e2e": "playwright test",
"test:e2e:ui": "playwright test --ui"
```

- [ ] **Step 4: Smoke test the config**

```bash
mkdir -p frontend-v2/tests/e2e
cat > frontend-v2/tests/e2e/smoke.spec.ts <<'EOF'
import { test, expect } from '@playwright/test';
test('home loads', async ({ page }) => {
  await page.goto('/');
  await expect(page).toHaveTitle(/Pryzm|Scherzinger/i);
});
EOF
cd frontend-v2 && npx playwright test smoke.spec.ts
```
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add frontend-v2/playwright.config.ts frontend-v2/package.json frontend-v2/package-lock.json frontend-v2/tests/e2e/smoke.spec.ts
git commit -m "chore(forecast/redesign/p0): install playwright + smoke spec"
git push -u origin forecast-redesign-v2
```

### Task 0.3: Add shared types

**Files:**
- Modify: `frontend-v2/src/types/forecast.ts`

- [ ] **Step 1: Append override types**

Append to `frontend-v2/src/types/forecast.ts`:
```ts
export type OverrideSource = 'erp' | 'manual' | 'contracted' | 'other';
export type OverrideConfidence = 'low' | 'medium' | 'high';

export interface ForecastOverride {
  id: string;
  month: string;            // YYYY-MM
  cluster: string | null;
  mode: ForecastMode;
  actual: number;
  modelP50: number;
  adjustmentPct: number;
  source: OverrideSource;
  confidence: OverrideConfidence;
  reason: string;
  author: string;
  createdAt: string;
  fvaDelta: number | null;
}

export interface HeroKPI {
  forecast12mo: { value: number; unit: 'EUR' | 'pct' | 'units' };
  varianceVsPlan: { value: number; pct: number; trend: 'up' | 'down' | 'flat' };
  mape: { value: number; window: string };
  fva: { score: number; verdict: 'helping' | 'neutral' | 'hurting'; n: number };
}

export interface PVMBar {
  factor: 'price' | 'volume' | 'mix' | 'churn' | 'fx' | 'other';
  delta: number;       // in current-mode units
  pctOfTotal: number;
}
```

- [ ] **Step 2: Run typecheck**

Run: `cd frontend-v2 && npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add frontend-v2/src/types/forecast.ts
git commit -m "feat(forecast/redesign/p0): add override + KPI + PVM types"
git push
```

---

## Phase 1 — Backend Overrides Endpoint (runs in parallel with Phase 2)

### Task 1.1: Create overrides service

**Files:**
- Create: `scherzinger-platform/backend/services/forecast/overrides.py`
- Create: `scherzinger-platform/backend/data/forecast-overrides.json`

- [ ] **Step 1: Seed data file**

```bash
mkdir -p scherzinger-platform/backend/data
echo '[]' > scherzinger-platform/backend/data/forecast-overrides.json
```

- [ ] **Step 2: Write failing test**

Create `scherzinger-platform/backend/tests/services/test_overrides.py`:
```python
from pathlib import Path
import json, tempfile, os
import pytest
from backend.services.forecast import overrides

@pytest.fixture
def tmp_store(monkeypatch):
    with tempfile.TemporaryDirectory() as d:
        p = Path(d) / "overrides.json"
        p.write_text("[]")
        monkeypatch.setattr(overrides, "STORE_PATH", p)
        yield p

def test_create_and_list(tmp_store):
    created = overrides.create_override({
        "month": "2026-08", "cluster": None, "mode": "revenue",
        "actual": 650000, "modelP50": 612000,
        "source": "manual", "confidence": "medium",
        "reason": "Q3 renegotiation closed early",
        "author": "Frank",
    })
    assert created["id"]
    assert created["adjustmentPct"] == pytest.approx((650000-612000)/612000, abs=1e-6)
    all_ = overrides.list_overrides()
    assert len(all_) == 1 and all_[0]["id"] == created["id"]

def test_update(tmp_store):
    c = overrides.create_override({
        "month": "2026-08", "cluster": None, "mode": "revenue",
        "actual": 100, "modelP50": 90,
        "source": "manual", "confidence": "low",
        "reason": "test reason 12345", "author": "Frank",
    })
    u = overrides.update_override(c["id"], {"actual": 110, "reason": "revised reason 12345"})
    assert u["actual"] == 110
    assert u["reason"] == "revised reason 12345"

def test_delete(tmp_store):
    c = overrides.create_override({
        "month": "2026-08", "cluster": None, "mode": "revenue",
        "actual": 100, "modelP50": 90, "source": "manual",
        "confidence": "low", "reason": "test reason 12345",
        "author": "Frank",
    })
    overrides.delete_override(c["id"])
    assert overrides.list_overrides() == []

def test_reason_too_short_rejected(tmp_store):
    with pytest.raises(ValueError):
        overrides.create_override({
            "month": "2026-08", "cluster": None, "mode": "revenue",
            "actual": 100, "modelP50": 90, "source": "manual",
            "confidence": "low", "reason": "short",
            "author": "Frank",
        })
```

- [ ] **Step 3: Run test, see failures**

Run: `cd scherzinger-platform && .venv/bin/pytest backend/tests/services/test_overrides.py -v`
Expected: FAIL (module missing).

- [ ] **Step 4: Implement overrides.py**

Create `scherzinger-platform/backend/services/forecast/overrides.py`:
```python
"""JSON-backed forecast overrides store.

This is intentionally a flat-file backend (data/forecast-overrides.json).
A future PR will migrate this to a proper table on the analytics warehouse,
at which point only this file changes — callers see the same API.
"""
from __future__ import annotations
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Iterable
import json
import uuid

STORE_PATH = Path(__file__).resolve().parents[2] / "data" / "forecast-overrides.json"
MIN_REASON_LEN = 10


def _load() -> list[dict[str, Any]]:
    if not STORE_PATH.exists():
        return []
    return json.loads(STORE_PATH.read_text() or "[]")


def _save(rows: Iterable[dict[str, Any]]) -> None:
    STORE_PATH.parent.mkdir(parents=True, exist_ok=True)
    STORE_PATH.write_text(json.dumps(list(rows), indent=2))


def _validate_payload(payload: dict[str, Any]) -> None:
    reason = (payload.get("reason") or "").strip()
    if len(reason) < MIN_REASON_LEN:
        raise ValueError(f"reason must be at least {MIN_REASON_LEN} chars")
    if payload.get("source") not in {"erp", "manual", "contracted", "other"}:
        raise ValueError("invalid source")
    if payload.get("confidence") not in {"low", "medium", "high"}:
        raise ValueError("invalid confidence")
    if payload.get("mode") not in {"revenue", "margin", "volume"}:
        raise ValueError("invalid mode")


def list_overrides(month: str | None = None, cluster: str | None = None) -> list[dict[str, Any]]:
    rows = _load()
    if month:
        rows = [r for r in rows if r["month"] == month]
    if cluster:
        rows = [r for r in rows if r["cluster"] == cluster]
    return rows


def get_override(override_id: str) -> dict[str, Any] | None:
    return next((r for r in _load() if r["id"] == override_id), None)


def create_override(payload: dict[str, Any]) -> dict[str, Any]:
    _validate_payload(payload)
    model_p50 = float(payload["modelP50"])
    actual = float(payload["actual"])
    row = {
        "id": str(uuid.uuid4()),
        "month": payload["month"],
        "cluster": payload.get("cluster"),
        "mode": payload["mode"],
        "actual": actual,
        "modelP50": model_p50,
        "adjustmentPct": (actual - model_p50) / model_p50 if model_p50 else 0.0,
        "source": payload["source"],
        "confidence": payload["confidence"],
        "reason": payload["reason"].strip(),
        "author": payload.get("author") or "Frank",
        "createdAt": datetime.now(timezone.utc).isoformat(),
        "fvaDelta": None,
    }
    rows = _load()
    rows.append(row)
    _save(rows)
    return row


def update_override(override_id: str, patch: dict[str, Any]) -> dict[str, Any]:
    rows = _load()
    for r in rows:
        if r["id"] == override_id:
            r.update({k: v for k, v in patch.items() if k in {
                "actual", "source", "confidence", "reason"
            }})
            if "actual" in patch and r["modelP50"]:
                r["adjustmentPct"] = (float(r["actual"]) - r["modelP50"]) / r["modelP50"]
            _validate_payload({**r, **patch})
            _save(rows)
            return r
    raise KeyError(override_id)


def delete_override(override_id: str) -> None:
    rows = _load()
    rows = [r for r in rows if r["id"] != override_id]
    _save(rows)
```

- [ ] **Step 5: Run tests, verify pass**

Run: `cd scherzinger-platform && .venv/bin/pytest backend/tests/services/test_overrides.py -v`
Expected: 4 passing.

### Task 1.2: Wire FastAPI routes

**Files:**
- Modify: `scherzinger-platform/backend/api/forecast.py` (or create router file — confirm location with `grep -rn "forecasts.router" scherzinger-platform/backend`)
- Create: `scherzinger-platform/backend/api/forecast_overrides.py` (if separate router)
- Modify: `scherzinger-platform/backend/main.py`

- [ ] **Step 1: Locate existing forecast router**

Run: `grep -rn "forecasts" scherzinger-platform/backend/api/ scherzinger-platform/backend/services/ | grep -i router | head -10`

- [ ] **Step 2: Create overrides router**

Create `scherzinger-platform/backend/api/forecast_overrides.py`:
```python
from fastapi import APIRouter, HTTPException, status
from pydantic import BaseModel, Field
from typing import Literal
from backend.services.forecast import overrides as svc

router = APIRouter(prefix="/forecast/overrides", tags=["forecast-overrides"])


class OverrideIn(BaseModel):
    month: str = Field(..., pattern=r"^\d{4}-\d{2}$")
    cluster: str | None = None
    mode: Literal["revenue", "margin", "volume"]
    actual: float
    modelP50: float
    source: Literal["erp", "manual", "contracted", "other"]
    confidence: Literal["low", "medium", "high"]
    reason: str = Field(..., min_length=10)
    author: str = "Frank"


class OverridePatch(BaseModel):
    actual: float | None = None
    source: Literal["erp", "manual", "contracted", "other"] | None = None
    confidence: Literal["low", "medium", "high"] | None = None
    reason: str | None = Field(default=None, min_length=10)


@router.get("")
def list_overrides(month: str | None = None, cluster: str | None = None):
    return {"items": svc.list_overrides(month=month, cluster=cluster)}


@router.post("", status_code=status.HTTP_201_CREATED)
def create_override(body: OverrideIn):
    try:
        return svc.create_override(body.model_dump())
    except ValueError as e:
        raise HTTPException(400, str(e))


@router.patch("/{override_id}")
def update_override(override_id: str, body: OverridePatch):
    try:
        return svc.update_override(override_id, {k: v for k, v in body.model_dump().items() if v is not None})
    except KeyError:
        raise HTTPException(404, "override not found")
    except ValueError as e:
        raise HTTPException(400, str(e))


@router.delete("/{override_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_override(override_id: str):
    svc.delete_override(override_id)
    return None
```

- [ ] **Step 3: Register router in main.py**

In `scherzinger-platform/backend/main.py`, after existing `app.include_router(forecasts.router, ...)`:
```python
from backend.api import forecast_overrides
app.include_router(forecast_overrides.router, prefix="/api/v1", tags=["forecast-overrides"])
```

- [ ] **Step 4: Write API integration test**

Create `scherzinger-platform/backend/tests/api/test_forecast_overrides.py`:
```python
from fastapi.testclient import TestClient
from backend.main import app

client = TestClient(app)

def test_post_get_patch_delete_roundtrip(tmp_path, monkeypatch):
    from backend.services.forecast import overrides
    store = tmp_path / "overrides.json"
    store.write_text("[]")
    monkeypatch.setattr(overrides, "STORE_PATH", store)

    payload = {
        "month": "2026-08", "cluster": None, "mode": "revenue",
        "actual": 650000, "modelP50": 612000,
        "source": "manual", "confidence": "medium",
        "reason": "Q3 contract renegotiation closed early"
    }
    r = client.post("/api/v1/forecast/overrides", json=payload)
    assert r.status_code == 201
    oid = r.json()["id"]

    r2 = client.get("/api/v1/forecast/overrides")
    assert any(x["id"] == oid for x in r2.json()["items"])

    r3 = client.patch(f"/api/v1/forecast/overrides/{oid}", json={"actual": 660000})
    assert r3.status_code == 200
    assert r3.json()["actual"] == 660000

    r4 = client.delete(f"/api/v1/forecast/overrides/{oid}")
    assert r4.status_code == 204

def test_post_rejects_short_reason(monkeypatch, tmp_path):
    from backend.services.forecast import overrides
    store = tmp_path / "overrides.json"; store.write_text("[]")
    monkeypatch.setattr(overrides, "STORE_PATH", store)
    r = client.post("/api/v1/forecast/overrides", json={
        "month":"2026-08","cluster":None,"mode":"revenue",
        "actual":1,"modelP50":1,"source":"manual","confidence":"low",
        "reason":"short",
    })
    assert r.status_code == 422   # pydantic min_length
```

- [ ] **Step 5: Run API tests**

Run: `cd scherzinger-platform && .venv/bin/pytest backend/tests/api/test_forecast_overrides.py -v`
Expected: 2 passing.

- [ ] **Step 6: Commit**

```bash
git add scherzinger-platform/backend/services/forecast/overrides.py \
        scherzinger-platform/backend/api/forecast_overrides.py \
        scherzinger-platform/backend/main.py \
        scherzinger-platform/backend/data/forecast-overrides.json \
        scherzinger-platform/backend/tests/
git commit -m "feat(forecast/redesign/p1): overrides CRUD endpoint + JSON store"
git push
```

### Task 1.3: Frontend hook

**Files:**
- Create: `frontend-v2/src/data/api/useForecastOverrides.ts`
- Create: `frontend-v2/src/tests/use-forecast-overrides.test.ts`

- [ ] **Step 1: Write failing test**

```ts
// frontend-v2/src/tests/use-forecast-overrides.test.ts
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { useForecastOverrides, useCreateOverride } from '../data/api/useForecastOverrides';
import type { ReactNode } from 'react';

const fetchMock = vi.fn();
beforeEach(() => {
  global.fetch = fetchMock as any;
  fetchMock.mockReset();
});

function wrapper({ children }: { children: ReactNode }) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return <QueryClientProvider client={qc}>{children}</QueryClientProvider>;
}

describe('useForecastOverrides', () => {
  it('lists overrides', async () => {
    fetchMock.mockResolvedValueOnce({ ok: true, json: async () => ({ items: [{ id: 'a', month: '2026-08' }] }) });
    const { result } = renderHook(() => useForecastOverrides(), { wrapper });
    await waitFor(() => expect(result.current.data).toBeDefined());
    expect(result.current.data?.items[0].id).toBe('a');
  });

  it('creates override', async () => {
    fetchMock.mockResolvedValueOnce({ ok: true, json: async () => ({ id: 'new', month: '2026-08' }) });
    const { result } = renderHook(() => useCreateOverride(), { wrapper });
    const out = await result.current.mutateAsync({
      month: '2026-08', cluster: null, mode: 'revenue',
      actual: 650000, modelP50: 612000,
      source: 'manual', confidence: 'medium',
      reason: 'Q3 renegotiation closed early',
    });
    expect(out.id).toBe('new');
    expect(fetchMock).toHaveBeenCalledWith(
      expect.stringContaining('/api/v1/forecast/overrides'),
      expect.objectContaining({ method: 'POST' })
    );
  });
});
```

> Note for the implementer: the test file uses JSX in a `.test.ts` — rename to `.test.tsx` if vitest config requires it. Adjust extension to match existing test files; `frontend-v2/src/tests/smoke.test.tsx` uses `.tsx`.

- [ ] **Step 2: Implement hook**

```ts
// frontend-v2/src/data/api/useForecastOverrides.ts
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type {
  ForecastOverride, ForecastMode, OverrideSource, OverrideConfidence,
} from '@/types/forecast';

const BASE = '/api/v1/forecast/overrides';

export interface OverrideListParams { month?: string; cluster?: string | null }
export interface CreateOverrideBody {
  month: string;
  cluster: string | null;
  mode: ForecastMode;
  actual: number;
  modelP50: number;
  source: OverrideSource;
  confidence: OverrideConfidence;
  reason: string;
  author?: string;
}

export function useForecastOverrides(params: OverrideListParams = {}) {
  const qs = new URLSearchParams();
  if (params.month) qs.set('month', params.month);
  if (params.cluster) qs.set('cluster', params.cluster);
  const url = qs.toString() ? `${BASE}?${qs}` : BASE;
  return useQuery({
    queryKey: ['forecast-overrides', params],
    queryFn: async (): Promise<{ items: ForecastOverride[] }> => {
      const r = await fetch(url);
      if (!r.ok) throw new Error(`overrides list failed: ${r.status}`);
      return r.json();
    },
  });
}

export function useCreateOverride() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (body: CreateOverrideBody): Promise<ForecastOverride> => {
      const r = await fetch(BASE, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(body),
      });
      if (!r.ok) throw new Error(`override create failed: ${r.status}`);
      return r.json();
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['forecast-overrides'] }),
  });
}

export function useUpdateOverride() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, patch }: { id: string; patch: Partial<CreateOverrideBody> }) => {
      const r = await fetch(`${BASE}/${id}`, {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(patch),
      });
      if (!r.ok) throw new Error(`override update failed: ${r.status}`);
      return (await r.json()) as ForecastOverride;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['forecast-overrides'] }),
  });
}

export function useDeleteOverride() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const r = await fetch(`${BASE}/${id}`, { method: 'DELETE' });
      if (!r.ok) throw new Error(`override delete failed: ${r.status}`);
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['forecast-overrides'] }),
  });
}
```

- [ ] **Step 3: Run tests**

Run: `cd frontend-v2 && npm test -- use-forecast-overrides`
Expected: 2 passing.

- [ ] **Step 4: Commit**

```bash
git add frontend-v2/src/data/api/useForecastOverrides.ts frontend-v2/src/tests/use-forecast-overrides.test.tsx
git commit -m "feat(forecast/redesign/p1): TanStack Query hook for overrides CRUD"
git push
```

---

## Phase 2 — Layout v2 Flag + Shell Reorder (runs in parallel with Phase 1)

### Task 2.1: Read URL flag

**Files:** Modify `frontend-v2/src/features/forecasting/index.tsx`

- [ ] **Step 1: Add layout param read**

In `ForecastingPage` after `const showAll = ...`:
```ts
const layoutV2 = params.get('layout') === 'v2';
```

Pass through `AggregateView`:
```ts
<AggregateView data={data} article={article} mode={modeParam} showAll={showAll} layoutV2={layoutV2} />
```

Update `AggregateProps`:
```ts
interface AggregateProps {
  data: ForecastShell;
  article: string | null;
  mode: ForecastMode;
  showAll: boolean;
  layoutV2: boolean;
}
```

In `AggregateView`, branch at top:
```ts
function AggregateView({ data, article, mode, showAll, layoutV2 }: AggregateProps) {
  if (layoutV2) return <AggregateViewV2 data={data} article={article} mode={mode} showAll={showAll} />;
  return <AggregateViewV1 data={data} article={article} mode={mode} showAll={showAll} />;
}
```

Rename existing body to `AggregateViewV1` (mechanical rename: copy current return into `function AggregateViewV1(...) { return (<>...</>); }`).

### Task 2.2: Stub v2 layout skeleton

**Files:** same file.

- [ ] **Step 1: Add v2 stub**

Append to `frontend-v2/src/features/forecasting/index.tsx`:
```ts
function AggregateViewV2({ data, article, mode, showAll }: Omit<AggregateProps, 'layoutV2'>) {
  return (
    <>
      {/* slot 3: KPI strip — filled in Phase 2 task 2.3 */}
      <HeroForecast hero={data.hero} mode={mode} />
      {/* slot 5: PVMWaterfall — filled in Phase 5 */}
      {/* slot 6: TopSKUsForecastTable — filled in Phase 5 */}
      <ClusterLens clusters={data.clusters} />
      <ScenarioLibrary />
      {data.scenarioApplied && <ScenarioActiveBanner scenarioId={data.scenarioApplied.id} applied={data.scenarioApplied} />}
      {/* slot 9: Drivers accordion — filled in Phase 6 */}
      {data.tornado && <TornadoCard tornado={data.tornado} />}
      {data.distributions && <DistributionGrid distributions={data.distributions} clusters={data.clusters} />}
      {data.calibration && <CalibrationCard data={data.calibration} />}
      <WalkForward panel={data.walkForward} />
      {data.marginTrajectory && <MarginTrajectoryCard data={data.marginTrajectory} />}
      {data.costDecomposition && <CostDecompositionCard data={data.costDecomposition} />}
      {data.seasonalOverlay && <SeasonalOverlayCard data={data.seasonalOverlay} />}
      {data.commodityTrajectories && <CommodityTrajectoriesCard data={data.commodityTrajectories} />}
      <InputCostTrajectory data={data.inputCost} />
      {data.quoteToRevenue && <QuoteToRevenueBridge data={data.quoteToRevenue} />}
      {/* slot 10: Renewals/NewProduct accordion — filled in Phase 6 */}
      <div id="block-renewals" data-focus-target="renewals">
        <PriceFloor rows={data.priceFloor} footnote={data.priceFloorFootnote} highlightArticle={article} />
      </div>
      <NewProductForecast data={data.newProduct} />
      <ParetoLayer data={data.pareto} showAll={showAll} />
      {/* slot 11: OverrideLog — filled in Phase 6 */}
      {data.methodology && (
        <>
          <AssumptionsFooter assumptions={data.methodology.assumptions} dataThrough={data.methodology.assumptions.find((a) => a.label === 'Data-through')?.value} />
          <MethodologyPanel methodology={data.methodology} />
        </>
      )}
    </>
  );
}
```

- [ ] **Step 2: Verify dev server renders both layouts**

Run: `cd frontend-v2 && npm run dev`
In browser:
- `http://localhost:5173/forecasting` → v1 (Tornado first)
- `http://localhost:5173/forecasting?layout=v2` → v2 (HeroForecast first)
Expected: both render without errors.

- [ ] **Step 3: Commit**

```bash
git add frontend-v2/src/features/forecasting/index.tsx
git commit -m "feat(forecast/redesign/p2): ?layout=v2 flag + v2 shell with HeroForecast on top"
git push
```

### Task 2.3: HeroKPIStrip component

**Files:**
- Create: `frontend-v2/src/features/forecasting/components/HeroKPIStrip.tsx`
- Create: `frontend-v2/src/features/forecasting/components/HeroKPIStrip.test.tsx`

- [ ] **Step 1: Write failing test**

```tsx
import { render, screen } from '@testing-library/react';
import { describe, it, expect } from 'vitest';
import { HeroKPIStrip } from './HeroKPIStrip';

describe('HeroKPIStrip', () => {
  it('renders four tiles', () => {
    render(
      <HeroKPIStrip
        forecast12mo={6_800_000}
        varianceVsPlanPct={-2.3}
        mape={8.4}
        fva={{ score: 0.4, verdict: 'helping', n: 12 }}
        mode="revenue"
      />
    );
    expect(screen.getByText(/Forecast/i)).toBeInTheDocument();
    expect(screen.getByText(/Variance/i)).toBeInTheDocument();
    expect(screen.getByText(/MAPE/i)).toBeInTheDocument();
    expect(screen.getByText(/FVA/i)).toBeInTheDocument();
    expect(screen.getByText('6.8M €')).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Implement**

```tsx
// HeroKPIStrip.tsx
import type { ForecastMode } from '@/types/forecast';

interface Props {
  forecast12mo: number;        // value in mode's units
  varianceVsPlanPct: number;   // e.g., -2.3 means 2.3% below plan
  mape: number;                // 8.4 means 8.4%
  fva: { score: number; verdict: 'helping' | 'neutral' | 'hurting'; n: number };
  mode: ForecastMode;
}

function formatValue(v: number, mode: ForecastMode): string {
  if (mode === 'revenue') {
    if (Math.abs(v) >= 1e6) return `${(v / 1e6).toFixed(1)}M €`;
    return `${(v / 1e3).toFixed(0)}K €`;
  }
  if (mode === 'margin') return `${(v * 100).toFixed(1)}%`;
  return `${Math.round(v).toLocaleString()} u`;
}

export function HeroKPIStrip({ forecast12mo, varianceVsPlanPct, mape, fva, mode }: Props) {
  const varTone = varianceVsPlanPct >= 0 ? 'text-emerald-700' : 'text-amber-700';
  const fvaTone = fva.verdict === 'helping' ? 'text-emerald-700' : fva.verdict === 'hurting' ? 'text-rose-700' : 'text-[var(--muted)]';
  return (
    <div data-testid="hero-kpi-strip" className="mb-4 grid grid-cols-4 gap-3">
      <Tile label="Forecast (next 12mo)" value={formatValue(forecast12mo, mode)} />
      <Tile label="Variance vs plan" value={`${varianceVsPlanPct > 0 ? '+' : ''}${varianceVsPlanPct.toFixed(1)}%`} valueClass={varTone} />
      <Tile label="MAPE (trailing 6mo)" value={`${mape.toFixed(1)}%`} />
      <Tile label={`FVA — ${fva.verdict}`} value={`${fva.score >= 0 ? '+' : ''}${fva.score.toFixed(1)} (n=${fva.n})`} valueClass={fvaTone} />
    </div>
  );
}

function Tile({ label, value, valueClass = 'text-[var(--ink)]' }: { label: string; value: string; valueClass?: string }) {
  return (
    <div className="rounded-[12px] border border-[var(--hairline)] bg-white p-4 shadow-[0_1px_2px_rgba(20,20,28,0.04)]">
      <div className="text-[10.5px] font-semibold uppercase tracking-wide text-[var(--muted)]">{label}</div>
      <div className={`mt-1 font-display text-[22px] font-bold tracking-tight ${valueClass}`}>{value}</div>
    </div>
  );
}
```

- [ ] **Step 3: Wire into AggregateViewV2**

In `AggregateViewV2`, replace `{/* slot 3: KPI strip */}` comment with:
```tsx
<HeroKPIStrip
  forecast12mo={data.hero.forecast12moTotal ?? data.hero.points.slice(-12).reduce((s, p) => s + (p.p50 ?? 0), 0)}
  varianceVsPlanPct={data.hero.varianceVsPlanPct ?? 0}
  mape={data.hero.mapeTrailing6mo ?? data.walkForward?.targetMape ?? 0}
  fva={data.hero.fva ?? { score: 0, verdict: 'neutral', n: 0 }}
  mode={mode}
/>
```

Add new optional fields to `ForecastShell['hero']` in `frontend-v2/src/types/forecast.ts`:
```ts
forecast12moTotal?: number;
varianceVsPlanPct?: number;
mapeTrailing6mo?: number;
fva?: { score: number; verdict: 'helping' | 'neutral' | 'hurting'; n: number };
```

Add import at top of `index.tsx`: `import { HeroKPIStrip } from './components/HeroKPIStrip';`

- [ ] **Step 4: Run tests**

Run: `cd frontend-v2 && npm test -- HeroKPIStrip && npx tsc --noEmit`
Expected: tests pass, typecheck clean.

- [ ] **Step 5: Commit**

```bash
git add frontend-v2/src/features/forecasting/components/HeroKPIStrip.tsx \
        frontend-v2/src/features/forecasting/components/HeroKPIStrip.test.tsx \
        frontend-v2/src/features/forecasting/index.tsx \
        frontend-v2/src/types/forecast.ts
git commit -m "feat(forecast/redesign/p2): HeroKPIStrip — forecast/variance/MAPE/FVA tiles"
git push
```

---

## Phase 3 — HeroForecast Revision (two-band fan chart + click-to-edit)

### Task 3.1: Add two-band envelope

**Files:** Modify `frontend-v2/src/features/forecasting/components/HeroForecast.tsx`

- [ ] **Step 1: Read current file**

Run: `wc -l frontend-v2/src/features/forecasting/components/HeroForecast.tsx` (expect ~414 lines)

- [ ] **Step 2: Identify current band rendering**

Open the file, locate the `<Area>` for the prediction envelope. Confirm it renders one band (p5–p95 or p10–p90).

- [ ] **Step 3: Add two Areas**

Replace single envelope `<Area>` with two stacked Areas:
```tsx
<Area
  type="monotone"
  dataKey="band95"
  stroke="none"
  fill="var(--rose-deep)"
  fillOpacity={0.10}
  isAnimationActive={false}
  name="95% band"
/>
<Area
  type="monotone"
  dataKey="band80"
  stroke="none"
  fill="var(--rose-deep)"
  fillOpacity={0.22}
  isAnimationActive={false}
  name="80% band"
/>
```

In the data-shaping memo that builds the chart series, ensure each point exposes:
- `band95: [p2_5, p97_5]`
- `band80: [p10, p90]`
- (existing) `p50`, `actual`

If the BFF only supplies p5/p95 today, add a small adapter: `band95 = [p5, p95]`, `band80 = [interpolate(p5,p50,0.4), interpolate(p50,p95,0.6)]` (placeholder until BFF returns p10/p90 explicitly — track in TODO comment).

### Task 3.2: Cap history at 6mo + history/forecast separator

- [ ] **Step 1: Slice points**

In `HeroForecast`, after `const points = useMemo(...)` (or equivalent), add:
```tsx
const trimmedPoints = useMemo(() => {
  const cutoffIdx = points.findIndex((p) => p.isHistory === false || p.actual == null);
  if (cutoffIdx <= 6) return points;
  const start = Math.max(0, cutoffIdx - 6);
  return points.slice(start);
}, [points]);
```

Use `trimmedPoints` in the `<ComposedChart data={...}>`.

- [ ] **Step 2: Add "Show full history" toggle**

Above the chart, add:
```tsx
<button
  type="button"
  onClick={() => setShowFullHistory(v => !v)}
  className="text-[11px] font-semibold uppercase tracking-wide text-[var(--muted)] hover:text-[var(--ink-2)]"
>
  {showFullHistory ? 'Trim history' : 'Show full history'}
</button>
```

Wire `showFullHistory` so `useMemo` returns `points` when true.

- [ ] **Step 3: Render history/forecast vertical separator**

Add `<ReferenceLine x={firstForecastMonth} stroke="var(--hairline)" strokeDasharray="3 3" label={{ value: 'Now', position: 'top', fill: 'var(--muted)', fontSize: 10 }} />`.

### Task 3.3: Click-to-open hook (no panel yet)

- [ ] **Step 1: Add `onPointClick` prop**

```tsx
interface HeroForecastProps {
  hero: ForecastShell['hero'];
  mode: ForecastMode;
  onPointClick?: (month: string) => void;
}
```

- [ ] **Step 2: Wire click handler**

On the `<Line dataKey="p50" />`, add:
```tsx
activeDot={{ r: 5, cursor: 'pointer', onClick: (_: unknown, payload: any) => onPointClick?.(payload?.payload?.month) }}
```

Also add `onClick` to the chart-level for non-dot clicks (snap to nearest month).

- [ ] **Step 3: Tooltip "Click to enter actual" hint**

In the custom tooltip body, append:
```tsx
{onPointClickAvailable && <div className="mt-1 text-[10px] text-[var(--muted)]">Click to enter actual →</div>}
```

(Pass `onPointClickAvailable={!!onPointClick}` through tooltip props.)

### Task 3.4: Override markers (diamond glyph)

- [ ] **Step 1: Fetch overrides**

In `HeroForecast`, add:
```tsx
import { useForecastOverrides } from '@/data/api/useForecastOverrides';
const { data: overridesData } = useForecastOverrides({});
const overrideMonths = new Set((overridesData?.items ?? []).filter(o => o.mode === mode).map(o => o.month));
```

- [ ] **Step 2: Render diamond layer**

Add a `<Scatter>` element with the overrides points, custom shape:
```tsx
const DiamondShape = (props: any) => {
  const { cx, cy } = props;
  if (cx == null || cy == null) return null;
  return (
    <polygon
      points={`${cx},${cy-6} ${cx+6},${cy} ${cx},${cy+6} ${cx-6},${cy}`}
      fill="var(--rose-deep)"
      stroke="white"
      strokeWidth={1.5}
    />
  );
};

<Scatter
  data={trimmedPoints.filter(p => overrideMonths.has(p.month)).map(p => ({ ...p, overrideY: p.actualOverride ?? p.actual ?? p.p50 }))}
  dataKey="overrideY"
  shape={DiamondShape}
  isAnimationActive={false}
/>
```

### Task 3.5: Tests + commit

- [ ] **Step 1: Add component test**

Create `frontend-v2/src/features/forecasting/components/HeroForecast.test.tsx`:
```tsx
import { render, screen } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { HeroForecast } from './HeroForecast';

vi.mock('@/data/api/useForecastOverrides', () => ({
  useForecastOverrides: () => ({ data: { items: [] } }),
}));

const qc = new QueryClient();
const w = (ui: React.ReactElement) => render(<QueryClientProvider client={qc}>{ui}</QueryClientProvider>);

describe('HeroForecast v2', () => {
  it('renders chart with two bands', () => {
    const hero = {
      points: Array.from({ length: 18 }, (_, i) => ({
        month: `2025-${String((i % 12) + 1).padStart(2, '0')}`,
        p50: 500_000 + i * 5000,
        p10: 480_000 + i * 5000, p90: 520_000 + i * 5000,
        p5: 470_000 + i * 5000, p95: 530_000 + i * 5000,
        actual: i < 12 ? 500_000 : null,
        isHistory: i < 12,
      })),
    } as any;
    w(<HeroForecast hero={hero} mode="revenue" />);
    expect(screen.getByText(/Show full history|Trim history/)).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run tests + typecheck**

Run: `cd frontend-v2 && npm test -- HeroForecast && npx tsc --noEmit`

- [ ] **Step 3: Commit**

```bash
git add frontend-v2/src/features/forecasting/components/HeroForecast.tsx \
        frontend-v2/src/features/forecasting/components/HeroForecast.test.tsx
git commit -m "feat(forecast/redesign/p3): two-band fan chart + history toggle + override glyphs + click hook"
git push
```

---

## Phase 4 — ActualEntryPanel + FVA Guardrail

### Task 4.1: FVA hook

**Files:**
- Create: `frontend-v2/src/features/forecasting/hooks/useFVAGuardrail.ts`
- Create: `frontend-v2/src/features/forecasting/hooks/useFVAGuardrail.test.ts`

- [ ] **Step 1: Test**

```ts
import { describe, it, expect } from 'vitest';
import { computeAdjustmentPct, fvaWarning } from './useFVAGuardrail';

describe('FVA guardrail', () => {
  it('computes adjustment %', () => {
    expect(computeAdjustmentPct(110, 100)).toBeCloseTo(0.1);
    expect(computeAdjustmentPct(95, 100)).toBeCloseTo(-0.05);
  });
  it('warns under threshold', () => {
    expect(fvaWarning(0.02)).not.toBeNull();
    expect(fvaWarning(0.10)).toBeNull();
    expect(fvaWarning(-0.03)).not.toBeNull();
  });
});
```

- [ ] **Step 2: Implement**

```ts
// useFVAGuardrail.ts
export const FVA_THRESHOLD = 0.05; // 5% per Fildes/De Baets 2024

export function computeAdjustmentPct(actual: number, modelP50: number): number {
  if (!modelP50) return 0;
  return (actual - modelP50) / modelP50;
}

export function fvaWarning(adjustmentPct: number): string | null {
  if (Math.abs(adjustmentPct) < FVA_THRESHOLD) {
    return 'Small overrides (<5%) typically harm accuracy (Fildes & Goodwin, 2007). Continue only if you have specific information the model lacks.';
  }
  return null;
}
```

- [ ] **Step 3: Run + commit**

```bash
cd frontend-v2 && npm test -- useFVAGuardrail
git add frontend-v2/src/features/forecasting/hooks/useFVAGuardrail.{ts,test.ts}
git commit -m "feat(forecast/redesign/p4): FVA guardrail hook"
```

### Task 4.2: ActualEntryPanel component

**Files:**
- Create: `frontend-v2/src/features/forecasting/components/ActualEntryPanel.tsx`
- Create: `frontend-v2/src/features/forecasting/components/ActualEntryPanel.test.tsx`

- [ ] **Step 1: Test**

```tsx
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ActualEntryPanel } from './ActualEntryPanel';

const fetchMock = vi.fn();
beforeEach(() => { global.fetch = fetchMock as any; fetchMock.mockReset(); });

function wrap(ui: React.ReactElement) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(<QueryClientProvider client={qc}>{ui}</QueryClientProvider>);
}

describe('ActualEntryPanel', () => {
  it('blocks save when reason too short', async () => {
    wrap(<ActualEntryPanel month="2026-08" mode="revenue" cluster={null} modelP50={612000} band80={[587000,638000]} band95={[561000,672000]} onClose={() => {}} />);
    fireEvent.change(screen.getByLabelText(/Actual/i), { target: { value: '650000' } });
    fireEvent.change(screen.getByLabelText(/Reason/i), { target: { value: 'short' } });
    expect(screen.getByText(/Save actual/i).closest('button')).toBeDisabled();
  });

  it('shows FVA warning for <5% adjustment', () => {
    wrap(<ActualEntryPanel month="2026-08" mode="revenue" cluster={null} modelP50={100} band80={[95,105]} band95={[90,110]} onClose={() => {}} />);
    fireEvent.change(screen.getByLabelText(/Actual/i), { target: { value: '102' } });
    expect(screen.getByText(/Small overrides/i)).toBeInTheDocument();
  });

  it('POSTs override and closes', async () => {
    fetchMock.mockResolvedValueOnce({ ok: true, json: async () => ({ id: 'x', month: '2026-08' }) });
    const onClose = vi.fn();
    wrap(<ActualEntryPanel month="2026-08" mode="revenue" cluster={null} modelP50={612000} band80={[587000,638000]} band95={[561000,672000]} onClose={onClose} />);
    fireEvent.change(screen.getByLabelText(/Actual/i), { target: { value: '650000' } });
    fireEvent.change(screen.getByLabelText(/Reason/i), { target: { value: 'Q3 contract renegotiation' } });
    fireEvent.click(screen.getByRole('button', { name: /Save actual/i }));
    await waitFor(() => expect(fetchMock).toHaveBeenCalled());
    await waitFor(() => expect(onClose).toHaveBeenCalled());
  });
});
```

- [ ] **Step 2: Implement panel**

```tsx
// ActualEntryPanel.tsx
import { useState, useEffect, useRef } from 'react';
import { X } from 'lucide-react';
import { useCreateOverride } from '@/data/api/useForecastOverrides';
import { computeAdjustmentPct, fvaWarning } from '../hooks/useFVAGuardrail';
import type { ForecastMode, OverrideSource, OverrideConfidence } from '@/types/forecast';

interface Props {
  month: string;
  cluster: string | null;
  mode: ForecastMode;
  modelP50: number;
  band80: [number, number];
  band95: [number, number];
  onClose: () => void;
  onSaved?: () => void;
}

const MIN_REASON = 10;

export function ActualEntryPanel({ month, cluster, mode, modelP50, band80, band95, onClose, onSaved }: Props) {
  const [actual, setActual] = useState<string>('');
  const [source, setSource] = useState<OverrideSource>('manual');
  const [confidence, setConfidence] = useState<OverrideConfidence>('medium');
  const [reason, setReason] = useState('');
  const createMut = useCreateOverride();
  const firstFieldRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => { firstFieldRef.current?.focus(); }, []);
  useEffect(() => {
    const k = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', k);
    return () => document.removeEventListener('keydown', k);
  }, [onClose]);

  const parsed = Number(actual);
  const valid = !Number.isNaN(parsed) && actual.trim() !== '' && reason.trim().length >= MIN_REASON;
  const adjPct = valid ? computeAdjustmentPct(parsed, modelP50) : 0;
  const warning = valid ? fvaWarning(adjPct) : null;

  const onSubmit = async (retrainNow = false) => {
    if (!valid) return;
    await createMut.mutateAsync({
      month, cluster, mode,
      actual: parsed,
      modelP50,
      source, confidence,
      reason: reason.trim(),
    });
    onSaved?.();
    if (retrainNow) {
      // emit retrain hint via window event; backend integration in follow-up
      window.dispatchEvent(new CustomEvent('forecast:retrain-requested', { detail: { month, mode } }));
    }
    setTimeout(onClose, 400);
  };

  return (
    <div
      role="dialog"
      aria-label="Enter actual revenue"
      data-testid="actual-entry-panel"
      className="fixed right-0 top-0 z-50 h-screen w-[420px] overflow-y-auto border-l border-[var(--hairline)] bg-white shadow-2xl"
    >
      <header className="sticky top-0 flex items-center justify-between border-b border-[var(--hairline)] bg-white p-4">
        <div>
          <div className="text-[10.5px] font-semibold uppercase tracking-wide text-[var(--muted)]">Month</div>
          <div className="font-display text-[16px] font-bold tracking-tight">{month} {cluster ? `· ${cluster}` : ''}</div>
        </div>
        <button type="button" aria-label="Close panel" onClick={onClose} className="grid h-8 w-8 place-items-center rounded-md text-[var(--muted)] hover:bg-[var(--surface-sunken)]"><X size={16} /></button>
      </header>

      <section className="space-y-3 p-4 text-[13px]">
        <div className="rounded-[10px] border border-[var(--hairline)] bg-[var(--surface-soft)] p-3">
          <div className="text-[10.5px] font-semibold uppercase tracking-wide text-[var(--muted)]">Model forecast</div>
          <div className="mt-1 font-display text-[18px] font-bold tracking-tight">€{modelP50.toLocaleString()}</div>
          <div className="text-[11.5px] text-[var(--muted)]">80%: €{band80[0].toLocaleString()} – €{band80[1].toLocaleString()}</div>
          <div className="text-[11.5px] text-[var(--muted)]">95%: €{band95[0].toLocaleString()} – €{band95[1].toLocaleString()}</div>
        </div>

        <label className="block">
          <span className="block text-[11.5px] font-semibold text-[var(--ink-2)]">Actual (€)</span>
          <input
            ref={firstFieldRef}
            type="number"
            value={actual}
            onChange={(e) => setActual(e.target.value)}
            className="mt-1 block w-full rounded-md border border-[var(--hairline)] px-3 py-2 text-[14px]"
            data-testid="actual-input"
          />
        </label>

        <label className="block">
          <span className="block text-[11.5px] font-semibold text-[var(--ink-2)]">Source</span>
          <select value={source} onChange={(e) => setSource(e.target.value as OverrideSource)} className="mt-1 block w-full rounded-md border border-[var(--hairline)] px-3 py-2 text-[13px]">
            <option value="manual">Manual reconciliation</option>
            <option value="erp">ERP feed</option>
            <option value="contracted">Contracted</option>
            <option value="other">Other</option>
          </select>
        </label>

        <div>
          <span className="block text-[11.5px] font-semibold text-[var(--ink-2)]">Confidence</span>
          <div role="radiogroup" className="mt-1 inline-flex rounded-full bg-[var(--surface-soft)] p-0.5 text-[12px]">
            {(['low', 'medium', 'high'] as OverrideConfidence[]).map(c => (
              <button
                key={c}
                type="button"
                role="radio"
                aria-checked={confidence === c}
                onClick={() => setConfidence(c)}
                className={confidence === c ? 'rounded-full bg-white px-3 py-1 font-semibold text-[var(--ink)]' : 'px-3 py-1 text-[var(--muted)]'}
              >{c}</button>
            ))}
          </div>
        </div>

        <label className="block">
          <span className="block text-[11.5px] font-semibold text-[var(--ink-2)]">Reason (required, min {MIN_REASON} chars)</span>
          <textarea value={reason} onChange={(e) => setReason(e.target.value)} rows={3} className="mt-1 block w-full rounded-md border border-[var(--hairline)] px-3 py-2 text-[13px]" data-testid="reason-input" />
          <span className="text-[10.5px] text-[var(--muted)]">{reason.trim().length}/{MIN_REASON}</span>
        </label>

        {warning && (
          <div data-testid="fva-warning" className="rounded-md border border-amber-200 bg-amber-50 p-3 text-[12px] text-amber-900">{warning}</div>
        )}

        {valid && (
          <div className="rounded-md border border-[var(--hairline)] bg-[var(--surface-soft)] p-3 text-[12px] text-[var(--ink-2)]">
            Adjustment: <span className="font-semibold">{(adjPct * 100).toFixed(1)}%</span> vs model P50
          </div>
        )}

        <div className="flex gap-2 pt-2">
          <button type="button" disabled={!valid || createMut.isPending} onClick={() => onSubmit(false)} className="rounded-md bg-[var(--rose-deep)] px-4 py-2 text-[13px] font-semibold text-white disabled:opacity-40">{createMut.isPending ? 'Saving…' : 'Save actual'}</button>
          <button type="button" disabled={!valid || createMut.isPending} onClick={() => onSubmit(true)} className="rounded-md border border-[var(--hairline)] px-4 py-2 text-[13px] font-semibold text-[var(--ink-2)] disabled:opacity-40">Save & retrain now</button>
          <button type="button" onClick={onClose} className="ml-auto text-[12px] text-[var(--muted)] hover:text-[var(--ink-2)]">Cancel</button>
        </div>
      </section>
    </div>
  );
}
```

- [ ] **Step 3: Run tests + commit**

```bash
cd frontend-v2 && npm test -- ActualEntryPanel
git add frontend-v2/src/features/forecasting/components/ActualEntryPanel.{tsx,test.tsx}
git commit -m "feat(forecast/redesign/p4): ActualEntryPanel with FVA guardrail + override submit"
```

### Task 4.3: Wire panel into HeroForecast

**Files:** Modify `frontend-v2/src/features/forecasting/components/HeroForecast.tsx`

- [ ] **Step 1: State + open/close**

In `HeroForecast`:
```tsx
const [editingMonth, setEditingMonth] = useState<string | null>(null);
```

Pass `onPointClick={(m) => setEditingMonth(m)}` to chart (already wired in Phase 3.3).

- [ ] **Step 2: Render panel**

At the bottom of `HeroForecast`'s return, after the chart card:
```tsx
{editingMonth && (() => {
  const pt = points.find(p => p.month === editingMonth);
  if (!pt) return null;
  return (
    <ActualEntryPanel
      month={editingMonth}
      cluster={null}
      mode={mode}
      modelP50={pt.p50 ?? 0}
      band80={[pt.p10 ?? pt.p5 ?? 0, pt.p90 ?? pt.p95 ?? 0]}
      band95={[pt.p5 ?? 0, pt.p95 ?? 0]}
      onClose={() => setEditingMonth(null)}
    />
  );
})()}
```

Import: `import { ActualEntryPanel } from './ActualEntryPanel';`

- [ ] **Step 3: Manual dev check**

Run dev server, open `/forecasting?layout=v2`, click a forecast point → panel opens.

- [ ] **Step 4: Commit + push (end of phase)**

```bash
git add frontend-v2/src/features/forecasting/components/HeroForecast.tsx
git commit -m "feat(forecast/redesign/p4): wire ActualEntryPanel into HeroForecast clicks"
git push
```

---

## Phase 5 — PVMWaterfall + TopSKUsForecastTable (can run in parallel with P3/P4)

### Task 5.1: PVMWaterfall

**Files:**
- Create: `frontend-v2/src/features/forecasting/components/PVMWaterfall.tsx`
- Create: `frontend-v2/src/features/forecasting/components/PVMWaterfall.test.tsx`

- [ ] **Step 1: Test (arithmetic correctness)**

```tsx
import { describe, it, expect } from 'vitest';
import { computeWaterfall } from './PVMWaterfall';

describe('PVMWaterfall arithmetic', () => {
  it('bars sum to total delta', () => {
    const bars = [
      { factor: 'price' as const, delta: 120 },
      { factor: 'volume' as const, delta: -40 },
      { factor: 'mix' as const, delta: 15 },
      { factor: 'churn' as const, delta: -25 },
      { factor: 'fx' as const, delta: 10 },
    ];
    const out = computeWaterfall(bars);
    const sum = out.reduce((s, b) => s + b.delta, 0);
    expect(sum).toBe(80);
    expect(out[0].cumulative).toBe(120);
    expect(out[1].cumulative).toBe(80);
  });
});
```

- [ ] **Step 2: Implement**

```tsx
// PVMWaterfall.tsx
import { BarChart, Bar, XAxis, YAxis, Tooltip, Cell, ResponsiveContainer, ReferenceLine } from 'recharts';
import type { PVMBar } from '@/types/forecast';

export function computeWaterfall(bars: Pick<PVMBar, 'factor' | 'delta'>[]) {
  let running = 0;
  return bars.map(b => {
    const start = running;
    running += b.delta;
    return { ...b, start, cumulative: running };
  });
}

const COLORS: Record<PVMBar['factor'], string> = {
  price: '#0F9D58',
  volume: '#4285F4',
  mix: '#A78BFA',
  churn: '#E11D48',
  fx: '#F59E0B',
  other: '#94A3B8',
};

interface Props {
  bars: PVMBar[];
  periodLabel: string; // e.g. "Δ vs prior quarter"
  totalLabel?: string;
}

export function PVMWaterfall({ bars, periodLabel, totalLabel = 'Net change' }: Props) {
  const data = computeWaterfall(bars).map(d => ({
    factor: d.factor,
    range: [d.start, d.cumulative],
    delta: d.delta,
  }));
  return (
    <section data-testid="pvm-waterfall" className="mb-4 rounded-[12px] border border-[var(--hairline)] bg-white p-4">
      <header className="mb-3 flex items-baseline justify-between">
        <div>
          <div className="text-[10.5px] font-semibold uppercase tracking-wide text-[var(--muted)]">{periodLabel}</div>
          <div className="font-display text-[16px] font-bold tracking-tight">Price · Volume · Mix · Churn · FX</div>
        </div>
        <div className="text-[12px] text-[var(--muted)]">{totalLabel}: <span className="font-semibold text-[var(--ink)]">{data.reduce((s, d) => s + d.delta, 0).toLocaleString()}</span></div>
      </header>
      <div className="h-[220px]">
        <ResponsiveContainer>
          <BarChart data={data} margin={{ top: 12, right: 12, left: 0, bottom: 0 }}>
            <XAxis dataKey="factor" tick={{ fontSize: 11, fill: 'var(--muted)' }} axisLine={false} tickLine={false} />
            <YAxis tick={{ fontSize: 11, fill: 'var(--muted)' }} axisLine={false} tickLine={false} />
            <Tooltip cursor={{ fill: 'var(--surface-soft)' }} formatter={(v: any, _n, p: any) => [p?.payload?.delta?.toLocaleString(), p?.payload?.factor]} />
            <ReferenceLine y={0} stroke="var(--hairline)" />
            <Bar dataKey="range" radius={[6, 6, 0, 0]}>
              {data.map((d, i) => <Cell key={i} fill={COLORS[d.factor]} />)}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>
    </section>
  );
}
```

- [ ] **Step 3: Add PVM data to BFF mock**

In `frontend-v2/src/data/mocks/forecast.json`, append top-level key:
```json
"pvm": {
  "periodLabel": "Δ vs prior quarter",
  "bars": [
    { "factor": "price", "delta": 120000, "pctOfTotal": 0.55 },
    { "factor": "volume", "delta": -42000, "pctOfTotal": -0.19 },
    { "factor": "mix", "delta": 18000, "pctOfTotal": 0.08 },
    { "factor": "churn", "delta": -27000, "pctOfTotal": -0.12 },
    { "factor": "fx", "delta": 9000, "pctOfTotal": 0.04 }
  ]
}
```

Extend `ForecastShell` in `types/forecast.ts`:
```ts
pvm?: { periodLabel: string; bars: PVMBar[] };
```

In `AggregateViewV2`, replace `{/* slot 5: PVMWaterfall */}` with:
```tsx
{data.pvm && <PVMWaterfall bars={data.pvm.bars} periodLabel={data.pvm.periodLabel} />}
```

Add import: `import { PVMWaterfall } from './components/PVMWaterfall';`

- [ ] **Step 4: Test + commit**

```bash
cd frontend-v2 && npm test -- PVMWaterfall && npx tsc --noEmit
git add frontend-v2/src/features/forecasting/components/PVMWaterfall.{tsx,test.tsx} \
        frontend-v2/src/features/forecasting/index.tsx \
        frontend-v2/src/data/mocks/forecast.json \
        frontend-v2/src/types/forecast.ts
git commit -m "feat(forecast/redesign/p5): PVMWaterfall — price/volume/mix/churn/fx delta"
```

### Task 5.2: TopSKUsForecastTable

**Files:**
- Create: `frontend-v2/src/features/forecasting/components/TopSKUsForecastTable.tsx`
- Create: `frontend-v2/src/features/forecasting/components/TopSKUsForecastTable.test.tsx`

- [ ] **Step 1: Test**

```tsx
import { render, screen } from '@testing-library/react';
import { describe, it, expect } from 'vitest';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { TopSKUsForecastTable } from './TopSKUsForecastTable';

const rows = [
  { sku: 'BKAES-01', cluster: 'BKAES', ltm: 480_000, forecast: 510_000, varianceAbs: 30_000, variancePct: 6.25, reason: 'Seasonal +', lastOverride: null },
  { sku: 'MBDIV-22', cluster: 'MBDIV', ltm: 220_000, forecast: 198_000, varianceAbs: -22_000, variancePct: -10.0, reason: 'Steel pass-through dip', lastOverride: { author: 'Frank', when: '2026-04-12' } },
];

describe('TopSKUsForecastTable', () => {
  it('renders rows', () => {
    const qc = new QueryClient();
    render(<QueryClientProvider client={qc}><TopSKUsForecastTable rows={rows} /></QueryClientProvider>);
    expect(screen.getByText('BKAES-01')).toBeInTheDocument();
    expect(screen.getByText('MBDIV-22')).toBeInTheDocument();
    expect(screen.getByText(/Frank/)).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Implement**

```tsx
// TopSKUsForecastTable.tsx
import { useState, useMemo } from 'react';
import { ArrowUpRight, ArrowDownRight } from 'lucide-react';

export interface SKUForecastRow {
  sku: string;
  cluster: string;
  ltm: number;
  forecast: number;
  varianceAbs: number;
  variancePct: number;
  reason: string;
  lastOverride: { author: string; when: string } | null;
}

type SortKey = 'forecast' | 'variancePct' | 'ltm';

interface Props {
  rows: SKUForecastRow[];
  onOpenSku?: (sku: string) => void;
  pageSize?: number;
}

export function TopSKUsForecastTable({ rows, onOpenSku, pageSize = 10 }: Props) {
  const [sort, setSort] = useState<{ key: SortKey; dir: 'asc' | 'desc' }>({ key: 'forecast', dir: 'desc' });
  const [filter, setFilter] = useState('');

  const sorted = useMemo(() => {
    const filtered = rows.filter(r => !filter || r.sku.toLowerCase().includes(filter.toLowerCase()) || r.cluster.toLowerCase().includes(filter.toLowerCase()));
    return [...filtered].sort((a, b) => {
      const va = a[sort.key] as number; const vb = b[sort.key] as number;
      return sort.dir === 'asc' ? va - vb : vb - va;
    });
  }, [rows, sort, filter]);

  const visible = sorted.slice(0, pageSize);

  const setSortKey = (key: SortKey) => {
    setSort(prev => prev.key === key ? { key, dir: prev.dir === 'asc' ? 'desc' : 'asc' } : { key, dir: 'desc' });
  };

  return (
    <section data-testid="top-skus-forecast" className="mb-4 rounded-[12px] border border-[var(--hairline)] bg-white p-4">
      <header className="mb-3 flex items-center justify-between">
        <div>
          <div className="text-[10.5px] font-semibold uppercase tracking-wide text-[var(--muted)]">Top SKUs — next 12 months</div>
          <div className="font-display text-[16px] font-bold tracking-tight">Forecast revenue & variance</div>
        </div>
        <input value={filter} onChange={(e) => setFilter(e.target.value)} placeholder="Filter SKU or cluster…" className="rounded-md border border-[var(--hairline)] bg-white px-3 py-1.5 text-[12px]" />
      </header>
      <table className="w-full table-fixed text-left text-[12.5px]">
        <thead className="text-[10.5px] uppercase tracking-wide text-[var(--muted)]">
          <tr className="border-b border-[var(--hairline)]">
            <th className="w-[14%] py-2">SKU</th>
            <th className="w-[10%]">Cluster</th>
            <th className="w-[12%] cursor-pointer" onClick={() => setSortKey('ltm')}>LTM</th>
            <th className="w-[12%] cursor-pointer" onClick={() => setSortKey('forecast')}>Forecast</th>
            <th className="w-[10%] cursor-pointer" onClick={() => setSortKey('variancePct')}>Δ%</th>
            <th className="w-[20%]">Reason</th>
            <th className="w-[14%]">Last override</th>
            <th className="w-[8%]">Action</th>
          </tr>
        </thead>
        <tbody>
          {visible.map(r => (
            <tr key={r.sku} className="border-b border-[var(--hairline)] hover:bg-[var(--surface-soft)]">
              <td className="py-2 font-semibold">{r.sku}</td>
              <td>{r.cluster}</td>
              <td>€{Math.round(r.ltm).toLocaleString()}</td>
              <td>€{Math.round(r.forecast).toLocaleString()}</td>
              <td className={r.variancePct >= 0 ? 'text-emerald-700' : 'text-rose-700'}>
                <span className="inline-flex items-center gap-0.5">
                  {r.variancePct >= 0 ? <ArrowUpRight size={12} /> : <ArrowDownRight size={12} />}
                  {Math.abs(r.variancePct).toFixed(1)}%
                </span>
              </td>
              <td className="truncate text-[var(--ink-2)]">{r.reason}</td>
              <td>{r.lastOverride ? <span className="text-[var(--muted)]">{r.lastOverride.author} · {r.lastOverride.when}</span> : <span className="text-[var(--muted)]">—</span>}</td>
              <td>
                <button type="button" onClick={() => onOpenSku?.(r.sku)} className="rounded-md border border-[var(--hairline)] px-2 py-0.5 text-[11px] font-semibold text-[var(--ink-2)] hover:bg-[var(--surface-soft)]">Open</button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </section>
  );
}
```

- [ ] **Step 3: Adapter from existing ParetoLayer data**

In `AggregateViewV2`, replace `{/* slot 6: TopSKUsForecastTable */}` comment with:
```tsx
{data.pareto?.skus && (
  <TopSKUsForecastTable
    rows={data.pareto.skus.slice(0, 25).map(s => ({
      sku: s.sku ?? s.code ?? '—',
      cluster: s.cluster ?? '—',
      ltm: s.ltmRevenue ?? s.ltm ?? 0,
      forecast: s.forecast12mo ?? s.forecast ?? 0,
      varianceAbs: (s.forecast12mo ?? 0) - (s.ltmRevenue ?? 0),
      variancePct: s.yoyPct ?? (((s.forecast12mo ?? 0) - (s.ltmRevenue ?? 0)) / Math.max(1, s.ltmRevenue ?? 1)) * 100,
      reason: s.driverNote ?? s.reason ?? '—',
      lastOverride: s.lastOverride ?? null,
    }))}
  />
)}
```

If `data.pareto.skus` shape differs, inspect with `grep -n "pareto" frontend-v2/src/types/forecast.ts` and adjust field map.

Add import: `import { TopSKUsForecastTable } from './components/TopSKUsForecastTable';`

- [ ] **Step 4: Run tests + typecheck**

```bash
cd frontend-v2 && npm test -- TopSKUsForecastTable && npx tsc --noEmit
```

- [ ] **Step 5: Commit + push (end of phase)**

```bash
git add frontend-v2/src/features/forecasting/components/TopSKUsForecastTable.{tsx,test.tsx} frontend-v2/src/features/forecasting/index.tsx
git commit -m "feat(forecast/redesign/p5): TopSKUsForecastTable adapter over ParetoLayer rows"
git push
```

---

## Phase 6 — OverrideLog + Drivers/Renewals Accordions

### Task 6.1: Reusable Accordion primitive

**Files:**
- Create: `frontend-v2/src/components/Accordion.tsx`

- [ ] **Step 1: Implement**

```tsx
import { useState, type ReactNode } from 'react';
import { ChevronDown } from 'lucide-react';

interface Props {
  title: string;
  badge?: string;
  defaultOpen?: boolean;
  id?: string;
  children: ReactNode;
}

export function Accordion({ title, badge, defaultOpen = false, id, children }: Props) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <section id={id} className="mb-4 rounded-[12px] border border-[var(--hairline)] bg-white">
      <button
        type="button"
        aria-expanded={open}
        onClick={() => setOpen(v => !v)}
        className="flex w-full items-center justify-between px-4 py-3 text-left"
      >
        <span className="flex items-center gap-2">
          <span className="font-display text-[14px] font-bold tracking-tight">{title}</span>
          {badge && <span className="rounded-full bg-[var(--surface-soft)] px-2 py-0.5 text-[10.5px] font-semibold uppercase text-[var(--muted)]">{badge}</span>}
        </span>
        <ChevronDown size={16} className={open ? 'rotate-180 text-[var(--ink-2)]' : 'text-[var(--muted)]'} />
      </button>
      {open && <div className="border-t border-[var(--hairline)] p-4 pt-3">{children}</div>}
    </section>
  );
}
```

### Task 6.2: Wrap Drivers + Renewals in AggregateViewV2

**Files:** Modify `frontend-v2/src/features/forecasting/index.tsx`

- [ ] **Step 1: Group existing component invocations**

In `AggregateViewV2`, replace the loose group of TornadoCard / DistributionGrid / CalibrationCard / WalkForward / MarginTrajectoryCard / CostDecompositionCard / SeasonalOverlayCard / CommodityTrajectoriesCard / InputCostTrajectory / QuoteToRevenueBridge with:
```tsx
<Accordion title="Drivers & accuracy" badge={`${[
  data.tornado, data.distributions, data.calibration, data.walkForward,
  data.marginTrajectory, data.costDecomposition, data.seasonalOverlay,
  data.commodityTrajectories, data.inputCost, data.quoteToRevenue
].filter(Boolean).length} insights`}>
  {data.tornado && <TornadoCard tornado={data.tornado} />}
  {data.distributions && <DistributionGrid distributions={data.distributions} clusters={data.clusters} />}
  {data.calibration && <CalibrationCard data={data.calibration} />}
  <WalkForward panel={data.walkForward} />
  {data.marginTrajectory && <MarginTrajectoryCard data={data.marginTrajectory} />}
  {data.costDecomposition && <CostDecompositionCard data={data.costDecomposition} />}
  {data.seasonalOverlay && <SeasonalOverlayCard data={data.seasonalOverlay} />}
  {data.commodityTrajectories && <CommodityTrajectoriesCard data={data.commodityTrajectories} />}
  <InputCostTrajectory data={data.inputCost} />
  {data.quoteToRevenue && <QuoteToRevenueBridge data={data.quoteToRevenue} />}
</Accordion>
```

And the Renewals/NewProduct group:
```tsx
<Accordion title="Renewals & new product" id="block-renewals">
  <PriceFloor rows={data.priceFloor} footnote={data.priceFloorFootnote} highlightArticle={article} />
  <NewProductForecast data={data.newProduct} />
</Accordion>
```

Add import: `import { Accordion } from '@/components/Accordion';`

### Task 6.3: OverrideLog

**Files:**
- Create: `frontend-v2/src/features/forecasting/components/OverrideLog.tsx`

- [ ] **Step 1: Implement**

```tsx
import { useForecastOverrides, useDeleteOverride } from '@/data/api/useForecastOverrides';
import { Accordion } from '@/components/Accordion';

export function OverrideLog() {
  const { data } = useForecastOverrides({});
  const del = useDeleteOverride();
  const items = data?.items ?? [];
  return (
    <Accordion title="Override log" badge={`${items.length} override${items.length === 1 ? '' : 's'}`} defaultOpen={false}>
      {items.length === 0 ? (
        <div className="text-[12px] text-[var(--muted)]">No overrides yet. Click any month on the forecast above to enter an actual.</div>
      ) : (
        <table className="w-full text-left text-[12.5px]">
          <thead className="text-[10.5px] uppercase tracking-wide text-[var(--muted)]">
            <tr className="border-b border-[var(--hairline)]">
              <th className="py-2">Month</th><th>Mode</th><th>Actual</th><th>Adj %</th><th>Source</th><th>Reason</th><th>Author</th><th>FVA Δ</th><th></th>
            </tr>
          </thead>
          <tbody>
            {items.map(o => (
              <tr key={o.id} className="border-b border-[var(--hairline)]">
                <td className="py-2 font-semibold">{o.month}</td>
                <td>{o.mode}</td>
                <td>€{Math.round(o.actual).toLocaleString()}</td>
                <td className={o.adjustmentPct >= 0 ? 'text-emerald-700' : 'text-rose-700'}>{(o.adjustmentPct * 100).toFixed(1)}%</td>
                <td>{o.source}</td>
                <td className="truncate">{o.reason}</td>
                <td>{o.author}</td>
                <td>{o.fvaDelta == null ? <span className="text-[var(--muted)]">pending</span> : `${o.fvaDelta > 0 ? '+' : ''}${o.fvaDelta} bps`}</td>
                <td><button type="button" onClick={() => del.mutate(o.id)} className="text-[11px] text-rose-700 hover:underline">Delete</button></td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </Accordion>
  );
}
```

### Task 6.4: Mount OverrideLog + push

- [ ] **Step 1: Mount**

In `AggregateViewV2`, replace `{/* slot 11: OverrideLog */}` with `<OverrideLog />`. Import accordingly.

- [ ] **Step 2: Tests + commit**

```bash
cd frontend-v2 && npm test && npx tsc --noEmit
git add frontend-v2/src/components/Accordion.tsx \
        frontend-v2/src/features/forecasting/components/OverrideLog.tsx \
        frontend-v2/src/features/forecasting/index.tsx
git commit -m "feat(forecast/redesign/p6): drivers + renewals accordions + OverrideLog"
git push
```

---

## Phase 7 — Playwright E2E + Visual Regression

### Task 7.1: Click-to-actual E2E

**Files:**
- Create: `frontend-v2/tests/e2e/forecasting-actual-entry.spec.ts`

- [ ] **Step 1: Spec**

```ts
import { test, expect } from '@playwright/test';

test.describe('Frank — Forecasting v2 click-to-actual', () => {
  test('layout puts KPI strip + hero in first viewport', async ({ page }) => {
    await page.goto('/forecasting?layout=v2');
    const kpi = page.getByTestId('hero-kpi-strip');
    await expect(kpi).toBeVisible();
    const heroBox = await page.locator('section').filter({ hasText: /Forecast/i }).first().boundingBox();
    expect(heroBox?.y ?? 9999).toBeLessThan(900);
  });

  test('click month opens entry panel, FVA warns small, save persists diamond', async ({ page }) => {
    await page.goto('/forecasting?layout=v2');
    // Click an active forecast dot. Recharts renders dots as <circle>; pick last one in the line.
    const dots = page.locator('.recharts-line-dots circle');
    await dots.last().click({ force: true });
    const panel = page.getByTestId('actual-entry-panel');
    await expect(panel).toBeVisible();

    // Read the model P50 from the panel header for the math.
    const modelP50Text = await panel.locator('text=/€[0-9,]+/').first().textContent();
    const modelP50 = Number((modelP50Text ?? '0').replace(/[^0-9]/g, ''));
    const smallAdjust = Math.round(modelP50 * 1.02);

    await page.getByTestId('actual-input').fill(String(smallAdjust));
    await page.getByTestId('reason-input').fill('Test reason for the override');
    await expect(page.getByTestId('fva-warning')).toBeVisible();

    // Now use a >5% adjustment so FVA disappears.
    const bigAdjust = Math.round(modelP50 * 1.15);
    await page.getByTestId('actual-input').fill(String(bigAdjust));
    await expect(page.getByTestId('fva-warning')).toHaveCount(0);

    await page.getByRole('button', { name: /Save actual/i }).click();
    await expect(panel).toBeHidden({ timeout: 2_000 });

    // Diamond should appear (Scatter -> polygon).
    await expect(page.locator('.recharts-scatter-symbol polygon').first()).toBeVisible();

    // Reload — override persists.
    await page.reload();
    await expect(page.locator('.recharts-scatter-symbol polygon').first()).toBeVisible();
  });
});
```

- [ ] **Step 2: Run**

```bash
cd frontend-v2 && npx playwright test forecasting-actual-entry.spec.ts
```
Expected: 2 passing. If fails: inspect trace at `playwright-report/`, iterate.

### Task 7.2: Visual regression baseline

**Files:**
- Create: `frontend-v2/tests/e2e/forecasting-visual.spec.ts`

- [ ] **Step 1: Spec**

```ts
import { test, expect } from '@playwright/test';

test('first viewport screenshot — v2 layout', async ({ page }) => {
  await page.goto('/forecasting?layout=v2');
  await page.waitForSelector('[data-testid="hero-kpi-strip"]');
  await expect(page).toHaveScreenshot('forecasting-v2-firstview.png', { fullPage: false, maxDiffPixelRatio: 0.02 });
});

test('panel open state', async ({ page }) => {
  await page.goto('/forecasting?layout=v2');
  await page.locator('.recharts-line-dots circle').last().click({ force: true });
  await page.waitForSelector('[data-testid="actual-entry-panel"]');
  await expect(page).toHaveScreenshot('forecasting-v2-panel-open.png', { fullPage: false, maxDiffPixelRatio: 0.02 });
});
```

- [ ] **Step 2: Generate baseline**

Run: `cd frontend-v2 && npx playwright test forecasting-visual.spec.ts --update-snapshots`
Then commit screenshots.

- [ ] **Step 3: Commit phase**

```bash
git add frontend-v2/tests/e2e/forecasting-actual-entry.spec.ts \
        frontend-v2/tests/e2e/forecasting-visual.spec.ts \
        frontend-v2/tests/e2e/**/*.png
git commit -m "test(forecast/redesign/p7): Playwright E2E + visual regression for v2"
git push
```

---

## Phase 8 — Review, Bugfix, Flip Default

### Task 8.1: Code review pass

- [ ] **Step 1: Dispatch reviewer**

Use `feature-dev:code-reviewer` (or equivalent) over the diff `main..forecast-redesign-v2`. Prompt: "Review the forecast redesign diff. Focus on (a) the override CRUD endpoint for any input-validation gaps, (b) ActualEntryPanel for accessibility (focus-trap, ESC, screen-reader labels), (c) HeroForecast Recharts changes for memoization/perf, (d) typescript any in adapters."

- [ ] **Step 2: Address feedback**

Each finding → its own commit `fix(forecast/redesign/p8): <finding>`. Re-run unit + Playwright until green.

### Task 8.2: Flip v2 to default

**Files:** Modify `frontend-v2/src/features/forecasting/index.tsx`

- [ ] **Step 1: Invert the flag**

```ts
const layoutV2 = params.get('layout') !== 'v1';  // default v2 unless explicit v1
```

- [ ] **Step 2: Smoke test both branches**

`?layout=v1` still works (rollback path). Default URL renders v2.

- [ ] **Step 3: Commit + push**

```bash
git commit -am "feat(forecast/redesign/p8): make v2 layout the default; v1 available via ?layout=v1"
git push
```

### Task 8.3: Open PR

- [ ] **Step 1: Push final, create PR**

```bash
gh pr create --title "Frank's forecasting redesign — forecast-first + click-to-actual" --body "$(cat <<'EOF'
## Summary
- HeroForecast moves from slot 12 → slot 2; KPI strip first.
- Two-band fan chart (80% / 95%) per Hyndman fpp3.
- Click any month → ActualEntryPanel side panel. Reason required (≥10 chars). FVA guardrail under 5% (Fildes/De Baets 2024).
- Overrides persisted via `/api/v1/forecast/overrides` (JSON store; SQL migration later).
- Top SKUs forecast table, PVMWaterfall (price/volume/mix/churn/fx), OverrideLog.
- Drivers + Renewals accordions to declutter.
- Spec: `docs/superpowers/specs/2026-05-14-frank-forecasting-redesign-design.md`
- Plan: `docs/superpowers/plans/2026-05-14-frank-forecasting-redesign.md`

## Test plan
- [x] Backend pytest: `services/test_overrides.py` + `api/test_forecast_overrides.py`
- [x] Vitest: HeroKPIStrip, ActualEntryPanel, useFVAGuardrail, PVMWaterfall, TopSKUsForecastTable, useForecastOverrides
- [x] Playwright: `forecasting-actual-entry.spec.ts` (click → panel → FVA → save → persist) + visual regression baseline
- [x] Manual: dev server walkthrough as Frank, both `?layout=v1` and default

🤖 Generated with [Claude Code](https://claude.com/claude-code)
EOF
)"
```

---

## Spec Coverage Self-Check

| Spec requirement | Phase / Task |
|---|---|
| Forecast-first layout (HeroKPIStrip + HeroForecast at top) | P2 (2.2, 2.3) + P3 |
| Two-band fan chart (80/95) | P3 (3.1) |
| 6mo history cap + toggle | P3 (3.2) |
| Click month → side panel | P3 (3.3) + P4 (4.3) |
| ActualEntryPanel form fields (Actual / Source / Confidence / Reason) | P4 (4.2) |
| Reason ≥10 chars | P4 (4.2) + P1 (1.1) |
| FVA guardrail under 5% | P4 (4.1, 4.2) |
| Impact preview (adjustment %) | P4 (4.2) |
| Save → diamond glyph | P3 (3.4) + P4 (4.3) |
| Save & retrain now | P4 (4.2) |
| Override persists across reload | P1 (1.1, 1.2) + P7 (7.1) |
| OverrideLog | P6 (6.3) |
| PVMWaterfall (price/volume/mix/churn/fx) | P5 (5.1) |
| TopSKUsForecastTable | P5 (5.2) |
| Drivers & accuracy accordion | P6 (6.2) |
| Renewals & new product accordion | P6 (6.2) |
| Churn as PVMWaterfall bar | P5 (5.1) |
| Churn band in HeroForecast | (deferred — needs BFF `churnBand` field; tracked as follow-up; see "Open follow-ups" below) |
| Rollout flag `?layout=v2` | P2 (2.1) + P8 (8.2) |
| Playwright E2E + visual regression | P7 |
| Phase commits + push | every phase tail |

## Open follow-ups (out of plan scope)

- **Churn as stacked-negative band on HeroForecast** — needs BFF to expose a per-month churn forecast series; currently only PVMWaterfall surfaces churn. Track as separate ticket.
- **Real ML retrain on "Save & retrain now"** — current implementation emits a window event; backend hook is a follow-up.
- **FVA delta computation** — `fvaDelta` field is null until the next walk-forward cycle runs against overrides. Compute in `real_backtest.py` follow-up.
- **Override per-cluster** — current panel passes `cluster: null` (aggregate). Per-cluster override needs the chart to know which cluster is active when clicked.
