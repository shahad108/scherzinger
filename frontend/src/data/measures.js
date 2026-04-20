// Measure data shape + small seed list.
// The store lives in-memory (MeasuresProvider) with localStorage persistence.
// Swap for a Supabase-backed store when the backend is ready.

export const MEASURE_STATUSES = ['open', 'in_progress', 'blocked', 'done', 'dismissed'];

export function createMeasureRecord({
  title,
  description = '',
  sourceKpi = null,
  sourceDashboard = null,
  sourceElementId = null,
  owner = '',
  dueDate = null,
  status = 'open',
  author = 'system',
}) {
  const now = new Date().toISOString();
  const id = `m_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 7)}`;
  return {
    id,
    title,
    description,
    sourceKpi,
    sourceDashboard,
    sourceElementId,
    owner,
    dueDate,
    status,
    createdAt: now,
    updatedAt: now,
    history: [{ ts: now, author, note: 'created', statusFrom: null, statusTo: status }],
  };
}

export const SEED_MEASURES = [
  createMeasureRecord({
    title: 'Preisverhandlung mit Kunde 101690',
    description: 'Rabattstruktur prüfen; Ziel: Marge +3pp bis Q3',
    sourceDashboard: 'customers',
    sourceElementId: 'customer-101690',
    owner: 'Manuel Scherzinger',
    dueDate: '2026-06-30',
    status: 'in_progress',
    author: 'seed',
  }),
  createMeasureRecord({
    title: 'MBKUEHL Warengruppe: Materialkosten neu verhandeln',
    description: 'Lieferantengespräche Q2',
    sourceDashboard: 'products',
    sourceElementId: 'commodity-MBKUEHL',
    owner: 'Einkauf',
    dueDate: '2026-05-15',
    status: 'open',
    author: 'seed',
  }),
];
