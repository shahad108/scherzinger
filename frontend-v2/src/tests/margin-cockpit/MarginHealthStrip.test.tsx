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

  it('renders a plain wrapper (not a Link) when jumpTo is absent', () => {
    const noJump: MarginHealthCell[] = [{
      id: 'actual', label: 'YTD Actual margin', value: '24.1%',
      trend: '↓ −1.9pp', trendTone: 'down', sub: 'vs 26.0% plan',
    }];
    render(<MemoryRouter><MarginHealthStrip cells={noJump} /></MemoryRouter>);
    expect(screen.queryByRole('link')).toBeNull();
    expect(screen.getByText('24.1%')).toBeInTheDocument();
  });

  it('uses ink-3 (not green) for trendTone=flat', () => {
    const flatCell: MarginHealthCell[] = [{
      id: 'actual', label: 'YTD', value: '24.1%',
      trend: '→ flat', trendTone: 'flat',
    }];
    render(<MemoryRouter><MarginHealthStrip cells={flatCell} /></MemoryRouter>);
    const trend = screen.getByText('→ flat');
    expect(trend.getAttribute('style') ?? '').toContain('var(--ink-3)');
  });
});
