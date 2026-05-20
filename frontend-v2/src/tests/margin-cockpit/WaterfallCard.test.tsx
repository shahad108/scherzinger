import { render, screen, fireEvent } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { MemoryRouter } from 'react-router-dom';
import { WaterfallCard } from '@/features/margin-cockpit/components/WaterfallCard';
import type { WaterfallCardData } from '@/types';

const data: WaterfallCardData = {
  title: 'Where the 3.9pp gap came from',
  subtitle: 'Every PP mapped',
  totalChip: '€417K total leakage',
  infoPanel: ['Each bucket is a doorway.'],
  buckets: [
    { id: 'target', name: 'Target margin', endpoint: 'green-start', pct: '28.0%', eur: 'plan' },
    {
      id: 'discount',
      name: 'Discounting',
      pct: '−1.1pp',
      eur: '€117K',
      source: '47 breaches',
      delta: { label: 'flat MoM', tone: 'flat' },
      jumpLabel: '→ By-rep',
      jumpTo: { kind: 'route', to: '/quotes' },
    },
    { id: 'actual', name: 'Actual margin', endpoint: 'green-end', pct: '24.1%', eur: '−€417K' },
  ],
  chart: [
    { label: 'Target', cumulative: 28.0, delta: 28.0, kind: 'endpoint' },
    { label: 'Discount', cumulative: 26.9, delta: -1.1, kind: 'loss' },
    { label: 'Actual', cumulative: 24.1, delta: 24.1, kind: 'endpoint' },
  ],
  movableLocked: {
    totalLeakage: '€417K',
    movable: { label: 'Movable €260K (62%)', pct: 62 },
    locked: { label: 'Locked €157K (38%)', pct: 38 },
    source: 'Pilot estimate',
  },
};

describe('WaterfallCard', () => {
  it('renders bucket rows and does not fire onTabJump for route-kind jumps', () => {
    const onTabJump = vi.fn();
    render(
      <MemoryRouter>
        <WaterfallCard data={data} onTabJump={onTabJump} />
      </MemoryRouter>
    );
    expect(screen.getByText('Where the 3.9pp gap came from')).toBeInTheDocument();
    expect(screen.getByText('€417K total leakage')).toBeInTheDocument();
    expect(screen.getByText('Discounting')).toBeInTheDocument();
    expect(screen.getByText('€117K')).toBeInTheDocument();
    expect(screen.getByText('Movable €260K (62%)')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /Discounting/ }));
    // jumpTo for Discounting is route → no tab jump expected
    expect(onTabJump).not.toHaveBeenCalled();
  });

  it('toggles between full and movable-only views when movableView is provided', () => {
    const dataWithMovable: WaterfallCardData = {
      ...data,
      buckets: [
        data.buckets[0],
        {
          ...data.buckets[1],
          classification: 'unintended',
          classificationNote: 'Sales-rep guardrail breaches.',
          movableShare: 0.85,
        },
        data.buckets[2],
      ],
      movableView: {
        title: 'Movable-only',
        totalChip: '€100K movable leakage of €417K total leakage',
        buckets: [
          data.buckets[0],
          {
            id: 'discount', name: 'Discounting',
            pct: '−0.9pp', eur: '€99K',
            classification: 'unintended', classificationNote: 'Sales-rep guardrail breaches.',
            movableShare: 0.85,
          },
          { id: 'actual', name: 'Actual margin', endpoint: 'green-end', pct: '27.1%', eur: '−€99K' },
        ],
        chart: data.chart,
        heuristic: { label: 'Pilot heuristic', rule: 'movable_eur = bucket_eur × share', qualifier: 'Hover the pill.' },
      },
    };
    const onTabJump = vi.fn();
    render(
      <MemoryRouter>
        <WaterfallCard data={dataWithMovable} onTabJump={onTabJump} />
      </MemoryRouter>
    );
    // default: full view
    expect(screen.getByText('€117K')).toBeInTheDocument();
    expect(screen.getByText('€417K total leakage')).toBeInTheDocument();
    // classification pill is rendered
    expect(screen.getByRole('button', { name: /Bucket classification: Unintended/ })).toBeInTheDocument();
    // toggle on
    fireEvent.click(screen.getByLabelText('Show movable-only waterfall'));
    expect(screen.getByText('€99K')).toBeInTheDocument();
    expect(screen.getByText(/movable leakage of/)).toBeInTheDocument();
    expect(screen.getByText(/Hover the pill\./)).toBeInTheDocument();
  });

  it('fires onTabJump when a tab-kind bucket is clicked', () => {
    const tabData = { ...data, buckets: [
      ...data.buckets,
      {
        id: 'mix', name: 'Customer mix', pct: '−0.6pp', eur: '€64K',
        jumpLabel: '→ Tier pivot',
        jumpTo: { kind: 'tab' as const, tab: 'seg', segTab: 'tier' },
      },
    ]};
    const onTabJump = vi.fn();
    render(
      <MemoryRouter>
        <WaterfallCard data={tabData} onTabJump={onTabJump} />
      </MemoryRouter>
    );
    fireEvent.click(screen.getByRole('button', { name: /Customer mix/ }));
    expect(onTabJump).toHaveBeenCalledWith('seg', 'tier');
  });
});
