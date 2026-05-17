// Phase 5 — scenarios CRUD hooks.

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { apiFetch, postJson } from '@/lib/api/client';
import type {
  ScenarioInput,
  ScenarioListResponse,
  ScenarioSummary,
  ScenarioVisibility,
} from '@/types/forecast';

const STORE_KEY = '__scenario_memory__';

// Test-time / mock-mode in-memory store. Persisted to localStorage so a
// page reload doesn't wipe what Frank just saved while the BFF is offline.
function readMemoryStore(): ScenarioSummary[] {
  try {
    return JSON.parse(localStorage.getItem(STORE_KEY) ?? '[]') as ScenarioSummary[];
  } catch {
    return [];
  }
}

function writeMemoryStore(items: ScenarioSummary[]): void {
  try {
    localStorage.setItem(STORE_KEY, JSON.stringify(items));
  } catch {
    /* swallow */
  }
}

const SYSTEM_SCENARIOS: ScenarioSummary[] = [
  {
    id: '00000000-0000-0000-0000-000000000001',
    name: 'Base case',
    description: 'Baseline — no perturbation; current run of the simulator.',
    inputs: [],
    visibility: 'team',
    ownerUserId: null,
    derivedFromScenarioId: null,
    isSystem: true,
  },
  {
    id: '00000000-0000-0000-0000-000000000002',
    name: 'Steel shock +10%',
    description: 'Headline tornado scenario: single-input steel HRC +10%.',
    inputs: [
      {
        name: 'Steel S355',
        kind: 'market_series',
        unit: '€/t',
        perturbation: { type: 'pct', value: 10 },
      },
    ],
    visibility: 'team',
    ownerUserId: null,
    derivedFromScenarioId: null,
    isSystem: true,
  },
  {
    id: '00000000-0000-0000-0000-000000000003',
    name: 'Multi-input shock',
    description: 'Steel +10%, EUR/USD −3%, demand −5%, pass-through fixed at 60%.',
    inputs: [
      { name: 'Steel S355', kind: 'market_series', unit: '€/t', perturbation: { type: 'pct', value: 10 } },
      { name: 'EUR/USD', kind: 'market_series', unit: 'FX', perturbation: { type: 'pct', value: -3 } },
      { name: 'Demand growth', kind: 'internal_lever', unit: '%', perturbation: { type: 'pct', value: -5 } },
      { name: 'Pass-through %', kind: 'internal_lever', unit: '%', perturbation: { type: 'absolute', value: 60 } },
    ],
    visibility: 'team',
    ownerUserId: null,
    derivedFromScenarioId: null,
    isSystem: true,
  },
];

export function useScenarios() {
  return useQuery({
    queryKey: ['scenarios'],
    queryFn: () =>
      apiFetch<ScenarioListResponse>('/scenarios', {
        mockResolve: () => synthesize(),
      }),
    staleTime: 60_000,
  });
}

function synthesize(): ScenarioListResponse {
  const memory = readMemoryStore();
  return {
    system: SYSTEM_SCENARIOS,
    saved: memory.filter((s) => s.visibility === 'private'),
    teamShared: memory.filter((s) => s.visibility === 'team'),
  };
}

interface CreatePayload {
  name: string;
  description?: string;
  inputs: ScenarioInput[];
  visibility: ScenarioVisibility;
}

export function useCreateScenario() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (payload: CreatePayload) =>
      postJson<ScenarioSummary>('/scenarios', payload, {
        mockResolve: () => {
          const created: ScenarioSummary = {
            id: crypto.randomUUID(),
            name: payload.name,
            description: payload.description ?? '',
            inputs: payload.inputs,
            visibility: payload.visibility,
            ownerUserId: 'me',
            derivedFromScenarioId: null,
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
            isSystem: false,
          };
          writeMemoryStore([...readMemoryStore(), created]);
          return created;
        },
      }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['scenarios'] }),
  });
}

export function useShareScenario() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, recipient }: { id: string; recipient: 'till' | 'heiko' | 'team' }) =>
      postJson<{ scenarioId: string }>(`/scenarios/${id}/share`, { recipient }, {
        mockResolve: () => {
          const items = readMemoryStore().map((s) =>
            s.id === id ? { ...s, visibility: 'team' as const } : s,
          );
          writeMemoryStore(items);
          return { scenarioId: id };
        },
      }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['scenarios'] }),
  });
}

