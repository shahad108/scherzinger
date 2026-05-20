// Pricing Studio v3 / Phase 3 — option_margin + trigger_context + cost-outlook fixtures.
//
// Decimal-as-string from the BFF; the fixtures match the wire shape so
// each component exercises its parser path end-to-end.

import type {
  CostHistoryBlock,
  CostOutlookPayload,
  OptionMarginBlock,
  TriggerContextBlock,
} from '@/types/studio';
import { lineageRef } from './fixtures';

export const optionMargin = (
  overrides: Partial<OptionMarginBlock> = {},
): OptionMarginBlock => ({
  option_id: 'floor',
  price: '100.00',
  list: '100.00',
  quoted: '88.00',
  booked: '80.00',
  invoiced: '76.00',
  db2: '18.00',
  leakage_per_step_pct: ['12.00', '8.00', '4.00', '58.00'],
  lineage_ref: lineageRef('a1d4e3f0-0000-4000-8000-000000000300'),
  ...overrides,
});

export const optionMarginsFull = (): OptionMarginBlock[] => [
  optionMargin({ option_id: 'hold', price: '95.00', list: '95.00', db2: '15.00' }),
  optionMargin({ option_id: 'floor', price: '100.00', list: '100.00', db2: '18.00' }),
  optionMargin({ option_id: 'market', price: '110.00', list: '110.00', db2: '24.00' }),
  optionMargin({ option_id: 'custom', price: '105.00', list: '105.00', db2: '20.00' }),
  optionMargin({
    option_id: 'recommendation',
    price: '127.00',
    list: '127.00',
    db2: '34.00',
  }),
];

export const triggerContext = (
  overrides: Partial<TriggerContextBlock> = {},
): TriggerContextBlock => ({
  source: 'forecasting',
  reason: 'cost-spike',
  headline:
    'Opened because Steel S355 cost rose 8% in the last 30 days, crossing your 18% safety margin.',
  details:
    'Forecasting flagged this SKU because the internal material-cost proxy stepped +8% versus the prior month.',
  link_label: 'View commodity trend',
  link_target: '/forecasting?cluster=BKAGG#commodities',
  lineage_ref: lineageRef('a1d4e3f0-0000-4000-8000-000000000301'),
  ...overrides,
});

export const costHistory = (): CostHistoryBlock => ({
  points: [
    { date: '2024-Q1', unit_cost: '4.20' },
    { date: '2024-Q2', unit_cost: '4.32' },
    { date: '2024-Q3', unit_cost: '4.41' },
    { date: '2024-Q4', unit_cost: '4.55' },
    { date: '2025-Q1', unit_cost: '4.74' },
  ],
  commodities: [
    {
      id: 'BKAGG',
      name: 'Steel S355',
      slopePerYear: -2.1,
      trajectory: [
        { date: '2024-Q1', value: 100 },
        { date: '2024-Q2', value: 103 },
        { date: '2024-Q3', value: 105 },
        { date: '2024-Q4', value: 108 },
        { date: '2025-Q1', value: 112 },
      ],
    },
  ],
  quarters: ['2024-Q1', '2024-Q2', '2024-Q3', '2024-Q4', '2025-Q1'],
  source: 'synthetic',
});

export const costOutlookPayload = (
  overrides: Partial<CostOutlookPayload> = {},
): CostOutlookPayload => ({
  aid: '200832-E',
  horizon_months: 6,
  today: {
    unit_cost: '4.74',
    breakdown: {
      material: '1.80',
      labor: '1.13',
      outsourcing: '1.42',
      overhead: '0.39',
    },
  },
  forecast: Array.from({ length: 6 }, (_, i) => {
    const offset = i + 1;
    const p50 = 4.74 + 0.05 * offset;
    return {
      month_offset: offset,
      p20_unit_cost: (p50 - 0.04 * offset).toFixed(4),
      p50_unit_cost: p50.toFixed(4),
      p80_unit_cost: (p50 + 0.04 * offset).toFixed(4),
    };
  }),
  components: [
    {
      name: 'material',
      today_value: '1.8000',
      forecast_value: '1.9200',
      change_pct: '6.67',
      commodity_label: 'Steel S355',
    },
    {
      name: 'labor',
      today_value: '1.1300',
      forecast_value: '1.1600',
      change_pct: '2.65',
      commodity_label: 'Industrial wage index',
    },
    {
      name: 'outsourcing',
      today_value: '1.4200',
      forecast_value: '1.4500',
      change_pct: '2.11',
      commodity_label: 'Logistics index',
    },
    {
      name: 'overhead',
      today_value: '0.3900',
      forecast_value: '0.3900',
      change_pct: '0.00',
      commodity_label: 'Energy index',
    },
  ],
  floor_crosses_at: '2026-09',
  commodity_trend: [{ commodity: 'Steel S355', monthly_yoy_pct: 2.1 }],
  lineage_ref: lineageRef('a1d4e3f0-0000-4000-8000-000000000302'),
  ...overrides,
});
