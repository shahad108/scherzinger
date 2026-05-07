import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { MemoryRouter } from 'react-router-dom';
import { MarginHealthStrip } from '@/features/margin-cockpit/components/MarginHealthStrip';
import type { MarginHealthCell } from '@/types';

const cells: MarginHealthCell[] = [
  { id: 'score', label: 'Margin health score', value: 'Watch', sub: '−4 vs last month', scoreRing: 76, scoreVerdict: 'Watch', scoreTone: 'amber' },
  { id: 'actual', label: 'YTD Actual margin', value: '24.1%', trend: '↓ −1.9pp', trendTone: 'down', sub: 'vs 26.0% plan' },
  { id: 'belowPlan', label: '€ below plan YTD', value: '−€187,000', sub: 'across 5,565 invoices' },
  { id: 'closable', label: 'Closable gap', value: '€280,000', sub: 'via 24 actions', authSplit: { yours: '€180K your authority', needsMd: '€100K needs MD' }, jumpTo: '/action-center' },
];

describe('MarginHealthStrip', () => {
  it('renders 4 cells with values and the auth split', () => {
    render(<MemoryRouter><MarginHealthStrip cells={cells} /></MemoryRouter>);
    expect(screen.getByText('Watch')).toBeInTheDocument();
    expect(screen.getByText('76')).toBeInTheDocument();
    expect(screen.getByText('24.1%')).toBeInTheDocument();
    expect(screen.getByText('−€187,000')).toBeInTheDocument();
    expect(screen.getByText('€280,000')).toBeInTheDocument();
    expect(screen.getByText('€180K your authority')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /Closable gap/i })).toHaveAttribute('href', '/action-center');
  });
});
