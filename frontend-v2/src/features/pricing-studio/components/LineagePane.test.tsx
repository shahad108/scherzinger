// Pricing Studio v3 / Phase E6 — LineagePane unit tests.
//
// Covers the 7-point acceptance:
//   1. Empty state when status=empty.
//   2. Loading shimmer when isLoading.
//   3. Groups rows by `kind`; renders group headers in canonical order.
//   4. Row click invokes the lineage-drawer open function with the row id.
//   5. Degraded status shows warning banner + rows.
//   6. `computed_at` renders as a relative-time string.
//   7. `row_count` is displayed only when non-null.

import { fireEvent, render, screen, within } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import type { PricingLineageBlock, PricingLineageRow } from '@/types/studio';

// Mock the LineageDrawer context so we can assert openLineage gets called
// with the right ref. We import the mock target before the module under test
// so the mock binding is hoisted by Vitest before any consumer resolution.
const openLineageMock = vi.fn();
vi.mock('@/features/pricing-studio/lineage/LineageDrawerContext', () => ({
  useLineageDrawer: () => ({
    openLineage: openLineageMock,
    closeLineage: vi.fn(),
    openLineageRef: null,
    subjectTitle: null,
    drivers: null,
    wtp: null,
    recommendedPrice: null,
    confidenceLevel: null,
    nDeals: null,
  }),
}));

// Import LAST so the mock above is in place when the module evaluates.
import { LineagePane, formatRelative } from './LineagePane';

function row(overrides: Partial<PricingLineageRow> = {}): PricingLineageRow {
  return {
    id: 'row-id',
    kind: 'recommendation',
    source_kind: 'recommendation',
    model: 'ridge',
    model_version: 'v2026-05-12',
    computed_at: new Date(Date.now() - 3 * 60 * 60 * 1000).toISOString(), // 3h ago
    sql_preview: null,
    row_count: null,
    ...overrides,
  };
}

beforeEach(() => {
  openLineageMock.mockClear();
});

describe('LineagePane', () => {
  it('renders empty card when status=empty', () => {
    const data: PricingLineageBlock = { status: 'empty', rows: [] };
    render(<LineagePane data={data} />);
    expect(screen.getByTestId('lineage-pane-empty')).toBeInTheDocument();
    expect(screen.getByText('No lineage records')).toBeInTheDocument();
  });

  it('renders shimmer placeholders when isLoading', () => {
    render(<LineagePane data={undefined} isLoading />);
    expect(screen.getByTestId('lineage-pane-loading')).toBeInTheDocument();
    expect(screen.getAllByTestId('lineage-pane-shimmer-row')).toHaveLength(4);
  });

  it('groups rows by kind and renders headers in canonical order', () => {
    const data: PricingLineageBlock = {
      status: 'live',
      rows: [
        row({ id: 'a', kind: 'cost_outlook' }),
        row({ id: 'b', kind: 'recommendation' }),
        row({ id: 'c', kind: 'wtp' }),
        row({ id: 'd', kind: 'curve' }),
        row({ id: 'e', kind: 'recommendation' }),
      ],
    };
    render(<LineagePane data={data} />);

    // Group headers exist for the kinds with rows and skip empties.
    expect(screen.getByTestId('lineage-pane-group-recommendation')).toBeInTheDocument();
    expect(screen.getByTestId('lineage-pane-group-wtp')).toBeInTheDocument();
    expect(screen.getByTestId('lineage-pane-group-curve')).toBeInTheDocument();
    expect(screen.getByTestId('lineage-pane-group-cost_outlook')).toBeInTheDocument();
    expect(screen.queryByTestId('lineage-pane-group-fanout')).not.toBeInTheDocument();

    // Canonical order: recommendation → wtp → curve → cost_outlook.
    const groups = screen
      .getByTestId('lineage-pane')
      .querySelectorAll('[data-group-kind]');
    const kinds = Array.from(groups).map((g) => g.getAttribute('data-group-kind'));
    expect(kinds).toEqual(['recommendation', 'wtp', 'curve', 'cost_outlook']);

    // The two recommendation rows land under the same header.
    const recGroup = screen.getByTestId('lineage-pane-group-recommendation');
    expect(within(recGroup).getByTestId('lineage-pane-row-b')).toBeInTheDocument();
    expect(within(recGroup).getByTestId('lineage-pane-row-e')).toBeInTheDocument();
  });

  it('clicking a row calls openLineage with the row id', () => {
    const data: PricingLineageBlock = {
      status: 'live',
      rows: [row({ id: 'pick-me', kind: 'wtp' })],
    };
    render(<LineagePane data={data} />);
    fireEvent.click(screen.getByTestId('lineage-pane-row-pick-me'));
    expect(openLineageMock).toHaveBeenCalledTimes(1);
    const [ref, opts] = openLineageMock.mock.calls[0];
    expect(ref).toMatchObject({ id: 'pick-me' });
    expect(opts).toMatchObject({ subjectTitle: expect.stringContaining('WTP') });
  });

  it('shows degraded banner and still renders rows when status=degraded', () => {
    const data: PricingLineageBlock = {
      status: 'degraded',
      rows: [row({ id: 'still-here' })],
    };
    render(<LineagePane data={data} />);
    expect(screen.getByTestId('lineage-pane-degraded')).toBeInTheDocument();
    expect(screen.getByTestId('lineage-pane-row-still-here')).toBeInTheDocument();
  });

  it('renders computed_at as a relative-time string', () => {
    const computed_at = new Date(Date.now() - 3 * 60 * 60 * 1000).toISOString();
    const data: PricingLineageBlock = {
      status: 'live',
      rows: [row({ id: 'time-row', computed_at })],
    };
    render(<LineagePane data={data} />);
    const relative = screen
      .getByTestId('lineage-pane-row-relative-time-row')
      .textContent ?? '';
    // The relative formatter produces strings like "3 hours ago"; we just
    // assert it doesn't render the raw ISO timestamp and contains "hour".
    expect(relative).not.toContain(computed_at);
    expect(relative.toLowerCase()).toMatch(/hour|hr/);
  });

  it('shows row_count only when non-null', () => {
    const data: PricingLineageBlock = {
      status: 'live',
      rows: [
        row({ id: 'with-count', row_count: 42 }),
        row({ id: 'without-count', row_count: null }),
      ],
    };
    render(<LineagePane data={data} />);
    expect(
      screen.getByTestId('lineage-pane-row-count-with-count'),
    ).toHaveTextContent('42 rows');
    expect(
      screen.queryByTestId('lineage-pane-row-count-without-count'),
    ).not.toBeInTheDocument();
  });
});

describe('formatRelative', () => {
  it('returns "hour"-ish for 3h-ago timestamps', () => {
    const now = new Date('2026-05-19T12:00:00Z');
    const iso = new Date(now.getTime() - 3 * 60 * 60 * 1000).toISOString();
    expect(formatRelative(iso, now).toLowerCase()).toMatch(/hour|hr/);
  });

  it('falls back to the raw string on invalid input', () => {
    expect(formatRelative('not-a-date')).toBe('not-a-date');
  });
});
