export interface TrustDrawerSource {
  model_name: string;
  version: string;
  last_trained_at: string | null;
  entity_type: string;
  entity_id: string | null;
  metric: string;
  metric_value: number;
  n: number | null;
}

export interface TrustDrawerCluster {
  model_name: string;
  entity_type: string;
  entity_id: string | null;
  entity_label: string;
  metric: string;
  metric_value: number;
  n: number | null;
}

export interface TrustDrawerTile {
  key: string;
  label: string;
  value: string;
  caption: string;
  explainer: string;
  source: TrustDrawerSource | null;
  top_clusters: TrustDrawerCluster[];
}

export interface TrustModelCluster {
  entity_type: string;
  entity_id: string | null;
  entity_label: string;
  n: number | null;
  metrics: Record<string, number | null>;
}

export interface TrustModelCard {
  model_name: string;
  version: string;
  last_trained_at: string | null;
  holdout_months: number | null;
  notes: string | null;
  features: string[];
  clusters: TrustModelCluster[];
}

export interface TrustDrawerPayload {
  tiles: TrustDrawerTile[];
  models: TrustModelCard[];
}
