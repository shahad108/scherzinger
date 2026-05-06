export type Persona = 'frank' | 'till' | 'heiko';

export type Density = 'cozy' | 'compact';

export type Severity = 'info' | 'success' | 'warning' | 'error';

export type ObjectStatusKind = 'positive' | 'negative' | 'warning' | 'neutral';

export interface KpiDelta {
  value: number;
  direction: 'up' | 'down' | 'flat';
  good: boolean;
}

export interface KpiData {
  id: string;
  label: string;
  value: string;
  raw?: number;
  delta?: KpiDelta;
  spark?: number[];
}

export interface ActionCard {
  id: string;
  type: 'churn' | 'margin' | 'opportunity' | 'risk' | 'forecast' | 'pricing';
  severity: Severity;
  title: string;
  subtitle: string;
  customer?: string;
  sku?: string;
  amount?: number;
  confidence?: number;
  createdAt: string;
  recommendedAction?: string;
}