// ---------------------------------------------------------------------------
// useRunScenario — POST /scenarios/{id}/run
//
// Fires off a full forecast computation (baseline + scenario-applied) and
// returns the deltas. First-time runs trigger v3 inference (Chronos + AutoETS
// + reconciliation) and can take several seconds; cached runs return fast.
// ---------------------------------------------------------------------------

export interface ScenarioRunMonthlyPoint {
  month: string;
  p50: number | null;
  p80Low: number | null;
  p80High: number | null;
}

export interface ScenarioRunTargetSeries {
  total: number | null;
  unit: string | null;
  monthly: ScenarioRunMonthlyPoint[];
  scenarioApplied: {
    shiftPpMargin: number;
    relativePctOnMetric: number;
    metric: string;
    inputCount: number;
    unmappedInputs: string[];
  } | null;
}

export interface ScenarioRunDelta {
  baseline: number | null;
  shifted: number | null;
  absoluteDelta: number | null;
  pctDelta: number | null;
}

export interface ScenarioRunResponse {
  scenarioId: string;
  horizonMonths: number;
  baseline: {
    revenue: ScenarioRunTargetSeries;
    volume: ScenarioRunTargetSeries;
    margin: ScenarioRunTargetSeries;
  };
  shifted: {
    revenue: ScenarioRunTargetSeries;
    volume: ScenarioRunTargetSeries;
    margin: ScenarioRunTargetSeries;
  };
  deltas: {
    revenue: ScenarioRunDelta;
    volume: ScenarioRunDelta;
    margin: ScenarioRunDelta;
  };
  receipt: ScenarioRunTargetSeries['scenarioApplied'];
}

function mockRunScenario(id: string): ScenarioRunResponse {
  // Deterministic mock for tests / dev without a live backend.
  const months = Array.from({ length: 12 }, (_, i) => {
    const d = new Date(2026, i, 1);
    return d.toISOString().slice(0, 10);
  });
  const monthly = (base: number) =>
    months.map((m, i) => ({
      month: m,
      p50: Math.round(base + i * 1000),
      p80Low: Math.round((base + i * 1000) * 0.85),
      p80High: Math.round((base + i * 1000) * 1.15),
    }));
  const receipt = {
    shiftPpMargin: -1.2,
    relativePctOnMetric: -1.9,
    metric: 'margin',
    inputCount: 1,
    unmappedInputs: [] as string[],
  };
  return {
    scenarioId: id,
    horizonMonths: 12,
    baseline: {
      revenue: { total: 7063223, unit: 'eur', monthly: monthly(580000), scenarioApplied: null },
      volume:  { total: 7842,    unit: 'units', monthly: monthly(650), scenarioApplied: null },
      margin:  { total: null,    unit: 'margin_ratio', monthly: monthly(0.58), scenarioApplied: null },
    },
    shifted: {
      revenue: { total: 6931020, unit: 'eur', monthly: monthly(569000), scenarioApplied: receipt },
      volume:  { total: 7710,    unit: 'units', monthly: monthly(640), scenarioApplied: receipt },
      margin:  { total: null,    unit: 'margin_ratio', monthly: monthly(0.569), scenarioApplied: receipt },
    },
    deltas: {
      revenue: { baseline: 7063223, shifted: 6931020, absoluteDelta: -132203, pctDelta: -1.87 },
      volume:  { baseline: 7842, shifted: 7710, absoluteDelta: -132, pctDelta: -1.68 },
      margin:  { baseline: null, shifted: null, absoluteDelta: null, pctDelta: null },
    },
    receipt,
  };
}

export function useRunScenario() {
  return useMutation<ScenarioRunResponse, Error, { id: string; horizon?: number }>({
    mutationFn: ({ id, horizon }) =>
      postJson<ScenarioRunResponse>(
        `/scenarios/${id}/run`,
        { horizon: horizon ?? 12 },
        { mockResolve: () => mockRunScenario(id) },
      ),
  });
}

export function useDeleteScenario() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      if (import.meta.env.MODE === 'test') {
        writeMemoryStore(readMemoryStore().filter((s) => s.id !== id));
        return;
      }
      const url = `${(import.meta.env.VITE_SCHERZINGER_API as string | undefined) || '/api/v1'}/scenarios/${id}`;
      await fetch(url, { method: 'DELETE', credentials: 'include' });
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['scenarios'] }),
  });
}
