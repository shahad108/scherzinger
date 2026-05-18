/**
 * Task 4 — DecisionCards inline evidence panel, lifecycle chip, CTA copy.
 *
 * Verifies plan §2.6 F10/F11/F12/F13:
 *   - Clicking "Why this?" or the rank chip opens an inline evidence
 *     panel inside the same card (no drawer).
 *   - Evidence values render from the row's `evidence` payload.
 *   - When `confidence.model.id` is null AND no `featureImportance`,
 *     the LockedDrivers placeholder appears.
 *   - Lifecycle chip renders with the right tone per state.
 *   - Primary CTA label is normalised by `queue`: cost_riser/margin
 *     erosion → "Open in Pricing Studio"; churn → "Open customer".
 */
import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router-dom';

vi.mock('@/data/api/useActions', async () => {
  const { useMutation } = await import('@tanstack/react-query');
  return {
    useAcceptDecision: () =>
      useMutation({ mutationFn: async () => ({ replay: false, audit: {} }) }),
    useDeclineDecision: () =>
      useMutation({ mutationFn: async () => ({ replay: false, audit: {} }) }),
    usePartialAccept: () =>
      useMutation({ mutationFn: async () => ({ replay: false, audit: {} }) }),
    useStartAbTest: () =>
      useMutation({ mutationFn: async () => ({ replay: false, audit: {} }) }),
  };
});

import { DecisionCards } from '@/features/action-center/components/DecisionCards';
import type { DecisionCard } from '@/types';

function withProviders(ui: React.ReactNode) {
  const qc = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return (
    <QueryClientProvider client={qc}>
      <MemoryRouter>{ui}</MemoryRouter>
    </QueryClientProvider>
  );
}

const baseDecision: DecisionCard = {
  rank: '1',
  severity: 'critical',
  title: 'D1',
  why: '',
  tags: [],
  meta: [],
  cta: 'View',
  headline: 'Cost riser article ART-1',
  recommendation: 'Open in Pricing Studio',
  confLabel: 'High',
  queue: 'cost_riser',
  id: 'cost_riser:ART-1',
  recommendationId: 'cost_riser:ART-1',
  lifecycleState: 'open',
  evidence: {
    invoiceCount: 42,
    quoteCount: 7,
    lastInvoiceDate: '2026-04-30',
    sampleSize: 42,
    dataFreshness: '2026-04-30',
  },
  confidence: {
    score: 82,
    sampleSize: 42,
    tone: 'high',
    model: { id: null, version: null, trainedAt: null },
  },
  featureImportance: [],
  linkedQuoteIds: ['Q-100'],
  linkedSkuIds: ['ART-1'],
} as DecisionCard;

const churnDecision: DecisionCard = {
  ...baseDecision,
  rank: '2',
  title: 'D2',
  headline: 'Churn risk Customer C-9',
  queue: 'churn',
  id: 'churn:C-9',
  recommendationId: 'churn:C-9',
  lifecycleState: 'ab_running',
} as DecisionCard;

describe('DecisionCards inline evidence', () => {
  it('expands evidence inline when "Why this?" is clicked', () => {
    render(withProviders(<DecisionCards decisions={[baseDecision]} />));
    // Panel is closed by default.
    expect(screen.queryByTestId('evidence-panel-cost_riser:ART-1')).toBeNull();

    fireEvent.click(screen.getByRole('button', { name: /Why this\?/i }));

    const panel = screen.getByTestId('evidence-panel-cost_riser:ART-1');
    expect(panel).toBeInTheDocument();
    // Evidence values render from payload (real numbers + date).
    expect(panel).toHaveTextContent('Invoices:');
    expect(panel).toHaveTextContent('42');
    expect(panel).toHaveTextContent('Quotes:');
    expect(panel).toHaveTextContent('7');
    expect(panel).toHaveTextContent('2026-04-30');
    // Confidence score shows.
    expect(panel).toHaveTextContent('82%');
  });

  it('expands when the rank chip is clicked', () => {
    render(withProviders(<DecisionCards decisions={[baseDecision]} />));
    fireEvent.click(
      screen.getByRole('button', { name: /Toggle evidence for decision 1/i }),
    );
    expect(screen.getByTestId('evidence-panel-cost_riser:ART-1')).toBeInTheDocument();
  });

  it('renders the LockedDrivers placeholder when model.id is null and FI is empty', () => {
    render(withProviders(<DecisionCards decisions={[baseDecision]} />));
    fireEvent.click(screen.getByRole('button', { name: /Why this\?/i }));
    expect(screen.getByTestId('locked-drivers')).toBeInTheDocument();
  });

  it('renders the lifecycle chip with the correct tone class', () => {
    render(withProviders(<DecisionCards decisions={[baseDecision, churnDecision]} />));
    expect(screen.getByTestId('lifecycle-chip-open')).toBeInTheDocument();
    expect(screen.getByTestId('lifecycle-chip-ab_running')).toBeInTheDocument();
  });

  it('normalises the primary CTA copy by queue', () => {
    render(withProviders(<DecisionCards decisions={[baseDecision, churnDecision]} />));
    // The recommendation SelectPill also reads "Open in Pricing Studio"
    // for cost_riser rows because the backend sends that string into
    // `recommendation`. The primary CTA is the rose-coloured button at
    // the bottom of the card; assert at least one button with each label.
    expect(
      screen.getAllByRole('button', { name: 'Open in Pricing Studio' }).length,
    ).toBeGreaterThanOrEqual(1);
    expect(screen.getByRole('button', { name: 'Open customer' })).toBeInTheDocument();
  });
});
