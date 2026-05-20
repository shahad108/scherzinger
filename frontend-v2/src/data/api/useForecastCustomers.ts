// Phase 4 — per-customer hooks.

import { useQuery } from '@tanstack/react-query';
import { apiFetch } from '@/lib/api/client';
import type { CustomerDetail, CustomersPreview } from '@/types/forecast';
import forecastMock from '@/data/mocks/forecast.json';

const SEED_CUSTOMERS = (forecastMock as { customers: CustomersPreview }).customers;

interface CustomersParams {
  risk_filter?: 'high' | 'medium' | 'low' | 'all';
}

export function useForecastCustomers(params?: CustomersParams) {
  return useQuery({
    queryKey: ['forecast-customers', params],
    queryFn: () =>
      apiFetch<CustomersPreview>('/forecast/customers', {
        params,
        mockResolve: () => filterSeed(SEED_CUSTOMERS, params),
      }),
    staleTime: 30_000,
  });
}

export function useForecastCustomerDetail(customerId: string | undefined, enabled = true) {
  return useQuery({
    queryKey: ['forecast-customer', customerId],
    queryFn: () =>
      apiFetch<CustomerDetail>(`/forecast/customers/${customerId}`, {
        mockResolve: () => synthesizeCustomerDetail(customerId!),
      }),
    enabled: enabled && !!customerId,
    staleTime: 60_000,
  });
}

function filterSeed(
  seed: CustomersPreview,
  params?: CustomersParams,
): CustomersPreview {
  if (!params || !params.risk_filter || params.risk_filter === 'all') return seed;
  return {
    ...seed,
    topAtRisk: seed.topAtRisk.filter((r) => r.riskTier === params.risk_filter),
  };
}

function synthesizeCustomerDetail(customerId: string): CustomerDetail {
  const row =
    SEED_CUSTOMERS.topAtRisk.find((c) => c.customerId === customerId) ??
    SEED_CUSTOMERS.topAtRisk[0];
  const lastActual = row.lastActualRevenue ?? 100000;
  return {
    customerId,
    customerName: row.customerName,
    riskTier: row.riskTier,
    pChurn4Q: row.pChurn4Q ?? undefined,
    pMajorDecline: row.pMajorDecline ?? undefined,
    distributions: {
      revenue: {
        '3': scaleDist(row, 0.25),
        '6': scaleDist(row, 0.5),
        '12': scaleDist(row, 1),
      },
      margin: {
        '12': {
          median: 52.1,
          p5: 34.2,
          p25: 45.8,
          p75: 58.7,
          p95: 67.4,
          pBelowThreshold: 26.4,
          thresholdValue: 50,
        },
      },
      quantity: {
        '12': {
          median: 1240,
          p5: 820,
          p25: 1080,
          p75: 1410,
          p95: 1620,
          pBelowThreshold: 18.7,
          thresholdValue: 1000,
        },
      },
    },
    historicalRevenue: [
      { month: 'May 25', revenue: lastActual * 0.84 },
      { month: 'Aug 25', revenue: lastActual * 0.95 },
      { month: 'Nov 25', revenue: lastActual * 0.91 },
      { month: 'Feb 26', revenue: lastActual * 0.97 },
      { month: 'Apr 26', revenue: lastActual },
    ],
  };
}

function scaleDist(row: NonNullable<CustomersPreview['topAtRisk'][number]>, scale: number) {
  const median = (row.median12moRevenue ?? 100000) * scale;
  return {
    median,
    p5: (row.p5Revenue ?? 0) * scale,
    p25: median * 0.92,
    p75: median * 1.08,
    p95: (row.p95Revenue ?? 0) * scale,
    pBelowThreshold: (row.pBelow80pctOfCurrent ?? 0) * Math.min(1, scale + 0.2),
    thresholdValue: (row.lastActualRevenue ?? 0) * 0.8 * scale,
  };
}
