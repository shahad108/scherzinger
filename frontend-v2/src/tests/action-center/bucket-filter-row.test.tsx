import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { BucketFilterRow } from '@/features/action-center/components/BucketFilterRow';
import type { BucketFilter } from '@/types';

const queueRoute = (qid: string) => ({
  sourceScreen: 'action-center',
  route: '/pricing',
  query: { queue: qid, source: 'action-center' },
  toast: `Opening ${qid} queue.`,
});

const makeFilters = (): BucketFilter[] => [
  {
    id: 'all',
    label: 'All',
    count: 5,
    queueRoute: { sourceScreen: 'action-center', noop: true },
    tone: 'neutral',
  },
  {
    id: 'margin_erosion',
    label: 'Margin erosion',
    count: 3,
    queueRoute: queueRoute('margin_erosion'),
    tone: 'warning',
  },
  {
    id: 'cost_riser',
    label: 'Cost risers',
    count: 2,
    queueRoute: queueRoute('cost_riser'),
    tone: 'warning',
  },
  {
    id: 'churn',
    label: 'Churn risk',
    count: 0,
    queueRoute: queueRoute('churn'),
    tone: 'warning',
  },
];

describe('BucketFilterRow', () => {
  it('renders filters in payload order (All pinned first)', () => {
    render(
      <BucketFilterRow
        filters={makeFilters()}
        active="all"
        onChange={() => {}}
        onAction={() => {}}
      />,
    );
    const chips = screen.getAllByRole('button');
    const labels = chips.map((c) => c.getAttribute('data-testid'));
    expect(labels).toEqual([
      'bucket-filter-all',
      'bucket-filter-margin_erosion',
      'bucket-filter-cost_riser',
      'bucket-filter-churn',
    ]);
  });

  it('clicking an inactive chip calls onChange with its id', () => {
    const onChange = vi.fn();
    const onAction = vi.fn();
    render(
      <BucketFilterRow
        filters={makeFilters()}
        active="all"
        onChange={onChange}
        onAction={onAction}
      />,
    );
    fireEvent.click(screen.getByTestId('bucket-filter-margin_erosion'));
    expect(onChange).toHaveBeenCalledWith('margin_erosion');
    expect(onAction).not.toHaveBeenCalled();
  });

  it('Cmd-click on a chip calls onAction with the chip queueRoute', () => {
    const onChange = vi.fn();
    const onAction = vi.fn();
    const filters = makeFilters();
    render(
      <BucketFilterRow
        filters={filters}
        active="all"
        onChange={onChange}
        onAction={onAction}
      />,
    );
    fireEvent.click(screen.getByTestId('bucket-filter-margin_erosion'), {
      metaKey: true,
    });
    expect(onAction).toHaveBeenCalledWith(filters[1].queueRoute);
    expect(onChange).not.toHaveBeenCalled();
  });

  it('right-click calls onAction with the chip queueRoute', () => {
    const onChange = vi.fn();
    const onAction = vi.fn();
    const filters = makeFilters();
    render(
      <BucketFilterRow
        filters={filters}
        active="all"
        onChange={onChange}
        onAction={onAction}
      />,
    );
    fireEvent.contextMenu(screen.getByTestId('bucket-filter-cost_riser'));
    expect(onAction).toHaveBeenCalledWith(filters[2].queueRoute);
    expect(onChange).not.toHaveBeenCalled();
  });

  it('disabled chip (count 0 && id !== "all") is disabled and ignores clicks', () => {
    const onChange = vi.fn();
    const onAction = vi.fn();
    render(
      <BucketFilterRow
        filters={makeFilters()}
        active="all"
        onChange={onChange}
        onAction={onAction}
      />,
    );
    const chip = screen.getByTestId('bucket-filter-churn');
    expect(chip).toBeDisabled();
    expect(chip.className).toMatch(/opacity-50/);
    expect(chip.className).toMatch(/cursor-not-allowed/);
    fireEvent.click(chip);
    fireEvent.contextMenu(chip);
    expect(onChange).not.toHaveBeenCalled();
    expect(onAction).not.toHaveBeenCalled();
  });

  it('the "all" chip is never disabled even when total count is 0', () => {
    const filters: BucketFilter[] = [
      {
        id: 'all',
        label: 'All',
        count: 0,
        queueRoute: { sourceScreen: 'action-center', noop: true },
        tone: 'neutral',
      },
    ];
    const onChange = vi.fn();
    render(
      <BucketFilterRow
        filters={filters}
        active="all"
        onChange={onChange}
        onAction={() => {}}
      />,
    );
    const chip = screen.getByTestId('bucket-filter-all');
    expect(chip).not.toBeDisabled();
  });
});
