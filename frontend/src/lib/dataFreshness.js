// Central source of truth for per-dashboard "last updated" dates.
// Replace this mock with real backend-driven values when the API exists.
// Keys must match the dashboardKey prop passed to <LastUpdated />.

const FRESHNESS = {
  overview:     { dataAsOf: '2026-04-15' },
  revenue:      { dataAsOf: '2026-04-15' },
  products:     { dataAsOf: '2026-04-15' },
  customers:    { dataAsOf: '2026-04-15' },
  forecast:     { dataAsOf: '2026-04-15' },
  pricing:      { dataAsOf: '2026-04-15' },
  ml:           { dataAsOf: '2026-04-15', modelAsOf: '2025-12-01' },
  'ai-insights':{ dataAsOf: '2026-04-15' },
};

export function getDashboardFreshness(dashboardKey) {
  const entry = FRESHNESS[dashboardKey];
  if (!entry) {
    // Defensive default so UI never renders null
    return { dataAsOf: null, modelAsOf: null };
  }
  return { dataAsOf: entry.dataAsOf ?? null, modelAsOf: entry.modelAsOf ?? null };
}

export const DASHBOARD_KEYS = Object.keys(FRESHNESS);
