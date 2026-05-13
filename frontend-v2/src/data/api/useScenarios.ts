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
