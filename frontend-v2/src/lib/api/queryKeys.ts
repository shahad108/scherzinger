export const qk = {
  actionCards: ['action-cards'] as const,
  margin: (period: string) => ['margin', period] as const,
  quotes: (filters: Record<string, unknown>) => ['quotes', filters] as const,
  forecast: (horizon: string) => ['forecast', horizon] as const,
  pricing: ['pricing'] as const,
  ai: ['ai-briefing'] as const,
} as const;
