/**
 * Phase 2 — MethodologyPanel collapses by default, expands on click,
 * and never uses dangerouslySetInnerHTML.
 */
import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { MethodologyPanel } from '@/features/forecasting/components/MethodologyPanel';
import type { ForecastMethodology } from '@/types/forecast';

const methodology: ForecastMethodology = {
  lastReviewedAt: '2026-05-13T06:14:00Z',
  validationReportMd: '# Title\nbody line',
  sources: [
    {
      name: 'invoices',
      kind: 'internal',
      description: 'ERP source',
      lastFetchedAt: '2026-05-13T00:00:00Z',
    },
  ],
  assumptions: [{ label: 'Growth', value: '+3.4%', note: 'Recomputed monthly.' }],
  models: [
    {
      modelName: 'margin_walk_forward_v3',
      version: 'v3.2',
      trainedAt: '2026-05-10T08:00:00Z',
      holdoutMonths: 6,
      entityType: 'commodity_group',
      metric: 'mape_db2_margin',
      metricValue: 0.0688,
      nObservations: 36,
      notes: 'M3 nested CV.',
    },
  ],
  limitations: ['SOPU cluster has n<30.'],
};

describe('MethodologyPanel (Phase 2)', () => {
  it('renders collapsed by default', () => {
    render(<MethodologyPanel methodology={methodology} />);
    expect(screen.getByTestId('methodology-panel')).toBeInTheDocument();
    expect(screen.queryByText(/Validation report/)).not.toBeInTheDocument();
  });

  it('expands on click and shows all subsections', () => {
    render(<MethodologyPanel methodology={methodology} />);
    fireEvent.click(screen.getByRole('button', { name: /Methodology, sources/i }));
    expect(screen.getByText(/Validation report/)).toBeInTheDocument();
    expect(screen.getByText(/Models/)).toBeInTheDocument();
    expect(screen.getByText(/Assumptions/)).toBeInTheDocument();
    expect(screen.getByText(/External sources/)).toBeInTheDocument();
    expect(screen.getByText(/Limitations/)).toBeInTheDocument();
    expect(screen.getByText(/margin_walk_forward_v3/)).toBeInTheDocument();
    expect(screen.getByText('SOPU cluster has n<30.')).toBeInTheDocument();
  });

  it('never uses dangerouslySetInnerHTML', () => {
    render(<MethodologyPanel methodology={methodology} />);
    fireEvent.click(screen.getByRole('button', { name: /Methodology, sources/i }));
    // Render markdown as plain <pre> text to neutralise injection vectors.
    expect(document.querySelectorAll('[dangerouslysetinnerhtml]').length).toBe(0);
  });
});
